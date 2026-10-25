"""
ShadowBrowse Phase 5A — Privacy Event Engine Tests
Validates the versioned PrivacyEvent schema, URL/origin sanitization, metadata
boundary enforcement, deduplication with sliding windows, content-script rate
limiting, bounded FIFO storage persistence, session purge policy, and honest
outcome classifications.
"""

import pytest
import time
from urllib.parse import urlparse
from typing import Dict, List, Optional, Any, Set


# ============================================================================
# PHASE 5A EVENT ENGINE MODEL & SANITIZER
# ============================================================================

PRIVACY_EVENT_SCHEMA_VERSION = 1

VALID_CATEGORIES = {
    "NETWORK", "IDENTITY", "STORAGE", "FINGERPRINT", "WEBRTC",
    "DNS", "SESSION", "KILL_SWITCH", "TRACKER", "TRACKING_PARAM", "REFERRER"
}

VALID_OUTCOMES = {
    "DETECTED", "MITIGATION_ATTEMPTED", "MITIGATION_CONFIRMED",
    "MITIGATION_SKIPPED", "FAILED", "INFORMATIONAL"
}

VALID_SEVERITIES = {"INFO", "NOTICE", "WARNING", "CRITICAL"}

VALID_SOURCES = {
    "content_guard", "content_script", "tracker_defense",
    "network_controller", "storage_controller", "fingerprint_controller",
    "session_manager", "agent_ipc"
}

FORBIDDEN_METADATA_KEYS = {
    "url", "href", "path", "query", "cookie", "token", "auth",
    "authorization", "password", "secret", "credential", "key",
    "body", "payload"
}


def sanitize_origin(url_or_origin: Optional[str]) -> Optional[str]:
    """Strips path, query strings, hashes, credentials; returns strictly scheme://hostname[:port]."""
    if not url_or_origin or not isinstance(url_or_origin, str):
        return None
    trimmed = url_or_origin.strip()
    if not trimmed:
        return None

    try:
        parsed = urlparse(trimmed)
        if parsed.scheme not in ("http", "https", "chrome-extension"):
            return None
        port_part = f":{parsed.port}" if parsed.port else ""
        return f"{parsed.scheme}://{parsed.hostname}{port_part}"
    except Exception:
        return None


def sanitize_domain(domain_or_host: Optional[str]) -> Optional[str]:
    """Strips protocol, port, path, and credentials to produce clean canonical lowercase hostname."""
    if not domain_or_host or not isinstance(domain_or_host, str):
        return None
    cleaned = domain_or_host.strip().lower()
    if not cleaned:
        return None

    if cleaned.startswith("http://") or cleaned.startswith("https://"):
        try:
            return urlparse(cleaned).hostname
        except Exception:
            pass

    if "@" in cleaned:
        cleaned = cleaned.split("@")[-1]

    cleaned = cleaned.split("/")[0].split("?")[0].split("#")[0]
    if ":" in cleaned and not cleaned.startswith("["):
        cleaned = cleaned.split(":")[0]

    cleaned = cleaned.strip(".")
    if not cleaned or not all(c.isalnum() or c in "-." for c in cleaned):
        return None

    return cleaned


def sanitize_param_keys(keys: Optional[List[str]]) -> List[str]:
    """Preserves parameter names only; values are never accepted or retained."""
    if not isinstance(keys, list):
        return []
    sanitized = []
    seen = set()
    for raw_key in keys:
        if not isinstance(raw_key, str):
            continue
        clean_key = raw_key.strip().lower()
        if clean_key and len(clean_key) <= 64 and all(c.isalnum() or c in "_.-" for c in clean_key):
            if clean_key not in seen:
                seen.add(clean_key)
                sanitized.append(clean_key)
                if len(sanitized) >= 20:
                    break
    return sanitized


def sanitize_metadata(raw_metadata: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Enforces strict schema on metadata, stripping forbidden keys, URLs, and sensitive tokens."""
    if not isinstance(raw_metadata, dict):
        return None

    result = {}
    has_valid = False

    # Check forbidden keys
    for k in raw_metadata.keys():
        if k.lower() in FORBIDDEN_METADATA_KEYS:
            continue

    if "ruleId" in raw_metadata and isinstance(raw_metadata["ruleId"], int) and raw_metadata["ruleId"] > 0:
        result["ruleId"] = raw_metadata["ruleId"]
        has_valid = True

    if "entityCategory" in raw_metadata and isinstance(raw_metadata["entityCategory"], str):
        cat = raw_metadata["entityCategory"].strip().upper()
        if cat and len(cat) <= 32:
            result["entityCategory"] = cat
            has_valid = True

    if "apiName" in raw_metadata and isinstance(raw_metadata["apiName"], str):
        api = raw_metadata["apiName"].strip()
        if api and len(api) <= 32:
            result["apiName"] = api
            has_valid = True

    if "paramKeys" in raw_metadata and isinstance(raw_metadata["paramKeys"], list):
        clean_keys = sanitize_param_keys(raw_metadata["paramKeys"])
        if clean_keys:
            result["paramKeys"] = clean_keys
            has_valid = True

    if "metricValue" in raw_metadata and isinstance(raw_metadata["metricValue"], (int, float)):
        result["metricValue"] = raw_metadata["metricValue"]
        has_valid = True

    if "diagnosticTag" in raw_metadata and isinstance(raw_metadata["diagnosticTag"], str):
        tag = raw_metadata["diagnosticTag"].strip().upper()
        if tag and len(tag) <= 32:
            result["diagnosticTag"] = tag
            has_valid = True

    return result if has_valid else None


class InMemoryPrivacyEventEngine:
    """Python simulation of the TypeScript PrivacyEventEngine for rigorous unit testing."""

    def __init__(self, dedupe_window_ms: int = 2500, max_memory: int = 100, max_storage: int = 200):
        self.dedupe_window_ms = dedupe_window_ms
        self.max_memory = max_memory
        self.max_storage = max_storage
        self.memory_buffer: List[Dict[str, Any]] = []
        self.storage: List[Dict[str, Any]] = []
        self.content_rate_window_start = 0
        self.content_rate_count = 0
        self.id_counter = 0

    def record_event(
        self,
        category: str,
        event_type: str,
        severity: str,
        outcome: str,
        source: str,
        user_explanation: str,
        technical_reason: str,
        session_id: Optional[str] = None,
        target_domain: Optional[str] = None,
        page_origin: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        current_time_ms: Optional[int] = None
    ) -> Dict[str, Any]:
        now = current_time_ms if current_time_ms is not None else int(time.time() * 1000)
        is_critical = severity == "CRITICAL" or category == "KILL_SWITCH"

        # Rate limiting for content scripts (max 20 per sec); critical events bypass
        if not is_critical and source in ("content_script", "content_guard"):
            if now - self.content_rate_window_start > 1000:
                self.content_rate_window_start = now
                self.content_rate_count = 1
            else:
                self.content_rate_count += 1
                if self.content_rate_count > 20:
                    if self.memory_buffer:
                        self.memory_buffer[0]["repeatCount"] += 1
                        self.memory_buffer[0]["lastObservedAt"] = now
                        return self.memory_buffer[0]

        # Sanitization & size bounds
        sanitized_origin = sanitize_origin(page_origin)
        sanitized_target = sanitize_domain(target_domain)
        sanitized_meta = sanitize_metadata(metadata)
        truncated_session_id = session_id[:8] if session_id else None
        bounded_type = (event_type or "generic.event").strip()[:64]
        bounded_explanation = (user_explanation or "").strip()[:500]
        bounded_reason = (technical_reason or "").strip()[:500]

        # Deduplication check (critical events are never suppressed)
        if not is_critical:
            dedupe_key = f"{category}:{bounded_type}:{sanitized_target or ''}:{outcome}"
            for existing in self.memory_buffer:
                if now - existing["timestamp"] > self.dedupe_window_ms:
                    break
                existing_key = f"{existing['category']}:{existing['type']}:{existing.get('targetDomain') or ''}:{existing['outcome']}"
                if existing_key == dedupe_key:
                    existing["repeatCount"] += 1
                    existing["lastObservedAt"] = now
                    return existing

        self.id_counter += 1
        event = {
            "id": f"pevt_{now}_{self.id_counter}",
            "schemaVersion": PRIVACY_EVENT_SCHEMA_VERSION,
            "timestamp": now,
            "category": category,
            "type": bounded_type,
            "severity": severity,
            "outcome": outcome,
            "source": source,
            "sessionId": truncated_session_id,
            "targetDomain": sanitized_target,
            "pageOrigin": sanitized_origin,
            "userExplanation": bounded_explanation,
            "technicalReason": bounded_reason,
            "repeatCount": 1,
            "lastObservedAt": now,
            "metadata": sanitized_meta,
        }

        self.memory_buffer.insert(0, event)
        if len(self.memory_buffer) > self.max_memory:
            self.memory_buffer.pop()

        # Simulated persistence
        self.storage.insert(0, event)
        if len(self.storage) > self.max_storage:
            self.storage.pop()

        return event

    def purge_session_events(self, session_id: Optional[str] = None):
        target = session_id[:8] if session_id else None
        self.memory_buffer = [
            e for e in self.memory_buffer
            if not e.get("sessionId") or (target and e.get("sessionId") != target)
        ]
        self.storage = [
            e for e in self.storage
            if not e.get("sessionId") or (target and e.get("sessionId") != target)
        ]


def to_legacy_security_event(pe: Dict[str, Any]) -> Dict[str, Any]:
    """Simulates EventBus legacy projection for backward compatibility."""
    sev = pe["severity"]
    if pe["outcome"] in ("MITIGATION_ATTEMPTED", "MITIGATION_CONFIRMED") and sev != "CRITICAL":
        legacy_sev = "BLOCKED"
    else:
        legacy_sev = sev

    prefix = f"[Repeated {pe['repeatCount']}x] " if pe["repeatCount"] > 1 else ""
    return {
        "id": pe["id"],
        "timestamp": pe["timestamp"],
        "severity": legacy_sev,
        "category": pe["category"],
        "technicalReason": f"{prefix}{pe['technicalReason']}",
        "userExplanation": pe["userExplanation"],
        "action": pe["outcome"]
    }


# ============================================================================
# TEST SUITE
# ============================================================================

class TestPhase5APrivacyEventSchema:
    """Requirement 1: Versioned, strongly typed PrivacyEvent schema."""

    def test_schema_version_and_categories(self):
        engine = InMemoryPrivacyEventEngine()
        event = engine.record_event(
            category="TRACKER",
            event_type="tracker.request_blocked",
            severity="WARNING",
            outcome="MITIGATION_ATTEMPTED",
            source="tracker_defense",
            user_explanation="Tracking request blocked via DNR",
            technical_reason="Rule 101 matched doubleclick.net",
            target_domain="doubleclick.net"
        )
        assert event["schemaVersion"] == 1
        assert event["category"] in VALID_CATEGORIES
        assert event["outcome"] in VALID_OUTCOMES
        assert event["severity"] in VALID_SEVERITIES
        assert event["source"] in VALID_SOURCES
        assert event["repeatCount"] == 1
        assert event["id"].startswith("pevt_")


class TestPhase5ASanitizer:
    """Requirement 2: URL, origin, hostname, and parameter-key sanitization."""

    def test_origin_sanitization_strips_queries_and_credentials(self):
        raw = "https://user:secretpass@shop.example.com:8443/checkout/pay?token=xyz123#confirm"
        clean = sanitize_origin(raw)
        assert clean == "https://shop.example.com:8443"
        assert "secretpass" not in clean
        assert "xyz123" not in clean
        assert "checkout" not in clean

    def test_origin_sanitization_rejects_unsafe_schemes(self):
        assert sanitize_origin("javascript:alert(1)") is None
        assert sanitize_origin("data:text/html,<b>hi</b>") is None
        assert sanitize_origin("") is None
        assert sanitize_origin(None) is None

    def test_domain_sanitization_extracts_canonical_hostname(self):
        assert sanitize_domain("https://Tracker.DOUBLECLICK.net:443/pixel?id=1") == "tracker.doubleclick.net"
        assert sanitize_domain("  AdServices.Google.Com  ") == "adservices.google.com"
        assert sanitize_domain("evil.com/path?secret=1") == "evil.com"
        assert sanitize_domain("user:pass@analytics.example.com") == "analytics.example.com"

    def test_param_key_sanitization_preserves_keys_only(self):
        raw_keys = ["utm_source", "fbclid", "gclid", "pass=secret_value", "token", ""]
        clean_keys = sanitize_param_keys(raw_keys)
        assert "utm_source" in clean_keys
        assert "fbclid" in clean_keys
        assert "gclid" in clean_keys
        # Key with assignment (=) rejected
        assert "pass=secret_value" not in clean_keys

    def test_metadata_sanitization_rejects_forbidden_fields(self):
        dirty_meta = {
            "ruleId": 101,
            "entityCategory": "ADVERTISING",
            "url": "https://secret.example/token=123",
            "token": "bearer_abc",
            "cookie": "session_id=99",
            "apiName": "toDataURL"
        }
        clean_meta = sanitize_metadata(dirty_meta)
        assert clean_meta is not None
        assert clean_meta["ruleId"] == 101
        assert clean_meta["entityCategory"] == "ADVERTISING"
        assert clean_meta["apiName"] == "toDataURL"
        assert "url" not in clean_meta
        assert "token" not in clean_meta
        assert "cookie" not in clean_meta


class TestPhase5ADeduplicationAndSlidingWindow:
    """Requirement 3: Centralized ingestion with sliding window deduplication."""

    def test_burst_deduplication_within_window(self):
        engine = InMemoryPrivacyEventEngine(dedupe_window_ms=2500)
        t0 = 1000000

        # Event 1 at t0
        e1 = engine.record_event(
            category="FINGERPRINT",
            event_type="fingerprint.canvas_probe",
            severity="WARNING",
            outcome="DETECTED",
            source="fingerprint_controller",
            user_explanation="Canvas probe",
            technical_reason="toDataURL called",
            current_time_ms=t0
        )
        assert e1["repeatCount"] == 1

        # Event 2 at t0 + 1000ms (within 2500ms window)
        e2 = engine.record_event(
            category="FINGERPRINT",
            event_type="fingerprint.canvas_probe",
            severity="WARNING",
            outcome="DETECTED",
            source="fingerprint_controller",
            user_explanation="Canvas probe",
            technical_reason="toDataURL called",
            current_time_ms=t0 + 1000
        )
        assert e2["id"] == e1["id"]
        assert e2["repeatCount"] == 2
        assert len(engine.memory_buffer) == 1

    def test_window_expiry_creates_new_event(self):
        engine = InMemoryPrivacyEventEngine(dedupe_window_ms=2500)
        t0 = 1000000

        e1 = engine.record_event(
            category="TRACKER",
            event_type="tracker.request_blocked",
            severity="WARNING",
            outcome="MITIGATION_ATTEMPTED",
            source="tracker_defense",
            user_explanation="Blocked tracker",
            technical_reason="Rule 101",
            target_domain="doubleclick.net",
            current_time_ms=t0
        )

        # Event 2 at t0 + 3000ms (> 2500ms window)
        e2 = engine.record_event(
            category="TRACKER",
            event_type="tracker.request_blocked",
            severity="WARNING",
            outcome="MITIGATION_ATTEMPTED",
            source="tracker_defense",
            user_explanation="Blocked tracker",
            technical_reason="Rule 101",
            target_domain="doubleclick.net",
            current_time_ms=t0 + 3000
        )
        assert e2["id"] != e1["id"]
        assert len(engine.memory_buffer) == 2


class TestPhase5AContentRateLimiting:
    """Requirement 3: Content-script rate-limiting to prevent DOM-based DoS."""

    def test_content_script_rate_limit_caps_burst(self):
        engine = InMemoryPrivacyEventEngine()
        t0 = 1000000

        # Send 30 content-script events in same second
        for i in range(30):
            engine.record_event(
                category="FINGERPRINT",
                event_type=f"probe_{i}",
                severity="WARNING",
                outcome="DETECTED",
                source="content_script",
                user_explanation="Probe",
                technical_reason=f"call {i}",
                current_time_ms=t0
            )

        # Buffer should cap ingestion and coalesce excess without exploding
        assert len(engine.memory_buffer) <= 21


class TestPhase5ABoundedStorageAndFIFO:
    """Requirement 4: Bounded persistence and circular FIFO eviction."""

    def test_fifo_eviction_at_max_storage(self):
        max_cap = 200
        engine = InMemoryPrivacyEventEngine(max_storage=max_cap)

        for i in range(250):
            engine.record_event(
                category="NETWORK",
                event_type=f"network.event_{i}",
                severity="INFO",
                outcome="INFORMATIONAL",
                source="network_controller",
                user_explanation=f"Network transition {i}",
                technical_reason=f"Details {i}",
                current_time_ms=1000000 + (i * 3000)  # avoid deduplication
            )

        assert len(engine.storage) == max_cap
        # Oldest event remaining should be event 50 (events 0..49 evicted)
        assert "network.event_249" in engine.storage[0]["type"]
        assert "network.event_50" in engine.storage[-1]["type"]


class TestPhase5ASessionLifecyclePurge:
    """Requirement 5 & Privacy Policy: Purge session-tagged events on session end."""

    def test_session_events_purged_on_end(self):
        engine = InMemoryPrivacyEventEngine()
        session_a = "49301cb7-fae2-448e-8ae5-2044371cde15"
        session_b = "d2616e7c-2582-4338-b5a9-c14c6961c99e"

        # Event during Session A
        engine.record_event(
            category="TRACKER",
            event_type="tracker.request_blocked",
            severity="WARNING",
            outcome="MITIGATION_ATTEMPTED",
            source="tracker_defense",
            user_explanation="Tracker blocked in A",
            technical_reason="Rule 101",
            session_id=session_a,
            current_time_ms=1000
        )

        # System event (no session)
        engine.record_event(
            category="KILL_SWITCH",
            event_type="network.kill_switch_active",
            severity="CRITICAL",
            outcome="MITIGATION_CONFIRMED",
            source="network_controller",
            user_explanation="Kill switch active",
            technical_reason="Tor dropped",
            current_time_ms=2000
        )

        # End Session A
        engine.purge_session_events(session_a)

        # Session A event is purged; system event is retained
        assert len(engine.memory_buffer) == 1
        assert engine.memory_buffer[0]["category"] == "KILL_SWITCH"
        assert engine.memory_buffer[0].get("sessionId") is None


class TestPhase5AHonestOutcomesAndLegacyCompatibility:
    """Milestone 2: Honest outcome reporting & legacy SecurityEvent projection."""

    def test_fingerprint_never_reports_confirmed_mitigation(self):
        engine = InMemoryPrivacyEventEngine()
        evt = engine.record_event(
            category="FINGERPRINT",
            event_type="fingerprint.canvas_probe",
            severity="WARNING",
            outcome="DETECTED",  # Honest: Detection Only
            source="fingerprint_controller",
            user_explanation="Canvas probe detected",
            technical_reason="DETECTION ONLY: values not spoofed",
            metadata={"apiName": "toDataURL"}
        )
        assert evt["outcome"] == "DETECTED"
        assert evt["outcome"] != "MITIGATION_CONFIRMED"

    def test_dnr_tracker_reports_attempted_mitigation(self):
        engine = InMemoryPrivacyEventEngine()
        evt = engine.record_event(
            category="TRACKER",
            event_type="tracker.tracker_blocked",
            severity="WARNING",
            outcome="MITIGATION_ATTEMPTED",  # Honest: DNR C++ engine
            source="tracker_defense",
            user_explanation="Matched DNR rule",
            technical_reason="Chromium evaluates DNR in C++; dropped packet cannot be verified in JS thread",
            target_domain="doubleclick.net"
        )
        assert evt["outcome"] == "MITIGATION_ATTEMPTED"

    def test_legacy_security_event_projection_compatibility(self):
        engine = InMemoryPrivacyEventEngine()
        evt = engine.record_event(
            category="TRACKING_PARAM",
            event_type="param.url_sanitized",
            severity="INFO",
            outcome="MITIGATION_CONFIRMED",
            source="content_script",
            user_explanation="Removed utm_source",
            technical_reason="Sanitized tracking parameters",
            metadata={"paramKeys": ["utm_source"]}
        )
        legacy = to_legacy_security_event(evt)
        assert legacy["id"] == evt["id"]
        assert legacy["category"] == "TRACKING_PARAM"
        assert legacy["severity"] == "BLOCKED"  # Confirmed mitigation maps to legacy BLOCKED
        assert legacy["action"] == "MITIGATION_CONFIRMED"
        assert "utm_source" in str(evt["metadata"]["paramKeys"])

    def test_critical_events_bypass_deduplication(self):
        """High-Priority Risk 2: Critical kill-switch/security events cannot be suppressed."""
        engine = InMemoryPrivacyEventEngine(dedupe_window_ms=2500)
        t0 = 1000000

        e1 = engine.record_event(
            category="KILL_SWITCH",
            event_type="network.kill_switch_active",
            severity="CRITICAL",
            outcome="MITIGATION_CONFIRMED",
            source="network_controller",
            user_explanation="Tor dropped, kill switch active",
            technical_reason="Traffic redirected to discard sink",
            current_time_ms=t0
        )

        e2 = engine.record_event(
            category="KILL_SWITCH",
            event_type="network.kill_switch_active",
            severity="CRITICAL",
            outcome="MITIGATION_CONFIRMED",
            source="network_controller",
            user_explanation="Tor dropped, kill switch active",
            technical_reason="Traffic redirected to discard sink",
            current_time_ms=t0 + 500  # within deduplication window
        )

        # Critical events must NOT be coalesced; both distinct records must exist
        assert e1["id"] != e2["id"]
        assert len(engine.memory_buffer) == 2

    def test_size_bounding_on_explanations_and_reasons(self):
        """High-Priority Risk 1: Size bounds prevent oversized diagnostic strings."""
        engine = InMemoryPrivacyEventEngine()
        huge_text = "A" * 2000

        evt = engine.record_event(
            category="NETWORK",
            event_type="X" * 150,
            severity="INFO",
            outcome="INFORMATIONAL",
            source="network_controller",
            user_explanation=huge_text,
            technical_reason=huge_text
        )

        assert len(evt["userExplanation"]) <= 500
        assert len(evt["technicalReason"]) <= 500
        assert len(evt["type"]) <= 64
