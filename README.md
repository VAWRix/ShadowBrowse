# SHADOWBROWSE
### *Privacy-Preserving Anonymous Browsing Layer*

ShadowBrowse is a serious, technically honest browser privacy and anonymity system engineered for Chromium-based browsers (Google Chrome, Brave, Edge).

Unlike standard ad-blockers or superficial "privacy extensions", ShadowBrowse uses a **two-part architecture**:
1. **Manifest V3 Browser Extension (`/extension`)**: Provides an on-demand compact popup, advanced Side Panel companion, live **Website Autopsy**, storage isolation, fingerprint detection/normalization, and WebRTC leak shielding.
2. **Local Privacy Agent (`/agent`)**: A local daemon (`shadow-agent`) binding strictly to localhost (`127.0.0.1`), managing genuine Tor circuit verification, remote DNS routing via SOCKS5, health diagnostics, and a fail-closed network kill switch.

---

## Technical Philosophy

- **Zero Fake Claims**: Tor is reported as `CONNECTED` only when an active SOCKS5 handshake succeeds. If Tor is not running, the system transitions to `DEGRADED` or `FAILED`.
- **Fail-Closed Kill Switch**: If the privacy network drops unexpectedly during an Anonymous Session, network traffic is routed to a discard sink rather than silently downgrading to plain ISP traffic.
- **Disposable Identity**: Temporary session state, cookies, and cache partitions are purged upon session termination.
- **Local-First & Zero Cloud Profiling**: No tracking databases, no external analytics, no user profiling.

---

## Architecture Diagram

```
                     SHADOWBROWSE
                          │
              ┌───────────┴───────────┐
              │                       │
       BROWSER EXTENSION        LOCAL SHADOW AGENT
        (Manifest V3)           (Python / Rust Daemon)
              │                       │
      ┌───────┼────────┐       ┌──────┼───────┐
      │       │        │       │      │       │
    Popup  SidePanel Content   Tor   Proxy  Privacy
            │       Script     │      │     Engine
            │                  └──┬───┘
            │                     │
            └─────────┬───────────┘
                      │
                INTERNET
```

---

## Key Features

- **Compact Popup**: 360px dark cybersecurity interface with live status dots, one-click Anonymous Session toggle, and diagnostic badges.
- **Side Panel Privacy Assistant**: Local, deterministic security assistant explaining what websites can see and answering risk queries without cloud telemetry.
- **Website Autopsy**: Live structural breakdown of any web page:
  - Protocol & Certificate verification
  - Third-party tracker detection (`google-analytics.com`, `doubleclick.net`, etc.)
  - URL tracking tokens (`fbclid`, `gclid`, `utm_*`)
  - Real-time Canvas, WebGL, and WebAudio fingerprint probing detection
  - Evidence-based findings with calculated exposure scores
- **Storage Isolation**: Quarantines cookies and storage; automatically purges temporary data when the session ends.
- **WebRTC Shield**: Enforces `disable_non_proxied_udp` to prevent LAN/host IP exposure.
- **Identity Leak Alerts**: Real-time warnings when navigating to authentication endpoints (e.g. `accounts.google.com`) during an Anonymous Session.
- **Offline Web Lab**: Standalone local test pages in `tests/web-lab/` for verifiable offline privacy testing.

---

## Getting Started

### 1. Build Extension
```bash
cd extension
npm install
npm run build
```
Load the unpacked extension from `extension/dist` in `chrome://extensions/` with Developer Mode enabled.

### 2. Start Local Privacy Agent
```bash
python -m agent.src.main --port 9152
```

### 3. Run Test Suite
```bash
# Agent tests
python -m pytest agent/tests/test_agent.py -v

# Extension typecheck
cd extension
npm run typecheck
```

### 4. Run Test Lab
```bash
python tests/web-lab/server.py
```
Open `http://127.0.0.1:8080/` in Chrome to test tracker detection, canvas probes, and storage isolation.

---

## Detailed Documentation

- [Architecture Specification](docs/architecture.md)
- [Threat Model](docs/threat-model.md)
- [Privacy Model](docs/privacy-model.md)
- [Security Model](docs/security-model.md)
- [Technical Limitations & Honesty Document](docs/limitations.md)
- [Development Guide](docs/development.md)
- [Tor Integration Architecture](docs/tor-integration.md)
- [Privacy Claims & Non-Claims](docs/privacy-claims.md)
- [Phase 3 Network Audit](docs/phase3-network-audit.md)
- [Phase 3 Security Audit](docs/security-audit-phase3.md)
- [Phase 3 Real-World Acceptance Report](docs/phase3-real-world-acceptance.md)

