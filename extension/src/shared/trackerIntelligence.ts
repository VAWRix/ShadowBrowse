import {
  PrivacyEvent,
  PrivacyEventCategory,
  PrivacyEventOutcome,
  TrackerDomainIntel,
  TrackerIntelligenceSummary,
} from './types';

export const TRACKER_INTEL_DISCLAIMER =
  'Domain presence indicates observed tracking scripts, telemetry endpoints, or heuristic rule matches. It does not prove malicious intent or that requests were successfully blocked.';

/**
 * Pure, deterministic tracker intelligence aggregation function.
 * Evaluates sanitized PrivacyEvent records, groups by sanitized domain,
 * distinguishes mitigation outcomes, and produces bounded summary analytics.
 */
export function aggregateTrackerIntelligence(
  events?: PrivacyEvent[] | null
): TrackerIntelligenceSummary {
  if (!events || !Array.isArray(events) || events.length === 0) {
    return {
      uniqueDomainsCount: 0,
      totalTrackerEvents: 0,
      attemptedMitigations: 0,
      confirmedMitigations: 0,
      skippedMitigations: 0,
      unmitigatedDetections: 0,
      failedMitigations: 0,
      topDomains: [],
      disclaimer: TRACKER_INTEL_DISCLAIMER,
    };
  }

  const domainMap = new Map<
    string,
    {
      domain: string;
      totalEvents: number;
      categories: Set<PrivacyEventCategory>;
      outcomes: Record<PrivacyEventOutcome, number>;
      firstSeen: number;
      lastSeen: number;
    }
  >();

  let attemptedMitigations = 0;
  let confirmedMitigations = 0;
  let skippedMitigations = 0;
  let unmitigatedDetections = 0;
  let failedMitigations = 0;
  let totalTrackerEvents = 0;

  for (const evt of events) {
    if (!evt || typeof evt !== 'object') continue;

    // We aggregate events with an identified targetDomain or tracker-related categories
    const isTrackerRelated =
      evt.category === 'TRACKER' ||
      evt.category === 'TRACKING_PARAM' ||
      evt.category === 'FINGERPRINT' ||
      Boolean(evt.targetDomain);

    if (!isTrackerRelated) continue;

    const domain = (evt.targetDomain || 'in-page / direct').toLowerCase().trim();
    totalTrackerEvents++;

    // Track outcome distribution
    switch (evt.outcome) {
      case 'MITIGATION_ATTEMPTED':
        attemptedMitigations++;
        break;
      case 'MITIGATION_CONFIRMED':
        confirmedMitigations++;
        break;
      case 'MITIGATION_SKIPPED':
        skippedMitigations++;
        break;
      case 'DETECTED':
        unmitigatedDetections++;
        break;
      case 'FAILED':
        failedMitigations++;
        break;
      default:
        break;
    }

    const timestamp = typeof evt.timestamp === 'number' && !isNaN(evt.timestamp) ? evt.timestamp : Date.now();

    let entry = domainMap.get(domain);
    if (!entry) {
      entry = {
        domain,
        totalEvents: 0,
        categories: new Set<PrivacyEventCategory>(),
        outcomes: {
          DETECTED: 0,
          MITIGATION_ATTEMPTED: 0,
          MITIGATION_CONFIRMED: 0,
          MITIGATION_SKIPPED: 0,
          FAILED: 0,
          INFORMATIONAL: 0,
        },
        firstSeen: timestamp,
        lastSeen: timestamp,
      };
      domainMap.set(domain, entry);
    }

    const count = Math.max(1, evt.repeatCount || 1);
    entry.totalEvents += count;
    entry.categories.add(evt.category);
    entry.outcomes[evt.outcome] = (entry.outcomes[evt.outcome] || 0) + count;
    entry.firstSeen = Math.min(entry.firstSeen, timestamp);
    entry.lastSeen = Math.max(entry.lastSeen, timestamp);
  }

  // Convert to array and format notes deterministically
  const domainIntelList: TrackerDomainIntel[] = Array.from(domainMap.values()).map((entry) => {
    let notes = 'Observed tracker or telemetry activity.';
    if (entry.outcomes.MITIGATION_ATTEMPTED > 0 && entry.outcomes.DETECTED === 0) {
      notes = 'Declarative rule match dispatched; outcome unconfirmed by browser API.';
    } else if (entry.outcomes.MITIGATION_SKIPPED > 0) {
      notes = 'Allowed via built-in or user-configured whitelist.';
    } else if (entry.outcomes.DETECTED > 0 && entry.outcomes.MITIGATION_ATTEMPTED === 0) {
      notes = 'Detected without automated blocking (monitoring/detection mode).';
    } else if (entry.outcomes.FAILED > 0) {
      notes = 'Mitigation failed or encountered browser error.';
    }

    return {
      domain: entry.domain,
      totalEvents: entry.totalEvents,
      categories: Array.from(entry.categories),
      outcomes: entry.outcomes,
      firstSeen: entry.firstSeen,
      lastSeen: entry.lastSeen,
      isPrevalent: entry.totalEvents >= 3,
      notes,
    };
  });

  // Sort by event frequency descending, bounded to top 15 domains
  domainIntelList.sort((a, b) => b.totalEvents - a.totalEvents);
  const boundedTopDomains = domainIntelList.slice(0, 15);

  return {
    uniqueDomainsCount: domainMap.size,
    totalTrackerEvents,
    attemptedMitigations,
    confirmedMitigations,
    skippedMitigations,
    unmitigatedDetections,
    failedMitigations,
    topDomains: boundedTopDomains,
    disclaimer: TRACKER_INTEL_DISCLAIMER,
  };
}
