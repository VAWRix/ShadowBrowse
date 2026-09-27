import React, { useState, useEffect } from 'react';
import { Activity, AlertTriangle, RefreshCw, Shield, Globe, Database, Eye } from 'lucide-react';
import { AutopsyReport } from '../shared/types';

export const Autopsy: React.FC = () => {
  const [report, setReport] = useState<AutopsyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAutopsy = async () => {
    setLoading(true);
    setError(null);

    try {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab || !activeTab.id) {
          setError('No active web page detected.');
          setLoading(false);
          return;
        }

        // Avoid chrome:// or internal system pages
        if (activeTab.url?.startsWith('chrome://') || activeTab.url?.startsWith('about:')) {
          setError('Browser system pages cannot be analyzed.');
          setLoading(false);
          return;
        }

        chrome.tabs.sendMessage(activeTab.id, { type: 'ANALYZE_CURRENT_TAB' }, (response) => {
          if (chrome.runtime.lastError) {
            setError('Content script not active on this page. Refresh page and retry.');
          } else if (response?.success && response.data) {
            setReport(response.data);
          } else {
            setError('Autopsy returned no data.');
          }
          setLoading(false);
        });
      } else {
        setError('Chrome tabs API unavailable.');
        setLoading(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Analysis error: ${msg}`);
      setLoading(false);
    }
  };

  useEffect(() => {
    runAutopsy();
  }, []);

  return (
    <div className="space-y-4">
      {/* Header & Run Button */}
      <div className="flex items-center justify-between pb-3 border-b border-[#1f2737]">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100 flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-[#8b5cf6]" />
            Website Autopsy
          </h2>
          <p className="text-[11px] text-slate-400">Deep structural privacy inspection</p>
        </div>
        <button
          onClick={runAutopsy}
          disabled={loading}
          className="btn-secondary py-1.5 px-2.5 text-[11px]"
        >
          <RefreshCw className={`w-3 h-3 text-[#8b5cf6] ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Analyzing...' : 'Re-scan'}</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-amber-950/30 border border-amber-800/40 rounded-lg text-amber-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {report && (
        <div className="space-y-3">
          {/* Main Domain & Exposure Status */}
          <div className="p-3.5 bg-[#10141d] border border-[#1f2737] rounded-lg">
            <div className="flex items-center justify-between mb-1.5">
              <span className="mono font-bold text-sm text-slate-100 truncate max-w-[200px]">
                {report.domain}
              </span>
              <span
                className={
                  report.privacyExposure === 'LOW'
                    ? 'badge-protected'
                    : report.privacyExposure === 'MEDIUM'
                    ? 'badge-warning'
                    : 'badge-danger'
                }
              >
                {report.privacyExposure} EXPOSURE
              </span>
            </div>
            <div className="text-[10px] text-slate-400">
              Protocol: <span className="mono text-slate-200">{report.network.protocol}</span> | Certificate: <span className="mono text-emerald-400">{report.network.certificateStatus}</span>
            </div>

            {/* Score Breakdown Bar */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                <span>Privacy Exposure Index</span>
                <span className="mono font-semibold text-slate-200">{report.exposureScore}/100</span>
              </div>
              <div className="w-full bg-[#161c28] h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    report.privacyExposure === 'LOW'
                      ? 'bg-emerald-500'
                      : report.privacyExposure === 'MEDIUM'
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                  }`}
                  style={{ width: `${report.exposureScore}%` }}
                />
              </div>
            </div>
          </div>

          {/* Evidence Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 bg-[#10141d] border border-[#1f2737] rounded-lg">
              <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase font-bold mb-1">
                <Globe className="w-3 h-3 text-[#8b5cf6]" />
                <span>Third Parties</span>
              </div>
              <div className="text-base font-bold mono text-slate-100">
                {report.thirdParty.uniqueDomains.length}
              </div>
              <div className="text-[10px] text-slate-400">
                {report.thirdParty.trackingDomains.length} known trackers
              </div>
            </div>

            <div className="p-2.5 bg-[#10141d] border border-[#1f2737] rounded-lg">
              <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase font-bold mb-1">
                <Eye className="w-3 h-3 text-[#8b5cf6]" />
                <span>Fingerprint</span>
              </div>
              <div className="text-base font-bold mono text-slate-100">
                {report.fingerprinting.canvasDetected || report.fingerprinting.webglDetected ? 'ACTIVE' : 'NONE'}
              </div>
              <div className="text-[10px] text-slate-400">
                {report.fingerprinting.canvasDetected ? 'Canvas probed' : 'No graphics probe'}
              </div>
            </div>

            <div className="p-2.5 bg-[#10141d] border border-[#1f2737] rounded-lg">
              <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase font-bold mb-1">
                <Database className="w-3 h-3 text-[#8b5cf6]" />
                <span>Storage</span>
              </div>
              <div className="text-base font-bold mono text-slate-100">
                {report.trackingSignals.cookiesCount}
              </div>
              <div className="text-[10px] text-slate-400">
                {report.trackingSignals.localStorageKeys} localStorage keys
              </div>
            </div>

            <div className="p-2.5 bg-[#10141d] border border-[#1f2737] rounded-lg">
              <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase font-bold mb-1">
                <Shield className="w-3 h-3 text-[#8b5cf6]" />
                <span>Identifiers</span>
              </div>
              <div className="text-base font-bold mono text-slate-100">
                {report.trackingSignals.identifierParams.length}
              </div>
              <div className="text-[10px] text-slate-400">URL tracking query params</div>
            </div>
          </div>

          {/* Referrer & Policy */}
          <div className="p-2.5 bg-[#10141d] border border-[#1f2737] rounded-lg flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Referrer Header Exposure</span>
            <span className={`mono text-[11px] font-bold ${
              report.referrerPolicy === 'PROTECTED' ? 'text-emerald-400' :
              report.referrerPolicy.includes('PARTIAL') ? 'text-amber-400' : 'text-red-400'
            }`}>
              {report.referrerPolicy}
            </span>
          </div>

          {/* Third-Party Request Graph */}
          {report.thirdPartyNodes && report.thirdPartyNodes.length > 0 && (
            <div className="p-3 bg-[#10141d] border border-[#1f2737] rounded-lg space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Third-Party Network Graph ({report.thirdPartyNodes.length})</span>
                <span className="text-slate-500 font-normal">Classified Resources</span>
              </span>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {report.thirdPartyNodes.slice(0, 10).map((node, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[11px] p-1.5 bg-[#0a0c10] border border-[#1a2130] rounded">
                    <span className="mono text-slate-300 truncate max-w-[160px]">{node.domain}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                      node.isKnownTracker ? 'bg-red-950/60 text-red-400 border border-red-800/40' :
                      node.category === 'CONTENT_DELIVERY' ? 'bg-blue-950/40 text-blue-400 border border-blue-800/30' :
                      node.category === 'ANALYTICS' ? 'bg-amber-950/40 text-amber-400 border border-amber-800/30' :
                      'bg-slate-800 text-slate-300'
                    }`}>
                      {node.category}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Factual Explanations Generated strictly from evidence */}
          <div className="p-3 bg-[#10141d] border border-[#1f2737] rounded-lg space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Evidence-Based Findings
            </span>
            <ul className="space-y-1.5 text-xs text-slate-300">
              {report.explanations.map((exp, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-[#8b5cf6] font-bold">•</span>
                  <span>{exp}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
