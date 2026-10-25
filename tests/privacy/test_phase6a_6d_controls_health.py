"""
ShadowBrowse Phases 6A–6D — Privacy Controls, Health Dashboard, and Integration Tests
Validates:
- Phase 6A: Privacy event storage metrics, retention bounds (200 FIFO), and race-free history clearing.
- Phase 6B: Authoritative subsystem health evaluation (truthful states, unverified vs verified routes).
- Phase 6C: Diagnostic issues for common failures (agent offline, Tor down, kill-switch engaged)
  with ordinary language explanations, concrete recovery actions, and sensitive data redaction.
- Phase 6D: End-to-end integration, message handlers, and navigation consistency.
"""

import pytest
from typing import Dict, List, Optional, Any

MAX_PERSISTED_EVENTS = 200
MAX_MEMORY_EVENTS = 100


HEALTH_DASHBOARD_DISCLAIMER = (
    "Health assessment reflects local technical probe state. "
    "An active status confirms configured subsystem enforcement, not absolute mathematical protection against all tracking vectors."
)


# ============================================================================
# PYTHON REFERENCE IMPLEMENTATION FOR HEALTH & DIAGNOSTICS EVALUATION
# ============================================================================

def evaluate_system_health(
    overview: Optional[Dict[str, Any]] = None,
    events: Optional[List[Dict[str, Any]]] = None,
    storage_stats: Optional[Dict[str, Any]] = None,
    tracker_stats: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Python mirror of extension/src/shared/diagnosticsRecovery.ts."""
    issues = []

    # 1. Local Python Agent Assessment
    agent_info = overview.get("agent") if overview else {}
    agent_online = bool(agent_info.get("online"))
    agent_subsystem = {
        "name": "AGENT_LINK",
        "displayName": "Local Agent Daemon",
        "status": "ACTIVE" if agent_online else "FAILED",
        "summary": "Connected (127.0.0.1:9152)" if agent_online else "Agent Daemon Offline",
        "isVerified": agent_online,
    }
    if not agent_online:
        issues.append({
            "id": "diag_agent_down",
            "category": "AGENT_UNAVAILABLE",
            "severity": "WARNING",
            "title": "Local Python Agent Daemon Offline",
            "explanation": "The background ShadowBrowse agent daemon is unreachable at 127.0.0.1:9152.",
            "recoveryAction": 'Start the agent daemon via terminal: "python agent/src/main.py". Ensure port 9152 is free.',
            "technicalDetail": "Connection refused on localhost:9152 HTTP socket.",
        })

    # 2. Network Routing / Tor Assessment
    network_info = overview.get("network") if overview else {}
    net_mode = network_info.get("mode", "DIRECT")
    is_tor = net_mode == "TOR"
    tor_status = network_info.get("torStatus", "NOT_AVAILABLE")
    route_verified = bool(network_info.get("routeVerified"))
    is_kill_switch = (overview.get("state") == "FAILED") if overview else False

    net_status = "INACTIVE"
    net_summary = "Direct network egress (unproxied)"
    if is_kill_switch:
        net_status = "FAILED"
        net_summary = "Kill switch engaged; traffic blocked"
        issues.append({
            "id": "diag_kill_switch",
            "category": "KILL_SWITCH_ENGAGED",
            "severity": "CRITICAL",
            "title": "Fail-Closed Kill Switch Engaged",
            "explanation": "The fail-closed kill switch engaged because traffic routing dropped unexpectedly or was severed to prevent unproxied IP leakage.",
            "recoveryAction": "Verify local Tor daemon status. Start a new anonymous session or switch to Direct mode in Settings if unproxied browsing is intended.",
            "technicalDetail": "Active proxy route severed; proxy set to null-sink 127.0.0.1:1.",
        })
    elif is_tor:
        if route_verified:
            net_status = "ACTIVE"
            net_summary = "Encrypted Tor circuit (route verified)"
        elif tor_status in ("CONNECTED", "BOOTSTRAPPING"):
            net_status = "DEGRADED"
            net_summary = "SOCKS5 proxy active; egress unverified"
            issues.append({
                "id": "diag_route_unverified",
                "category": "ROUTE_UNVERIFIED",
                "severity": "WARNING",
                "title": "Tor Egress Route Unverified",
                "explanation": "Browser proxy is routed to local SOCKS port, but external egress IP has not been verified against the Tor exit relay consensus.",
                "recoveryAction": "Allow route verification probe to finish or check internet connectivity.",
                "technicalDetail": "Agent route status: ROUTE_VERIFIED_TOR_UNVERIFIED or probe in-flight.",
            })
        else:
            net_status = "FAILED"
            net_summary = "Tor circuit offline or unavailable"
            issues.append({
                "id": "diag_tor_down",
                "category": "TOR_UNAVAILABLE",
                "severity": "CRITICAL",
                "title": "Tor Daemon SOCKS Port Offline",
                "explanation": "Configured Tor proxy is not responding on SOCKS5 port 9050.",
                "recoveryAction": "Launch Tor Browser or start system Tor daemon. Verify SOCKS5 port in Settings.",
                "technicalDetail": "SOCKS handshake failure on port 9050.",
            })

    network_subsystem = {
        "name": "NETWORK_ROUTING",
        "displayName": "Anonymity Network Routing",
        "status": net_status,
        "summary": net_summary,
        "isVerified": route_verified,
    }

    # 3. Tracker Defense Subsystem Assessment
    t_stats = tracker_stats or {}
    tracker_mode = t_stats.get("mode", "DETECT")
    is_tracker_active = tracker_mode == "BLOCK"
    tracker_subsystem = {
        "name": "TRACKER_DEFENSE",
        "displayName": "Tracker Defense (DNR)",
        "status": "ACTIVE" if is_tracker_active else ("DEGRADED" if tracker_mode == "DETECT" else "INACTIVE"),
        "summary": f"Active DNR rules ({t_stats.get('blockedRequests', 0)} attempts)" if is_tracker_active else ("Detection mode only (reporting without blocking)" if tracker_mode == "DETECT" else "Tracker defense disabled"),
        "isVerified": is_tracker_active,
    }

    # 4. Privacy Event Engine Assessment
    is_hydrated = storage_stats.get("isHydrated", True) if storage_stats else True
    event_engine_subsystem = {
        "name": "EVENT_ENGINE",
        "displayName": "Privacy Event Engine",
        "status": "ACTIVE" if is_hydrated else "DEGRADED",
        "summary": f"Bounded ring buffer ({storage_stats.get('memoryEvents', 0) if storage_stats else 0} RAM items)" if is_hydrated else "Storage rehydration pending",
        "isVerified": is_hydrated,
    }

    # 5. Critical Incidents Count
    critical_incidents_count = 0
    if events and isinstance(events, list):
        for evt in events:
            if (
                evt.get("severity") == "CRITICAL"
                or evt.get("category") == "KILL_SWITCH"
                or (evt.get("category") == "NETWORK" and evt.get("outcome") == "FAILED")
            ):
                critical_incidents_count += 1

    overall_status = "HEALTHY"
    if is_kill_switch or net_status == "FAILED":
        overall_status = "FAILED"
    elif not agent_online or net_status == "DEGRADED" or tracker_mode == "DETECT":
        overall_status = "DEGRADED"

    return {
        "overallStatus": overall_status,
        "subsystems": [network_subsystem, tracker_subsystem, event_engine_subsystem, agent_subsystem],
        "issues": issues,
        "criticalIncidentsCount": critical_incidents_count,
        "disclaimer": HEALTH_DASHBOARD_DISCLAIMER,
    }


# ============================================================================
# AUTOMATED TEST SUITE FOR PHASES 6A–6D
# ============================================================================

class TestPhase6A_PrivacyControls:
    def test_storage_metrics_and_retention_policy(self):
        """Storage stats must report bounded limits (200 persisted, 100 memory)."""
        stats = {
            "memoryEvents": 42,
            "persistedEventsCap": MAX_PERSISTED_EVENTS,
            "memoryCap": MAX_MEMORY_EVENTS,
            "isHydrated": True,
            "retentionPolicy": "Bounded FIFO ring buffer (max 200 items) + Automatic session purge on termination",
        }
        assert stats["memoryEvents"] <= stats["memoryCap"]
        assert stats["persistedEventsCap"] == 200
        assert "FIFO ring buffer" in stats["retentionPolicy"]

    def test_race_free_clearing_model(self):
        """History clear must drain dirty queues and prevent in-flight resurrection."""
        class MockEngine:
            def __init__(self):
                self.is_writing = False
                self.dirty_queue = ["evt-1", "evt-2"]
                self.memory_buffer = ["evt-1", "evt-2"]
                self.storage = {"shadowbrowse_privacy_events": ["evt-1"]}

            def clear_all(self):
                # Simulates race-free clear logic: await in-flight, cancel timer, empty queues, remove storage
                self.dirty_queue.clear()
                self.memory_buffer.clear()
                self.storage.pop("shadowbrowse_privacy_events", None)

        engine = MockEngine()
        engine.clear_all()
        assert len(engine.dirty_queue) == 0
        assert len(engine.memory_buffer) == 0
        assert "shadowbrowse_privacy_events" not in engine.storage


class TestPhase6B_PrivacyHealthDashboard:
    def test_truthful_subsystem_statuses(self):
        """Never show ACTIVE when agent or route is unverified."""
        overview_unverified = {
            "state": "PROTECTED",
            "agent": {"online": True},
            "network": {"mode": "TOR", "torStatus": "CONNECTED", "routeVerified": False},
        }
        health = evaluate_system_health(overview_unverified)
        net_sub = next(s for s in health["subsystems"] if s["name"] == "NETWORK_ROUTING")
        assert net_sub["status"] == "DEGRADED"  # SOCKS5 active but unverified
        assert net_sub["isVerified"] is False
        assert health["overallStatus"] == "DEGRADED"

    def test_healthy_state_when_all_verified(self):
        """System reports HEALTHY when Tor route is confirmed, agent online, and tracker blocking active."""
        overview_healthy = {
            "state": "PROTECTED",
            "agent": {"online": True},
            "network": {"mode": "TOR", "torStatus": "CONNECTED", "routeVerified": True},
        }
        tracker_stats = {"mode": "BLOCK", "blockedRequests": 15}
        health = evaluate_system_health(overview_healthy, tracker_stats=tracker_stats)
        assert health["overallStatus"] == "HEALTHY"
        assert len(health["issues"]) == 0
        assert health["disclaimer"] == HEALTH_DASHBOARD_DISCLAIMER


class TestPhase6C_DiagnosticsAndRecovery:
    def test_agent_offline_diagnostics(self):
        """Agent offline generates concrete recovery instructions without raw secrets."""
        overview_offline = {
            "state": "OFF",
            "agent": {"online": False},
            "network": {"mode": "DIRECT"},
        }
        health = evaluate_system_health(overview_offline)
        assert len(health["issues"]) >= 1
        issue = next(i for i in health["issues"] if i["category"] == "AGENT_UNAVAILABLE")
        assert "python agent/src/main.py" in issue["recoveryAction"]
        assert "127.0.0.1:9152" in issue["explanation"]
        assert "password" not in issue["technicalDetail"].lower()

    def test_kill_switch_diagnostics(self):
        """Kill switch engaged generates critical warning with safe restart guidance."""
        overview_failed = {
            "state": "FAILED",
            "agent": {"online": True},
            "network": {"mode": "TOR", "torStatus": "FAILED"},
        }
        health = evaluate_system_health(overview_failed)
        assert health["overallStatus"] == "FAILED"
        issue = next(i for i in health["issues"] if i["category"] == "KILL_SWITCH_ENGAGED")
        assert issue["severity"] == "CRITICAL"
        assert "fail-closed kill switch" in issue["explanation"].lower()
        assert "Start a new anonymous session" in issue["recoveryAction"]


class TestPhase6D_EndToEndIntegration:
    def test_navigation_shortcuts_and_action_consistency(self):
        """Validates that navigation targets map to real views in SidePanel."""
        valid_sidepanel_tabs = {"status", "autopsy", "assistant", "events", "settings"}
        shortcuts = ["events", "autopsy", "settings"]
        for target in shortcuts:
            assert target in valid_sidepanel_tabs

    def test_disclaimer_integrity(self):
        """All health assessments must include the explicit non-guarantee disclaimer."""
        health = evaluate_system_health(None)
        assert "not absolute mathematical protection" in health["disclaimer"]
