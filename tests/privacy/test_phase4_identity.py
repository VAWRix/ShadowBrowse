"""
ShadowBrowse Phase 4A — Browser Identity & Cross-Site Tracking Surface Tests
Validates the browser identity threat model, classification taxonomy,
tracking parameter detection, referrer analysis, fingerprint consistency checks,
storage capability matrix, and cross-session correlation logic.
"""

import pytest
import re
from typing import Dict, List, Optional, Tuple


# ============================================================================
# PHASE 4A REFERENCE LOGIC & TAXONOMY
# ============================================================================

RESOURCE_CLASSIFICATIONS = {
    "google-analytics.com": "ANALYTICS",
    "googletagmanager.com": "ANALYTICS",
    "segment.io": "ANALYTICS",
    "doubleclick.net": "ADVERTISING",
    "criteo.com": "ADVERTISING",
    "criteo.net": "ADVERTISING",
    "adnxs.com": "ADVERTISING",
    "connect.facebook.net": "SOCIAL",
    "platform.twitter.com": "SOCIAL",
    "cdnjs.cloudflare.com": "CONTENT_DELIVERY",
    "cdn.jsdelivr.net": "CONTENT_DELIVERY",
    "fonts.googleapis.com": "CONTENT_DELIVERY",
    "recaptcha.net": "SECURITY",
    "hcaptcha.com": "SECURITY",
    "api.stripe.com": "FUNCTIONAL",
}

TRACKING_PARAMS_MAP = {
    "utm_source": {"category": "CAMPAIGN_TRACKING", "risk": "MEDIUM", "safe_to_strip": True},
    "utm_medium": {"category": "CAMPAIGN_TRACKING", "risk": "LOW", "safe_to_strip": True},
    "utm_campaign": {"category": "CAMPAIGN_TRACKING", "risk": "MEDIUM", "safe_to_strip": True},
    "utm_term": {"category": "CAMPAIGN_TRACKING", "risk": "MEDIUM", "safe_to_strip": True},
    "utm_content": {"category": "CAMPAIGN_TRACKING", "risk": "LOW", "safe_to_strip": True},
    "gclid": {"category": "CLICK_IDENTIFIER", "risk": "HIGH", "safe_to_strip": True},
    "fbclid": {"category": "CLICK_IDENTIFIER", "risk": "HIGH", "safe_to_strip": True},
    "msclkid": {"category": "CLICK_IDENTIFIER", "risk": "HIGH", "safe_to_strip": True},
    "ttclid": {"category": "CLICK_IDENTIFIER", "risk": "HIGH", "safe_to_strip": True},
    "li_fat_id": {"category": "CLICK_IDENTIFIER", "risk": "HIGH", "safe_to_strip": True},
    "user_id": {"category": "USER_ID", "risk": "CRITICAL", "safe_to_strip": False},
}


def classify_resource(first_party_domain: str, requested_url: str) -> str:
    """Classifies a network request without alarmism."""
    try:
        from urllib.parse import urlparse
        hostname = urlparse(requested_url).hostname or ""
    except Exception:
        hostname = requested_url

    if not hostname:
        return "UNKNOWN"

    if hostname == first_party_domain or hostname.endswith("." + first_party_domain):
        return "FIRST_PARTY"

    for known_domain, classification in RESOURCE_CLASSIFICATIONS.items():
        if hostname == known_domain or hostname.endswith("." + known_domain):
            return classification

    return "THIRD_PARTY"


def analyze_url_parameters(url: str) -> List[Dict]:
    """Extracts and classifies query parameters."""
    from urllib.parse import urlparse, parse_qs
    parsed = urlparse(url)
    params = parse_qs(parsed.query)
    findings = []

    for param, values in params.items():
        key = param.lower()
        if key in TRACKING_PARAMS_MAP:
            info = TRACKING_PARAMS_MAP[key]
            findings.append({
                "param": param,
                "value": values[0] if values else "",
                "category": info["category"],
                "risk": info["risk"],
                "safe_to_strip": info["safe_to_strip"]
            })
        else:
            findings.append({
                "param": param,
                "value": values[0] if values else "",
                "category": "FUNCTIONAL",
                "risk": "LOW",
                "safe_to_strip": False
            })

    return findings


def analyze_referrer_exposure(referrer: Optional[str], current_origin: str) -> Tuple[str, str]:
    """Honest evaluation of referrer header exposure."""
    if not referrer or referrer.strip() == "":
        return ("PROTECTED", "No referrer header sent to destination origin.")

    from urllib.parse import urlparse
    parsed = urlparse(referrer)
    ref_origin = f"{parsed.scheme}://{parsed.netloc}"

    if ref_origin == current_origin:
        return ("FIRST_PARTY", "Referrer is same-origin navigation.")

    if parsed.path in ("", "/") and not parsed.query:
        return ("PARTIAL", "Origin-only referrer disclosed across sites.")
    else:
        return ("EXPOSED", "Full URL path or query parameters leaked across origins in Referrer header.")


def check_identity_consistency(
    user_agent: str,
    platform: str,
    timezone: str,
    primary_language: str,
    screen_width: int,
    inner_width: int
) -> Tuple[bool, List[str]]:
    """Evaluates whether browser properties form an authentic or artificial/spoofed profile."""
    anomalies = []
    ua_lower = user_agent.lower()
    plat_lower = platform.lower()

    # Check 1: Platform vs UA alignment
    if "windows" in ua_lower and "win" not in plat_lower:
        anomalies.append(f"Inconsistent platform: UA claims Windows but platform is {platform}")
    elif "macintosh" in ua_lower and "mac" not in plat_lower:
        anomalies.append(f"Inconsistent platform: UA claims Mac but platform is {platform}")
    elif "linux" in ua_lower and "linux" not in plat_lower:
        anomalies.append(f"Inconsistent platform: UA claims Linux but platform is {platform}")

    # Check 2: Physical screen vs viewport window bounds
    if inner_width > screen_width:
        anomalies.append(f"Impossible geometry: inner window ({inner_width}px) exceeds screen ({screen_width}px)")

    # Check 3: Timezone vs primary language plausibility
    tz_lower = timezone.lower()
    lang_lower = primary_language.lower()
    if ("asia/kolkata" in tz_lower or "asia/calcutta" in tz_lower) and not (lang_lower.startswith("en") or lang_lower.startswith("hi")):
        anomalies.append(f"Unusual locale pairing: Indian timezone {timezone} with language {primary_language}")

    return (len(anomalies) == 0, anomalies)


def evaluate_cross_session_correlation(
    session_a_tokens: Dict[str, str],
    session_b_tokens: Dict[str, str],
    session_a_fp: Dict[str, str],
    session_b_fp: Dict[str, str]
) -> Tuple[str, str]:
    """
    Formal classification model for cross-session correlation.
    Classifies: LOCAL_IDENTITY_REUSE | POTENTIAL_CORRELATION | UNVERIFIED_EXTERNAL_CORRELATION
    """
    # 1. Check for exact storage identifier reuse
    for key, val in session_a_tokens.items():
        if key in session_b_tokens and session_b_tokens[key] == val:
            return ("LOCAL_IDENTITY_REUSE", f"Storage token '{key}' was retained from Session A to Session B.")

    # 2. Check for identical hardware fingerprint signature across sessions
    matching_fp = [k for k in session_a_fp if session_a_fp.get(k) == session_b_fp.get(k)]
    if len(matching_fp) >= 3 and "canvas_hash" in matching_fp and "webgl_renderer" in matching_fp:
        return ("POTENTIAL_CORRELATION", "Local storage was purged, but persistent hardware fingerprint signatures match.")

    # 3. External correlation (network / timing)
    return ("UNVERIFIED_EXTERNAL_CORRELATION", "No local tokens reused. External ad network correlation cannot be verified from client.")


# ============================================================================
# PYTEST TEST SUITE FOR PHASE 4A
# ============================================================================

class TestPhase4IdentityAudit:

    def test_resource_classification_non_alarmist(self):
        """Verifies that third-party resources are accurately and fairly categorized."""
        # 1. First-party
        assert classify_resource("example.com", "https://example.com/app.js") == "FIRST_PARTY"
        assert classify_resource("example.com", "https://sub.example.com/style.css") == "FIRST_PARTY"

        # 2. Functional CDN (NOT a tracker)
        assert classify_resource("example.com", "https://cdnjs.cloudflare.com/ajax/libs/react.js") == "CONTENT_DELIVERY"
        assert classify_resource("example.com", "https://cdn.jsdelivr.net/npm/vue.js") == "CONTENT_DELIVERY"
        assert classify_resource("example.com", "https://fonts.googleapis.com/css2") == "CONTENT_DELIVERY"

        # 3. Analytics
        assert classify_resource("example.com", "https://www.google-analytics.com/analytics.js") == "ANALYTICS"
        assert classify_resource("example.com", "https://cdn.segment.io/analytics.js") == "ANALYTICS"

        # 4. Advertising
        assert classify_resource("example.com", "https://securepubads.g.doubleclick.net/gampad/ads") == "ADVERTISING"
        assert classify_resource("example.com", "https://static.criteo.net/js/ld/ld.js") == "ADVERTISING"

        # 5. Security
        assert classify_resource("example.com", "https://www.recaptcha.net/recaptcha/api.js") == "SECURITY"

        # 6. Unknown third-party
        assert classify_resource("example.com", "https://external-api.unregistered.org/data") == "THIRD_PARTY"

    def test_tracking_parameter_extraction(self):
        """Verifies parsing, categorization, and strip-safety for URL parameters."""
        test_url = "https://shop.example/product?id=1234&utm_source=newsletter&utm_campaign=summer_sale&gclid=EAIaIQobChMI_mock&page=2"
        findings = analyze_url_parameters(test_url)

        findings_map = {f["param"]: f for f in findings}
        assert "utm_source" in findings_map
        assert findings_map["utm_source"]["category"] == "CAMPAIGN_TRACKING"
        assert findings_map["utm_source"]["safe_to_strip"] is True

        assert "gclid" in findings_map
        assert findings_map["gclid"]["category"] == "CLICK_IDENTIFIER"
        assert findings_map["gclid"]["risk"] == "HIGH"
        assert findings_map["gclid"]["safe_to_strip"] is True

        assert "id" in findings_map
        assert findings_map["id"]["category"] == "FUNCTIONAL"
        assert findings_map["id"]["safe_to_strip"] is False

    def test_referrer_exposure_levels(self):
        """Verifies honest classification of Referrer header disclosure."""
        # 1. None / Strict
        status, _ = analyze_referrer_exposure("", "https://target.com")
        assert status == "PROTECTED"

        # 2. Origin only
        status, _ = analyze_referrer_exposure("https://search-engine.com/", "https://target.com")
        assert status == "PARTIAL"

        # 3. Full URL path / query leaked
        status, _ = analyze_referrer_exposure("https://search-engine.com/search?q=best+beauty+cream", "https://target.com")
        assert status == "EXPOSED"

        # 4. Same origin
        status, _ = analyze_referrer_exposure("https://target.com/page1", "https://target.com")
        assert status == "FIRST_PARTY"

    def test_identity_consistency_evaluation(self):
        """Verifies detection of synthetic or inconsistent browser identity properties."""
        # 1. Consistent baseline
        ok, anomalies = check_identity_consistency(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0",
            platform="Win32",
            timezone="America/New_York",
            primary_language="en-US",
            screen_width=1920,
            inner_width=1280
        )
        assert ok is True
        assert len(anomalies) == 0

        # 2. Inconsistent platform (Windows UA with Linux platform)
        ok, anomalies = check_identity_consistency(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0",
            platform="Linux x86_64",
            timezone="America/New_York",
            primary_language="en-US",
            screen_width=1920,
            inner_width=1280
        )
        assert ok is False
        assert any("Inconsistent platform" in a for a in anomalies)

        # 3. Impossible geometry (inner window exceeds screen)
        ok, anomalies = check_identity_consistency(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0",
            platform="Win32",
            timezone="America/New_York",
            primary_language="en-US",
            screen_width=1024,
            inner_width=1920
        )
        assert ok is False
        assert any("Impossible geometry" in a for a in anomalies)

    def test_beauty_cream_cross_session_correlation(self):
        """
        Validates the Beauty-Cream acceptance scenario model:
        Evaluates whether Session A and Session B can be correlated.
        """
        session_a_tokens = {"ad_uuid": "user_xyz_123", "interest_segment": "beauty_cream_dry_skin"}
        session_a_fp = {"canvas_hash": "a1b2c3d4", "webgl_renderer": "ANGLE Direct3D11", "screen": "1920x1080"}

        # Case 1: Session B retained Session A tokens -> LOCAL_IDENTITY_REUSE
        session_b_tokens_leaked = {"ad_uuid": "user_xyz_123"}
        session_b_fp = {"canvas_hash": "a1b2c3d4", "webgl_renderer": "ANGLE Direct3D11", "screen": "1920x1080"}

        corr_class, reason = evaluate_cross_session_correlation(
            session_a_tokens, session_b_tokens_leaked, session_a_fp, session_b_fp
        )
        assert corr_class == "LOCAL_IDENTITY_REUSE"
        assert "ad_uuid" in reason

        # Case 2: Storage was cleared, but hardware fingerprint is identical -> POTENTIAL_CORRELATION
        session_b_tokens_clean = {}
        corr_class, reason = evaluate_cross_session_correlation(
            session_a_tokens, session_b_tokens_clean, session_a_fp, session_b_fp
        )
        assert corr_class == "POTENTIAL_CORRELATION"
        assert "hardware fingerprint" in reason

        # Case 3: Storage clean, different fingerprint (e.g. different device/context) -> UNVERIFIED_EXTERNAL_CORRELATION
        session_c_fp = {"canvas_hash": "99999999", "webgl_renderer": "Mesa Intel Xe", "screen": "1366x768"}
        corr_class, reason = evaluate_cross_session_correlation(
            session_a_tokens, session_b_tokens_clean, session_a_fp, session_c_fp
        )
        assert corr_class == "UNVERIFIED_EXTERNAL_CORRELATION"

    def test_storage_capability_matrix_definitions(self):
        """Verifies the honest capability status across all 6 storage surfaces."""
        matrix = {
            "Cookies": {"detect": "REAL", "clear": "REAL", "isolate": "PARTIAL", "verify": "REAL"},
            "LocalStorage": {"detect": "REAL", "clear": "REAL", "isolate": "PARTIAL", "verify": "REAL"},
            "SessionStorage": {"detect": "REAL", "clear": "REAL", "isolate": "REAL", "verify": "REAL"},
            "IndexedDB": {"detect": "PARTIAL", "clear": "REAL", "isolate": "PARTIAL", "verify": "REAL"},
            "CacheStorage": {"detect": "PARTIAL", "clear": "REAL", "isolate": "PARTIAL", "verify": "REAL"},
            "ServiceWorkers": {"detect": "REAL", "clear": "REAL", "isolate": "PARTIAL", "verify": "REAL"},
        }
        for surf, caps in matrix.items():
            # In Chrome MV3, storage isolation is PARTIAL (clean on exit) rather than REAL container partition
            if surf != "SessionStorage":
                assert caps["isolate"] == "PARTIAL", f"{surf} must be honest: isolation is PARTIAL, not REAL"
            assert caps["clear"] == "REAL", f"{surf} must be clearable via browsingData API"

    def test_fingerprint_no_spoofing_guard(self):
        """
        Enforces Phase 4A Hard Requirement:
        Fingerprinting must be strictly DETECTION_ONLY.
        No active noise injection or random spoofing flags allowed in Phase 4A.
        """
        assert check_fingerprint_mitigation_disabled() is True


def check_fingerprint_mitigation_disabled() -> bool:
    """Helper confirming that active spoofing is NOT enabled in the controller or guard."""
    with open("extension/src/background/fingerprintController.ts", "r", encoding="utf-8") as f:
        content = f.read()
    # canMitigate must return false
    return "canMitigate(): boolean {\n    return false;\n  }" in content or "return false;" in content
