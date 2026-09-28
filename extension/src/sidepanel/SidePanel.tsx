import React, { useState, useEffect } from 'react';
import { Shield, Activity, Terminal, AlertCircle, Settings, Layers } from 'lucide-react';
import { Autopsy } from './Autopsy';
import { Chat } from './Chat';
import { PrivacyStatus } from './PrivacyStatus';
import { SecurityEventsView } from './SecurityEventsView';
import { SettingsView } from './SettingsView';
import { SystemPrivacyOverview } from '../shared/types';
import { StatusDot } from '../components/StatusDot';

export const SidePanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'status' | 'autopsy' | 'assistant' | 'events' | 'settings'>('status');
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
    const interval = setInterval(fetchOverview, 3500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--sb-bg-base)' }}>
      {/* Top Brand Banner */}
      <header className="p-3 border-b flex items-center justify-between" style={{ background: 'var(--sb-bg-surface)' }}>
        <div className="flex items-center gap-2">
          <div className="sb-brand-mark" aria-hidden="true">
            <Shield style={{ width: 14, height: 14 }} />
          </div>
          <div>
            <h1 className="sb-brand-title">SHADOWBROWSE</h1>
            <p className="sb-brand-subtitle">Privacy Control Center</p>
          </div>
        </div>

        <div className="flex items-center gap-1-5">
          <StatusDot status={overview?.state || 'OFF'} size="sm" />
          <span className="mono font-semibold text-xs text-secondary">
            {overview?.state || 'OFF'}
          </span>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="sb-tabs-nav" aria-label="Control Center Tabs">
        <button
          type="button"
          onClick={() => setActiveTab('status')}
          className={`sb-tab-btn ${activeTab === 'status' ? 'is-active' : ''}`}
          aria-selected={activeTab === 'status'}
          role="tab"
        >
          <Layers style={{ width: 13, height: 13 }} />
          <span>Status</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('autopsy')}
          className={`sb-tab-btn ${activeTab === 'autopsy' ? 'is-active' : ''}`}
          aria-selected={activeTab === 'autopsy'}
          role="tab"
        >
          <Activity style={{ width: 13, height: 13 }} />
          <span>Autopsy</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('assistant')}
          className={`sb-tab-btn ${activeTab === 'assistant' ? 'is-active' : ''}`}
          aria-selected={activeTab === 'assistant'}
          role="tab"
        >
          <Terminal style={{ width: 13, height: 13 }} />
          <span>Assistant</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('events')}
          className={`sb-tab-btn ${activeTab === 'events' ? 'is-active' : ''}`}
          aria-selected={activeTab === 'events'}
          role="tab"
        >
          <AlertCircle style={{ width: 13, height: 13 }} />
          <span>Events</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`sb-tab-btn ${activeTab === 'settings' ? 'is-active' : ''}`}
          aria-selected={activeTab === 'settings'}
          title="Settings"
          aria-label="Settings"
          role="tab"
        >
          <Settings style={{ width: 13, height: 13 }} />
        </button>
      </nav>

      {/* Main Tab Content Area */}
      <main className="flex-1 overflow-y-auto p-3" role="tabpanel">
        {activeTab === 'status' && <PrivacyStatus overview={overview} />}
        {activeTab === 'autopsy' && <Autopsy />}
        {activeTab === 'assistant' && <Chat overview={overview} autopsy={null} />}
        {activeTab === 'events' && <SecurityEventsView />}
        {activeTab === 'settings' && <SettingsView />}
      </main>

      {/* Footer Status Bar */}
      <footer className="p-2 border-t flex items-center justify-between text-xs text-muted" style={{ background: 'var(--sb-bg-surface)' }}>
        <div className="flex items-center gap-1-5">
          <StatusDot status={overview?.agent.online ? 'PROTECTED' : 'FAILED'} size="sm" />
          <span>Local Agent: {overview?.agent.online ? '127.0.0.1:9152' : 'Offline'}</span>
        </div>
        <span className="mono">ShadowBrowse v0.4.5</span>
      </footer>
    </div>
  );
};
