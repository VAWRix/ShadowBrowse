import { UserSettings } from './types';

export const DEFAULT_AGENT_PORT = 9152;
export const DEFAULT_TOR_SOCKS_PORT = 9050;
export const DEFAULT_PROXY_HTTP_PORT = 8118;

export const DEFAULT_SETTINGS: UserSettings = {
  autoStartAnonymous: false,
  defaultNetworkMode: 'TOR',
  killSwitchEnabled: true,
  storageIsolationEnabled: true,
  fingerprintProtectionEnabled: true,
  webRTCProtectionEnabled: true,
  referrerProtectionEnabled: true,
  strictIdentityLeakWarnings: true,
  agentPort: DEFAULT_AGENT_PORT,
  agentToken: '', // Stored in chrome.storage.local
  // Phase 2
  protectionProfile: 'STANDARD',
  showStartupProgress: true,
  verifyRouteOnStart: true,
};

export const TRACKING_QUERY_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'msclkid',
  'zanpid',
  'mc_eid',
  'mc_cid',
  '_hsenc',
  '_hsmi',
  'igshid',
  'ttclid',
  'twclid',
  'sc_eid',
  'li_fat_id',
];

export const KNOWN_TRACKER_DOMAINS = [
  'google-analytics.com',
  'googletagmanager.com',
  'doubleclick.net',
  'adnxs.com',
  'facebook.net',
  'connect.facebook.net',
  'criteo.com',
  'criteo.net',
  'taboola.com',
  'outbrain.com',
  'hotjar.com',
  'scorecardresearch.com',
  'quantserve.com',
  'rubiconproject.com',
  'pubmatic.com',
  'amazon-adsystem.com',
  'demdex.net',
  'omtrdc.net',
  'branch.io',
  'appsflyer.com',
  'segment.com',
  'segment.io',
  'mixpanel.com',
  'amplitude.com',
];

export const SENSITIVE_IDENTITY_DOMAINS = [
  'accounts.google.com',
  'login.live.com',
  'appleid.apple.com',
  'facebook.com/login',
  'twitter.com/i/flow/login',
  'x.com/i/flow/login',
  'linkedin.com/login',
  'github.com/login',
  'paypal.com/signin',
  'amazon.com/ap/signin',
];
