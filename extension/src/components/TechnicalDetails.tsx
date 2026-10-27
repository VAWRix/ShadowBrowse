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

  const rawDns = overview?.network.dnsStatus || 'UNKNOWN';
  let dnsClassificationLabel = 'UNKNOWN';
  let dnsExplanation = '';
  let dnsNextStep = '';

  switch (rawDns) {
    case 'PARTIALLY_PROTECTED':
    case 'PARTIAL':
      dnsClassificationLabel = 'PARTIAL (SOCKS5 Tor Remote)';
      dnsExplanation =
        'Chromium forwards domain names via SOCKS5 to the Tor exit relay. Upstream DNS resolves at the exit node, masking your ISP resolver. Kernel-level OS UDP packets cannot be inspected from the MV3 extension sandbox.';
      dnsNextStep =
        'Run an external DNS leak test (e.g. dnsleaktest.com) to confirm resolvers belong to Tor exit relays.';
      break;
    case 'NOT_APPLICABLE':
      dnsClassificationLabel = 'DIRECT (Local OS Resolution)';
      dnsExplanation =
        'Standard direct network routing. Domain names resolve through your local operating system network adapter and ISP resolver.';
      dnsNextStep =
        'Start a Private Session to route web traffic through encrypted Tor SOCKS5 proxy.';
      break;
    case 'LEAK_DETECTED':
      dnsClassificationLabel = 'LEAK DETECTED';
      dnsExplanation =
        'Route verification detected browser outbound egress matched your direct IP instead of Tor proxy. Kill switch engaged.';
      dnsNextStep =
        'Fail-closed kill switch is active. Check Tor daemon and restart session.';
      break;
    case 'UNVERIFIED':
      dnsClassificationLabel = 'UNVERIFIED';
      dnsExplanation =
        'Outbound route verification probe has not completed or the agent verify-route call timed out.';
      dnsNextStep =
        'Click "Readiness Details" or wait for background probe to complete.';
      break;
    case 'WARNING':
      dnsClassificationLabel = 'WARNING (Misconfigured)';
      dnsExplanation =
        'Proxy settings could not be verified or a conflicting proxy extension was detected.';
      dnsNextStep =
        'Disable conflicting extensions and verify the Local Shadow Agent status.';
      break;
    case 'UNAVAILABLE':
      dnsClassificationLabel = 'UNAVAILABLE';
      dnsExplanation =
        'Local Shadow Agent is offline or unreachable on 127.0.0.1:9152.';
      dnsNextStep =
        'Launch START_ALL.bat to start Tor and the Local Shadow Agent.';
      break;
    case 'UNKNOWN':
    default:
      dnsClassificationLabel = 'INDETERMINATE';
      dnsExplanation =
        'DNS routing status is not yet determined for the active network mode.';
      dnsNextStep =
        'Trigger route verification from the Readiness Checklist.';
      break;
  }

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
              <span
                className={`sb-details-val ${
                  rawDns === 'LEAK_DETECTED'
                    ? 'text-danger'
                    : rawDns === 'PARTIALLY_PROTECTED' || rawDns === 'PARTIAL'
                    ? 'text-primary'
                    : ''
                }`}
              >
                {dnsClassificationLabel}
              </span>
            </div>
            {dnsExplanation && (
              <div
                style={{
                  fontSize: '10px',
                  color: 'var(--sb-text-muted)',
                  marginTop: '4px',
                  paddingLeft: '6px',
                  borderLeft: '2px solid var(--sb-border-subtle)',
                  lineHeight: '1.35',
                }}
              >
                <div>{dnsExplanation}</div>
                <div style={{ color: 'var(--sb-accent-hover)', marginTop: '2px', fontWeight: 500 }}>
                  Next step: {dnsNextStep}
                </div>
              </div>
            )}
            <div className="sb-details-row mt-1-5">
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
