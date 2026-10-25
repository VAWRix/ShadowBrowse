# ShadowBrowse — Remaining Roadmap & Phase 5 Readiness

**Date:** October 25, 2026  
**Status:** Audit & Recovery Completed  
**Branch:** `phase4-privacy-mitigation`  

---

## 1. Status of Historical Roadmap

### Completed Milestones
- **Phase 1: Extension & Agent Foundation** — Completed.
- **Phase 2: Core Privacy & Local Agent** — Completed & Audited.
- **Phase 3: Tor Network Routing & Fail-Closed Kill Switch** — Completed & Audited.
- **Phase 4A: Browser Identity Threat Model & Capability Matrix** — Completed & Audited.
- **Phase 4B: Privacy Mitigation & Tracking Defense Engine** — Completed & Audited.
- **Phase 4.5: Professional UI Overhaul** — Completed & Audited.

### Incomplete or Deferred Historical Items
1. **DNR Pre-Dispatch URL Query Transformation:**
   - In Phase 4B, tracking parameters are sanitized via `window.history.replaceState` at `document_start`.
   - Deferred: Upgrading to declarativeNetRequest `redirect.transform.queryTransform.removeParams` to sanitize query parameters *before* the initial HTTP request leaves the browser network stack.
2. **Unified Persistent Event Store for Audit Trail:**
   - Security events are currently stored in an in-memory ring buffer (max 100 events in `EventBus.ts`) and cleared when the service worker is terminated or the user clicks "Clear".
   - Deferred: A bounded, privacy-preserving persistent event store in `chrome.storage.local`.
3. **Automated Frontend Component Tests:**
   - 98 Python tests validate the agent, protocol contracts, and privacy logic.
   - Deferred: Adding Vitest or Jest for React UI component testing in `extension/`.

---

## 2. Technical Debt & Hardening Gaps

1. **Service Worker Inactivity Lifecycle & Event Persistence:**
   - Service workers in Manifest V3 are ephemeral and can be terminated by Chromium when idle (~30 seconds).
   - While `session_state` and `settings` are saved in `chrome.storage.local`, `EventBus` events are held in memory.
   - *Recommendation:* Persist the last 50 security events into `chrome.storage.local` under `security_events` to ensure continuity across service worker idle restarts.
2. **Dynamic Rule Limit Management:**
   - Chrome Declarative Net Request imposes a limit on dynamic rules (100–5,000 depending on Chrome version).
   - ShadowBrowse currently uses 15 curated tracker rules and 1 referrer rule (IDs 101–402 and 9001), well within safe limits.
   - *Recommendation:* Add an assertion check on `chrome.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_RULES` before rule synchronization.
3. **Agent Token Rotation:**
   - The auth token is generated once and stored in `~/.shadowbrowse/agent.token`.
   - *Recommendation:* Provide a user-initiated "Rotate Agent Token" action in the Settings view.

---

## 3. Phase 5 Readiness Assessment (Privacy Intelligence)

### Architecture Feasibility Evaluation
The proposed Phase 5 roadmap consists of six sub-phases:
- **Phase 5A:** Privacy Event Engine
- **Phase 5B:** Privacy Risk Engine
- **Phase 5C:** Tracker Intelligence
- **Phase 5D:** Privacy Timeline
- **Phase 5E:** Explainable Blocking ("Why was this blocked?")
- **Phase 5F:** Session Privacy Report

### Findings Against Current Codebase
1. **Existing Event Sources:**
   - `EventBus.ts` already captures categories: `NETWORK`, `IDENTITY`, `STORAGE`, `FINGERPRINT`, `WEBRTC`, `DNS`, `SESSION`, `KILL_SWITCH`, `TRACKER`, `TRACKING_PARAM`, `REFERRER`.
   - `TrackerDefenseController.ts` already emits structured `TrackerEventDetail` events with rule ID, domain, category, and action (`TRACKER_BLOCKED`, `TRACKER_DETECTED`, `TRACKER_ALLOWED`).
   - `contentScript.ts` emits `PAGE_SECURITY_EVENT` for fingerprint probes and tracking parameter removals.
2. **Readiness Determination:**
   - The current architecture **IS READY** for Phase 5.
   - However, implementing all of Phase 5 in one monolithic step risks breaking existing stability.
   - A disciplined, incremental approach must be followed.

### Prerequisites & Guardrails for Phase 5
1. **Privacy Minimization (Zero History Leakage):**
   - The Privacy Event Engine must NEVER log raw navigation URLs that include search queries, session tokens, or personal identifiers.
   - Only parsed hostnames (e.g. `google-analytics.com`), rule IDs, and event categories may be retained.
2. **Bounded Storage:**
   - Event retention must be capped (e.g., maximum 200 events or 7-day retention) to prevent uncontrolled growth in `chrome.storage.local`.
3. **Honesty Enforcement:**
   - Unverified actions must never be labeled as "Protected" in timelines or reports.
   - Differentiate strictly between `BLOCKED` (confirmed dropped), `DETECTED` (observed), and `ALLOWED` (exempted by whitelist).

---

## 4. Recommended Next Steps in Dependency Order

```
[ Step 1: Pre-Phase 5 Hygiene ]
  ├─► Verify and approve working tree audit repairs
  └─► Merge phase4-privacy-mitigation to main when ready

[ Step 2: Phase 5A — Privacy Event Engine Foundation ]
  ├─► Unify EventBus and TrackerDefenseController event models
  ├─► Implement privacy-safe event sanitization (hostname-only, no queries)
  └─► Add bounded persistent storage in chrome.storage.local (max 200 events)

[ Step 3: Phase 5B & 5C — Risk Engine & Tracker Intelligence ]
  ├─► Calculate real-time session risk index (0–100) based on verified events
  └─► Expand curated tracker taxonomy with clear provenance and categories

[ Step 4: Phase 5D & 5E — Privacy Timeline & Explainable Blocking ]
  ├─► Add interactive timeline component in Side Panel
  └─► Provide one-click "Why was this blocked?" explanation modals

[ Step 5: Phase 5F — Session Privacy Report ]
  └─► Generate end-of-session exportable summary (cryptographic session ID, duration, trackers blocked, cleanups verified)
```

---

## 5. Phase 5A Sprint Scoping Assessment & Decision (3-Day Review Sprint)

### Evaluation Framework
During the 3-day review sprint, a formal engineering assessment evaluated whether a small Phase 5A foundation (unifying the typed event model and adding bounded `chrome.storage.local` persistence to `EventBus`) could be safely implemented before the final project review.

### Decision: DEFER Phase 5A Implementation to Post-Review (Design Sealed)

**Technical Rationale:**
1. **Chromium Storage Write-Quota Limits:**  
   Persisting security events on every tracker hit directly into `chrome.storage.local` without debouncing or batching poses a concrete risk of exceeding Chromium's extension storage write quotas (`MAX_WRITE_OPERATIONS_PER_MINUTE`) during live page browsing demonstrations with heavy tracker loads.
2. **Review Stability Priority:**  
   The existing system is 100% stable, fully demonstrable, and backed by a complete end-to-end acceptance run (`acceptance_results.json`) and 98 passing automated tests. Introducing asynchronous storage I/O and quota buffering 3 days prior to evaluation introduces unnecessary risk to an already verified release candidate.
3. **Execution Ready Architecture:**  
   The sealed design specified in Section 4 (Steps 2–5) is fully documented and ready for immediate implementation following the final project review.
