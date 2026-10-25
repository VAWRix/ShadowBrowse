import React, { useEffect, useState, useMemo } from 'react';
import {
  AlertCircle,
  RefreshCw,
  Activity,
  Globe,
  FileText,
  Clock,
  Download,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import {
  PrivacyEvent,
  PrivacyEventOutcome,
  TrackerDomainIntel,
} from '../shared/types';
import { calculatePrivacyRisk, PrivacyRiskAssessment } from '../shared/riskEngine';
import { aggregateTrackerIntelligence } from '../shared/trackerIntelligence';
import { explainPrivacyDecision } from '../shared/privacyExplanation';
import { generateSessionPrivacyReport, exportSessionReportAsJson } from '../shared/sessionReport';

export const SecurityEventsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'timeline' | 'intel' | 'report'>('timeline');
  const [privacyEvents, setPrivacyEvents] = useState<PrivacyEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Timeline Filters
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('ALL');

  const fetchEvents = () => {
    setLoading(true);
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'GET_PRIVACY_EVENTS', payload: { limit: 100 } }, (res) => {
        if (res?.success && Array.isArray(res.data)) {
          setPrivacyEvents(res.data as PrivacyEvent[]);
        }
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 3000);
    return () => clearInterval(interval);
  }, []);

  // Derived Analytics (reusable & pure)
  const riskAssessment: PrivacyRiskAssessment = useMemo(
    () => calculatePrivacyRisk(privacyEvents),
    [privacyEvents]
  );

  const trackerIntel = useMemo(
    () => aggregateTrackerIntelligence(privacyEvents),
    [privacyEvents]
  );

  const sessionReport = useMemo(
    () => generateSessionPrivacyReport(privacyEvents),
    [privacyEvents]
  );

  // Filtered & Chronologically Sorted Timeline
  const timelineEvents = useMemo(() => {
    return [...privacyEvents]
      .filter((evt) => {
        if (categoryFilter !== 'ALL' && evt.category !== categoryFilter) return false;
        if (outcomeFilter !== 'ALL' && evt.outcome !== outcomeFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const timeA = typeof a.timestamp === 'number' && !isNaN(a.timestamp) ? a.timestamp : 0;
        const timeB = typeof b.timestamp === 'number' && !isNaN(b.timestamp) ? b.timestamp : 0;
        return timeB - timeA;
      });
  }, [privacyEvents, categoryFilter, outcomeFilter]);

  const handleDownloadReport = () => {
    try {
      const jsonStr = exportSessionReportAsJson(sessionReport);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shadowbrowse-session-report-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 200);
    } catch (err) {
      console.error('Failed to export session report:', err);
    }
  };

  const getOutcomeBadge = (outcome: PrivacyEventOutcome) => {
    switch (outcome) {
      case 'MITIGATION_CONFIRMED':
        return (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono">
            CONFIRMED
          </span>
        );
      case 'MITIGATION_ATTEMPTED':
        return (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800 font-mono">
            RULE DISPATCHED
          </span>
        );
      case 'MITIGATION_SKIPPED':
        return (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
            WHITELISTED
          </span>
        );
      case 'FAILED':
        return (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800 font-mono">
            FAILED
          </span>
        );
      case 'DETECTED':
      default:
        return (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 font-mono">
            DETECTED
          </span>
        );
    }
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#1f2737]">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-[#8b5cf6]" />
            Privacy &amp; Security Intel
          </h2>
          <p className="text-[11px] text-slate-400">Deterministic session audit &amp; exposure engine</p>
        </div>
        <button
          onClick={fetchEvents}
          disabled={loading}
          className="btn-secondary py-1.5 px-2 text-[11px]"
          title="Refresh Events"
        >
          <RefreshCw className={`w-3 h-3 text-[#8b5cf6] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Session Privacy Exposure Card (Phase 5B) */}
      <div className="p-3 bg-[#10141d] border border-[#1f2737] rounded-lg space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-[#8b5cf6]" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-200">
              Session Privacy Exposure
            </span>
          </div>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
              riskAssessment.level === 'CRITICAL' || riskAssessment.level === 'HIGH'
                ? 'badge-danger'
                : riskAssessment.level === 'MEDIUM'
                ? 'badge-warning'
                : 'badge-neutral'
            }`}
          >
            {riskAssessment.score} / 100 • {riskAssessment.level}
          </span>
        </div>

        <div className="w-full bg-[#1a2233] rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              riskAssessment.score >= 70
                ? 'bg-rose-500'
                : riskAssessment.score >= 40
                ? 'bg-amber-500'
                : 'bg-emerald-500'
            }`}
            style={{ width: `${Math.max(4, riskAssessment.score)}%` }}
          />
        </div>

        <div className="text-[11px] text-slate-300">{riskAssessment.summary}</div>

        {riskAssessment.factors.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-[#1a2233]">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
              Exposure Contributors
            </div>
            {riskAssessment.factors.map((factor, idx: number) => (
              <div
                key={idx}
                className="flex items-center justify-between text-[10px] text-slate-300 bg-[#0a0c10] px-2 py-1 rounded border border-[#1a2233]"
              >
                <span className="truncate pr-2">{factor.description}</span>
                <span className="mono text-slate-400 font-semibold shrink-0">
                  +{factor.cappedScore} pts
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="text-[9px] text-slate-500 italic pt-1 border-t border-[#1a2233]">
          {riskAssessment.disclaimer}
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-1 bg-[#0a0c10] p-1 rounded-lg border border-[#1f2737]">
        <button
          onClick={() => setActiveTab('timeline')}
          className={`flex-1 py-1.5 text-[11px] font-semibold rounded flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === 'timeline'
              ? 'bg-[#1f2737] text-[#8b5cf6] shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock className="w-3 h-3" />
          Timeline ({privacyEvents.length})
        </button>
        <button
          onClick={() => setActiveTab('intel')}
          className={`flex-1 py-1.5 text-[11px] font-semibold rounded flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === 'intel'
              ? 'bg-[#1f2737] text-[#8b5cf6] shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Globe className="w-3 h-3" />
          Tracker Intel ({trackerIntel.uniqueDomainsCount})
        </button>
        <button
          onClick={() => setActiveTab('report')}
          className={`flex-1 py-1.5 text-[11px] font-semibold rounded flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === 'report'
              ? 'bg-[#1f2737] text-[#8b5cf6] shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-3 h-3" />
          Report
        </button>
      </div>

      {/* TAB 1: PRIVACY TIMELINE (Phase 5D & 5E) */}
      {activeTab === 'timeline' && (
        <div className="space-y-2">
          {/* Filter Bar */}
          <div className="grid grid-cols-2 gap-1.5 pb-1">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-[#10141d] border border-[#1f2737] text-slate-300 text-[10px] rounded p-1"
            >
              <option value="ALL">All Categories</option>
              <option value="TRACKER">Trackers</option>
              <option value="FINGERPRINT">Fingerprinting</option>
              <option value="IDENTITY">Identity Warnings</option>
              <option value="TRACKING_PARAM">Tracking Tokens</option>
              <option value="NETWORK">Network / Tor</option>
              <option value="STORAGE">Storage / Cookies</option>
              <option value="WEBRTC">WebRTC</option>
            </select>

            <select
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
              className="bg-[#10141d] border border-[#1f2737] text-slate-300 text-[10px] rounded p-1"
            >
              <option value="ALL">All Outcomes</option>
              <option value="MITIGATION_ATTEMPTED">Rule Dispatched</option>
              <option value="MITIGATION_CONFIRMED">Confirmed Block</option>
              <option value="MITIGATION_SKIPPED">Whitelisted</option>
              <option value="DETECTED">Detected</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>

          {timelineEvents.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-xs bg-[#10141d] rounded-lg border border-[#1f2737]">
              No privacy events match the selected filters.
            </div>
          ) : (
            <div className="space-y-2">
              {timelineEvents.map((evt) => {
                const isExpanded = expandedEventId === evt.id;
                const explanation = isExpanded ? explainPrivacyDecision(evt) : null;

                return (
                  <div
                    key={evt.id}
                    className="p-2.5 bg-[#10141d] border border-[#1f2737] rounded-lg text-xs space-y-1.5 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {getOutcomeBadge(evt.outcome)}
                        <span className="mono text-[10px] text-slate-400 font-semibold">
                          {evt.category}
                        </span>
                        {evt.repeatCount > 1 && (
                          <span className="text-[9px] px-1 bg-[#1a2233] text-violet-300 rounded border border-[#2a354c] mono">
                            +{evt.repeatCount} repeated
                          </span>
                        )}
                      </div>
                      <span className="mono text-[10px] text-slate-500">
                        {new Date(evt.timestamp || Date.now()).toLocaleTimeString()}
                      </span>
                    </div>

                    {evt.targetDomain && (
                      <div className="text-[10px] text-slate-400 mono truncate">
                        domain: <span className="text-slate-200">{evt.targetDomain}</span>
                      </div>
                    )}

                    <div className="text-slate-200 font-medium text-[11px]">
                      {evt.userExplanation}
                    </div>

                    {/* Expandable Explanation Layer (Phase 5E) */}
                    <button
                      type="button"
                      onClick={() => setExpandedEventId(isExpanded ? null : evt.id)}
                      className="flex items-center gap-1 text-[10px] text-[#8b5cf6] hover:text-violet-400 font-medium pt-0.5"
                    >
                      {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      <span>{isExpanded ? 'Hide explanation' : 'Explain privacy decision'}</span>
                    </button>

                    {isExpanded && explanation && (
                      <div className="bg-[#0a0c10] p-2 rounded border border-[#1f2737] space-y-1.5 mt-1.5 text-[10px]">
                        <div>
                          <span className="text-slate-400 font-semibold">Detected Condition:</span>
                          <p className="text-slate-200">{explanation.what}</p>
                        </div>
                        <div>
                          <span className="text-slate-400 font-semibold">Logging Rationale:</span>
                          <p className="text-slate-300">{explanation.why}</p>
                        </div>
                        <div>
                          <span className="text-slate-400 font-semibold">Action Dispatched:</span>
                          <p className="text-slate-300">{explanation.actionAttempted}</p>
                        </div>
                        <div>
                          <span className="text-slate-400 font-semibold">Verified Outcome:</span>
                          <p className="text-slate-300">{explanation.knownOutcome}</p>
                        </div>
                        <div className="pt-1 border-t border-[#1a2233]">
                          <span className="text-[#8b5cf6] font-semibold">Recommendation:</span>
                          <p className="text-slate-300">{explanation.recommendedAction}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TRACKER INTELLIGENCE (Phase 5C) */}
      {activeTab === 'intel' && (
        <div className="space-y-3">
          {/* Metric Overview */}
          <div className="grid grid-cols-2 gap-2 text-center text-xs">
            <div className="bg-[#10141d] p-2 rounded border border-[#1f2737]">
              <div className="text-slate-400 text-[10px] uppercase font-semibold">Observed Domains</div>
              <div className="text-sm font-bold text-slate-100 mono">{trackerIntel.uniqueDomainsCount}</div>
            </div>
            <div className="bg-[#10141d] p-2 rounded border border-[#1f2737]">
              <div className="text-slate-400 text-[10px] uppercase font-semibold">Total Requests</div>
              <div className="text-sm font-bold text-slate-100 mono">{trackerIntel.totalTrackerEvents}</div>
            </div>
            <div className="bg-[#10141d] p-2 rounded border border-[#1f2737]">
              <div className="text-slate-400 text-[10px] uppercase font-semibold">Rules Dispatched</div>
              <div className="text-sm font-bold text-blue-400 mono">{trackerIntel.attemptedMitigations}</div>
            </div>
            <div className="bg-[#10141d] p-2 rounded border border-[#1f2737]">
              <div className="text-slate-400 text-[10px] uppercase font-semibold">Whitelisted Skips</div>
              <div className="text-sm font-bold text-slate-300 mono">{trackerIntel.skippedMitigations}</div>
            </div>
          </div>

          {/* Top Observed Tracker Domains */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wide">
              Top Observed Tracker Domains
            </div>
            {trackerIntel.topDomains.length === 0 ? (
              <div className="p-5 text-center text-slate-500 text-xs bg-[#10141d] rounded border border-[#1f2737]">
                Zero tracker or telemetry domains recorded in current session.
              </div>
            ) : (
              trackerIntel.topDomains.map((item: TrackerDomainIntel, idx: number) => (
                <div
                  key={idx}
                  className="p-2.5 bg-[#10141d] border border-[#1f2737] rounded-lg text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="mono font-semibold text-slate-200 text-[11px] truncate pr-2">
                      {item.domain}
                    </span>
                    <span className="mono text-[10px] bg-[#1a2233] px-1.5 py-0.5 rounded text-violet-300 shrink-0">
                      {item.totalEvents} evt{item.totalEvents > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {item.outcomes.MITIGATION_ATTEMPTED > 0 && (
                      <span className="text-[9px] px-1 bg-blue-950 text-blue-400 rounded border border-blue-900 mono">
                        {item.outcomes.MITIGATION_ATTEMPTED} dispatched
                      </span>
                    )}
                    {item.outcomes.MITIGATION_SKIPPED > 0 && (
                      <span className="text-[9px] px-1 bg-slate-800 text-slate-300 rounded border border-slate-700 mono">
                        {item.outcomes.MITIGATION_SKIPPED} whitelisted
                      </span>
                    )}
                    {item.outcomes.DETECTED > 0 && (
                      <span className="text-[9px] px-1 bg-amber-950 text-amber-400 rounded border border-amber-900 mono">
                        {item.outcomes.DETECTED} detected
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400">{item.notes}</div>
                </div>
              ))
            )}
          </div>

          <div className="text-[9px] text-slate-500 italic p-2 bg-[#0a0c10] rounded border border-[#1a2233]">
            {trackerIntel.disclaimer}
          </div>
        </div>
      )}

      {/* TAB 3: SESSION PRIVACY REPORT (Phase 5F) */}
      {activeTab === 'report' && (
        <div className="space-y-3">
          <div className="p-3 bg-[#10141d] border border-[#1f2737] rounded-lg space-y-2">
            <div className="flex items-center justify-between pb-1.5 border-b border-[#1f2737]">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-mono">Report Scope</span>
                <div className="text-xs font-bold text-slate-100">{sessionReport.scope}</div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase font-mono">Total Recorded</span>
                <div className="text-xs font-bold text-violet-400 mono">{sessionReport.totalEvents} events</div>
              </div>
            </div>

            {/* Category Breakdown */}
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase">Category Distribution</span>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(sessionReport.categoryCounts).map(([cat, cnt]) => (
                  <span
                    key={cat}
                    className="text-[10px] bg-[#0a0c10] px-2 py-0.5 rounded border border-[#1f2737] mono text-slate-300"
                  >
                    {cat}: {Number(cnt)}
                  </span>
                ))}
              </div>
            </div>

            {/* Critical Incidents */}
            {sessionReport.criticalIncidents.length > 0 && (
              <div className="space-y-1 pt-1.5 border-t border-[#1f2737]">
                <div className="flex items-center gap-1 text-rose-400 text-[10px] font-bold uppercase">
                  <ShieldAlert className="w-3 h-3" />
                  Critical Incidents ({sessionReport.criticalIncidents.length})
                </div>
                {sessionReport.criticalIncidents.map((incident) => (
                  <div
                    key={incident.id}
                    className="text-[10px] bg-rose-950/40 border border-rose-900/60 p-1.5 rounded text-rose-200"
                  >
                    {incident.explanation}
                  </div>
                ))}
              </div>
            )}

            {/* Recommendations */}
            <div className="space-y-1 pt-1.5 border-t border-[#1f2737]">
              <span className="text-[10px] font-semibold text-slate-400 uppercase">
                Diagnostic Recommendations
              </span>
              <ul className="list-disc list-inside text-[10px] text-slate-300 space-y-0.5">
                {sessionReport.recommendations.map((rec: string, i: number) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>

            {/* Download JSON Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleDownloadReport}
                className="btn-primary w-full py-1.5 text-xs flex items-center justify-center gap-2"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Sanitized JSON Report</span>
              </button>
            </div>

            <div className="text-[9px] text-slate-500 italic pt-1 border-t border-[#1a2233]">
              {sessionReport.disclaimer}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
