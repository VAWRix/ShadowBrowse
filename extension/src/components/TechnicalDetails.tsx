import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Terminal } from 'lucide-react';
import { SystemPrivacyOverview } from '../shared/types';

interface TechnicalDetailsProps {
  overview: SystemPrivacyOverview | null;
}

export const TechnicalDetails: React.FC<TechnicalDetailsProps> = ({ overview }) => {
  const [isOpen, setIsOpen] = useState(false);

  const verification = overview?.agent?.routeVerification;
  const torSocksPort = overview?.agent?.torSocksPort || 9050;
  const isTor = overview?.network.mode === 'TOR';
  const providerType =
    overview?.agent?.torProviderType || (isTor ? 'SYSTEM_TOR' : 'UNAVAILABLE');
  const bootstrapPct =
    overview?.agent?.torBootstrapPercent ??
    (overview?.network.torStatus === 'CONNECTED' ? 100 : 0);

  const browserProbeStatus =
    verification?.browserRouteStatus === 'BROWSER_ROUTE_VERIFIED'
      ? 'PASSED'
      : verification?.browserRouteStatus === 'BROWSER_ROUTE_FAILED'
      ? 'FAILED'
      : 'UNVERIFIED';

  const routeStatusLabel = overview?.network.routeVerified
    ? 'CONFIRMED TOR'
    : verification?.agentRouteStatus === 'ROUTE_VERIFIED_TOR_UNVERIFIED'
    ? 'GENERIC SOCKS5'
    : 'UNVERIFIED';

  const dnsClassification = overview?.network.dnsStatus || 'PARTIAL';
  const webrtcPolicy = overview?.webRTC.policy || 'default';
  const storageCleanup = overview?.storage.cleanupVerified
    ? 'VERIFIED'
    : overview?.storage.temporarySession
    ? 'ISOLATED (ACTIVE)'
    : 'IDLE';

  const sessionId = overview?.activeSession?.sessionId
    ? `${overview.activeSession.sessionId.substring(0, 12)}...`
    : 'NONE';

  const agentEndpoint = overview?.agent.online ? '127.0.0.1:9152' : 'OFFLINE';

  return (
    <div className="w-full">
      <button
        type="button"
        className="sb-details-summary w-full"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-1-5">
          <Terminal style={{ width: 13, height: 13, color: 'var(--sb-accent-hover)' }} />
          <span>Technical Diagnostics</span>
        </span>
        {isOpen ? (
          <ChevronUp style={{ width: 13, height: 13 }} />
        ) : (
          <ChevronDown style={{ width: 13, height: 13 }} />
        )}
      </button>

      {isOpen && (
        <div className="sb-details-content">
          {/* TOR GROUP */}
          <div className="sb-details-group">
            <span className="sb-details-group-title">TOR</span>
            <div className="sb-details-row">
              <span className="sb-details-key">Provider</span>
              <span className="sb-details-val">{providerType}</span>
            </div>
            <div className="sb-details-row">
              <span className="sb-details-key">SOCKS5 Endpoint</span>
              <span className="sb-details-val">127.0.0.1:{torSocksPort}</span>
            </div>
            <div className="sb-details-row">
              <span className="sb-details-key">Bootstrap</span>
              <span className="sb-details-val">{bootstrapPct}%</span>
            </div>
          </div>

          {/* ROUTE GROUP */}
          <div className="sb-details-group">
            <span className="sb-details-group-title">ROUTE</span>
            <div className="sb-details-row">
              <span className="sb-details-key">Route Verification</span>
              <span className="sb-details-val text-primary">{routeStatusLabel}</span>
            </div>
            <div className="sb-details-row">
              <span className="sb-details-key">Browser Probe</span>
              <span className="sb-details-val">{browserProbeStatus}</span>
            </div>
          </div>

          {/* PRIVACY GROUP */}
          <div className="sb-details-group">
            <span className="sb-details-group-title">PRIVACY</span>
            <div className="sb-details-row">
              <span className="sb-details-key">DNS Classification</span>
              <span className="sb-details-val">{dnsClassification}</span>
            </div>
            <div className="sb-details-row">
              <span className="sb-details-key">WebRTC Policy</span>
              <span className="sb-details-val">{webrtcPolicy}</span>
            </div>
            <div className="sb-details-row">
              <span className="sb-details-key">Storage Cleanup</span>
              <span className="sb-details-val">{storageCleanup}</span>
            </div>
          </div>

          {/* SESSION GROUP */}
          <div className="sb-details-group">
            <span className="sb-details-group-title">SESSION</span>
            <div className="sb-details-row">
              <span className="sb-details-key">Session ID</span>
              <span className="sb-details-val font-mono">{sessionId}</span>
            </div>
          </div>

          {/* AGENT GROUP */}
          <div className="sb-details-group">
            <span className="sb-details-group-title">AGENT</span>
            <div className="sb-details-row">
              <span className="sb-details-key">Agent Endpoint</span>
              <span className="sb-details-val">{agentEndpoint}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
