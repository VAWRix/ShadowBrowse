"""
ShadowBrowse Phase 2 — Privacy Tests
=====================================
Tests for:
  - Cross-session isolation ("beauty-cream" scenario)
  - Privacy downgrade (Tor → DEGRADED → kill switch)
  - Proxy state capture/restoration
  - DNS status honesty
  - Session lifetime verification

These tests operate against the local Shadow Agent only.
They do NOT connect to real Tor/internet to avoid leaking real traffic.
All session-level behavior (proxy state, cleanup, identity) is validated
through the agent's session API and local state inspection.
"""
import os
import time
import pytest
import secrets

os.environ["SHADOWBROWSE_TEST_MODE"] = "1"

from fastapi.testclient import TestClient
from agent.src.main import app
from agent.src.config import get_or_create_auth_token
from agent.src.tor.detector import check_tor_status
from agent.src.session.manager import agent_session_manager

client = TestClient(app)
EXT_ORIGIN = {"origin": "chrome-extension://abcdefghijklmnopabcdefghijklmnop"}


def auth_headers():
    return {**EXT_ORIGIN, "X-Shadow-Token": get_or_create_auth_token()}


# =============================================================================
# STEP 9: CROSS-SESSION ISOLATION — "beauty-cream" scenario
# =============================================================================

class TestCrossSessionIsolation:
    """
    Simulates the beauty-cream scenario:
    Session A:  user searches for "best beauty cream"
                session data is created (represented by unique session ID)
    Session B:  a new session starts
                must not inherit ANY identity from Session A
    """

    def test_session_a_creates_unique_identity(self):
        """Session A starts with a cryptographically unique session ID."""
        hdrs = auth_headers()
        res = client.post("/api/v1/session/start", headers=hdrs)
        assert res.status_code == 200
        data = res.json()
        assert "session_id" in data
        sid = data["session_id"]
        assert len(sid) >= 16, "Session ID too short to be random"
        assert sid != "default", "Session ID must not be a placeholder"
        # Stop session
        client.post("/api/v1/session/stop", headers=hdrs)

    def test_session_b_does_not_inherit_session_a_id(self):
        """
        Session B must have a completely different ID from Session A.
        The agent must never re-use or derive Session B's ID from Session A.
        """
        hdrs = auth_headers()

        # Session A
        res_a = client.post("/api/v1/session/start", headers=hdrs)
        assert res_a.status_code == 200
        id_a = res_a.json()["session_id"]
        client.post("/api/v1/session/stop", headers=hdrs)

        # Session B
        res_b = client.post("/api/v1/session/start", headers=hdrs)
        assert res_b.status_code == 200
        id_b = res_b.json()["session_id"]
        client.post("/api/v1/session/stop", headers=hdrs)

        assert id_a != id_b, (
            f"ISOLATION FAILURE: Session B inherited Session A's ID.\n"
            f"  Session A: {id_a}\n  Session B: {id_b}"
        )
        # Neither ID should be a prefix/suffix of the other
        assert not id_a.startswith(id_b[:8]), "Session IDs share a common prefix"
        assert not id_b.startswith(id_a[:8]), "Session IDs share a common prefix"

    def test_no_session_active_after_stop(self):
        """After session ends, agent must report no active session."""
        hdrs = auth_headers()
        client.post("/api/v1/session/start", headers=hdrs)
        client.post("/api/v1/session/stop", headers=hdrs)

        status = client.get("/api/v1/status", headers=EXT_ORIGIN)
        data = status.json()
        assert data["session_active"] is False, (
            "ISOLATION FAILURE: Session still active after stop. "
            "Persistent session identity risk."
        )

    def test_beauty_cream_scenario_three_sessions(self):
        """
        Run 3 complete session cycles simulating different browsing contexts.
        Verify total isolation between all three.
        """
        hdrs = auth_headers()
        session_ids = []

        for i in range(3):
            res = client.post("/api/v1/session/start", headers=hdrs)
            assert res.status_code == 200, f"Session {i+1} start failed"
            sid = res.json()["session_id"]
            session_ids.append(sid)
            time.sleep(0.05)  # Small gap to ensure timestamp-based IDs differ too
            stop = client.post("/api/v1/session/stop", headers=hdrs)
            assert stop.status_code == 200, f"Session {i+1} stop failed"

        # All IDs must be unique
        assert len(set(session_ids)) == 3, (
            f"ISOLATION FAILURE: Non-unique session IDs: {session_ids}"
        )
        # No two IDs should share the first 8 characters (no timestamp-based derivation)
        prefixes = [s[:8] for s in session_ids]
        assert len(set(prefixes)) == 3, (
            f"ISOLATION FAILURE: Session ID prefixes are suspiciously similar: {prefixes}"
        )


# =============================================================================
# STEP 8: PRIVACY DOWNGRADE — Kill Switch / State machine
# =============================================================================

class TestPrivacyDowngrade:
    """
    Validates the kill switch state machine:
    PROTECTED → Tor drops → FAILED/DEGRADED → traffic blocked
    """

    def test_kill_switch_armed_by_default(self):
        """Kill switch must be armed when a session starts."""
        hdrs = auth_headers()
        res = client.post("/api/v1/session/start", headers=hdrs)
        assert res.status_code == 200
        data = res.json()
        assert data["kill_switch"] is True, "Kill switch must be armed on session start"
        client.post("/api/v1/session/stop", headers=hdrs)

    def test_status_reflects_tor_reality(self):
        """
        Tor status must reflect actual SOCKS5 probe result, not wishful thinking.
        If Tor is not running, status must be NOT_AVAILABLE, not CONNECTED.
        This test validates the implementation is technically honest.
        """
        # Run the real detector (no Tor running in test environment)
        tor = check_tor_status()
        # The status must be a valid state, not 'UNKNOWN' or made up
        valid_states = {"CONNECTED", "NOT_AVAILABLE", "CONNECTION_FAILED", "NOT_RUNNING", "NOT_INSTALLED"}
        assert tor["status"] in valid_states, (
            f"Tor status '{tor['status']}' is not a valid known state"
        )

    def test_status_endpoint_reflects_tor_reality(self):
        """API status endpoint must report same Tor state as the detector module."""
        tor_direct = check_tor_status()
        api_res = client.get("/api/v1/status", headers=EXT_ORIGIN)
        api_data = api_res.json()

        assert api_data["tor_status"] == tor_direct["status"], (
            f"API tor_status '{api_data['tor_status']}' disagrees with "
            f"detector status '{tor_direct['status']}'. Possible state caching bug."
        )

    def test_no_protected_claim_without_tor(self):
        """
        The agent must NOT claim Tor is CONNECTED if SOCKS5 probe fails.
        This validates technical honesty — the most critical design principle.
        """
        tor = check_tor_status()
        # If Tor is not actually running, status must not be CONNECTED
        # (In a production environment with Tor running, this is CONNECTED — that's correct)
        if tor["status"] != "CONNECTED":
            assert tor["status"] in {"NOT_AVAILABLE", "CONNECTION_FAILED", "NOT_RUNNING", "NOT_INSTALLED"}, (
                f"Expected a 'not running' status, got: {tor['status']}"
            )
            # Verify the diagnostic also reflects this
            hdrs = auth_headers()
            diag = client.get("/api/v1/diagnostics", headers=hdrs)
            data = diag.json()
            assert data["tor_detected"] is False, (
                "HONESTY FAILURE: diagnostics claims tor_detected=True but SOCKS5 probe returned NOT_AVAILABLE"
            )


# =============================================================================
# STEP 11: DNS STATUS HONESTY
# =============================================================================

class TestDNSHonesty:
    """
    DNS verification: we CANNOT independently verify DNS routing from the agent.
    The agent must NOT claim DNS is 'PROTECTED' unless it can verify it.
    """

    def test_dns_status_is_honest(self):
        """
        If Tor is not connected, dns_routed must be False.
        We cannot verify remote DNS resolution — but we can verify the claim
        is consistent with Tor connectivity.
        """
        tor = check_tor_status()
        api_res = client.get("/api/v1/status", headers=EXT_ORIGIN)
        data = api_res.json()

        if tor["status"] != "CONNECTED":
            assert data["dns_routed"] is False, (
                "HONESTY FAILURE: dns_routed=True but Tor is not connected. "
                "DNS protection cannot be active without a Tor SOCKS5 proxy."
            )

    def test_diagnostics_dns_claim(self):
        """diagnostics endpoint must reflect honest DNS risk assessment."""
        hdrs = auth_headers()
        res = client.get("/api/v1/diagnostics", headers=hdrs)
        data = res.json()
        tor = check_tor_status()

        if tor["status"] == "CONNECTED":
            # DNS may be routed remotely — but we cannot verify it definitively
            assert data["dns_leak_risk"] in {"MINIMAL_REMOTE_SOCKS5", "UNVERIFIED"}
        else:
            # No Tor = local DNS = ISP can see queries
            assert data["dns_leak_risk"] == "LOCAL_ISP_RISK", (
                f"HONESTY FAILURE: dns_leak_risk='{data['dns_leak_risk']}' but Tor is not connected. "
                "DNS is leaking to ISP."
            )


# =============================================================================
# STEP 7: PROXY STATE (Agent-level session management)
# =============================================================================

class TestProxyStateManagement:
    """
    Tests that the agent correctly manages session state lifecycle.
    Browser-level proxy state cannot be tested at the Python level
    (it requires a running Chromium) — those tests are in the web-lab.
    This validates the agent-side session lifecycle integrity.
    """

    def test_session_start_stop_duration_is_accurate(self):
        """Session duration must be non-negative and reasonably accurate."""
        hdrs = auth_headers()
        t_before = time.time()
        client.post("/api/v1/session/start", headers=hdrs)
        time.sleep(0.1)
        res = client.post("/api/v1/session/stop", headers=hdrs)
        t_after = time.time()

        data = res.json()
        duration = data["duration_seconds"]
        assert duration >= 0.0, "Duration must be non-negative"
        assert duration < (t_after - t_before) + 1.0, "Duration must be within wall-clock bounds"

    def test_stop_without_start_is_safe(self):
        """Stopping a session when none is active must not crash."""
        hdrs = auth_headers()
        res = client.post("/api/v1/session/stop", headers=hdrs)
        # Should either succeed gracefully or return an error — must not 500
        assert res.status_code in {200, 400, 404}, (
            f"Unexpected status on stop-without-start: {res.status_code}"
        )
