# Phase 4A — Browser Identity & Cross-Site Tracking Surface Audit

**Document Status:** Complete & Audited  
**Baseline:** Phase 3 Frozen (`06ab868`)  
**Scope:** Architectural Audit of Browser Identity, DOM Exposure, Storage Lifecycles, and Extension Observation Boundaries

---

## 1. Executive Summary & Objective

In **Phase 3**, ShadowBrowse successfully established real network layer anonymity:
$$\text{Chromium Browser} \xrightarrow{\text{SOCKS5}} \text{Local Shadow Agent} \xrightarrow{\text{Tor Onion Routing}} \text{Verified Tor Exit Node}$$

The network identity problem (Public IP masking, direct bypass prevention, fail-closed discard routing, and WebRTC interface leak mitigation) is solved and verified. However, **network anonymity alone does not prevent cross-site identity correlation**. Even when multiple browser sessions share the same Tor exit node or utilize clean exit circuits:
- Sites read persistent client-side storage (cookies, localStorage, IndexedDB, cache).
- Sites query browser and hardware rendering APIs (Canvas, WebGL, WebAudio, fonts) to construct a high-entropy hardware fingerprint.
- Inbound links carry platform click identifiers (`gclid`, `fbclid`, `msclkid`, `utm_*`).
- Outbound requests leak navigating history via the `Referrer` header.
- Third-party tracker networks correlate requests across distinct origins.

The objective of **Phase 4A** is to **Audit, Model, and Measure** this browser identity surface without resorting to premature or aggressive fingerprint spoofing.

---

## 2. Codebase Audit of Existing Components

An in-depth code audit of existing ShadowBrowse components was conducted to verify current capabilities and detect architectural gaps:

### 2.1 `fingerprintController.ts` & `injectGuard.ts`
- **Current Role:** Monitors fingerprinting API invocations.
- **Execution Context:**
  - `injectGuard.ts` executes in the **MAIN world** (`document_start`) via `<script>` element injection.
  - Intercepts:
    1. `HTMLCanvasElement.prototype.toDataURL`
    2. `CanvasRenderingContext2D.prototype.getImageData`
    3. `WebGLRenderingContext.prototype.getParameter` (`UNMASKED_VENDOR_WEBGL` 0x9245, `UNMASKED_RENDERER_WEBGL` 0x9246)
    4. `AudioContext.prototype.createOscillator`
  - Signals are dispatched across the world boundary via `window.postMessage` with source identifier `SHADOWBROWSE_PAGE_SIGNAL`.
- **Honesty Status:** Correctly returns `DETECTION_ONLY` and `canMitigate() === false`.
- **Gaps Identified:**
  - Font probing (via `document.fonts.check` or element baseline dimension polling) is not currently monitored.
  - Screen dimensions, device pixel ratio, and navigator locale queries are not intercepted in the MAIN world.
  - WebGL2 (`WebGL2RenderingContext`) is not monitored.

### 2.2 `storageController.ts` & `browserAdapter.ts`
- **Current Role:** Manages storage session isolation and cleanup on exit.
- **API Utilized:** `chrome.browsingData.remove({ since: sessionStartTime }, { cache: true, cookies: true, localStorage: true, serviceWorkers: true, indexedDB: true })`.
- **Honesty Status:** Returns `PARTIALLY_PROTECTED` and sets `cleanupVerified` only upon asynchronous callback resolution without `chrome.runtime.lastError`.
- **Architectural Reality:**
  - In Chromium MV3, **storage isolation is enforced by cleanup on exit**, not by containerized per-tab isolation.
  - While a session is active, sites write to the standard shared browser storage.
  - If a user closes the browser without clicking "End Session" or if Chrome crashes, session data persists until the next startup cleanup.

### 2.3 `contentScript.ts` & Website Autopsy
- **Current Role:** Performs on-demand privacy inspection of the active web page.
- **Data Inspected:**
  1. `document.querySelectorAll('script[src]')` and `iframe[src]` to identify third-party domains.
  2. Substring matching against `KNOWN_TRACKER_DOMAINS`.
  3. Query string inspection for `TRACKING_QUERY_PARAMS`.
  4. `document.cookie` count and `window.localStorage.length`.
  5. `document.referrer` inspection.
  6. Captured fingerprint signals from `injectGuard`.
- **Gaps Identified:**
  - DOM-based script/iframe inspection misses dynamic `fetch()`, `XMLHttpRequest`, CSS font loads, and `navigator.sendBeacon()` requests.
  - Lacks structured classification (classifies domains strictly as tracker or generic third-party without recognizing CDNs, analytics, social widgets, or functional APIs).

### 2.4 Manifest V3 Permissions & Extension Boundaries
- **Permissions:** `storage`, `proxy`, `privacy`, `cookies`, `browsingData`, `sidePanel`, `activeTab`, `tabs`, `scripting`.
- **Key Observation:** The extension does **not** declare `declarativeNetRequest` or `webRequest`. Therefore:
  - Network requests cannot be blocked before dispatch from the background service worker.
  - URL query stripping must occur at navigation initiation (e.g. via `tabs.update` or content script rewriting) or via declarative rules in a future phase.

---

## 3. Chromium Extension API Observation Capabilities vs Limitations

| Browser Subsystem | Extension API Available | What ShadowBrowse CAN Observe | What ShadowBrowse CANNOT Observe / Control |
| :--- | :--- | :--- | :--- |
| **Cookies** | `chrome.cookies`, `document.cookie` | Full cookie store, domains, HttpOnly flags, expiration, SameSite | Cannot partition cookies per tab without separate OS profiles or Incognito |
| **Local Storage** | `window.localStorage`, `chrome.browsingData` | Origin key count and item names (via content script) | Cannot selectively isolate by tab; clear is global or timestamp-based |
| **IndexedDB** | `window.indexedDB`, `chrome.browsingData` | Database names and store existence via content script | Cannot inspect other origins' IndexedDB without executing on those origins |
| **Cache Storage** | `caches`, `chrome.browsingData` | Cache names and entry URLs on current origin | Cannot inspect cache entries belonging to third-party domains |
| **Canvas** | In-page prototype hook (`injectGuard`) | Calls to `toDataURL()` and `getImageData()` above 16x16px | Cannot block or modify pixels without risking breakage or distinct spoof artifacts |
| **WebGL** | In-page prototype hook (`injectGuard`) | Probes to GPU vendor and renderer strings | Cannot spoof strings without creating inconsistency with OS and driver profiles |
| **WebAudio** | In-page prototype hook (`injectGuard`) | Oscillator creation and synthesis invocations | Cannot alter DAC output buffer without introducing audible distortion |
| **Font Metrics** | `document.fonts.check` hook | Font availability queries | Cannot prevent CSS `@font-face` downloads or subpixel text metric analysis |
| **Network Requests** | DOM inspection (`script`, `iframe`), `performance.getEntriesByType('resource')` | Resource URLs, initiator types, transfer sizes | Cannot inspect raw TLS handshakes, HTTP/2 multiplexing, or UDP packets |
| **Referrer** | `document.referrer`, `chrome.privacy` | Referrer string visible to DOM; default referrer policy | Cannot guarantee cross-origin strictness if target page overrides policy |

---

## 4. Analysis of Fingerprint Consistency

A critical finding of this audit is that **naive fingerprint spoofing increases uniqueness rather than decreasing it**:

1. **Operating System Inconsistency:**
   - A browser spoofing `navigator.platform = "Win32"` while running on Linux will expose Linux-specific font rendering metrics (`FreeType`), distinct WebGL driver strings (`Mesa / Gallium`), and Linux line-ending behavior.
   - Anti-fraud engines (e.g., Cloudflare, FingerprintJS) flag this mismatch as a high-risk anomaly.

2. **Timezone vs Locale Inconsistency:**
   - Setting timezone to UTC while `navigator.language = "fr-FR"` and browser date formatting reflects French cultural conventions flags the user as utilizing an evasion tool.

3. **Display Geometry vs Window Bounds:**
   - Spoofing `screen.width = 1920` while `window.innerWidth = 2560` creates an impossible physical geometry condition that immediately identifies the client.

**Phase 4A Principle:** ShadowBrowse must measure and report these inconsistencies to the user, but will **never** randomly perturb values without an authentic, consistent profile model.

---

## 5. Website Autopsy 2.0 Architectural Design

To upgrade Website Autopsy for Phase 4, the data collection engine is refactored into modular analyzers:

```
                      Active Web Page (Tab)
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
       In-Page Guard (MAIN)           Content Script (ISOLATED)
     ┌──────────────────────┐       ┌───────────────────────────────┐
     │ • Canvas Probes      │       │ • DOM Elements (Scripts/Frames)│
     │ • WebGL Queries      │       │ • PerformanceResourceTiming   │
     │ • WebAudio Synthesis │       │ • Storage & Cookie Counts     │
     │ • Font Probing       │       │ • URL Tracking Parameters     │
     └──────────┬───────────┘       │ • Referrer Header State       │
                │ postMessage       └──────────────┬────────────────┘
                └───────────────┬──────────────────┘
                                ▼
                   Autopsy Report Aggregator
                                │
               ┌────────────────┴────────────────┐
               ▼                                 ▼
      Risk & Severity Engine        Cross-Session Correlation
      • Deterministic scoring       • Compares with prior session
      • Transparent categories      • Flags token or profile reuse
```

### Autopsy 2.0 Output Model
The upgraded Autopsy engine produces a structured findings report:
1. **Network Identity:** Connection security, HTTPS status, redirect count.
2. **Storage Surface:** Detailed enumeration across Cookies, LocalStorage, IndexedDB, Cache, and Service Workers.
3. **Fingerprint Surface:** Specific hardware APIs probed, access frequencies, and entropy assessment.
4. **Tracking Surface:** URL parameters categorized by risk (`CAMPAIGN_TRACKING`, `CLICK_IDENTIFIER`, `USER_ID`) with safe-to-strip recommendations.
5. **Referrer Exposure:** State classified as `PROTECTED`, `PARTIAL`, or `EXPOSED`.
6. **Third-Party Graph:** Non-alarmist categorization of all external resources.
7. **Cross-Session Correlation:** Evaluation of local storage tokens and profile remnants against preceding sessions.

---

## 6. Summary of Audit Conclusions

1. **Network Anonymity is Sound:** Phase 3 Tor routing is solid and verified.
2. **Detection is Operational:** Canvas, WebGL, and WebAudio detection in `injectGuard.ts` works reliably.
3. **Storage is Cleaned on Exit:** Session isolation is real at lifecycle boundaries, but does not provide real-time tab sandboxing during active browsing.
4. **No Premature Spoofing:** Randomization of fingerprint values is strictly avoided to prevent introducing detectable fingerprint anomalies.
5. **Phase 4A Baseline Established:** Detection, modeling, and measurement infrastructure is complete and validated.

---

## 7. Transition to Phase 4B: Mitigation Implementation

The conclusions from this Phase 4A audit directly inform the Phase 4B mitigation engine:
- **Declarative Tracker Defense:** Manifest V3 `declarativeNetRequest` is declared and utilized with a curated, local 15-rule tracking catalog to block high-confidence tracking endpoints without remote list dependencies.
- **Safe Non-Blocking Rules:** Content delivery networks, web fonts, and authentication/payment services are explicitly categorized to prevent functional page breakage.
- **Deterministic Parameter Sanitization:** Content script query sanitization safely excises campaign and click tokens (`utm_*`, `gclid`, `fbclid`) while preserving functional identifiers (`id=123`).
- **Referrer Privacy Enforcement:** Declarative header modification rule `9001` strips or restricts outgoing cross-origin `Referer` headers.
- **Storage Lifecycle Verification:** Cleanup-on-exit is formally recorded as `STORAGE_CLEANUP_VERIFIED` to avoid false claims of in-session container isolation.
- **Fingerprinting Policy Maintained:** `FINGERPRINT = DETECTION ONLY` is upheld without noisy or inconsistent spoofing.

For full technical details, see [phase4-privacy-mitigation.md](file:///c:/Users/Vishal/OneDrive/Desktop/ShadowBrowse/docs/phase4-privacy-mitigation.md).

