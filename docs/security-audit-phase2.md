# ShadowBrowse — Phase 2 Security Audit

**Audit Date**: 2026-09-27  
**Auditor**: ShadowBrowse Internal Engineering

---

## SCOPE

This audit covers:
- Local Shadow Agent (Python/FastAPI) API security
- Browser Extension permission surface (Manifest V3)
- Token authentication security
- Origin validation
- Rate limiting
- Input injection resistance
- Session lifecycle security

---

## 1. LOCAL SHADOW AGENT SECURITY

### 1.1 Network Binding
- **Status**: ✅ PASS
- Agent binds exclusively to `127.0.0.1` (loopback)
- Rejecting connections from non-loopback hosts enforced in `auth.py`
- External hosts receive `403 Forbidden`

### 1.2 Origin Validation
- **Status**: ✅ PASS (Phase 2 upgrade)
- `chrome-extension://` origins require exactly 32 lowercase alphabetic characters as the extension ID
  - Previous Phase 1: `origin.startsWith("chrome-extension://")` — allowed empty extension IDs
  - Phase 2: `^chrome-extension://[a-z]{32}(/.*)?$` — requires valid extension ID
- Localhost origins: `^https?://(127\.0\.0\.1|localhost)(:\d+)?(/.*)?$`
- All other origins: `403 Forbidden`
- Test coverage: 10 malicious origins tested, all rejected

### 1.3 Token Authentication
- **Status**: ✅ PASS
- 256-bit hex token (generated via `secrets.token_hex(32)`)
- Stored in user-local config file (not hardcoded, not in repo)
- **Phase 2**: Constant-time comparison using `hmac.compare_digest()` — prevents timing attacks
- **Phase 2**: Query parameter token fallback **removed** — tokens must arrive via `X-Shadow-Token` header only
- Token is never logged (access log disabled in uvicorn)

### 1.4 Rate Limiting
- **Status**: ✅ PASS
- In-memory sliding window: 60 requests/minute per client IP
- Applied before any endpoint logic

### 1.5 API Surface
- **Status**: ✅ PASS
- `docs_url=None` — Swagger UI disabled
- `redoc_url=None` — ReDoc UI disabled
- `openapi_url=None` — `/openapi.json` schema endpoint disabled
- No shell execution, file read, process spawn, or system command endpoints
- Defined endpoints: `/api/v1/status`, `/api/v1/session/start`, `/api/v1/session/stop`, `/api/v1/network/status`, `/api/v1/diagnostics`

### 1.6 Input Injection Resistance
- **Status**: ✅ PASS
- Query parameter payloads (shell injection, path traversal, oversized): handled safely, no 500 errors
- ASCII control characters in URLs: rejected at HTTP client level (HTTPX/Starlette URL parser)
- Malformed JSON bodies: handled with 422 Unprocessable Entity
- No dynamic command execution from any input path

### 1.7 Access Logging
- **Status**: ✅ PASS (critical)
- `access_log=False` in uvicorn — request URLs are not logged
- This prevents browsing history leakage via local agent logs

### 1.8 Test Mode Guard
- **Status**: ✅ PASS
- `testclient` host allowance is gated on `SHADOWBROWSE_TEST_MODE=1` environment variable
- Production deployments do not allow the `testclient` host

---

## 2. EXTENSION PERMISSION AUDIT (Manifest V3)

### Permissions Review

| Permission | Required For | Can Be Removed? |
|-----------|-------------|-----------------|
| `storage` | Saving user settings (`chrome.storage.local`) | No |
| `proxy` | Routing traffic through Tor SOCKS5 | No — core function |
| `privacy` | `webRTCIPHandlingPolicy` (WebRTC leak prevention) | No — core function |
| `cookies` | Context for browsingData scope | Required by `browsingData` |
| `browsingData` | Session cleanup (`remove()`) | No — core function |
| `sidePanel` | Privacy side panel | No — feature |
| `activeTab` | Getting current tab for autopsy | No — feature |
| `tabs` | Identity leak monitoring (`onUpdated`) | No — security function |
| `scripting` | Injecting `injectGuard.js` into MAIN world | No — fingerprint detection |

### Host Permissions Review

| Permission | Required For | Risk |
|-----------|-------------|------|
| `<all_urls>` | Content script injection on all sites | Required for full protection |
| `http://127.0.0.1/*` | Local Shadow Agent communication | Low — loopback only |
| `http://localhost/*` | Local Shadow Agent (alt hostname) | Low — loopback only |

**Verdict**: No unnecessary permissions. All permissions serve documented, real functionality.

### Web Accessible Resources
- `injectGuard.js` is web-accessible (required for MAIN world injection)
- The guard sets `window.__SHADOWBROWSE_GUARD__` to prevent double-injection
- No other resources are web-accessible

---

## 3. EXTENSION CONTENT SECURITY

### 3.1 injectGuard.ts (MAIN World)
- Hooks Canvas, WebGL, AudioContext methods via prototype monkey-patching
- Uses IIFE with re-entry guard to prevent double injection
- Communicates only via `window.postMessage` to the ISOLATED world content script
- Does NOT pass data to remote servers
- Does NOT modify return values (detection only in Phase 2)

### 3.2 Content Script
- Runs at `document_start` in ISOLATED world
- Receives `postMessage` signals from MAIN world guard
- Validates message source before forwarding
- Forwards to background via `chrome.runtime.sendMessage`

### 3.3 Service Worker (Background)
- Handles all privacy state management
- Does NOT expose data to web pages
- Does NOT log browsing URLs

---

## 4. SESSION SECURITY

### 4.1 Session ID Generation
- `crypto.randomUUID()` — 128-bit UUID v4, cryptographically secure
- Not derived from user identity, IP, device, or timestamp pattern
- Ephemeral — destroyed on `endSession()`
- Not persisted to `chrome.storage` or any disk location

### 4.2 Session Lifecycle
- Pre-session state (proxy, WebRTC policy) captured before modification
- State restored precisely on session end (not just "reset to default")
- `browsingData.remove()` is verified — failure emits CRITICAL event

---

## 5. KNOWN RESIDUAL RISKS

| Risk | Severity | Mitigation | Status |
|------|---------|-----------|--------|
| SOCKS5 probe cannot prove Tor identity | LOW | Documentation; UI shows PARTIALLY_PROTECTED | Documented |
| `browsingData.remove()` may not clear all data | LOW | Verified; CRITICAL event on failure | Mitigated |
| Kill switch relies on port 9 behavior | LOW | Tested; SOCKS5 scheme prevents direct bypass | Documented |
| Fingerprint values not modified | MEDIUM | UI shows DETECTION_ONLY; documented | Documented |
| DNS cannot be verified independently | LOW | UI shows PARTIALLY_PROTECTED; documented | Documented |
| Identity leak warning not shown as UI prompt | LOW | Events emitted; popup should surface pending warning | Tracked |

---

## 6. TEST COVERAGE SUMMARY

| Test Suite | Tests | Pass | Fail |
|-----------|-------|------|------|
| Agent core (`test_agent.py`) | 8 | 8 | 0 |
| Privacy (`test_privacy.py`) | 16 | 16 | 0 |
| Security (`test_agent_security.py`) | 30 | 30 | 0 |
| **Total** | **54** | **54** | **0** |

---

## 7. RECOMMENDATION SUMMARY

| Priority | Recommendation | Phase |
|---------|---------------|-------|
| HIGH | Add UI prompt for identity warnings (currently event-log only) | Phase 3 |
| HIGH | Implement canvas/WebGL/audio return-value normalization | Phase 3 |
| MEDIUM | Add Tor Control Port integration for circuit verification | Phase 3 |
| MEDIUM | DNS leak test via external check.torproject.org probe | Phase 3 |
| LOW | Add Pydantic request body schemas to POST endpoints | Phase 3 |
| LOW | Per-extension-ID token binding (prevent token reuse) | Phase 3 |
