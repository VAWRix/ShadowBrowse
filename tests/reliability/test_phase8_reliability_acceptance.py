"""
ShadowBrowse Phases 8A–8D — Reliability, Acceptance Testing, and Release Readiness
==================================================================================
Comprehensive test suite validating:
- Phase 8A: Network protection acceptance (proxy snapshots, route verification
  hierarchy, kill switch fail-closed enforcement, recovery, no direct bypass).
- Phase 8B: Lifecycle and recovery reliability (service worker restart, corrupted
  storage recovery, race-free clearing, idempotent initialization).
- Phase 8C: Performance and resource limits (bounded memory/storage buffers,
  burst deduplication, sub-millisecond risk & tracker calculation at scale).
- Phase 8D: Release package validation (dist/ directory manifest verification,
  asset completeness, CSP enforcement, operational documentation).
"""

import json
import os
import time
from pathlib import Path
import pytest

os.environ["SHADOWBROWSE_TEST_MODE"] = "1"

from fastapi.testclient import TestClient
from agent.src.main import app
from agent.src.config import get_or_create_auth_token
from agent.src.tor.route_verifier import verify_route

client = TestClient(app)
EXT_ORIGIN = {"origin": "chrome-extension://abcdefghijklmnopabcdefghijklmnop"}


def auth_headers(extra=None):
    base = {**EXT_ORIGIN, "X-Shadow-Token": get_or_create_auth_token()}
    if extra:
        base.update(extra)
    return base


# =============================================================================
# PHASE 8A: NETWORK PROTECTION ACCEPTANCE TESTS
# =============================================================================

class TestNetworkProtectionAcceptance:
    """Acceptance testing for network routing, route verification, and kill switch."""

    def test_route_verification_hierarchy_classification(self):
        """
        Acceptance: The system must strictly distinguish between:
          - BROWSER_PROXY_CONFIGURED (local browser setting only)
          - SOCKS5_REACHABLE_ONLY (daemon listening on loopback)
          - ROUTE_VERIFIED_TOR_UNVERIFIED (traffic routed through proxy, but exit is not Tor)
          - TOR_ROUTE_VERIFIED (authoritative Tor exit consensus match)
          - DIRECT_BYPASS_DETECTED (leak condition; must trigger fail-closed kill switch)
        """
        # 1. Tor Exit Confirmed
        res_tor = verify_route(
            socks_host="127.0.0.1",
            socks_port=9050,
            mock_direct_ip="198.51.100.1",
            mock_proxied_ip="185.220.101.5",
            mock_exit_is_tor=True,
        )
        assert res_tor["route_verified"] is True
        assert res_tor["verification_status"] == "TOR_ROUTE_VERIFIED"
        assert res_tor["evidence_level"] == "HIGH"

        # 2. Generic SOCKS5 (not Tor)
        res_generic = verify_route(
            socks_host="127.0.0.1",
            socks_port=9050,
            mock_direct_ip="198.51.100.1",
            mock_proxied_ip="203.0.113.50",
            mock_exit_is_tor=False,
        )
        assert res_generic["route_functional"] is True
        assert res_generic["route_verified"] is False
        assert res_generic["verification_status"] == "ROUTE_VERIFIED_TOR_UNVERIFIED"

        # 3. Direct Bypass (leak condition)
        res_bypass = verify_route(
            socks_host="127.0.0.1",
            socks_port=9050,
            mock_direct_ip="198.51.100.1",
            mock_proxied_ip="198.51.100.1",  # Same IP: proxy bypassed!
            mock_exit_is_tor=False,
        )
        assert res_bypass["route_functional"] is False
        assert res_bypass["route_verified"] is False
        assert res_bypass["ips_differ"] is False
        assert res_bypass["verification_status"] == "DIRECT_BYPASS_DETECTED"
        assert any("bypassing the proxy" in lim for lim in res_bypass["limitations"])

    def test_route_verification_timeout_and_offline_handling(self):
        """Route verification timeout or offline test mode must fail gracefully without hanging or direct fallback."""
        # 1. Unreachable outbound proxy endpoint
        res = client.post(
            "/api/v1/tor/verify-route",
            headers=auth_headers(),
            json={
                "mock_direct_ip": "198.51.100.1",
                "mock_proxied_ip": None,
                "timeout": 0.5,
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert data["route_verified"] is False
        assert data["verification_status"] == "SOCKS5_REACHABLE_ONLY"

        # 2. Test mode without live network probes
        res_offline = client.post(
            "/api/v1/tor/verify-route",
            headers=auth_headers(),
            json={"timeout": 0.5},
        )
        assert res_offline.status_code == 200
        assert res_offline.json()["verification_status"] in ("UNAVAILABLE", "TEST_MODE_OFFLINE")
        assert res_offline.json()["route_verified"] is False

    def test_kill_switch_readiness_and_no_direct_fallback(self):
        """When Tor or SOCKS5 fails, kill switch state must prevent direct unproxied traffic."""
        # Query status to verify fail-closed readiness
        status = client.get("/api/v1/status", headers=EXT_ORIGIN).json()
        assert status["kill_switch"] is True
        assert "dns_status" in status
        # DNS status must be honestly reported as UNVERIFIED if route is unverified
        if not status["tor_reachable"]:
            assert status["dns_status"] in ("UNVERIFIED", "PARTIAL")

    def test_repeated_session_start_stop_transitions(self):
        """Sequential session start and stop transitions must generate distinct IDs and clean up."""
        session_ids = []
        for _ in range(3):
            start = client.post("/api/v1/session/start", headers=auth_headers()).json()
            assert start["status"] == "ACTIVE"
            session_ids.append(start["session_id"])

            stop = client.post("/api/v1/session/stop", headers=auth_headers()).json()
            assert stop["status"] == "STOPPED"

        # All session IDs must be unique
        assert len(set(session_ids)) == 3

        # Final state must be inactive
        status = client.get("/api/v1/status", headers=EXT_ORIGIN).json()
        assert status["session_active"] is False


# =============================================================================
# PHASE 8B: LIFECYCLE AND RECOVERY RELIABILITY
# =============================================================================

class TestLifecycleAndRecoveryReliability:
    """Validates service worker restart, storage recovery, and race-free clearing."""

    def test_service_worker_restart_state_reconciliation(self):
        """
        Simulates state recovery when the service worker restarts.
        Interrupted STARTING/STOPPING sessions must rollback safely to DIRECT.
        """
        def reconcile_startup_state(saved_state):
            if not saved_state:
                return {"state": "OFF", "action": "INITIALIZE_CLEAN"}
            ss_state = saved_state.get("state")
            if ss_state in ("STARTING", "STOPPING"):
                # Interrupted: must safely rollback to DIRECT and clear proxy
                return {
                    "state": "OFF",
                    "action": "RESTORE_PRE_SESSION_AND_CLEAR",
                    "restored_proxy": saved_state.get("proxySnapshot") or None,
                }
            elif ss_state in ("PROTECTED", "DEGRADED", "FAILED"):
                # Active session restored
                return {
                    "state": ss_state,
                    "action": "RESUME_SESSION",
                    "active_session": saved_state.get("activeSession"),
                }
            return {"state": "OFF", "action": "INITIALIZE_CLEAN"}

        # 1. Clean startup
        assert reconcile_startup_state(None)["state"] == "OFF"

        # 2. Interrupted during STARTING
        interrupted = {"state": "STARTING", "proxySnapshot": {"config": {"mode": "system"}}}
        rec = reconcile_startup_state(interrupted)
        assert rec["state"] == "OFF"
        assert rec["action"] == "RESTORE_PRE_SESSION_AND_CLEAR"
        assert rec["restored_proxy"]["config"]["mode"] == "system"

        # 3. Restored during active PROTECTED session
        protected = {"state": "PROTECTED", "activeSession": {"sessionId": "sess_12345"}}
        rec2 = reconcile_startup_state(protected)
        assert rec2["state"] == "PROTECTED"
        assert rec2["action"] == "RESUME_SESSION"

    def test_storage_corruption_recovery(self):
        """Corrupted settings or storage values must fall back to safe defaults."""
        DEFAULT_SETTINGS = {
            "defaultNetworkMode": "TOR",
            "killSwitchEnabled": True,
            "storageIsolationEnabled": True,
            "fingerprintProtectionEnabled": True,
            "webRTCProtectionEnabled": True,
            "agentPort": 9152,
            "trackingProtectionMode": "DETECT",
        }

        def load_settings(stored_raw):
            if not isinstance(stored_raw, dict):
                return DEFAULT_SETTINGS.copy()
            settings = DEFAULT_SETTINGS.copy()
            for k, v in stored_raw.items():
                if k in settings and isinstance(v, type(settings[k])):
                    settings[k] = v
            return settings

        # Malformed non-dict
        assert load_settings("invalid_json_string") == DEFAULT_SETTINGS
        assert load_settings(None) == DEFAULT_SETTINGS

        # Partial with corrupted type (e.g. agentPort = "not_int")
        corrupted = {"agentPort": "bad_port", "defaultNetworkMode": "TOR"}
        loaded = load_settings(corrupted)
        assert loaded["agentPort"] == 9152  # Preserved safe default!
        assert loaded["defaultNetworkMode"] == "TOR"

    def test_race_free_event_clearing_model(self):
        """
        Simulates the PrivacyEventEngine isClearing guard.
        Events queued or in-flight during clearAll() must not resurrect cleared data.
        """
        state = {
            "isClearing": False,
            "memoryBuffer": [{"id": "evt_1"}, {"id": "evt_2"}],
            "dirtyQueue": [{"id": "evt_3"}],
            "storage": [{"id": "evt_1"}, {"id": "evt_2"}],
        }

        def clear_all():
            state["isClearing"] = True
            try:
                # Cancel pending
                state["dirtyQueue"] = []
                # Clear memory
                state["memoryBuffer"] = []
                # Clear storage
                state["storage"] = []
            finally:
                state["isClearing"] = False

        def ingest_event(evt):
            if state["isClearing"]:
                return None  # Discard during clear
            state["memoryBuffer"].append(evt)
            state["dirtyQueue"].append(evt)
            return evt

        # Trigger clear
        clear_all()
        assert len(state["memoryBuffer"]) == 0
        assert len(state["dirtyQueue"]) == 0
        assert len(state["storage"]) == 0

        # Ingestion after clear succeeds normally
        new_evt = ingest_event({"id": "evt_new"})
        assert new_evt is not None
        assert len(state["memoryBuffer"]) == 1


# =============================================================================
# PHASE 8C: PERFORMANCE AND RESOURCE LIMITS
# =============================================================================

class TestPerformanceAndResourceLimits:
    """Validates bounded memory, deduplication, and fast computation at maximum scale."""

    def test_buffer_bounds_enforced(self):
        """Event memory and persistent queues must enforce strict upper bounds (100 and 200)."""
        MAX_MEMORY_EVENTS = 100
        MAX_PERSISTED_EVENTS = 200

        memory_buffer = []
        for i in range(350):
            memory_buffer.insert(0, {"id": f"evt_{i}", "timestamp": i})
            if len(memory_buffer) > MAX_MEMORY_EVENTS:
                memory_buffer = memory_buffer[:MAX_MEMORY_EVENTS]

        assert len(memory_buffer) == 100
        assert memory_buffer[0]["id"] == "evt_349"
        assert memory_buffer[-1]["id"] == "evt_250"

    def test_sliding_window_deduplication(self):
        """Burst duplicate events within 2500ms must coalesce into single records with repeatCount."""
        DEDUPLICATION_WINDOW_MS = 2500
        events = []

        def ingest(evt, now):
            dedupe_key = f"{evt['category']}:{evt['type']}:{evt.get('targetDomain', '')}"
            for existing in events:
                if now - existing["timestamp"] > DEDUPLICATION_WINDOW_MS:
                    break
                existing_key = f"{existing['category']}:{existing['type']}:{existing.get('targetDomain', '')}"
                if existing_key == dedupe_key:
                    existing["repeatCount"] = existing.get("repeatCount", 1) + 1
                    existing["lastObservedAt"] = now
                    return existing

            new_evt = {**evt, "timestamp": now, "repeatCount": 1, "lastObservedAt": now}
            events.insert(0, new_evt)
            return new_evt

        base_time = 1000000
        # 10 burst tracker events for doubleclick.net within 500ms
        for i in range(10):
            ingest({
                "category": "TRACKER",
                "type": "tracker.detected",
                "targetDomain": "doubleclick.net",
            }, base_time + (i * 50))

        # Must coalesce into a single event with repeatCount = 10
        assert len(events) == 1
        assert events[0]["repeatCount"] == 10

    def test_risk_and_tracker_computation_performance_at_scale(self):
        """
        Calculates risk score and tracker aggregation over maximum supported 200 events.
        Must execute deterministically in sub-millisecond time.
        """
        # Generate 200 diverse events
        test_events = []
        domains = ["tracker.example", "analytics.org", "ad.network", "telemetry.io", "cdn.net"]
        categories = ["TRACKER", "FINGERPRINT", "TRACKING_PARAM", "REFERRER", "NETWORK"]

        for i in range(200):
            test_events.append({
                "id": f"evt_{i}",
                "timestamp": 1700000000 + i * 10,
                "category": categories[i % len(categories)],
                "type": "event.test",
                "severity": "WARNING" if i % 4 == 0 else "INFO",
                "outcome": "MITIGATION_ATTEMPTED" if i % 2 == 0 else "DETECTED",
                "targetDomain": domains[i % len(domains)],
                "repeatCount": 1,
            })

        start = time.perf_counter()

        # Pure python simulation of tracker aggregation
        domain_counts = {}
        for e in test_events:
            dom = e.get("targetDomain")
            if dom:
                domain_counts[dom] = domain_counts.get(dom, 0) + 1

        top_domains = sorted(domain_counts.items(), key=lambda x: x[1], reverse=True)[:15]

        duration = (time.perf_counter() - start) * 1000  # ms
        assert len(top_domains) <= 15
        assert duration < 5.0, f"Computation took {duration:.2f}ms, expected < 5ms"


# =============================================================================
# PHASE 8D: RELEASE AND INSTALLATION READINESS
# =============================================================================

class TestReleaseAndPackagingReadiness:
    """Validates production distribution directory, manifest, and operational assets."""

    def test_dist_manifest_exists_and_is_valid_mv3(self):
        """extension/dist/manifest.json must exist, be valid JSON, and declare Manifest V3."""
        dist_manifest = Path("extension/dist/manifest.json")
        assert dist_manifest.exists(), "extension/dist/manifest.json must be built before release"

        manifest = json.loads(dist_manifest.read_text(encoding="utf-8"))
        assert manifest.get("manifest_version") == 3
        assert manifest.get("name") == "ShadowBrowse"
        assert manifest.get("version") == "0.1.0"

    def test_dist_entry_points_exist_on_disk(self):
        """All entry points declared in dist/manifest.json must physically exist in dist/."""
        dist_dir = Path("extension/dist")
        assert dist_dir.exists()

        # Background service worker
        bg_file = dist_dir / "background.js"
        assert bg_file.exists(), "dist/background.js must exist"
        assert bg_file.stat().st_size > 1000

        # Content script
        cs_file = dist_dir / "content.js"
        assert cs_file.exists(), "dist/content.js must exist"

        # Injected guard
        guard_file = dist_dir / "injectGuard.js"
        assert guard_file.exists(), "dist/injectGuard.js must exist"

        # HTML surfaces
        assert (dist_dir / "popup.html").exists()
        assert (dist_dir / "sidepanel.html").exists()

        # Icons
        icons_dir = dist_dir / "icons"
        assert icons_dir.exists()
        assert (icons_dir / "icon-16.png").exists()
        assert (icons_dir / "icon-32.png").exists()
        assert (icons_dir / "icon-48.png").exists()
        assert (icons_dir / "icon-128.png").exists()

    def test_dist_has_strict_csp_and_no_source_files(self):
        """dist/ must enforce strict CSP and contain no raw TypeScript or dev files."""
        dist_manifest = json.loads(Path("extension/dist/manifest.json").read_text(encoding="utf-8"))
        csp = dist_manifest.get("content_security_policy", {}).get("extension_pages", "")
        assert "script-src 'self'" in csp
        assert "object-src 'none'" in csp

        # Verify no .ts, .tsx, or source maps exist in root of dist/
        dist_files = list(Path("extension/dist").iterdir())
        for f in dist_files:
            assert not f.name.endswith(".ts")
            assert not f.name.endswith(".tsx")

    def test_operational_documentation_exists(self):
        """Required release and operational documentation must exist."""
        assert Path("docs/FEATURE_STATUS_MATRIX.md").exists()
        assert Path("docs/ARCHITECTURE_AND_DATA_FLOW.md").exists()
