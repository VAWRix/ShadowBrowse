# ShadowBrowse Architecture

## 1. Overview & Mental Model

ShadowBrowse is designed as a **two-part system** to provide a serious, technically honest privacy layer to Chromium users:

```
                            SHADOWBROWSE
                                 │
                 ┌───────────────┴───────────────┐
                 │                               │
        BROWSER EXTENSION               LOCAL SHADOW AGENT
        (Manifest V3)                   (Python / Rust Daemon)
                 │                               │
        ┌────────┼────────┐              ┌───────┼───────┐
        │        │        │              │       │       │
      Popup  SidePanel Content Script   Tor    Proxy   Privacy
                 │                       │       │     Engine
                 └───────────────┬───────┴───────┘
                                 │
                              INTERNET
```

The user navigates normally until they choose to activate an **Anonymous Session**.
When activated:
- Network traffic routes through Tor SOCKS5 (or local proxy).
- DNS queries resolve remotely over the SOCKS5 circuit.
- WebRTC non-proxied UDP traffic is disabled.
- Ephemeral session cookies, cache, and IndexedDB state are quarantined.
- Fingerprint probes (Canvas, WebGL, WebAudio) are intercepted and normalized.
- Real-time identity warnings alert on account logins.

When the session terminates, all temporary session state is purged.

---

## 2. Browser Extension Components

### A. Background Service Worker (`src/background/`)
- **`privacyController.ts`**: Coordinates the formal state machine (`OFF` -> `STARTING` -> `PROTECTED` / `DEGRADED` / `FAILED` -> `STOPPING` -> `OFF`).
- **`sessionManager.ts`**: Generates cryptographically secure session IDs (`crypto.randomUUID()`) independent of hardware or user details; tracks elapsed time and session-only stats.
- **`networkController.ts`**: Interacts with `chrome.proxy.settings` to enforce SOCKS5 / Tor routing, and manages the fail-closed kill switch.
- **`storageController.ts`**: Enforces WebRTC IP handling (`disable_non_proxied_udp`) and triggers targeted cleanup of session browsing data.
- **`fingerprintController.ts`**: Collects observed probe telemetry and evaluates exposure level (`LOW` | `MEDIUM` | `HIGH`).
- **`eventBus.ts`**: Ephemeral in-memory ring-buffer for security and privacy events.
- **`browserAdapter.ts`**: Clean abstraction over Chromium Manifest V3 APIs.

### B. User Interface
- **Popup (`src/popup/`)**: Compact, cybersecurity-themed interface with immediate status dots, session start/end toggle, live diagnostics, and quick configuration.
- **Side Panel (`src/sidepanel/`)**: Deep companion tool featuring:
  1. **Website Autopsy**: Live inspection of trackers, iframes, cookies, identifier query parameters, and fingerprint probes on the active tab.
  2. **Privacy Assistant**: Local, deterministic security assistant explaining what websites can see and answering risk queries without cloud telemetry.
  3. **Privacy Status**: Detailed layer-by-layer breakdown.
  4. **Security Events**: Live audit log with severity badges.
  5. **System Settings**: Configuration for network modes, kill-switch, and agent credentials.

### C. Content Guard (`src/content/`)
- **`injectGuard.ts`**: Lightweight script running in the `MAIN` world that hooks `toDataURL`, `getImageData`, `getParameter`, and `createOscillator` to detect fingerprinting attempts and postMessage them back to the content script.
- **`contentScript.ts`**: Runs in an `ISOLATED` world, extracts DOM tracker scripts, URL campaign tokens, storage counts, and produces factual autopsy reports.

---

## 3. Local Shadow Agent (`shadow-agent`)

The local daemon (`agent/`) runs as a localhost background service:
- **Localhost Binding**: Binds strictly to `127.0.0.1:<PORT>`.
- **Authentication**: All sensitive commands require a 256-bit cryptographic token (`X-Shadow-Token`), stored with restricted file permissions in `~/.shadowbrowse/agent.token`.
- **Origin Validation**: Rejects requests originating from arbitrary web domains, allowing only `chrome-extension://*` and localhost tools.
- **Rate Limiting**: Throttles requests (max 60/min) to prevent local malware or spam.
- **Network Probing**: Conducts genuine TCP/SOCKS5 handshakes against ports 9050/9150 (Tor) and 8118 (local proxy). Never simulates status.
