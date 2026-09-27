import { AutopsyReport, ExtensionMessage } from '../shared/types';
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

// Perform Website Autopsy on request
function performAutopsy(): AutopsyReport {
  const url = window.location.href;
  const domain = window.location.hostname;
  const isHttps = window.location.protocol === 'https:';

  // 1. Inspect scripts and iframes for third-party tracking
  const scripts = Array.from(document.querySelectorAll('script[src]')) as HTMLScriptElement[];
  const iframes = Array.from(document.querySelectorAll('iframe[src]')) as HTMLIFrameElement[];

  const thirdPartyDomains = new Set<string>();
  const detectedTrackers = new Set<string>();

  scripts.forEach((s) => {
    try {
      const parsed = new URL(s.src, window.location.href);
      if (parsed.hostname !== domain) {
        thirdPartyDomains.add(parsed.hostname);
        if (KNOWN_TRACKER_DOMAINS.some((td) => parsed.hostname.includes(td))) {
          detectedTrackers.add(parsed.hostname);
        }
      }
    } catch {
      // Relative or invalid URL
    }
  });

  iframes.forEach((f) => {
    try {
      const parsed = new URL(f.src, window.location.href);
      if (parsed.hostname !== domain) {
        thirdPartyDomains.add(parsed.hostname);
        if (KNOWN_TRACKER_DOMAINS.some((td) => parsed.hostname.includes(td))) {
          detectedTrackers.add(parsed.hostname);
        }
      }
    } catch {
      // Relative or invalid URL
    }
  });

  // 2. Inspect query parameters for persistent click IDs / campaign trackers
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
    // Access denied by browser policy
  }

  const cookiesCount = document.cookie ? document.cookie.split(';').length : 0;

  // 4. Calculate factual exposure score (0 - 100)
  // Higher score = greater privacy exposure / risk
  let networkScore = isHttps ? 5 : 40;
  let thirdPartyScore = Math.min(30, thirdPartyDomains.size * 3 + detectedTrackers.size * 5);
  let storageScore = Math.min(20, cookiesCount * 2 + localStorageKeysCount);
  let fingerprintScore = (observedSignals.canvas ? 15 : 0) + (observedSignals.webgl ? 10 : 0) + (observedSignals.audio ? 10 : 0);
  let identityScore = identifierParams.length * 10;

  const totalScore = Math.min(100, networkScore + thirdPartyScore + storageScore + fingerprintScore + identityScore);

  let privacyExposure: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
  if (totalScore > 55) {
    privacyExposure = 'HIGH';
  } else if (totalScore > 25) {
    privacyExposure = 'MEDIUM';
  }

  // Factual explanations derived strictly from collected evidence
  const explanations: string[] = [];
  if (!isHttps) {
    explanations.push('Connection is unencrypted (HTTP). Network observers can read all transferred data.');
  } else {
    explanations.push('Connection uses HTTPS encryption.');
  }

  if (detectedTrackers.size > 0) {
    explanations.push(`Detected ${detectedTrackers.size} known cross-site tracking network(s): ${Array.from(detectedTrackers).slice(0, 3).join(', ')}.`);
  }

  if (identifierParams.length > 0) {
    explanations.push(`URL contains tracking identifiers (${identifierParams.join(', ')}) linking your visit across platforms.`);
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

  if (thirdPartyDomains.size > 0 && detectedTrackers.size === 0) {
    explanations.push(`Page connects to ${thirdPartyDomains.size} third-party domain(s).`);
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
      redirectCount: (window.performance?.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)?.redirectCount || 0,
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
    referrerPolicy: document.referrer ? 'REFERRER_EXPOSED' : 'STRICT_OR_NONE',
    activeMechanisms: ['SESSION_ISOLATION', 'WEBRTC_PROTECTION', 'FINGERPRINT_MONITOR'],
    explanations,
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
