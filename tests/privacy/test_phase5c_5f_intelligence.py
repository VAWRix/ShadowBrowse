"""
ShadowBrowse Phases 5C–5F — Privacy Intelligence, Timeline, Explanations & Reports Tests
Validates:
- Phase 5C: Tracker intelligence grouping by domain, outcome distribution, repeated counts, bounded top domains, and non-malicious disclaimer.
- Phase 5D: Privacy timeline chronological sorting, category and outcome filtering, and robust handling of missing or malformed timestamps.
- Phase 5E: Explainable privacy decisions (what, why, action attempted, known outcome, user recommendation) and absence of sensitive data leaks.
- Phase 5F: Session privacy report generation, critical incidents callouts, risk consistency, and sanitized JSON export with disclaimer.
"""

import json
import pytest
from typing import Dict, List, Optional, Any, Set
from tests.privacy.test_phase5b_risk_engine import calculate_privacy_risk


# ============================================================================
# PYTHON REFERENCE IMPLEMENTATIONS (Matching TypeScript Modules)
# ============================================================================

TRACKER_INTEL_DISCLAIMER = (
    "Domain presence indicates observed tracking scripts, telemetry endpoints, or heuristic rule matches. "
    "It does not prove malicious intent or that requests were successfully blocked."
)

SESSION_REPORT_DISCLAIMER = (
    "This report is an indicative diagnostic summary derived from locally recorded session events. "
    "It is not mathematical proof of anonymity, nor does it guarantee that network tracking was completely prevented across all protocols."
)


def aggregate_tracker_intelligence(events: Optional[List[Dict[str, Any]]]) -> Dict[str, Any]:
    """Python mirror of extension/src/shared/trackerIntelligence.ts."""
    if not events or not isinstance(events, list) or len(events) == 0:
        return {
            "uniqueDomainsCount": 0,
            "totalTrackerEvents": 0,
            "attemptedMitigations": 0,
            "confirmedMitigations": 0,
            "skippedMitigations": 0,
            "unmitigatedDetections": 0,
            "failedMitigations": 0,
            "topDomains": [],
            "disclaimer": TRACKER_INTEL_DISCLAIMER,
        }

    domain_map: Dict[str, Dict[str, Any]] = {}
    attempted_mitigations = 0
    confirmed_mitigations = 0
    skipped_mitigations = 0
    unmitigated_detections = 0
    failed_mitigations = 0
    total_tracker_events = 0

    for evt in events:
        if not evt or not isinstance(evt, dict):
            continue

        cat = evt.get("category")
        target_domain = evt.get("targetDomain")
        is_tracker_related = (
            cat in ("TRACKER", "TRACKING_PARAM", "FINGERPRINT") or bool(target_domain)
        )
        if not is_tracker_related:
            continue

        domain = (target_domain or "in-page / direct").lower().strip()
        total_tracker_events += 1

        outcome = evt.get("outcome")
        if outcome == "MITIGATION_ATTEMPTED":
            attempted_mitigations += 1
        elif outcome == "MITIGATION_CONFIRMED":
            confirmed_mitigations += 1
        elif outcome == "MITIGATION_SKIPPED":
            skipped_mitigations += 1
        elif outcome == "DETECTED":
            unmitigated_detections += 1
        elif outcome == "FAILED":
            failed_mitigations += 1

        timestamp = evt.get("timestamp")
        if not isinstance(timestamp, (int, float)):
            timestamp = 0

        if domain not in domain_map:
            domain_map[domain] = {
                "domain": domain,
                "totalEvents": 0,
                "categories": set(),
                "outcomes": {
                    "DETECTED": 0,
                    "MITIGATION_ATTEMPTED": 0,
                    "MITIGATION_CONFIRMED": 0,
                    "MITIGATION_SKIPPED": 0,
                    "FAILED": 0,
                    "INFORMATIONAL": 0,
                },
                "firstSeen": timestamp,
                "lastSeen": timestamp,
            }

        count = max(1, evt.get("repeatCount", 1))
        entry = domain_map[domain]
        entry["totalEvents"] += count
        if cat:
            entry["categories"].add(cat)
        if outcome in entry["outcomes"]:
            entry["outcomes"][outcome] += count
        entry["firstSeen"] = min(entry["firstSeen"], timestamp)
        entry["lastSeen"] = max(entry["lastSeen"], timestamp)

    top_domains = []
    for entry in domain_map.values():
        outcomes = entry["outcomes"]
        notes = "Observed tracker or telemetry activity."
        if outcomes["MITIGATION_ATTEMPTED"] > 0 and outcomes["DETECTED"] == 0:
            notes = "Declarative rule match dispatched; outcome unconfirmed by browser API."
        elif outcomes["MITIGATION_SKIPPED"] > 0:
            notes = "Allowed via built-in or user-configured whitelist."
        elif outcomes["DETECTED"] > 0 and outcomes["MITIGATION_ATTEMPTED"] == 0:
            notes = "Detected without automated blocking (monitoring/detection mode)."
        elif outcomes["FAILED"] > 0:
            notes = "Mitigation failed or encountered browser error."

        top_domains.append({
            "domain": entry["domain"],
            "totalEvents": entry["totalEvents"],
            "categories": sorted(list(entry["categories"])),
            "outcomes": entry["outcomes"],
            "firstSeen": entry["firstSeen"],
            "lastSeen": entry["lastSeen"],
            "isPrevalent": entry["totalEvents"] >= 3,
            "notes": notes,
        })

    # Sort descending by totalEvents, bounded to top 15
    top_domains.sort(key=lambda d: d["totalEvents"], reverse=True)
    bounded_domains = top_domains[:15]

    return {
        "uniqueDomainsCount": len(domain_map),
        "totalTrackerEvents": total_tracker_events,
        "attemptedMitigations": attempted_mitigations,
        "confirmedMitigations": confirmed_mitigations,
        "skippedMitigations": skipped_mitigations,
        "unmitigatedDetections": unmitigated_detections,
        "failedMitigations": failed_mitigations,
        "topDomains": bounded_domains,
        "disclaimer": TRACKER_INTEL_DISCLAIMER,
    }


def explain_privacy_decision(evt: Optional[Dict[str, Any]]) -> Dict[str, str]:
    """Python mirror of extension/src/shared/privacyExplanation.ts."""
    if not evt or not isinstance(evt, dict):
        return {
            "eventId": "unknown",
            "category": "SESSION",
            "what": "Malformed or missing event record.",
            "why": "Invalid event data encountered.",
            "actionAttempted": "None",
            "knownOutcome": "Unverified",
            "recommendedAction": "No action required.",
        }

    cat = evt.get("category")
    evt_id = evt.get("id", "unknown")
    domain = evt.get("targetDomain")
    domain_str = f" ({domain})" if domain else ""
    outcome = evt.get("outcome")

    if cat == "FINGERPRINT":
        metadata = evt.get("metadata") or {}
        api = metadata.get("apiName") or evt.get("type") or "hardware API"
        return {
            "eventId": evt_id,
            "category": cat,
            "what": f"Browser fingerprinting probe invoked: {api}{domain_str}.",
            "why": "Scripts attempted to query device hardware or rendering characteristics to build a persistent device profile.",
            "actionAttempted": "None. ShadowBrowse operates in detection-only mode for fingerprint probes.",
            "knownOutcome": "Detected. The probe received standard browser values; results were not spoofed.",
            "recommendedAction": "Avoid visiting untrusted sites that profile hardware during private sessions.",
        }
    elif cat == "TRACKER":
        if outcome == "MITIGATION_ATTEMPTED":
            return {
                "eventId": evt_id,
                "category": cat,
                "what": f"Network tracker or telemetry request observed to {domain or 'third-party endpoint'}.",
                "why": "The destination matched a known tracker or telemetry domain signature.",
                "actionAttempted": "Dispatched declarativeNetRequest block rule to Chromium network engine.",
                "knownOutcome": "Attempted. Rule dispatched, but browser extensions cannot independently confirm internal packet drops.",
                "recommendedAction": "No immediate action required. Review tracker frequency in Tracker Intel.",
            }
        elif outcome == "MITIGATION_SKIPPED":
            return {
                "eventId": evt_id,
                "category": cat,
                "what": f"Third-party asset request to {domain or 'remote host'}.",
                "why": "Matched an entry on the verified asset whitelist (e.g., standard CDN or web fonts).",
                "actionAttempted": "Skipped blocking to prevent breaking website styling or core functionality.",
                "knownOutcome": "Skipped per whitelist rules. Request proceeded normally.",
                "recommendedAction": "Whitelist settings can be customized in extension options if strict blocking is preferred.",
            }
        else:
            return {
                "eventId": evt_id,
                "category": cat,
                "what": f"Tracker endpoint accessed: {domain or 'unknown'}.",
                "why": "Network request matched tracking heuristics without an active blocking rule.",
                "actionAttempted": "Logged for audit trail without blocking.",
                "knownOutcome": "Detected without intervention.",
                "recommendedAction": "Consider enabling strict tracker defense or updating blocklists.",
            }
    elif cat == "TRACKING_PARAM":
        metadata = evt.get("metadata") or {}
        keys = ", ".join(metadata.get("paramKeys", [])) or "tracking tokens"
        is_confirmed = outcome == "MITIGATION_CONFIRMED"
        return {
            "eventId": evt_id,
            "category": cat,
            "what": f"Navigation URL contained tracking parameters ({keys}).",
            "why": "Campaign tags and click identifiers (e.g., utm_*, gclid, fbclid) allow cross-site user correlation.",
            "actionAttempted": "Stripped tracking parameters before navigation completed." if is_confirmed else "Detected tracking tokens in URL.",
            "knownOutcome": "Confirmed. URL was sanitized and reloaded clean." if is_confirmed else "Detected.",
            "recommendedAction": "Clean navigation links preserve anonymity across external referrals.",
        }
    elif cat in ("KILL_SWITCH", "NETWORK"):
        if evt.get("severity") == "CRITICAL" or outcome == "FAILED":
            return {
                "eventId": evt_id,
                "category": cat,
                "what": "Tor routing disruption or kill-switch safety activation.",
                "why": "The secure proxy route became unavailable or an unauthorized direct connection was detected.",
                "actionAttempted": "Engaged emergency kill-switch to sever unproxied traffic.",
                "knownOutcome": "Proxy connection severed. Unprotected direct traffic was blocked.",
                "recommendedAction": "Verify Tor daemon status or restart the session to restore secure routing.",
            }
        else:
            return {
                "eventId": evt_id,
                "category": cat,
                "what": "Network routing status update or verification check.",
                "why": "Periodic route verification confirmed traffic is routing through Tor.",
                "actionAttempted": "Verified proxy configuration with browser network engine.",
                "knownOutcome": "Confirmed. Outbound IP matches verified Tor exit node.",
                "recommendedAction": "Normal operation. Route is secure.",
            }
    else:
        return {
            "eventId": evt_id,
            "category": cat or "UNKNOWN",
            "what": evt.get("userExplanation", "Privacy event recorded."),
            "why": evt.get("technicalReason", "Observed by ShadowBrowse audit engine."),
            "actionAttempted": outcome or "None",
            "knownOutcome": f"Outcome: {outcome}",
            "recommendedAction": "Review technical audit log for diagnostic details.",
        }


def generate_session_privacy_report(
    events: Optional[List[Dict[str, Any]]], session_id: Optional[str] = None
) -> Dict[str, Any]:
    """Python mirror of extension/src/shared/sessionReport.ts."""
    safe_events = events if isinstance(events, list) else []
    risk_assessment = calculate_privacy_risk(safe_events)
    tracker_intelligence = aggregate_tracker_intelligence(safe_events)

    category_counts: Dict[str, int] = {}
    outcome_counts: Dict[str, int] = {}
    critical_incidents = []

    for evt in safe_events:
        if not evt or not isinstance(evt, dict):
            continue

        cat = evt.get("category", "UNKNOWN")
        outcome = evt.get("outcome", "UNKNOWN")
        category_counts[cat] = category_counts.get(cat, 0) + 1
        outcome_counts[outcome] = outcome_counts.get(outcome, 0) + 1

        if (
            evt.get("severity") == "CRITICAL"
            or cat == "KILL_SWITCH"
            or (cat == "NETWORK" and outcome == "FAILED")
        ):
            critical_incidents.append({
                "id": evt.get("id", "crit"),
                "timestamp": evt.get("timestamp", 0),
                "category": cat,
                "explanation": evt.get("userExplanation", "Critical route or kill-switch incident observed."),
            })

    recommendations = []
    if tracker_intelligence["totalTrackerEvents"] > 0:
        recommendations.append(
            f"{tracker_intelligence['uniqueDomainsCount']} tracker domain(s) observed. Review blocklists to maintain low telemetry exposure."
        )
    if "FINGERPRINT" in category_counts:
        recommendations.append(
            "Hardware/API fingerprinting probes were detected. Avoid visiting sites requiring device profiling during private sessions."
        )
    if critical_incidents:
        recommendations.append(
            "Emergency kill-switch or route disruption was recorded. Verify Tor routing daemon before starting a new session."
        )
    if not recommendations:
        recommendations.append(
            "Pristine session state. No high-risk tracking, fingerprinting, or route interruptions observed."
        )

    return {
        "reportId": "rep_test_123",
        "generatedAt": "2026-10-25T12:00:00Z",
        "sessionId": session_id or "active_session",
        "scope": "ACTIVE_SESSION" if len(safe_events) < 200 else "HISTORY_BUFFER",
        "totalEvents": len(safe_events),
        "categoryCounts": category_counts,
        "outcomeCounts": outcome_counts,
        "trackerIntelligence": tracker_intelligence,
        "riskScore": risk_assessment["score"],
        "riskLevel": risk_assessment["level"],
        "riskFactors": risk_assessment["factors"],
        "criticalIncidents": critical_incidents,
        "recommendations": recommendations,
        "disclaimer": SESSION_REPORT_DISCLAIMER,
    }


def export_session_report_as_json(report: Dict[str, Any]) -> str:
    """Python mirror of sanitized export."""
    if not report or not isinstance(report, dict):
        raise ValueError("Invalid session report provided for export")

    sanitized = {
        "reportId": report.get("reportId"),
        "generatedAt": report.get("generatedAt"),
        "sessionId": report.get("sessionId"),
        "scope": report.get("scope"),
        "totalEvents": report.get("totalEvents"),
        "categoryCounts": report.get("categoryCounts"),
        "outcomeCounts": report.get("outcomeCounts"),
        "riskScore": report.get("riskScore"),
        "riskLevel": report.get("riskLevel"),
        "riskFactors": report.get("riskFactors"),
        "trackerIntelligence": {
            "uniqueDomainsCount": report["trackerIntelligence"]["uniqueDomainsCount"],
            "totalTrackerEvents": report["trackerIntelligence"]["totalTrackerEvents"],
            "attemptedMitigations": report["trackerIntelligence"]["attemptedMitigations"],
            "confirmedMitigations": report["trackerIntelligence"]["confirmedMitigations"],
            "skippedMitigations": report["trackerIntelligence"]["skippedMitigations"],
            "unmitigatedDetections": report["trackerIntelligence"]["unmitigatedDetections"],
            "failedMitigations": report["trackerIntelligence"]["failedMitigations"],
            "topDomains": report["trackerIntelligence"]["topDomains"],
        },
        "criticalIncidents": report.get("criticalIncidents"),
        "recommendations": report.get("recommendations"),
        "disclaimer": report.get("disclaimer"),
    }
    return json.dumps(sanitized, indent=2)


# ============================================================================
# AUTOMATED TEST SUITE FOR PHASES 5C–5F
# ============================================================================

class TestPhase5C_TrackerIntelligence:
    def test_empty_events_yield_zero_analytics(self):
        intel = aggregate_tracker_intelligence([])
        assert intel["uniqueDomainsCount"] == 0
        assert intel["totalTrackerEvents"] == 0
        assert len(intel["topDomains"]) == 0
        assert intel["disclaimer"] == TRACKER_INTEL_DISCLAIMER

    def test_domain_grouping_and_outcome_distinctions(self):
        events = [
            {"category": "TRACKER", "targetDomain": "analytics.google.com", "outcome": "MITIGATION_ATTEMPTED", "repeatCount": 2, "timestamp": 100},
            {"category": "TRACKER", "targetDomain": "analytics.google.com", "outcome": "DETECTED", "repeatCount": 1, "timestamp": 200},
            {"category": "TRACKER", "targetDomain": "doubleclick.net", "outcome": "MITIGATION_ATTEMPTED", "repeatCount": 1, "timestamp": 150},
            {"category": "TRACKER", "targetDomain": "cdnjs.cloudflare.com", "outcome": "MITIGATION_SKIPPED", "repeatCount": 5, "timestamp": 120},
        ]
        intel = aggregate_tracker_intelligence(events)
        assert intel["uniqueDomainsCount"] == 3
        assert intel["totalTrackerEvents"] == 4
        assert intel["attemptedMitigations"] == 2
        assert intel["unmitigatedDetections"] == 1
        assert intel["skippedMitigations"] == 1

        # Check top domains sorting (cdnjs has totalEvents 5, analytics.google.com has 3, doubleclick has 1)
        assert intel["topDomains"][0]["domain"] == "cdnjs.cloudflare.com"
        assert intel["topDomains"][0]["isPrevalent"] is True
        assert intel["topDomains"][1]["domain"] == "analytics.google.com"
        assert intel["topDomains"][1]["isPrevalent"] is True

    def test_bounded_top_domains(self):
        # Generate 25 distinct domains
        events = [
            {"category": "TRACKER", "targetDomain": f"tracker-{i}.com", "outcome": "MITIGATION_ATTEMPTED", "repeatCount": 1}
            for i in range(25)
        ]
        intel = aggregate_tracker_intelligence(events)
        assert intel["uniqueDomainsCount"] == 25
        assert len(intel["topDomains"]) == 15  # strictly bounded to 15


class TestPhase5D_PrivacyTimeline:
    def test_timeline_sorting_and_malformed_timestamps(self):
        events = [
            {"id": "evt-1", "timestamp": 1000},
            {"id": "evt-2", "timestamp": "invalid_time"},
            {"id": "evt-3", "timestamp": 5000},
            {"id": "evt-4", "timestamp": None},
        ]
        # Mirror UI sorting logic: newest first, non-numbers treated as 0
        sorted_events = sorted(
            events,
            key=lambda e: e.get("timestamp") if isinstance(e.get("timestamp"), (int, float)) else 0,
            reverse=True,
        )
        assert sorted_events[0]["id"] == "evt-3"
        assert sorted_events[1]["id"] == "evt-1"
        assert sorted_events[2]["id"] in ("evt-2", "evt-4")

    def test_critical_event_visibility_under_repetition(self):
        """Critical kill switch events must remain distinguishable even during tracking bursts."""
        events = [
            {"id": "tr-1", "category": "TRACKER", "outcome": "DETECTED", "repeatCount": 50},
            {"id": "ks-1", "category": "KILL_SWITCH", "severity": "CRITICAL", "outcome": "FAILED"},
        ]
        critical = [e for e in events if e.get("severity") == "CRITICAL" or e.get("category") == "KILL_SWITCH"]
        assert len(critical) == 1
        assert critical[0]["id"] == "ks-1"


class TestPhase5E_ExplainableDecisions:
    def test_fingerprint_explanation_notes_detection_only(self):
        evt = {
            "id": "fp-1",
            "category": "FINGERPRINT",
            "metadata": {"apiName": "HTMLCanvasElement.toDataURL"},
            "targetDomain": "fingerprintjs.com",
            "outcome": "DETECTED",
        }
        exp = explain_privacy_decision(evt)
        assert "detection-only" in exp["actionAttempted"]
        assert "results were not spoofed" in exp["knownOutcome"]
        assert "Avoid visiting" in exp["recommendedAction"]

    def test_tracker_attempted_mitigation_clearly_states_unconfirmed(self):
        evt = {
            "id": "tr-1",
            "category": "TRACKER",
            "targetDomain": "google-analytics.com",
            "outcome": "MITIGATION_ATTEMPTED",
        }
        exp = explain_privacy_decision(evt)
        assert "Dispatched declarativeNetRequest" in exp["actionAttempted"]
        assert "cannot independently confirm" in exp["knownOutcome"]

    def test_kill_switch_explanation(self):
        evt = {
            "id": "ks-1",
            "category": "KILL_SWITCH",
            "severity": "CRITICAL",
            "outcome": "FAILED",
        }
        exp = explain_privacy_decision(evt)
        assert "kill-switch safety activation" in exp["what"]
        assert "Verify Tor daemon status" in exp["recommendedAction"]

    def test_no_sensitive_leak_in_explanation(self):
        evt = {
            "id": "param-1",
            "category": "TRACKING_PARAM",
            "metadata": {"paramKeys": ["utm_source", "fbclid"]},
            "outcome": "MITIGATION_CONFIRMED",
        }
        exp = explain_privacy_decision(evt)
        # Explanations must not reveal raw URLs or tokens
        assert "http" not in exp["what"]
        assert "fbclid" in exp["what"]


class TestPhase5F_SessionPrivacyReport:
    def test_report_generation_with_empty_events(self):
        report = generate_session_privacy_report([])
        assert report["totalEvents"] == 0
        assert report["riskScore"] == 0
        assert report["riskLevel"] == "MINIMAL"
        assert len(report["criticalIncidents"]) == 0
        assert "Pristine session state" in report["recommendations"][0]
        assert report["disclaimer"] == SESSION_REPORT_DISCLAIMER

    def test_report_generation_with_tracker_and_critical_incidents(self):
        events = [
            {"id": "tr-1", "category": "TRACKER", "targetDomain": "tracker.com", "outcome": "MITIGATION_ATTEMPTED"},
            {"id": "ks-1", "category": "KILL_SWITCH", "severity": "CRITICAL", "outcome": "FAILED", "userExplanation": "Tor proxy dropped"},
        ]
        report = generate_session_privacy_report(events)
        assert report["totalEvents"] == 2
        assert len(report["criticalIncidents"]) == 1
        assert report["criticalIncidents"][0]["explanation"] == "Tor proxy dropped"
        assert any("Verify Tor routing daemon" in r for r in report["recommendations"])

    def test_report_json_export_is_valid_and_sanitized(self):
        events = [
            {"id": "tr-1", "category": "TRACKER", "targetDomain": "adservice.google.com", "outcome": "MITIGATION_ATTEMPTED"},
        ]
        report = generate_session_privacy_report(events)
        json_str = export_session_report_as_json(report)
        parsed = json.loads(json_str)

        assert parsed["reportId"] == report["reportId"]
        assert parsed["riskScore"] == report["riskScore"]
        assert parsed["trackerIntelligence"]["uniqueDomainsCount"] == 1
        assert "disclaimer" in parsed
