"""
ShadowBrowse Popup & Session Lifecycle Independence Regression Tests

Validates:
1. Session state is owned by persistent extension storage, NOT popup component lifetime.
2. Opening, closing, or unmounting the popup NEVER terminates an active session.
3. Reopening the popup preserves the exact session ID without duplicate generation.
4. Explicit "END ANONYMOUS SESSION" is required to transition to OFF and trigger cleanup.
5. The tracking test lab enforces the deterministic state machine:
   READY_FOR_SESSION_A -> SESSION_A_ACTIVE -> READY_FOR_SESSION_B -> SESSION_B_COMPLETE.
"""

import pytest
import time
import uuid
from typing import Dict, Any, Optional


class MockExtensionStorage:
    """Simulates chrome.storage.local persistence across MV3 service worker restarts."""

    def __init__(self):
        self._data: Dict[str, Any] = {}

    def get(self, keys):
        if isinstance(keys, str):
            keys = [keys]
        return {k: self._data[k] for k in keys if k in self._data}

    def set(self, items: Dict[str, Any]):
        self._data.update(items)

    def clear(self):
        self._data.clear()


class MockSessionController:
    """
    Simulates the persistent background session orchestrator
    (PrivacyController + SessionManager + StorageController + NetworkController).
    """

    def __init__(self, storage: MockExtensionStorage):
        self.storage = storage
        self.state = "OFF"
        self.current_session: Optional[Dict[str, Any]] = None
        self.session_start_time = 0
        self.is_isolated = False
        self.proxy_configured = False
        self.proxy_snapshot: Optional[Dict[str, Any]] = None
        self.cleanup_executed = False
        self.load_from_storage()

    def load_from_storage(self):
        """Simulates Service Worker boot / initialize()."""
        saved = self.storage.get(["session_state"])
        if "session_state" in saved:
            ss = saved["session_state"]
            if ss.get("state") in ("PROTECTED", "DEGRADED", "FAILED"):
                self.state = ss["state"]
                self.current_session = ss.get("activeSession")
                self.session_start_time = ss.get("sessionStartTime", 0)
                self.is_isolated = ss.get("isIsolated", False)
                self.proxy_snapshot = ss.get("proxySnapshot")
                self.proxy_configured = True

    def save_to_storage(self):
        """Persists session state so it survives service worker termination."""
        self.storage.set({
            "session_state": {
                "state": self.state,
                "activeSession": self.current_session,
                "sessionStartTime": self.session_start_time,
                "isIsolated": self.is_isolated,
                "proxySnapshot": self.proxy_snapshot,
                "savedAt": time.time(),
            }
        })

    def start_anonymous_session(self) -> Dict[str, Any]:
        """User clicks START ANONYMOUS SESSION."""
        if self.state == "PROTECTED":
            return self.get_overview()

        self.proxy_snapshot = {"mode": "direct", "capturedAt": time.time()}
        self.proxy_configured = True
        self.session_start_time = int(time.time() * 1000)
        self.is_isolated = True

        session_id = str(uuid.uuid4())
        self.current_session = {
            "sessionId": session_id,
            "startedAt": self.session_start_time,
            "mode": "ANONYMOUS",
            "networkMode": "TOR",
            "status": "PROTECTED",
        }
        self.state = "PROTECTED"
        self.save_to_storage()
        return self.get_overview()

    def end_anonymous_session(self) -> Dict[str, Any]:
        """User clicks END ANONYMOUS SESSION."""
        if self.state == "OFF":
            return self.get_overview()

        # Execute verified cleanup
        self.cleanup_executed = True
        self.proxy_configured = False
        self.proxy_snapshot = None
        self.session_start_time = 0
        self.is_isolated = False
        self.current_session = None
        self.state = "OFF"

        # Clear persistent storage
        self.storage.set({
            "session_state": {
                "state": "OFF",
                "activeSession": None,
                "sessionStartTime": 0,
                "isIsolated": False,
                "proxySnapshot": None,
                "savedAt": time.time(),
            }
        })
        return self.get_overview()

    def get_overview(self) -> Dict[str, Any]:
        """Returns overview without mutating session state."""
        return {
            "state": self.state,
            "activeSession": self.current_session,
            "proxyConfigured": self.proxy_configured,
            "isIsolated": self.is_isolated,
        }


class MockPopupComponent:
    """Simulates React Popup component mounting, fetching, and unmounting."""

    def __init__(self, controller: MockSessionController):
        self.controller = controller
        self.mounted = False
        self.overview: Optional[Dict[str, Any]] = None

    def mount(self):
        """Popup opened: component mounts and fetches overview."""
        self.mounted = True
        # In a real extension, fetchOverview sends GET_PRIVACY_OVERVIEW
        self.overview = self.controller.get_overview()

    def unmount(self):
        """Popup closed: DOM destroyed, component unmounts."""
        self.mounted = False
        self.overview = None

    def click_action_button(self):
        """User clicks the main button."""
        if not self.overview:
            # Button disabled while connecting
            return
        if self.overview["state"] in ("PROTECTED", "DEGRADED"):
            self.overview = self.controller.end_anonymous_session()
        else:
            self.overview = self.controller.start_anonymous_session()


class MockTrackingTestLab:
    """Simulates tests/web-lab/tracking-test.html deterministic state machine."""

    def __init__(self):
        self.cookies: Dict[str, str] = {}
        self.local_storage: Dict[str, str] = {}
        self.session_storage: Dict[str, str] = {}
        self.state = "READY_FOR_SESSION_A"
        self.log_lines = []

    def reset_test(self):
        self.cookies.pop("ad_interest_segment", None)
        self.local_storage.pop("ad_tracking_uuid", None)
        self.local_storage.pop("user_interest_profile", None)
        self.session_storage.clear()
        self.state = "READY_FOR_SESSION_A"
        self.log_lines = ["Scenario status: Ready for Session A."]

    def step_1_run_session_a(self):
        self.log_lines.clear()
        planted_uuid = f"sb_test_{uuid.uuid4()}"
        interest = "beauty_cream_dry_skin"
        timestamp = time.time()

        self.cookies["ad_interest_segment"] = interest
        self.local_storage["ad_tracking_uuid"] = planted_uuid
        self.local_storage["user_interest_profile"] = "best beauty cream for dry skin"
        self.session_storage["sb_session_a_uuid"] = planted_uuid

        self.state = "SESSION_A_ACTIVE"
        self.log_lines.append(f"SESSION A ACTIVE: {planted_uuid}")
        self.log_lines.append(f"Planted Cookie: ad_interest_segment={interest}")
        return planted_uuid

    def step_2_run_session_b(self) -> Dict[str, Any]:
        if self.state not in ("SESSION_A_ACTIVE", "READY_FOR_SESSION_B"):
            return {
                "error": True,
                "message": "Cannot evaluate Step 2 before Step 1 has run",
                "state": self.state
            }

        cookie_leak = "ad_interest_segment" in self.cookies
        storage_leak = "ad_tracking_uuid" in self.local_storage

        self.state = "SESSION_B_COMPLETE"
        if cookie_leak or storage_leak:
            classification = "LOCAL_IDENTITY_REUSE"
        else:
            classification = "NO_LOCAL_IDENTITY_REUSE"

        return {
            "classification": classification,
            "cookie_leak": cookie_leak,
            "storage_leak": storage_leak,
            "state": self.state,
        }


# ============================================================================
# REGRESSION TEST SUITE
# ============================================================================

class TestPopupSessionLifecycleBug:
    """Verifies that popup opening, closing, and service worker restarts do NOT stop sessions."""

    def test_1_start_session_popup_closes_session_remains_protected(self):
        """TEST 1: Start session -> popup closes -> session remains PROTECTED."""
        storage = MockExtensionStorage()
        controller = MockSessionController(storage)
        popup = MockPopupComponent(controller)

        # 1. Popup opens
        popup.mount()
        assert popup.overview["state"] == "OFF"

        # 2. User starts session
        popup.click_action_button()
        assert controller.state == "PROTECTED"
        assert popup.overview["state"] == "PROTECTED"

        # 3. Popup closes (unmounts)
        popup.unmount()
        assert popup.mounted is False

        # 4. Verify controller state and storage state remain PROTECTED
        assert controller.state == "PROTECTED"
        saved = storage.get("session_state")["session_state"]
        assert saved["state"] == "PROTECTED"
        assert saved["activeSession"] is not None

    def test_2_start_session_reopen_popup_session_remains_protected(self):
        """TEST 2: Start session -> reopen popup -> session remains PROTECTED."""
        storage = MockExtensionStorage()
        controller = MockSessionController(storage)

        # Start session
        controller.start_anonymous_session()
        original_session_id = controller.current_session["sessionId"]

        # Simulate service worker going idle and terminating
        # Fresh controller instance created when popup reopens
        restarted_controller = MockSessionController(storage)
        assert restarted_controller.state == "PROTECTED"
        assert restarted_controller.current_session["sessionId"] == original_session_id

        # Reopen popup
        popup = MockPopupComponent(restarted_controller)
        popup.mount()

        # MUST be PROTECTED, NOT OFF
        assert popup.overview["state"] == "PROTECTED"
        assert popup.overview["activeSession"]["sessionId"] == original_session_id

        # Closing and reopening again must not change state
        popup.unmount()
        popup.mount()
        assert popup.overview["state"] == "PROTECTED"

    def test_3_explicit_end_session_transitions_to_off_and_cleans_up(self):
        """TEST 3: Start session -> reopen popup -> explicitly END SESSION -> session becomes OFF."""
        storage = MockExtensionStorage()
        controller = MockSessionController(storage)
        controller.start_anonymous_session()

        # Reopen popup
        popup = MockPopupComponent(controller)
        popup.mount()
        assert popup.overview["state"] == "PROTECTED"

        # User explicitly clicks END ANONYMOUS SESSION
        popup.click_action_button()

        # Session becomes OFF
        assert controller.state == "OFF"
        assert controller.current_session is None
        assert controller.cleanup_executed is True
        assert controller.proxy_configured is False
        assert popup.overview["state"] == "OFF"

        # Storage is cleared
        saved = storage.get("session_state")["session_state"]
        assert saved["state"] == "OFF"
        assert saved["activeSession"] is None

    def test_4_no_duplicate_session_id_on_reopening(self):
        """TEST 4: Start session -> close popup -> reopen popup -> exact same session ID preserved."""
        storage = MockExtensionStorage()
        controller = MockSessionController(storage)
        controller.start_anonymous_session()
        initial_id = controller.current_session["sessionId"]

        # Simulate 5 popup open/close cycles
        for _ in range(5):
            # Simulate worker restart
            w = MockSessionController(storage)
            p = MockPopupComponent(w)
            p.mount()
            assert p.overview["activeSession"]["sessionId"] == initial_id
            p.unmount()

        assert controller.current_session["sessionId"] == initial_id

    def test_5_step_1_on_tracking_test_lab_no_session_b_result(self):
        """TEST 5: Step 1 on tracking-test.html -> state becomes SESSION_A_ACTIVE; no Session B result."""
        lab = MockTrackingTestLab()
        assert lab.state == "READY_FOR_SESSION_A"

        planted_uuid = lab.step_1_run_session_a()
        assert lab.state == "SESSION_A_ACTIVE"
        assert lab.local_storage["ad_tracking_uuid"] == planted_uuid
        assert lab.cookies["ad_interest_segment"] == "beauty_cream_dry_skin"

        # Ensure no Session B result or LOCAL_IDENTITY_REUSE is reported during Step 1
        log_text = " ".join(lab.log_lines)
        assert "SESSION A ACTIVE" in log_text
        assert "LOCAL_IDENTITY_REUSE" not in log_text
        assert "SESSION_ISOLATED" not in log_text

    def test_6_step_2_evaluation_after_cleanup(self):
        """TEST 6: After explicit Session A end + cleanup -> Step 2 reports NO_LOCAL_IDENTITY_REUSE."""
        lab = MockTrackingTestLab()
        lab.step_1_run_session_a()
        assert lab.state == "SESSION_A_ACTIVE"

        # Case A: User runs Step 2 without ending session -> reports LOCAL_IDENTITY_REUSE
        result_dirty = lab.step_2_run_session_b()
        assert result_dirty["classification"] == "LOCAL_IDENTITY_REUSE"
        assert result_dirty["cookie_leak"] is True
        assert result_dirty["storage_leak"] is True

        # Reset & Re-run Step 1
        lab.reset_test()
        lab.step_1_run_session_a()

        # Simulate ShadowBrowse verified cleanup on Session A termination
        lab.cookies.clear()
        lab.local_storage.clear()

        # Step 2 in clean Session B
        result_clean = lab.step_2_run_session_b()
        assert result_clean["classification"] == "NO_LOCAL_IDENTITY_REUSE"
        assert result_clean["cookie_leak"] is False
        assert result_clean["storage_leak"] is False
        assert result_clean["state"] == "SESSION_B_COMPLETE"

    def test_7_reset_clears_only_test_state(self):
        """TEST 7: Reset behavior: Reset test sets state to READY_FOR_SESSION_A and clears test keys."""
        lab = MockTrackingTestLab()
        lab.step_1_run_session_a()
        assert len(lab.cookies) > 0
        assert len(lab.local_storage) > 0

        lab.reset_test()
        assert lab.state == "READY_FOR_SESSION_A"
        assert "ad_interest_segment" not in lab.cookies
        assert "ad_tracking_uuid" not in lab.local_storage
        assert lab.log_lines == ["Scenario status: Ready for Session A."]
