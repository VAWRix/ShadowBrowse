# Phase 4 — Browser Identity Threat Model & Tracking Taxonomy

**Document Status:** Complete & Audited  
**Baseline:** Phase 3 Frozen (`06ab868`)  
**Scope:** Browser Identity Threat Vectors, Cross-Site Tracking Mechanisms, and Privacy Risk Scoring

---

## 1. Threat Model Overview

When web browsing is routed through Tor, passive eavesdroppers on the local network, ISP surveillance, and destination web servers cannot observe the user's real public IP address. However, modern commercial web tracking operates predominantly at the **application and browser layer**.

This threat model outlines the attack surfaces used by web entities to recognize, profile, and correlate individual browser instances across independent visits and multiple web origins.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   BROWSER IDENTITY ATTACK VECTORS                      │
├───────────────────┬───────────────────┬────────────────────────────────┤
│ 1. Network        │ 2. Storage        │ 3. Fingerprinting              │
│    Identity       │    Identity       │    Identity                    │
│ • Exit IP / ASN   │ • HTTP Cookies    │ • Canvas 2D Readout            │
│ • Proxy State     │ • LocalStorage    │ • WebGL Vendor / Renderer      │
│ • DNS Resolution  │ • IndexedDB       │ • WebAudio Synthesis           │
│ • WebRTC Leak     │ • Cache Storage   │ • Font Catalog                 │
│                   │ • Service Workers │ • Screen / Viewport Geometry   │
├───────────────────┼───────────────────┼────────────────────────────────┤
│ 4. Tracking Identifiers               │ 5. Network / Request Identity  │
│ • URL Query Parameters (gclid/utm)    │ • Third-Party Request Graph    │
│ • Referrer Header Leakage             │ • Cross-Site Resource Sharing  │
│ • First-Party Click Identifiers       │ • Redirect Chains              │
└───────────────────────────────────────┴────────────────────────────────┘
```

---

## 2. Five Categories of Browser Identity

### Category A: Network Identity
*Status in ShadowBrowse: PROTECTED (Phase 3 Baseline)*
- **Public IP & Tor Exit:** Browser traffic is routed strictly through the local SOCKS5 endpoint to the Tor network. Exit node IPs rotate dynamically and differ from the user's ISP connection.
- **Fail-Closed Kill Switch:** In the event of Tor daemon failure, traffic is redirected to discard proxy `127.0.0.1:9`, preventing direct bypass.
- **WebRTC IP Leakage:** Browser policy is enforced via `chrome.privacy.network.webRTCIPHandlingPolicy` (`disable_non_proxied_udp`).
- **DNS Leakage:** Chromium forwards hostnames over SOCKS5; low-level OS UDP port 53 is documented as `PARTIALLY_PROTECTED`.

### Category B: Storage Identity
*Status in ShadowBrowse: PARTIALLY_PROTECTED (Cleaned on Exit)*
- **Cookies (`document.cookie`, `chrome.cookies`):** Traditional tracking cookies with long expiration dates (e.g. 1-2 years). HttpOnly cookies are invisible to scripts but transmitted on every HTTP request.
- **LocalStorage (`window.localStorage`):** Origin-bound synchronous key-value store. Retains persistent tracking UUIDs without expiration.
- **SessionStorage (`window.sessionStorage`):** Tab-scoped storage. Automatically cleared when the browser tab is closed.
- **IndexedDB:** Structured asynchronous transactional database capable of holding large serialized profile objects.
- **Cache Storage (`caches` API):** Caches network responses; persistent identifiers stored in cached JSON or script files can be read back across visits.
- **Service Workers:** Background scripts registered per-origin that can persist across browser restarts and synchronize state.

### Category C: Fingerprint Identity
*Status in ShadowBrowse: DETECTION ONLY (Mitigation Not Active)*
- **Canvas 2D Rendering:** Small differences in GPU rasterization, antialiasing engines, operating system font rendering libraries, and driver versions produce unique pixel data from `toDataURL()` or `getImageData()`.
- **WebGL Hardware Signature:** Exposes GPU vendor (`UNMASKED_VENDOR_WEBGL`) and GPU renderer model (`UNMASKED_RENDERER_WEBGL`), supported extension counts, and floating-point precision.
- **WebAudio Processing:** Audio processing graphs (oscillators + compressors) processed by hardware digital-to-analog converters yield microscopic floating-point sample differences.
- **Font Enumeration:** Measuring text element bounding box widths with various CSS `font-family` fallbacks identifies which system fonts are installed on the OS.
- **Screen Geometry:** `screen.width`, `screen.height`, `screen.availWidth`, `screen.availHeight`, and `window.devicePixelRatio`.
- **Locale & Cultural Context:** `navigator.language`, `navigator.languages`, `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- **Hardware Profile:** `navigator.hardwareConcurrency` (logical cores), `navigator.deviceMemory` (RAM tier), `navigator.maxTouchPoints`.

### Category D: Tracking Identifiers
*Status in ShadowBrowse: DETECTION ONLY (Phase 4A)*
- **Advertising Click IDs:** Appended to query parameters upon ad click (e.g., `gclid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id`). These contain encoded click timestamps, ad group IDs, and user account references.
- **Campaign Identifiers:** Standard marketing parameters (`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`).
- **Affiliate & Partner IDs:** Tracking query strings (`mc_eid`, `_hsenc`, `zanpid`).
- **Referrer Header:** Discloses the preceding web page URL to the destination server. Can leak sensitive search terms, search query URLs, and user IDs.

### Category E: Network / Request Identity
*Status in ShadowBrowse: DETECTION & GRAPHING*
- **Third-Party Script Injection:** External scripts executing in the first-party DOM have full access to cookies, storage, and DOM tree.
- **Cross-Site Tracking Pixels / Iframes:** Embedded images or hidden iframes that trigger requests with third-party cookie headers.
- **Redirect Tracking:** Bouncing users through intermediate tracking domains (e.g. `tracking.example/redirect?to=destination.com`) before arriving at target destinations.

---

## 3. Non-Alarmist Resource Classification Taxonomy

To prevent misleading privacy alarms, ShadowBrowse classifies network and DOM resources according to technical function:

| Classification | Definition | Example Domains / Patterns | Risk Weight |
| :--- | :--- | :--- | :--- |
| **FIRST_PARTY** | Origin matches or is a subdomain of the top-level site | `app.example.com`, `example.com` | Minimal |
| **CONTENT_DELIVERY** | Public CDN providing static libraries, stylesheets, or web fonts | `cdnjs.cloudflare.com`, `cdn.jsdelivr.net`, `fonts.googleapis.com` | Low |
| **FUNCTIONAL** | Third-party APIs required for core page functionality (payments, maps) | `api.stripe.com`, `maps.googleapis.com` | Low-Medium |
| **SECURITY** | Anti-bot, fraud prevention, and challenge verification services | `recaptcha.net`, `hcaptcha.com`, `challenges.cloudflare.com` | Medium |
| **ANALYTICS** | Traffic measurement, performance telemetry, and event tracking | `google-analytics.com`, `segment.io`, `mixpanel.com` | Medium |
| **SOCIAL** | Social media sharing widgets, embedded feeds, and cross-site identity SDKs | `connect.facebook.net`, `platform.twitter.com` | High |
| **ADVERTISING** | Ad display networks, programmatic bidding, retargeting pixels | `doubleclick.net`, `criteo.com`, `adnxs.com`, `taboola.com` | High |
| **FINGERPRINTING** | Dedicated device fingerprinting and behavioral profiling libraries | `fpjs.io`, `fingerprintjs.com`, `threatmetrix.com` | Critical |
| **SESSION** | Authentication and single-sign-on endpoints | `accounts.google.com`, `login.live.com` | Contextual |
| **UNKNOWN** | Unclassified third-party domains without known categorization | Custom external hosts | Variable |

---

## 4. Cross-Session Correlation Model

A central vulnerability in private web browsing is cross-session identity leakage. When a user ends Session A and subsequently starts Session B, trackers may attempt to link the two sessions.

ShadowBrowse evaluates correlation risk into three distinct categories:

### 1. `LOCAL_IDENTITY_REUSE`
- **Definition:** An explicit tracking token, cookie, localStorage key, or cached identifier created in Session A is observed directly in Session B.
- **Evidence:** Concrete cryptographic or key-value match.
- **Severity:** **CRITICAL**.
- **Cause:** Failure of browsing data purge, browser restart omission, or service worker persistence.

### 2. `POTENTIAL_CORRELATION`
- **Definition:** Local storage was successfully purged, but invariant hardware fingerprint characteristics remain identical.
- **Evidence:** Canvas hash, WebGL unmasked renderer, screen dimensions, audio context characteristics, and platform match across sessions.
- **Severity:** **MEDIUM**.
- **Honesty Note:** While the hardware signature is identical, client software cannot determine whether the external tracking server actually performed correlation without access to the server's database.

### 3. `UNVERIFIED_EXTERNAL_CORRELATION`
- **Definition:** Storage was purged, network exit node changed, and no client-side tokens remain, but correlation could theoretically occur via external behavioral signals (e.g. browsing time overlap, mouse movement dynamics, server-side probabilistic graphs).
- **Severity:** **INFORMATIONAL / LOW**.
- **Honesty Note:** ShadowBrowse explicitly refrains from claiming it can verify or disprove backend server-side machine learning correlation.

---

## 5. The "Beauty Cream" Acceptance Scenario

The "Beauty Cream" scenario provides an empirical acceptance test for cross-session tracking isolation:

```
[SESSION A: Research Phase]
User navigates to Search Engine over Tor
  ↓ Searches: "best beauty cream for dry skin"
Visits Retailer / Health Review Sites
  ↓ Trackers inject:
    • Cookie: 'ad_interest_segment=beauty_cream_dry_skin'
    • LocalStorage: 'ad_uuid=user_xyz_8921'
    • Canvas / WebGL fingerprint logged
User terminates Session A
  ↓
[SESSION CLEANUP PHASE]
ShadowBrowse triggers:
  • chrome.browsingData.remove({ since: sessionStartTime })
  • Tor circuit rotation / new identity
  • Verification of zero remaining session cookies
  ↓
[SESSION B: Unrelated Activity]
User starts Session B and visits News / Generic Site
  ↓
[CORRELATION AUDIT EVALUATION]
Question 1: Was the Session A local storage identity reused?
  → Expected: NO (LocalStorage clean)
Question 2: Were Session A cookies retained?
  → Expected: NO (Cookies purged)
Question 3: Was the session identifier reused?
  → Expected: NO (New ephemeral sessionId generated)
Question 4: Are fingerprint characteristics still similar?
  → Expected: YES (Hardware/OS characteristics remain unaltered in Detection-Only mode)
Question 5: Are there tracking URL / referrer identifiers?
  → Expected: NO (Clean direct navigation)
Question 6: Can third parties display beauty cream ads in Session B?
  → Honest Verdict: External ad networks CANNOT correlate via local cookies or storage.
    However, if the news site uses an aggressive fingerprinting script matching the user's
    exact WebGL/Canvas signature, probabilistic correlation remains possible.
```

---

## 6. Deterministic Privacy Risk Scoring Model

To avoid arbitrary or misleading "security scores", ShadowBrowse calculates privacy findings using transparent, deterministic rules:

| Severity Level | Deterministic Condition Trigger | Technical Evidence Required | Recommended Mitigation |
| :--- | :--- | :--- | :--- |
| **CRITICAL** | Direct IP bypass during anonymous session | Browser observed IP == Workstation direct ISP IP | Immediate kill switch engagement |
| **CRITICAL** | Cross-session identifier reuse | Stored UUID or auth token from Session A present in Session B | Full storage purge and browser cache wipe |
| **HIGH** | Explicit click tracking parameters present in URL | URL query string contains `gclid`, `fbclid`, or `msclkid` | Strip query parameters prior to navigation |
| **HIGH** | Connection to known cross-site tracking network | Script/iframe URL matches `KNOWN_TRACKER_DOMAINS` | Network request blocking (Phase 4B) |
| **HIGH** | Full path referrer header exposure | `document.referrer` contains path or query strings to 3rd party | Enforce `strict-origin-when-cross-origin` |
| **MEDIUM** | In-page Canvas and WebGL probing detected | `toDataURL()` and `getParameter(0x9246)` called on page | Log signal; monitor frequency |
| **MEDIUM** | Identity inconsistency detected | `navigator.platform` mismatches `userAgent` | Warn user of artificial profile anomaly |
| **LOW** | Static third-party library loaded from public CDN | Hostname in `CONTENT_DELIVERY` list over HTTPS | No action needed; standard web delivery |
| **LOW** | Unencrypted HTTP connection on private test site | Protocol is `http:` on non-loopback address | Upgrade to HTTPS where supported |

---

## 7. Security and Privacy Boundaries of the Analysis Engine

The analysis engine itself must not become a privacy vulnerability:
1. **Local-First Execution:** All parsing, classification, regex matching, and autopsy reports execute strictly on `localhost` inside the browser process.
2. **Zero Remote Telemetry:** No visited URLs, query parameters, cookie values, or autopsy findings are ever uploaded to remote servers.
3. **Ephemeral Memory Storage:** Tab autopsy reports and security events are retained only in temporary background memory or tab-scoped states, cleared on session termination.
4. **Explicit User Control:** Deep inspection runs only when requested by the user or upon opening the Website Autopsy side panel.
