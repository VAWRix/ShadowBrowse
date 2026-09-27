import { AutopsyReport, ExtensionMessage, ResourceClassification, ThirdPartyGraphNode } from '../shared/types';
import { KNOWN_TRACKER_DOMAINS, TRACKING_QUERY_PARAMS } from '../shared/constants';

// Injects the in-page guard into the page's MAIN execution context
function injectPageGuard() {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injectGuard.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  } catch (err) {
    console.debug('[ShadowBrowse] In-page guard injection skipped:', err);
  }
}

injectPageGuard();

// Store detected page signals locally for this page
const observedSignals = {
  canvas: false,
  webgl: false,
  audio: false,
  propertiesRead: [] as string[],
};

// Listen for signals posted from the in-page guard
window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data || event.data.source !== 'SHADOWBROWSE_PAGE_SIGNAL') {
    return;
  }

  const { type, detail } = event.data;
  if (type === 'CANVAS') observedSignals.canvas = true;
  if (type === 'WEBGL') observedSignals.webgl = true;
  if (type === 'AUDIO') observedSignals.audio = true;
  observedSignals.propertiesRead.push(`${type}: ${detail}`);

  // Forward event to background service worker
  try {
    chrome.runtime.sendMessage({
      type: 'PAGE_SECURITY_EVENT',
      payload: {
        category: 'FINGERPRINT',
        severity: 'WARNING',
        technicalReason: `Fingerprinting probe in page: ${type} - ${detail}`,
        userExplanation: `Website probed ${type} graphics/audio characteristics to generate a device fingerprint.`,
      },
    });
  } catch {
    // Context invalidated or extension reloading
  }
});

// Process URL tracking parameters (Phase 4B)
function processUrlParameters() {
  const search = window.location.search;
  if (!search) return;

  const params = new URLSearchParams(search);
  const detectedTrackingParams: string[] = [];

  params.forEach((_val, key) => {
    const isTracking = TRACKING_QUERY_PARAMS.some(
      (tp) => key.toLowerCase() === tp.toLowerCase() || key.toLowerCase().startsWith('utm_')
    );
    if (isTracking) {
      detectedTrackingParams.push(key);
    }
  });

  if (detectedTrackingParams.length === 0) return;

  try {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
      const mode = response?.data?.trackingParamMode || 'DETECT_ONLY';

      if (mode === 'SANITIZE') {
        const cleanParams = new URLSearchParams();
        params.forEach((val, key) => {
          const isTracking = TRACKING_QUERY_PARAMS.some(
            (tp) => key.toLowerCase() === tp.toLowerCase() || key.toLowerCase().startsWith('utm_')
          );
          if (!isTracking) {
            cleanParams.set(key, val);
          }
        });

        const newSearch = cleanParams.toString() ? `?${cleanParams.toString()}` : '';
        const cleanUrl = `${window.location.pathname}${newSearch}${window.location.hash}`;

        try {
          window.history.replaceState(window.history.state, '', cleanUrl);

          chrome.runtime.sendMessage({
            type: 'PAGE_SECURITY_EVENT',
            payload: {
              category: 'TRACKING_PARAM',
              severity: 'INFO',
              technicalReason: `Sanitized ${detectedTrackingParams.length} tracking parameter(s): ${detectedTrackingParams.join(', ')}`,
              userExplanation: `ShadowBrowse safely removed tracking parameters (${detectedTrackingParams.join(', ')}). Functional parameters were preserved.`,
              action: 'TRACKING_PARAMETER_REMOVED',
            },
          });
        } catch {
          // Security policy restriction on replaceState
        }
      } else if (mode === 'DETECT_ONLY') {
        chrome.runtime.sendMessage({
          type: 'PAGE_SECURITY_EVENT',
          payload: {
            category: 'TRACKING_PARAM',
            severity: 'WARNING',
            technicalReason: `Detected ${detectedTrackingParams.length} tracking parameter(s): ${detectedTrackingParams.join(', ')}`,
            userExplanation: `URL contains tracking parameters (${detectedTrackingParams.join(', ')}). In SANITIZE mode, these can be safely stripped.`,
            action: 'TRACKING_PARAMETER_DETECTED',
          },
        });
      }
    });
  } catch {
    // Background unavailable
  }
}

processUrlParameters();

// Helper to categorize resource domains
function classifyDomain(host: string, currentDomain: string): ResourceClassification {
  if (host === currentDomain || host.endsWith('.' + currentDomain)) {
    return 'FIRST_PARTY';
  }
  const cdnHosts = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  if (cdnHosts.some((c) => host === c || host.endsWith('.' + c))) {
    return 'CONTENT_DELIVERY';
  }
  const analyticsHosts = ['google-analytics.com', 'googletagmanager.com', 'segment.io', 'hotjar.com', 'mixpanel.com', 'amplitude.com'];
  if (analyticsHosts.some((a) => host === a || host.endsWith('.' + a))) {
    return 'ANALYTICS';
  }
  const adHosts = ['doubleclick.net', 'criteo.com', 'criteo.net', 'adnxs.com', 'taboola.com', 'outbrain.com', 'rubiconproject.com'];
  if (adHosts.some((ad) => host === ad || host.endsWith('.' + ad))) {
    return 'ADVERTISING';
  }
  const socialHosts = ['connect.facebook.net', 'platform.twitter.com', 'platform.linkedin.com'];
  if (socialHosts.some((s) => host === s || host.endsWith('.' + s))) {
    return 'SOCIAL';
  }
  const securityHosts = ['recaptcha.net', 'hcaptcha.com', 'challenges.cloudflare.com'];
  if (securityHosts.some((sec) => host === sec || host.endsWith('.' + sec))) {
    return 'SECURITY';
  }
  const fpHosts = ['fpjs.io', 'fingerprintjs.com', 'threatmetrix.com'];
  if (fpHosts.some((fp) => host === fp || host.endsWith('.' + fp))) {
    return 'FINGERPRINTING';
  }
  return 'THIRD_PARTY';
}

// Perform Website Autopsy on request
function performAutopsy(): AutopsyReport {
  const url = window.location.href;
  const domain = window.location.hostname;
  const isHttps = window.location.protocol === 'https:';

  // 1. Inspect scripts, iframes, and performance resource timing
  const scripts = Array.from(document.querySelectorAll('script[src]')) as HTMLScriptElement[];
  const iframes = Array.from(document.querySelectorAll('iframe[src]')) as HTMLIFrameElement[];

  const domainMap = new Map<string, { category: ResourceClassification; count: number; initiators: Set<string>; isTracker: boolean }>();
  const thirdPartyDomains = new Set<string>();
  const detectedTrackers = new Set<string>();

  // Process scripts
  scripts.forEach((s) => {
    try {
      const parsed = new URL(s.src, window.location.href);
      if (parsed.hostname !== domain) {
        thirdPartyDomains.add(parsed.hostname);
        const isTrk = KNOWN_TRACKER_DOMAINS.some((td) => parsed.hostname.includes(td));
        if (isTrk) detectedTrackers.add(parsed.hostname);

        const existing = domainMap.get(parsed.hostname) || {
          category: classifyDomain(parsed.hostname, domain),
          count: 0,
          initiators: new Set<string>(),
          isTracker: isTrk,
        };
        existing.count++;
        existing.initiators.add('script');
        domainMap.set(parsed.hostname, existing);
      }
    } catch {
      // Ignore invalid URL
    }
  });

  // Process iframes
  iframes.forEach((f) => {
    try {
      const parsed = new URL(f.src, window.location.href);
      if (parsed.hostname !== domain) {
        thirdPartyDomains.add(parsed.hostname);
        const isTrk = KNOWN_TRACKER_DOMAINS.some((td) => parsed.hostname.includes(td));
        if (isTrk) detectedTrackers.add(parsed.hostname);

        const existing = domainMap.get(parsed.hostname) || {
          category: classifyDomain(parsed.hostname, domain),
          count: 0,
          initiators: new Set<string>(),
          isTracker: isTrk,
        };
        existing.count++;
        existing.initiators.add('iframe');
        domainMap.set(parsed.hostname, existing);
      }
    } catch {
      // Ignore invalid URL
    }
  });

  // Process performance resource timing entries
  if (typeof window.performance !== 'undefined' && window.performance.getEntriesByType) {
    const resources = window.performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    resources.forEach((r) => {
      try {
        const parsed = new URL(r.name, window.location.href);
        if (parsed.hostname !== domain) {
          thirdPartyDomains.add(parsed.hostname);
          const isTrk = KNOWN_TRACKER_DOMAINS.some((td) => parsed.hostname.includes(td));
          if (isTrk) detectedTrackers.add(parsed.hostname);

          const existing = domainMap.get(parsed.hostname) || {
            category: classifyDomain(parsed.hostname, domain),
            count: 0,
            initiators: new Set<string>(),
            isTracker: isTrk,
          };
          existing.count++;
          if (r.initiatorType) existing.initiators.add(r.initiatorType);
          domainMap.set(parsed.hostname, existing);
        }
      } catch {
        // Ignore invalid URL
      }
    });
  }

  const thirdPartyNodes: ThirdPartyGraphNode[] = Array.from(domainMap.entries()).map(([host, info]) => ({
    domain: host,
    category: info.category,
    requestCount: info.count,
    initiatorTypes: Array.from(info.initiators),
    isKnownTracker: info.isTracker,
  }));

  // 2. Inspect query parameters
  const searchParams = new URLSearchParams(window.location.search);
  const identifierParams: string[] = [];
  TRACKING_QUERY_PARAMS.forEach((param) => {
    if (searchParams.has(param)) {
      identifierParams.push(param);
    }
  });

  // 3. Inspect storage
  let localStorageKeysCount = 0;
  try {
    localStorageKeysCount = window.localStorage.length;
  } catch {
    // Access denied
  }

  const cookiesCount = document.cookie ? document.cookie.split(';').length : 0;

  // 4. Referrer Evaluation
  let referrerPolicy = 'PROTECTED';
  const ref = document.referrer;
  if (!ref) {
    referrerPolicy = 'PROTECTED';
  } else {
    try {
      const parsedRef = new URL(ref);
      if (parsedRef.origin === window.location.origin) {
        referrerPolicy = 'SAME_ORIGIN';
      } else if (parsedRef.pathname === '/' || parsedRef.pathname === '') {
        referrerPolicy = 'PARTIAL (ORIGIN_ONLY)';
      } else {
        referrerPolicy = 'EXPOSED (FULL_PATH)';
      }
    } catch {
      referrerPolicy = 'UNVERIFIED';
    }
  }

  // 5. Calculate factual exposure score (0 - 100)
  const networkScore = isHttps ? 5 : 40;
  const thirdPartyScore = Math.min(30, thirdPartyDomains.size * 3 + detectedTrackers.size * 5);
  const storageScore = Math.min(20, cookiesCount * 2 + localStorageKeysCount);
  const fingerprintScore =
    (observedSignals.canvas ? 15 : 0) + (observedSignals.webgl ? 10 : 0) + (observedSignals.audio ? 10 : 0);
  const identityScore = identifierParams.length * 10;

  const totalScore = Math.min(100, networkScore + thirdPartyScore + storageScore + fingerprintScore + identityScore);

  let privacyExposure: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
  if (totalScore > 55) {
    privacyExposure = 'HIGH';
  } else if (totalScore > 25) {
    privacyExposure = 'MEDIUM';
  }

  const explanations: string[] = [];
  if (!isHttps) {
    explanations.push('Connection is unencrypted (HTTP). Network observers can read all transferred data.');
  } else {
    explanations.push('Connection uses HTTPS encryption.');
  }

  if (detectedTrackers.size > 0) {
    explanations.push(
      `Detected ${detectedTrackers.size} cross-site tracking network(s): ${Array.from(detectedTrackers).slice(0, 3).join(', ')}.`
    );
  }

  if (identifierParams.length > 0) {
    explanations.push(
      `URL contains tracking identifiers (${identifierParams.join(', ')}) linking your visit across platforms.`
    );
  }

  if (observedSignals.canvas) {
    explanations.push('Canvas rendering readout detected. The page probed pixel rendering to fingerprint your device.');
  }

  if (observedSignals.webgl) {
    explanations.push('WebGL hardware probe detected. The page inspected GPU vendor/renderer strings.');
  }

  if (observedSignals.audio) {
    explanations.push('WebAudio synthesis probe detected. The page analyzed audio signal frequencies for fingerprinting.');
  }

  if (referrerPolicy.includes('EXPOSED')) {
    explanations.push('Full URL path disclosed in Referrer header to destination origin.');
  }

  return {
    domain,
    url,
    timestamp: Date.now(),
    privacyExposure,
    exposureScore: totalScore,
    scoreFactors: {
      network: networkScore,
      storage: storageScore,
      thirdParty: thirdPartyScore,
      fingerprint: fingerprintScore,
      identity: identityScore,
    },
    network: {
      isHttps,
      redirectCount:
        (window.performance?.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)?.redirectCount || 0,
      certificateStatus: isHttps ? 'SECURE' : 'INSECURE',
      protocol: window.location.protocol.replace(':', '').toUpperCase(),
    },
    thirdParty: {
      totalRequests: scripts.length + iframes.length,
      uniqueDomains: Array.from(thirdPartyDomains),
      scripts: scripts.length,
      iframes: iframes.length,
      trackingDomains: Array.from(detectedTrackers),
    },
    trackingSignals: {
      cookiesCount,
      localStorageKeys: localStorageKeysCount,
      knownTrackers: Array.from(detectedTrackers),
      identifierParams,
    },
    fingerprinting: {
      canvasDetected: observedSignals.canvas,
      webglDetected: observedSignals.webgl,
      audioDetected: observedSignals.audio,
      fontProbingDetected: false,
      propertiesRead: observedSignals.propertiesRead.slice(-10),
    },
    referrerPolicy,
    activeMechanisms: ['SESSION_ISOLATION', 'WEBRTC_PROTECTION', 'FINGERPRINT_MONITOR', 'TRACKER_DEFENSE'],
    explanations,
    thirdPartyNodes,
  };
}

// Respond to messages from popup or sidepanel
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'ANALYZE_CURRENT_TAB') {
    const report = performAutopsy();
    sendResponse({ success: true, data: report });
    return true;
  }
});
