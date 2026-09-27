# ShadowBrowse — Known Limitations

This document honestly describes what ShadowBrowse **cannot** do due to browser architecture, OS constraints, or the nature of the technology.

This is not a list of "to-dos" — these are structural limitations of what a browser extension can achieve.

---

## Category 1: Network Routing Limitations

### L-001: Cannot Start or Manage Tor
**Limitation**: ShadowBrowse cannot start, stop, configure, or restart the Tor daemon.  
**Reason**: Browser extensions cannot spawn OS processes.  
**Impact**: Tor must be installed and running separately. ShadowBrowse detects it but does not manage it.  
**Honest UI**: "Tor Not Running" when Tor is unavailable — NOT "Error starting Tor"

### L-002: Browser vs Agent Route Verification Distinction
**Limitation**: While ShadowBrowse verifies both agent-side egress and browser-side first-party service worker fetch routing, it cannot inspect raw packet-level TLS streams of arbitrary individual user tabs.  
**Reason**: Chrome Manifest V3 security boundaries isolate tab network sockets from extension background workers.  
**What IS verified**:
  - Agent SOCKS5 CONNECT tunnel to `check.torproject.org` with exit node identity confirmation (`TOR_ROUTE_VERIFIED`).
  - Browser-side outbound IP probe through Chrome's proxy network stack (`BROWSER_ROUTE_VERIFIED`).
  - Active proxy configuration in Chromium settings (`mode: fixed_servers`).
  - Comparison of direct IP vs proxied IP (`DIRECT_BYPASS_DETECTED` prevention).  
**What is NOT verified**: Intermediate circuit hops (guard/middle nodes) and raw tab-level packet headers.  
**Honest UI**: Displays separate `Agent [TOR_ROUTE_VERIFIED]` and `Browser [BROWSER_ROUTE_VERIFIED]` badges.

### L-003: SOCKS5 Handshake Alone Does Not Prove Tor
**Limitation**: A SOCKS5 handshake (`\x05\x00`) proves a SOCKS5 proxy is listening, but does not prove it is Tor.  
**Resolution in Phase 3**: ShadowBrowse now verifies Tor identity via two independent mechanisms:
  1. Tor Control Port protocol probing (`GETINFO status/bootstrap-phase`).
  2. Exit IP verification against the Tor Project authority (`check.torproject.org`).
  If a SOCKS5 proxy responds but cannot be confirmed as Tor, ShadowBrowse reports `ROUTE_VERIFIED_TOR_UNVERIFIED` instead of `TOR_ROUTE_VERIFIED`.

### L-004: Cannot Protect Non-Browser Traffic
**Limitation**: ShadowBrowse only affects Chrome's network traffic.  
**Reason**: Extension proxy settings apply to Chrome only, not to other applications.  
**Impact**: Other apps (Electron, system services, etc.) bypass ShadowBrowse entirely.

---

## Category 2: DNS Limitations

### L-005: DNS Cannot Be Independently Verified
**Limitation**: ShadowBrowse cannot confirm DNS queries are resolved via Tor's remote DNS.  
**Reason**: No DNS interception API is available in browser extensions.  
**Expected behavior**: When Chrome uses SOCKS5 with scheme `socks5`, hostnames are forwarded to the proxy for resolution (not pre-resolved locally). This is Chromium's documented behavior.  
**Honest UI**: DNS status shown as PARTIALLY_PROTECTED (not PROTECTED).

### L-006: System Resolver May Override Chrome
**Limitation**: If Chrome falls back to direct DNS (e.g., on SOCKS5 failure), ShadowBrowse cannot detect this.  
**Honest UI**: Always recommend external DNS leak test (dnsleaktest.com) after session start.

---

## Category 3: Fingerprinting Limitations

### L-007: Fingerprint Detection Only (Phase 2)
**Limitation**: Fingerprint probes are detected and logged but return values are NOT modified.  
**Reason for not adding noise**: Random noise applied inconsistently creates a unique noise signature. True mitigation requires consistent, cross-API, cross-reload normalized values — a complex implementation.  
**Phase 3 plan**: Canvas noise normalization (consistent per-session values, not random).  
**Honest UI**: `DETECTION ONLY` — not PROTECTED.

### L-008: Non-Hookable Fingerprint APIs
**Limitation**: Some fingerprinting methods cannot be intercepted:
  - HTTP header fingerprinting (User-Agent, Accept-Language, etc.)
  - CPU/memory timing side channels
  - Keyboard/mouse behavioral fingerprinting
  - Battery API (deprecated but some browsers retain it)
  - Font enumeration via CSS

---

## Category 4: Storage Isolation Limitations

### L-009: Storage Isolation Is Cleanup-on-Exit, Not Real Partitioning
**Limitation**: During a session, websites can write to normal browser storage. Data is not sandboxed in a separate partition.  
**Reason**: Chrome does not expose per-session storage partitioning to extensions (third-party storage partitioning is a browser feature, not configurable by extensions).  
**What ShadowBrowse does**: Records session start time; clears all storage newer than that timestamp on exit.  
**Honest UI**: `PARTIALLY PROTECTED` — not PROTECTED.

### L-010: browsingData.remove() Completeness
**Limitation**: `chrome.browsingData.remove()` may not clear all storage in all edge cases (e.g., extension-stored data, Push subscriptions, cached service workers from before the session).  
**ShadowBrowse behavior**: Verifies API call success; emits CRITICAL event on failure.

---

## Category 5: Identity Limitations

### L-011: Cannot Prevent Voluntary Identity Disclosure
**Limitation**: If the user logs into Google, Facebook, or any identity provider while in Anonymous Mode, their real identity is linked to the session.  
**ShadowBrowse behavior**: Detects navigation to known login domains and emits a warning event. The warning is shown in the Security Events log.  
**Limitation of current UI**: Warning appears in the audit log but not as a blocking visible prompt. (Planned for Phase 3.)

### L-012: Cannot Prevent Server-Side Behavioral Correlation
**Limitation**: Even with Tor active, a website can correlate sessions by behavioral patterns (typing rhythm, mouse movements, browsing patterns, timing).  
**ShadowBrowse behavior**: Does not address behavioral fingerprinting.

---

## Category 6: WebRTC Limitations

### L-013: WebRTC Policy Coverage
**Limitation**: `disable_non_proxied_udp` restricts WebRTC direct UDP. It does not disable all WebRTC.  
**What it prevents**: IP address leakage via STUN/ICE peer connections outside the proxy.  
**What it does not prevent**: WebRTC relayed via TURN servers, or WebRTC connections inside the proxy tunnel.

---

## Category 7: Kill Switch Limitations

### L-014: Kill Switch Port 9 Behavior
**Limitation**: The kill switch routes traffic to `socks5://127.0.0.1:9` (IANA discard port). If nothing is listening on port 9, Chrome fails to connect — which is the intended behavior. However:  
  - If some service is unexpectedly listening on port 9, traffic would go to that service
  - Some corporate network environments may intercept port 9
**ShadowBrowse behavior**: Uses SOCKS5 scheme (not HTTP) to prevent Chrome from falling back to direct connections.

---

## Category 8: Tracking & Privacy Mitigation Limitations (Phase 4B)

### L-015: Query Parameter Sanitization Scope
**Limitation**: Query parameter sanitization strips parameters from the URL query string (`window.location.search`).  
**What it does NOT prevent**:
  - Tracking tokens embedded in HTTP POST request bodies
  - Path-encoded tracking identifiers (e.g., `/user/click_99482/view`)
  - Obfuscated tracking keys not present in deterministic rule dictionaries

### L-016: DeclarativeNetRequest Coverage Limits
**Limitation**: Declarative tracker blocking relies on a curated local ruleset.  
**What it does NOT prevent**:
  - First-party tracking scripts hosted directly on the root domain (e.g., `example.com/telemetry.js`)
  - CNAME-cloaked tracking domains resolving to first-party subdomains
  - Tracking services not listed in the 15 high-confidence rules

### L-017: DOM Referrer vs Network Referer Header
**Limitation**: DeclarativeNetRequest modifies the HTTP `Referer` request header on outgoing subresource requests.  
**What it does NOT prevent**:
  - Inline JavaScript reading `document.referrer` synchronously before navigation or header filters take effect

### L-018: Server-Side Cross-Session Correlation
**Limitation**: Storage cleanup (`STORAGE_CLEANUP_VERIFIED`) ensures local cookies and storage tokens are purged on session end.  
**What it does NOT prevent**:
  - Ad networks or state-level adversaries correlating sessions using server-side graphs, timing analysis, or persistent user behavior patterns across Tor exits

---

## Summary Table

| Limitation | Category | Impact | Phase |
|-----------|---------|--------|-------|
| L-001: Cannot start Tor | Network | HIGH | Architectural |
| L-002: Cannot verify Tor routing | Network | HIGH | Architectural |
| L-003: SOCKS5 ≠ Tor identity | Network | MEDIUM | Phase 3 (Control Port) |
| L-004: Non-browser traffic | Network | HIGH | Architectural |
| L-005: DNS unverifiable | DNS | MEDIUM | Architectural |
| L-006: System resolver override | DNS | MEDIUM | Architectural |
| L-007: Fingerprint detection only | Fingerprint | HIGH | Phase 3 / 4B (Honest) |
| L-008: Non-hookable APIs | Fingerprint | MEDIUM | Architectural |
| L-009: Storage cleanup-on-exit | Storage | MEDIUM | Phase 4B (Verified) |
| L-010: browsingData completeness | Storage | LOW | Mitigated |
| L-011: Voluntary identity disclosure | Identity | HIGH | Architectural |
| L-012: Behavioral correlation | Identity | HIGH | Architectural |
| L-013: WebRTC partial coverage | WebRTC | MEDIUM | Architectural |
| L-014: Kill switch port behavior | Network | LOW | Documented |
| L-015: Parameter sanitization scope | Mitigation | MEDIUM | Phase 4B |
| L-016: Local DNR tracker coverage | Mitigation | MEDIUM | Phase 4B |
| L-017: Synchronous DOM referrer | Mitigation | LOW | Phase 4B |
| L-018: External graph correlation | Identity | HIGH | Architectural |

