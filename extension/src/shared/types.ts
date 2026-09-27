/**
 * SHADOWBROWSE SHARED TYPE DEFINITIONS — Phase 2
 * Strict, technically honest types reflecting real privacy states.
 */

export type SessionMode = 'NORMAL' | 'PRIVATE' | 'ANONYMOUS';

export type PrivacyState =
  | 'OFF'
  | 'STARTING'
  | 'PROTECTED'
  | 'DEGRADED'
  | 'FAILED'
  | 'STOPPING';

export type NetworkMode = 'DIRECT' | 'LOCAL_PROXY' | 'TOR' | 'CUSTOM_PROXY';

// Tor state machine — granular lifecycle states
export type TorStatus =
  | 'NOT_INSTALLED'
  | 'NOT_RUNNING'
  | 'STARTING'
  | 'BOOTSTRAPPING'
  | 'CONNECTED'
  | 'DEGRADED'
  | 'FAILED'
  | 'NOT_AVAILABLE'
  | 'CONNECTION_FAILED';

export type ProtectionLevel =
  | 'PROTECTED'
  | 'PARTIALLY_PROTECTED'
  | 'PARTIAL'
  | 'DETECTION_ONLY'
  | 'UNAVAILABLE'
  | 'NOT_APPLICABLE'
  | 'UNKNOWN'
  | 'WARNING'
  | 'UNVERIFIED'
  | 'LEAK_DETECTED';

export type FingerprintExposure = 'LOW' | 'MEDIUM' | 'HIGH';

export type TorProviderType =
  | 'SYSTEM_TOR'
  | 'TOR_BROWSER'
  | 'USER_MANAGED_TOR'
  | 'CONFIGURED_SOCKS5'
  | 'UNAVAILABLE';

export type TorVerificationStatus =
  | 'CONFIRMED_TOR'
  | 'SOCKS5_ONLY'
  | 'UNAVAILABLE';

export type AgentRouteStatus =
  | 'TOR_ROUTE_VERIFIED'
  | 'ROUTE_VERIFIED_TOR_UNVERIFIED'
  | 'DIRECT_BYPASS_DETECTED'
  | 'SOCKS5_REACHABLE_ONLY'
  | 'ROUTE_FAILED'
  | 'UNVERIFIED';

export type BrowserRouteStatus =
  | 'BROWSER_ROUTE_VERIFIED'
  | 'BROWSER_PROXY_CONFIGURED'
  | 'BROWSER_ROUTE_FAILED'
  | 'BROWSER_ROUTE_UNVERIFIED';

// Granular session startup progress (supporting strict 10-step or milestone progress)
export interface SessionStartupProgress {
  step: number;
  label: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'FAILED';
}

export interface SessionStats {
  requestsObserved: number;
  privacyEventsCount: number;
  potentialTrackersBlockedOrDetected: number;
  fingerprintSignalsDetected: number;
  storageAccessEvents: number;
  networkStatusChanges: number;
}

export interface AnonymousSession {
  sessionId: string;
  startedAt: number;
  endedAt?: number;
  mode: SessionMode;
  networkMode: NetworkMode;
  storageIsolation: boolean;
  fingerprintProtection: boolean;
  webRTCProtection: boolean;
  dnsProtection: boolean;
  killSwitchActive: boolean;
  temporaryState: boolean;
  status: PrivacyState;
  stats: SessionStats;
}

export interface SecurityEvent {
  id: string;
  timestamp: number;
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'BLOCKED';
  category:
    | 'NETWORK'
    | 'IDENTITY'
    | 'STORAGE'
    | 'FINGERPRINT'
    | 'WEBRTC'
    | 'DNS'
    | 'SESSION'
    | 'KILL_SWITCH';
  technicalReason: string;
  userExplanation: string;
  action?: string; // What ShadowBrowse did in response
}

export interface AutopsyReport {
  domain: string;
  url: string;
  timestamp: number;
  privacyExposure: FingerprintExposure;
  exposureScore: number;
  scoreFactors: {
    network: number;
    storage: number;
    thirdParty: number;
    fingerprint: number;
    identity: number;
  };
  network: {
    isHttps: boolean;
    redirectCount: number;
    certificateStatus: string;
    protocol: string;
  };
  thirdParty: {
    totalRequests: number;
    uniqueDomains: string[];
    scripts: number;
    iframes: number;
    trackingDomains: string[];
  };
  trackingSignals: {
    cookiesCount: number;
    localStorageKeys: number;
    knownTrackers: string[];
    identifierParams: string[];
  };
  fingerprinting: {
    canvasDetected: boolean;
    webglDetected: boolean;
    audioDetected: boolean;
    fontProbingDetected: boolean;
    propertiesRead: string[];
  };
  referrerPolicy: string;
  activeMechanisms: string[];
  explanations: string[];
}

export interface RouteVerificationResult {
  networkRoute: NetworkMode;
  proxyConfigured: boolean;
  proxyReachable: boolean;
  routeVerified: boolean;
  agentRouteStatus: AgentRouteStatus;
  browserRouteStatus: BrowserRouteStatus;
  directIp?: string | null;
  proxiedIp?: string | null;
  browserObservedIp?: string | null;
  exitIsTor?: boolean | null;
  ipsDiffer?: boolean;
  dnsStatus: ProtectionLevel;
  webRTCPolicy: string;
  webRTCVerified: boolean;
  fallbackDetected: boolean;
  verifiedAt: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNVERIFIABLE';
  limitations: string[];
}

export interface AgentHealthStatus {
  online: boolean;
  version: string;
  torStatus: TorStatus;
  torProviderType?: TorProviderType;
  torEndpoint?: string;
  torReachable?: boolean;
  torProcessDetected?: boolean;
  torControlPortVerified?: boolean;
  torVerificationStatus?: TorVerificationStatus;
  torBootstrapPercent: number; // 0-100
  torBootstrapSummary?: string;
  torSocksPort: number;
  proxyStatus: 'RUNNING' | 'STOPPED' | 'ERROR';
  proxyHttpPort: number;
  dnsRoutedThroughPrivacy: boolean;
  dnsVerified: boolean;
  dnsStatus?: ProtectionLevel;
  killSwitchArmed: boolean;
  routeVerification: RouteVerificationResult | null;
  lastCheckTimestamp: number;
}

export interface ProxySnapshot {
  capturedAt: number;
  config: chrome.proxy.ProxyConfig | null;
  controlledByExtension: boolean;
  controlledByPolicy: boolean;
}

export interface IdentityWarning {
  domain: string;
  reason: string;
  timestamp: number;
  dismissed: boolean;
}

export interface SystemPrivacyOverview {
  state: PrivacyState;
  activeSession: AnonymousSession | null;
  agent: AgentHealthStatus;
  network: {
    mode: NetworkMode;
    status: ProtectionLevel;
    torStatus: TorStatus;
    dnsStatus: ProtectionLevel;
    routeVerified: boolean;
    proxyConflict: boolean;
  };
  identity: {
    status: ProtectionLevel;
    isolatedCookies: number;
    pendingWarning: IdentityWarning | null;
  };
  storage: {
    status: ProtectionLevel;
    temporarySession: boolean;
    cleanupVerified: boolean;
  };
  fingerprint: {
    status: ProtectionLevel; // Now correctly DETECTION_ONLY when no mitigation
    exposure: FingerprintExposure;
    mitigationActive: boolean;
    detectionActive: boolean;
  };
  webRTC: {
    status: ProtectionLevel;
    policy: string;
    verified: boolean;
  };
}

export interface UserSettings {
  autoStartAnonymous: boolean;
  defaultNetworkMode: NetworkMode;
  killSwitchEnabled: boolean;
  storageIsolationEnabled: boolean;
  fingerprintProtectionEnabled: boolean;
  webRTCProtectionEnabled: boolean;
  referrerProtectionEnabled: boolean;
  strictIdentityLeakWarnings: boolean;
  agentPort: number;
  agentToken: string;
  // Phase 2 additions
  protectionProfile: 'STANDARD' | 'PRIVATE' | 'ANONYMOUS' | 'STRICT_ANONYMOUS';
  showStartupProgress: boolean;
  verifyRouteOnStart: boolean;
}

export type ExtensionMessage =
  | { type: 'GET_PRIVACY_OVERVIEW' }
  | { type: 'START_ANONYMOUS_SESSION' }
  | { type: 'END_ANONYMOUS_SESSION' }
  | { type: 'ANALYZE_CURRENT_TAB' }
  | { type: 'GET_SECURITY_EVENTS' }
  | { type: 'GET_SETTINGS' }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<UserSettings> }
  | { type: 'CHECK_AGENT_HEALTH' }
  | { type: 'CLEAR_LOCAL_DATA' }
  | { type: 'PAGE_AUTOPSY_REPORT'; payload: AutopsyReport }
  | { type: 'PAGE_SECURITY_EVENT'; payload: Omit<SecurityEvent, 'id' | 'timestamp'> }
  | { type: 'OPEN_SIDEPANEL' }
  | { type: 'IDENTITY_WARNING_DISMISS' }
  | { type: 'GET_STARTUP_PROGRESS' }
  | { type: 'VERIFY_ROUTE' };

// ============================================================================
// PHASE 4A — BROWSER IDENTITY & CROSS-SITE TRACKING DATA MODELS
// ============================================================================

export type ResourceClassification =
  | 'UNKNOWN'
  | 'ANALYTICS'
  | 'ADVERTISING'
  | 'SOCIAL'
  | 'FINGERPRINTING'
  | 'SESSION'
  | 'FUNCTIONAL'
  | 'CONTENT_DELIVERY'
  | 'SECURITY'
  | 'FIRST_PARTY'
  | 'THIRD_PARTY';

export type TrackingParameterCategory =
  | 'CAMPAIGN_TRACKING'
  | 'CLICK_IDENTIFIER'
  | 'USER_ID'
  | 'AFFILIATE'
  | 'UNKNOWN';

export interface TrackingParameterFinding {
  param: string;
  value: string;
  category: TrackingParameterCategory;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  safeToStrip: boolean;
  description: string;
}

export type ReferrerExposureState =
  | 'PROTECTED'
  | 'PARTIAL'
  | 'UNVERIFIED'
  | 'EXPOSED';

export interface ReferrerFinding {
  status: ReferrerExposureState;
  rawReferrer: string;
  originOnly: boolean;
  policy: string;
  limitations: string[];
}

export type StorageCapabilityStatus =
  | 'REAL'
  | 'PARTIAL'
  | 'UNAVAILABLE'
  | 'UNVERIFIED';

export interface StorageSurfaceMatrixEntry {
  surface: 'Cookies' | 'LocalStorage' | 'SessionStorage' | 'IndexedDB' | 'CacheStorage' | 'ServiceWorkers';
  detect: StorageCapabilityStatus;
  clear: StorageCapabilityStatus;
  isolate: StorageCapabilityStatus;
  verify: StorageCapabilityStatus;
  notes: string;
}

export interface FingerprintSurfaceDetail {
  surface: 'CANVAS' | 'WEBGL' | 'AUDIO' | 'FONTS' | 'SCREEN' | 'HARDWARE' | 'NAVIGATOR_LOCALE';
  detected: boolean;
  accessCount: number;
  details: string[];
  entropyRelevance: 'LOW' | 'MEDIUM' | 'HIGH';
  mitigationStatus: 'NOT_CURRENTLY_ENABLED' | 'DETECTION_ONLY';
  mitigationSafe: boolean;
  limitations: string[];
}

export interface IdentityConsistencyCheck {
  timezone: string;
  language: string;
  platform: string;
  screenDimensions: string;
  webglVendor: string;
  consistent: boolean;
  anomalies: string[];
}

export type CrossSessionCorrelationClass =
  | 'LOCAL_IDENTITY_REUSE'
  | 'POTENTIAL_CORRELATION'
  | 'UNVERIFIED_EXTERNAL_CORRELATION';

export interface CrossSessionCorrelationSignal {
  signalType: 'COOKIE' | 'STORAGE_KEY' | 'CANVAS_HASH' | 'WEBGL_RENDERER' | 'SCREEN_GEOMETRY' | 'SESSION_TOKEN';
  signalKey: string;
  correlationClass: CrossSessionCorrelationClass;
  evidence: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface ThirdPartyGraphNode {
  domain: string;
  category: ResourceClassification;
  requestCount: number;
  initiatorTypes: string[];
  isKnownTracker: boolean;
  cnameCloaked?: boolean;
}

export type PrivacySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface PrivacyFinding {
  category: 'NETWORK' | 'STORAGE' | 'FINGERPRINT' | 'TRACKING_PARAM' | 'REFERRER' | 'CROSS_SESSION';
  severity: PrivacySeverity;
  source: string;
  evidence: string;
  mitigationAvailable: boolean;
  mitigationStatus: 'REAL' | 'PARTIAL' | 'DETECTION_ONLY' | 'UNAVAILABLE';
  deterministicRule: string;
}

