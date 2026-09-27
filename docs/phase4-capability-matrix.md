# Phase 4 — Browser Capability & Privacy Control Matrix

**Document Status:** Complete & Audited  
**Baseline:** Phase 3 Frozen (`06ab868`)  
**Scope:** Definitive Technical Capability Matrix for Storage, Fingerprinting, Network, and Identifiers in Chromium Manifest V3

---

## 1. Storage Surface Capability Matrix

This matrix documents what ShadowBrowse can inspect, clear, isolate, and verify using supported Chromium extension APIs.

| Storage Mechanism | Detect | Clear | Isolate | Verify | Technical Mechanism & Notes |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **HTTP Cookies** | **REAL** | **REAL** | **PARTIAL** | **REAL** | Detected via `chrome.cookies.getAll` (including HttpOnly). Cleared by URL/store. Isolation is **PARTIAL** (cleared on session exit, not partitioned in real time). Verified via post-clear query. |
| **LocalStorage** | **REAL** | **REAL** | **PARTIAL** | **REAL** | Detected via content script `window.localStorage` on active tab. Cleared via `chrome.browsingData.remove({ since })`. Isolation is **PARTIAL** (shared origin store during active session). Verified via post-cleanup checks. |
| **SessionStorage** | **REAL** | **REAL** | **REAL** | **REAL** | Detected via content script. Naturally isolated to the single browser tab. Destroyed when the tab is closed. |
| **IndexedDB** | **PARTIAL** | **REAL** | **PARTIAL** | **REAL** | Content script can detect database names on current origin. Cannot enumerate other origins without active scripts. Cleared globally/by-timestamp via `browsingData.remove`. Verified upon completion callback. |
| **Cache Storage** | **PARTIAL** | **REAL** | **PARTIAL** | **REAL** | Detected via `caches.keys()` on current origin. Cleared via `browsingData.remove({ cache: true })`. Verified via browsingData completion. |
| **Service Workers** | **REAL** | **REAL** | **PARTIAL** | **REAL** | Detected via `navigator.serviceWorker.getRegistrations()`. Unregistered and purged via `browsingData.remove({ serviceWorkers: true })`. |

*Status Key:*
- **REAL:** Supported natively by Chrome Extension APIs with technical verification.
- **PARTIAL:** Supported via lifecycle boundaries (e.g. purge on exit) but lacks per-tab containerization.
- **UNAVAILABLE:** Not exposed or prohibited by browser security architecture.
- **UNVERIFIED:** API returns success without verifiable proof of underlying state change.

---

## 2. Fingerprint Surface Analysis Matrix

This matrix evaluates each client-side hardware and API fingerprinting surface. In accordance with Phase 4A requirements, all mitigation is **DETECTION ONLY** to prevent introducing synthetic fingerprint anomalies.

| Surface | Detection Method | Typical Probed Value | Entropy Relevance | Mitigation Status | Mitigation Safe? | Browser API Limitations |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **Canvas 2D** | Monkeypatch `toDataURL`, `getImageData` in MAIN world | Pixel byte stream, PNG CRC32 hash | **VERY HIGH** | **DETECTION ONLY** | **NO** (Random noise creates distinct artifacts and breaks legitimate sites) | Extension content scripts run in isolated world; requires script tag injection into MAIN world. |
| **WebGL Hardware** | Monkeypatch `getParameter(0x9245/0x9246)` | Unmasked GPU Vendor & Renderer strings | **VERY HIGH** | **DETECTION ONLY** | **NO** (Faking vendor breaks shader compilation and causes WebGL crashes) | Browser extensions cannot replace underlying GPU drivers or DirectX/Vulkan pipelines. |
| **WebAudio** | Monkeypatch `AudioContext.createOscillator` | Float32 sample dynamics, DAC frequency response | **HIGH** | **DETECTION ONLY** | **NO** (Altering audio buffer can cause audible clicks or corrupt audio playback) | Audio processing graphs execute at high speed in native browser audio threads. |
| **Font Metrics** | Query hook on `document.fonts.check` | List of installed system font names | **HIGH** | **DETECTION ONLY** | **PARTIAL** (Font blocking breaks typography layout) | CSS `@font-face` and Canvas text metrics can measure font dimensions without calling `check()`. |
| **Screen Dimensions** | Content script BOM inspection | Screen width, height, availWidth, availHeight | **HIGH** | **DETECTION ONLY** | **NO** (Spoofing screen size breaks CSS media queries, responsive UI, and window popups) | `window.screen` is read-only in many modern browser contexts; tampering easily detected via prototype comparison. |
| **Device Pixel Ratio** | Content script BOM inspection | `window.devicePixelRatio` (1.0, 1.25, 2.0) | **MEDIUM** | **DETECTION ONLY** | **NO** (Faking DPR causes blurred text and misaligned image rendering) | Closely tied to OS display scaling. |
| **Timezone & Offset** | Content script `Intl.DateTimeFormat` | IANA Timezone string (e.g. `America/New_York`) | **HIGH** | **DETECTION ONLY** | **PARTIAL** (Spoofing timezone breaks calendar apps and timestamp ordering) | Tor Browser handles this natively in C++; extension-level spoofing often conflicts with OS clock. |
| **Navigator Languages** | Content script BOM inspection | `navigator.language`, `navigator.languages` | **MEDIUM** | **DETECTION ONLY** | **SAFE** (Can be set via browser settings or launch flags) | Must remain consistent with Accept-Language HTTP headers. |
| **Hardware Concurrency** | Content script BOM inspection | CPU logical core count (4, 8, 16) | **MEDIUM** | **DETECTION ONLY** | **NO** (Clamping to 4 or 8 can slightly reduce entropy but breaks heavy WebWorker task distribution) | Exposed across multiple WebWorker contexts. |
| **Device Memory** | Content script BOM inspection | RAM bucket in GiB (2, 4, 8) | **LOW** | **DETECTION ONLY** | **SAFE** (Coarse buckets already applied by Chromium) | Only exposed on secure contexts (HTTPS). |

---

## 3. Tracking Parameter Capability Matrix

URL tracking parameters append advertising and campaign telemetry to inbound navigations.

| Parameter | Category | Risk Level | Detection Status | Safe to Strip? | Stripping Recommendation |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `utm_source` | CAMPAIGN_TRACKING | **MEDIUM** | **REAL** | **YES** | Strip safely before navigation or display. |
| `utm_medium` | CAMPAIGN_TRACKING | **LOW** | **REAL** | **YES** | Strip safely. |
| `utm_campaign` | CAMPAIGN_TRACKING | **MEDIUM** | **REAL** | **YES** | Strip safely. |
| `utm_term` | CAMPAIGN_TRACKING | **MEDIUM** | **REAL** | **YES** | Strip safely. |
| `utm_content` | CAMPAIGN_TRACKING | **LOW** | **REAL** | **YES** | Strip safely. |
| `gclid` | CLICK_IDENTIFIER | **HIGH** | **REAL** | **YES** | Strip safely (Google Ads click tracking ID). |
| `fbclid` | CLICK_IDENTIFIER | **HIGH** | **REAL** | **YES** | Strip safely (Facebook Ads click tracking ID). |
| `msclkid` | CLICK_IDENTIFIER | **HIGH** | **REAL** | **YES** | Strip safely (Microsoft Bing Ads click tracking ID). |
| `ttclid` | CLICK_IDENTIFIER | **HIGH** | **REAL** | **YES** | Strip safely (TikTok Ads click tracking ID). |
| `li_fat_id` | CLICK_IDENTIFIER | **HIGH** | **REAL** | **YES** | Strip safely (LinkedIn Ads click tracking ID). |
| `user_id` / `uid` | USER_ID | **CRITICAL** | **REAL** | **NO** | Flag to user; stripping may break account navigation or login redirects. |
| `session_id` | SESSION | **HIGH** | **REAL** | **NO** | Flag to user; stripping may terminate legitimate authenticated state. |

---

## 4. Referrer Header Capability Matrix

| Referrer Scenario | Exposure Status | What Destination Site Receives | ShadowBrowse Capability |
| :--- | :---: | :--- | :--- |
| **No Referrer Header** | **PROTECTED** | No preceding URL disclosed | Observed truthfully. |
| **Origin Only (`https://source.com/`)** | **PARTIAL** | Source domain disclosed, but specific page path and search queries hidden | Observed truthfully via `document.referrer`. |
| **Full URL (`https://source.com/search?q=secret`)** | **EXPOSED** | Exact path, search query, and parameters leaked to destination origin | Detected and flagged as **HIGH RISK** in Website Autopsy. |
| **Cross-Origin Downgrade (HTTPS → HTTP)** | **PROTECTED** | Dropped by Chromium security policy | Validated by browser default behavior. |

---

## 5. Architectural Findings & Answers to Core Evaluation Questions

### 1. What ShadowBrowse CAN Currently Detect
- **Network Layer:** Outbound public IP, Tor exit verification via `check.torproject.org`, proxy connectivity, fail-closed kill switch state.
- **In-Page Probes:** Canvas `toDataURL` and `getImageData`, WebGL hardware parameters (`UNMASKED_VENDOR` and `UNMASKED_RENDERER`), WebAudio oscillator creations.
- **Storage Traces:** Active cookies, localStorage count, session storage, and IndexedDB presence.
- **URL Identifiers:** Inbound advertising click IDs (`gclid`, `fbclid`, `msclkid`) and campaign parameters (`utm_*`).
- **Referrer Exposure:** Distinguishes origin-only disclosure from full URL path leaks.
- **DOM Dependencies:** Enumerates third-party scripts, iframes, and cross-site tracker domains.

### 2. What ShadowBrowse CAN Currently Mitigate
- **Network Anonymity:** 100% of browser TCP web traffic routed through Tor via SOCKS5.
- **Direct Bypass:** Blocked by fail-closed discard routing (`127.0.0.1:9`).
- **WebRTC Local IP Leaks:** Blocked via browser privacy policy (`disable_non_proxied_udp`).
- **Cross-Session Storage:** Purged on session termination via `chrome.browsingData.remove`.
- **Pre-Session Proxy Restoration:** Restores user's original proxy configuration upon session shutdown.

### 3. What Requires Phase 4B (Planned Future Capabilities)
- **Active URL Parameter Stripping:** Rewriting inbound links and stripping `utm_*`, `gclid`, `fbclid` prior to tab loading.
- **Declarative Net Request Blocking:** Blocking known tracking networks (`doubleclick.net`, `criteo.com`) from loading external scripts.
- **Referrer Policy Enforcement:** Forcing `strict-origin-when-cross-origin` on all navigation requests.
- **Third-Party Request Graph:** Full live graph capturing dynamic `fetch()`, `XHR`, and beacon telemetry.

### 4. What CANNOT Be Controlled from a Chromium MV3 Extension
- **Real-Time Storage Partitioning:** Manifest V3 extensions cannot create tab-isolated storage containers without launching separate Chrome OS user profiles or incognito sessions.
- **Low-Level UDP DNS (Port 53):** MV3 extensions have no raw socket access; low-level OS packet inspection is impossible from an extension.
- **Native C++ Fingerprint Masking:** Unlike Tor Browser (which patches Firefox C++ source code to normalize canvas, font, and audio rendering), an extension cannot alter internal Skia or Blink rasterizer code without causing detectable prototype discrepancies.
- **Server-Side Probabilistic Correlation:** External machine learning correlation based on exit node timing and behavioral navigation cannot be intercepted or verified from client-side scripts.

### 5. Architectural Limitations Discovered
- **Naive Spoofing is Dangerous:** Attempting to inject noise into Canvas or spoofing WebGL parameters creates an **inconsistent browser identity profile** that is easier for anti-fraud systems to track than an authentic, standard Chrome profile.
- **Detection and Transparency Must Precede Mitigation:** Providing deterministic, transparent risk scoring and empirical cross-session measurement gives the user genuine visibility rather than false promises of 100% untrackability.
