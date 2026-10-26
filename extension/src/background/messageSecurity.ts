import { ExtensionMessage } from '../shared/types';

export const MAX_MESSAGE_BYTE_SIZE = 65536; // 64 KB

export const VALID_MESSAGE_TYPES: Set<string> = new Set([
  'GET_PRIVACY_OVERVIEW',
  'START_ANONYMOUS_SESSION',
  'END_ANONYMOUS_SESSION',
  'ANALYZE_CURRENT_TAB',
  'GET_SECURITY_EVENTS',
  'GET_SETTINGS',
  'UPDATE_SETTINGS',
  'CHECK_AGENT_HEALTH',
  'CLEAR_LOCAL_DATA',
  'PAGE_AUTOPSY_REPORT',
  'PAGE_SECURITY_EVENT',
  'OPEN_SIDEPANEL',
  'IDENTITY_WARNING_DISMISS',
  'GET_STARTUP_PROGRESS',
  'VERIFY_ROUTE',
  'SET_TRACKER_MODE',
  'SET_PARAM_MODE',
  'SET_REFERRER_MODE',
  'GET_TRACKER_RULES',
  'GET_TRACKER_STATS',
  'GET_PRIVACY_EVENTS',
  'PURGE_SESSION_EVENTS',
  'GET_STORAGE_STATUS',
  'CLEAR_PRIVACY_EVENTS',
]);

export const VALID_CATEGORIES: Set<string> = new Set([
  'NETWORK',
  'IDENTITY',
  'STORAGE',
  'FINGERPRINT',
  'WEBRTC',
  'DNS',
  'SESSION',
  'KILL_SWITCH',
  'TRACKER',
  'TRACKING_PARAM',
  'REFERRER',
]);

export const PRIVILEGED_MESSAGE_TYPES: Set<string> = new Set([
  'START_ANONYMOUS_SESSION',
  'END_ANONYMOUS_SESSION',
  'UPDATE_SETTINGS',
  'CLEAR_LOCAL_DATA',
  'CLEAR_PRIVACY_EVENTS',
  'PURGE_SESSION_EVENTS',
  'SET_TRACKER_MODE',
  'SET_PARAM_MODE',
  'SET_REFERRER_MODE',
  'OPEN_SIDEPANEL',
  'IDENTITY_WARNING_DISMISS',
  'VERIFY_ROUTE',
]);

/**
 * Message types permitted from in-page content scripts.
 * Content scripts execute in the context of untrusted web pages and MUST NOT
 * be permitted to invoke administrative or state-altering extension operations.
 */
export const CONTENT_SCRIPT_ALLOWED_TYPES: Set<string> = new Set([
  'PAGE_SECURITY_EVENT',
  'PAGE_AUTOPSY_REPORT',
  'GET_SETTINGS', // Read-only parameters (agentToken is redacted for content script callers)
]);

export interface ValidationSuccess {
  valid: true;
  message: ExtensionMessage;
}

export interface ValidationFailure {
  valid: false;
  error: string;
}

export type MessageValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Validates inbound extension messages across security boundaries.
 * Enforces sender context, type safety, field constraints, and payload size bounds.
 */
export function validateExtensionMessage(
  rawMessage: unknown,
  sender?: chrome.runtime.MessageSender
): MessageValidationResult {
  // 1. Basic structure check
  if (!rawMessage || typeof rawMessage !== 'object' || Array.isArray(rawMessage)) {
    return { valid: false, error: 'Malformed message format: Expected non-null object.' };
  }

  // 2. Payload size bounding to prevent memory exhaustion
  try {
    const serialized = JSON.stringify(rawMessage);
    if (serialized.length > MAX_MESSAGE_BYTE_SIZE) {
      return { valid: false, error: 'Message payload exceeds maximum allowed size (64KB).' };
    }
  } catch {
    return { valid: false, error: 'Message serialization failed.' };
  }

  const msg = rawMessage as Record<string, unknown>;
  if (typeof msg.type !== 'string' || !msg.type.trim()) {
    return { valid: false, error: 'Invalid message: Missing or non-string "type" property.' };
  }

  // Validate that the message type is a known valid extension message
  if (!VALID_MESSAGE_TYPES.has(msg.type)) {
    return { valid: false, error: 'Unknown message type' };
  }

  // 3. Sender privilege separation
  // In Chrome runtime, internal extension messages share the same extension ID.
  // If sender.id is present and chrome.runtime.id is defined, ensure they match.
  if (typeof chrome !== 'undefined' && chrome?.runtime?.id && sender?.id && sender.id !== chrome.runtime.id) {
    return {
      valid: false,
      error: 'Unauthorized sender context: Message sender ID does not match extension ID.',
    };
  }

  // If sender.tab is present and NOT an internal extension page (chrome-extension://<id>),
  // the message originates from an in-page content script (untrusted web context).
  const isExtensionPage = Boolean(
    typeof chrome !== 'undefined' &&
    chrome?.runtime?.id &&
    typeof sender?.url === 'string' &&
    sender.url.startsWith(`chrome-extension://${chrome.runtime.id}/`)
  );

  const isContentScript = Boolean(sender?.tab) && !isExtensionPage;
  if (isContentScript) {
    if (!CONTENT_SCRIPT_ALLOWED_TYPES.has(msg.type)) {
      return {
        valid: false,
        error: `Unauthorized sender context: Content scripts cannot invoke privileged action "${msg.type}".`,
      };
    }
  }

  // 4. Per-type payload validation
  switch (msg.type) {
    case 'UPDATE_SETTINGS': {
      if (!msg.payload || typeof msg.payload !== 'object' || Array.isArray(msg.payload)) {
        return { valid: false, error: 'Invalid payload: UPDATE_SETTINGS requires an object payload.' };
      }
      const p = msg.payload as Record<string, unknown>;

      if (p.defaultNetworkMode !== undefined) {
        if (!['DIRECT', 'LOCAL_PROXY', 'TOR', 'CUSTOM_PROXY'].includes(p.defaultNetworkMode as string)) {
          return { valid: false, error: 'Invalid setting value for defaultNetworkMode.' };
        }
      }
      if (p.protectionProfile !== undefined) {
        if (!['STANDARD', 'PRIVATE', 'ANONYMOUS', 'STRICT_ANONYMOUS'].includes(p.protectionProfile as string)) {
          return { valid: false, error: 'Invalid setting value for protectionProfile.' };
        }
      }
      if (p.trackingProtectionMode !== undefined) {
        if (!['OFF', 'DETECT', 'BLOCK'].includes(p.trackingProtectionMode as string)) {
          return { valid: false, error: 'Invalid setting value for trackingProtectionMode.' };
        }
      }
      if (p.trackingParamMode !== undefined) {
        if (!['OFF', 'DETECT_ONLY', 'SANITIZE'].includes(p.trackingParamMode as string)) {
          return { valid: false, error: 'Invalid setting value for trackingParamMode.' };
        }
      }
      if (p.referrerProtectionMode !== undefined) {
        if (!['OFF', 'STANDARD', 'STRICT'].includes(p.referrerProtectionMode as string)) {
          return { valid: false, error: 'Invalid setting value for referrerProtectionMode.' };
        }
      }
      if (p.agentPort !== undefined) {
        const port = Number(p.agentPort);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          return { valid: false, error: 'agentPort must be a valid port integer (1-65535).' };
        }
      }
      if (p.agentToken !== undefined) {
        if (typeof p.agentToken !== 'string' || p.agentToken.length > 256) {
          return { valid: false, error: 'agentToken must be a string up to 256 characters.' };
        }
      }
      break;
    }

    case 'GET_PRIVACY_EVENTS': {
      if (msg.payload && typeof msg.payload === 'object') {
        const p = msg.payload as Record<string, unknown>;
        if (p.limit !== undefined) {
          const limit = Number(p.limit);
          if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
            return { valid: false, error: 'GET_PRIVACY_EVENTS limit must be an integer between 1 and 500.' };
          }
        }
        if (p.category !== undefined && typeof p.category === 'string') {
          if (!VALID_CATEGORIES.has(p.category)) {
            return { valid: false, error: `Invalid category filter "${p.category}".` };
          }
        }
      }
      break;
    }

    case 'PAGE_SECURITY_EVENT': {
      if (!msg.payload || typeof msg.payload !== 'object' || Array.isArray(msg.payload)) {
        return { valid: false, error: 'Invalid payload: PAGE_SECURITY_EVENT requires an object payload.' };
      }
      const p = msg.payload as Record<string, unknown>;
      if (typeof p.category !== 'string' || !VALID_CATEGORIES.has(p.category)) {
        return { valid: false, error: 'PAGE_SECURITY_EVENT missing or invalid category.' };
      }
      if (typeof p.severity !== 'string' || !['INFO', 'NOTICE', 'WARNING', 'CRITICAL', 'BLOCKED'].includes(p.severity)) {
        return { valid: false, error: 'PAGE_SECURITY_EVENT missing or invalid severity.' };
      }
      if (p.technicalReason !== undefined && (typeof p.technicalReason !== 'string' || p.technicalReason.length > 1024)) {
        return { valid: false, error: 'PAGE_SECURITY_EVENT technicalReason exceeds allowable length (1024 chars).' };
      }
      break;
    }

    case 'SET_TRACKER_MODE': {
      if (!['OFF', 'DETECT', 'BLOCK'].includes(msg.payload as string)) {
        return { valid: false, error: 'SET_TRACKER_MODE invalid payload value.' };
      }
      break;
    }

    case 'SET_PARAM_MODE': {
      if (!['OFF', 'DETECT_ONLY', 'SANITIZE'].includes(msg.payload as string)) {
        return { valid: false, error: 'SET_PARAM_MODE invalid payload value.' };
      }
      break;
    }

    case 'SET_REFERRER_MODE': {
      if (!['OFF', 'STANDARD', 'STRICT'].includes(msg.payload as string)) {
        return { valid: false, error: 'SET_REFERRER_MODE invalid payload value.' };
      }
      break;
    }

    case 'PURGE_SESSION_EVENTS': {
      if (msg.payload && typeof msg.payload === 'object') {
        const p = msg.payload as Record<string, unknown>;
        if (p.sessionId !== undefined && (typeof p.sessionId !== 'string' || p.sessionId.length > 128)) {
          return { valid: false, error: 'PURGE_SESSION_EVENTS sessionId must be a string up to 128 chars.' };
        }
      }
      break;
    }

    default:
      break;
  }

  return { valid: true, message: rawMessage as ExtensionMessage };
}
