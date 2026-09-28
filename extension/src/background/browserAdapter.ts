/**
 * BrowserAdapter — Phase 2
 * Abstracts Chrome MV3 APIs for testability and portability.
 * Phase 2: Added proxy snapshot/restore, route verification, WebRTC policy snapshots.
 */
import { ProxySnapshot, RouteVerificationResult } from '../shared/types';

export class BrowserAdapter {
  static isChromeAvailable(): boolean {
    return typeof chrome !== 'undefined' && !!chrome.runtime;
  }

  static async getLocalStorage<T>(keys: string | string[]): Promise<Record<string, T>> {
    if (!this.isChromeAvailable() || !chrome.storage?.local) {
      return {};
    }
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (result) => resolve(result as Record<string, T>));
    });
  }

  static async setLocalStorage(items: Record<string, unknown>): Promise<void> {
    if (!this.isChromeAvailable() || !chrome.storage?.local) return;
    return new Promise((resolve) => {
      chrome.storage.local.set(items, () => resolve());
    });
  }

  static async clearLocalStorage(): Promise<void> {
    if (!this.isChromeAvailable() || !chrome.storage?.local) return;
    return new Promise((resolve) => {
      chrome.storage.local.clear(() => resolve());
    });
  }

  /**
   * Captures the current proxy configuration BEFORE ShadowBrowse modifies it.
   * This enables precise state restoration when the session ends.
   */
  static async captureProxySnapshot(): Promise<ProxySnapshot> {
    const snapshot: ProxySnapshot = {
      capturedAt: Date.now(),
      config: null,
      controlledByExtension: false,
      controlledByPolicy: false,
    };

    if (!this.isChromeAvailable() || !chrome.proxy?.settings) {
      return snapshot;
    }

    return new Promise((resolve) => {
      chrome.proxy.settings.get({ incognito: false }, (details) => {
        if (chrome.runtime.lastError) {
          console.warn('[ShadowBrowse] Could not capture proxy snapshot:', chrome.runtime.lastError);
          resolve(snapshot);
          return;
        }

        snapshot.config = details.value as chrome.proxy.ProxyConfig;
        snapshot.controlledByExtension = details.levelOfControl === 'controlled_by_this_extension';
        snapshot.controlledByPolicy =
          details.levelOfControl === 'controlled_by_other_extensions' ||
          details.levelOfControl === 'not_controllable';

        resolve(snapshot);
      });
    });
  }

  /**
   * Captures the current WebRTC IP handling policy before ShadowBrowse changes it.
   */
  static async captureWebRTCPolicy(): Promise<string> {
    if (!this.isChromeAvailable() || !chrome.privacy?.network?.webRTCIPHandlingPolicy) {
      return 'default';
    }
    return new Promise((resolve) => {
      chrome.privacy.network.webRTCIPHandlingPolicy.get({}, (details) => {
        if (chrome.runtime.lastError) {
          resolve('default');
          return;
        }
        resolve((details.value as string) || 'default');
      });
    });
  }

  /**
   * Restores proxy settings to a previously captured snapshot.
   * If the snapshot was controlled by another policy, we clear our override only.
   */
  static async restoreProxySnapshot(snapshot: ProxySnapshot): Promise<void> {
    if (!this.isChromeAvailable() || !chrome.proxy?.settings) return;

    if (snapshot.controlledByPolicy) {
      // We should not try to set policy-controlled proxy; just clear ours.
      return this.clearProxy();
    }

    if (snapshot.config && snapshot.config.mode !== 'system' && snapshot.controlledByExtension) {
      // Restore whatever config was active before we took over
      return new Promise((resolve) => {
        chrome.proxy.settings.set(
          { value: snapshot.config!, scope: 'regular' },
          () => {
            if (chrome.runtime.lastError) {
              console.warn('[ShadowBrowse] Proxy restore failed, clearing instead:', chrome.runtime.lastError);
              chrome.proxy.settings.clear({ scope: 'regular' }, () => resolve());
            } else {
              resolve();
            }
          }
        );
      });
    }

    // Default: clear proxy back to system/browser default
    return this.clearProxy();
  }

  static async setProxy(config: chrome.proxy.ProxyConfig): Promise<boolean> {
    if (!this.isChromeAvailable() || !chrome.proxy?.settings) return false;
    return new Promise((resolve) => {
      chrome.proxy.settings.set(
        { value: config, scope: 'regular' },
        () => {
          if (chrome.runtime.lastError) {
            console.error('[ShadowBrowse] Proxy setting failed:', chrome.runtime.lastError);
            resolve(false);
          } else {
            resolve(true);
          }
        }
      );
    });
  }

  static async clearProxy(): Promise<void> {
    if (!this.isChromeAvailable() || !chrome.proxy?.settings) return;
    return new Promise((resolve) => {
      chrome.proxy.settings.clear({ scope: 'regular' }, () => resolve());
    });
  }

  static async setWebRTCPolicy(
    policy: 'default' | 'default_public_interface_only' | 'disable_non_proxied_udp'
  ): Promise<boolean> {
    if (!this.isChromeAvailable() || !chrome.privacy?.network?.webRTCIPHandlingPolicy) {
      return false;
    }
    return new Promise((resolve) => {
      chrome.privacy.network.webRTCIPHandlingPolicy.set(
        { value: policy },
        () => {
          if (chrome.runtime.lastError) {
            console.error('[ShadowBrowse] WebRTC policy failed:', chrome.runtime.lastError);
            resolve(false);
          } else {
            resolve(true);
          }
        }
      );
    });
  }

  /**
   * Verifies the currently active proxy configuration by reading it back from Chrome.
   * This is a partial route verification — it confirms Chrome has the proxy config set
   * but cannot prove traffic is actually flowing through it.
   */
  static async verifyActiveProxyConfig(): Promise<{
    configured: boolean;
    controlledByUs: boolean;
    mode: string;
    host: string;
    port: number;
  }> {
    if (!this.isChromeAvailable() || !chrome.proxy?.settings) {
      return { configured: false, controlledByUs: false, mode: 'unknown', host: '', port: 0 };
    }

    return new Promise((resolve) => {
      chrome.proxy.settings.get({ incognito: false }, (details) => {
        if (chrome.runtime.lastError) {
          resolve({ configured: false, controlledByUs: false, mode: 'unknown', host: '', port: 0 });
          return;
        }

        const config = details.value as chrome.proxy.ProxyConfig;
        const controlledByUs = details.levelOfControl === 'controlled_by_this_extension';
        const singleProxy = config?.rules?.singleProxy;

        resolve({
          configured: config?.mode === 'fixed_servers' && !!singleProxy,
          controlledByUs,
          mode: config?.mode || 'unknown',
          host: singleProxy?.host || '',
          port: singleProxy?.port || 0,
        });
      });
    });
  }

  /**
   * Browser-Side Outbound Route Probe (Phase 3).
   * Probes public IP from the browser's own network stack.
   * When Chrome's proxy is configured, this request is routed through Chrome's proxy.
   * Returns observed public IP and whether check.torproject.org confirmed it as Tor.
   */
  static async probeBrowserOutboundRoute(timeoutMs = 4000): Promise<{
    success: boolean;
    ip: string | null;
    isTor: boolean | null;
    error?: string;
  }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch('https://check.torproject.org/api/ip', {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        return {
          success: true,
          ip: data.IP || data.ip || null,
          isTor: typeof data.IsTor === 'boolean' ? data.IsTor : null,
        };
      }
    } catch (err) {
      // Fallback to simple IP echo
      try {
        const resFallback = await fetch('https://api.ipify.org?format=json', {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (resFallback.ok) {
          const dataFallback = await resFallback.json();
          return {
            success: true,
            ip: dataFallback.ip || null,
            isTor: null,
          };
        }
      } catch {
        // Fallback failed
      }
      return {
        success: false,
        ip: null,
        isTor: null,
        error: String(err),
      };
    } finally {
      clearTimeout(timeout);
    }

    return { success: false, ip: null, isTor: null };
  }

  /**
   * Performs a lightweight connectivity probe through the currently configured proxy.
   * IMPORTANT: This tests that the proxy is reachable from the extension context.
   * It does NOT prove traffic actually goes through Tor — only that the SOCKS5 port
   * is accepting connections. Honest status: UNVERIFIED for Tor identity, VERIFIED for proxy reachability.
   */
  static async probeProxyReachability(_host: string, port: number): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    try {
      await fetch(`http://127.0.0.1:${port}`, {
        signal: controller.signal,
        mode: 'no-cors',
      });
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Runs a multi-layer route verification sequence (Phase 3).
   * Combines:
   *   1. Active Chrome proxy configuration check
   *   2. Proxy endpoint reachability
   *   3. WebRTC leak prevention policy check
   *   4. Browser-side outbound IP verification (first-party network stack)
   *   5. Local Shadow Agent authoritative route evidence
   *
   * Transparency: Distinguishes AGENT_ROUTE_VERIFIED and BROWSER_ROUTE_VERIFIED.
   */
  static async runRouteVerification(
    networkMode: import('../shared/types').NetworkMode,
    torSocksPort: number,
    agentRouteData?: any
  ): Promise<RouteVerificationResult> {
    const result: RouteVerificationResult = {
      networkRoute: networkMode,
      proxyConfigured: false,
      proxyReachable: false,
      routeVerified: false,
      agentRouteStatus: agentRouteData?.verification_status || 'UNVERIFIED',
      browserRouteStatus: 'BROWSER_ROUTE_UNVERIFIED',
      directIp: agentRouteData?.direct_ip || null,
      proxiedIp: agentRouteData?.proxied_ip || null,
      browserObservedIp: null,
      exitIsTor: agentRouteData?.exit_is_tor ?? null,
      ipsDiffer: agentRouteData?.ips_differ ?? false,
      dnsStatus: 'UNVERIFIED',
      webRTCPolicy: 'unknown',
      webRTCVerified: false,
      fallbackDetected: false,
      verifiedAt: Date.now(),
      confidence: 'LOW',
      limitations: [],
    };

    // Step 1: Verify Chrome has the proxy config set to the expected port
    const activeConfig = await this.verifyActiveProxyConfig();
    const portMatches = networkMode === 'TOR' ? activeConfig.port === torSocksPort : true;
    result.proxyConfigured = activeConfig.configured && activeConfig.controlledByUs && portMatches;

    if (!result.proxyConfigured) {
      result.browserRouteStatus = 'BROWSER_ROUTE_FAILED';
      result.limitations.push(
        !portMatches
          ? `Chrome proxy port (${activeConfig.port}) does not match expected Tor port (${torSocksPort}).`
          : 'Chrome proxy config is not controlled by ShadowBrowse.'
      );
      result.confidence = 'LOW';
      return result;
    }

    // Step 2: Verify the proxy endpoint is reachable
    if (networkMode === 'TOR') {
      result.proxyReachable = await this.probeProxyReachability('127.0.0.1', torSocksPort);
    } else {
      result.proxyReachable = true;
    }

    // Step 3: Verify WebRTC policy
    if (this.isChromeAvailable() && chrome.privacy?.network?.webRTCIPHandlingPolicy) {
      const webRTCResult = await new Promise<string>((resolve) => {
        chrome.privacy.network.webRTCIPHandlingPolicy.get({}, (details) => {
          resolve(chrome.runtime.lastError ? 'unknown' : ((details.value as string) || 'default'));
        });
      });
      result.webRTCPolicy = webRTCResult;
      result.webRTCVerified = webRTCResult === 'disable_non_proxied_udp';
    }

    // Step 4: Browser-side outbound probe
    if (networkMode === 'TOR' && result.proxyConfigured && result.proxyReachable) {
      const browserProbe = await this.probeBrowserOutboundRoute(4000);
      if (browserProbe.success && browserProbe.ip) {
        result.browserObservedIp = browserProbe.ip;
        if (browserProbe.isTor !== null && result.exitIsTor === null) {
          result.exitIsTor = browserProbe.isTor;
        }

        if (result.directIp && browserProbe.ip === result.directIp) {
          result.browserRouteStatus = 'BROWSER_ROUTE_FAILED';
          result.fallbackDetected = true;
          result.limitations.push('CRITICAL: Browser observed IP matches direct IP. Direct bypass detected.');
        } else {
          result.browserRouteStatus = 'BROWSER_ROUTE_VERIFIED';
        }
      } else {
        result.browserRouteStatus = 'BROWSER_ROUTE_FAILED';
        result.limitations.push(
          'Browser outbound probe did not receive IP echo (offline test or endpoint unreachable).'
        );
      }
    } else if (result.proxyConfigured) {
      result.browserRouteStatus = 'BROWSER_ROUTE_FAILED';
    }

    // Step 5: Determine confidence and limitations
    if (networkMode === 'TOR') {
      result.limitations.push(
        'Agent route verification tests the local agent socket; browser probe tests extension fetch network stack.',
        'Arbitrary tab TLS sessions cannot be individually introspected from MV3 background service workers.',
        'Chromium SOCKS5 implementation performs remote hostname DNS resolution.'
      );

      const agentOk = result.agentRouteStatus === 'TOR_ROUTE_VERIFIED';
      const browserOk = result.browserRouteStatus === 'BROWSER_ROUTE_VERIFIED';

      // Technical Honesty Rule: Browser outbound route MUST succeed before route can be verified.
      // Tor daemon readiness alone (agent socket / control port / 100% bootstrap)
      // does NOT prove that browser outbound traffic is functioning.
      if (browserOk) {
        result.routeVerified = true;
        result.confidence = agentOk ? 'HIGH' : 'MEDIUM';
        result.dnsStatus = 'PARTIALLY_PROTECTED';
      } else {
        result.routeVerified = false;
        result.confidence = 'LOW';
        result.dnsStatus = 'WARNING';
      }
    } else if (networkMode === 'LOCAL_PROXY') {
      result.limitations.push(
        'Local HTTP proxy does not provide anonymity. Traffic is readable at the proxy.',
        'DNS protection depends on the local proxy\'s forwarding configuration.'
      );
      result.routeVerified = result.proxyConfigured;
      result.confidence = result.proxyConfigured ? 'MEDIUM' : 'LOW';
      result.dnsStatus = 'UNVERIFIED';
    } else {
      result.confidence = 'HIGH';
      result.routeVerified = true;
      result.dnsStatus = 'NOT_APPLICABLE';
      result.browserRouteStatus = 'BROWSER_ROUTE_VERIFIED';
    }

    return result;
  }

  static async clearSessionBrowsingData(sinceTimestamp?: number): Promise<boolean> {
    if (!this.isChromeAvailable() || !chrome.browsingData?.remove) return false;
    return new Promise((resolve) => {
      const options: chrome.browsingData.RemovalOptions = {
        since: sinceTimestamp || 0,
      };
      chrome.browsingData.remove(
        options,
        {
          cache: true,
          cookies: true,
          localStorage: true,
          serviceWorkers: true,
          indexedDB: true,
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error('[ShadowBrowse] browsingData.remove failed:', chrome.runtime.lastError);
            resolve(false);
          } else {
            resolve(true);
          }
        }
      );
    });
  }

  static async openSidePanel(tabId?: number): Promise<void> {
    if (!this.isChromeAvailable() || !chrome.sidePanel?.open) return;
    try {
      if (tabId) {
        await chrome.sidePanel.open({ tabId });
      } else {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          await chrome.sidePanel.open({ tabId: tab.id });
        }
      }
    } catch (err) {
      console.warn('[ShadowBrowse] Could not open side panel:', err);
    }
  }

  static async setBadge(text: string, color: string): Promise<void> {
    if (!this.isChromeAvailable() || !chrome.action?.setBadgeText) return;
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color });
  }
}
