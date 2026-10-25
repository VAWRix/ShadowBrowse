import React, { useState, useEffect, useMemo } from 'react';
import {
  Wifi,
  Radio,
  Lock,
  HardDrive,
  Eye,
  Shield,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  Activity,
  Settings,
  FileText,
} from 'lucide-react';
import { SystemPrivacyOverview, PrivacyEvent } from '../shared/types';
import { StatusBadge } from '../components/StatusBadge';
import { StatusDot } from '../components/StatusDot';
import { MetricRow } from '../components/MetricRow';
import { PrimarySessionButton } from '../components/PrimarySessionButton';
import { TechnicalDetails } from '../components/TechnicalDetails';
import {
  evaluateSystemHealth,
  SystemHealthAssessment,
  HEALTH_DASHBOARD_DISCLAIMER,
} from '../shared/diagnosticsRecovery';
import { calculatePrivacyRisk } from '../shared/riskEngine';

interface PrivacyStatusProps {
  overview: SystemPrivacyOverview | null;
  onNavigate?: (tab: 'status' | 'autopsy' | 'assistant' | 'events' | 'settings') => void;
}

export const PrivacyStatus: React.FC<PrivacyStatusProps> = ({ overview, onNavigate }) => {
  const [actionInProgress, setActionInProgress] = useState(false);
  const [events, setEvents] = useState<PrivacyEvent[]>([]);
  const [storageStats, setStorageStats] = useState<{ memoryEvents: number; isHydrated: boolean } | null>(null);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'GET_PRIVACY_EVENTS', payload: { limit: 50 } }, (res) => {
        if (res?.success && Array.isArray(res.data)) {
          setEvents(res.data as PrivacyEvent[]);
        }
      });
      chrome.runtime.sendMessage({ type: 'GET_STORAGE_STATUS' }, (res) => {
        if (res?.success && res.data) {
          setStorageStats(res.data);
        }
      });
    }
  }, [overview]);

  // Evaluate authoritative system health (Phase 6B & 6C)
  const healthAssessment: SystemHealthAssessment = useMemo(() => {
    return evaluateSystemHealth(overview, events, storageStats);
  }, [overview, events, storageStats]);

  const riskAssessment = useMemo(() => {
    return calculatePrivacyRisk(events);
  }, [events]);

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

      {/* Subsystem Health Dashboard (Phase 6B) */}
      <section className="p-3 bg-[#10141d] border border-[#1f2737] rounded-lg space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-[#8b5cf6]" />
            Subsystem Health Matrix
          </span>
          <span
            className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-semibold ${
              healthAssessment.overallStatus === 'HEALTHY'
                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                : healthAssessment.overallStatus === 'DEGRADED'
                ? 'bg-amber-950 text-amber-400 border border-amber-800'
                : 'bg-rose-950 text-rose-400 border border-rose-800'
            }`}
          >
            SYSTEM {healthAssessment.overallStatus}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          {healthAssessment.subsystems.map((sub, i) => (
            <div key={i} className="bg-[#0a0c10] p-2 rounded border border-[#1f2737] space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-slate-300 truncate pr-1">
                  {sub.displayName}
                </span>
                <span
                  className={`text-[8px] font-mono px-1 py-0.2 rounded font-semibold ${
                    sub.status === 'ACTIVE'
                      ? 'text-emerald-400'
                      : sub.status === 'DEGRADED'
                      ? 'text-amber-400'
                      : sub.status === 'FAILED'
                      ? 'text-rose-400'
                      : 'text-slate-400'
                  }`}
                >
                  {sub.status}
                </span>
              </div>
              <div className="text-[9px] text-slate-400 truncate">{sub.summary}</div>
            </div>
          ))}
        </div>

        {/* Live Exposure Quick Score */}
        <div className="flex items-center justify-between pt-1 border-t border-[#1a2233] text-[10px]">
          <span className="text-slate-400">Current Session Exposure:</span>
          <span className="mono font-semibold text-slate-200">
            {riskAssessment.score} / 100 ({riskAssessment.level})
          </span>
        </div>
      </section>

      {/* Diagnostics and Recovery Guidance (Phase 6C) */}
      {healthAssessment.issues.length > 0 && (
        <section className="p-3 bg-[#141018] border border-amber-900/50 rounded-lg space-y-2">
          <div className="flex items-center gap-1.5 text-amber-400 text-[11px] font-bold uppercase tracking-wider">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Active Diagnostics &amp; Recovery ({healthAssessment.issues.length})</span>
          </div>

          <div className="space-y-2">
            {healthAssessment.issues.map((issue) => (
              <div
                key={issue.id}
                className="bg-[#0e0c14] p-2.5 rounded border border-[#2e2338] text-[10px] space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">{issue.title}</span>
                  <span className="mono text-[8px] px-1 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-900">
                    {issue.category}
                  </span>
                </div>
                <p className="text-slate-300">{issue.explanation}</p>
                <div className="text-[#8b5cf6] font-medium pt-0.5">
                  Action: <span className="text-slate-200">{issue.recoveryAction}</span>
                </div>
                <div className="mono text-[9px] text-slate-500 pt-0.5 truncate">
                  ref: {issue.technicalDetail}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Quick Navigation Action Shortcuts (Phase 6D) */}
      {onNavigate && (
        <section className="grid grid-cols-3 gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={() => onNavigate('events')}
            className="btn-secondary py-1.5 px-2 text-[10px] flex items-center justify-center gap-1 hover:border-[#8b5cf6]/50"
          >
            <FileText className="w-3 h-3 text-[#8b5cf6]" />
            <span>Audit Events</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('autopsy')}
            className="btn-secondary py-1.5 px-2 text-[10px] flex items-center justify-center gap-1 hover:border-[#8b5cf6]/50"
          >
            <Eye className="w-3 h-3 text-[#8b5cf6]" />
            <span>Autopsy</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="btn-secondary py-1.5 px-2 text-[10px] flex items-center justify-center gap-1 hover:border-[#8b5cf6]/50"
          >
            <Settings className="w-3 h-3 text-[#8b5cf6]" />
            <span>Settings</span>
          </button>
        </section>
      )}

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

      <div className="text-[9px] text-slate-500 italic p-2 bg-[#0a0c10] rounded border border-[#1a2233]">
        {HEALTH_DASHBOARD_DISCLAIMER}
      </div>
    </div>
  );
};
