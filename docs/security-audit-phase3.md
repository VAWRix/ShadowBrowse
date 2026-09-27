# ShadowBrowse — Phase 3 Security & Network Audit

**Audit Date**: 2026-09-27  
**Scope**: Full End-to-End Tor Network Engine, Route Verification, Fail-Closed Kill Switch, and Technical Honesty Evaluation.

---

## 1. Executive Summary

ShadowBrowse Phase 3 upgraded the architecture from passive SOCKS5 port probing to an **authoritative, multi-layer route verification system**.

The central architectural question was:
> *Does ShadowBrowse actually route browser traffic through the Tor network, or does it only configure a SOCKS5 proxy and verify that a Tor endpoint exists?*

### The Definitive Answer:
1. **Agent Route Verification**: **REAL & VERIFIED**.  
   The Local Shadow Agent initiates an RFC 1928 SOCKS5 CONNECT tunnel with TLS wrapping to `https://check.torproject.org/api/ip`. It observes the direct IP and proxied IP, detects bypasses, and validates that the exit IP is recognized as a genuine Tor exit node by the Tor Project directory.
2. **Browser Route Verification**: **REAL & FIRST-PARTY VERIFIED** (within MV3 bounds).  
   The extension background service worker executes an outbound probe (`probeBrowserOutboundRoute`) through Chrome's active network stack, observing the external IP seen by Chromium. If the observed IP matches the agent's Tor exit IP, first-party proof of browser proxying is established.
3. **Fail-Closed Kill Switch**: **REAL & TESTED**.  
   If the Tor daemon disappears during a session or if a direct bypass is detected, Chromium is redirected to a SOCKS5 blackhole (`127.0.0.1:9`). Direct internet egress is strictly blocked without silent downgrade.
4. **Proxy State Restoration**: **REAL & TESTED**.  
   Pre-session proxy configurations and WebRTC policies are captured before modification and restored on session termination.

---

## 2. Layer-by-Layer Verification Matrix

| Layer | Component | Status | Evidence & Verification Mechanism |
|-------|-----------|--------|-----------------------------------|
| **1. Tor Provider Model** | `detector.py` | ✅ REAL | Classifies `SYSTEM_TOR`, `TOR_BROWSER`, `USER_MANAGED_TOR`, `CONFIGURED_SOCKS5`, or `UNAVAILABLE`. Scans process table (`psutil`). |
| **2. Tor Control Port** | `detector.py` | ✅ REAL | Probes port 9051/9151 via Tor Control Protocol (`AUTHENTICATE`, `GETINFO status/bootstrap-phase`). Parses 0-100% bootstrap and detects cookie auth enforcement. |
| **3. SOCKS5 Reachability** | `detector.py` | ✅ REAL | Performs RFC 1928 handshake (`0x05 0x01 0x00`). Validates server returns `0x05 0x00`. Does NOT falsely equate SOCKS5 open with Tor routing. |
| **4. Outbound SOCKS5 Tunnel** | `route_verifier.py` | ✅ REAL | Negotiates SOCKS5 CONNECT using domain ATYP (`0x03`). Ensures remote DNS resolution by the proxy. |
| **5. Exit Node Confirmation** | `route_verifier.py` | ✅ REAL | Establishes TLS over the SOCKS5 stream to `check.torproject.org/api/ip` and evaluates `IsTor` boolean. |
| **6. Direct Bypass Detection** | `route_verifier.py` | ✅ REAL | Compares machine direct public IP against proxied IP. Identical IPs immediately trigger `DIRECT_BYPASS_DETECTED`. |
| **7. Chrome Proxy Config** | `BrowserAdapter` | ✅ REAL | Applies `mode: fixed_servers` with `singleProxy: { scheme: 'socks5', host: '127.0.0.1', port }`. Reads back via `chrome.proxy.settings.get()`. |
| **8. Browser Outbound Probe** | `BrowserAdapter` | ✅ REAL | Extension service worker makes `fetch()` to `check.torproject.org/api/ip`. Verifies browser's own HTTP/HTTPS network stack routes via proxy. |
| **9. DNS Routing** | `networkController.ts` | ⚠️ PARTIAL | Chromium forwards hostnames via SOCKS5 remote resolution. Status is honestly held at `PARTIALLY_PROTECTED` because MV3 cannot inspect raw OS UDP packets. |
| **10. WebRTC Protection** | `BrowserAdapter` | 🔒 REAL | Sets `disable_non_proxied_udp`. Captures original policy and restores it on session exit. |
| **11. Fail-Closed Kill Switch** | `networkController.ts` | ✅ REAL | SOCKS5 blackhole to port 9 (`discard`). Blocks traffic on Tor drop or bypass detection. Tested in automated test suite. |
| **12. Session Isolation** | `sessionManager.ts` | ✅ REAL | Cryptographically random session IDs. Temporary storage cleanup with `chrome.browsingData.remove()`. Cross-session isolation verified. |
| **13. Fingerprint Handling** | `fingerprintController.ts` | 🔍 DETECTION ONLY | Passively monitors canvas, WebGL, audio, and font probing. No fake or random attribute spoofing. |
| **14. Agent Security** | `auth.py` | ✅ REAL | Bound strictly to `127.0.0.1`. Extension ID origin filtering. Constant-time token verification (`hmac.compare_digest`). Rate limited. |

---

## 3. What is Actually Verified vs What is Not

### What IS Actually Verified:
- Tor daemon presence via SOCKS5 handshake and Control Port protocol response.
- Real-time bootstrap progress (0-100%) from the Tor daemon.
- Agent-side outbound connectivity through the SOCKS5 tunnel.
- Differentiation between direct public IP and proxied exit IP.
- Exit node verification against Tor Project authority (`check.torproject.org`).
- Detection and blocking of direct internet bypasses.
- Browser proxy configuration in Chromium's settings.
- Browser-side outbound routing via first-party extension service worker fetch.
- WebRTC IP handling policy enforced at browser level.
- Clean proxy and WebRTC restoration on session end.

### What is PARTIALLY Verified:
- **DNS Protection (`PARTIALLY_PROTECTED`)**:
  Chromium's SOCKS5 client forwards unresolved domain names to the proxy (remote DNS). However, because MV3 JavaScript cannot capture raw kernel UDP sockets or inspect OS-level DNS queries, DNS is reported as `PARTIAL` / `PARTIALLY_PROTECTED`, never `PROTECTED`.

### What CANNOT Currently Be Verified From a Chrome Extension:
- **Raw Tab Sockets**: Chrome extensions cannot tap the underlying TCP/IP packets of user tabs to inspect packet headers or TLS frames.
- **Tor Circuit Topology**: Intermediate relay hops (guard, middle nodes) cannot be inspected without privileged Tor Control Port access with full cookie credentials.
- **System-Wide Applications**: Traffic originating from other applications outside Chrome does not pass through ShadowBrowse.

---

## 4. Technical Honesty Compliance

ShadowBrowse strictly adheres to the Technical Honesty Rule:
- ❌ No marketing terms like "100% anonymous", "completely untraceable", or "bulletproof Tor".
- ✅ Formal status taxonomy:
  - `TOR_ROUTE_VERIFIED`
  - `ROUTE_VERIFIED_TOR_UNVERIFIED`
  - `DIRECT_BYPASS_DETECTED`
  - `PARTIALLY_PROTECTED`
  - `DETECTION_ONLY`
  - `UNVERIFIED`
  - `DEGRADED`
  - `FAILED`
