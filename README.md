# ShadowBrowse
### *Technically Honest, Privacy-Preserving Browser Defense Layer for Chromium*

[![Tests](https://img.shields.io/badge/pytest-98%20passed-success)](tests/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict%20typecheck-blue)](extension/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3%20compliant-blueviolet)](extension/manifest.json)
[![Status](https://img.shields.io/badge/Phase-4.5%20Complete-green)]()

ShadowBrowse is a serious, technically honest browser privacy and anonymity system engineered for Chromium-based browsers (Google Chrome, Brave, Edge).

Unlike standard ad-blockers or superficial "privacy extensions", ShadowBrowse uses a **two-part architecture**:
1. **Manifest V3 Browser Extension (`/extension`)**: Provides an on-demand compact 380px popup control center, advanced Side Panel companion, live **Website Autopsy 2.0**, declarative tracker defense, tracking parameter sanitization, storage isolation/cleanup, WebRTC leak shielding, and non-spoofing fingerprint detection.
2. **Local Privacy Agent (`/agent`)**: A local daemon (`shadow-agent`) binding strictly to localhost (`127.0.0.1:9152`), managing genuine Tor provider detection, SOCKS5 remote proxy routing, control port bootstrap verification, route verification, and a fail-closed network kill switch.

---

## Technical Philosophy & Honesty Matrix

ShadowBrowse operates on a strict rule: **Zero Fake Claims**. We never claim "100% untraceable" or inject synthetic noise that increases browser uniqueness and fingerprintability.

| Privacy & Security Surface | Classification | Status | Technical Reality & Mechanism |
| :--- | :---: | :---: | :--- |
| **Tor Network Anonymity** | `PROTECTED` | ✅ REAL | 100% of browser TCP web traffic routed through verified Tor SOCKS5 proxy (`127.0.0.1:9050`). |
| **Browser Route Verification** | `PROTECTED` | ✅ REAL | Route verified via active loopback proxy handshake before granting `PROTECTED` status. |
| **Fail-Closed Kill Switch** | `PROTECTED` | ✅ REAL | Blocks outbound traffic to `127.0.0.1:9` discard sink on Tor failure while preserving local agent access (`127.0.0.1:9152`). |
| **WebRTC Shielding** | `PROTECTED` | ✅ REAL | Enforces `disable_non_proxied_udp` policy via Chromium privacy settings API to prevent local LAN and public IP leaks. |
| **Tracking Parameter Sanitization** | `PROTECTED` | ✅ REAL | Strips marketing and click tokens (`utm_*`, `gclid`, `fbclid`, etc.) using client-side `history.replaceState` while preserving functional application parameters. |
| **Declarative Tracker Defense** | `PROTECTED` | ✅ REAL | Blocks known tracking scripts, tracking pixels, and analytics beacons via native `chrome.declarativeNetRequest` rules without remote filter subscriptions. |
| **Safe Non-Blocking Policy** | `PROTECTED` | ✅ REAL | Explicit whitelist protection for essential web infrastructure (CDNs, Google Fonts, Stripe/PayPal, Cloudflare CAPTCHA). |
| **Remote DNS Resolution** | `PARTIAL` | ⚠️ HONEST | SOCKS5 proxy requests remote hostname resolution (`MINIMAL_REMOTE_SOCKS5`), but kernel/OS-level DNS cannot be independently verified from extension sandbox. |
| **Referrer Privacy Control** | `PARTIAL` | ⚠️ HONEST | Truncates cross-origin referrers via `modifyHeaders` declarative net request rules. |
| **Storage Isolation & Cleanup** | `PARTIAL` | ⚠️ HONEST | Full per-origin and session cookie/storage purge (`chrome.browsingData.remove`) verified at session teardown; lacks true OS-level containerization. |
| **Fingerprint Defense** | `DETECTION_ONLY` | 🔍 HONEST | Monitors Canvas 2D, WebGL hardware vendor/renderer, WebAudio dynamics, and Font probing in real time. **Zero synthetic noise injection** (noise creates distinct, high-entropy tracking vectors). |

---

## Architecture Diagram

```
                                SHADOWBROWSE SYSTEM
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 │                                               │
      BROWSER EXTENSION (MV3)                          LOCAL PRIVACY AGENT
   ┌─────────────────────────────┐                 ┌─────────────────────────────┐
   │ • Popup UI (380px)          │                 │ • FastAPI on 127.0.0.1:9152 │
   │ • SidePanel Companion       │                 │ • Tor Provider Auto-Detect  │
   │ • Website Autopsy 2.0       │                 │ • Bootstrap & Circuit Check │
   │ • declarativeNetRequest     │                 │ • Route Verification Test   │
   │ • Tracking Sanitizer        │                 │ • Fail-Closed Discard Sink  │
   │ • Injected Fingerprint Hook │                 │ • Zero Remote Telemetry     │
   └─────────────┬───────────────┘                 └──────────────┬──────────────┘
                 │                                                │
                 │              Internal IPC (127.0.0.1)          │
                 ├────────────────────────────────────────────────┤
                 │                                                │
                 ▼                                                ▼
     Chromium Proxy Settings                            Tor SOCKS5 Proxy
   (Controlled SOCKS5 Interface)                      (127.0.0.1:9050 / Custom)
                 │                                                │
                 └───────────────────────┬────────────────────────┘
                                         │
                                         ▼
                                  Tor Onion Network
                                         │
                                         ▼
                                   Target Server
```

---

## Key Features

### 1. Elevated Cyber-Dark UI (Phase 4.5 Overhaul)
- **Compact Popup (380px)**: Precision dark slate and midnight interface (`#0b0f19`) accented by violet (`#8b5cf6`).
- **Real-Time Session Hero**: Instant scannable status with honest badges (`PROTECTED`, `PARTIAL`, `DETECTION_ONLY`, `FAILED`).
- **High-Impact Session Action Button**: Single-click `START PRIVATE SESSION` toggle with neutral calm styling for termination and distinct alert treatment on failure.
- **Collapsible Technical Details**: Live categorized diagnostic drawer breaking down `TOR`, `ROUTE`, `PRIVACY`, `SESSION`, and `AGENT` state.

### 2. Website Autopsy 2.0
- Live structural audit of active browser tabs:
  - **Protocol & Certificate**: Checks HTTPS, TLS certificate status, and mixed-content risks.
  - **Third-Party Request Graph**: Classifies 1st-party assets vs. 3rd-party domains and displays real-time connection graphs.
  - **Tracker Classification**: Identifies and categorizes analytics, advertising, fingerprinting, and social trackers.
  - **Fingerprint Probing Watchdog**: Intercepts and logs attempts to probe Canvas (`toDataURL`, `getImageData`), WebGL hardware identifiers, WebAudio oscillators, and system font metrics.
  - **Calculated Exposure Score**: Quantified privacy score based on observed risks and telemetry leaks.

### 3. Declarative Tracker Defense & Sanitizer
- **Inbound Link Sanitization**: Cleans incoming tracking and campaign URLs (`fbclid`, `gclid`, `utm_*`) without breaking legitimate site query parameters.
- **Local MV3 Rules**: Evaluates requests using Chromium's declarative engine for maximum performance with 0ms script overhead.
- **Zero Remote Downloads**: Rulesets are bundled locally with full provenance and confidence metrics.

### 4. Disposable Identity & Session Cleanup
- Ephemeral session ID generation (`crypto.randomUUID()`).
- Automated cleanup of cookies, localStorage, IndexedDB, and cache partitions when an Anonymous Session ends.
- Pre-session proxy configuration backup and automatic restoration upon session close.

### 5. Interactive Web Lab (`tests/web-lab/`)
- Built-in local testing environment for deterministic, offline privacy validation:
  - Tracking parameter sanitization verification (`tracking-test.html`)
  - Canvas, WebGL, and WebAudio fingerprinting probe test harness (`fingerprint-test.html`)
  - Session cookie and storage isolation test suites

---

## Getting Started

### Prerequisites
- **Python 3.10+** (for Local Privacy Agent)
- **Node.js 18+** & **npm** (for Browser Extension)
- **Chromium-based Browser** (Chrome 116+, Brave, Edge)
- **Tor Service** (System Tor on port 9050, Tor Browser, or Brave Tor)

---

### Step 1: Build the Extension

```bash
# Navigate to extension directory
cd extension

# Install dependencies
npm install

# Verify TypeScript compilation
npm run typecheck

# Build production bundle
npm run build
```

Load the unpacked extension:
1. Open your browser and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in top right).
3. Click **Load unpacked** and select the `extension/dist` directory.

---

### Step 2: Start the Local Privacy Agent

From the repository root:

```bash
# Install Python dependencies
pip install -r agent/requirements.txt

# Launch agent daemon on localhost:9152
python -m agent.src.main --port 9152
```

The agent will initialize, detect running Tor providers (e.g. `SYSTEM_TOR` on port 9050), and verify SOCKS5 readiness.

---

### Step 3: Run the Automated Test Suite

ShadowBrowse maintains an extensive test suite covering network routing, kill switch behavior, DNS honesty, tracker defense, and storage isolation:

```bash
# Run complete Python test suite (98 tests)
python -m pytest -q

# Run extension typecheck
cd extension && npm run typecheck
```

---

### Step 4: Run the Local Web Lab

To test ShadowBrowse features against live deterministic test pages:

```bash
python tests/web-lab/server.py
```
Open `http://127.0.0.1:8080/` in Chrome to test:
- Tracking parameter sanitization (`tracking-test.html`)
- In-page fingerprint probes (`fingerprint-test.html`)
- Storage isolation and cleanup across sessions

---

## Documentation Index

| Document | Description |
| :--- | :--- |
| [Architecture Specification](docs/architecture.md) | Full architectural breakdown of the extension and agent. |
| [Threat Model](docs/threat-model.md) | High-level system threat model and adversary assumptions. |
| [Privacy Model](docs/privacy-model.md) | Privacy principles, data minimization, and local boundaries. |
| [Security Model](docs/security-model.md) | Extension sandbox constraints and daemon security. |
| [Technical Limitations & Honesty Document](docs/limitations.md) | Explicit statement of what ShadowBrowse cannot protect. |
| [Tor Integration Architecture](docs/tor-integration.md) | SOCKS5 proxy, circuit management, and provider detection. |
| [Privacy Claims & Non-Claims](docs/privacy-claims.md) | Canonical definitions of claims vs. non-claims. |
| [Phase 3 Network Audit](docs/phase3-network-audit.md) | Verification of Tor routing, DNS resolution, and kill switch. |
| [Phase 3 Security Audit](docs/security-audit-phase3.md) | Security evaluation of IPC, endpoints, and credentials. |
| [Phase 3 Real-World Acceptance](docs/phase3-real-world-acceptance.md) | Real-world validation with Tor Project exit verification. |
| [Phase 4A Browser Identity Audit](docs/phase4-browser-identity-audit.md) | Comprehensive audit of browser identifiers, cookies, and hardware fingerprinting. |
| [Phase 4 Capability Matrix](docs/phase4-capability-matrix.md) | Technical capability matrix across storage, fingerprinting, and URL parameters. |
| [Phase 4 Threat Model](docs/phase4-threat-model.md) | Browser fingerprinting and tracking threats in modern web environments. |
| [Phase 4B Privacy Mitigation Engine](docs/phase4-privacy-mitigation.md) | Tracking mitigation, declarative defense, and request graph design. |
| [Development Guide](docs/development.md) | Developer setup, code standards, and contribution guide. |
