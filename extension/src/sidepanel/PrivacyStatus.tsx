import React from 'react';
import { Lock, Eye, HardDrive, Wifi, Radio, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { SystemPrivacyOverview } from '../shared/types';

interface PrivacyStatusProps {
  overview: SystemPrivacyOverview | null;
}

export const PrivacyStatus: React.FC<PrivacyStatusProps> = ({ overview }) => {
  const isProtected = overview?.state === 'PROTECTED';
  const isDegraded = overview?.state === 'DEGRADED';

  const getStatusIcon = (level?: string) => {
    switch (level) {
      case 'PROTECTED':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
      case 'PARTIALLY_PROTECTED':
      case 'WARNING':
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
      default:
        return <XCircle className="w-4 h-4 text-slate-500 shrink-0" />;
    }
  };

  return (
    <div className="space-y-3 text-xs">
      <div className="p-3 bg-[#10141d] border border-[#1f2737] rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            System State
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className={`status-dot ${
                isProtected
                  ? 'status-dot-active'
                  : isDegraded
                  ? 'status-dot-warning'
                  : 'status-dot-inactive'
              }`}
            />
            <span className="mono font-bold text-slate-200">{overview?.state || 'OFF'}</span>
          </div>
        </div>
        <p className="text-[11px] text-slate-400">
          {isProtected
            ? 'All configured privacy layers are verified and actively protecting your browsing session.'
            : isDegraded
            ? 'One or more privacy layers (such as Tor network routing) are offline. Client-side mitigations remain active.'
            : 'Session is inactive. The browser operates in standard mode with standard telemetry.'}
        </p>
      </div>

      {/* Layer Cards */}
      <div className="space-y-2">
        {/* Network Anonymity */}
        <div className="p-3 bg-[#10141d] border border-[#1f2737] rounded-lg flex items-start gap-2.5">
          <Wifi className="w-4 h-4 text-[#8b5cf6] mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200">Network Anonymity</span>
              {getStatusIcon(overview?.network.status)}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Routing: <span className="mono text-slate-300">{overview?.network.mode}</span> | Tor:{' '}
              <span className="mono text-slate-300">{overview?.network.torStatus}</span>
            </p>
          </div>
        </div>

        {/* DNS Leak Protection */}
        <div className="p-3 bg-[#10141d] border border-[#1f2737] rounded-lg flex items-start gap-2.5">
          <Radio className="w-4 h-4 text-[#8b5cf6] mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200">DNS Resolution</span>
              {getStatusIcon(overview?.network.dnsStatus)}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Domain lookups routed through SOCKS5 proxy to eliminate local ISP DNS queries.
            </p>
          </div>
        </div>

        {/* Storage Isolation */}
        <div className="p-3 bg-[#10141d] border border-[#1f2737] rounded-lg flex items-start gap-2.5">
          <HardDrive className="w-4 h-4 text-[#8b5cf6] mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200">Storage Partitioning</span>
              {getStatusIcon(overview?.storage.status)}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Temporary cookies, cache, and IndexedDB state are quarantined and purged upon session termination.
            </p>
          </div>
        </div>

        {/* Fingerprint Defense */}
        <div className="p-3 bg-[#10141d] border border-[#1f2737] rounded-lg flex items-start gap-2.5">
          <Eye className="w-4 h-4 text-[#8b5cf6] mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200">Fingerprint Defense</span>
              {getStatusIcon(overview?.fingerprint.status)}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Exposure Level: <span className="mono font-semibold text-slate-300">{overview?.fingerprint.exposure}</span>. Canvas, WebGL and Audio probes are normalized.
            </p>
          </div>
        </div>

        {/* WebRTC Shield */}
        <div className="p-3 bg-[#10141d] border border-[#1f2737] rounded-lg flex items-start gap-2.5">
          <Lock className="w-4 h-4 text-[#8b5cf6] mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200">WebRTC Leak Shield</span>
              {getStatusIcon(overview?.webRTC.status)}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Non-proxied UDP traffic disabled via Chrome privacy API to prevent LAN IP exposure.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
