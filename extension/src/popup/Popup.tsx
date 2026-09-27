import React, { useEffect, useState } from 'react';
import { Shield, ShieldAlert, ShieldCheck, Activity, Terminal, Settings, RefreshCw } from 'lucide-react';
import { SystemPrivacyOverview, UserSettings } from '../shared/types';

export const Popup: React.FC = () => {
  const [overview, setOverview] = useState<SystemPrivacyOverview | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);

  const fetchOverview = async () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'GET_PRIVACY_OVERVIEW' }, (response) => {
          if (response?.success && response.data) {
            setOverview(response.data);
          }
        });
      }
    } catch {
      // Ignored
    }
  };

  const fetchSettings = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
        if (response?.success && response.data) {
          setSettings(response.data);
        }
      });
    }
  };

  useEffect(() => {
    fetchOverview();
    fetchSettings();
    const interval = setInterval(fetchOverview, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleSession = () => {
    setActionInProgress(true);
    const messageType = overview?.state === 'PROTECTED' || overview?.state === 'DEGRADED'
      ? 'END_ANONYMOUS_SESSION'
      : 'START_ANONYMOUS_SESSION';

    chrome.runtime.sendMessage({ type: messageType }, (response) => {
      if (response?.data) {
        setOverview(response.data);
      }
      setActionInProgress(false);
    });
  };

  const handleOpenSidePanel = () => {
    chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' });
    window.close();
  };

  const handleUpdateSetting = (key: keyof UserSettings, value: unknown) => {
    if (!settings) return;
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', payload: { [key]: value } });
  };

  const isSessionActive = overview?.state === 'PROTECTED' || overview?.state === 'DEGRADED';
  const isStartingOrStopping = overview?.state === 'STARTING' || overview?.state === 'STOPPING' || actionInProgress;

  return (
    <div className="w-[360px] p-4 bg-[#0a0c10] text-slate-100 font-sans border border-[#1f2737] rounded-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#1f2737]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#161c28] border border-[#8b5cf6]/40 flex items-center justify-center text-[#8b5cf6]">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-xs font-bold tracking-wider uppercase text-slate-100 flex items-center gap-1.5">
              SHADOWBROWSE
            </h1>
            <p className="text-[10px] text-slate-400 font-medium">Privacy &amp; Anonymity Layer</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
            className="p-1.5 rounded hover:bg-[#161c28] text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {showSettings && settings ? (
        /* Quick Settings Panel */
        <div className="py-3 border-b border-[#1f2737] space-y-2.5 text-xs">
          <div className="flex items-center justify-between text-slate-300 font-semibold mb-1">
            <span>Quick Configuration</span>
            <button
              onClick={() => setShowSettings(false)}
              className="text-[10px] text-[#8b5cf6] hover:underline"
            >
              Done
            </button>
          </div>

          <label className="flex items-center justify-between cursor-pointer py-1">
            <span className="text-slate-300 text-[11px]">Fail-Closed Kill Switch</span>
            <input
              type="checkbox"
              checked={settings.killSwitchEnabled}
              onChange={(e) => handleUpdateSetting('killSwitchEnabled', e.target.checked)}
              className="accent-[#8b5cf6]"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer py-1">
            <span className="text-slate-300 text-[11px]">Storage Isolation</span>
            <input
              type="checkbox"
              checked={settings.storageIsolationEnabled}
              onChange={(e) => handleUpdateSetting('storageIsolationEnabled', e.target.checked)}
              className="accent-[#8b5cf6]"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer py-1">
            <span className="text-slate-300 text-[11px]">Fingerprint Defense</span>
            <input
              type="checkbox"
              checked={settings.fingerprintProtectionEnabled}
              onChange={(e) => handleUpdateSetting('fingerprintProtectionEnabled', e.target.checked)}
              className="accent-[#8b5cf6]"
            />
          </label>

          <div className="pt-1 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Agent Local Port</span>
            <span className="font-mono text-slate-300">{settings.agentPort}</span>
          </div>
        </div>
      ) : null}

      {/* Session State Banner */}
      <div className="my-3 p-3 bg-[#10141d] border border-[#1f2737] rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Anonymous Session
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className={`status-dot ${
                overview?.state === 'PROTECTED'
                  ? 'status-dot-active'
                  : overview?.state === 'DEGRADED'
                  ? 'status-dot-warning'
                  : overview?.state === 'FAILED'
                  ? 'status-dot-danger'
                  : 'status-dot-inactive'
              }`}
            />
            <span className="text-[11px] font-bold tracking-wide mono">
              {overview?.state || 'OFF'}
            </span>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={handleToggleSession}
          disabled={isStartingOrStopping}
          className={`w-full py-2 px-3 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-2 ${
            isSessionActive
              ? 'bg-[#991b1b] hover:bg-[#b91c1c] text-white border border-red-500/40 shadow-sm'
              : 'bg-gradient-to-r from-[#7c3aed] to-[#6d28d9] hover:from-[#8b5cf6] hover:to-[#7c3aed] text-white border border-[#a78bfa]/40 shadow-md'
          } ${isStartingOrStopping ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          {isStartingOrStopping ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>{overview?.state === 'STARTING' ? 'INITIALIZING...' : 'ENDING SESSION...'}</span>
            </>
          ) : isSessionActive ? (
            <>
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>END ANONYMOUS SESSION</span>
            </>
          ) : (
            <>
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>START ANONYMOUS SESSION</span>
            </>
          )}
        </button>

        {overview?.activeSession && (
          <div className="mt-2 pt-2 border-t border-[#1f2737] flex items-center justify-between text-[10px] text-slate-400 font-mono">
            <span>Session ID:</span>
            <span className="text-slate-300 font-semibold">
              {overview.activeSession.sessionId.substring(0, 8)}...
            </span>
          </div>
        )}
      </div>

      {/* Real Privacy Status Matrix */}
      <div className="mb-3 p-3 bg-[#10141d] border border-[#1f2737] rounded-lg space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-[#1f2737] pb-1.5 flex items-center justify-between">
          <span>Privacy Status</span>
          <span className="text-[9px] font-normal text-slate-500">Live Diagnostics</span>
        </div>

        <div className="flex items-center justify-between text-xs py-0.5">
          <span className="text-slate-400">Network Routing</span>
          <span className="mono font-semibold text-[11px] text-slate-200">
            {overview?.network.mode === 'TOR'
              ? overview.network.torStatus === 'CONNECTED'
                ? 'TOR (CONNECTED)'
                : 'TOR (UNAVAILABLE)'
              : overview?.network.mode || 'DIRECT'}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs py-0.5">
          <span className="text-slate-400">IP Exposure</span>
          <span
            className={
              overview?.network.status === 'PROTECTED'
                ? 'badge-protected'
                : overview?.network.status === 'WARNING'
                ? 'badge-warning'
                : 'badge-neutral'
            }
          >
            {overview?.network.status || 'UNPROTECTED'}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs py-0.5">
          <span className="text-slate-400">DNS Resolution</span>
          <span
            className={
              overview?.network.dnsStatus === 'PROTECTED'
                ? 'badge-protected'
                : overview?.network.dnsStatus === 'WARNING'
                ? 'badge-warning'
                : 'badge-neutral'
            }
          >
            {overview?.network.dnsStatus || 'UNKNOWN'}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs py-0.5">
          <span className="text-slate-400">WebRTC Protection</span>
          <span
            className={
              overview?.webRTC.status === 'PROTECTED' ? 'badge-protected' : 'badge-neutral'
            }
          >
            {overview?.webRTC.status || 'DEFAULT'}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs py-0.5">
          <span className="text-slate-400">Storage Isolation</span>
          <span
            className={
              overview?.storage.status === 'PROTECTED' ? 'badge-protected' : 'badge-neutral'
            }
          >
            {overview?.storage.temporarySession ? 'ISOLATED' : 'PERSISTENT'}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs py-0.5">
          <span className="text-slate-400">Fingerprint Exposure</span>
          <span
            className={
              overview?.fingerprint.exposure === 'LOW'
                ? 'badge-protected'
                : overview?.fingerprint.exposure === 'MEDIUM'
                ? 'badge-warning'
                : 'badge-danger'
            }
          >
            {overview?.fingerprint.exposure || 'UNCHECKED'}
          </span>
        </div>
      </div>

      {/* Secondary Actions */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={handleOpenSidePanel}
          className="btn-secondary py-2 text-[11px] justify-center"
        >
          <Activity className="w-3.5 h-3.5 text-[#8b5cf6]" />
          <span>ANALYZE SITE</span>
        </button>

        <button
          onClick={handleOpenSidePanel}
          className="btn-secondary py-2 text-[11px] justify-center"
        >
          <Terminal className="w-3.5 h-3.5 text-[#8b5cf6]" />
          <span>ASSISTANT</span>
        </button>
      </div>

      {/* Agent Status Footer */}
      <div className="mt-3 pt-2 border-t border-[#1f2737] flex items-center justify-between text-[10px] text-slate-500">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              overview?.agent.online ? 'bg-emerald-400' : 'bg-slate-600'
            }`}
          />
          <span>Agent: {overview?.agent.online ? 'Localhost Online' : 'Offline'}</span>
        </div>
        <span>v0.1.0</span>
      </div>
    </div>
  );
};
