import React, { useState } from 'react';
import { Wifi, Radio, Lock, HardDrive, Eye, Shield, CheckCircle2, ShieldCheck, AlertCircle } from 'lucide-react';
import { SystemPrivacyOverview } from '../shared/types';
import { StatusBadge } from '../components/StatusBadge';
import { StatusDot } from '../components/StatusDot';
import { MetricRow } from '../components/MetricRow';
import { PrimarySessionButton } from '../components/PrimarySessionButton';
import { TechnicalDetails } from '../components/TechnicalDetails';

interface PrivacyStatusProps {
  overview: SystemPrivacyOverview | null;
}

export const PrivacyStatus: React.FC<PrivacyStatusProps> = ({ overview }) => {
  const [actionInProgress, setActionInProgress] = useState(false);

  const isProtected = overview?.state === 'PROTECTED';
  const isDegraded = overview?.state === 'DEGRADED';
  const isFailed = overview?.state === 'FAILED';

  const handleToggleSession = () => {
    setActionInProgress(true);
    const messageType = isProtected || isDegraded
      ? 'END_ANONYMOUS_SESSION'
      : 'START_ANONYMOUS_SESSION';

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: messageType }, () => {
        setActionInProgress(false);
      });
    } else {
      setActionInProgress(false);
    }
  };

  let heroClass = '';
  let stateDesc = 'Standard browser operation. Web traffic egresses directly with standard headers and identifiers.';
  let highlight1 = 'Standard TCP routing';
  let highlight2 = 'Direct network egress';
  let isPositive = false;

  if (isProtected) {
    heroClass = 'is-protected';
    stateDesc = overview?.network.routeVerified
      ? 'All configured privacy layers are verified. Chromium TCP traffic is routed through encrypted Tor nodes with remote DNS and isolated storage.'
      : 'Session active. SOCKS5 proxy applied; outbound route verification actively running.';
    highlight1 = 'Tor route verified';
    highlight2 = 'Egress IP masked';
    isPositive = true;
  } else if (isDegraded) {
    heroClass = 'is-degraded';
    stateDesc = 'Network routing through Tor is degraded or offline. In-memory storage isolation and client-side mitigations remain engaged.';
    highlight1 = 'Tor circuit unverified';
    highlight2 = 'Client shields active';
  } else if (isFailed) {
    heroClass = 'is-failed';
    stateDesc = 'Fail-closed kill switch is active. External traffic is blocked to prevent accidental IP or DNS leakage.';
    highlight1 = 'Protected route failed';
    highlight2 = 'External traffic blocked';
  }

  const torLabel = overview?.network.mode === 'TOR'
    ? overview.network.torStatus === 'CONNECTED'
      ? 'CONNECTED'
      : overview.network.torStatus === 'BOOTSTRAPPING'
      ? 'BOOTSTRAPPING'
      : 'UNAVAILABLE'
    : overview?.network.mode || 'DIRECT';

  return (
    <div className="flex flex-col gap-3">
      {/* System State Hero Card */}
      <section className={`sb-hero-card ${heroClass}`.trim()} aria-label="System Overview">
        <div className="sb-hero-header">
          <span className="sb-hero-kicker">PRIVATE SESSION</span>
          <div className="sb-hero-state-badge-wrap">
            <StatusDot status={overview?.state || 'OFF'} size="md" />
            <span className="sb-hero-state-text">{overview?.state || 'OFF'}</span>
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

        <p className="sb-hero-desc">{stateDesc}</p>

        {overview?.activeSession && (
          <div className="pt-2 border-t flex items-center justify-between text-xs text-muted font-mono">
            <span>Session ID:</span>
            <span className="text-secondary font-semibold">
              {overview.activeSession.sessionId.substring(0, 16)}...
            </span>
          </div>
        )}

        <div className="mt-1">
          <PrimarySessionButton
            state={overview?.state ?? null}
            actionInProgress={actionInProgress}
            onToggle={handleToggleSession}
          />
        </div>
      </section>

      {/* Network Anonymity Matrix */}
      <section className="sb-card">
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
            <StatusBadge level={overview?.network.status || 'UNAVAILABLE'} />
          </MetricRow>

          <MetricRow label="DNS Resolution" icon={<Radio style={{ width: 13, height: 13 }} />}>
            <StatusBadge
              level={overview?.network.dnsStatus || 'PARTIAL'}
              label={overview?.network.dnsStatus === 'PARTIALLY_PROTECTED' ? 'PARTIAL' : overview?.network.dnsStatus}
            />
          </MetricRow>
        </div>
      </section>

      {/* Client Shield Matrix */}
      <section className="sb-card">
        <div className="sb-section-header">
          <span className="flex items-center gap-1-5">
            <Lock style={{ width: 13, height: 13 }} />
            <span>Privacy Controls</span>
          </span>
          <span className="mono text-muted">Client Shields</span>
        </div>

        <div className="flex flex-col gap-1">
          <MetricRow label="WebRTC Protection" icon={<Lock style={{ width: 13, height: 13 }} />}>
            <StatusBadge level={overview?.webRTC.status || 'UNAVAILABLE'} />
          </MetricRow>

          <MetricRow label="Storage Isolation" icon={<HardDrive style={{ width: 13, height: 13 }} />}>
            <StatusBadge
              level={overview?.storage.temporarySession ? 'PROTECTED' : 'UNAVAILABLE'}
              label={overview?.storage.temporarySession ? 'ISOLATED' : 'PERSISTENT'}
            />
          </MetricRow>

          <MetricRow label="Fingerprint" icon={<Eye style={{ width: 13, height: 13 }} />}>
            <StatusBadge level="DETECTION_ONLY" label="DETECTION ONLY" />
          </MetricRow>
        </div>
      </section>

      {/* Technical Diagnostics */}
      <TechnicalDetails overview={overview} />
    </div>
  );
};
