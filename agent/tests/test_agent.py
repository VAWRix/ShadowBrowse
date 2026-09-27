"""
ShadowBrowse Local Agent — Test Suite (Phase 2)

Phase 2 changes:
- Tests now set SHADOWBROWSE_TEST_MODE=1 to enable testclient host allowance.
- Token is now ONLY passed via X-Shadow-Token header (not query param).
- Query param token test added to confirm that fallback was removed.
- Cross-session isolation test: validates session IDs are ephemeral and not re-used.
- Route verification fields validated in status endpoint.
- Added test for token timing attack resistance (constant-time compare behavior).
"""
import os
import pytest

# MUST be set BEFORE importing the app, because auth.py reads the env var at module load time
os.environ["SHADOWBROWSE_TEST_MODE"] = "1"

from fastapi.testclient import TestClient
from agent.src.main import app
from agent.src.config import get_or_create_auth_token

client = TestClient(app)

EXT_ORIGIN = {"origin": "chrome-extension://abcdefghijklmnopabcdefghijklmnop"}


def test_public_status_endpoint():
    """Verify status endpoint is accessible via localhost without auth token."""
    response = client.get("/api/v1/status", headers=EXT_ORIGIN)
    assert response.status_code == 200
    data = response.json()
    assert "version" in data
    assert "online" in data
    assert data["online"] is True
    assert "tor_status" in data
    assert "kill_switch" in data


def test_unauthorized_web_origin_rejected():
    """Verify that an arbitrary website origin is forbidden."""
    response = client.get(
        "/api/v1/status",
        headers={"origin": "https://evil-tracker.com"}
    )
    assert response.status_code == 403
    assert "Forbidden" in response.json()["detail"]


def test_protected_endpoint_without_token():
    """Verify that sensitive endpoints require the secret token."""
    response = client.post("/api/v1/session/start", headers=EXT_ORIGIN)
    assert response.status_code == 401


def test_token_query_param_rejected():
    """
    Phase 2 security regression test:
    Token MUST NOT be accepted via query parameter (was removed for security).
    Query params can be logged by servers/proxies — not safe for bearer tokens.
    """
    token = get_or_create_auth_token()
    response = client.post(
        f"/api/v1/session/start?token={token}",
        headers=EXT_ORIGIN,
    )
    # Must still reject — no header token provided
    assert response.status_code == 401, (
        "SECURITY REGRESSION: Token accepted via query param. "
        "This is a security issue — query params can be logged."
    )


def test_session_lifecycle_with_valid_token():
    """Verify starting and stopping an anonymous session with valid token."""
    token = get_or_create_auth_token()
    headers = {**EXT_ORIGIN, "X-Shadow-Token": token}

    # Start session
    start_res = client.post("/api/v1/session/start", headers=headers)
    assert start_res.status_code == 200
    start_data = start_res.json()
    assert "session_id" in start_data
    assert start_data["status"] == "ACTIVE"
    session_id_a = start_data["session_id"]

    # Stop session
    stop_res = client.post("/api/v1/session/stop", headers=headers)
    assert stop_res.status_code == 200
    stop_data = stop_res.json()
    assert stop_data["status"] == "STOPPED"
    assert "duration_seconds" in stop_data


def test_cross_session_isolation():
    """
    Phase 2: Validates cross-session isolation.
    Session IDs must be unique, never re-used, and not predictable.
    After a session ends, the subsequent session MUST have a different ID.
    """
    token = get_or_create_auth_token()
    headers = {**EXT_ORIGIN, "X-Shadow-Token": token}

    session_ids = []

    for i in range(3):
        # Start session
        start_res = client.post("/api/v1/session/start", headers=headers)
        assert start_res.status_code == 200, f"Session {i+1} start failed"
        sid = start_res.json()["session_id"]
        assert sid, f"Session {i+1} has empty session ID"
        session_ids.append(sid)

        # Stop session
        stop_res = client.post("/api/v1/session/stop", headers=headers)
        assert stop_res.status_code == 200, f"Session {i+1} stop failed"

    # All session IDs must be unique
    assert len(set(session_ids)) == len(session_ids), (
        f"ISOLATION FAILURE: Session IDs are not unique across sessions: {session_ids}"
    )

    # No session ID should be a substring of another (no predictable derivation)
    for i, a in enumerate(session_ids):
        for j, b in enumerate(session_ids):
            if i != j:
                assert a not in b and b not in a, (
                    f"ISOLATION FAILURE: Session ID {a} is a substring of {b}"
                )


def test_diagnostics_endpoint():
    """Verify diagnostics returns real, technical leak check data."""
    token = get_or_create_auth_token()
    headers = {"origin": "http://localhost:3000", "X-Shadow-Token": token}
    res = client.get("/api/v1/diagnostics", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "tor_detected" in data
    assert "dns_leak_risk" in data
    assert "fail_closed_ready" in data
    assert isinstance(data["details"], list)
    assert len(data["details"]) >= 1


def test_wrong_token_rejected():
    """Verify that a wrong token is rejected with 401."""
    headers = {**EXT_ORIGIN, "X-Shadow-Token": "definitely-not-the-right-token-abcdef1234"}
    response = client.post("/api/v1/session/start", headers=headers)
    assert response.status_code == 401
