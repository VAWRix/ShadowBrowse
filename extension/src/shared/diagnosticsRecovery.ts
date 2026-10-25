import { SystemPrivacyOverview, PrivacyEvent } from './types';

export type SystemSubsystemName =
  | 'NETWORK_ROUTING'
  | 'TRACKER_DEFENSE'
  | 'EVENT_ENGINE'
  | 'AGENT_LINK'
  | 'KILL_SWITCH';

export type SubsystemStatus = 'ACTIVE' | 'DEGRADED' | 'FAILED' | 'INACTIVE' | 'UNKNOWN';

export interface SubsystemHealth {
  name: SystemSubsystemName;
  displayName: string;
  status: SubsystemStatus;
  summary: string;
  isVerified: boolean;
}

export interface DiagnosticIssue {
  id: string;
  category:
    | 'AGENT_UNAVAILABLE'
    | 'TOR_UNAVAILABLE'
    | 'ROUTE_UNVERIFIED'
    | 'KILL_SWITCH_ENGAGED'
    | 'TRACKER_RULES_ERROR'
    | 'STORAGE_ERROR'
    | 'MESSAGING_FAILURE';
  severity: 'WARNING' | 'CRITICAL';
  title: string;
  explanation: string;
  recoveryAction: string;
  technicalDetail: string;
}

export interface SystemHealthAssessment {
  overallStatus: 'HEALTHY' | 'DEGRADED' | 'FAILED' | 'UNKNOWN';
  subsystems: SubsystemHealth[];
  issues: DiagnosticIssue[];
  criticalIncidentsCount: number;
  disclaimer: string;
}

export const HEALTH_DASHBOARD_DISCLAIMER =
  'Health assessment reflects local technical probe state. An active status confirms configured subsystem enforcement, not absolute mathematical protection against all tracking vectors.';

/**
 * Pure, deterministic diagnostic function assessing the authoritative health
 * of all ShadowBrowse security subsystems and formulating actionable recovery guidance.
 */
export function evaluateSystemHealth(
  overview?: SystemPrivacyOverview | null,
  events?: PrivacyEvent[] | null,
  storageStats?: { memoryEvents: number; isHydrated: boolean } | null,
  trackerStats?: { mode?: 'OFF' | 'DETECT' | 'BLOCK'; blockedRequests?: number } | null
): SystemHealthAssessment {
  const issues: DiagnosticIssue[] = [];

  // 1. Local Python Agent Assessment
  const agentOnline = Boolean(overview?.agent?.online);
  const agentSubsystem: SubsystemHealth = {
    name: 'AGENT_LINK',
    displayName: 'Local Agent Daemon',
    status: agentOnline ? 'ACTIVE' : 'FAILED',
    summary: agentOnline ? 'Connected (127.0.0.1:9152)' : 'Agent Daemon Offline',
    isVerified: agentOnline,
  };
  if (!agentOnline) {
    issues.push({
      id: 'diag_agent_down',
      category: 'AGENT_UNAVAILABLE',
      severity: 'WARNING',
      title: 'Local Python Agent Daemon Offline',
      explanation: 'The background ShadowBrowse agent daemon is unreachable at 127.0.0.1:9152.',
      recoveryAction: 'Start the agent daemon via terminal: "python agent/src/main.py". Ensure port 9152 is free.',
      technicalDetail: 'Connection refused on localhost:9152 HTTP socket.',
    });
  }

  // 2. Network Routing / Tor Assessment
  const netMode = overview?.network?.mode || 'DIRECT';
  const isTor = netMode === 'TOR';
  const torStatus = overview?.network?.torStatus || 'NOT_AVAILABLE';
  const routeVerified = Boolean(overview?.network?.routeVerified);
  const isKillSwitch = overview?.state === 'FAILED';

  let netStatus: SubsystemStatus = 'INACTIVE';
  let netSummary = 'Direct network egress (unproxied)';
  if (isKillSwitch) {
    netStatus = 'FAILED';
    netSummary = 'Kill switch engaged; traffic blocked';
    issues.push({
      id: 'diag_kill_switch',
      category: 'KILL_SWITCH_ENGAGED',
      severity: 'CRITICAL',
      title: 'Fail-Closed Kill Switch Engaged',
      explanation: 'The fail-closed kill switch engaged because traffic routing dropped unexpectedly or was severed to prevent unproxied IP leakage.',
      recoveryAction: 'Verify local Tor daemon status. Start a new anonymous session or switch to Direct mode in Settings if unproxied browsing is intended.',
      technicalDetail: 'Active proxy route severed; proxy set to null-sink 127.0.0.1:1.',
    });
  } else if (isTor) {
    if (routeVerified) {
      netStatus = 'ACTIVE';
      netSummary = 'Encrypted Tor circuit (route verified)';
    } else if (torStatus === 'CONNECTED' || torStatus === 'BOOTSTRAPPING') {
      netStatus = 'DEGRADED';
      netSummary = 'SOCKS5 proxy active; egress unverified';
      issues.push({
        id: 'diag_route_unverified',
        category: 'ROUTE_UNVERIFIED',
        severity: 'WARNING',
        title: 'Tor Egress Route Unverified',
        explanation: 'Browser proxy is routed to local SOCKS port, but external egress IP has not been verified against the Tor exit relay consensus.',
        recoveryAction: 'Allow route verification probe to finish or check internet connectivity.',
        technicalDetail: 'Agent route status: ROUTE_VERIFIED_TOR_UNVERIFIED or probe in-flight.',
      });
    } else {
      netStatus = 'FAILED';
      netSummary = 'Tor circuit offline or unavailable';
      issues.push({
        id: 'diag_tor_down',
        category: 'TOR_UNAVAILABLE',
        severity: 'CRITICAL',
        title: 'Tor Daemon SOCKS Port Offline',
        explanation: 'Configured Tor proxy is not responding on SOCKS5 port 9050.',
        recoveryAction: 'Launch Tor Browser or start system Tor daemon. Verify SOCKS5 port in Settings.',
        technicalDetail: 'SOCKS handshake failure on port 9050.',
      });
    }
  }

  const networkSubsystem: SubsystemHealth = {
    name: 'NETWORK_ROUTING',
    displayName: 'Anonymity Network Routing',
    status: netStatus,
    summary: netSummary,
    isVerified: routeVerified,
  };

  // 3. Tracker Defense Subsystem Assessment
  const trackerMode = trackerStats?.mode || 'DETECT';
  const isTrackerActive = trackerMode === 'BLOCK';
  const trackerSubsystem: SubsystemHealth = {
    name: 'TRACKER_DEFENSE',
    displayName: 'Tracker Defense (DNR)',
    status: isTrackerActive ? 'ACTIVE' : trackerMode === 'DETECT' ? 'DEGRADED' : 'INACTIVE',
    summary: isTrackerActive
      ? `Active DNR rules (${trackerStats?.blockedRequests || 0} attempts)`
      : trackerMode === 'DETECT'
      ? 'Detection mode only (reporting without blocking)'
      : 'Tracker defense disabled',
    isVerified: isTrackerActive,
  };

  // 4. Privacy Event Engine Assessment
  const isHydrated = storageStats?.isHydrated ?? true;
  const eventEngineSubsystem: SubsystemHealth = {
    name: 'EVENT_ENGINE',
    displayName: 'Privacy Event Engine',
    status: isHydrated ? 'ACTIVE' : 'DEGRADED',
    summary: isHydrated
      ? `Bounded ring buffer (${storageStats?.memoryEvents || 0} RAM items)`
      : 'Storage rehydration pending',
    isVerified: isHydrated,
  };

  // 5. Critical Incidents Count
  let criticalIncidentsCount = 0;
  if (Array.isArray(events)) {
    for (const evt of events) {
      if (
        evt?.severity === 'CRITICAL' ||
        evt?.category === 'KILL_SWITCH' ||
        (evt?.category === 'NETWORK' && evt?.outcome === 'FAILED')
      ) {
        criticalIncidentsCount++;
      }
    }
  }

  // Derive Overall Health Status
  let overallStatus: SystemHealthAssessment['overallStatus'] = 'HEALTHY';
  if (isKillSwitch || netStatus === 'FAILED') {
    overallStatus = 'FAILED';
  } else if (!agentOnline || netStatus === 'DEGRADED' || trackerMode === 'DETECT') {
    overallStatus = 'DEGRADED';
  }

  return {
    overallStatus,
    subsystems: [networkSubsystem, trackerSubsystem, eventEngineSubsystem, agentSubsystem],
    issues,
    criticalIncidentsCount,
    disclaimer: HEALTH_DASHBOARD_DISCLAIMER,
  };
}
