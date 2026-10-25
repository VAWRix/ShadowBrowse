"""
ShadowBrowse Phase 5B — Privacy Risk Engine Tests
Validates the deterministic scoring model, explainable contributing factors,
score floor and ceiling bounds (0-100), repeatCount capping, MITIGATION_SKIPPED
zero-contribution, MITIGATION_ATTEMPTED distinction, fingerprint probe treatment,
malformed/empty input handling, and honest diagnostic disclaimers.
"""

import pytest
from typing import Dict, List, Optional, Any, Set


RISK_DISCLAIMER = (
    "Indicative diagnostic metric calculated from locally recorded session events. "
    "It is not a mathematically certified guarantee of anonymity or proof that network tracking was completely prevented."
)


def calculate_privacy_risk(events: Optional[List[Dict[str, Any]]]) -> Dict[str, Any]:
    """
    Python reference implementation of the Phase 5B Privacy Risk Scoring Engine.
    Must maintain exact behavioral parity with extension/src/shared/riskEngine.ts.
    """
    if not events or not isinstance(events, list) or len(events) == 0:
        return {
            "score": 0,
            "level": "MINIMAL",
            "factors": [],
            "summary": "No privacy exposure events recorded in current session.",
            "evaluatedEventsCount": 0,
            "disclaimer": RISK_DISCLAIMER,
        }

    fingerprint_events = []
    tracker_events = []
    identity_events = []
    param_events = []
    network_events = []

    for evt in events:
        if not evt or not isinstance(evt, dict):
            continue

        # Rule: MITIGATION_SKIPPED (e.g. whitelisted CDNs or Fonts) contributes zero exposure
        if evt.get("outcome") == "MITIGATION_SKIPPED":
            continue

        cat = evt.get("category")
        if cat == "FINGERPRINT":
            fingerprint_events.append(evt)
        elif cat == "TRACKER":
            tracker_events.append(evt)
        elif cat == "IDENTITY":
            identity_events.append(evt)
        elif cat == "TRACKING_PARAM":
            param_events.append(evt)
        elif cat in ("NETWORK", "KILL_SWITCH"):
            network_events.append(evt)

    factors = []
    total_score = 0

    # 1. Fingerprint Probes (Canvas, WebGL, AudioContext, Fonts)
    if fingerprint_events:
        distinct_probes = set()
        repeat_weight = 0
        for evt in fingerprint_events:
            metadata = evt.get("metadata") or {}
            probe_name = metadata.get("apiName") or evt.get("type") or "generic"
            distinct_probes.add(probe_name)
            repeat_count = evt.get("repeatCount", 1)
            if repeat_count > 1:
                repeat_weight += min(repeat_count - 1, 3)

        raw = len(distinct_probes) * 12 + repeat_weight
        capped = min(raw, 35)
        total_score += capped
        factors.append({
            "category": "FINGERPRINT",
            "description": f"{len(distinct_probes)} distinct hardware/API probe(s) detected (unmasked)",
            "rawScore": raw,
            "cappedScore": capped,
            "eventCount": len(fingerprint_events),
        })

    # 2. Trackers (Analytics, Ads, Beacons)
    if tracker_events:
        distinct_domains = set()
        unblocked_detected = 0
        attempted_blocks = 0
        for evt in tracker_events:
            domain = evt.get("targetDomain") or "unknown"
            distinct_domains.add(domain)
            outcome = evt.get("outcome")
            if outcome == "DETECTED":
                unblocked_detected += 1
            elif outcome == "MITIGATION_ATTEMPTED":
                attempted_blocks += 1

        raw = len(distinct_domains) * 6 + unblocked_detected * 4 + attempted_blocks * 2
        capped = min(raw, 35)
        total_score += capped
        factors.append({
            "category": "TRACKER",
            "description": f"{len(distinct_domains)} tracker domain(s) observed ({attempted_blocks} block attempted, {unblocked_detected} detected)",
            "rawScore": raw,
            "cappedScore": capped,
            "eventCount": len(tracker_events),
        })

    # 3. Identity Warnings
    if identity_events:
        raw = len(identity_events) * 20
        capped = min(raw, 30)
        total_score += capped
        factors.append({
            "category": "IDENTITY",
            "description": "Sensitive authentication endpoint visited during private session",
            "rawScore": raw,
            "cappedScore": capped,
            "eventCount": len(identity_events),
        })

    # 4. URL Tracking Tokens (utm_*, gclid, fbclid)
    if param_events:
        unmitigated_count = 0
        sanitized_count = 0
        for evt in param_events:
            if evt.get("outcome") == "DETECTED":
                unmitigated_count += 1
            else:
                sanitized_count += 1

        raw = unmitigated_count * 5 + sanitized_count * 2
        capped = min(raw, 15)
        total_score += capped
        factors.append({
            "category": "TRACKING_PARAM",
            "description": f"{sanitized_count} URL token(s) sanitized, {unmitigated_count} unmitigated",
            "rawScore": raw,
            "cappedScore": capped,
            "eventCount": len(param_events),
        })

    # 5. Network / Kill Switch Failures
    if network_events:
        penalty = 0
        for evt in network_events:
            if evt.get("severity") == "CRITICAL" or evt.get("outcome") == "FAILED":
                penalty += 20
        if penalty > 0:
            capped = min(penalty, 25)
            total_score += capped
            factors.append({
                "category": "NETWORK",
                "description": "Network route interruption or kill switch engagement",
                "rawScore": penalty,
                "cappedScore": capped,
                "eventCount": len(network_events),
            })

    final_score = min(100, max(0, round(total_score)))

    level = "MINIMAL"
    if final_score >= 90:
        level = "CRITICAL"
    elif final_score >= 70:
        level = "HIGH"
    elif final_score >= 40:
        level = "MEDIUM"
    elif final_score >= 15:
        level = "LOW"

    if final_score == 0:
        summary = "Pristine session: zero active tracking or fingerprint probes observed."
    elif level in ("CRITICAL", "HIGH"):
        summary = "Elevated risk: significant fingerprint probing or multiple tracking networks active."
    else:
        summary = f"Privacy exposure is {level.lower()} ({final_score}/100)."

    return {
        "score": final_score,
        "level": level,
        "factors": factors,
        "summary": summary,
        "evaluatedEventsCount": len(events),
        "disclaimer": RISK_DISCLAIMER,
    }


# ============================================================================
# UNIT TESTS
# ============================================================================

class TestPhase5BPrivacyRiskEngine:

    def test_empty_or_none_events_yield_floor_zero(self):
        """Empty or None event history yields score 0 with MINIMAL level."""
        res_none = calculate_privacy_risk(None)
        assert res_none["score"] == 0
        assert res_none["level"] == "MINIMAL"
        assert len(res_none["factors"]) == 0
        assert res_none["evaluatedEventsCount"] == 0
        assert res_none["disclaimer"] == RISK_DISCLAIMER

        res_empty = calculate_privacy_risk([])
        assert res_empty["score"] == 0
        assert res_empty["level"] == "MINIMAL"

    def test_deterministic_scoring(self):
        """Same input events always produce the exact same score, level, and factors."""
        events = [
            {
                "id": "evt-1",
                "category": "FINGERPRINT",
                "type": "canvas_probe",
                "outcome": "DETECTED",
                "severity": "WARNING",
                "repeatCount": 1,
                "metadata": {"apiName": "HTMLCanvasElement.toDataURL"},
            },
            {
                "id": "evt-2",
                "category": "TRACKER",
                "type": "tracker_blocked",
                "targetDomain": "google-analytics.com",
                "outcome": "MITIGATION_ATTEMPTED",
                "severity": "NOTICE",
                "repeatCount": 2,
            },
        ]
        res1 = calculate_privacy_risk(events)
        res2 = calculate_privacy_risk(events)

        assert res1["score"] == res2["score"]
        assert res1["level"] == res2["level"]
        assert res1["factors"] == res2["factors"]
        assert res1["score"] == 12 + (6 + 2)  # Canvas: 12, Tracker: 6 (domain) + 2 (attempted) = 20
        assert res1["level"] == "LOW"

    def test_score_floor_and_ceiling_bounds(self):
        """Score must never exceed 100 even with extreme exposure."""
        heavy_events = []
        # Add multiple probes across all categories
        for i in range(10):
            heavy_events.append({
                "id": f"fp-{i}",
                "category": "FINGERPRINT",
                "type": f"probe_{i}",
                "outcome": "DETECTED",
                "repeatCount": 5,
                "metadata": {"apiName": f"probe_{i}"},
            })
        for i in range(10):
            heavy_events.append({
                "id": f"tr-{i}",
                "category": "TRACKER",
                "targetDomain": f"tracker-{i}.com",
                "outcome": "DETECTED",
                "repeatCount": 10,
            })
        for i in range(5):
            heavy_events.append({
                "id": f"id-{i}",
                "category": "IDENTITY",
                "outcome": "DETECTED",
                "severity": "WARNING",
            })
        for i in range(5):
            heavy_events.append({
                "id": f"net-{i}",
                "category": "NETWORK",
                "outcome": "FAILED",
                "severity": "CRITICAL",
            })

        res = calculate_privacy_risk(heavy_events)
        assert res["score"] <= 100
        assert res["score"] == 100
        assert res["level"] == "CRITICAL"

    def test_mitigation_skipped_contributes_zero(self):
        """Whitelisted or skipped events (MITIGATION_SKIPPED) contribute exactly 0 exposure."""
        skipped_events = [
            {
                "id": "skip-1",
                "category": "TRACKER",
                "targetDomain": "cdnjs.cloudflare.com",
                "outcome": "MITIGATION_SKIPPED",
                "severity": "INFO",
                "repeatCount": 10,
            },
            {
                "id": "skip-2",
                "category": "TRACKER",
                "targetDomain": "fonts.googleapis.com",
                "outcome": "MITIGATION_SKIPPED",
                "severity": "INFO",
                "repeatCount": 5,
            },
        ]
        res = calculate_privacy_risk(skipped_events)
        assert res["score"] == 0
        assert res["level"] == "MINIMAL"
        assert len(res["factors"]) == 0

    def test_mitigation_attempted_does_not_prove_block(self):
        """MITIGATION_ATTEMPTED still adds exposure points, but fewer than unblocked DETECTED."""
        attempted_events = [
            {
                "id": "tr-1",
                "category": "TRACKER",
                "targetDomain": "tracker.com",
                "outcome": "MITIGATION_ATTEMPTED",
                "repeatCount": 1,
            }
        ]
        unblocked_events = [
            {
                "id": "tr-2",
                "category": "TRACKER",
                "targetDomain": "tracker.com",
                "outcome": "DETECTED",
                "repeatCount": 1,
            }
        ]

        res_attempted = calculate_privacy_risk(attempted_events)
        res_unblocked = calculate_privacy_risk(unblocked_events)

        # Domain (6) + attempted (2) = 8
        assert res_attempted["score"] == 8
        # Domain (6) + unblocked (4) = 10
        assert res_unblocked["score"] == 10
        assert res_attempted["score"] > 0
        assert res_attempted["score"] < res_unblocked["score"]

    def test_fingerprint_probes_treated_as_detected_exposure(self):
        """Fingerprint probes are treated as unmasked hardware detection with max 35 cap."""
        probes = [
            {"category": "FINGERPRINT", "outcome": "DETECTED", "metadata": {"apiName": "canvas"}},
            {"category": "FINGERPRINT", "outcome": "DETECTED", "metadata": {"apiName": "webgl"}},
            {"category": "FINGERPRINT", "outcome": "DETECTED", "metadata": {"apiName": "audiocontext"}},
            {"category": "FINGERPRINT", "outcome": "DETECTED", "metadata": {"apiName": "fonts"}},
        ]
        res = calculate_privacy_risk(probes)
        # 4 distinct probes * 12 = 48, capped at 35
        factor = next(f for f in res["factors"] if f["category"] == "FINGERPRINT")
        assert factor["rawScore"] == 48
        assert factor["cappedScore"] == 35
        assert res["score"] == 35

    def test_repeat_count_capping_prevents_flooding(self):
        """Repeating events have per-event repeat caps to prevent metric flooding."""
        single_evt_with_huge_repeats = [
            {
                "category": "FINGERPRINT",
                "outcome": "DETECTED",
                "metadata": {"apiName": "canvas"},
                "repeatCount": 1000,
            }
        ]
        res = calculate_privacy_risk(single_evt_with_huge_repeats)
        # 1 probe * 12 + min(999, 3) = 15
        assert res["score"] == 15

    def test_malformed_and_missing_metadata_handled_gracefully(self):
        """Missing or malformed metadata fields do not crash the engine."""
        malformed = [
            None,
            {},
            {"category": "UNKNOWN_CAT", "outcome": "UNKNOWN"},
            {"category": "FINGERPRINT", "metadata": None},
            {"category": "TRACKER", "targetDomain": None, "outcome": None},
            {"category": "TRACKING_PARAM", "outcome": "DETECTED"},
        ]
        res = calculate_privacy_risk(malformed)
        assert isinstance(res["score"], int)
        assert 0 <= res["score"] <= 100
        assert res["evaluatedEventsCount"] == len(malformed)

    def test_disclaimer_preservation(self):
        """All assessments must include the explicit non-guarantee disclaimer."""
        res = calculate_privacy_risk([])
        assert "not a mathematically certified guarantee" in res["disclaimer"]
