import React, { useState, useEffect } from 'react';
import { Settings, Shield, Server, Trash2, CheckCircle2, HardDrive } from 'lucide-react';
import { UserSettings, AgentHealthStatus } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/constants';

interface EventStorageStats {
  memoryEvents: number;
  persistedEventsCap: number;
  memoryCap: number;
  isHydrated: boolean;
  retentionPolicy: string;
}

export const SettingsView: React.FC = () => {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [agentHealth, setAgentHealth] = useState<AgentHealthStatus | null>(null);
  const [storageStats, setStorageStats] = useState<EventStorageStats | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [clearedNotice, setClearedNotice] = useState(false);
  const [eventsClearedNotice, setEventsClearedNotice] = useState(false);

  const fetchSettingsAndAgent = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (res) => {
        if (res?.success && res.data) setSettings(res.data);
      });
      chrome.runtime.sendMessage({ type: 'CHECK_AGENT_HEALTH' }, (res) => {
        if (res?.success && res.data) setAgentHealth(res.data);
      });
      chrome.runtime.sendMessage({ type: 'GET_STORAGE_STATUS' }, (res) => {
        if (res?.success && res.data) setStorageStats(res.data);
      });
    }
  };

  useEffect(() => {
    fetchSettingsAndAgent();
  }, []);

  const handleUpdate = (key: keyof UserSettings, value: unknown) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', payload: { [key]: value } }, () => {
        setSavedNotice(true);
        setTimeout(() => setSavedNotice(false), 2000);
      });
    }
  };

  const handleClearPrivacyEvents = () => {
    if (
      confirm(
        'Clear locally recorded privacy and security audit events? This only removes diagnostic event records and does not change your network route, kill switch, or browser cookies.'
      )
    ) {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'CLEAR_PRIVACY_EVENTS' }, () => {
          setEventsClearedNotice(true);
          fetchSettingsAndAgent();
          setTimeout(() => setEventsClearedNotice(false), 2500);
        });
      }
    }
  };

  const handleClearData = () => {
    if (confirm('Clear all ShadowBrowse temporary states, cached settings, and local event logs?')) {
      chrome.runtime.sendMessage({ type: 'CLEAR_LOCAL_DATA' }, () => {
        setClearedNotice(true);
        fetchSettingsAndAgent();
        setTimeout(() => setClearedNotice(false), 2000);
      });
    }
  };

  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center justify-between pb-3 border-b border-[#1f2737]">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100 flex items-center gap-1.5">
            <Settings className="w-4 h-4 text-[#8b5cf6]" />
            System Configuration
          </h2>
          <p className="text-[11px] text-slate-400">Security policies &amp; agent connectivity</p>
        </div>
        {savedNotice && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" /> Saved
          </span>
        )}
      </div>

      {/* Network Configuration */}
      <div className="p-3 bg-[#10141d] border border-[#1f2737] rounded-lg space-y-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Server className="w-3.5 h-3.5 text-[#8b5cf6]" />
          Network Anonymity Mode
        </span>

        <div className="space-y-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="netMode"
              checked={settings.defaultNetworkMode === 'TOR'}
              onChange={() => handleUpdate('defaultNetworkMode', 'TOR')}
              className="mt-0.5 accent-[#8b5cf6]"
            />
            <div>
              <div className="font-semibold text-slate-200">Tor Circuit (Recommended)</div>
              <div className="text-[11px] text-slate-400 leading-tight">
                Routes all browser TCP traffic through local Tor SOCKS5 daemon with remote DNS resolution.
              </div>
            </div>
          </label>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="netMode"
              checked={settings.defaultNetworkMode === 'LOCAL_PROXY'}
              onChange={() => handleUpdate('defaultNetworkMode', 'LOCAL_PROXY')}
              className="mt-0.5 accent-[#8b5cf6]"
            />
            <div>
              <div className="font-semibold text-slate-200">Local Proxy Layer</div>
              <div className="text-[11px] text-slate-400 leading-tight">
                Routes traffic through local HTTP proxy (127.0.0.1:8118) for inspection or chained tunnels.
              </div>
            </div>
          </label>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="netMode"
              checked={settings.defaultNetworkMode === 'DIRECT'}
              onChange={() => handleUpdate('defaultNetworkMode', 'DIRECT')}
              className="mt-0.5 accent-[#8b5cf6]"
            />
            <div>
              <div className="font-semibold text-slate-200">Direct Route (Storage/Fingerprint Only)</div>
              <div className="text-[11px] text-slate-400 leading-tight">
                Disables network routing while maintaining client-side storage isolation and fingerprint defenses.
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Security Policies */}
      <div className="p-3 bg-[#10141d] border border-[#1f2737] rounded-lg space-y-2.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-[#8b5cf6]" />
          Enforcement Policies
        </span>

        <label className="flex items-center justify-between cursor-pointer py-1">
          <div>
            <div className="text-slate-200 font-medium">Fail-Closed Network Kill Switch</div>
            <div className="text-[10px] text-slate-400">Lock traffic if the privacy network disconnects unexpectedly</div>
          </div>
          <input
            type="checkbox"
            checked={settings.killSwitchEnabled}
            onChange={(e) => handleUpdate('killSwitchEnabled', e.target.checked)}
            className="accent-[#8b5cf6]"
          />
        </label>

        <label className="flex items-center justify-between cursor-pointer py-1">
          <div>
            <div className="text-slate-200 font-medium">WebRTC Leak Protection</div>
            <div className="text-[10px] text-slate-400">Disable non-proxied UDP to prevent local IP address disclosure</div>
          </div>
          <input
            type="checkbox"
            checked={settings.webRTCProtectionEnabled}
            onChange={(e) => handleUpdate('webRTCProtectionEnabled', e.target.checked)}
            className="accent-[#8b5cf6]"
          />
        </label>

        <label className="flex items-center justify-between cursor-pointer py-1">
          <div>
            <div className="text-slate-200 font-medium">Identity Leak Warnings</div>
            <div className="text-[10px] text-slate-400">Alert on navigation to authentication / account sign-in endpoints</div>
          </div>
          <input
            type="checkbox"
            checked={settings.strictIdentityLeakWarnings}
            onChange={(e) => handleUpdate('strictIdentityLeakWarnings', e.target.checked)}
            className="accent-[#8b5cf6]"
          />
        </label>
      </div>

      {/* Phase 4B Tracking & Identity Defenses */}
      <div className="p-3 bg-[#10141d] border border-[#1f2737] rounded-lg space-y-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-[#8b5cf6]" />
          Tracking &amp; Identity Defenses (Phase 4B)
        </span>

        {/* Tracker Defense Mode */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-slate-200 font-medium text-[11px]">Tracker Blocking</span>
            <select
              value={settings.trackingProtectionMode || 'DETECT'}
              onChange={(e) => handleUpdate('trackingProtectionMode', e.target.value)}
              className="bg-[#0a0c10] border border-[#1f2737] rounded px-2 py-0.5 text-[11px] text-slate-200 focus:outline-none focus:border-[#8b5cf6]"
            >
              <option value="OFF">OFF (No filter)</option>
              <option value="DETECT">DETECT (Report only)</option>
              <option value="BLOCK">BLOCK (Declarative DNR)</option>
            </select>
          </div>
          <div className="text-[10px] text-slate-400">
            Blocks known cross-site tracking scripts. CDNs and functional APIs are never blocked.
          </div>
        </div>

        {/* Parameter Sanitization Mode */}
        <div className="space-y-1 pt-1 border-t border-[#1a2130]">
          <div className="flex items-center justify-between">
            <span className="text-slate-200 font-medium text-[11px]">URL Tracking Parameters</span>
            <select
              value={settings.trackingParamMode || 'DETECT_ONLY'}
              onChange={(e) => handleUpdate('trackingParamMode', e.target.value)}
              className="bg-[#0a0c10] border border-[#1f2737] rounded px-2 py-0.5 text-[11px] text-slate-200 focus:outline-none focus:border-[#8b5cf6]"
            >
              <option value="OFF">OFF</option>
              <option value="DETECT_ONLY">DETECT ONLY</option>
              <option value="SANITIZE">SANITIZE (Strip utm/gclid)</option>
            </select>
          </div>
          <div className="text-[10px] text-slate-400">
            Removes utm_*, gclid, and fbclid parameters while preserving functional query parameters.
          </div>
        </div>

        {/* Referrer Protection Mode */}
        <div className="space-y-1 pt-1 border-t border-[#1a2130]">
          <div className="flex items-center justify-between">
            <span className="text-slate-200 font-medium text-[11px]">Referrer Policy</span>
            <select
              value={settings.referrerProtectionMode || 'STANDARD'}
              onChange={(e) => handleUpdate('referrerProtectionMode', e.target.value)}
              className="bg-[#0a0c10] border border-[#1f2737] rounded px-2 py-0.5 text-[11px] text-slate-200 focus:outline-none focus:border-[#8b5cf6]"
            >
              <option value="OFF">OFF (Browser default)</option>
              <option value="STANDARD">STANDARD (Origin only)</option>
              <option value="STRICT">STRICT (Strip cross-origin)</option>
            </select>
          </div>
          <div className="text-[10px] text-slate-400">
            Prevents leaking full URL paths and search query strings in HTTP Referer headers.
          </div>
        </div>

        {/* Fingerprint State (Hard Requirement: Detection Only) */}
        <div className="space-y-1 pt-1 border-t border-[#1a2130]">
          <div className="flex items-center justify-between">
            <span className="text-slate-200 font-medium text-[11px]">Fingerprinting</span>
            <span className="badge-warning text-[10px]">DETECTION ONLY</span>
          </div>
          <div className="text-[10px] text-slate-400">
            Monitors Canvas, WebGL, and WebAudio probes. Safe mitigation only — no random noise or spoofing.
          </div>
        </div>
      </div>

      {/* Local Shadow Agent Status */}
      <div className="p-3 bg-[#10141d] border border-[#1f2737] rounded-lg space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Local Shadow Agent Link
          </span>
          <span className={agentHealth?.online ? 'badge-protected' : 'badge-danger'}>
            {agentHealth?.online ? 'AGENT ONLINE' : 'AGENT OFFLINE'}
          </span>
        </div>

        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Agent Port</span>
            <input
              type="number"
              value={settings.agentPort}
              onChange={(e) => handleUpdate('agentPort', parseInt(e.target.value) || 9152)}
              className="w-20 bg-[#0a0c10] border border-[#1f2737] rounded px-2 py-0.5 text-right font-mono text-slate-200 focus:outline-none focus:border-[#8b5cf6]"
            />
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Tor Circuit Status</span>
            <span className="mono text-slate-200">{agentHealth?.torStatus || 'NOT_AVAILABLE'}</span>
          </div>
        </div>
      </div>

      {/* Event Storage & Retention Controls (Phase 6A) */}
      <div className="p-3 bg-[#10141d] border border-[#1f2737] rounded-lg space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-[#8b5cf6]" />
            Privacy Event Audit Storage
          </span>
          <span className="mono text-[10px] text-slate-400">
            {storageStats?.memoryEvents || 0} / {storageStats?.persistedEventsCap || 200} events
          </span>
        </div>

        <div className="text-[11px] text-slate-300">
          <span className="font-semibold text-slate-200">Retention Policy: </span>
          {storageStats?.retentionPolicy ||
            'Bounded FIFO ring buffer (max 200 events) + Automatic purge upon session termination.'}
        </div>

        <div className="pt-1 border-t border-[#1a2130]">
          <button
            type="button"
            onClick={handleClearPrivacyEvents}
            className="w-full btn-secondary text-amber-400 hover:text-amber-300 hover:border-amber-900/50 py-1.5 text-xs flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Privacy Audit History</span>
          </button>
          <div className="text-[9px] text-slate-500 italic mt-1 text-center">
            Scope: Clears locally recorded audit events. Does not clear cookies, browser history, or alter network routing.
          </div>
          {eventsClearedNotice && (
            <p className="mt-1 text-center text-[10px] text-emerald-400 font-semibold">
              Privacy audit events successfully cleared.
            </p>
          )}
        </div>
      </div>

      {/* Full Reset Data Management */}
      <div className="pt-1">
        <button
          onClick={handleClearData}
          className="w-full btn-secondary text-red-400 hover:text-red-300 hover:border-red-900/50 py-2 text-xs flex items-center justify-center gap-1.5"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Reset All ShadowBrowse Local Settings &amp; Data</span>
        </button>
        {clearedNotice && (
          <p className="mt-1 text-center text-[10px] text-emerald-400">All local state and settings cleared.</p>
        )}
      </div>
    </div>
  );
};
