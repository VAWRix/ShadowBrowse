# ShadowBrowse — Privacy Claims (Phase 4B)

This document defines **exactly what ShadowBrowse does and does not claim**.  
Every claim is classified. No claim is inflated.

---

## CLASSIFICATION LEGEND

| Symbol | Meaning |
|--------|---------|
| ✅ REAL | Implemented and provides the stated protection |
| ⚠️ PARTIAL | Implemented but with documented gaps |
| 🔍 DETECTION | Detects but does not prevent |
| ❌ NOT CLAIMED | Explicitly not provided |
| 🔒 BROWSER-ENFORCED | Provided by a real browser API (Chrome) |

---

## TRACKING MITIGATION & IDENTITY DEFENSE (PHASE 4B)

### Tracking Parameter Sanitization:
- ✅ **REAL**: Detects known tracking parameters (`utm_*`, `gclid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id`) and strips them via `window.history.replaceState` in `SANITIZE` mode.
- ✅ **REAL**: Preserves functional application query parameters (`id=123`, `page=2`).
- ❌ **Cannot prevent**: Server-side tracking via POST request bodies or path-encoded tracking tokens.

### Declarative Tracker Defense:
- ✅ **REAL**: Uses Chromium MV3 `declarativeNetRequest` dynamic rules to block high-confidence tracking resources (analytics, ad trackers, fingerprint scripts, tracking pixels, social trackers).
- ✅ **REAL**: Curated local ruleset operates completely offline without downloading remote lists.
- ✅ **REAL**: Safe non-blocking policy explicitly preserves CDNs, web fonts, payment gateways, and security/CAPTCHA services.
- ❌ **Cannot block**: First-party analytics hosted on the primary domain or CNAME-cloaked subdomains.

### Referrer Privacy:
- ⚠️ **PARTIAL**: Enforces origin-only or strips the HTTP `Referer` request header via `declarativeNetRequest` rule 9001 in `STANDARD` and `STRICT` modes.
- ❌ **Cannot prevent**: Scripts from reading `document.referrer` if evaluated synchronously before header modification.

### Fingerprint Protection:
- 🔍 **DETECTION ONLY**: Intercepts Canvas `toDataURL`, `getImageData`, WebGL `getParameter`, AudioContext `createOscillator`, and font probes.
- ❌ **Strictly NO random noise**: Random noise creates a unique fingerprint anomaly. Return values are intentionally NOT modified.

### Storage Isolation:
- ⚠️ **PARTIAL (`STORAGE_CLEANUP_VERIFIED`)**: Clears cookies, localStorage, IndexedDB, cache, and service workers created since `sessionStartTime` upon session termination.
- ❌ **Cannot isolate storage DURING active browsing**: Chromium extensions do not have per-tab storage container isolation.

### Cross-Session Correlation:
- ⚠️ **PARTIAL**: Ephemeral session IDs (`crypto.randomUUID()`) and post-session storage cleanup prevent local identifier persistence across sessions.
- ❌ **Does NOT claim**: Third-party networks with external graph correlation cannot link sessions via server-side timing or browser characteristics.

---

## NETWORK ANONYMITY (PHASE 3 BASELINE)

### What ShadowBrowse DOES:
- ✅ Detects Tor providers via structured model (`SYSTEM_TOR`, `TOR_BROWSER`, `USER_MANAGED_TOR`, `CONFIGURED_SOCKS5`, `UNAVAILABLE`)
- ✅ Verifies Tor daemon identity via Tor Control Port probing (`AUTHENTICATE`, `GETINFO status/bootstrap-phase`)
- ✅ Configures Chrome's proxy settings to route traffic through the SOCKS5 proxy with remote DNS resolution
- ✅ Captures the user's original proxy state before modifying it and restores it on session end
- ✅ Detects proxy conflicts before taking control
- ✅ Implements a fail-closed kill switch: routes traffic to a SOCKS5 blackhole (`127.0.0.1:9`) on Tor drop or bypass detection
- ✅ Performs multi-layer Agent route verification via SOCKS5 CONNECT tunnel to `https://check.torproject.org/api/ip`
- ✅ Performs first-party Browser route verification via extension background service worker outbound probe
- ✅ Detects and prevents direct Internet bypass (`direct_ip == proxied_ip`)
- ✅ Strictly separates `TOR_ROUTE_VERIFIED` from `ROUTE_VERIFIED_TOR_UNVERIFIED`

### What ShadowBrowse Does NOT Claim:
- ❌ **Cannot guarantee 100% anonymity**: No system on standard Chromium can prevent all advanced browser fingerprinting or timing correlation attacks
- ❌ **Does not start or stop OS Tor processes**: Requires Tor Browser or system Tor to be running
- ❌ **Cannot inspect low-level kernel TLS sockets** of arbitrary user tabs from MV3 extensions
- ❌ **Does not protect traffic from non-browser applications** on the host machine

### What "TOR_ROUTE_VERIFIED" means in ShadowBrowse:
> The Local Shadow Agent established a SOCKS5 CONNECT tunnel, initiated TLS to `https://check.torproject.org/api/ip`, discovered that the exit IP differs from the machine's direct IP, AND the Tor Project official directory confirmed the exit IP belongs to a registered Tor exit node. In addition, the browser's own network stack was verified to be configured for proxy routing without direct bypass.

---

## DNS

### What ShadowBrowse Claims:
- ⚠️ PARTIALLY PROTECTED when Tor SOCKS5 is active: Chrome's SOCKS5 implementation forwards hostnames to the proxy (rather than resolving locally), which means DNS resolution should happen at the Tor exit node
- 🔍 This behavior is derived from Chromium's SOCKS5 handling specification, not independently tested per-session

### What ShadowBrowse Does NOT Claim:
- ❌ **Cannot verify** DNS is not leaking — no DNS resolution test is performed
- ❌ **Cannot prevent** applications outside Chrome from leaking DNS
- ❌ **Cannot detect** DNS leaks via non-SOCKS5 paths

### Honest Display: `DNS: PARTIALLY PROTECTED (unverified)`

---

## WEBRTC LEAK PROTECTION

### What ShadowBrowse DOES:
- 🔒 Sets `chrome.privacy.network.webRTCIPHandlingPolicy = 'disable_non_proxied_udp'` (real Chrome privacy API)
- ✅ Captures the prior WebRTC policy and restores it when the session ends

### What ShadowBrowse Does NOT Claim:
- ❌ **Cannot** prevent ALL WebRTC behavior — the policy restricts direct UDP, not all WebRTC
- ❌ **Cannot prevent** WebRTC leaks inside local applications or non-Chrome processes
- ❌ **Cannot verify** the policy was actually applied (we read it back, but cannot prove effectiveness)

### Honest Display: `WebRTC: PARTIALLY PROTECTED (browser API enforced, unverifiable from extension)`

---

## WHAT SHADOWBROWSE CANNOT DO (Browser Architecture Limits)

| Capability | Reason Not Possible |
|-----------|---------------------|
| Start/stop Tor daemon | OS-level process management; browser extensions cannot exec system processes |
| Real-time per-tab storage container sandboxing | Chrome extensions share storage partitions within the browser profile |
| Verify actual Tor exit node | No TCP path tracing from extension context |
| Block all non-browser traffic | Extension scope is limited to the browser |
| Prevent OS-level DNS leaks | System resolver is outside browser control |
| Modify encrypted TLS traffic | Certificate pinning and TLS are end-to-end |
| Block add-on/plugin data paths | Non-content-script plugins bypass extension APIs |

