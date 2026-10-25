import { PrivacyEvent } from './types';

export type RiskLevel = 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface RiskFactor {
  category: string;
  description: string;
  rawScore: number;
  cappedScore: number;
  eventCount: number;
}

export interface PrivacyRiskAssessment {
  score: number; // Strictly 0 to 100
  level: RiskLevel;
  factors: RiskFactor[];
  summary: string;
  evaluatedEventsCount: number;
  disclaimer: string;
}

export const RISK_DISCLAIMER =
  'Indicative diagnostic metric calculated from locally recorded session events. It is not a mathematically certified guarantee of anonymity or proof that network tracking was completely prevented.';

/**
 * Pure, deterministic privacy risk assessment function.
 * Evaluates real PrivacyEvent records and computes an explainable, bounded score from 0 to 100.
 *
 * Rules:
 * - MITIGATION_SKIPPED events contribute 0 to the risk score.
 * - MITIGATION_ATTEMPTED is NOT interpreted as guaranteed blocking.
 * - Repeated events are capped to prevent duplicate flooding.
 * - Fingerprint probes are treated as detected exposure (DETECTION ONLY).
 * - Empty or malformed inputs default cleanly to score 0 (MINIMAL).
 */
export function calculatePrivacyRisk(events?: PrivacyEvent[] | null): PrivacyRiskAssessment {
  if (!events || !Array.isArray(events) || events.length === 0) {
    return {
      score: 0,
      level: 'MINIMAL',
      factors: [],
      summary: 'No privacy exposure events recorded in current session.',
      evaluatedEventsCount: 0,
      disclaimer: RISK_DISCLAIMER,
    };
  }

  // Group events by category for structured analysis
  const fingerprintEvents: PrivacyEvent[] = [];
  const trackerEvents: PrivacyEvent[] = [];
  const identityEvents: PrivacyEvent[] = [];
  const paramEvents: PrivacyEvent[] = [];
  const networkEvents: PrivacyEvent[] = [];

  for (const evt of events) {
    if (!evt || typeof evt !== 'object') continue;

    // Rule: MITIGATION_SKIPPED (e.g. whitelisted CDNs or Fonts) contributes zero exposure
    if (evt.outcome === 'MITIGATION_SKIPPED') continue;

    switch (evt.category) {
      case 'FINGERPRINT':
        fingerprintEvents.push(evt);
        break;
      case 'TRACKER':
        trackerEvents.push(evt);
        break;
      case 'IDENTITY':
        identityEvents.push(evt);
        break;
      case 'TRACKING_PARAM':
        paramEvents.push(evt);
        break;
      case 'NETWORK':
      case 'KILL_SWITCH':
        networkEvents.push(evt);
        break;
      default:
        break;
    }
  }

  const factors: RiskFactor[] = [];
  let totalScore = 0;

  // 1. Fingerprint Probes (Canvas, WebGL, AudioContext, Fonts)
  // Detection only — return values are not spoofed, so probes represent unmasked device exposure.
  if (fingerprintEvents.length > 0) {
    const distinctProbeTypes = new Set<string>();
    let repeatWeight = 0;

    for (const evt of fingerprintEvents) {
      const probeName = evt.metadata?.apiName || evt.type || 'generic';
      distinctProbeTypes.add(probeName);
      if (evt.repeatCount > 1) {
        repeatWeight += Math.min(evt.repeatCount - 1, 3); // Capped at +3 per repeating probe
      }
    }

    const raw = distinctProbeTypes.size * 12 + repeatWeight;
    const capped = Math.min(raw, 35); // Max 35 points for fingerprinting
    totalScore += capped;

    factors.push({
      category: 'FINGERPRINT',
      description: `${distinctProbeTypes.size} distinct hardware/API probe(s) detected (unmasked)`,
      rawScore: raw,
      cappedScore: capped,
      eventCount: fingerprintEvents.length,
    });
  }

  // 2. Trackers (Analytics, Ads, Beacons)
  // Evaluates both attempted DNR blocking and unblocked detection
  if (trackerEvents.length > 0) {
    const distinctDomains = new Set<string>();
    let unblockedDetected = 0;
    let attemptedBlocks = 0;

    for (const evt of trackerEvents) {
      const domain = evt.targetDomain || 'unknown';
      distinctDomains.add(domain);
      if (evt.outcome === 'DETECTED') {
        unblockedDetected++;
      } else if (evt.outcome === 'MITIGATION_ATTEMPTED') {
        attemptedBlocks++;
      }
    }

    // Unblocked trackers carry higher risk (10 pts) than attempted blocks (5 pts)
    const raw = distinctDomains.size * 6 + unblockedDetected * 4 + attemptedBlocks * 2;
    const capped = Math.min(raw, 35); // Max 35 points for trackers
    totalScore += capped;

    factors.push({
      category: 'TRACKER',
      description: `${distinctDomains.size} tracker domain(s) observed (${attemptedBlocks} block attempted, ${unblockedDetected} detected)`,
      rawScore: raw,
      cappedScore: capped,
      eventCount: trackerEvents.length,
    });
  }

  // 3. Identity Warnings (Visiting accounts.google.com during anonymous session)
  if (identityEvents.length > 0) {
    const raw = identityEvents.length * 20;
    const capped = Math.min(raw, 30); // Max 30 points
    totalScore += capped;

    factors.push({
      category: 'IDENTITY',
      description: `Sensitive authentication endpoint visited during private session`,
      rawScore: raw,
      cappedScore: capped,
      eventCount: identityEvents.length,
    });
  }

  // 4. URL Tracking Tokens (utm_*, gclid, fbclid)
  if (paramEvents.length > 0) {
    let unmitigatedCount = 0;
    let sanitizedCount = 0;

    for (const evt of paramEvents) {
      if (evt.outcome === 'DETECTED') {
        unmitigatedCount++;
      } else {
        sanitizedCount++;
      }
    }

    const raw = unmitigatedCount * 5 + sanitizedCount * 2;
    const capped = Math.min(raw, 15); // Max 15 points
    totalScore += capped;

    factors.push({
      category: 'TRACKING_PARAM',
      description: `${sanitizedCount} URL token(s) sanitized, ${unmitigatedCount} unmitigated`,
      rawScore: raw,
      cappedScore: capped,
      eventCount: paramEvents.length,
    });
  }

  // 5. Network / Kill Switch Failures
  if (networkEvents.length > 0) {
    let networkPenalty = 0;
    for (const evt of networkEvents) {
      if (evt.severity === 'CRITICAL' || evt.outcome === 'FAILED') {
        networkPenalty += 20;
      }
    }
    if (networkPenalty > 0) {
      const capped = Math.min(networkPenalty, 25);
      totalScore += capped;
      factors.push({
        category: 'NETWORK',
        description: `Network route interruption or kill switch engagement`,
        rawScore: networkPenalty,
        cappedScore: capped,
        eventCount: networkEvents.length,
      });
    }
  }

  // Clamp strictly between 0 and 100
  const finalScore = Math.min(100, Math.max(0, Math.round(totalScore)));

  // Derive semantic level
  let level: RiskLevel = 'MINIMAL';
  if (finalScore >= 90) {
    level = 'CRITICAL';
  } else if (finalScore >= 70) {
    level = 'HIGH';
  } else if (finalScore >= 40) {
    level = 'MEDIUM';
  } else if (finalScore >= 15) {
    level = 'LOW';
  }

  // Summary generation
  let summary = `Privacy exposure is ${level.toLowerCase()} (${finalScore}/100).`;
  if (finalScore === 0) {
    summary = 'Pristine session: zero active tracking or fingerprint probes observed.';
  } else if (level === 'CRITICAL' || level === 'HIGH') {
    summary = `Elevated risk: significant fingerprint probing or multiple tracking networks active.`;
  }

  return {
    score: finalScore,
    level,
    factors,
    summary,
    evaluatedEventsCount: events.length,
    disclaimer: RISK_DISCLAIMER,
  };
}
