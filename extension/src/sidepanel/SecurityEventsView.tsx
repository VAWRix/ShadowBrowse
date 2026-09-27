import React, { useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { SecurityEvent } from '../shared/types';

export const SecurityEventsView: React.FC = () => {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchEvents = () => {
    setLoading(true);
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'GET_SECURITY_EVENTS' }, (res) => {
        if (res?.success && res.data) {
          setEvents(res.data);
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
