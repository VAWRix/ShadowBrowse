import React, { useEffect, useState } from 'react';
import { Activity, Terminal, Shield, Wifi, Radio, Lock, HardDrive, Eye, CheckCircle2, ShieldCheck, AlertCircle } from 'lucide-react';
import { SystemPrivacyOverview, UserSettings } from '../shared/types';
import { Header } from '../components/Header';
import { StatusBadge } from '../components/StatusBadge';
import { StatusDot } from '../components/StatusDot';
import { MetricRow } from '../components/MetricRow';
import { PrimarySessionButton } from '../components/PrimarySessionButton';
import { TechnicalDetails } from '../components/TechnicalDetails';

export const Popup: React.FC = () => {
  const [overview, setOverview] = useState<SystemPrivacyOverview | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);

  const fetchOverview = () => {
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
    const interval = setInterval(fetchOverview, 2500);
    return () => clearInterval(interval);
  }, []);

  const handleToggleSession = () => {
    setActionInProgress(true);
    const isProtectedOrDegraded = overview?.state === 'PROTECTED' || overview?.state === 'DEGRADED';
    const messageType = isProtectedOrDegraded
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

  // State calculations with strict technical honesty
  const sessionState = overview?.state ?? null;
  let heroStateDesc = 'Private browsing protection inactive. Browser operates with default telemetry.';
  let heroCardClass = '';
  let highlight1 = 'Standard TCP routing';
  let highlight2 = 'Direct network egress';
  let isPositive = false;

  if (sessionState === 'PROTECTED') {
    heroStateDesc = overview?.network.routeVerified
      ? 'Tor route verified. Egress IP masked; local cookies and session storage isolated.'
      : 'Protected session active. Outbound route verification in progress.';
    heroCardClass = 'is-protected';
    highlight1 = 'Tor route verified';
    highlight2 = 'Egress IP masked';
    isPositive = true;
  } else if (sessionState === 'DEGRADED') {
    heroStateDesc = 'Tor circuit offline or unverified. Local quarantine and client mitigations remain active.';
    heroCardClass = 'is-degraded';
    highlight1 = 'Tor route unverified';
    highlight2 = 'Client shields active';
  } else if (sessionState === 'FAILED') {
    heroStateDesc = 'Protected route could not be verified. External traffic is blocked to prevent leaks.';
    heroCardClass = 'is-failed';
    highlight1 = 'Protected route failed';
    highlight2 = 'External traffic blocked';
  } else if (sessionState === 'STARTING') {
    heroStateDesc = 'Configuring Chromium proxy, isolating storage, and probing Tor circuit...';
    highlight1 = 'Establishing SOCKS5 proxy';
    highlight2 = 'Probing Tor circuit';
  } else if (sessionState === 'STOPPING') {
    heroStateDesc = 'Restoring direct proxy routing and purging quarantined session storage...';
    highlight1 = 'Restoring direct routing';
    highlight2 = 'Purging session storage';
  }

  // Network values
  const isTor = overview?.network.mode === 'TOR';
  const torStatus = overview?.network.torStatus;
  const torLabel = isTor
    ? torStatus === 'CONNECTED'
      ? 'CONNECTED'
      : torStatus === 'BOOTSTRAPPING'
      ? 'BOOTSTRAPPING'
      : 'UNAVAILABLE'
    : overview?.network.mode || 'DIRECT';

  const ipExposureStatus = overview?.network.status || 'UNAVAILABLE';
  const dnsStatus = overview?.network.dnsStatus || 'PARTIAL';

  // Privacy values
  const webrtcStatus = overview?.webRTC.status || 'UNAVAILABLE';
  const storageStatus = overview?.storage.temporarySession ? 'ISOLATED' : 'PERSISTENT';
  const fingerprintStatus = 'DETECTION ONLY'; // Honest classification: detection only

  return (
    <div className="sb-popup-container">
      {/* Brand Header */}
      <Header
        title="SHADOWBROWSE"
        subtitle="Privacy Control Center"
        onToggleSettings={() => setShowSettings(!showSettings)}
        showSettings={showSettings}
      />

      {/* Quick Settings Drawer */}
      {showSettings && settings && (
        <div className="my-2 p-2-5 border rounded-md" style={{ background: 'var(--sb-bg-surface)' }}>
          <div className="flex items-center justify-between pb-1-5 border-b mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-secondary">
              Quick Configuration
            </span>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="text-xs font-semibold text-accent"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Done
            </button>
          </div>

          <div className="flex flex-col gap-2 text-xs">
            <label className="flex items-center justify-between cursor-pointer py-1">
              <span className="text-secondary">Fail-Closed Kill Switch</span>
              <input
                type="checkbox"
                checked={settings.killSwitchEnabled}
                onChange={(e) => handleUpdateSetting('killSwitchEnabled', e.target.checked)}
                style={{ accentColor: 'var(--sb-accent-primary)' }}
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer py-1">
              <span className="text-secondary">Storage Isolation</span>
              <input
                type="checkbox"
                checked={settings.storageIsolationEnabled}
                onChange={(e) => handleUpdateSetting('storageIsolationEnabled', e.target.checked)}
                style={{ accentColor: 'var(--sb-accent-primary)' }}
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer py-1">
              <span className="text-secondary">Fingerprint Defense</span>
              <input
                type="checkbox"
                checked={settings.fingerprintProtectionEnabled}
                onChange={(e) => handleUpdateSetting('fingerprintProtectionEnabled', e.target.checked)}
                style={{ accentColor: 'var(--sb-accent-primary)' }}
              />
            </label>

            <div className="flex items-center justify-between pt-1 border-t text-muted font-mono">
              <span>Agent Port</span>
              <span className="text-primary font-semibold">{settings.agentPort || 9152}</span>
            </div>
          </div>
        </div>
      )}

      {/* Primary Session Hero Card */}
      <section className={`sb-hero-card ${heroCardClass}`.trim()} aria-label="Session Overview">
        <div className="sb-hero-header">
          <span className="sb-hero-kicker">PRIVATE SESSION</span>
          <div className="sb-hero-state-badge-wrap">
            <StatusDot status={sessionState || 'OFF'} size="md" />
            <span className="sb-hero-state-text">{sessionState || 'OFF'}</span>
          </div>
        </div>

        <div className="sb-hero-highlights">
          <div className="sb-hero-highlight-row">
            {isPositive ? (
              <CheckCircle2 style={{ width: 13, height: 13, color: '#34d399', flexShrink: 0 }} />
            ) : (
              <AlertCircle style={{ width: 13, height: 13, color: 'var(--sb-text-muted)', flexShrink: 0 }} />
            )}
            <span>{highlight1}</span>
          </div>
          <div className="sb-hero-highlight-row">
            {isPositive ? (
              <ShieldCheck style={{ width: 13, height: 13, color: '#34d399', flexShrink: 0 }} />
            ) : (
              <Shield style={{ width: 13, height: 13, color: 'var(--sb-text-muted)', flexShrink: 0 }} />
            )}
            <span>{highlight2}</span>
          </div>
        </div>

        <p className="sb-hero-desc">{heroStateDesc}</p>

        {/* Primary Action Button */}
        <div className="mt-1">
          <PrimarySessionButton
            state={sessionState}
            actionInProgress={actionInProgress}
            onToggle={handleToggleSession}
          />
        </div>
      </section>

      {/* Network & Routing Card */}
      <section className="sb-card mb-2" aria-label="Network Status">
        <div className="sb-section-header">
          <span className="flex items-center gap-1-5">
            <Wifi style={{ width: 13, height: 13 }} />
            <span>Network Routing</span>
          </span>
          <span className="mono text-muted">{overview?.network.mode || 'DIRECT'}</span>
        </div>

        <div className="flex flex-col gap-1">
          <MetricRow label="Tor Circuit" icon={<Radio style={{ width: 13, height: 13 }} />}>
            <StatusBadge
              level={torLabel === 'CONNECTED' ? 'PROTECTED' : torLabel === 'BOOTSTRAPPING' ? 'PARTIAL' : 'FAILED'}
              label={torLabel}
            />
          </MetricRow>

          <MetricRow label="IP Exposure" icon={<Shield style={{ width: 13, height: 13 }} />}>
            <StatusBadge level={ipExposureStatus} />
          </MetricRow>

          <MetricRow label="DNS Resolution" icon={<Radio style={{ width: 13, height: 13 }} />}>
            <StatusBadge level={dnsStatus} label={dnsStatus === 'PARTIALLY_PROTECTED' ? 'PARTIAL' : dnsStatus} />
          </MetricRow>
        </div>
      </section>

      {/* Privacy Protections Card */}
      <section className="sb-card mb-2" aria-label="Privacy Protections">
        <div className="sb-section-header">
          <span className="flex items-center gap-1-5">
            <Lock style={{ width: 13, height: 13 }} />
            <span>Privacy Controls</span>
          </span>
          <span className="mono text-muted">Client Shields</span>
        </div>

        <div className="flex flex-col gap-1">
          <MetricRow label="WebRTC Protection" icon={<Lock style={{ width: 13, height: 13 }} />}>
            <StatusBadge level={webrtcStatus} />
          </MetricRow>

          <MetricRow label="Storage Isolation" icon={<HardDrive style={{ width: 13, height: 13 }} />}>
            <StatusBadge
              level={overview?.storage.temporarySession ? 'PROTECTED' : 'UNAVAILABLE'}
              label={storageStatus}
            />
          </MetricRow>

          <MetricRow label="Fingerprint" icon={<Eye style={{ width: 13, height: 13 }} />}>
            <StatusBadge level="DETECTION_ONLY" label={fingerprintStatus} />
          </MetricRow>
        </div>
      </section>

      {/* Technical Diagnostics Collapsible Drawer */}
      <div className="mb-2">
        <TechnicalDetails overview={overview} />
      </div>

      {/* Companion Actions: Balanced & Intentional */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <button
          type="button"
          onClick={handleOpenSidePanel}
          className="sb-companion-btn"
          title="Open Website Autopsy Deep Inspection in Side Panel"
        >
          <Activity style={{ width: 13, height: 13, color: 'var(--sb-accent-hover)' }} />
          <span>SITE AUTOPSY</span>
        </button>

        <button
          type="button"
          onClick={handleOpenSidePanel}
          className="sb-companion-btn"
          title="Open Local Privacy Assistant in Side Panel"
        >
          <Terminal style={{ width: 13, height: 13, color: 'var(--sb-accent-hover)' }} />
          <span>ASSISTANT</span>
        </button>
      </div>

      {/* Agent & Footer */}
      <footer className="sb-footer">
        <div className="sb-agent-status">
          <StatusDot status={overview?.agent.online ? 'PROTECTED' : 'FAILED'} size="sm" />
          <span>
            Shadow Agent:{' '}
            <strong className="text-secondary font-mono">
              {overview?.agent.online ? '127.0.0.1:9152' : 'OFFLINE'}
            </strong>
          </span>
        </div>
        <span className="mono text-muted">v0.4.5</span>
      </footer>
    </div>
  );
};
