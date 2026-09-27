# ShadowBrowse — Phase 4B: Privacy Mitigation & Tracking Defense Engine

**Document Status:** Complete & Audited  
**Baseline:** Phase 3 Tor Network Routing (`06ab868`) & Phase 4A Browser Identity Audit (`2904445`)  
**Branch:** `phase4-privacy-mitigation`  
**Philosophy:** Local-First, Deterministic, Safe, and Technically Honest.

---

## 1. Executive Summary

Phase 4B builds upon the stable, verified Tor routing and fail-closed network architecture of Phase 3 and the browser identity threat model established in Phase 4A.

In Phase 4B, ShadowBrowse transforms from:
$$\text{"Privacy Analysis + Tor Routing"}$$
into:
$$\text{"Privacy Analysis + Safe Browser Tracking Mitigation"}$$

The engine adheres to a strict implementation sequence:
$$\text{DETECT} \longrightarrow \text{CLASSIFY} \longrightarrow \text{MITIGATE} \longrightarrow \text{VERIFY} \longrightarrow \text{EXPLAIN}$$

### Core Architecture Rules
1. **Never Break Phase 3:** Network routing, Tor exit verification, route verification, kill switch, Tor recovery, proxy restoration, and WebRTC leak protection remain strictly intact and prioritized over all mitigation rules.
2. **Never Implement Blind Ad Blocking:** ShadowBrowse is a privacy and identity defense system, not a generic ad blocker or cosmetic filter.
3. **Safe Non-Blocking:** Functional infrastructure (CDNs, fonts, payment services, CAPTCHA/security providers) is explicitly protected from blocking.
4. **Never Inject Random Fingerprint Noise:** FINGERPRINT = DETECTION ONLY is maintained. Random canvas, WebGL, audio, or navigator noise increases browser uniqueness and creates easily detected anomalies.
5. **Technically Honest Language:** ShadowBrowse never claims "100% anonymous", "untraceable", or "completely private". Terms like `STORAGE_CLEANUP_VERIFIED` are used in place of "complete container isolation".

---

## 2. Mitigation Capabilities Matrix

| Mitigation Area | Status | Engine / Mechanism | Verification Status |
| :--- | :--- | :--- | :--- |
| **Tracking Parameter Sanitization** | ✅ REAL | Content script URL parser + `window.history.replaceState` | Verified (Automated & Web Lab) |
| **Declarative Tracker Defense** | ✅ REAL | Chromium MV3 `declarativeNetRequest` Dynamic Rules | Verified (Automated & Web Lab) |
| **Third-Party Request Graph** | ✅ REAL | `PerformanceResourceTiming` + DOM parser + Categorizer | Verified (Autopsy 2.0) |
| **Referrer Privacy Control** | ⚠️ PARTIAL | DeclarativeNetRequest `modifyHeaders` (Rule 9001) | Verified (Request headers modified) |
| **Storage Cleanup Verification** | ⚠️ PARTIAL | `chrome.browsingData.remove` with verified callback | Verified (`STORAGE_CLEANUP_VERIFIED`) |
| **Cross-Session Isolation** | ⚠️ PARTIAL | Ephemeral `crypto.randomUUID()`, cleanup at lifecycle boundaries | Verified (Beauty-Cream test suite) |
| **Fingerprint Protection** | 🔍 DETECTION ONLY | In-page main-world hooks (Canvas, WebGL, WebAudio, Fonts) | Verified (No value spoofing) |

---

## 3. Detailed Mitigation Breakdown

### 3.1 Tracking Parameter Sanitization

#### What It Does
Detects and safely removes known marketing, analytics, and click identifiers from navigation URLs while strictly preserving functional application parameters.

- **Classified Tracking Parameters:** `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `gclid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id`, `mc_eid`, `igshid`, `dclid`, `twclid`, `yclid`.
- **Preserved Functional Parameters:** `id`, `productId`, `page`, `q`, `search`, `category`, `token`, `ref_id`, `view`, etc.

#### How It Works
1. Operates under three user-selectable modes: `OFF`, `DETECT_ONLY`, and `SANITIZE` (default: `DETECT_ONLY`).
2. When navigating to a URL such as `https://example.com/product?id=123&utm_source=google&gclid=abc`:
   - The content script parses query parameters into `TRACKING_PARAMETER`, `FUNCTIONAL_PARAMETER`, and `UNKNOWN_PARAMETER`.
   - In `SANITIZE` mode, tracking keys are excised and the address bar is rewritten using `window.history.replaceState` without triggering a disruptive page reload.
   - Result: `https://example.com/product?id=123`.
   - Structured local events (`TRACKING_PARAMETER_DETECTED`, `TRACKING_PARAMETER_REMOVED`) are emitted.

#### How It Is Verified
- Automated test: `test_tracking_parameter_sanitization_deterministic` validates that tracking parameters are stripped while functional ones (`id=123`) are preserved.
- Local Web Lab: Interactive test page demonstrates `BEFORE -> ACTION -> AFTER -> VERIFICATION`.

#### What It Does Not Protect
- First-party tracking parameters transmitted inside HTTP POST request bodies or WebSocket payloads.
- State encoded in URL path segments (e.g., `/user/click_abc123/product`) or URL fragment hashes (`#gclid=abc`).
- Custom, site-specific obfuscated tracking keys not matching known identifiers.

#### Known Limitations
- Sanitization via `replaceState` occurs immediately upon content script execution (`document_start`), but the initial server HTTP request from Chrome may transmit the query string before client-side excision if navigation wasn't rewritten pre-dispatch.

---

### 3.2 Declarative Tracker Defense (MV3 `declarativeNetRequest`)

#### What It Does
Blocks known, high-confidence tracking resources (analytics beacons, ad trackers, fingerprinting scripts, tracking pixels, and social widgets) using Chromium's high-performance native `declarativeNetRequest` engine without inspecting payloads or relying on remote servers.

#### Curated Local Ruleset Categories
- `ANALYTICS_TRACKER`: Google Analytics, DoubleClick, Segment, Mixpanel, Amplitude, Hotjar.
- `AD_TRACKER`: Criteo, Taboola, Outbrain, Amazon AdSystem, TradeDesk.
- `FINGERPRINT_SCRIPT`: FingerprintJS, Sift Science.
- `TRACKING_PIXEL`: Facebook/Meta Pixel.
- `SOCIAL_TRACKER`: TikTok Analytics, Twitter Pixel, LinkedIn Insight Tag.

#### Safe Non-Blocking Policy
To prevent website breakage, the following categories are strictly excluded from blocking:
- **Content Delivery Networks (CDNs):** `cdn.jsdelivr.net`, `cdnjs.cloudflare.com`, `unpkg.com`.
- **Web Fonts:** `fonts.googleapis.com`, `fonts.gstatic.com`.
- **Payment Gateways:** `js.stripe.com`, `paypal.com`.
- **Security & CAPTCHA Services:** `recaptcha.net`, `challenges.cloudflare.com`.

#### How It Works
- User-selectable modes: `OFF`, `DETECT`, `BLOCK` (default: `DETECT`).
- In `BLOCK` mode, rules are synchronized to `chrome.declarativeNetRequest.updateDynamicRules` as native `block` actions for designated domains across script, sub_frame, xmlhttprequest, and ping resource types.
- In `DETECT` mode, dynamic block rules are cleared so requests are allowed, while Autopsy and request listeners classify and log observed trackers.
- All rules are stored locally in the extension bundle with complete provenance (`confidence: 0.95`, local deterministic source). No remote tracker lists are downloaded.

#### How It Is Verified
- Automated test: `test_tracker_defense_rules_and_blocking_modes` verifies dynamic rule generation, rule ID allocation, and mode toggling.
- Automated test: `test_safe_non_blocking_policy` guarantees critical CDNs, fonts, and payments remain in allowed categories.

#### What It Does Not Protect
- First-party analytics scripts hosted directly on the root domain (e.g., `example.com/stats.js`).
- CNAME-cloaked tracking endpoints where a third-party tracker is mapped to a first-party DNS record.

#### Known Limitations
- DeclarativeNetRequest rules are subject to browser quota limits (though ShadowBrowse's curated 15-rule list uses <1% of the 30,000 dynamic rule limit).

---

### 3.3 Third-Party Request Graph

#### What It Does
Upgrades Phase 4A request analysis into a structured, hierarchical request graph in Website Autopsy 2.0:
$$\text{FIRST\_PARTY} \longrightarrow \text{THIRD\_PARTY} \longrightarrow \text{CATEGORY} \longrightarrow \text{TRACKER / NON-TRACKER} \longrightarrow \text{ALLOWED / BLOCKED}$$

#### Categories
- `ANALYTICS_TRACKER`
- `AD_TRACKER`
- `FINGERPRINT_SCRIPT`
- `TRACKING_PIXEL`
- `SOCIAL_TRACKER`
- `CONTENT_DELIVERY`
- `SECURITY`
- `FUNCTIONAL`
- `UNCLASSIFIED`

#### How It Works
The content script inspects DOM elements (`<script>`, `<iframe>`, `<img>`) and `performance.getEntriesByType('resource')` records. Resources are parsed into their host domains, classified against the local rule catalog and CDN whitelist, and assigned their operational action state (`BLOCKED`, `DETECTED`, `ALLOWED`).

#### What It Does Not Protect
- WebSocket frames and WebRTC peer data channels.
- Obfuscated dynamic service worker requests executed outside page execution scope.

---

### 3.4 Referrer Privacy Mitigation

#### What It Does
Reduces browsing history leakage across origin boundaries by modifying HTTP `Referer` headers on outgoing requests.

- **Modes:**
  - `OFF`: Browser default referrer behavior.
  - `STANDARD`: Origin-only referrer on cross-origin requests (`strict-origin-when-cross-origin`).
  - `STRICT`: Complete removal of the `Referer` header (`no-referrer`).

#### How It Works
- ShadowBrowse uses dynamic DeclarativeNetRequest rule `9001` with action `modifyHeaders`.
- In `STRICT` mode, the `Referer` request header is removed (`header: "referer", operation: "remove"`).
- In `STANDARD` mode, the header is stripped or restricted on cross-origin subresources.
- States reported: `PROTECTED`, `PARTIAL`, `UNVERIFIED`, `EXPOSED`.

#### What It Does Not Protect
- `document.referrer` properties already read by synchronous inline scripts before extension rules apply.
- Referrer information passed explicitly via URL parameters (e.g. `?ref=google.com`).

---

### 3.5 Fingerprinting — Safe Mitigation Only

#### HARD POLICY: `FINGERPRINT = DETECTION ONLY`
ShadowBrowse strictly refrains from random fingerprint spoofing or noise injection.

#### Why Random Noise is Prohibited
1. **Uniqueness Inflation:** Adding pseudo-random mathematical noise to Canvas `getImageData` or WebGL rendering creates a completely unique, non-repeating noise signature that makes the browser *more* identifiable, not less.
2. **Cross-API Inconsistency:** Altering Canvas metrics while leaving WebGL, WebAudio, or CSS font metrics unchanged produces obvious architectural contradictions that anti-fraud systems flag as bot/evasion behavior.
3. **Breakage:** Randomly modifying audio buffers or canvas pixels breaks interactive applications, games, and CAPTCHA verifications.

#### What ShadowBrowse Does
- Uses main-world prototype hooks in `injectGuard.ts` to intercept and count probes to:
  - `HTMLCanvasElement.prototype.toDataURL`
  - `CanvasRenderingContext2D.prototype.getImageData`
  - `WebGLRenderingContext.prototype.getParameter` (`UNMASKED_VENDOR`, `UNMASKED_RENDERER`)
  - `AudioContext.prototype.createOscillator`
  - Font enumeration via `document.fonts.check`
- Reports probes honestly in Website Autopsy as `DETECTION ONLY (values not modified)`.

---

### 3.6 Storage Mitigation & Session Lifecycle

#### Terminology: `STORAGE_CLEANUP_VERIFIED`
ShadowBrowse avoids the false claim of "Complete Storage Isolation" during active browsing. In Chromium extensions, tabs share storage partitions within the browser profile.

#### How It Works
1. Session start: Records `sessionStartTime = Date.now()` and generates an ephemeral cryptographic session identifier (`crypto.randomUUID()`).
2. Active session: Identifies persistent storage identifiers (cookies, localStorage tokens, IndexedDB keys) in Autopsy.
3. Session end: Calls `chrome.browsingData.remove({ since: sessionStartTime }, { cookies: true, localStorage: true, indexedDB: true, cache: true, serviceWorkers: true })`.
4. Verification: Only when the asynchronous API callback resolves cleanly without errors is `STORAGE_CLEANUP_VERIFIED` recorded.

---

### 3.7 Cross-Session Correlation Defense & The Beauty-Cream Scenario

#### The Scenario
- **Session A:** User searches for `"best beauty cream for dry skin"` and visits pages embedding third-party analytics and tracking parameters (`utm_campaign=beauty_sale&gclid=xyz123`).
  - ShadowBrowse detects tracking parameters, classifies third-party trackers, records storage creation, and observes fingerprint probes.
  - User clicks **End Session**.
  - Verified storage cleanup removes session cookies, local storage items, and cache created since `sessionStartTime`.
- **Session B:** User navigates to unrelated sites in a new session.
  - Ephemeral Session ID B $\neq$ Session ID A.
  - Storage cleanup from Session A is verified.
  - Known tracking identifiers from Session A are confirmed not reused locally.
  - Tracker defense applies according to selected mode (`DETECT` or `BLOCK`).
  - System reports: `"Local session identity was isolated."`
  - System explicitly does **NOT** claim: `"You are impossible to track."` (Remote third-party networks might correlate through external IP/timing or server-side graph analysis).

---

## 4. Deterministic Privacy Risk Engine

ShadowBrowse assigns risk levels using deterministic rules rather than arbitrary scores:

| Risk Level | Trigger Conditions |
| :--- | :--- |
| **CRITICAL** | • Direct IP exposure detected during an active protected session.<br>• Verified network bypass (`direct_ip == proxied_ip`).<br>• Kill switch engagement failure. |
| **HIGH** | • High-confidence third-party trackers active in `OFF` mode.<br>• Persistent identifying tracking tokens or click IDs (`gclid`, `fbclid`) present in URL.<br>• Storage cleanup failure on session termination. |
| **MEDIUM** | • Multiple active fingerprinting probes (Canvas + WebGL + Audio).<br>• Multiple campaign tracking parameters (`utm_*`).<br>• Unrestricted cross-origin referrer exposure. |
| **LOW** | • Functional or content delivery third-party requests (CDNs, fonts).<br>• First-party cookies with proper expiration flags. |

---

## 5. Privacy-First Local Data Handling

ShadowBrowse strictly enforces zero-telemetry local operation:
- **No Remote Telemetry:** Visited URLs, query strings, and page autopsy findings are never transmitted to external servers.
- **Local-First Rules:** Tracker defense rules and category catalogs reside entirely within the local extension bundle.
- **Ephemeral State:** Autopsy reports and security event logs are held in extension memory and cleared on session reset.
- **Agent Isolation:** The Local Shadow Agent does not receive or log page contents or browsing history; it strictly handles network proxying, Tor daemon probing, and route verification.
