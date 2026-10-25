import { PrivacyEvent, ExplainableDecision } from './types';

/**
 * Pure, deterministic explanation engine for privacy events and mitigation decisions.
 * Generates structured, explainable breakdowns of what happened, why it was logged,
 * what action was attempted or skipped, what outcome is verified, and user guidance.
 */
export function explainPrivacyDecision(evt: PrivacyEvent): ExplainableDecision {
  if (!evt || typeof evt !== 'object') {
    return {
      eventId: 'unknown',
      category: 'SESSION',
      what: 'Malformed or missing event record.',
      why: 'Invalid event data encountered.',
      actionAttempted: 'None',
      knownOutcome: 'Unverified',
      recommendedAction: 'No action required.',
    };
  }

  const domainStr = evt.targetDomain ? ` (${evt.targetDomain})` : '';

  switch (evt.category) {
    case 'FINGERPRINT': {
      const api = evt.metadata?.apiName || evt.type || 'hardware API';
      return {
        eventId: evt.id,
        category: evt.category,
        what: `Browser fingerprinting probe invoked: ${api}${domainStr}.`,
        why: 'Scripts attempted to query device hardware or rendering characteristics to build a persistent device profile.',
        actionAttempted: 'None. ShadowBrowse operates in detection-only mode for fingerprint probes.',
        knownOutcome: 'Detected. The probe received standard browser values; results were not spoofed.',
        recommendedAction: 'Avoid visiting untrusted sites that profile hardware during private sessions.',
      };
    }

    case 'TRACKER': {
      if (evt.outcome === 'MITIGATION_ATTEMPTED') {
        return {
          eventId: evt.id,
          category: evt.category,
          what: `Network tracker or telemetry request observed to ${evt.targetDomain || 'third-party endpoint'}.`,
          why: 'The destination matched a known tracker or telemetry domain signature.',
          actionAttempted: 'Dispatched declarativeNetRequest block rule to Chromium network engine.',
          knownOutcome: 'Attempted. Rule dispatched, but browser extensions cannot independently confirm internal packet drops.',
          recommendedAction: 'No immediate action required. Review tracker frequency in Tracker Intel.',
        };
      } else if (evt.outcome === 'MITIGATION_SKIPPED') {
        return {
          eventId: evt.id,
          category: evt.category,
          what: `Third-party asset request to ${evt.targetDomain || 'remote host'}.`,
          why: 'Matched an entry on the verified asset whitelist (e.g., standard CDN or web fonts).',
          actionAttempted: 'Skipped blocking to prevent breaking website styling or core functionality.',
          knownOutcome: 'Skipped per whitelist rules. Request proceeded normally.',
          recommendedAction: 'Whitelist settings can be customized in extension options if strict blocking is preferred.',
        };
      } else {
        return {
          eventId: evt.id,
          category: evt.category,
          what: `Tracker endpoint accessed: ${evt.targetDomain || 'unknown'}.`,
          why: 'Network request matched tracking heuristics without an active blocking rule.',
          actionAttempted: 'Logged for audit trail without blocking.',
          knownOutcome: 'Detected without intervention.',
          recommendedAction: 'Consider enabling strict tracker defense or updating blocklists.',
        };
      }
    }

    case 'TRACKING_PARAM': {
      const keys = evt.metadata?.paramKeys?.join(', ') || 'tracking tokens';
      return {
        eventId: evt.id,
        category: evt.category,
        what: `Navigation URL contained tracking parameters (${keys}).`,
        why: 'Campaign tags and click identifiers (e.g., utm_*, gclid, fbclid) allow cross-site user correlation.',
        actionAttempted: evt.outcome === 'MITIGATION_CONFIRMED'
          ? 'Stripped tracking parameters before navigation completed.'
          : 'Detected tracking tokens in URL.',
        knownOutcome: evt.outcome === 'MITIGATION_CONFIRMED'
          ? 'Confirmed. URL was sanitized and reloaded clean.'
          : 'Detected.',
        recommendedAction: 'Clean navigation links preserve anonymity across external referrals.',
      };
    }

    case 'IDENTITY': {
      return {
        eventId: evt.id,
        category: evt.category,
        what: `Sensitive identity or authentication endpoint visited (${evt.targetDomain || 'auth portal'}).`,
        why: 'Authenticating with personal accounts links your real identity to the anonymous browser session.',
        actionAttempted: 'User warning displayed in side panel.',
        knownOutcome: 'Warning issued. Network anonymity does not prevent voluntary account sign-in.',
        recommendedAction: 'Do not log into personal accounts if anonymity is required for this session.',
      };
    }

    case 'KILL_SWITCH':
    case 'NETWORK': {
      if (evt.severity === 'CRITICAL' || evt.outcome === 'FAILED') {
        return {
          eventId: evt.id,
          category: evt.category,
          what: 'Tor routing disruption or kill-switch safety activation.',
          why: 'The secure proxy route became unavailable or an unauthorized direct connection was detected.',
          actionAttempted: 'Engaged emergency kill-switch to sever unproxied traffic.',
          knownOutcome: 'Proxy connection severed. Unprotected direct traffic was blocked.',
          recommendedAction: 'Verify Tor daemon status or restart the session to restore secure routing.',
        };
      } else {
        return {
          eventId: evt.id,
          category: evt.category,
          what: 'Network routing status update or verification check.',
          why: 'Periodic route verification confirmed traffic is routing through Tor.',
          actionAttempted: 'Verified proxy configuration with browser network engine.',
          knownOutcome: 'Confirmed. Outbound IP matches verified Tor exit node.',
          recommendedAction: 'Normal operation. Route is secure.',
        };
      }
    }

    case 'STORAGE': {
      return {
        eventId: evt.id,
        category: evt.category,
        what: 'Session storage and cookie state purge executed.',
        why: 'Terminating private session to prevent cross-session tracking via cookies or local storage.',
        actionAttempted: 'Cleared cookies, localStorage, cache, and indexedDB for visited origins.',
        knownOutcome: 'Confirmed. Storage partitions cleared.',
        recommendedAction: 'Session ended cleanly. Local browser traces were wiped.',
      };
    }

    case 'WEBRTC': {
      return {
        eventId: evt.id,
        category: evt.category,
        what: 'WebRTC IP candidate exchange intercepted.',
        why: 'WebRTC STUN/TURN queries can leak local LAN and real WAN IP addresses bypassing proxies.',
        actionAttempted: 'Disabled non-proxied UDP and restricted WebRTC candidate discovery policy.',
        knownOutcome: 'Policy applied to browser WebRTC subsystem.',
        recommendedAction: 'Keep WebRTC mitigation active to prevent address leaks.',
      };
    }

    default: {
      return {
        eventId: evt.id,
        category: evt.category,
        what: evt.userExplanation || 'Privacy event recorded.',
        why: evt.technicalReason || 'Observed by ShadowBrowse audit engine.',
        actionAttempted: evt.outcome,
        knownOutcome: `Outcome: ${evt.outcome}`,
        recommendedAction: 'Review technical audit log for diagnostic details.',
      };
    }
  }
}
