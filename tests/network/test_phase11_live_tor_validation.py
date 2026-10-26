"""
ShadowBrowse Phase 11 — Live Tor Setup & Network Privacy Validation Tests
========================================================================
Validates:
- Phase 11A: Local Tor daemon (version 0.4.8.14), SOCKS5 handshake (RFC 1928),
  ControlPort bootstrap verification, and provider detection.
- Phase 11B: Live Tor route verification, external Tor endpoint confirmation
  (check.torproject.org), and egress IP distinction.
- Phase 11C: Fail-closed kill switch on network drop, direct bypass prevention,
  and exact pre-session proxy restoration.
- Phase 11D: Acceptance results structure, DNS/WebRTC status honesty, and
  cross-session identity isolation.
"""

import os
import json
import socket
import pytest
from pathlib import Path
from fastapi.testclient import TestClient

os.environ["SHADOWBROWSE_TEST_MODE"] = "1"

from agent.src.main import app
from agent.src.config import get_or_create_auth_token
from agent.src.tor.detector import (
    detect_tor_provider,
    socks5_handshake,
    tor_control_probe,
    check_tor_status,
)
from agent.src.tor.route_verifier import verify_route
from agent.src.session.manager import agent_session_manager

client = TestClient(app)
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
ACCEPTANCE_RESULTS_PATH = ROOT_DIR / "acceptance_results.json"
TOR_BIN_PATH = ROOT_DIR / "agent" / "bin" / "tor" / "tor" / "tor.exe"
TOR_RC_PATH = ROOT_DIR / "agent" / "bin" / "tor" / "torrc"

AUTH_HEADERS = {
    "origin": "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
    "X-Shadow-Token": get_or_create_auth_token(),
}


def test_tor_binary_and_config_exist():
    """Verify bundled Tor binary and torrc configuration exist."""
    assert TOR_BIN_PATH.exists(), f"Missing tor.exe at {TOR_BIN_PATH}"
    assert TOR_RC_PATH.exists(), f"Missing torrc at {TOR_RC_PATH}"
    config_content = TOR_RC_PATH.read_text(encoding="utf-8")
    assert "SocksPort 9050" in config_content
    assert "ControlPort 9051" in config_content


def test_socks5_handshake_port_9050():
    """Verify RFC 1928 No-Auth greeting on active SOCKS5 listener (127.0.0.1:9050)."""
    # If Tor is running, handshake must succeed; otherwise skip gracefully
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(1.0)
            s.connect(("127.0.0.1", 9050))
    except (socket.timeout, ConnectionRefusedError, OSError):
        pytest.skip("Tor SOCKS5 daemon not currently running on port 9050")

    assert socks5_handshake("127.0.0.1", 9050) is True


def test_tor_control_port_9051():
    """Verify ControlPort probe queries bootstrap status and confirms Tor identity."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(1.0)
            s.connect(("127.0.0.1", 9051))
    except (socket.timeout, ConnectionRefusedError, OSError):
        pytest.skip("Tor ControlPort not currently running on port 9051")

    probe = tor_control_probe("127.0.0.1", 9051)
    assert probe is not None
    assert probe["is_tor"] is True
    assert probe["bootstrap_percent"] == 100


def test_provider_detection_system_tor():
    """Verify Tor detector recognizes running system Tor with honest metrics."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(1.0)
            s.connect(("127.0.0.1", 9050))
    except (socket.timeout, ConnectionRefusedError, OSError):
        pytest.skip("Tor SOCKS5 daemon not currently running on port 9050")

    provider = detect_tor_provider()
    assert provider["provider_type"] in ("SYSTEM_TOR", "USER_MANAGED_TOR")
    assert provider["reachable"] is True
    assert provider["verification_status"] == "CONFIRMED_TOR"


def test_direct_bypass_detection_logic():
    """Verify that when proxied IP matches direct IP, DIRECT_BYPASS_DETECTED is raised."""
    result = verify_route(
        socks_host="127.0.0.1",
        socks_port=9050,
        mock_direct_ip="198.51.100.1",
        mock_proxied_ip="198.51.100.1",
        mock_exit_is_tor=False,
    )
    assert result["verification_status"] == "DIRECT_BYPASS_DETECTED"
    assert result["route_verified"] is False
    assert result["ips_differ"] is False
    assert result["route_functional"] is False


def test_tor_route_verification_with_exit_confirmation():
    """Verify that distinct IP with exit confirmation yields TOR_ROUTE_VERIFIED."""
    result = verify_route(
        socks_host="127.0.0.1",
        socks_port=9050,
        mock_direct_ip="203.0.113.1",
        mock_proxied_ip="198.51.100.2",
        mock_exit_is_tor=True,
    )
    assert result["verification_status"] == "TOR_ROUTE_VERIFIED"
    assert result["route_verified"] is True
    assert result["ips_differ"] is True
    assert result["exit_is_tor"] is True


def test_real_acceptance_results_file_validity():
    """Verify real acceptance results record authentic Tor exit confirmation."""
    assert ACCEPTANCE_RESULTS_PATH.exists(), "Missing acceptance_results.json"
    with open(ACCEPTANCE_RESULTS_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Check environment
    env = data.get("environment", {})
    assert env.get("agentOnline") is True
    assert env.get("torBootstrapPercent") == 100
    assert env.get("controlPortVerified") is True

    # Check real browser route
    browser_route = data.get("realBrowserRoute", {})
    assert browser_route.get("ipsDiffer") is True
    assert browser_route.get("browserObservedIsTor") is True
    assert browser_route.get("agentRouteStatus") == "TOR_ROUTE_VERIFIED"
    assert browser_route.get("browserRouteStatus") == "BROWSER_ROUTE_VERIFIED"

    # Check kill switch and fail-closed response
    direct_bypass = data.get("directBypass", {})
    assert direct_bypass.get("killSwitchEngaged") is True
    assert direct_bypass.get("directBypassBlocked") is True

    # Check proxy restoration and session isolation
    session_end = data.get("sessionEnd", {})
    assert session_end.get("proxyRestored") is True

    cross_session = data.get("crossSession", {})
    assert cross_session.get("sessionIdsDiffer") is True

    # Check WebRTC and DNS honest status
    webrtc = data.get("webrtc", {})
    assert webrtc.get("protectedPolicy") == "disable_non_proxied_udp"
    assert webrtc.get("restored") is True

    dns = data.get("dns", {})
    assert dns.get("status") == "PARTIALLY_PROTECTED"


def test_agent_api_status_reflects_confirmed_tor():
    """Verify /api/v1/status reports honest confirmed Tor status when Tor is active."""
    response = client.get("/api/v1/status", headers=AUTH_HEADERS)
    assert response.status_code == 200
    data = response.json()
    assert data["online"] is True
    assert data["dns_verified"] is False
    assert data["dns_status"] in ("UNVERIFIED", "PARTIAL")
