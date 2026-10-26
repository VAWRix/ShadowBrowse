# ShadowBrowse — Installation and Operations Guide

This guide describes how to install, configure, verify, and operate the **ShadowBrowse Privacy-Preserving Chromium Extension** and its companion **Local Shadow Agent (`shadow-agent`)**.

---

## Architecture Overview

ShadowBrowse operates as a coordinated two-tier privacy system:
1. **Chromium Extension (MV3)**: Controls browser proxy routing, WebRTC leak protection policies, in-page DOM fingerprinting defenses, request tracking parameter stripping, and local privacy event persistence.
2. **Local Shadow Agent (`shadow-agent`)**: A lightweight, loopback-only daemon (`127.0.0.1:9152`) that manages SOCKS5/Tor circuit probing, out-of-band route verification, and leak diagnostics without exposing any shell execution or remote network ports.

---

## 1. Prerequisites and Environment

| Component | Minimum Version | Recommended / Tested |
| :--- | :--- | :--- |
| **Operating System** | Windows 10/11, macOS 12+, Linux (systemd) | Windows 11 x64 |
| **Chromium Browser** | Chromium 114+ (Manifest V3 support) | Google Chrome 120+ / Brave |
| **Python** | Python 3.10+ | Python 3.11.9 |
| **Node.js** | Node.js 18+ (for building extension) | Node.js 20+ / npm 10+ |
| **Tor Daemon (Optional for direct)** | Tor 0.4.7+ (SOCKS5 on port 9050/9150) | Tor 0.4.8 Expert Bundle |

---

## 2. Local Shadow Agent Setup

### Step 2.1: Python Environment & Dependencies
In the root of the `ShadowBrowse` repository:
```bash
python -m pip install -r requirements.txt
```

### Step 2.2: Launch Local Agent
Launch the local daemon bound strictly to loopback (`127.0.0.1`):
```bash
python -m agent.src.main --port 9152
```

Expected startup output:
```text
============================================================
 SHADOWBROWSE LOCAL PRIVACY AGENT (shadow-agent)
============================================================
 Binding strictly to: http://127.0.0.1:9152
 Auth Token Location: C:\Users\<Username>\.shadowbrowse\agent.token
 Auth Token: a1b2c3d4... (redacted for log safety; read full secret from file)
------------------------------------------------------------
 Ensure this token is set in your ShadowBrowse Extension settings.
============================================================
```

> **Security Note**:
> The agent automatically binds strictly to `127.0.0.1`. Attempts to bind to non-loopback addresses (e.g., `0.0.0.0` or LAN interfaces) will be terminated immediately by security assertion.

---

## 3. Extension Installation

### Step 3.1: Build Production Package
Compile TypeScript and package the extension via Vite:
```bash
npm --prefix extension run build
```
This compiles the production assets into `extension/dist/`.

### Step 3.2: Load Unpacked Extension in Chromium
1. Open Google Chrome (or any Chromium browser).
2. Navigate to `chrome://extensions`.
3. Enable **Developer mode** (toggle in upper right).
4. Click **Load unpacked**.
5. Select the `extension/dist` directory inside the repository.
6. Verify that **ShadowBrowse** appears with its icon and Manifest V3 badge.

### Step 3.3: Configure Agent Token
1. Open the ShadowBrowse extension by clicking its toolbar icon.
2. Click the gear icon to navigate to **Settings**.
3. Read the generated auth token from `~/.shadowbrowse/agent.token` (or copy from the console during first run).
4. Paste the token into **Local Agent Secret Token** and verify that the status badge indicates **Agent: Online**.

---

## 4. Operational Preflight Checklist

Before starting an anonymous session, review the following checklist:

- [ ] **Agent Running**: Check `http://127.0.0.1:9152/api/v1/status` returns `online: true`.
- [ ] **Loopback Isolation**: Verify agent is not bound to external LAN IPs.
- [ ] **Host-Header Protection**: Verify external Host headers (e.g., `attacker.com`) are rejected with HTTP 403.
- [ ] **Tor Daemon Availability**: If using `TOR` mode, ensure Tor is running on port 9050 (or Tor Browser on port 9150).
- [ ] **No Conflicting Proxy Extensions**: Disable third-party VPN or proxy extensions that override `chrome.proxy`.
- [ ] **Kill Switch Armed**: Ensure **Fail-Closed Kill Switch** is enabled in Settings (enabled by default).

---

## 5. Environment Modes

| Mode | Behavior | Egress Path |
| :--- | :--- | :--- |
| **Development / Test Mode** | `SHADOWBROWSE_TEST_MODE=1` environment variable set. Mock external IPs used to run deterministic test suites without external network access. | Loopback test client |
| **Local Proxy Mode** | Routes HTTP traffic through local filtering proxy on port 8118 (e.g., Privoxy). | Local proxy |
| **Tor Anonymous Mode** | Routes traffic via Chromium SOCKS5 (`127.0.0.1:9050`). DNS is remotely resolved via SOCKS5. If Tor drops, traffic is blackholed to discard port `127.0.0.1:9`. | Verified Tor Circuit |

---

## 6. Real-Browser Acceptance & Live Tor Verification

### 6.1: Extension UI & Security Acceptance
To execute automated real-browser acceptance testing on an installed Google Chrome:
```bash
node tests/real_browser_phase10_acceptance.mjs
```
This script validates clean profile loading, service worker registration, popup/sidepanel UI mounting, message size bounds, and zero console errors.

### 6.2: Live Tor Egress & Kill Switch Acceptance
When Tor is active on port 9050 and the Local Agent is running on port 9152:
```bash
node tests/real_world_acceptance.mjs
```
This automated script:
1. Verifies local Tor SOCKS5 and ControlPort connectivity.
2. Navigates an isolated Chrome tab to `https://check.torproject.org/api/ip` and confirms `IsTor: true`.
3. Tests the fail-closed kill switch by simulating daemon drop (switching proxy to port 9 discard blackhole).
4. Restores Tor and verifies recovery to protected state.
5. Verifies pre-session proxy restoration to baseline (`system`).

### 6.3: Automated Regression Test Suite
To run the complete automated regression suite:
```bash
python -m pytest -q
```
All 209 automated tests across security, network, privacy, onboarding, and live Tor validation must pass.
