/**
 * NetworkController — Phase 2
 * Manages browser proxy routing, kill switch, and route verification.
 *
 * PHASE 2 CHANGES:
 * - Captures original proxy state before any modifications
 * - Restores original proxy state on session end (not just clearProxy)
 * - WebRTC policy is captured and restored (not just reset to 'default')
 * - Kill switch upgraded to SOCKS5 blackhole (avoids HTTP scheme ambiguity)
 * - Route verification integrated via BrowserAdapter
 * - Proxy conflict detection
 */
import {
  NetworkMode,
  ProtectionLevel,
  TorStatus,
  ProxySnapshot,
  RouteVerificationResult,
} from '../shared/types';
import { BrowserAdapter } from './browserAdapter';
import { EventBus } from './eventBus';
import { DEFAULT_TOR_SOCKS_PORT, DEFAULT_PROXY_HTTP_PORT } from '../shared/constants';

export class NetworkController {
  private static instance: NetworkController;
  private currentMode: NetworkMode = 'DIRECT';
  private torStatus: TorStatus = 'NOT_AVAILABLE';
  private dnsStatus: ProtectionLevel = 'UNKNOWN';
  private killSwitchArmed = true;
  private eventBus: EventBus;

  /** Snapshot of proxy config BEFORE ShadowBrowse took control */
  private proxySnapshot: ProxySnapshot | null = null;
  /** Snapshot of WebRTC policy BEFORE ShadowBrowse changed it */
  private webRTCSnapshot: string = 'default';

  /** Latest route verification result */
  private routeVerification: RouteVerificationResult | null = null;

  /** Whether a proxy conflict was detected during setup */
  private proxyConflictDetected = false;

  private constructor() {
    this.eventBus = EventBus.getInstance();
  }

  static getInstance(): NetworkController {
    if (!NetworkController.instance) {
      NetworkController.instance = new NetworkController();
    }
    return NetworkController.instance;
  }

  getCurrentMode(): NetworkMode {
    return this.currentMode;
  }

  getTorStatus(): TorStatus {
    return this.torStatus;
  }

  getDnsStatus(): ProtectionLevel {
    return this.dnsStatus;
  }

  getRouteVerification(): RouteVerificationResult | null {
    return this.routeVerification;
  }

  isProxyConflictDetected(): boolean {
    return this.proxyConflictDetected;
  }

  setTorStatus(status: TorStatus): void {
    const oldStatus = this.torStatus;
    this.torStatus = status;

    if (oldStatus !== status) {
      if (status === 'CONNECTED') {
        this.eventBus.emit(
          'NETWORK',
          'INFO',
          'Tor SOCKS5 handshake verified. Circuit status: CONNECTED.',
          'A Tor SOCKS5 daemon responded correctly. Note: Full Tor circuit health cannot be verified by a browser extension. DNS resolution via SOCKS5 requires Chromium to forward hostnames to the proxy, not resolve them locally.'
        );
      } else if (status === 'BOOTSTRAPPING') {
        this.eventBus.emit(
          'NETWORK',
          'WARNING',
          'Tor is bootstrapping (not yet ready).',
          'Tor is starting up. Do not browse until status shows CONNECTED.'
        );
      } else if (status === 'CONNECTION_FAILED' || status === 'FAILED') {
        this.eventBus.emit(
          'NETWORK',
          'CRITICAL',
          'Tor daemon disconnected or handshake failed.',
          'Tor network connection lost. Privacy routing is compromised. Kill switch will activate if enabled.'
        );
      } else if (status === 'NOT_AVAILABLE' || status === 'NOT_RUNNING') {
        this.eventBus.emit(
          'NETWORK',
          'WARNING',
          'Tor daemon not found on standard ports (9050, 9150).',
          'Tor is not running. Install and start Tor or Tor Browser to enable anonymous routing.'
        );
      }
    }
  }

  /**
   * Configures browser proxy routing.
   * MUST be called after capturePreSessionState() to ensure correct restoration on end.
   */
  async configureRouting(
    mode: NetworkMode,
    torSocksPort = DEFAULT_TOR_SOCKS_PORT
  ): Promise<boolean> {
    this.proxyConflictDetected = false;

    if (mode === 'DIRECT') {
      this.currentMode = 'DIRECT';
      await BrowserAdapter.clearProxy();
      this.dnsStatus = 'NOT_APPLICABLE';
      return true;
    }

    // Detect proxy conflicts before overriding
    const currentConfig = await BrowserAdapter.verifyActiveProxyConfig();
    if (currentConfig.configured && !currentConfig.controlledByUs) {
      this.proxyConflictDetected = true;
      this.eventBus.emit(
        'NETWORK',
        'WARNING',
        'Proxy conflict: Another extension or system policy controls the proxy.',
        'ShadowBrowse will attempt to override, but the conflicting proxy may still intercept traffic. For maximum anonymity, disable other proxy extensions before starting a session.'
      );
    }

    if (mode === 'TOR') {
      this.currentMode = 'TOR';
      /**
       * SOCKS5 proxy for Tor.
       * Chromium routes all TCP traffic through SOCKS5. When `socks5` scheme is used,
       * Chromium's network stack forwards the hostname (not the IP) to the proxy,
       * which means DNS resolution happens at the proxy, avoiding local DNS leaks.
       * Reference: Chromium proxy docs, PAC specification.
       * CAVEAT: Cannot be independently verified from within the extension.
       */
      const proxyConfig: chrome.proxy.ProxyConfig = {
        mode: 'fixed_servers',
        rules: {
          singleProxy: {
            scheme: 'socks5',
            host: '127.0.0.1',
            port: torSocksPort,
          },
          // Explicitly bypass loopback — we still need to reach the local agent
          bypassList: ['<-loopback>', '127.0.0.1', 'localhost'],
        },
      };

      const success = await BrowserAdapter.setProxy(proxyConfig);
      if (success) {
        this.dnsStatus = 'PARTIALLY_PROTECTED';
        this.eventBus.emit(
          'DNS',
          'INFO',
          'DNS queries configured to resolve via SOCKS5 proxy (remote resolution).',
          'DNS is expected to route through the proxy with Chromium\'s SOCKS5 implementation. Independent DNS leak testing (e.g., dnsleaktest.com) is recommended to confirm.'
        );
      } else {
        this.dnsStatus = 'WARNING';
        this.eventBus.emit(
          'DNS',
          'WARNING',
          'Failed to configure SOCKS5 proxy in browser settings.',
          'Browser proxy configuration failed. DNS will resolve locally and may leak to your ISP.'
        );
      }
      return success;
    }

    if (mode === 'LOCAL_PROXY') {
      this.currentMode = 'LOCAL_PROXY';
      const proxyConfig: chrome.proxy.ProxyConfig = {
        mode: 'fixed_servers',
        rules: {
          singleProxy: {
            scheme: 'http',
            host: '127.0.0.1',
            port: DEFAULT_PROXY_HTTP_PORT,
          },
          bypassList: ['<-loopback>', '127.0.0.1', 'localhost'],
        },
      };
      const success = await BrowserAdapter.setProxy(proxyConfig);
      this.dnsStatus = success ? 'UNVERIFIED' : 'WARNING';
      return success;
    }

    return true;
  }

  /**
   * Captures browser state BEFORE ShadowBrowse modifies it.
   * MUST be called at the very start of a session, before configureRouting().
   * This enables correct restoration when the session ends.
   */
  async capturePreSessionState(): Promise<void> {
    this.proxySnapshot = await BrowserAdapter.captureProxySnapshot();
    this.webRTCSnapshot = await BrowserAdapter.captureWebRTCPolicy();

    this.eventBus.emit(
      'SESSION',
      'INFO',
      'Pre-session state captured. Proxy and WebRTC policies will be restored on exit.',
      `Original proxy config type: ${this.proxySnapshot?.config?.mode ?? 'system'}. WebRTC policy: ${this.webRTCSnapshot}.`
    );
  }

  /**
   * Runs route verification after proxy configuration (Phase 3).
   * Incorporates agent route data and browser-side probe.
   * Updates DNS status based on verification outcome.
   */
  async verifyRoute(
    torSocksPort: number,
    agentRouteData?: any
  ): Promise<RouteVerificationResult> {
    this.routeVerification = await BrowserAdapter.runRouteVerification(
      this.currentMode,
      torSocksPort,
      agentRouteData
    );

    const r = this.routeVerification;
    const confidenceMap = { HIGH: 'INFO', MEDIUM: 'INFO', LOW: 'WARNING', UNVERIFIABLE: 'WARNING' } as const;
    const severity = confidenceMap[r.confidence] ?? 'WARNING';

    this.eventBus.emit(
      'NETWORK',
      severity,
      `Route verification: Agent [${r.agentRouteStatus}] | Browser [${r.browserRouteStatus}] | Confidence: ${r.confidence}.`,
      r.limitations.join(' | ') || 'No verification limitations logged.'
    );

    // Update DNS status honestly based on verification
    if (r.fallbackDetected) {
      this.dnsStatus = 'LEAK_DETECTED';
    } else if (r.routeVerified && this.currentMode === 'TOR') {
      this.dnsStatus = 'PARTIALLY_PROTECTED';
    } else if (!r.routeVerified) {
      this.dnsStatus = 'UNVERIFIED';
    }

    return this.routeVerification;
  }

  /**
   * Restores protected routing after kill switch activation when Tor/SOCKS5 is restored.
   */
  async restoreProtectedRouting(torSocksPort = DEFAULT_TOR_SOCKS_PORT): Promise<boolean> {
    const success = await this.configureRouting('TOR', torSocksPort);
    if (success) {
      this.eventBus.emit(
        'KILL_SWITCH',
        'INFO',
        'Tor provider connection restored. Protected proxy routing re-established.',
        'Kill switch disengaged: traffic once again routed through Tor SOCKS5 proxy.'
      );
    }
    return success;
  }

  /**
   * Fail-closed kill switch.
   * Uses a SOCKS5 blackhole to block traffic — avoids ambiguity of HTTP proxy scheme.
   * Port 9 is the IANA "discard" service — connections are accepted and immediately dropped.
   * KNOWN LIMITATION: Some Chromium builds may fall back to direct on unreachable proxy.
   * We mitigate this by using socks5 scheme — Chromium will hard-fail on unreachable socks5.
   */
  async enforceKillSwitch(): Promise<void> {
    if (!this.killSwitchArmed) return;

    this.eventBus.emit(
      'KILL_SWITCH',
      'CRITICAL',
      'KILL SWITCH TRIGGERED: Privacy layer disconnected unexpectedly.',
      'Routing ALL browser traffic to localhost discard port. No traffic can leave the browser until you end the session. This may appear as a network outage.'
    );

    /**
     * SOCKS5 blackhole — port 9 (discard service).
     * Using SOCKS5 scheme because Chromium handles an unreachable SOCKS5 proxy
     * as a hard failure (no fallback to direct), unlike HTTP proxy which may bypass.
     * Security note: If port 9 is not listening, Chromium will refuse connections — this is the desired behavior.
     */
    const blackholeConfig: chrome.proxy.ProxyConfig = {
      mode: 'fixed_servers',
      rules: {
        singleProxy: {
          scheme: 'socks5', // Upgraded from 'http' — prevents direct fallback
          host: '127.0.0.1',
          port: 9, // Discard port (IANA)
        },
      },
    };
    await BrowserAdapter.setProxy(blackholeConfig);
  }

  /**
   * Restores pre-session proxy and WebRTC state.
   * Uses the captured snapshot — does NOT assume 'direct' was the original state.
   */
  async restorePreSessionState(): Promise<void> {
    this.currentMode = 'DIRECT';
    this.dnsStatus = 'UNKNOWN';
    this.routeVerification = null;

    // Restore original proxy configuration
    if (this.proxySnapshot) {
      await BrowserAdapter.restoreProxySnapshot(this.proxySnapshot);
      this.proxySnapshot = null;
    } else {
      // No snapshot — fall back to clearing the proxy
      await BrowserAdapter.clearProxy();
    }

    // Restore original WebRTC policy
    if (this.webRTCSnapshot && this.webRTCSnapshot !== 'default') {
      await BrowserAdapter.setWebRTCPolicy(
        this.webRTCSnapshot as 'default' | 'default_public_interface_only' | 'disable_non_proxied_udp'
      );
    } else {
      await BrowserAdapter.setWebRTCPolicy('default');
    }
    this.webRTCSnapshot = 'default';

    this.eventBus.emit(
      'NETWORK',
      'INFO',
      'Pre-session network state restored.',
      'Proxy and WebRTC policy have been reverted to their pre-session configuration.'
    );
  }

  /**
   * @deprecated Phase 2: Use restorePreSessionState() instead.
   * Kept for backward compatibility with any direct callers.
   */
  async restoreDirect(): Promise<void> {
    return this.restorePreSessionState();
  }
}
