# ShadowBrowse — Privacy Claims (Phase 2)

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

## NETWORK ANONYMITY

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

## FINGERPRINT PROTECTION

### What ShadowBrowse DOES:
- 🔍 **DETECTION ONLY** in Phase 2: Intercepts Canvas `toDataURL`, `getImageData`, WebGL `getParameter` (UNMASKED_VENDOR/RENDERER), and AudioContext `createOscillator` calls
- ✅ Reports detection events to the security event log
- ✅ Returns accurate signal counts and exposure level

### What ShadowBrowse Does NOT Claim:
- ❌ **Does NOT** modify return values — canvas, WebGL, and audio data are passed through unchanged
- ❌ **Does NOT** add noise — random noise would make the browser MORE unique, not less
- ❌ **Cannot prevent** fingerprinting through non-hooked APIs
- ❌ **Cannot prevent** fingerprinting via server-side timing or HTTP headers

### Why no noise injection?
> Adding random noise to canvas/WebGL values is counterproductive when done inconsistently.  
> A randomized noise pattern is itself a unique fingerprint.  
> True mitigation requires: consistent spoofed values (e.g., always "Intel GPU"), coordinated across all APIs, consistent across page reloads.  
> This is not implemented in Phase 2. The honest display is `DETECTION ONLY`.

### Honest Display: `Fingerprint: DETECTION ONLY (probes detected, values not modified)`

---

## STORAGE ISOLATION

### What ShadowBrowse DOES:
- ✅ Records session start time
- 🔒 Calls `chrome.browsingData.remove()` at session end to clear cookies, localStorage, IndexedDB, cache, service workers
- ✅ Verifies that `browsingData.remove()` returned success
- ✅ Emits CRITICAL event if cleanup fails

### What ShadowBrowse Does NOT Claim:
- ❌ **Does not** isolate storage DURING the session — data is written normally and removed at exit
- ❌ **Cannot prevent** a website from reading and exfiltrating its own cookies DURING the session
- ❌ **Cannot guarantee** `browsingData.remove()` clears everything — it depends on browser state

### Honest Display: `Storage: PARTIALLY PROTECTED (cleanup on exit)`

---

## SESSION IDENTITY

### What ShadowBrowse DOES:
- ✅ Generates session IDs using `crypto.randomUUID()` (cryptographically secure, 128-bit)
- ✅ Session IDs are ephemeral — destroyed on session end
- ✅ No persistent user profile is stored
- ✅ No session ID is derived from user identity, IP, or device fingerprint

### What ShadowBrowse Does NOT Claim:
- ❌ **Does not** provide a new IP address — that requires the Tor network
- ❌ **Cannot prevent** identity leak through voluntary sign-in (e.g., Google login while in Anonymous Mode)
- ❌ **Cannot prevent** identity correlation by the remote server via timing or behavior

---

## WHAT SHADOWBROWSE CANNOT DO (Browser Architecture Limits)

| Capability | Reason Not Possible |
|-----------|---------------------|
| Start/stop Tor daemon | OS-level process management; browser extensions cannot exec system processes |
| Verify actual Tor exit node | No TCP path tracing from extension context |
| Block all non-browser traffic | Extension scope is limited to the browser |
| Prevent OS-level DNS leaks | System resolver is outside browser control |
| Guarantee storage deletion | `chrome.browsingData` API has known edge cases |
| Modify encrypted TLS traffic | Certificate pinning and TLS are end-to-end |
| Block add-on/plugin data paths | Non-content-script plugins bypass extension APIs |
