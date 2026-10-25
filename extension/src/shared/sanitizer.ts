import { PrivacyEventMetadata } from './types';

/**
 * Sanitizes an incoming URL or origin string to strictly its origin component
 * (protocol + hostname + optional port).
 * Strips all path segments, query strings, hashes, credentials, and userinfo.
 *
 * @param urlOrOrigin Raw URL or origin string
 * @returns Sanitized origin string (e.g., 'https://example.com:8080') or undefined
 */
export function sanitizeOrigin(urlOrOrigin?: string | null): string | undefined {
  if (!urlOrOrigin || typeof urlOrOrigin !== 'string') {
    return undefined;
  }

  const trimmed = urlOrOrigin.trim();
  if (!trimmed) return undefined;

  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:', 'chrome-extension:'].includes(parsed.protocol)) {
      return undefined;
    }
    const portPart = parsed.port ? `:${parsed.port}` : '';
    return `${parsed.protocol}//${parsed.hostname}${portPart}`;
  } catch {
    // If not a full URL, check if it's already an origin-like string
    if (/^[a-z][a-z0-9+.-]*:\/\/[a-z0-9.-]+(:\d+)?$/i.test(trimmed)) {
      try {
        const parsed = new URL(trimmed);
        return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

/**
 * Sanitizes a domain or host string to a lowercase canonical hostname.
 * Strips protocol, port, path, credentials, and invalid characters.
 *
 * @param domainOrHost Raw domain or hostname
 * @returns Clean hostname (e.g., 'doubleclick.net') or undefined
 */
export function sanitizeDomain(domainOrHost?: string | null): string | undefined {
  if (!domainOrHost || typeof domainOrHost !== 'string') {
    return undefined;
  }

  let cleaned = domainOrHost.trim().toLowerCase();
  if (!cleaned) return undefined;

  // If protocol exists, parse via URL to extract hostname
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
    try {
      return new URL(cleaned).hostname;
    } catch {
      // Fall through to regex cleanup
    }
  }

  // Remove credentials if present (user:pass@)
  if (cleaned.includes('@')) {
    cleaned = cleaned.split('@').pop() || '';
  }

  // Remove path or query if accidentally appended
  cleaned = cleaned.split('/')[0].split('?')[0].split('#')[0];

  // Remove port if present
  if (cleaned.includes(':') && !cleaned.includes(']')) {
    cleaned = cleaned.split(':')[0];
  }

  // Strip leading or trailing dots
  cleaned = cleaned.replace(/^\.+|\.+$/g, '');

  // Validate hostname syntax: alphanumeric, dashes, dots (at least one char)
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i.test(cleaned)) {
    return undefined;
  }

  return cleaned;
}

/**
 * Sanitizes a list of URL parameter keys.
 * Preserves ONLY the parameter names; values are never accepted or retained.
 *
 * @param keys Array of parameter names
 * @returns Bounded array of sanitized parameter keys
 */
export function sanitizeParamKeys(keys?: string[] | null): string[] {
  if (!Array.isArray(keys)) return [];

  const sanitized: string[] = [];
  const seen = new Set<string>();

  for (const rawKey of keys) {
    if (typeof rawKey !== 'string') continue;
    const cleanKey = rawKey.trim().toLowerCase();
    // Parameter keys must be alphanumeric, underscores, or dashes (max 64 chars)
    if (cleanKey.length > 0 && cleanKey.length <= 64 && /^[a-z0-9_.-]+$/i.test(cleanKey)) {
      if (!seen.has(cleanKey)) {
        seen.add(cleanKey);
        sanitized.push(cleanKey);
        if (sanitized.length >= 20) break; // Hard cap on parameter key count
      }
    }
  }

  return sanitized;
}

/**
 * Sanitizes arbitrary event metadata to strictly adhere to PrivacyEventMetadata.
 * Rejects sensitive fields (passwords, tokens, cookies, queries, URLs, bodies).
 *
 * @param rawMetadata Unsanitized metadata object
 * @returns Clean, strongly typed PrivacyEventMetadata or undefined
 */
export function sanitizeMetadata(
  rawMetadata?: PrivacyEventMetadata | Record<string, unknown> | null
): PrivacyEventMetadata | undefined {
  if (!rawMetadata || typeof rawMetadata !== 'object') {
    return undefined;
  }

  const result: PrivacyEventMetadata = {};
  let hasValidProperties = false;

  // 1. ruleId: positive integer
  if (typeof rawMetadata.ruleId === 'number' && Number.isInteger(rawMetadata.ruleId) && rawMetadata.ruleId > 0) {
    result.ruleId = rawMetadata.ruleId;
    hasValidProperties = true;
  }

  // 2. entityCategory: short alphanumeric/underscore string (max 32 chars)
  if (typeof rawMetadata.entityCategory === 'string') {
    const trimmed = rawMetadata.entityCategory.trim().toUpperCase();
    if (trimmed.length > 0 && trimmed.length <= 32 && /^[A-Z0-9_]+$/.test(trimmed)) {
      result.entityCategory = trimmed;
      hasValidProperties = true;
    }
  }

  // 3. apiName: short alphanumeric/dot string (max 32 chars)
  if (typeof rawMetadata.apiName === 'string') {
    const trimmed = rawMetadata.apiName.trim();
    if (trimmed.length > 0 && trimmed.length <= 32 && /^[a-zA-Z0-9_.]+$/.test(trimmed)) {
      result.apiName = trimmed;
      hasValidProperties = true;
    }
  }

  // 4. paramKeys: array of sanitized string keys
  if (Array.isArray(rawMetadata.paramKeys)) {
    const cleanKeys = sanitizeParamKeys(rawMetadata.paramKeys as string[]);
    if (cleanKeys.length > 0) {
      result.paramKeys = cleanKeys;
      hasValidProperties = true;
    }
  }

  // 5. metricValue: finite number
  if (typeof rawMetadata.metricValue === 'number' && Number.isFinite(rawMetadata.metricValue)) {
    result.metricValue = rawMetadata.metricValue;
    hasValidProperties = true;
  }

  // 6. diagnosticTag: short alphanumeric/underscore tag (max 32 chars)
  if (typeof rawMetadata.diagnosticTag === 'string') {
    const trimmed = rawMetadata.diagnosticTag.trim().toUpperCase();
    if (trimmed.length > 0 && trimmed.length <= 32 && /^[A-Z0-9_]+$/.test(trimmed)) {
      result.diagnosticTag = trimmed;
      hasValidProperties = true;
    }
  }

  return hasValidProperties ? result : undefined;
}
