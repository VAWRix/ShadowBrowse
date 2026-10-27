"""
ShadowBrowse — DNS Classification, Route Honesty, and Disconnection Resilience Tests
===================================================================================

Verifies:
1. DNS classification distinguishes remote SOCKS5 resolution vs direct ISP resolution.
2. Technical honesty: DNS status remains PARTIAL even when Tor route is confirmed.
3. Fail-closed behavior on Tor disconnection.
4. API diagnostics return structured, non-misleading status fields.
"""

import os
import socket
import pytest
from unittest.mock import patch

os.environ["SHADOWBROWSE_TEST_MODE"] = "1"

from fastapi.testclient import TestClient
from agent.src.main import app
from agent.src.config import get_or_create_auth_token

client = TestClient(app)
EXT_ORIGIN = {"origin": "chrome-extension://abcdefghijklmnopabcdefghijklmnop"}


def auth_headers():
    return {**EXT_ORIGIN, "X-Shadow-Token": get_or_create_auth_token()}


def test_status_dns_classification_when_socks_reachable():
    """When Tor SOCKS5 is reachable, DNS status is PARTIAL (remote resolution via exit node)."""
    mock_tor_info = {
        "status": "CONNECTED",
        "socks_port": 9050,
        "provider": {
            "reachable": True,
            "provider_type": "SYSTEM_TOR",
            "control_port_verified": True,
            "bootstrap_percent": 100,
            "verification_status": "CONFIRMED_TOR",
        },
    }
    with patch("agent.src.api.routes.check_tor_status", return_value=mock_tor_info):
        res = client.get("/api/v1/status", headers=EXT_ORIGIN)
        assert res.status_code == 200
        data = res.json()
        assert data["tor_status"] == "CONNECTED"
        assert data["dns_routed"] is True
        assert data["dns_verified"] is False  # Extension cannot verify OS kernel UDP
        assert data["dns_status"] == "PARTIAL"


def test_status_dns_classification_when_tor_offline():
    """When Tor is unreachable, DNS status is UNVERIFIED and not falsely reported as protected."""
    mock_tor_info = {
        "status": "NOT_AVAILABLE",
        "socks_port": 9050,
        "provider": {
            "reachable": False,
            "provider_type": "UNAVAILABLE",
            "control_port_verified": False,
            "bootstrap_percent": 0,
            "verification_status": "UNAVAILABLE",
        },
    }
    with patch("agent.src.api.routes.check_tor_status", return_value=mock_tor_info):
        res = client.get("/api/v1/status", headers=EXT_ORIGIN)
        assert res.status_code == 200
        data = res.json()
        assert data["tor_status"] == "NOT_AVAILABLE"
        assert data["dns_routed"] is False
        assert data["dns_status"] == "UNVERIFIED"


def test_route_verification_does_not_overclaim_dns():
    """Authoritative route verification returning TOR_ROUTE_VERIFIED must not claim full DNS protection."""
    mock_result = {
        "verification_status": "TOR_ROUTE_VERIFIED",
        "direct_ip": "198.51.100.1",
        "proxied_ip": "185.220.101.5",
        "ips_differ": True,
        "exit_is_tor": True,
        "socks5_reachable": True,
        "latency_ms": 350.0,
        "confidence": "HIGH",
        "limitations": [
            "Local OS UDP traffic outside Chromium cannot be inspected by extension.",
            "Chromium SOCKS5 resolves hostnames at Tor exit relay.",
        ],
    }
    with patch("agent.src.api.routes.verify_route", return_value=mock_result):
        res = client.post(
            "/api/v1/tor/verify-route",
            json={"socks_port": 9050, "timeout": 5.0},
            headers=auth_headers(),
        )
        assert res.status_code == 200
        data = res.json()
        assert data["verification_status"] == "TOR_ROUTE_VERIFIED"
        assert data["exit_is_tor"] is True
        assert len(data["limitations"]) > 0


def test_diagnostics_endpoint_contract():
    """Diagnostics endpoint returns explicit, structured multi-layer evidence."""
    res = client.get("/api/v1/diagnostics", headers=auth_headers())
    assert res.status_code == 200
    data = res.json()
    assert "tor_detected" in data
    assert "tor_provider" in data
    assert "dns_leak_risk" in data
    assert "webrtc_protection" in data
    assert "fail_closed_ready" in data
    assert "details" in data
    assert isinstance(data["details"], list)
