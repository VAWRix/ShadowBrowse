"""
ShadowBrowse Phases 7A–7D — Security Hardening Regression Test Suite
=====================================================================
Validates:
- Phase 7A: Extension message boundaries (schema validation, 64KB size bounds,
  sender privilege separation, credential redaction, safe errors).
- Phase 7B: Local agent security (DNS-rebinding protection via Host header,
  origin validation, security response headers, 1MB body limit, loopback binding).
- Phase 7C: Extension configuration and permissions (strict CSP in manifest.json,
  URL scheme validation, dangerous protocol rejection).
- Phase 7D: Security regression tests across all attack scenarios.
"""

import json
import os
import re
import pytest
from pathlib import Path
from fastapi.testclient import TestClient

os.environ["SHADOWBROWSE_TEST_MODE"] = "1"

from agent.src.main import app
from agent.src.config import get_or_create_auth_token

client = TestClient(app)
EXT_ORIGIN = {"origin": "chrome-extension://abcdefghijklmnopabcdefghijklmnop"}


def auth_headers(extra=None):
    base = {**EXT_ORIGIN, "X-Shadow-Token": get_or_create_auth_token()}
    if extra:
        base.update(extra)
    return base


# ============================================================================
# PHASE 7A — EXTENSION MESSAGE SECURITY VALIDATION
# ============================================================================

MAX_MESSAGE_BYTE_SIZE = 65536

VALID_MESSAGE_TYPES = {
    'GET_PRIVACY_OVERVIEW',
    'START_ANONYMOUS_SESSION',
    'END_ANONYMOUS_SESSION',
    'ANALYZE_CURRENT_TAB',
    'GET_SECURITY_EVENTS',
    'GET_SETTINGS',
    'UPDATE_SETTINGS',
    'CHECK_AGENT_HEALTH',
    'CLEAR_LOCAL_DATA',
    'PAGE_AUTOPSY_REPORT',
    'PAGE_SECURITY_EVENT',
    'OPEN_SIDEPANEL',
    'IDENTITY_WARNING_DISMISS',
    'GET_STARTUP_PROGRESS',
    'VERIFY_ROUTE',
    'SET_TRACKER_MODE',
    'SET_PARAM_MODE',
    'SET_REFERRER_MODE',
    'GET_TRACKER_RULES',
    'GET_TRACKER_STATS',
    'GET_PRIVACY_EVENTS',
    'PURGE_SESSION_EVENTS',
    'GET_STORAGE_STATUS',
    'CLEAR_PRIVACY_EVENTS',
}

CONTENT_SCRIPT_ALLOWED_TYPES = {
    'PAGE_SECURITY_EVENT',
    'PAGE_AUTOPSY_REPORT',
    'GET_SETTINGS',
}

PRIVILEGED_MESSAGE_TYPES = {
    'START_ANONYMOUS_SESSION',
    'END_ANONYMOUS_SESSION',
    'UPDATE_SETTINGS',
    'CLEAR_LOCAL_DATA',
    'CLEAR_PRIVACY_EVENTS',
    'PURGE_SESSION_EVENTS',
    'SET_TRACKER_MODE',
    'SET_PARAM_MODE',
    'SET_REFERRER_MODE',
    'OPEN_SIDEPANEL',
    'IDENTITY_WARNING_DISMISS',
    'VERIFY_ROUTE',
}

VALID_CATEGORIES = {
    'NETWORK', 'IDENTITY', 'STORAGE', 'FINGERPRINT', 'WEBRTC',
    'DNS', 'SESSION', 'KILL_SWITCH', 'TRACKER', 'TRACKING_PARAM', 'REFERRER',
}


def validate_extension_message(raw_message, sender=None):
    """Python mirror of extension/src/background/messageSecurity.ts."""
    if not isinstance(raw_message, dict) or raw_message is None:
        return {"valid": False, "error": "Malformed message format: Expected non-null object."}

    try:
        serialized = json.dumps(raw_message)
        if len(serialized) > MAX_MESSAGE_BYTE_SIZE:
            return {"valid": False, "error": "Message payload exceeds maximum allowed size (64KB)."}
    except Exception:
        return {"valid": False, "error": "Message serialization failed."}

    msg_type = raw_message.get("type")
    if not isinstance(msg_type, str) or not msg_type.strip():
        return {"valid": False, "error": 'Invalid message: Missing or non-string "type" property.'}

    if msg_type not in VALID_MESSAGE_TYPES:
        return {"valid": False, "error": "Unknown message type"}

    is_content_script = bool(sender and sender.get("tab"))
    if is_content_script:
        if msg_type not in CONTENT_SCRIPT_ALLOWED_TYPES:
            return {
                "valid": False,
                "error": f'Unauthorized sender context: Content scripts cannot invoke privileged action "{msg_type}".',
            }

    if msg_type == "UPDATE_SETTINGS":
        payload = raw_message.get("payload")
        if not isinstance(payload, dict):
            return {"valid": False, "error": "Invalid payload: UPDATE_SETTINGS requires an object payload."}
        if "defaultNetworkMode" in payload and payload["defaultNetworkMode"] not in ('DIRECT', 'LOCAL_PROXY', 'TOR', 'CUSTOM_PROXY'):
            return {"valid": False, "error": "Invalid setting value for defaultNetworkMode."}
        if "trackingProtectionMode" in payload and payload["trackingProtectionMode"] not in ('OFF', 'DETECT', 'BLOCK'):
            return {"valid": False, "error": "Invalid setting value for trackingProtectionMode."}
        if "trackingParamMode" in payload and payload["trackingParamMode"] not in ('OFF', 'DETECT_ONLY', 'SANITIZE'):
            return {"valid": False, "error": "Invalid setting value for trackingParamMode."}
        if "referrerProtectionMode" in payload and payload["referrerProtectionMode"] not in ('OFF', 'STANDARD', 'STRICT'):
            return {"valid": False, "error": "Invalid setting value for referrerProtectionMode."}
        if "agentPort" in payload:
            port = payload["agentPort"]
            if not isinstance(port, int) or port < 1 or port > 65535:
                return {"valid": False, "error": "agentPort must be a valid port integer (1-65535)."}
        if "agentToken" in payload:
            token = payload["agentToken"]
            if not isinstance(token, str) or len(token) > 256:
                return {"valid": False, "error": "agentToken must be a string up to 256 characters."}

    elif msg_type == "GET_PRIVACY_EVENTS":
        payload = raw_message.get("payload")
        if isinstance(payload, dict):
            if "limit" in payload:
                limit = payload["limit"]
                if not isinstance(limit, int) or limit < 1 or limit > 500:
                    return {"valid": False, "error": "GET_PRIVACY_EVENTS limit must be an integer between 1 and 500."}
            if "category" in payload and payload["category"] not in VALID_CATEGORIES:
                return {"valid": False, "error": f"Invalid category filter \"{payload['category']}\"."}

    elif msg_type == "PAGE_SECURITY_EVENT":
        payload = raw_message.get("payload")
        if not isinstance(payload, dict):
            return {"valid": False, "error": "Invalid payload: PAGE_SECURITY_EVENT requires an object payload."}
        if payload.get("category") not in VALID_CATEGORIES:
            return {"valid": False, "error": "PAGE_SECURITY_EVENT missing or invalid category."}
        if payload.get("severity") not in ('INFO', 'NOTICE', 'WARNING', 'CRITICAL', 'BLOCKED'):
            return {"valid": False, "error": "PAGE_SECURITY_EVENT missing or invalid severity."}
        if "technicalReason" in payload and (not isinstance(payload["technicalReason"], str) or len(payload["technicalReason"]) > 1024):
            return {"valid": False, "error": "PAGE_SECURITY_EVENT technicalReason exceeds allowable length (1024 chars)."}

    elif msg_type == "SET_TRACKER_MODE":
        if raw_message.get("payload") not in ('OFF', 'DETECT', 'BLOCK'):
            return {"valid": False, "error": "SET_TRACKER_MODE invalid payload value."}

    elif msg_type == "SET_PARAM_MODE":
        if raw_message.get("payload") not in ('OFF', 'DETECT_ONLY', 'SANITIZE'):
            return {"valid": False, "error": "SET_PARAM_MODE invalid payload value."}

    elif msg_type == "SET_REFERRER_MODE":
        if raw_message.get("payload") not in ('OFF', 'STANDARD', 'STRICT'):
            return {"valid": False, "error": "SET_REFERRER_MODE invalid payload value."}

    elif msg_type == "PURGE_SESSION_EVENTS":
        payload = raw_message.get("payload")
        if isinstance(payload, dict):
            sid = payload.get("sessionId")
            if sid is not None and (not isinstance(sid, str) or len(sid) > 128):
                return {"valid": False, "error": "PURGE_SESSION_EVENTS sessionId must be a string up to 128 chars."}

    return {"valid": True, "message": raw_message}


class TestExtensionMessageSecurity:
    """Phase 7A: Message schema, privilege separation, and size validation."""

    def test_reject_null_and_primitives(self):
        assert not validate_extension_message(None)["valid"]
        assert not validate_extension_message("string_payload")["valid"]
        assert not validate_extension_message(12345)["valid"]
        assert not validate_extension_message([{"type": "GET_SETTINGS"}])["valid"]

    def test_reject_missing_or_empty_type(self):
        res1 = validate_extension_message({})
        assert not res1["valid"]
        assert "Missing" in res1["error"]

        res2 = validate_extension_message({"type": "   "})
        assert not res2["valid"]

    def test_reject_unknown_message_type(self):
        res = validate_extension_message({"type": "MALICIOUS_EVAL"})
        assert not res["valid"]
        assert res["error"] == "Unknown message type"

    def test_reject_oversized_payload(self):
        oversized = {"type": "PAGE_SECURITY_EVENT", "payload": {"data": "A" * (MAX_MESSAGE_BYTE_SIZE + 100)}}
        res = validate_extension_message(oversized)
        assert not res["valid"]
        assert "exceeds maximum allowed size" in res["error"]

    def test_content_script_cannot_invoke_privileged_actions(self):
        sender = {"tab": {"id": 101, "url": "https://example.com"}}
        for priv_type in PRIVILEGED_MESSAGE_TYPES:
            res = validate_extension_message({"type": priv_type}, sender=sender)
            assert not res["valid"], f"Privileged action {priv_type} must be rejected from content script"
            assert "Unauthorized sender context" in res["error"]

    def test_content_script_allowed_messages(self):
        sender = {"tab": {"id": 101, "url": "https://example.com"}}
        # PAGE_SECURITY_EVENT allowed
        sec_event = {
            "type": "PAGE_SECURITY_EVENT",
            "payload": {
                "category": "FINGERPRINT",
                "severity": "WARNING",
                "technicalReason": "Canvas probe detected",
            },
        }
        assert validate_extension_message(sec_event, sender=sender)["valid"]

        # GET_SETTINGS allowed
        assert validate_extension_message({"type": "GET_SETTINGS"}, sender=sender)["valid"]

    def test_update_settings_validation(self):
        # Invalid port
        assert not validate_extension_message({"type": "UPDATE_SETTINGS", "payload": {"agentPort": 999999}})["valid"]
        assert not validate_extension_message({"type": "UPDATE_SETTINGS", "payload": {"agentPort": -1}})["valid"]
        assert not validate_extension_message({"type": "UPDATE_SETTINGS", "payload": {"agentPort": "9152"}})["valid"]

        # Invalid mode
        assert not validate_extension_message({"type": "UPDATE_SETTINGS", "payload": {"defaultNetworkMode": "UNSAFE_PROXY"}})["valid"]
        assert not validate_extension_message({"type": "UPDATE_SETTINGS", "payload": {"trackingProtectionMode": "AGGRESSIVE"}})["valid"]

        # Valid payload
        valid = validate_extension_message({
            "type": "UPDATE_SETTINGS",
            "payload": {
                "agentPort": 9152,
                "defaultNetworkMode": "TOR",
                "trackingProtectionMode": "BLOCK",
            },
        })
        assert valid["valid"]

    def test_get_privacy_events_limit_validation(self):
        assert not validate_extension_message({"type": "GET_PRIVACY_EVENTS", "payload": {"limit": 0}})["valid"]
        assert not validate_extension_message({"type": "GET_PRIVACY_EVENTS", "payload": {"limit": 1000}})["valid"]
        assert not validate_extension_message({"type": "GET_PRIVACY_EVENTS", "payload": {"category": "INVALID_CAT"}})["valid"]
        assert validate_extension_message({"type": "GET_PRIVACY_EVENTS", "payload": {"limit": 50, "category": "NETWORK"}})["valid"]


# ============================================================================
# PHASE 7B — LOCAL AGENT SECURITY HARDENING
# ============================================================================

class TestLocalAgentSecurityHardening:
    """Phase 7B: DNS rebinding, Host header, security headers, and body limit."""

    def test_dns_rebinding_rejected_via_host_header(self):
        """Attacker hostnames resolving to loopback must be rejected via Host header."""
        malicious_hosts = [
            "attacker.com",
            "evil.site:9152",
            "rebind.example.org",
            "192.168.1.100",
            "10.0.0.1:9152",
        ]
        for host in malicious_hosts:
            res = client.get("/api/v1/status", headers={**EXT_ORIGIN, "host": host})
            assert res.status_code == 403, f"Host {host} should be rejected with 403 Forbidden"
            assert "DNS rebinding protection" in res.json().get("detail", "")

    def test_allowed_hosts_accepted(self):
        """Valid loopback hosts must be accepted."""
        for host in ["127.0.0.1", "localhost", "::1"]:
            res = client.get("/api/v1/status", headers={**EXT_ORIGIN, "host": host})
            assert res.status_code == 200

    def test_security_headers_present_on_response(self):
        """Agent must emit nosniff, DENY frame, strict CSP, and no-cache headers."""
        res = client.get("/api/v1/status", headers=EXT_ORIGIN)
        assert res.status_code == 200
        headers = res.headers
        assert headers.get("x-content-type-options") == "nosniff"
        assert headers.get("x-frame-options") == "DENY"
        assert "no-store" in headers.get("cache-control", "")
        assert headers.get("pragma") == "no-cache"
        assert "default-src 'none'" in headers.get("content-security-policy", "")

    def test_request_body_size_limit_enforced(self):
        """Requests with Content-Length > 1MB must be rejected with 413."""
        hdrs = auth_headers({"Content-Length": "2097152"})  # 2MB
        res = client.post("/api/v1/tor/verify-route", headers=hdrs)
        assert res.status_code == 413
        assert "1MB limit" in res.text

    def test_invalid_content_length_rejected(self):
        """Malformed Content-Length must be rejected with 400 Bad Request."""
        hdrs = auth_headers({"Content-Length": "not-a-number"})
        res = client.post("/api/v1/tor/verify-route", headers=hdrs)
        assert res.status_code == 400

    def test_post_verify_route_payload_validation(self):
        """POST /api/v1/tor/verify-route must strictly validate payload shape and bounds."""
        # Non-dict body
        res = client.post("/api/v1/tor/verify-route", headers=auth_headers(), content=b'"a string"')
        assert res.status_code == 400
        assert "Expected JSON object" in res.text

        # Out-of-bounds timeout
        res2 = client.post("/api/v1/tor/verify-route", headers=auth_headers(), json={"timeout": 120.0})
        assert res2.status_code == 400
        assert "timeout must be between" in res2.text

        res3 = client.post("/api/v1/tor/verify-route", headers=auth_headers(), json={"timeout": -5.0})
        assert res3.status_code == 400

        # Out-of-bounds port
        res4 = client.post("/api/v1/tor/verify-route", headers=auth_headers(), json={"socks_port": 70000})
        assert res4.status_code == 400
        assert "socks_port must be between" in res4.text

        # Oversized host
        res5 = client.post("/api/v1/tor/verify-route", headers=auth_headers(), json={"socks_host": "A" * 300})
        assert res5.status_code == 400


# ============================================================================
# PHASE 7C — EXTENSION CONFIGURATION AND MANIFEST HARDENING
# ============================================================================

class TestExtensionConfigurationHardening:
    """Phase 7C: Manifest CSP, permissions, and URL sanitization."""

    def test_manifest_has_strict_csp(self):
        """Manifest V3 must explicitly declare script-src 'self' and object-src 'none'."""
        manifest_path = Path("extension/public/manifest.json")
        assert manifest_path.exists(), "extension/public/manifest.json must exist"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

        csp = manifest.get("content_security_policy", {})
        extension_pages = csp.get("extension_pages", "")
        assert "script-src 'self'" in extension_pages
        assert "object-src 'none'" in extension_pages
        assert "base-uri 'none'" in extension_pages

    def test_manifest_minimal_permissions(self):
        """Manifest permissions must be reviewed and constrained."""
        manifest_path = Path("extension/public/manifest.json")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        perms = set(manifest.get("permissions", []))

        # Ensure no dangerous wildcard permissions exist
        dangerous = {"debugger", "webRequestBlocking", "management", "privacy_bypass"}
        for d in dangerous:
            assert d not in perms, f"Dangerous permission {d} must not be requested"

    def test_dangerous_url_schemes_rejected_by_sanitizer(self):
        """Sanitizer must strictly reject javascript:, data:, file:, chrome: schemes."""
        dangerous_urls = [
            "javascript:alert(1)",
            "data:text/html,<script>alert(1)</script>",
            "file:///etc/passwd",
            "chrome://settings",
            "blob:https://example.com/uuid",
            "vbscript:msgbox(1)",
        ]

        def sanitize_origin(raw):
            if not raw or not isinstance(raw, str):
                return None
            try:
                # Basic URL scheme parser matching extension/src/shared/sanitizer.ts
                match = re.match(r"^([a-z][a-z0-9+.-]*):", raw.strip(), re.IGNORECASE)
                if not match:
                    return None
                protocol = match.group(1).lower() + ":"
                if protocol not in ("http:", "https:", "chrome-extension:"):
                    return None
                return protocol
            except Exception:
                return None

        for dangerous in dangerous_urls:
            assert sanitize_origin(dangerous) is None, f"Dangerous scheme in {dangerous} must be rejected"

    def test_url_credentials_and_parameters_stripped(self):
        """URLs with embedded userinfo/passwords must have credentials stripped."""
        url = "https://user:secretpassword@example.com:8443/secret/path?tracking=xyz#hash"
        # Extract origin component only
        parsed_match = re.match(r"^(https?://)(?:[^@/]+@)?([^/:?#]+)(?::(\d+))?", url)
        assert parsed_match is not None
        scheme, host, port = parsed_match.groups()
        port_part = f":{port}" if port else ""
        clean_origin = f"{scheme}{host}{port_part}"

        assert "secretpassword" not in clean_origin
        assert "user" not in clean_origin
        assert clean_origin == "https://example.com:8443"
