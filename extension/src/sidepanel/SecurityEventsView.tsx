import React, { useEffect, useState } from 'react';
import { AlertCircle, RefreshCw, Activity } from 'lucide-react';
import { SecurityEvent, PrivacyEvent } from '../shared/types';
import { calculatePrivacyRisk, PrivacyRiskAssessment } from '../shared/riskEngine';

export const SecurityEventsView: React.FC = () => {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [riskAssessment, setRiskAssessment] = useState<PrivacyRiskAssessment>(() => calculatePrivacyRisk([]));
  const [loading, setLoading] = useState(false);

  const fetchEvents = () => {
    setLoading(true);
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'GET_SECURITY_EVENTS' }, (res) => {
        if (res?.success && res.data) {
          setEvents(res.data);
        }
      });
      chrome.runtime.sendMessage({ type: 'GET_PRIVACY_EVENTS' }, (res) => {
        if (res?.success && Array.isArray(res.data)) {
          setRiskAssessment(calculatePrivacyRisk(res.data as PrivacyEvent[]));
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

  const getSeverityBadge = (severity: SecurityEvent['severity']) => {
    switch (severity) {
      case 'CRITICAL':
      case 'BLOCKED':
        return <span className="badge-danger">{severity}</span>;
      case 'WARNING':
        return <span className="badge-warning">WARNING</span>;
      case 'INFO':
      default:
        return <span className="badge-neutral">INFO</span>;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between pb-3 border-b border-[#1f2737]">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-[#8b5cf6]" />
            Security &amp; Privacy Events
          </h2>
          <p className="text-[11px] text-slate-400">Live technical audit log</p>
        </div>
        <button
          onClick={fetchEvents}
          disabled={loading}
          className="btn-secondary py-1.5 px-2 text-[11px]"
        >
          <RefreshCw className={`w-3 h-3 text-[#8b5cf6] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Session Privacy Risk Assessment (Phase 5B) */}
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

        {/* Visual score bar */}
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

        <div className="text-[11px] text-slate-300">
          {riskAssessment.summary}
        </div>

        {riskAssessment.factors.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-[#1a2233]">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
              Contributing Factors
            </div>
            {riskAssessment.factors.map((factor, idx) => (
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

      {events.length === 0 ? (
        <div className="p-6 text-center text-slate-500 text-xs">
          No security events logged in current session.
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((evt) => (
            <div
              key={evt.id}
              className="p-3 bg-[#10141d] border border-[#1f2737] rounded-lg text-xs space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getSeverityBadge(evt.severity)}
                  <span className="mono text-[10px] text-slate-400 font-semibold">
                    {evt.category}
                  </span>
                </div>
                <span className="mono text-[10px] text-slate-500">
                  {new Date(evt.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-slate-200 font-medium text-[11px]">
                {evt.userExplanation}
              </div>
              <div className="mono text-[10px] text-slate-400 bg-[#0a0c10] p-1.5 rounded border border-[#1a2233]">
                {evt.technicalReason}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
