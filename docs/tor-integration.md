# ShadowBrowse — Tor Integration (Phase 3)

## Architecture Reality

ShadowBrowse operates in position **B** in the following chain:

```
Chrome Browser (Extension sets proxy config & runs browser outbound probe)
     ↓
Local Shadow Agent (Python/FastAPI — Tor provider model & route verifier)
     ↓
Tor SOCKS5 Daemon & Control Port (System Tor, Tor Browser, or user-managed)
     ↓
Tor Network (Circuits built by Tor daemon)
     ↓
Internet (via Tor exit node verified by check.torproject.org)
```

---

## What ShadowBrowse Manages

| Component | Managed By | Notes |
|-----------|-----------|-------|
| Chrome proxy settings | ShadowBrowse Extension | via `chrome.proxy.settings.set()` with pre-session snapshot capture/restore |
| Tor provider detection | Local Shadow Agent | Structured provider model: `SYSTEM_TOR`, `TOR_BROWSER`, `USER_MANAGED_TOR`, `CONFIGURED_SOCKS5`, `UNAVAILABLE` |
| Tor identity verification | Local Shadow Agent | Tor Control Port probe (`AUTHENTICATE`, `GETINFO status/bootstrap-phase`) |
| Tor process detection | Local Shadow Agent | Process table scan (`tor.exe`, `tor`) via `psutil` |
| Outbound route verification | Local Shadow Agent | SOCKS5 CONNECT tunnel with TLS wrapping to `check.torproject.org/api/ip` |
| Browser route verification | ShadowBrowse Extension | First-party service worker `probeBrowserOutboundRoute()` + proxy config read-back |
| Kill switch enforcement | Extension & Agent | SOCKS5 blackhole to port 9 (discard) preventing any direct internet fallback |
| Tor process lifecycle | **External** | User must run Tor or Tor Browser; ShadowBrowse does not bundle third-party binaries |

---

## The 4-Layer Route Verification Model

ShadowBrowse Phase 3 strictly separates four layers of verification:

```
+--------------------------------------------------------------+
| 1. SOCKS5 Reachability (Handshake only != Tor)                |
+--------------------------------------------------------------+
                               ↓
+--------------------------------------------------------------+
| 2. Proxied Outbound Connectivity (CONNECT tunnel established) |
+--------------------------------------------------------------+
                               ↓
+--------------------------------------------------------------+
| 3. External IP Observation (Direct IP != Proxied IP)         |
+--------------------------------------------------------------+
                               ↓
+--------------------------------------------------------------+
| 4. Tor Exit Node Confirmation (check.torproject.org IsTor)   |
+--------------------------------------------------------------+
```

### Classification Statuses:
- **`TOR_ROUTE_VERIFIED`**:
  Outbound request exited via SOCKS5, external IP differs from direct IP, AND `check.torproject.org` confirmed the exit IP belongs to a registered Tor exit node.
- **`ROUTE_VERIFIED_TOR_UNVERIFIED`**:
  Outbound request exited via SOCKS5, external IP differs from direct IP, but the exit is NOT confirmed as Tor (e.g. standard SOCKS5 proxy or unverified exit).
- **`DIRECT_BYPASS_DETECTED`**:
  Direct IP and proxied IP are identical. Traffic is leaking directly to the Internet. Fail-closed kill switch activates immediately.
- **`SOCKS5_REACHABLE_ONLY`**:
  SOCKS5 port responds to greeting, but outbound connection fails (Tor still bootstrapping or circuit creation in progress).
- **`UNAVAILABLE`**:
  SOCKS5 port is not listening.

---

## Agent Route vs Browser Route

| Dimension | Agent Route Verification | Browser Route Verification |
|-----------|--------------------------|----------------------------|
| **Execution context** | Local Python process | Chrome background service worker |
| **Network mechanism** | SOCKS5 TCP socket + TLS | `fetch()` through `chrome.proxy.settings` |
| **Target endpoint** | `check.torproject.org/api/ip` | `check.torproject.org/api/ip` |
| **What it proves** | The machine can route and exit via Tor | Chrome's network stack routes via proxy |
| **Limitation** | Does not prove Chrome uses this route | Cannot inspect raw TLS sockets of user tabs |

Both must be verified for `HIGH` confidence.

---

## Protected Session Startup Flow (Strict 10-Step Order)

1. **Capture Pre-Session State**: Snapshot active Chrome proxy configuration and WebRTC policy.
2. **Query Local Shadow Agent**: Request authoritative provider status.
3. **Verify Provider Availability**: Ensure provider is responsive and listening.
4. **Establish SOCKS5 Endpoint**: Resolve host and port (`127.0.0.1:9050` or `9150`).
5. **Configure Browser Proxy**: Apply fixed SOCKS5 proxy in Chrome with loopback bypass.
6. **Verify Active Configuration**: Read back settings from `chrome.proxy.settings.get()`.
7. **Agent Route Verification**: Agent executes SOCKS5 CONNECT tunnel to `check.torproject.org`.
8. **Browser Route Verification**: Extension service worker probes outbound IP and checks for bypass.
9. **Protection Level Validation**: Ensure no direct bypass and required criteria met.
10. **Activate Auxiliary Protections**: Enable storage isolation, WebRTC `disable_non_proxied_udp`, and fingerprint detection. ONLY THEN mark session `PROTECTED`.

If verification fails at any stage, **ShadowBrowse DOES NOT silently downgrade to direct Internet**. It activates the fail-closed kill switch or transitions to an honest `DEGRADED` state.
