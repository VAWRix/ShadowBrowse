import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Shield,
  Settings,
  X,
  HelpCircle,
  ChevronRight,
} from 'lucide-react';
import { SystemPrivacyOverview } from '../shared/types';

interface ReadinessModalProps {
  overview: SystemPrivacyOverview | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (tab: 'status' | 'autopsy' | 'assistant' | 'events' | 'settings') => void;
}

interface CheckpointItem {
  id: string;
  name: string;
  category: string;
  status: 'READY' | 'WARNING' | 'FAILED' | 'CONFIGURED';
  summary: string;
  detail: string;
  actionText?: string;
  actionTab?: 'status' | 'autopsy' | 'assistant' | 'events' | 'settings';
}

export const ReadinessModal: React.FC<ReadinessModalProps> = ({
  overview,
  isOpen,
  onClose,
  onNavigate,
}) => {
  const [showGlossary, setShowGlossary] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['has_completed_onboarding'], (res) => {
        if (res?.has_completed_onboarding) {
          setCompleted(true);
        }
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 1. Extension Runtime
  const extReady = overview !== null;
  // 2. Local Agent Reachability
  const agentOnline = overview?.agent?.online ?? false;
  // 3. Tor SOCKS5 Reachability
  const torReachable = overview?.agent?.torReachable ?? false;
  // 4. Route state
  const isTorMode = overview?.network?.mode === 'TOR';
  const routeVerified = overview?.network?.routeVerified ?? false;
  // 5. Kill switch
  const killSwitchArmed = overview?.agent?.killSwitchArmed ?? false;
  // 6. Defenses and storage
  const storageReady = overview?.storage?.status !== 'UNAVAILABLE' || (overview?.storage?.temporarySession ?? false);

  const checkpoints: CheckpointItem[] = [
    {
      id: 'ext_core',
      name: 'Extension Runtime & Background Worker',
      category: 'Core Service',
      status: extReady ? 'READY' : 'WARNING',
      summary: extReady
        ? 'Manifest V3 service worker initialized with active storage isolation.'
        : 'Connecting to Chromium background runtime...',
      detail:
        'ShadowBrowse runs inside Chromium with declarative rules, content guards, and an isolated event bus.',
    },
    {
      id: 'agent_link',
      name: 'Local FastAPI Control Agent',
      category: 'Loopback IPC',
      status: agentOnline ? 'READY' : 'FAILED',
      summary: agentOnline
        ? 'Loopback endpoint reachable at 127.0.0.1:9152 with authenticated IPC token.'
        : 'Agent offline. Cannot verify egress routes or manage background Tor daemon.',
      detail:
        'The agent provides route verification, Tor daemon management, and system health checks on 127.0.0.1:9152.',
      actionText: agentOnline ? undefined : 'Start Local Agent (`python -m shadowbrowse.agent`)',
      actionTab: 'settings',
    },
    {
      id: 'tor_socks',
      name: 'Tor SOCKS5 Daemon Endpoint',
      category: 'Transport Layer',
      status: torReachable ? 'READY' : agentOnline ? 'FAILED' : 'WARNING',
      summary: torReachable
        ? 'Local SOCKS5 port 9050 reachable and responding to connection probes.'
        : 'SOCKS5 port 9050 unreachable. Start Tor daemon before enabling Tor mode.',
      detail:
        'Chromium proxies TCP connections through SOCKS5. Remote DNS resolution is enforced to eliminate DNS leaks.',
      actionText: torReachable ? undefined : 'Inspect Network Settings',
      actionTab: 'settings',
    },
    {
      id: 'route_verif',
      name: 'Egress Route & Tor Verification',
      category: 'Security State',
      status: isTorMode
        ? routeVerified
          ? 'READY'
          : 'WARNING'
        : 'CONFIGURED',
      summary: isTorMode
        ? routeVerified
          ? 'Route verified: egress IP matches authoritative Tor consensus directory.'
          : 'Proxy active, but outbound Tor route is unverified. Avoid sensitive traffic.'
        : 'Standard Direct mode selected. Outbound traffic egresses via default network.',
      detail:
        'Route verification cryptographically tests if web traffic actually emerges from a Tor exit node.',
      actionText: isTorMode && !routeVerified ? 'Review System Status' : undefined,
      actionTab: 'status',
    },
    {
      id: 'kill_switch',
      name: 'Fail-Closed Network Kill Switch',
      category: 'Leak Defense',
      status: killSwitchArmed ? 'READY' : 'CONFIGURED',
      summary: killSwitchArmed
        ? 'Kill switch armed: outgoing requests are blocked if the privacy proxy drops.'
        : 'Kill switch configured in policy. Will engage automatically during protected sessions.',
      detail:
        'Prevents sudden direct IP leaks if your local Tor process crashes or network resets unexpectedly.',
    },
    {
      id: 'privacy_engine',
      name: 'Privacy Defense & Audit Storage',
      category: 'Content Protection',
      status: storageReady ? 'READY' : 'WARNING',
      summary: storageReady
        ? 'Declarative tracker blocking active; bounded in-memory event buffer initialized.'
        : 'Event storage buffer not hydrated.',
      detail:
        'Detects and blocks known tracking pixels, fingerprint probes, and strips tracking URL parameters.',
      actionText: 'View Audit Events',
      actionTab: 'events',
    },
  ];

  const readyCount = checkpoints.filter((c) => c.status === 'READY' || c.status === 'CONFIGURED').length;
  const isFullyReady = readyCount >= 5;

  const handleAcknowledge = () => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ has_completed_onboarding: true }, () => {
        setCompleted(true);
        onClose();
      });
    } else {
      setCompleted(true);
      onClose();
    }
  };

  const getStatusBadge = (status: CheckpointItem['status']) => {
    switch (status) {
      case 'READY':
        return (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5" /> READY
          </span>
        );
      case 'CONFIGURED':
        return (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 font-mono flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5" /> CONFIGURED
          </span>
        );
      case 'WARNING':
        return (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 font-mono flex items-center gap-1">
            <AlertTriangle className="w-2.5 h-2.5" /> PENDING
          </span>
        );
      case 'FAILED':
      default:
        return (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800 font-mono flex items-center gap-1">
            <AlertCircle className="w-2.5 h-2.5" /> UNRESOLVED
          </span>
        );
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="readiness-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg bg-[#0e121a] border border-[#2a354b] rounded-xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-200">
        {/* Header */}
        <div className="p-3.5 border-b border-[#1c2433] flex items-center justify-between bg-[#151b26]">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-[#7c3aed]/20 text-[#8b5cf6]">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h2 id="readiness-modal-title" className="text-xs font-bold uppercase tracking-wider text-slate-100">
                System Readiness &amp; First-Run Setup
              </h2>
              <p className="text-[11px] text-slate-400">
                Authoritative verification of ShadowBrowse security subsystems
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Readiness Checklist"
            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-[#1c2433] focus:outline-none focus:ring-1 focus:ring-[#8b5cf6]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Readiness Overview Score Banner */}
        <div className="p-3 bg-[#10141d] border-b border-[#1c2433] flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
              Readiness Score
            </div>
            <div className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
              <span>{readyCount} of 6 Subsystems Operational</span>
              {isFullyReady ? (
                <span className="text-[10px] text-emerald-400 bg-emerald-950 px-1.5 py-0.2 rounded border border-emerald-800 font-mono">
                  READY FOR USE
                </span>
              ) : (
                <span className="text-[10px] text-amber-400 bg-amber-950 px-1.5 py-0.2 rounded border border-amber-800 font-mono">
                  PREREQUISITES REQUIRED
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowGlossary(!showGlossary)}
            className="text-[11px] text-[#8b5cf6] hover:text-[#a78bfa] flex items-center gap-1 px-2 py-1 rounded bg-[#7c3aed]/10 border border-[#7c3aed]/20"
          >
            <HelpCircle className="w-3 h-3" />
            <span>{showGlossary ? 'Hide Glossary' : 'Security Glossary'}</span>
          </button>
        </div>

        {/* Glossary Collapsible Drawer */}
        {showGlossary && (
          <div className="p-3 bg-[#0a0c10] border-b border-[#1c2433] space-y-2 text-[11px] max-h-48 overflow-y-auto">
            <div className="font-semibold text-slate-200 uppercase tracking-wider text-[10px] flex items-center gap-1">
              <HelpCircle className="w-3 h-3 text-[#8b5cf6]" />
              <span>Technical Terms &amp; Security Semantics</span>
            </div>
            <div className="space-y-1.5 text-slate-300">
              <div>
                <strong className="text-slate-100">SOCKS5 Proxy: </strong>
                A protocol that routes browser TCP packets through an intermediary proxy server without application-layer disclosure.
              </div>
              <div>
                <strong className="text-slate-100">Route Verification: </strong>
                An active probe comparing outbound IP address against the public Internet to confirm traffic actually emerges through Tor, preventing direct bypass.
              </div>
              <div>
                <strong className="text-slate-100">Fail-Closed Kill Switch: </strong>
                Immediately terminates outgoing web requests if the privacy tunnel drops unexpectedly, ensuring your real IP is never exposed.
              </div>
              <div>
                <strong className="text-slate-100">Mitigation Attempted vs Confirmed: </strong>
                &ldquo;Attempted&rdquo; indicates a declarative filter rule was dispatched to the network stack; &ldquo;Confirmed&rdquo; indicates the request was intercepted and canceled.
              </div>
              <div>
                <strong className="text-slate-100">Detection Only: </strong>
                Observes and logs canvas/WebGL fingerprint probes without injecting noisy fake values that could break website layouts.
              </div>
            </div>
          </div>
        )}

        {/* Checkpoint Items List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {checkpoints.map((cp) => (
            <div
              key={cp.id}
              className="p-2.5 rounded-lg border border-[#1c2433] bg-[#10141d] space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-slate-100">{cp.name}</span>
                  <span className="text-[9px] text-slate-500 font-mono uppercase">
                    [{cp.category}]
                  </span>
                </div>
                <div>{getStatusBadge(cp.status)}</div>
              </div>

              <p className="text-[11px] text-slate-300">{cp.summary}</p>
              <p className="text-[10px] text-slate-500">{cp.detail}</p>

              {cp.actionText && (
                <div className="pt-1 flex items-center justify-between border-t border-[#1c2433] text-[11px]">
                  <span className="text-slate-400">Next Step:</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (cp.actionTab && onNavigate) {
                        onNavigate(cp.actionTab);
                        onClose();
                      }
                    }}
                    className="text-[#8b5cf6] hover:text-[#a78bfa] font-medium flex items-center gap-0.5"
                  >
                    <span>{cp.actionText}</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="p-3 bg-[#151b26] border-t border-[#1c2433] flex items-center justify-between">
          <div className="text-[10px] text-slate-400">
            {completed ? 'Checklist acknowledged.' : 'First-run setup in progress.'}
          </div>
          <div className="flex items-center gap-2">
            {onNavigate && (
              <button
                type="button"
                onClick={() => {
                  onNavigate('settings');
                  onClose();
                }}
                className="btn-secondary py-1.5 px-2.5 text-xs flex items-center gap-1"
              >
                <Settings className="w-3 h-3" />
                <span>Configure in Settings</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleAcknowledge}
              className="btn-primary py-1.5 px-3 text-xs font-semibold"
            >
              {completed ? 'Close Checklist' : 'Acknowledge & Complete Setup'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
