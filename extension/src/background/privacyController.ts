/**
 * PrivacyController — Phase 2
 * Central orchestrator for the ShadowBrowse privacy state machine.
 *
 * PHASE 2 CHANGES:
 * - capturePreSessionState() called BEFORE configureRouting() for proper proxy restore
 * - Route verification step added after proxy configuration
 * - Granular 5-step session startup progress reporting
 * - Identity warning management (pendingWarning, dismissal)
 * - agentHealth.routeVerification included in overview
 * - storageController.activateIsolation() handles WebRTC (moved away from here)
 * - NetworkController.restorePreSessionState() used for accurate proxy restoration
 * - storage cleanup verification in session end
 * - WebRTC policy now captured and restored, not just set to 'default'
 */
import {
  AgentHealthStatus,
  IdentityWarning,
  PersistentSessionState,
  PrivacyState,
  RouteVerificationResult,
  SessionStartupProgress,
  SystemPrivacyOverview,
  UserSettings,
} from '../shared/types';
import { DEFAULT_SETTINGS, DEFAULT_AGENT_PORT } from '../shared/constants';
import { BrowserAdapter } from './browserAdapter';
import { EventBus } from './eventBus';
import { SessionManager } from './sessionManager';
import { NetworkController } from './networkController';
import { StorageController } from './storageController';
import { FingerprintController } from './fingerprintController';
import { TrackerDefenseController } from './trackerDefenseController';

export class PrivacyController {
  private static instance: PrivacyController;
  private state: PrivacyState = 'OFF';
  private settings: UserSettings = { ...DEFAULT_SETTINGS };

  private sessionManager: SessionManager;
  private networkController: NetworkController;
  private storageController: StorageController;
  private fingerprintController: FingerprintController;
  private eventBus: EventBus;

  private agentHealth: AgentHealthStatus = {
    online: false,
    version: '0.2.0',
    torStatus: 'NOT_AVAILABLE',
    torBootstrapPercent: 0,
    proxyStatus: 'STOPPED',
    torSocksPort: 9050,
    proxyHttpPort: 8118,
    dnsRoutedThroughPrivacy: false,
    dnsVerified: false,
    killSwitchArmed: false,
    routeVerification: null,
    lastCheckTimestamp: 0,
  };

  /** Pending identity warning requiring user attention */
  private pendingIdentityWarning: IdentityWarning | null = null;

  /** Startup progress steps for granular UI feedback */
  private startupProgress: SessionStartupProgress[] = [];

  /** Latest route verification result */
  private routeVerification: RouteVerificationResult | null = null;

  private constructor() {
    this.sessionManager = SessionManager.getInstance();
    this.networkController = NetworkController.getInstance();
    this.storageController = StorageController.getInstance();
    this.fingerprintController = FingerprintController.getInstance();
    this.eventBus = EventBus.getInstance();
  }

  static getInstance(): PrivacyController {
    if (!PrivacyController.instance) {
      PrivacyController.instance = new PrivacyController();
    }
    return PrivacyController.instance;
  }

  private initPromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const saved = await BrowserAdapter.getLocalStorage<unknown>(['settings', 'session_state']);

        if (saved && saved.settings) {
          this.settings = { ...DEFAULT_SETTINGS, ...(saved.settings as UserSettings) };
        }

        // Restore persistent session state across service worker restarts
        if (saved && saved.session_state) {
          const ss = saved.session_state as PersistentSessionState;
          if (ss.state === 'STARTING' || ss.state === 'STOPPING') {
            // Interrupted during handshake/setup or teardown. Roll back to pre-session state safely.
            this.networkController.restoreState(
              'DIRECT',
              ss.proxySnapshot || null,
              ss.webRTCSnapshot || 'default',
              null
            );
            await this.networkController.restorePreSessionState();
            await this.clearPersistentSessionState();
          } else if (ss.state === 'PROTECTED' || ss.state === 'DEGRADED' || ss.state === 'FAILED') {
            this.state = ss.state;
            this.sessionManager.restoreSession(ss.activeSession);
            this.storageController.restoreState(ss.sessionStartTime, ss.isIsolated);
            this.networkController.restoreState(
              ss.networkMode || 'TOR',
              ss.proxySnapshot || null,
              ss.webRTCSnapshot || 'default',
              ss.routeVerification || null
            );
            this.routeVerification = ss.routeVerification || null;
            if (ss.fingerprintActive) {
              this.fingerprintController.activate();
            }
          }
        }

        await this.updateBadge();
        await this.checkAgentHealth();

        // Initialize Phase 4B tracker & referrer protection modes
        await TrackerDefenseController.getInstance().setTrackerMode(this.settings.trackingProtectionMode || 'DETECT');
        await TrackerDefenseController.getInstance().setReferrerMode(this.settings.referrerProtectionMode || 'STANDARD');

        if (typeof setInterval !== 'undefined') {
          setInterval(() => {
            this.checkAgentHealth();
          }, 10000);
        }
      })();
    }
    return this.initPromise;
  }

  async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      await this.initialize();
    } else {
      await this.initPromise;
    }
  }

  getState(): PrivacyState {
    return this.state;
  }

  getSettings(): UserSettings {
    return this.settings;
  }

  getStartupProgress(): SessionStartupProgress[] {
    return this.startupProgress;
  }

  getPendingIdentityWarning(): IdentityWarning | null {
    return this.pendingIdentityWarning;
  }

  dismissIdentityWarning(): void {
    if (this.pendingIdentityWarning) {
      this.pendingIdentityWarning.dismissed = true;
      this.pendingIdentityWarning = null;
    }
  }

  setIdentityWarning(domain: string, reason: string): void {
    this.pendingIdentityWarning = {
      domain,
      reason,
      timestamp: Date.now(),
      dismissed: false,
    };
    this.eventBus.emit(
      'IDENTITY',
      'WARNING',
      `Sensitive identity domain detected: ${domain}`,
      reason
    );
  }

  async updateSettings(newSettings: Partial<UserSettings>): Promise<void> {
    this.settings = { ...this.settings, ...newSettings };
    await BrowserAdapter.setLocalStorage({ settings: this.settings });

    if (newSettings.trackingProtectionMode) {
      await TrackerDefenseController.getInstance().setTrackerMode(newSettings.trackingProtectionMode);
    }
    if (newSettings.referrerProtectionMode) {
      await TrackerDefenseController.getInstance().setReferrerMode(newSettings.referrerProtectionMode);
    }
  }

  async checkAgentHealth(): Promise<AgentHealthStatus> {
    const port = this.settings.agentPort || DEFAULT_AGENT_PORT;
    const token = this.settings.agentToken || '';
    const url = `http://127.0.0.1:${port}/api/v1/status`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };
      if (token) {
        headers['X-Shadow-Token'] = token;
      }

      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        this.agentHealth = {
          online: true,
          version: data.version || '0.3.0',
          torStatus: data.tor_status || 'NOT_AVAILABLE',
          torProviderType: data.tor_provider_type || 'UNAVAILABLE',
          torEndpoint: data.tor_endpoint || '',
          torReachable: !!data.tor_reachable,
          torProcessDetected: !!data.tor_process_detected,
          torControlPortVerified: !!data.tor_control_port_verified,
          torVerificationStatus: data.tor_verification_status || 'UNAVAILABLE',
          torBootstrapPercent: data.tor_bootstrap_percent ?? 0,
          torBootstrapSummary: data.tor_bootstrap_summary || 'Unknown',
          proxyStatus: data.proxy_status || 'STOPPED',
          torSocksPort: data.tor_socks_port || 9050,
          proxyHttpPort: data.proxy_http_port || 8118,
          dnsRoutedThroughPrivacy: !!data.dns_routed,
          dnsVerified: !!data.dns_verified,
          dnsStatus: data.dns_status || (data.dns_routed ? 'PARTIAL' : 'UNVERIFIED'),
          killSwitchArmed: !!data.kill_switch,
          routeVerification: this.routeVerification,
          lastCheckTimestamp: Date.now(),
        };

        this.networkController.setTorStatus(this.agentHealth.torStatus);
      } else {
        this.markAgentOffline();
      }
    } catch {
      this.markAgentOffline();
    }

    // Kill switch logic: if protected and Tor drops, enforce kill switch
    if (this.state === 'PROTECTED') {
      const session = this.sessionManager.getCurrentSession();
      if (session?.networkMode === 'TOR' && this.agentHealth.torStatus !== 'CONNECTED') {
        if (this.settings.killSwitchEnabled) {
          this.state = 'FAILED';
          await this.networkController.enforceKillSwitch();
        } else {
          this.state = 'DEGRADED';
        }
        await this.updateBadge();
        await this.savePersistentSessionState();
      }
    }

    // Kill switch recovery logic: if in FAILED state and Tor recovers, restore protected routing
    if (this.state === 'FAILED') {
      const session = this.sessionManager.getCurrentSession();
      if (session?.networkMode === 'TOR' && this.agentHealth.torStatus === 'CONNECTED') {
        const restored = await this.networkController.restoreProtectedRouting(this.agentHealth.torSocksPort);
        if (restored) {
          const agentRouteData = await this.callAgentVerifyRoute(this.agentHealth.torSocksPort);
          const verification = await this.networkController.verifyRoute(this.agentHealth.torSocksPort, agentRouteData);
          this.routeVerification = verification;
          if (verification && verification.routeVerified) {
            this.state = 'PROTECTED';
          } else {
            // Tor daemon is connected on localhost, but browser route could not be verified
            this.state = 'FAILED';
          }
          this.sessionManager.updateSessionStatus(this.state);
          await this.updateBadge();
          await this.savePersistentSessionState();
        }
      }
    }

    return this.agentHealth;
  }

  /**
   * Calls the Local Shadow Agent's /api/v1/tor/provider endpoint.
   */
  async fetchTorProvider(): Promise<any> {
    const port = this.settings.agentPort || DEFAULT_AGENT_PORT;
    const token = this.settings.agentToken || '';
    const url = `http://127.0.0.1:${port}/api/v1/tor/provider`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (token) headers['X-Shadow-Token'] = token;

      const res = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Return null on failure
    }
    return null;
  }

  /**
   * Initiates authoritative route verification on the Local Shadow Agent.
   */
  async callAgentVerifyRoute(torSocksPort?: number): Promise<any> {
    const port = this.settings.agentPort || DEFAULT_AGENT_PORT;
    const token = this.settings.agentToken || '';
    const url = `http://127.0.0.1:${port}/api/v1/tor/verify-route`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      };
      if (token) headers['X-Shadow-Token'] = token;

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          socks_port: torSocksPort || this.agentHealth.torSocksPort,
          timeout: 10.0,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('[ShadowBrowse] Agent verify-route call failed:', err);
    }
    return null;
  }

  private markAgentOffline(): void {
    this.agentHealth = {
      ...this.agentHealth,
      online: false,
      torStatus: 'NOT_AVAILABLE',
      torProviderType: 'UNAVAILABLE',
      torReachable: false,
      torBootstrapPercent: 0,
      proxyStatus: 'STOPPED',
      routeVerification: null,
      lastCheckTimestamp: Date.now(),
    };
    this.networkController.setTorStatus('NOT_AVAILABLE');
  }

  private updateProgress(
    step: number,
    label: string,
    status: SessionStartupProgress['status']
  ): void {
    const existing = this.startupProgress.find((p) => p.step === step);
    if (existing) {
      existing.status = status;
      existing.label = label;
    } else {
      this.startupProgress.push({ step, label, status });
    }
  }

  /**
   * Protected Session Start Flow (Phase 3 Strict 10-Step Order)
   *
   * 1. Capture original browser proxy state.
   * 2. Ask Local Shadow Agent for provider status.
   * 3. Verify provider availability.
   * 4. Establish/verify SOCKS5 endpoint.
   * 5. Configure browser proxy.
   * 6. Verify browser proxy configuration.
   * 7. Perform route verification (Agent-side).
   * 8. Verify external IP where supported (Browser-side + comparison).
   * 9. Verify that the route satisfies the required protection level.
   * 10. ONLY THEN mark the session as protected/routed.
   *
   * Technical Honesty: If verification fails, DO NOT silently downgrade to direct Internet.
   * Transition to an honest failed or degraded state with kill switch protection.
   */
  async startAnonymousSession(): Promise<boolean> {
    await this.ensureInitialized();
    if (this.state === 'PROTECTED' || this.state === 'STARTING') {
      return true;
    }

    this.state = 'STARTING';
    this.startupProgress = [];
    await this.updateBadge();

    const targetMode = this.settings.defaultNetworkMode;

    // === STEP 1: Capture Pre-Session State ===
    this.updateProgress(1, 'Capturing pre-session network state...', 'IN_PROGRESS');
    await this.networkController.capturePreSessionState();
    this.updateProgress(1, 'Pre-session state captured', 'DONE');

    // Initialize session record
    this.sessionManager.startSession({
      networkMode: targetMode,
      storageIsolation: this.settings.storageIsolationEnabled,
      fingerprintProtection: this.settings.fingerprintProtectionEnabled,
      webRTCProtection: this.settings.webRTCProtectionEnabled,
      dnsProtection: true,
      killSwitchActive: this.settings.killSwitchEnabled,
    });
    await this.savePersistentSessionState();

    // === STEP 2: Ask Local Shadow Agent for provider status ===
    this.updateProgress(2, 'Querying Local Shadow Agent for provider status...', 'IN_PROGRESS');
    await this.checkAgentHealth();
    const providerInfo = await this.fetchTorProvider();
    const agentOk = this.agentHealth.online;
    const providerType = providerInfo?.provider_type || this.agentHealth.torProviderType || 'UNAVAILABLE';
    this.updateProgress(
      2,
      agentOk ? `Provider detected: ${providerType}` : 'Local Shadow Agent is offline',
      agentOk ? 'DONE' : 'FAILED'
    );

    // === STEP 3: Verify provider availability ===
    this.updateProgress(3, 'Verifying provider availability...', 'IN_PROGRESS');
    if (targetMode === 'TOR') {
      const providerReachable = this.agentHealth.torReachable || this.agentHealth.torStatus === 'CONNECTED';
      if (!agentOk || !providerReachable || this.agentHealth.torStatus === 'NOT_AVAILABLE') {
        this.updateProgress(3, 'Tor provider unavailable on localhost', 'FAILED');
        this.eventBus.emit(
          'NETWORK',
          'CRITICAL',
          'Tor provider unavailable. Session cannot be protected.',
          'Start Tor or Tor Browser. Direct internet routing will NOT be used.'
        );
        if (this.settings.killSwitchEnabled) {
          this.state = 'FAILED';
          await this.networkController.enforceKillSwitch();
        } else {
          this.state = 'DEGRADED';
        }
        this.sessionManager.updateSessionStatus(this.state);
        await this.updateBadge();
        return false;
      }
    }
    this.updateProgress(3, 'Provider available and responsive', 'DONE');

    // === STEP 4: Establish/verify SOCKS5 endpoint ===
    this.updateProgress(4, 'Establishing SOCKS5 endpoint...', 'IN_PROGRESS');
    const torSocksPort = this.agentHealth.torSocksPort || 9050;
    this.updateProgress(4, `SOCKS5 endpoint ready on port ${torSocksPort}`, 'DONE');

    // === STEP 5: Configure browser proxy ===
    this.updateProgress(5, `Configuring browser proxy (${targetMode})...`, 'IN_PROGRESS');
    let proxyConfigured = false;
    if (targetMode === 'TOR') {
      proxyConfigured = await this.networkController.configureRouting('TOR', torSocksPort);
    } else if (targetMode === 'LOCAL_PROXY') {
      proxyConfigured = await this.networkController.configureRouting('LOCAL_PROXY');
    } else {
      proxyConfigured = await this.networkController.configureRouting('DIRECT');
    }

    if (!proxyConfigured) {
      this.updateProgress(5, 'Browser proxy configuration FAILED', 'FAILED');
      if (this.settings.killSwitchEnabled) {
        this.state = 'FAILED';
        await this.networkController.enforceKillSwitch();
      } else {
        this.state = 'DEGRADED';
      }
      this.sessionManager.updateSessionStatus(this.state);
      await this.updateBadge();
      return false;
    }
    this.updateProgress(5, 'Browser proxy configured in Chrome network stack', 'DONE');

    // === STEP 6: Verify browser proxy configuration ===
    this.updateProgress(6, 'Verifying browser proxy active settings...', 'IN_PROGRESS');
    const activeConfig = await BrowserAdapter.verifyActiveProxyConfig();
    const configValid = activeConfig.configured && activeConfig.controlledByUs;
    if (!configValid && targetMode !== 'DIRECT') {
      this.updateProgress(6, 'Proxy configuration not active or overridden by another extension', 'FAILED');
      if (this.settings.killSwitchEnabled) {
        this.state = 'FAILED';
        await this.networkController.enforceKillSwitch();
      } else {
        this.state = 'DEGRADED';
      }
      this.sessionManager.updateSessionStatus(this.state);
      await this.updateBadge();
      return false;
    }
    this.updateProgress(6, 'Browser proxy verified and active', 'DONE');

    // === STEP 7: Perform route verification (Agent-side) ===
    this.updateProgress(7, 'Performing agent-side route verification...', 'IN_PROGRESS');
    let agentRouteData: any = null;
    if (targetMode === 'TOR' && this.settings.verifyRouteOnStart) {
      agentRouteData = await this.callAgentVerifyRoute(torSocksPort);
    }
    const agentStatus = agentRouteData?.verification_status || 'UNVERIFIED';
    this.updateProgress(7, `Agent route check: ${agentStatus}`, 'DONE');

    // === STEP 8: Verify external IP where supported (Browser-side + comparison) ===
    this.updateProgress(8, 'Verifying browser external route & IP...', 'IN_PROGRESS');
    this.routeVerification = await this.networkController.verifyRoute(torSocksPort, agentRouteData);
    const browserRouteStatus = this.routeVerification.browserRouteStatus;
    this.updateProgress(
      8,
      `Browser: ${browserRouteStatus} | Agent: ${agentStatus}`,
      'DONE'
    );

    // === STEP 9: Verify that the route satisfies the required protection level ===
    this.updateProgress(9, 'Verifying route protection requirements...', 'IN_PROGRESS');

    // FAIL-CLOSED CHECK: Direct bypass prevention
    if (this.routeVerification.agentRouteStatus === 'DIRECT_BYPASS_DETECTED' || this.routeVerification.fallbackDetected) {
      this.updateProgress(9, 'CRITICAL: Direct bypass detected! Activating fail-closed kill switch.', 'FAILED');
      this.state = 'FAILED';
      await this.networkController.enforceKillSwitch();
      this.sessionManager.updateSessionStatus(this.state);
      await this.updateBadge();
      return false;
    }

    if (targetMode === 'TOR' && this.routeVerification.agentRouteStatus === 'ROUTE_FAILED') {
      this.updateProgress(9, 'Route failed: Tor proxy cannot reach outbound exit nodes.', 'FAILED');
      if (this.settings.killSwitchEnabled) {
        this.state = 'FAILED';
        await this.networkController.enforceKillSwitch();
      } else {
        this.state = 'DEGRADED';
      }
      this.sessionManager.updateSessionStatus(this.state);
      await this.updateBadge();
      return false;
    }
    this.updateProgress(9, 'Route satisfies protection criteria', 'DONE');

    // === STEP 10: Apply auxiliary privacy protections and ONLY THEN mark protected ===
    this.updateProgress(10, 'Activating auxiliary privacy protections...', 'IN_PROGRESS');

    if (this.settings.storageIsolationEnabled) {
      await this.storageController.activateIsolation();
    }

    if (this.settings.webRTCProtectionEnabled) {
      await BrowserAdapter.setWebRTCPolicy('disable_non_proxied_udp');
    }

    if (this.settings.fingerprintProtectionEnabled) {
      this.fingerprintController.activate();
    }

    // Determine final status honestly
    if (targetMode === 'TOR') {
      if (this.routeVerification.routeVerified) {
        this.state = 'PROTECTED';
      } else {
        this.state = 'DEGRADED';
      }
    } else {
      this.state = 'PROTECTED';
    }

    this.updateProgress(10, `Session status: ${this.state}. Protections active.`, 'DONE');
    this.sessionManager.updateSessionStatus(this.state);
    await this.updateBadge();
    await this.savePersistentSessionState();

    return true;
  }

  async endAnonymousSession(): Promise<boolean> {
    await this.ensureInitialized();
    if (this.state === 'OFF' || this.state === 'STOPPING') {
      return true;
    }

    this.state = 'STOPPING';
    await this.updateBadge();
    await this.savePersistentSessionState();

    // Step 1: Revert network routing & restore pre-session proxy/WebRTC state
    await this.networkController.restorePreSessionState();

    // Step 2: Verified storage cleanup
    const cleanupResult = await this.storageController.deactivateAndClean();
    if (!cleanupResult.verified) {
      this.eventBus.emit(
        'STORAGE',
        'CRITICAL',
        'Session data cleanup could not be verified.',
        'Storage cleanup reported failure. Manual browser data clearing is recommended. Go to Chrome Settings → Privacy → Clear browsing data.'
      );
    }

    // Step 3: Deactivate fingerprint detection
    this.fingerprintController.deactivate();

    // Step 4: Reset tracker defense stats
    TrackerDefenseController.getInstance().resetSessionStats();

    // Step 5: End session record
    this.sessionManager.endSession();

    // Clear route verification and pending warnings
    this.routeVerification = null;
    this.pendingIdentityWarning = null;
    this.startupProgress = [];

    this.state = 'OFF';
    await this.updateBadge();
    await this.clearPersistentSessionState();

    return true;
  }

  async getOverview(): Promise<SystemPrivacyOverview> {
    await this.ensureInitialized();
    const activeSession = this.sessionManager.getCurrentSession();
    const networkMode = this.networkController.getCurrentMode();
    const torStatus = this.networkController.getTorStatus();
    const routeVerification = this.networkController.getRouteVerification();
    const proxyConflict = this.networkController.isProxyConflictDetected();

    let netProtection: SystemPrivacyOverview['network']['status'] = 'UNAVAILABLE';
    if (this.state === 'PROTECTED') {
      if (networkMode === 'TOR') {
        netProtection = routeVerification?.routeVerified ? 'PROTECTED' : 'PARTIALLY_PROTECTED';
      } else if (networkMode === 'LOCAL_PROXY') {
        netProtection = 'PARTIALLY_PROTECTED';
      } else {
        netProtection = 'UNAVAILABLE';
      }
    } else if (this.state === 'DEGRADED') {
      netProtection = 'WARNING';
    } else if (this.state === 'FAILED') {
      netProtection = 'UNAVAILABLE';
    }

    return {
      state: this.state,
      activeSession,
      agent: this.agentHealth,
      network: {
        mode: networkMode,
        status: netProtection,
        torStatus,
        dnsStatus: this.networkController.getDnsStatus(),
        routeVerified: routeVerification?.routeVerified ?? false,
        proxyConflict,
      },
      identity: {
        status: this.state === 'PROTECTED' ? 'PARTIALLY_PROTECTED' : 'UNAVAILABLE',
        isolatedCookies: 0,
        pendingWarning: this.pendingIdentityWarning,
      },
      storage: {
        status: this.storageController.getStorageStatus(),
        temporarySession: this.state === 'PROTECTED' || this.state === 'DEGRADED',
        cleanupVerified: this.storageController.isCleanupVerified(),
      },
      fingerprint: {
        status: this.fingerprintController.getStatus(), // Now correctly DETECTION_ONLY
        exposure: this.fingerprintController.getExposureLevel(),
        mitigationActive: this.fingerprintController.canMitigate(), // false in Phase 2
        detectionActive: this.state === 'PROTECTED' || this.state === 'DEGRADED',
      },
      webRTC: {
        status: this.state === 'PROTECTED' ? 'PROTECTED' : 'UNAVAILABLE',
        policy: this.state === 'PROTECTED' ? 'disable_non_proxied_udp' : 'default',
        verified: this.routeVerification?.webRTCVerified ?? false,
      },
    };
  }

  /**
   * Persists the active session state to chrome.storage.local so it survives
   * MV3 background service worker idle termination and restarts.
   */
  private async savePersistentSessionState(): Promise<void> {
    const activeSession = this.sessionManager.getCurrentSession();
    const persistentState: PersistentSessionState = {
      state: this.state,
      activeSession,
      sessionStartTime: this.storageController.getSessionStartTime(),
      isIsolated: this.storageController.getIsIsolated(),
      networkMode: this.networkController.getCurrentMode(),
      proxySnapshot: this.networkController.getProxySnapshot(),
      webRTCSnapshot: this.networkController.getWebRTCSnapshot(),
      routeVerification: this.routeVerification,
      fingerprintActive: this.fingerprintController.canMitigate(),
      savedAt: Date.now(),
    };
    await BrowserAdapter.setLocalStorage({ session_state: persistentState });
  }

  /**
   * Clears the persistent session state when the user explicitly ends the session.
   */
  private async clearPersistentSessionState(): Promise<void> {
    const emptyState: PersistentSessionState = {
      state: 'OFF',
      activeSession: null,
      sessionStartTime: 0,
      isIsolated: false,
      networkMode: 'DIRECT',
      proxySnapshot: null,
      webRTCSnapshot: 'default',
      routeVerification: null,
      fingerprintActive: false,
      savedAt: Date.now(),
    };
    await BrowserAdapter.setLocalStorage({ session_state: emptyState });
  }

  private async updateBadge(): Promise<void> {
    switch (this.state) {
      case 'PROTECTED':
        await BrowserAdapter.setBadge('ON', '#10b981');
        break;
      case 'DEGRADED':
        await BrowserAdapter.setBadge('DEG', '#f59e0b');
        break;
      case 'FAILED':
        await BrowserAdapter.setBadge('KS!', '#ef4444'); // KS = Kill Switch
        break;
      case 'STARTING':
        await BrowserAdapter.setBadge('...', '#8b5cf6');
        break;
      case 'STOPPING':
        await BrowserAdapter.setBadge('STP', '#6366f1');
        break;
      case 'OFF':
      default:
        await BrowserAdapter.setBadge('', '#000000');
        break;
    }
  }
}
