import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Activity, Terminal, AlertCircle, Settings, Layers } from 'lucide-react';
import { Autopsy } from './Autopsy';
import { Chat } from './Chat';
import { PrivacyStatus } from './PrivacyStatus';
import { SecurityEventsView } from './SecurityEventsView';
import { SettingsView } from './SettingsView';
import { AutopsyReport, SystemPrivacyOverview } from '../shared/types';
import { StatusDot } from '../components/StatusDot';

type SidePanelTab = 'status' | 'autopsy' | 'assistant' | 'events' | 'settings';

const TABS: SidePanelTab[] = ['status', 'autopsy', 'assistant', 'events', 'settings'];

export const SidePanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SidePanelTab>('status');
  const [overview, setOverview] = useState<SystemPrivacyOverview | null>(null);
  const [autopsyReport, setAutopsyReport] = useState<AutopsyReport | null>(null);

  const fetchOverview = useCallback(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'GET_PRIVACY_OVERVIEW' }, (res) => {
        if (res?.success && res.data) setOverview(res.data);
      });
    }
  }, []);

  const switchTab = useCallback((tab: SidePanelTab) => {
    if (TABS.includes(tab)) {
      setActiveTab(tab);
    }
  }, []);

  // Keyboard navigation for tab list
  const handleKeyDown = (e: React.KeyboardEvent, currentTab: SidePanelTab) => {
    const currentIndex = TABS.indexOf(currentTab);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextTab = TABS[(currentIndex + 1) % TABS.length];
      switchTab(nextTab);
      const nextBtn = document.getElementById(`tab-${nextTab}`);
      nextBtn?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevTab = TABS[(currentIndex - 1 + TABS.length) % TABS.length];
      switchTab(prevTab);
      const prevBtn = document.getElementById(`tab-${prevTab}`);
      prevBtn?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      switchTab(TABS[0]);
      document.getElementById(`tab-${TABS[0]}`)?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      switchTab(TABS[TABS.length - 1]);
      document.getElementById(`tab-${TABS[TABS.length - 1]}`)?.focus();
    }
  };

  useEffect(() => {
    fetchOverview();
    const interval = setInterval(fetchOverview, 3500);

    // Initial check for target tab from popup or cached autopsy report
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['active_sidepanel_tab', 'latest_autopsy_report'], (res) => {
        if (res?.active_sidepanel_tab && TABS.includes(res.active_sidepanel_tab as SidePanelTab)) {
          switchTab(res.active_sidepanel_tab as SidePanelTab);
          chrome.storage.local.remove(['active_sidepanel_tab']);
        }
        if (res?.latest_autopsy_report) {
          setAutopsyReport(res.latest_autopsy_report);
        }
      });
    }

    // Storage change listener: handles tab switching when side panel is already open
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === 'local') {
        if (changes.active_sidepanel_tab?.newValue) {
          const target = changes.active_sidepanel_tab.newValue as SidePanelTab;
          if (TABS.includes(target)) {
            switchTab(target);
            chrome.storage.local.remove(['active_sidepanel_tab']);
          }
        }
        if (changes.latest_autopsy_report?.newValue) {
          setAutopsyReport(changes.latest_autopsy_report.newValue);
        }
      }
    };

    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(handleStorageChange);
    }

    // Runtime message listener: direct tab switch messages
    const handleRuntimeMessage = (message: any) => {
      if (
        message?.type === 'SWITCH_SIDEPANEL_TAB' &&
        message.payload?.tab &&
        TABS.includes(message.payload.tab as SidePanelTab)
      ) {
        switchTab(message.payload.tab as SidePanelTab);
      }
    };

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    }

    return () => {
      clearInterval(interval);
      if (typeof chrome !== 'undefined') {
        if (chrome.storage?.onChanged) {
          chrome.storage.onChanged.removeListener(handleStorageChange);
        }
        if (chrome.runtime?.onMessage) {
          chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
        }
      }
    };
  }, [fetchOverview, switchTab]);

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--sb-bg-base)' }}>
      {/* Top Brand Banner */}
      <header
        className="p-3 border-b flex items-center justify-between"
        style={{ background: 'var(--sb-bg-surface)' }}
      >
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
      <nav className="sb-tabs-nav" role="tablist" aria-label="ShadowBrowse Navigation Tabs">
        <button
          type="button"
          id="tab-status"
          onClick={() => switchTab('status')}
          onKeyDown={(e) => handleKeyDown(e, 'status')}
          className={`sb-tab-btn ${activeTab === 'status' ? 'is-active' : ''}`}
          aria-selected={activeTab === 'status'}
          aria-controls="panel-status"
          role="tab"
          tabIndex={activeTab === 'status' ? 0 : -1}
          title="Status & Diagnostics"
        >
          <Layers style={{ width: 13, height: 13 }} />
          <span>Status</span>
        </button>

        <button
          type="button"
          id="tab-autopsy"
          onClick={() => switchTab('autopsy')}
          onKeyDown={(e) => handleKeyDown(e, 'autopsy')}
          className={`sb-tab-btn ${activeTab === 'autopsy' ? 'is-active' : ''}`}
          aria-selected={activeTab === 'autopsy'}
          aria-controls="panel-autopsy"
          role="tab"
          tabIndex={activeTab === 'autopsy' ? 0 : -1}
          title="Website Autopsy"
        >
          <Activity style={{ width: 13, height: 13 }} />
          <span>Autopsy</span>
        </button>

        <button
          type="button"
          id="tab-assistant"
          onClick={() => switchTab('assistant')}
          onKeyDown={(e) => handleKeyDown(e, 'assistant')}
          className={`sb-tab-btn ${activeTab === 'assistant' ? 'is-active' : ''}`}
          aria-selected={activeTab === 'assistant'}
          aria-controls="panel-assistant"
          role="tab"
          tabIndex={activeTab === 'assistant' ? 0 : -1}
          title="Privacy Assistant"
        >
          <Terminal style={{ width: 13, height: 13 }} />
          <span>Assistant</span>
        </button>

        <button
          type="button"
          id="tab-events"
          onClick={() => switchTab('events')}
          onKeyDown={(e) => handleKeyDown(e, 'events')}
          className={`sb-tab-btn ${activeTab === 'events' ? 'is-active' : ''}`}
          aria-selected={activeTab === 'events'}
          aria-controls="panel-events"
          role="tab"
          tabIndex={activeTab === 'events' ? 0 : -1}
          title="Security Events"
        >
          <AlertCircle style={{ width: 13, height: 13 }} />
          <span>Events</span>
        </button>

        <button
          type="button"
          id="tab-settings"
          onClick={() => switchTab('settings')}
          onKeyDown={(e) => handleKeyDown(e, 'settings')}
          className={`sb-tab-btn ${activeTab === 'settings' ? 'is-active' : ''}`}
          aria-selected={activeTab === 'settings'}
          aria-controls="panel-settings"
          title="Settings"
          aria-label="Settings"
          role="tab"
          tabIndex={activeTab === 'settings' ? 0 : -1}
        >
          <Settings style={{ width: 13, height: 13 }} />
        </button>
      </nav>

      {/* Main Tab Content Area */}
      <main
        className="flex-1 overflow-y-auto p-3"
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        {activeTab === 'status' && <PrivacyStatus overview={overview} onNavigate={switchTab} />}
        {activeTab === 'autopsy' && (
          <Autopsy initialReport={autopsyReport} onReportChange={setAutopsyReport} />
        )}
        {activeTab === 'assistant' && <Chat overview={overview} autopsy={autopsyReport} />}
        {activeTab === 'events' && <SecurityEventsView />}
        {activeTab === 'settings' && <SettingsView overview={overview} onNavigate={switchTab} />}
      </main>

      {/* Footer Status Bar */}
      <footer
        className="p-2 border-t flex items-center justify-between text-xs text-muted"
        style={{ background: 'var(--sb-bg-surface)' }}
      >
        <div className="flex items-center gap-1-5">
          <StatusDot status={overview?.agent?.online ? 'PROTECTED' : 'FAILED'} size="sm" />
          <span>Local Agent: {overview?.agent?.online ? '127.0.0.1:9152' : 'Offline'}</span>
        </div>
        <span className="mono">ShadowBrowse v0.4.5</span>
      </footer>
    </div>
  );
};
