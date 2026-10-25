import {
  PrivacyEvent,
  SessionPrivacyReport,
} from './types';
import { calculatePrivacyRisk } from './riskEngine';
import { aggregateTrackerIntelligence } from './trackerIntelligence';

export const SESSION_REPORT_DISCLAIMER =
  'This report is an indicative diagnostic summary derived from locally recorded session events. It is not mathematical proof of anonymity, nor does it guarantee that network tracking was completely prevented across all protocols.';

/**
 * Pure function that compiles an on-demand Session Privacy Report
 * from sanitized in-memory PrivacyEvent records.
 */
export function generateSessionPrivacyReport(
  events?: PrivacyEvent[] | null,
  sessionId?: string
): SessionPrivacyReport {
  const safeEvents = Array.isArray(events) ? events : [];
  const riskAssessment = calculatePrivacyRisk(safeEvents);
  const trackerIntelligence = aggregateTrackerIntelligence(safeEvents);

  const categoryCounts: Record<string, number> = {};
  const outcomeCounts: Record<string, number> = {};
  const criticalIncidents: SessionPrivacyReport['criticalIncidents'] = [];

  for (const evt of safeEvents) {
    if (!evt || typeof evt !== 'object') continue;

    categoryCounts[evt.category] = (categoryCounts[evt.category] || 0) + 1;
    outcomeCounts[evt.outcome] = (outcomeCounts[evt.outcome] || 0) + 1;

    if (
      evt.severity === 'CRITICAL' ||
      evt.category === 'KILL_SWITCH' ||
      (evt.category === 'NETWORK' && evt.outcome === 'FAILED')
    ) {
      criticalIncidents.push({
        id: evt.id,
        timestamp: evt.timestamp,
        category: evt.category,
        explanation: evt.userExplanation || 'Critical route or kill-switch incident observed.',
      });
    }
  }

  // Derive contextual recommendations
  const recommendations: string[] = [];
  if (trackerIntelligence.totalTrackerEvents > 0) {
    recommendations.push(
      `${trackerIntelligence.uniqueDomainsCount} tracker domain(s) observed. Review blocklists to maintain low telemetry exposure.`
    );
  }
  if (categoryCounts.FINGERPRINT) {
    recommendations.push(
      'Hardware/API fingerprinting probes were detected. Avoid visiting sites requiring device profiling during private sessions.'
    );
  }
  if (categoryCounts.IDENTITY) {
    recommendations.push(
      'Authentication endpoint accessed. Do not sign into personal accounts if absolute anonymity is required.'
    );
  }
  if (criticalIncidents.length > 0) {
    recommendations.push(
      'Emergency kill-switch or route disruption was recorded. Verify Tor routing daemon before starting a new session.'
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      'Pristine session state. No high-risk tracking, fingerprinting, or route interruptions observed.'
    );
  }

  const generatedAt = new Date().toISOString();
  const reportId = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    reportId,
    generatedAt,
    sessionId: sessionId || 'active_session',
    scope: safeEvents.length < 200 ? 'ACTIVE_SESSION' : 'HISTORY_BUFFER',
    totalEvents: safeEvents.length,
    categoryCounts,
    outcomeCounts,
    trackerIntelligence,
    riskScore: riskAssessment.score,
    riskLevel: riskAssessment.level,
    riskFactors: riskAssessment.factors.map((f) => ({
      category: f.category,
      description: f.description,
      cappedScore: f.cappedScore,
    })),
    criticalIncidents,
    recommendations,
    disclaimer: SESSION_REPORT_DISCLAIMER,
  };
}

/**
 * Validates and converts a SessionPrivacyReport into a sanitized JSON export string.
 * Never exports raw URLs, fragments, or unauthorized metadata.
 */
export function exportSessionReportAsJson(report: SessionPrivacyReport): string {
  if (!report || typeof report !== 'object') {
    throw new Error('Invalid session report provided for export');
  }

  // Construct a clean, sanitized export object ensuring no accidental leak
  const sanitizedExport = {
    reportId: report.reportId,
    generatedAt: report.generatedAt,
    sessionId: report.sessionId,
    scope: report.scope,
    totalEvents: report.totalEvents,
    categoryCounts: report.categoryCounts,
    outcomeCounts: report.outcomeCounts,
    riskScore: report.riskScore,
    riskLevel: report.riskLevel,
    riskFactors: report.riskFactors,
    trackerIntelligence: {
      uniqueDomainsCount: report.trackerIntelligence.uniqueDomainsCount,
      totalTrackerEvents: report.trackerIntelligence.totalTrackerEvents,
      attemptedMitigations: report.trackerIntelligence.attemptedMitigations,
      confirmedMitigations: report.trackerIntelligence.confirmedMitigations,
      skippedMitigations: report.trackerIntelligence.skippedMitigations,
      unmitigatedDetections: report.trackerIntelligence.unmitigatedDetections,
      failedMitigations: report.trackerIntelligence.failedMitigations,
      topDomains: report.trackerIntelligence.topDomains.map((d) => ({
        domain: d.domain,
        totalEvents: d.totalEvents,
        categories: d.categories,
        outcomes: d.outcomes,
        notes: d.notes,
      })),
    },
    criticalIncidents: report.criticalIncidents,
    recommendations: report.recommendations,
    disclaimer: report.disclaimer,
  };

  return JSON.stringify(sanitizedExport, null, 2);
}
