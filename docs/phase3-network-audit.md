# ShadowBrowse — Phase 3 Network Audit

**Audit Date**: 2026-09-27  
**Purpose**: Answer definitively which layers of the Tor routing chain exist, which are verified, and which are missing.

---

## THE CORE QUESTION

> Does ShadowBrowse currently route browser traffic through the Tor network,  
> or does it only configure a SOCKS5 proxy and verify that a Tor endpoint exists?

**Honest Answer**: It does **both partially** and **neither completely**.

Here is the exact layered truth:

---

## LAYER-BY-LAYER AUDIT

### Layer 1: Tor SOCKS5 Detection
**File**: `agent/src/tor/detector.py`  
**Classification**: ✅ REAL (but limited scope)

```python
s.sendall(b"\x05\x01\x00")   # SOCKS5 greeting
response = s.recv(2)
if response == b"\x05\x00":  # Valid SOCKS5 No-Auth response
    return True
```

**What this proves**: A SOCKS5 daemon responded on port 9050 or 9150.  
**What this does NOT prove**:
- The daemon is Tor (any SOCKS5 proxy passes this test)
- The Tor circuit is built and functional
- Traffic can actually reach exit nodes
- The circuit has not been hijacked

**Tor lifecycle management**: None. The agent does not start, stop, monitor, or manage the Tor process. It only probes a port.

---

### Layer 2: Chrome Proxy Configuration  
**File**: `extension/src/background/networkController.ts` → `BrowserAdapter.setProxy()`  
**Classification**: ✅ REAL

```typescript
const proxyConfig: chrome.proxy.ProxyConfig = {
  mode: 'fixed_servers',
  rules: {
    singleProxy: { scheme: 'socks5', host: '127.0.0.1', port: 9050 },
    bypassList: ['<-loopback>', '127.0.0.1', 'localhost'],
  },
};
chrome.proxy.settings.set({ value: config, scope: 'regular' }, callback);
```

**What this does**: Chrome's proxy API is called and Chrome acknowledges the setting.  
**What this does NOT prove**: Traffic is actually flowing through the proxy. Chrome could silently bypass a failing SOCKS5 proxy in certain network conditions.

---

### Layer 3: Pre-Session State Capture
**File**: `extension/src/background/networkController.ts` → `capturePreSessionState()`  
**Classification**: ✅ REAL

Captures: `chrome.proxy.settings.get()` result + `chrome.privacy.network.webRTCIPHandlingPolicy.get()`.  
Restores from captured snapshot on session end. Verified in Phase 2 tests.

---

### Layer 4: Route Verification  
**File**: `extension/src/background/browserAdapter.ts` → `runRouteVerification()`  
**Classification**: ⚠️ PARTIAL

Steps performed:
1. Reads Chrome proxy config back via `chrome.proxy.settings.get()` → confirms Chrome has the setting
2. Probes SOCKS5 port via `fetch()` to local agent → confirms port is up
3. Reads back WebRTC policy → confirms policy is applied

**What this does NOT do**:
- Does not send traffic through the proxy to an external host to verify routing
- Does not compare the browser's apparent IP with/without the proxy
- Does not verify the SOCKS5 server is Tor (vs. another proxy)
- Does not check Tor bootstrap status

**Confidence returned**: MEDIUM — which is honest. Not HIGH.

---

### Layer 5: Tor Process Management  
**Classification**: ❌ MISSING

There is no code anywhere in ShadowBrowse that:
- Discovers the Tor binary on disk
- Starts a Tor process
- Monitors Tor's bootstrap progress
- Reads the Tor Control Port
- Gracefully shuts down a managed Tor process

**The system depends entirely on the user having Tor already running.**

---

### Layer 6: Tor Bootstrap Verification  
**Classification**: ✅ REAL (Phase 3 Implemented)
**File**: `agent/src/tor/detector.py` → `tor_control_probe()`

The agent queries the Tor Control Port (`127.0.0.1:9051` or `9151`) using standard Tor Control Protocol:
```
AUTHENTICATE ""
GETINFO status/bootstrap-phase
```
Returns:
- `bootstrap_percent`: 0–100%
- `bootstrap_summary`: real-time tag and progress summary (e.g. "Done", "Handshake")
- `control_port_verified`: boolean confirming Tor daemon identity
- Cookie auth detection: if code `515 Authentication required` is returned, confirms the daemon is Tor even if cookie auth is required.

---

### Layer 7: External IP / Route Verification  
**Classification**: ✅ REAL (Phase 3 Implemented)
**File**: `agent/src/tor/route_verifier.py` → `verify_route()`  
**Extension**: `extension/src/background/browserAdapter.ts` → `runRouteVerification()`, `probeBrowserOutboundRoute()`

Multi-layer route verification is now active:
1. **Direct IP check**: Agent retrieves local public IP without proxy.
2. **SOCKS5 Connect Tunnel**: RFC 1928 handshake with remote domain resolution (ATYP 0x03) ensuring DNS is forwarded remotely.
3. **Proxied IP check**: Agent opens TLS connection over SOCKS5 tunnel to `https://check.torproject.org/api/ip`.
4. **Tor Exit Node Confirmation**: Parses `{"IP": "...", "IsTor": true/false}`.
5. **Browser Outbound Probe**: Extension service worker issues first-party probe through Chrome's proxy stack.
6. **Bypass Detection**: Flags `DIRECT_BYPASS_DETECTED` if direct IP equals proxied IP.
7. **Strict Classification**:
   - `TOR_ROUTE_VERIFIED`: Exit node confirmed as Tor by Tor Project directory.
   - `ROUTE_VERIFIED_TOR_UNVERIFIED`: Route is proxied but not confirmed Tor.
   - `DIRECT_BYPASS_DETECTED`: Direct traffic detected; fail-closed kill switch triggered.

---

### Layer 8: DNS Verification  
**Classification**: ⚠️ PARTIAL (documented assumption)

The code documents correctly in `networkController.ts`:
```
// Chromium routes all TCP traffic through SOCKS5. When socks5 scheme is used,
// Chromium's network stack forwards the hostname (not the IP) to the proxy,
// which means DNS resolution happens at the proxy, avoiding local DNS leaks.
// CAVEAT: Cannot be independently verified from within the extension.
```

This is technically accurate per Chromium's documented behavior.  
**DNS status returned**: `PARTIALLY_PROTECTED` — honest.

---

### Layer 9: Kill Switch  
**File**: `extension/src/background/networkController.ts` → `enforceKillSwitch()`  
**Classification**: ✅ REAL (improved in Phase 2)

```typescript
singleProxy: { scheme: 'socks5', host: '127.0.0.1', port: 9 }
```

Port 9 is the IANA discard service. SOCKS5 scheme prevents Chrome from attempting direct connections. Triggered automatically when `checkAgentHealth()` detects Tor dropped during a PROTECTED session.

**Known limitation**: Cannot be unit-tested without a real Chrome instance. The behavior relies on Chromium's handling of unreachable SOCKS5 endpoints, which is documented but not independently verifiable from within the extension.

---

### Layer 10: WebRTC Protection  
**Classification**: 🔒 BROWSER-ENFORCED (real Chrome API)

```typescript
chrome.privacy.network.webRTCIPHandlingPolicy.set({ value: 'disable_non_proxied_udp' })
```

Policy is set, captured, and restored. Chrome enforces it — this is not simulated.  
**Honest limitation**: Does not block all WebRTC; blocks non-proxied UDP only.

---

### Layer 11: Storage Cleanup  
**Classification**: ✅ VERIFIED (real Chrome API, success-checked)

`chrome.browsingData.remove()` is called at session end. Success is verified. CRITICAL event emitted on failure.

---

### Layer 12: Agent Security  
**Classification**: ✅ REAL

- Localhost binding: `127.0.0.1` only
- Token: `hmac.compare_digest()` (timing-safe)
- Origin: 32-char extension ID regex
- OpenAPI: disabled (`openapi_url=None`)
- Access logs: disabled

---

## THE 11 QUESTIONS — ANSWERED

| # | Question | Answer |
|---|---------|--------|
| 1 | Is Tor actually installed/running? | **UNKNOWN** — Agent probes port, does not verify installation |
| 2 | Does ShadowBrowse start Tor? | **NO** — Not implemented. External dependency. |
| 3 | Does ShadowBrowse stop Tor? | **NO** — Not implemented. |
| 4 | Which SOCKS5 endpoint is used? | `127.0.0.1:9050` or `9150` (whichever responds first) |
| 5 | Is the endpoint definitely Tor? | **UNVERIFIED** — Any SOCKS5 proxy passes the handshake test |
| 6 | Can the extension prove browser traffic reaches Tor? | **NO** — Browser extension APIs do not expose traffic routing |
| 7 | Can the system verify external IP via Tor? | **NO** — Not implemented. Would require contacting an IP echo service. |
| 8 | Can it detect accidental direct Internet access? | **PARTIALLY** — Kill switch blocks traffic when Tor drops. Cannot detect silent bypass. |
| 9 | What happens when Tor becomes unavailable? | Kill switch activates → proxy blackholed → state = FAILED |
| 10 | What happens when SOCKS5 endpoint disappears? | Same as #9 — detected on next 10-second health check |
| 11 | Can original browser proxy be restored safely? | **YES** — Snapshot captured before session, restored from snapshot on exit |

---

## WHAT PHASE 3 MUST ADD

### Priority 1 — REAL: Tor Provider Model
Replace the single-probe detector with a structured provider model:
- `SYSTEM_TOR` — system Tor at port 9050
- `TOR_BROWSER` — Tor Browser at port 9150  
- `CONFIGURED_SOCKS5` — user-specified endpoint
- `UNAVAILABLE` — none found

### Priority 2 — REAL: Authoritative Tor Status State Machine
Replace the binary `CONNECTED/NOT_AVAILABLE` with:
`TOR_UNAVAILABLE → TOR_STARTING → TOR_BOOTSTRAPPING → TOR_READY → TOR_ROUTE_VERIFIED → TOR_DEGRADED → TOR_FAILED`

The agent must be the authoritative source for this state.

### Priority 3 — REAL (with honest limits): Route Verification via Agent
The Local Shadow Agent CAN make outbound requests (unlike the extension).  
It can contact a controlled IP-echo endpoint through the SOCKS5 proxy.  
This proves: "a request via this SOCKS5 proxy reaches the Internet as a different IP."  
This does NOT prove: "the SOCKS5 proxy is Tor."

Implementation: Agent makes a proxied request to `https://check.torproject.org/api/ip` via the SOCKS5 connection and returns:
- Whether the request succeeded
- Whether the returned IP differs from the agent's direct IP
- Whether `check.torproject.org` recognized the exit IP as a Tor exit node

This is the strongest verification available without the Tor Control Port.

### Priority 4 — REAL: Tor Bootstrap via Control Port (if available)
If Tor is running on the system, its Control Port is typically at `127.0.0.1:9051` (daemon) or `127.0.0.1:9151` (Tor Browser). The agent can authenticate (cookie or null auth) and issue:
```
GETINFO status/bootstrap-phase
```
This returns actual bootstrap progress, not a guessed value.

### Priority 5 — DOCUMENTED: Failure Test Matrix
Automated tests for all 14 failure scenarios from the Phase 3 spec.

---

## WHAT CANNOT BE DONE (Structural Limits)

| Limit | Reason |
|-------|--------|
| Extension cannot start OS processes | Browser extension sandbox restriction |
| Extension cannot make raw TCP connections | Service workers use `fetch()`, not sockets |
| Extension cannot read traffic content | Chrome does not expose traffic to extensions |
| Extension cannot verify exit node IP directly | Would require outbound request (privacy risk) |
| Agent cannot start Tor safely on Windows without bundled binary | Requires platform-specific Tor installation |

---

## PHASE 3 IMPLEMENTATION PLAN

1. **Tor provider model** in `agent/src/tor/` — replaces `detector.py`
2. **Tor Control Port client** in `agent/src/tor/control.py` — bootstrap status
3. **Route verification via proxy** in `agent/src/tor/route_verifier.py` — outbound IP check
4. **Updated status API** — authoritative multi-state Tor status
5. **Updated extension types** — new TorProviderType, extended TorStatus enum
6. **Updated NetworkController** — consume new status states
7. **Updated UI** — surface new states without redesign
8. **Failure test matrix** — 14 automated failure scenarios
