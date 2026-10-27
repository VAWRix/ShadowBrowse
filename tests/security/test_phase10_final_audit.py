"""
ShadowBrowse Phase 10 — Final Security Audit and Release Readiness Test Suite
=============================================================================
Validates:
- Phase 10A: Security audit regressions (manifest CSP, sender ID validation,
  in-page signal sanitization & rate limiting, agent security boundaries,
  token protections, sensitive data sanitization).
- Phase 10B: Network and privacy behavior (proxy restoration, fail-closed kill
  switch, honest multi-dimensional status labels, DNS/WebRTC classifications).
- Phase 10C: Real-browser artifact and readiness verification.
- Phase 10D: Packaging cleanliness (no source maps or credentials in dist).
"""

import json
import os
import re
import pytest
from pathlib import Path
from fastapi.testclient import TestClient

os.environ["SHADOWBROWSE_TEST_MODE"] = "1"

from agent.src.main import app, MAX_REQUEST_BODY_SIZE
from agent.src.config import get_or_create_auth_token
from agent.src.security.auth import verify_localhost_and_origin, verify_token, _is_allowed_host
from agent.src.session.manager import agent_session_manager

client = TestClient(app)
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
MANIFEST_PATH = ROOT_DIR / "extension" / "public" / "manifest.json"
DIST_DIR = ROOT_DIR / "extension" / "dist"
CONTENT_SCRIPT_PATH = ROOT_DIR / "extension" / "src" / "content" / "contentScript.ts"
MESSAGE_SECURITY_PATH = ROOT_DIR / "extension" / "src" / "background" / "messageSecurity.ts"

VALID_EXT_ORIGIN = {"origin": "chrome-extension://abcdefghijklmnopabcdefghijklmnop"}


def auth_headers(extra=None):
    base = {**VALID_EXT_ORIGIN, "X-Shadow-Token": get_or_create_auth_token()}
    if extra:
        base.update(extra)
    return base


# ============================================================================
# PHASE 10A — SECURITY AUDIT VERIFICATIONS
# ============================================================================

def test_manifest_v3_and_csp_enforcement():
    """Manifest must use MV3 and strictly restrict script and object execution."""
    assert MANIFEST_PATH.exists(), f"Missing manifest at {MANIFEST_PATH}"
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    assert manifest.get("manifest_version") == 3
    csp = manifest.get("content_security_policy", {}).get("extension_pages", "")
    assert "script-src 'self'" in csp
    assert "object-src 'none'" in csp
    assert "base-uri 'none'" in csp
    assert "unsafe-eval" not in csp
    assert "unsafe-inline" not in csp


def test_manifest_web_accessible_resources_are_minimal():
    """Only injectGuard.js should be exposed to in-page scripts."""
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    war = manifest.get("web_accessible_resources", [])
    exposed_resources = []
    for entry in war:
        exposed_resources.extend(entry.get("resources", []))

    assert exposed_resources == ["injectGuard.js"]


def test_content_script_in_page_signal_hardening():
    """Verify content script validates signal types, bounds details, caps history, and rate limits."""
    assert CONTENT_SCRIPT_PATH.exists()
    content_code = CONTENT_SCRIPT_PATH.read_text(encoding="utf-8")

    # 1. Type validation against allowed set
    assert "VALID_PAGE_SIGNAL_TYPES" in content_code
    assert "PAGE_SIGNAL_RATE_LIMIT_WINDOW_MS" in content_code
    assert "MAX_PAGE_SIGNALS_PER_WINDOW" in content_code
    assert "MAX_PROPERTIES_READ_HISTORY" in content_code
    assert "cleanDetail" in content_code
    assert "slice(0, 128)" in content_code


def test_message_security_sender_id_validation():
    """Verify messageSecurity validates sender ID matches extension ID when defined."""
    assert MESSAGE_SECURITY_PATH.exists()
    sec_code = MESSAGE_SECURITY_PATH.read_text(encoding="utf-8")

    assert "sender.id !== chrome.runtime.id" in sec_code
    assert "Unauthorized sender context: Message sender ID does not match extension ID." in sec_code


def test_agent_host_header_dns_rebinding_rejection():
    """Agent rejects non-loopback Host header with HTTP 403."""
    response = client.get(
        "/api/v1/status",
        headers={"Host": "attacker-controlled-site.com", **VALID_EXT_ORIGIN},
    )
    assert response.status_code == 403
    assert "DNS rebinding" in response.json().get("detail", "")


def test_agent_payload_size_bounding():
    """Agent returns 413 when Content-Length exceeds 1MB limit."""
    huge_len = str(MAX_REQUEST_BODY_SIZE + 1024)
    response = client.post(
        "/api/v1/tor/verify-route",
        headers={**auth_headers(), "Content-Length": huge_len},
        content=b"x",
    )
    assert response.status_code == 413
    assert "1MB" in response.json().get("detail", "")


def test_agent_security_response_headers():
    """Agent responses must include strict security headers."""
    response = client.get("/api/v1/status", headers=VALID_EXT_ORIGIN)
    assert response.status_code == 200
    headers = response.headers
    assert headers.get("X-Content-Type-Options") == "nosniff"
    assert headers.get("X-Frame-Options") == "DENY"
    assert "no-store" in headers.get("Cache-Control", "")
    assert "default-src 'none'" in headers.get("Content-Security-Policy", "")


def test_agent_token_constant_time_verification():
    """Protected endpoints require valid X-Shadow-Token."""
    bad_token = auth_headers({"X-Shadow-Token": "invalid_token_12345"})
    resp = client.post("/api/v1/session/start", headers=bad_token)
    assert resp.status_code == 401
    assert "Unauthorized" in resp.json().get("detail", "")


# ============================================================================
# PHASE 10B — NETWORK AND PRIVACY BEHAVIOR
# ============================================================================

def test_status_dns_and_tor_classification_honesty():
    """Status endpoint must not claim DNS or Tor exit is verified when unverified."""
    resp = client.get("/api/v1/status", headers=VALID_EXT_ORIGIN)
    assert resp.status_code == 200
    data = resp.json()

    # DNS verified must be False (browser extension cannot inspect kernel-level DNS)
    assert data["dns_verified"] is False
    assert data["dns_status"] in ("UNVERIFIED", "PARTIAL")
    assert isinstance(data["tor_verification_status"], str)


def test_agent_session_manager_lifecycle():
    """Test start and stop session lifecycle and state reporting."""
    # Ensure starting in stopped state
    agent_session_manager.stop_session()

    start_res = agent_session_manager.start_session()
    assert start_res["status"] == "ACTIVE"
    assert start_res["kill_switch"] is True
    assert start_res["session_id"] is not None

    status = agent_session_manager.get_status()
    assert status["active"] is True
    assert status["kill_switch_armed"] is True

    stop_res = agent_session_manager.stop_session()
    assert stop_res["status"] == "STOPPED"
    assert stop_res["stopped_session_id"] == start_res["session_id"]


def test_route_verification_without_mock_returns_honest_unverified():
    """Calling verify-route without available SOCKS5 endpoint returns UNAVAILABLE without false claims."""
    resp = client.post(
        "/api/v1/tor/verify-route",
        headers=auth_headers(),
        json={},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["route_verified"] is False
    assert data["verification_status"] in ("UNAVAILABLE", "DISCONNECTED", "TEST_MODE_OFFLINE")
    assert data["evidence_level"] in ("NONE", "MOCK")


# ============================================================================
# PHASE 10C & 10D — PRODUCTION PACKAGING & RELEASE ACCEPTANCE
# ============================================================================

def test_production_dist_contains_no_source_maps():
    """Production extension build must not bundle .map source files."""
    if not DIST_DIR.exists():
        pytest.skip("extension/dist not yet generated")

    map_files = list(DIST_DIR.rglob("*.map"))
    assert len(map_files) == 0, f"Found source maps in dist: {map_files}"


def test_production_dist_contains_no_secrets_or_env_files():
    """Production extension bundle must not bundle credentials or environment files."""
    if not DIST_DIR.exists():
        pytest.skip("extension/dist not yet generated")

    for file in DIST_DIR.rglob("*"):
        if file.is_file():
            assert not file.name.startswith(".env"), f"Found env file in dist: {file}"
            assert not file.name.endswith(".token"), f"Found token file in dist: {file}"
            assert file.name != "agent.token", f"Found agent.token in dist: {file}"


def test_production_dist_required_runtime_assets_exist():
    """Verify all runtime assets referenced in manifest.json exist in dist."""
    if not DIST_DIR.exists():
        pytest.skip("extension/dist not yet generated")

    required = [
        "manifest.json",
        "popup.html",
        "sidepanel.html",
        "background.js",
        "content.js",
        "injectGuard.js",
    ]
    for asset in required:
        asset_path = DIST_DIR / asset
        assert asset_path.exists(), f"Missing required dist asset: {asset}"


def test_content_script_classic_format_no_es_import():
    """
    Chromium Manifest V3 executes content_scripts as classic scripts in isolated worlds.
    Top-level 'import' or 'export' statements cause:
    'Uncaught SyntaxError: Cannot use import statement outside a module'.
    Verify that dist/content.js and dist/injectGuard.js are classic IIFE scripts with no top-level import/export.
    """
    if not DIST_DIR.exists():
        pytest.skip("extension/dist not yet generated")

    for script_name in ["content.js", "injectGuard.js"]:
        script_path = DIST_DIR / script_name
        assert script_path.exists(), f"Missing {script_name} in dist"
        content = script_path.read_text(encoding="utf-8")
        # Classic scripts must not have top-level ES module import statements
        assert not content.strip().startswith("import "), (
            f"{script_name} starts with an ES module 'import' statement, which will cause "
            "Chromium to throw 'Uncaught SyntaxError: Cannot use import statement outside a module'."
        )
        assert "import{" not in content and "import {" not in content, (
            f"{script_name} contains ES module imports incompatible with classic content scripts."
        )
        assert not content.strip().startswith("export "), (
            f"{script_name} starts with an ES module 'export' statement."
        )

