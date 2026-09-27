import React, { useState, useEffect } from 'react';
import { Shield, Activity, Terminal, AlertCircle, Settings, Layers } from 'lucide-react';
import { Autopsy } from './Autopsy';
import { Chat } from './Chat';
import { PrivacyStatus } from './PrivacyStatus';
import { SecurityEventsView } from './SecurityEventsView';
import { SettingsView } from './SettingsView';
import { SystemPrivacyOverview } from '../shared/types';

export const SidePanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'assistant' | 'autopsy' | 'status' | 'events' | 'settings'>('autopsy');
  const [overview, setOverview] = useState<SystemPrivacyOverview | null>(null);

  const fetchOverview = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'GET_PRIVACY_OVERVIEW' }, (res) => {
        if (res?.success && res.data) setOverview(res.data);
      });
    }
  };

  useEffect(() => {
    fetchOverview();
    const interval = setInterval(fetchOverview, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-[#0a0c10] text-slate-100 font-sans">
      {/* Top Banner */}
      <div className="p-3 bg-[#10141d] border-b border-[#1f2737] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-[#161c28] border border-[#8b5cf6]/40 flex items-center justify-center text-[#8b5cf6]">
            <Shield className="w-3.5 h-3.5" />
          </div>
          <div>
            <h1 className="text-xs font-bold uppercase tracking-wider text-slate-100">
              SHADOWBROWSE
            </h1>
            <p className="text-[10px] text-slate-400">Security Companion</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[10px]">
          <span
            className={`status-dot ${
              overview?.state === 'PROTECTED'
                ? 'status-dot-active'
                : overview?.state === 'DEGRADED'
                ? 'status-dot-warning'
                : 'status-dot-inactive'
            }`}
          />
          <span className="mono font-semibold text-slate-300">
            {overview?.state || 'OFF'}
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-[#1f2737] bg-[#0d1017] text-xs">
        <button
          onClick={() => setActiveTab('autopsy')}
          className={`flex-1 py-2 flex items-center justify-center gap-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'autopsy'
              ? 'border-[#8b5cf6] text-[#a78bfa] bg-[#161c28]'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Autopsy</span>
        </button>

        <button
          onClick={() => setActiveTab('assistant')}
          className={`flex-1 py-2 flex items-center justify-center gap-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'assistant'
              ? 'border-[#8b5cf6] text-[#a78bfa] bg-[#161c28]'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Assistant</span>
        </button>

        <button
          onClick={() => setActiveTab('status')}
          className={`flex-1 py-2 flex items-center justify-center gap-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'status'
              ? 'border-[#8b5cf6] text-[#a78bfa] bg-[#161c28]'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Status</span>
        </button>

        <button
          onClick={() => setActiveTab('events')}
          className={`flex-1 py-2 flex items-center justify-center gap-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'events'
              ? 'border-[#8b5cf6] text-[#a78bfa] bg-[#161c28]'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Events</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`py-2 px-3 flex items-center justify-center border-b-2 font-medium transition-colors ${
            activeTab === 'settings'
              ? 'border-[#8b5cf6] text-[#a78bfa] bg-[#161c28]'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
          title="Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main Tab View Area */}
      <div className="flex-1 overflow-y-auto p-3.5">
        {activeTab === 'autopsy' && <Autopsy />}
        {activeTab === 'assistant' && <Chat overview={overview} autopsy={null} />}
        {activeTab === 'status' && <PrivacyStatus overview={overview} />}
        {activeTab === 'events' && <SecurityEventsView />}
        {activeTab === 'settings' && <SettingsView />}
      </div>
    </div>
  );
};
