# ShadowBrowse — Final Review Demonstration Runbook

**Target Audience:** Project Reviewers, Technical Evaluators, Examiners  
**Execution Environment:** Windows 10/11, PowerShell 5.1 / PowerShell 7, Google Chrome / Brave  
**Review Deadline Status:** Review-Ready Release Candidate (Sprint Verified)  
**Date:** October 25, 2026  

---

## 1. System Prerequisites & Environment Setup

Before launching the demonstration, ensure the following components and dependencies are available:

| Component | Path / Requirement | Verification Command |
| :--- | :--- | :--- |
| **Google Chrome** | `C:\Program Files\Google\Chrome\Application\chrome.exe` | `Test-Path "C:\Program Files\Google\Chrome\Application\chrome.exe"` |
| **Python Runtime** | Python 3.11+ with FastAPI, Uvicorn, PyYAML | `python --version` |
| **Node.js** | Node.js 18+ & npm | `node --version` |
| **Bundled Tor Daemon** | `agent\bin\tor\tor\tor.exe` (Tor 0.4.8.14) | `.\agent\bin\tor\tor\tor.exe -f .\agent\bin\tor\torrc --verify-config` |
| **Extension Dist** | `extension\dist\` (Manifest V3 built bundle) | `Test-Path extension\dist\manifest.json` |

---

## 2. One-Time Build & Token Initialization

Run these commands once in PowerShell from the repository root:

```powershell
# 1. Build extension bundle
npm --prefix extension run build

# 2. Verify all Python regression tests pass
python -m pytest -q

# 3. Ensure agent token directory exists
$tokenDir = "$HOME\.shadowbrowse"
if (-not (Test-Path $tokenDir)) { New-Item -ItemType Directory -Path $tokenDir -Force }
```

---

## 3. Repeatable 15-Step Demonstration Script

Follow this step-by-step sequence during the project review presentation.

### Step 1: Start the Local Shadow Agent Daemon
Open PowerShell Terminal 1:
```powershell
# Run the local agent daemon on port 9152
python -m agent
```
*Expected Output:*
```
INFO:     Started server process [PID]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:9152 (Press CTRL+C to quit)
```
*Reviewer Explanation:*  
"The ShadowBrowse architecture relies on a local privileged daemon (Shadow Agent) bound strictly to localhost (`127.0.0.1:9152`). The agent handles Tor process supervision, control port verification, and multi-layer route probing."

---

### Step 2: Verify Agent Status and Origin Protection
In PowerShell Terminal 2:
```powershell
# 1. Check public status endpoint (native PowerShell JSON display)
curl.exe -s http://127.0.0.1:9152/api/v1/status | ConvertFrom-Json | Format-List

# 2. Verify external websites are blocked from accessing agent API (Anti-CSRF)
curl.exe -s -I -H "Origin: https://malicious-tracker.com" http://127.0.0.1:9152/api/v1/status
```
*Expected Output:*
- First command returns JSON: `"online": true, "tor_status": "NOT_AVAILABLE"` (or `"CONNECTED"` if Tor was already active).
- Second command returns `HTTP/1.1 403 Forbidden`.
*Reviewer Explanation:*  
"Security by design: Any external web origin trying to probe or reconfigure the local agent is immediately rejected with HTTP 403. Only the ShadowBrowse extension origin (`chrome-extension://...`) is permitted."

---

### Step 3: Start the Bundled Tor Daemon
In PowerShell Terminal 3 (or let the extension supervise it):
```powershell
.\agent\bin\tor\tor\tor.exe -f .\agent\bin\tor\torrc
```
*Expected Output:*
```
[notice] Opening Socks listener on 127.0.0.1:9050
[notice] Opening Control listener on 127.0.0.1:9051
[notice] Bootstrapped 100% (done): Done
```
*Reviewer Explanation:*  
"ShadowBrowse uses a fully isolated bundled Tor daemon listening on SOCKS5 port 9050 and Control Port 9051 with strict loopback binding."

---

### Step 4: Verify Tor Provider Detection via Agent API
In Terminal 2:
```powershell
(curl.exe -s http://127.0.0.1:9152/api/v1/status | ConvertFrom-Json) | Select-Object tor_status, tor_bootstrap_percent, tor_control_port_verified, tor_verification_status | Format-List
```
*Expected Output:*
```json
{
  "tor_status": "CONNECTED",
  "tor_bootstrap_percent": 100,
  "tor_control_port_verified": true,
  "tor_verification_status": "CONFIRMED_TOR"
}
```
*Reviewer Explanation:*  
"The agent communicates over the Tor control port (9051) using standard protocol commands to verify 100% circuit bootstrap before allowing traffic."

---

### Step 5: Start the Web Lab Test Server
In PowerShell Terminal 4:
```powershell
python tests/web-lab/server.py
```
*Expected Output:*
```
Web Lab HTTP server running on http://127.0.0.1:8080 (Press CTRL+C to quit)
```
*Reviewer Explanation:*  
"The Web Lab server provides local test targets for tracking parameter sanitization, storage isolation, referrer leakage, and canvas fingerprinting."

---

### Step 6: Launch Google Chrome with ShadowBrowse
In Terminal 2:
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --load-extension="$(Get-Location)\extension\dist" `
  --no-first-run `
  --no-default-browser-check `
  "chrome://extensions"
```
*Expected Visual Result:*  
- Chrome opens with ShadowBrowse loaded in Developer Mode.
- Pin the ShadowBrowse icon to the toolbar.
- The badge displays "OFF" (grey icon).

---

### Step 7: Inspect Settings & Configure Agent Auth Token
1. Click the ShadowBrowse extension icon to open the Popup.
2. Click **Settings** (gear icon) in the header.
3. Observe:
   - Agent Host: `127.0.0.1`, Agent Port: `9152`.
   - Default Network Mode: `TOR`.
   - Kill Switch: `Enabled`.
   - Token status: Automatically synced from `~/.shadowbrowse/agent.token` or paste token if prompted.
4. Click **Test Agent Connection**: Observe green checkmark `"Connected to Shadow Agent v0.3.0"`.

---

### Step 8: Start Anonymous Session & Observe 10-Step Progress
1. In the Popup, click the large shield button: **"START ANONYMOUS SESSION"**.
2. Observe the animated 10-step progress checklist:
   - Step 1: Pre-session state captured
   - Step 2: Provider detected (SYSTEM_TOR)
   - Step 3: Provider responsive
   - Step 4: SOCKS5 endpoint ready (port 9050)
   - Step 5: Browser proxy configured
   - Step 6: Browser proxy verified active
   - Step 7: Agent route check (TOR_ROUTE_VERIFIED)
   - Step 8: Browser outbound route probe (BROWSER_ROUTE_VERIFIED)
   - Step 9: Route satisfies protection criteria
   - Step 10: Session status: PROTECTED
3. Badge turns green with **"TOR"** label.
*Reviewer Explanation:*  
"Unlike basic proxy switchers, ShadowBrowse does not declare 'Protected' until BOTH the local agent SOCKS5 handshake AND an outbound browser-level probe to check.torproject.org succeed."

---

### Step 9: Demonstrate Real Browser Tor Route Verification
In the Chrome browser tab, navigate to:
`https://check.torproject.org/api/ip`

*Expected JSON Output:*
```json
{
  "IsTor": true,
  "IP": "<Tor-Exit-IP>"
}
```
*Reviewer Explanation:*  
"The browser's tab traffic is verified through an external exit node. The observed IP differs from the user's ISP public IP, and the official Tor Project API confirms `IsTor: true`."

---

### Step 10: Demonstrate Deep Links (SB-FIX-003)
1. Open the ShadowBrowse Popup.
2. In the "COMPANION PANELS" footer:
   - Click **"SITE AUTOPSY"** → Observe the Chrome Side Panel opens directly to the **Autopsy** tab.
   - Click **"ASSISTANT"** → Observe the Side Panel switches directly to the **Privacy Assistant** tab.
*Reviewer Explanation:*  
"Fixed in SB-FIX-003: Companion buttons in the popup now correctly deep-link into the respective side panel tabs instead of defaulting to the Status overview."

---

### Step 11: Run Website Autopsy & Assistant Context (SB-FIX-002)
1. In Chrome, open a test site or: `http://127.0.0.1:8080/tracking-test.html`
2. In the Side Panel under **Autopsy**:
   - Click **"Run Full Autopsy"**.
   - Observe the live scan: First-party vs. third-party requests, tracking parameters detected, fingerprinting scripts analyzed.
3. Switch to the **Assistant** tab:
   - Type: `"What did the autopsy find on this site?"`
   - Observe: The Assistant references the exact report data (risk score, detected trackers) without hallucinations.
*Reviewer Explanation:*  
"Fixed in SB-FIX-002: Autopsy scan state is lifted to persistent storage and passed directly into the Assistant context, enabling intelligent, evidence-based privacy explanations."

---

### Step 12: Demonstrate Tracking Parameter Sanitization & Referrer Protection (SB-FIX-001)
1. In Chrome, navigate to:
   `http://127.0.0.1:8080/tracking-test.html?utm_source=evil_corp&utm_medium=email&fbclid=AQD123456789&normal_param=keep_me`
2. Observe URL address bar immediately upon navigation:
   - Sanitized to: `http://127.0.0.1:8080/tracking-test.html?normal_param=keep_me`
   - Tracking parameters `utm_source`, `utm_medium`, and `fbclid` are stripped via clean URL rewriting.
3. Check Referrer Policy (SB-FIX-001):
   - In STANDARD mode, dynamic rule 9001 sets `Referrer-Policy: strict-origin-when-cross-origin`.
   - In STRICT mode, dynamic rule 9001 strips the `Referer` header entirely.
*Reviewer Explanation:*  
"Fixed in SB-FIX-001: The DNR rule modification structure was repaired to use valid Declarative Net Request syntax (`strict-origin-when-cross-origin` on response or removal on request)."

---

### Step 13: Demonstrate Fail-Closed Kill Switch & Direct Bypass Prevention
To simulate a network drop or crash:
1. In PowerShell Terminal 2, terminate the Tor process:
   ```powershell
   taskkill /F /IM tor.exe
   ```
2. In Chrome:
   - Within 2 seconds, ShadowBrowse detects the loss of SOCKS5 connectivity.
   - The popup badge changes to red **"FAIL"** with state **FAILED**.
   - The kill switch engages: Chrome proxy is redirected to `127.0.0.1:9` (discard blackhole).
3. In Chrome, attempt to navigate to any external site (e.g. `https://api.ipify.org`):
   - The connection is immediately dropped (`ERR_PROXY_CONNECTION_FAILED`).
   - Direct bypass is physically blocked. Traffic NEVER leaks onto the direct ISP route.
*Reviewer Explanation:*  
"ShadowBrowse implements a true fail-closed kill switch. When Tor drops, the browser proxy does not revert to direct—it points to port 9 discard, ensuring zero unencrypted traffic escapes."

---

### Step 14: Demonstrate Automatic Recovery
1. In Terminal 3, restart the Tor daemon:
   ```powershell
   .\agent\bin\tor\tor\tor.exe -f .\agent\bin\tor\torrc
   ```
2. Wait 5 seconds for Tor to bootstrap.
3. In Chrome:
   - The background monitor detects Tor reconnection.
   - Routing is automatically re-established through SOCKS5 port 9050.
   - The badge returns to green **"TOR"** (State: **PROTECTED**).
   - Reload `https://check.torproject.org/api/ip` → Outbound browsing resumes securely.

---

### Step 15: End Session & Verify Storage Cleanup & Proxy Restoration
1. In the Popup, click **"END SESSION"**.
2. Observe:
   - Browser proxy configuration is restored exactly to baseline (`system` / direct).
   - WebRTC IP handling policy is restored to `default`.
   - Browser cookies, cache, local storage, and history created during the session are purged.
   - Badge returns to grey **"OFF"**.
*Reviewer Explanation:*  
"Clean session exit: Baseline network configuration and WebRTC settings are restored without residue, and the storage lifecycle cleanup verifies zero cross-session storage leakage."

---

## 4. Honest Technical Explanations for Known Limitations

During the review, maintain complete technical honesty on these three architectural realities:

### 1. DNS Protection: PARTIAL (Remote SOCKS5 Forwarding)
- **What it does:** Chromium forwards all domain hostnames remotely through the SOCKS5 proxy (`singleProxy: { scheme: 'socks5', host: '127.0.0.1', port: 9050 }`). The Tor exit node resolves the domain, preventing local ISP DNS leakage for TCP browsing.
- **Why it is PARTIAL:** Chromium Manifest V3 extensions operate inside browser sandboxes and cannot inspect low-level operating system UDP sockets on port 53. If the host OS or non-proxied application sends background DNS queries, the extension cannot physically intercept them at the kernel layer.
- **Verdict:** Honestly labeled as **PARTIALLY PROTECTED**.

### 2. Browser Fingerprinting: DETECTION ONLY
- **What it does:** Detects canvas readout attempts, audio context probes, WebGL shader inspections, and screen dimension queries via content script injection guards. Emits security events when fingerprinters run.
- **Why it is DETECTION ONLY:** Chrome extensions cannot spoof hardware-level GPU primitives or alter JavaScript engine timing attacks without risking fingerprint uniqueness (anti-fingerprinting extensions often create a unique, paradoxical fingerprint). Real anonymity requires Tor Browser (Firefox ESR based with uniform canvas poisoning).
- **Verdict:** Honestly labeled as **DETECTION ONLY**.

### 3. Storage Isolation: CLEANUP ON EXIT (Not Container Isolation)
- **What it does:** Uses `chrome.browsingData.remove()` to clean cookies, localStorage, indexedDB, and cache upon session termination and captures unique session IDs.
- **Why it is CLEANUP:** Chromium does not provide Firefox-style Multi-Account Containers in the extension API. Real-time isolation between concurrent tabs in the same profile is impossible in MV3; protection is achieved via lifecycle purge on exit.
- **Verdict:** Honestly labeled as **CLEANUP ON EXIT**.

---

## 5. Review Emergency / Quick Recovery Procedures

If an unexpected state occurs during the demonstration:

| Symptom | Cause | One-Line Fix |
| :--- | :--- | :--- |
| **"Agent Offline" in Popup** | Daemon not started | Run `python -m agent` in PowerShell |
| **"Token Invalid / 401"** | Token mismatch | Copy token from `~/.shadowbrowse/agent.token` into Settings |
| **Badge stuck on "FAIL"** | Tor process died | Run `.\agent\bin\tor\tor\tor.exe -f .\agent\bin\tor\torrc` |
| **Kill switch stuck on port 9** | Session ended abnormally | In Popup, click "END SESSION" or call `BrowserAdapter.clearProxy()` |
| **Port 9050 already in use** | Stray Tor process | Run `taskkill /F /IM tor.exe` and re-run startup command |
