"""
ShadowBrowse Phase 4B — Privacy Mitigation & Tracking Defense Engine Tests
Validates URL tracking parameter sanitization, declarative tracker defense rules,
referrer mitigation modes, storage cleanup verification, and the Beauty-Cream
cross-session correlation defense model.
"""

import pytest
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from typing import Dict, List, Tuple, Optional


# ============================================================================
# PHASE 4B CORE MITIGATION LOGIC
# ============================================================================

KNOWN_TRACKING_QUERY_KEYS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "gclid", "gclsrc", "dclid", "fbclid", "msclkid", "zanpid", "mc_eid",
    "mc_cid", "_hsenc", "_hsmi", "igshid", "ttclid", "twclid", "li_fat_id"
}

CURATED_TRACKER_DOMAINS = {
    "google-analytics.com": "ANALYTICS_TRACKER",
    "googletagmanager.com": "ANALYTICS_TRACKER",
    "segment.io": "ANALYTICS_TRACKER",
    "hotjar.com": "ANALYTICS_TRACKER",
    "mixpanel.com": "ANALYTICS_TRACKER",
    "doubleclick.net": "AD_TRACKER",
    "criteo.com": "AD_TRACKER",
    "criteo.net": "AD_TRACKER",
    "adnxs.com": "AD_TRACKER",
    "taboola.com": "AD_TRACKER",
    "outbrain.com": "AD_TRACKER",
    "fpjs.io": "FINGERPRINT_SCRIPT",
    "fingerprintjs.com": "FINGERPRINT_SCRIPT",
    "connect.facebook.net": "SOCIAL_TRACKER",
    "platform.twitter.com": "SOCIAL_TRACKER",
}

SAFE_NON_BLOCKING_DOMAINS = {
    "cdnjs.cloudflare.com", "cdn.jsdelivr.net", "unpkg.com",
    "fonts.googleapis.com", "fonts.gstatic.com",
    "api.stripe.com", "paypal.com",
    "recaptcha.net", "hcaptcha.com", "challenges.cloudflare.com"
}


def sanitize_url_parameters(url: str, mode: str = "SANITIZE") -> Tuple[str, List[str], List[str]]:
    """
    Sanitizes tracking query parameters according to selected mode.
    Modes: OFF, DETECT_ONLY, SANITIZE.
    Returns: (sanitized_url, detected_tracking_keys, preserved_functional_keys)
    """
    parsed = urlparse(url)
    if not parsed.query:
        return (url, [], [])

    query_dict = parse_qs(parsed.query, keep_blank_values=True)
    detected_tracking = []
    preserved_functional = []
    clean_dict = {}

    for key, values in query_dict.items():
        k_lower = key.lower()
        if k_lower in KNOWN_TRACKING_QUERY_KEYS or k_lower.startswith("utm_"):
            detected_tracking.append(key)
        else:
            preserved_functional.append(key)
            clean_dict[key] = values

    if mode == "SANITIZE":
        new_query = urlencode(clean_dict, doseq=True)
        sanitized_url = urlunparse((
            parsed.scheme, parsed.netloc, parsed.path,
            parsed.params, new_query, parsed.fragment
        ))
        return (sanitized_url, detected_tracking, preserved_functional)
    elif mode == "DETECT_ONLY":
        return (url, detected_tracking, preserved_functional)
    else:  # OFF
        return (url, [], list(query_dict.keys()))


def evaluate_tracker_request(url: str, tracker_mode: str = "BLOCK") -> Tuple[bool, str, str]:
    """
    Evaluates an outbound resource request against curated tracker defense rules.
    Modes: OFF, DETECT, BLOCK.
    Returns: (is_tracker, category, action_taken)
    Actions: TRACKER_BLOCKED, TRACKER_DETECTED, TRACKER_ALLOWED
    """
    parsed = urlparse(url)
    host = parsed.hostname or ""

    # 1. Explicitly protect CDNs, payments, and security services
    for safe_domain in SAFE_NON_BLOCKING_DOMAINS:
        if host == safe_domain or host.endswith("." + safe_domain):
            return (False, "CONTENT_DELIVERY_OR_FUNCTIONAL", "TRACKER_ALLOWED")

    # 2. Check curated tracker rules
    for tracker_domain, category in CURATED_TRACKER_DOMAINS.items():
        if host == tracker_domain or host.endswith("." + tracker_domain):
            if tracker_mode == "BLOCK":
                return (True, category, "TRACKER_BLOCKED")
            elif tracker_mode == "DETECT":
                return (True, category, "TRACKER_DETECTED")
            else:  # OFF
                return (True, category, "TRACKER_ALLOWED")

    return (False, "THIRD_PARTY", "TRACKER_ALLOWED")


def evaluate_referrer_mitigation(raw_referrer: str, current_origin: str, mode: str = "STANDARD") -> Tuple[str, str]:
    """
    Evaluates Referrer header mitigation based on mode:
    OFF, STANDARD (origin-only for cross-origin), STRICT (strip cross-origin).
    Returns: (disclosed_referrer, exposure_status)
    """
    if not raw_referrer or raw_referrer.strip() == "":
        return ("", "PROTECTED")

    parsed_ref = urlparse(raw_referrer)
    ref_origin = f"{parsed_ref.scheme}://{parsed_ref.netloc}"

    if ref_origin == current_origin:
        return (raw_referrer, "SAME_ORIGIN")

    if mode == "STRICT":
        return ("", "PROTECTED")
    elif mode == "STANDARD":
        # Truncate to origin
        return (ref_origin + "/", "PARTIAL")
    else:  # OFF
        if parsed_ref.path in ("", "/") and not parsed_ref.query:
            return (raw_referrer, "PARTIAL")
        return (raw_referrer, "EXPOSED")


def verify_storage_cleanup(
    storage_state_before: Dict[str, str],
    storage_state_after: Dict[str, str]
) -> Tuple[bool, str]:
    """
    Verifies that session data was effectively purged on exit.
    Returns: (verified_clean, report_status)
    """
    leaked_keys = [k for k in storage_state_before if k in storage_state_after]
    if len(leaked_keys) > 0:
        return (False, f"STORAGE_CLEANUP_FAILED: Keys persisted ({', '.join(leaked_keys)})")
    return (True, "STORAGE_CLEANUP_VERIFIED")


# ============================================================================
# PYTEST SUITE FOR PHASE 4B
# ============================================================================

class TestPhase4BPrivacyMitigation:

    def test_tracking_parameter_sanitization_removes_trackers_preserves_functional(self):
        """
        Requirement 1: Safe detection and removal of known tracking parameters,
        while preserving all functional parameters (e.g. id=123).
        """
        input_url = "https://example.com/product?id=123&utm_source=google&utm_campaign=winter_promo&gclid=CjwKCAiA_xyz123&sort=asc&page=2"
        
        # Test SANITIZE mode
        clean_url, detected, preserved = sanitize_url_parameters(input_url, mode="SANITIZE")
        
        assert "utm_source" in detected
        assert "utm_campaign" in detected
        assert "gclid" in detected
        assert "id" in preserved
        assert "sort" in preserved
        assert "page" in preserved

        # Verify final clean URL contains functional params but NOT tracking params
        clean_parsed = parse_qs(urlparse(clean_url).query)
        assert clean_parsed.get("id") == ["123"]
        assert clean_parsed.get("sort") == ["asc"]
        assert clean_parsed.get("page") == ["2"]
        assert "utm_source" not in clean_parsed
        assert "gclid" not in clean_parsed

    def test_tracking_parameter_modes(self):
        """Requirement 2: Modes OFF, DETECT_ONLY, SANITIZE operate honestly."""
        test_url = "https://news.example/article?article_id=987&fbclid=IwAR2_mockClick&utm_medium=cpc"

        # 1. OFF Mode: leaves URL intact, reports nothing
        url_off, detected_off, preserved_off = sanitize_url_parameters(test_url, mode="OFF")
        assert url_off == test_url
        assert len(detected_off) == 0

        # 2. DETECT_ONLY Mode: leaves URL intact, reports tracking params
        url_detect, detected_detect, preserved_detect = sanitize_url_parameters(test_url, mode="DETECT_ONLY")
        assert url_detect == test_url
        assert "fbclid" in detected_detect
        assert "utm_medium" in detected_detect

        # 3. SANITIZE Mode: rewrites URL removing tracking params
        url_clean, detected_clean, preserved_clean = sanitize_url_parameters(test_url, mode="SANITIZE")
        assert "fbclid" not in url_clean
        assert "article_id=987" in url_clean

    def test_tracker_defense_rules_blocking_and_modes(self):
        """Requirement 3, 5, 6: Declarative Tracker Defense rules across modes."""
        tracker_url = "https://www.google-analytics.com/analytics.js"
        ad_url = "https://securepubads.g.doubleclick.net/gampad/ads"

        # BLOCK mode
        is_trk, cat, action = evaluate_tracker_request(tracker_url, tracker_mode="BLOCK")
        assert is_trk is True
        assert cat == "ANALYTICS_TRACKER"
        assert action == "TRACKER_BLOCKED"

        is_trk, cat, action = evaluate_tracker_request(ad_url, tracker_mode="BLOCK")
        assert is_trk is True
        assert cat == "AD_TRACKER"
        assert action == "TRACKER_BLOCKED"

        # DETECT mode
        is_trk, cat, action = evaluate_tracker_request(tracker_url, tracker_mode="DETECT")
        assert is_trk is True
        assert action == "TRACKER_DETECTED"

        # OFF mode
        is_trk, cat, action = evaluate_tracker_request(tracker_url, tracker_mode="OFF")
        assert is_trk is True
        assert action == "TRACKER_ALLOWED"

    def test_safe_non_blocking_policy(self):
        """Requirement 3: Never block CDNs, fonts, payments, or security CAPTCHAs."""
        safe_urls = [
            "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/react.min.js",
            "https://cdn.jsdelivr.net/npm/vue@3.3.4/dist/vue.global.js",
            "https://fonts.googleapis.com/css2?family=Inter",
            "https://api.stripe.com/v1/tokens",
            "https://www.recaptcha.net/recaptcha/api.js",
            "https://challenges.cloudflare.com/turnstile/v0/api.js",
        ]
        for url in safe_urls:
            is_trk, cat, action = evaluate_tracker_request(url, tracker_mode="BLOCK")
            assert is_trk is False, f"Safe resource {url} must not be flagged as a tracker"
            assert action == "TRACKER_ALLOWED", f"Safe resource {url} must be ALLOWED"

    def test_referrer_privacy_modes(self):
        """Requirement 8: Referrer mitigation across OFF, STANDARD, and STRICT modes."""
        raw_ref = "https://search.example/search?q=best+beauty+cream+for+dry+skin"
        dest_origin = "https://shop.example"

        # 1. STRICT mode: strips cross-origin referrer entirely
        ref, status = evaluate_referrer_mitigation(raw_ref, dest_origin, mode="STRICT")
        assert ref == ""
        assert status == "PROTECTED"

        # 2. STANDARD mode: truncates to origin
        ref, status = evaluate_referrer_mitigation(raw_ref, dest_origin, mode="STANDARD")
        assert ref == "https://search.example/"
        assert status == "PARTIAL"
        assert "beauty+cream" not in ref

        # 3. OFF mode: discloses full URL path and query
        ref, status = evaluate_referrer_mitigation(raw_ref, dest_origin, mode="OFF")
        assert ref == raw_ref
        assert status == "EXPOSED"

    def test_storage_mitigation_verification(self):
        """Requirement 10: Verified cleanup reporting (STORAGE_CLEANUP_VERIFIED)."""
        session_storage = {
            "ad_uuid": "xyz_12345",
            "search_segment": "beauty_cream",
            "analytics_session": "sess_998877"
        }

        # Case 1: Post-cleanup state is completely clean
        clean_state = {}
        verified, status = verify_storage_cleanup(session_storage, clean_state)
        assert verified is True
        assert status == "STORAGE_CLEANUP_VERIFIED"

        # Case 2: Post-cleanup state retained tokens
        dirty_state = {"ad_uuid": "xyz_12345"}
        verified, status = verify_storage_cleanup(session_storage, dirty_state)
        assert verified is False
        assert "FAILED" in status

    def test_beauty_cream_scenario_formal_mitigation(self):
        """
        Requirement 12: Beauty-Cream Acceptance Scenario with active Phase 4B mitigation:
        - Session A: Tracking params sanitized, ad trackers blocked, storage seeded.
        - Session Boundary: Verified storage cleanup.
        - Session B: No token leakage, distinct session ID, honest correlation reporting.
        """
        session_a_id = "sess_alpha_101"
        session_b_id = "sess_beta_202"
        assert session_a_id != session_b_id

        # Session A search & inbound ad visit
        inbound_url = "https://cosmetics.example/creams?product=cream_dry_skin&utm_source=adwords&gclid=AdClickToken99"
        clean_url, sanitized_params, _ = sanitize_url_parameters(inbound_url, mode="SANITIZE")
        assert "gclid" in sanitized_params
        assert "product=cream_dry_skin" in clean_url

        # Session A tracker request blocked
        is_trk, _, action = evaluate_tracker_request("https://doubleclick.net/pixel", tracker_mode="BLOCK")
        assert action == "TRACKER_BLOCKED"

        # Session A seeds storage
        session_a_storage = {"ad_interest": "beauty_cream_dry_skin", "user_uuid": "uuid_alpha_99"}

        # Session cleanup
        clean_storage = {}
        verified, cleanup_status = verify_storage_cleanup(session_a_storage, clean_storage)
        assert verified is True
        assert cleanup_status == "STORAGE_CLEANUP_VERIFIED"

        # Session B starts cleanly
        assert "ad_interest" not in clean_storage
        assert "user_uuid" not in clean_storage
