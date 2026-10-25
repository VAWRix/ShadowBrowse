# ShadowBrowse — Architecture & Data Flow Specification

**Date:** October 25, 2026  
**Status:** Complete & Audited  
**Architecture Version:** 0.4.5 (Chromium Manifest V3 + Local Python Daemon)  

---

## 1. System Overview & Component Topology

ShadowBrowse divides browser privacy responsibilities into two distinct, loosely coupled tiers:

1. **Manifest V3 Extension Layer (Chromium Client)**
   - Responsible for in-browser telemetry, UI display, declarative request interception, URL parameter sanitization, storage boundary isolation, and Chrome proxy configuration.
2. **Local Shadow Agent Layer (`shadow-agent` Daemon)**
   - Responsible for native OS socket interaction, RFC 1928 SOCKS5 protocol handshakes, Tor Control Port daemon authentication, external route verification, and fail-closed network kill switch enforcement.

```mermaid
graph TD
    subgraph Browser Context
        Tabs["Active Web Page Tabs"]
        Guard["injectGuard.js (MAIN world)"]
        CS["contentScript.ts (ISOLATED world)"]
        DNR["DeclarativeNetRequest Engine"]
        ProxySettings["Chromium Proxy Settings (fixed_servers)"]
        BrowsingData["chrome.browsingData API"]
    end

    subgraph Extension Service Worker
        SW["serviceWorker.ts"]
        PC["PrivacyController"]
        SM["SessionManager"]
        NC["NetworkController"]
        SC["StorageController"]
        TDC["TrackerDefenseController"]
        FC["FingerprintController"]
        EB["EventBus"]
        BA["BrowserAdapter"]
    end

    subgraph User Interfaces
        Popup["Popup UI (380px)"]
        SidePanel["Side Panel Companion (5 Tabs)"]
    end

    subgraph Localhost IPC
        Agent["Local Shadow Agent (FastAPI 127.0.0.1:9152)"]
        Detector["tor/detector.py"]
        Verifier["tor/route_verifier.py"]
        AgentSession["session/manager.py"]
    end

    subgraph Tor & Network Layer
        TorSocks["Tor SOCKS5 Proxy (127.0.0.1:9050)"]
        TorControl["Tor Control Port (127.0.0.1:9051)"]
        Discard["Discard Sink (127.0.0.1:9)"]
        TorNet["Tor Onion Network (3-Hop Circuit)"]
        Internet["Destination Web Server"]
    end

    Guard -->|window.postMessage| CS
    CS -->|chrome.runtime.sendMessage| SW
    Popup <-->|GET/START/END| SW
    SidePanel <-->|GET/START/END/AUTOPY| SW

    SW --> PC
    PC --> SM
    PC --> NC
    PC --> SC
    PC --> TDC
    PC --> FC
    EB -->|Security Events| SidePanel

    NC --> BA
    BA --> ProxySettings
    BA --> BrowsingData
    TDC --> DNR

    PC -->|HTTP / JSON + X-Shadow-Token| Agent
    Agent --> Detector
    Agent --> Verifier
    Agent --> AgentSession

    Detector -->|TCP RFC 1928 Handshake| TorSocks
    Detector -->|Tor Control Protocol| TorControl
    Verifier -->|SOCKS5 Connect Tunnel| TorSocks

    ProxySettings -->|TCP Traffic| TorSocks
    ProxySettings -.->|Kill Switch Discard| Discard
    TorSocks --> TorNet
    TorNet --> Internet
```

---

## 2. Session State Machine & Flow

ShadowBrowse operates a deterministic 6-state lifecycle:

```mermaid
stateDiagram-v2
    [*] --> OFF
    OFF --> STARTING : User clicks "START PRIVATE SESSION"
    
    state STARTING {
        Step1_PreSession : Capture original browser proxy & WebRTC
        Step2_AgentCheck : Query Local Shadow Agent provider
        Step3_VerifyProvider : Verify provider availability
        Step4_EndpointReady : Verify SOCKS5 endpoint
        Step5_ConfigProxy : Configure browser proxy in Chromium
        Step6_VerifyProxy : Verify Chromium proxy configuration
        Step7_AgentRoute : Run agent-side route verification
        Step8_BrowserProbe : Probe browser-side outbound IP
        Step9_ProtectionCheck : Verify protection criteria & fail-closed
        Step10_ActivateShields : Activate storage isolation & WebRTC policy
        
        Step1_PreSession --> Step2_AgentCheck
        Step2_AgentCheck --> Step3_VerifyProvider
        Step3_VerifyProvider --> Step4_EndpointReady
        Step4_EndpointReady --> Step5_ConfigProxy
        Step5_ConfigProxy --> Step6_VerifyProxy
        Step6_VerifyProxy --> Step7_AgentRoute
        Step7_AgentRoute --> Step8_BrowserProbe
        Step8_BrowserProbe --> Step9_ProtectionCheck
        Step9_ProtectionCheck --> Step10_ActivateShields
    }

    STARTING --> PROTECTED : Route & Protections Verified
    STARTING --> FAILED : Tor Offline / Direct Bypass / Verification Failed
    STARTING --> DEGRADED : Route Unverified & Kill Switch Disabled

    PROTECTED --> FAILED : Tor Drops & Kill Switch Enabled
    PROTECTED --> DEGRADED : Tor Drops & Kill Switch Disabled
    
    FAILED --> PROTECTED : Tor Restored & Route Re-verified
    DEGRADED --> PROTECTED : Tor Restored & Route Re-verified

    PROTECTED --> STOPPING : User clicks "END PRIVATE SESSION"
    DEGRADED --> STOPPING : User clicks "END PRIVATE SESSION"
    FAILED --> STOPPING : User clicks "END PRIVATE SESSION"

    state STOPPING {
        RestoreProxy : Restore Pre-Session Proxy & WebRTC
        PurgeStorage : Verified Purge (browsingData.remove since start)
        DeactivateSensors : Deactivate In-Page Fingerprint Hooks
        ClearSession : Destroy Ephemeral Session ID & Stats
        
        RestoreProxy --> PurgeStorage
        PurgeStorage --> DeactivateSensors
        DeactivateSensors --> ClearSession
    }

    STOPPING --> OFF : State cleared & Badge reset
```

---

## 3. Detailed Data Flows

### 3.1 Network Routing Flow

```
[Browser Outbound Request]
       │
       ▼
[Chromium Network Stack]
       │
       ├─► Check Proxy Rules (mode: fixed_servers)
       │     └─► SingleProxy: socks5://127.0.0.1:9050
       │     └─► BypassList: <-loopback>, 127.0.0.1, localhost
       │
       ├─► Remote Hostname Resolution:
       │     Browser sends SOCKS5 CONNECT with ATYP 0x03 (domain name)
       │     Local DNS resolution bypassed; Tor exit node resolves DNS remotely.
       │
       ▼
[Tor Onion Network]
       │
       ▼
[Exit Node] ──► [Target Web Server]
```

### 3.2 Kill-Switch Fail-Closed Flow

When the background service worker or local agent detects that Tor has disconnected during a protected session:
1. `privacyController.ts` transitions state to `FAILED`.
2. `networkController.ts` immediately configures `chrome.proxy.settings` with a SOCKS5 blackhole pointing to `127.0.0.1:9` (IANA discard port).
3. The bypass list preserves `127.0.0.1` and `localhost` so the extension can continue monitoring the local agent daemon on port 9152.
4. All web traffic outbound from Chromium fails instantly with hard socket connection errors. Direct internet fallback is strictly prevented.
5. `EventBus` emits a `CRITICAL` kill-switch activation event.

### 3.3 Storage Cleanup Flow

Unlike operating system containers, Chromium extension APIs do not permit per-tab storage virtualization. ShadowBrowse solves this via strict lifecycle boundaries:

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant PC as PrivacyController
    participant SC as StorageController
    participant Browser as Chrome BrowsingData API
    participant Store as Browser Cookies / Storage

    User->>PC: Start Anonymous Session
    PC->>SC: activateIsolation()
    SC->>SC: Record sessionStartTime = Date.now()
    Note over SC,Store: User browses normally. Cookies & data written to origin stores.

    User->>PC: End Anonymous Session
    PC->>SC: deactivateAndClean()
    SC->>Browser: chrome.browsingData.remove({ since: sessionStartTime }, { cache, cookies, localStorage, serviceWorkers, indexedDB })
    Browser->>Store: Delete all entries created >= sessionStartTime
    Browser-->>SC: completion callback
    alt Cleanup Succeeded
        SC-->>PC: verified: true
        PC->>PC: emit INFO: Storage purged and verified
    else Cleanup Failed
        SC-->>PC: verified: false
        PC->>PC: emit CRITICAL: Storage cleanup failed. Manual clearing advised.
    end
```

### 3.4 Tracking Mitigation Flow

```
1. Navigation URL: https://shop.example/product?id=123&utm_source=ad&gclid=xyz
2. Content Script executes at document_start
3. contentScript.ts queries trackingParamMode setting
4. Mode == SANITIZE:
   - Separates functional keys (id=123) from tracking keys (utm_source, gclid)
   - Executes window.history.replaceState('', '', '/product?id=123')
   - URL updated in address bar without page reload
   - Emits TRACKING_PARAM INFO event
5. Outbound Subresource Requests:
   - Evaluated by DeclarativeNetRequest dynamic rules (IDs 101-402)
   - Matches google-analytics.com or doubleclick.net? Blocked natively before network dispatch.
   - Matches cdnjs.cloudflare.com or api.stripe.com? Allowed by safe whitelist policy.
```

### 3.5 Security Events & UI Communication Flow

```
In-Page Probe (injectGuard)
   │ window.postMessage
   ▼
Content Script (contentScript.ts)
   │ chrome.runtime.sendMessage({ type: 'PAGE_SECURITY_EVENT' })
   ▼
Service Worker (serviceWorker.ts)
   │ EventBus.getInstance().emit()
   ▼
EventBus (In-Memory Buffer, max 100 items)
   │ Subscriptions / Polling via GET_SECURITY_EVENTS
   ▼
SidePanel SecurityEventsView.tsx / Autopsy.tsx / Chat.tsx
```

---

## 4. Trust Boundaries & Security Model

| Boundary | Threat Vector | Mitigation Mechanism |
| :--- | :--- | :--- |
| **Untrusted Web Page ──► In-Page Guard** | Malicious script tampering with hooks or prototype poisoning | Guard runs inside IIFE, sets non-configurable flag, handles errors quietly. |
| **In-Page Guard ──► Content Script** | Malicious script sending fake `window.postMessage` events | Content script verifies `event.source === window` and checks secret payload tag `SHADOWBROWSE_PAGE_SIGNAL`. |
| **Content Script ──► Background Service Worker** | Injected script flooding messages or forging sensitive actions | Service worker only accepts defined message types (`PAGE_SECURITY_EVENT`, `ANALYZE_CURRENT_TAB`); sensitive session start/stop and settings changes require extension popup/sidepanel contexts. |
| **Web Origin ──► Local Shadow Agent** | Drive-by CSRF / DNS rebinding attacks from public websites | Agent checks `request.client.host in {'127.0.0.1', '::1', 'localhost'}` and enforces strict Origin/Referer regex permitting only `chrome-extension://[a-z]{32}` or localhost tools. All external web origins rejected with 403. |
| **Local Script ──► Local Shadow Agent** | Unauthorized local process invoking agent control APIs | All sensitive endpoints (`/session/*`, `/tor/verify-route`, `/diagnostics`) require 256-bit random cryptographic bearer token in `X-Shadow-Token` header, validated with `hmac.compare_digest`. Query parameter fallback prohibited. |
| **Chromium ──► Tor Route** | Accidental direct bypass when Tor circuit fails | Fail-closed kill switch binds Chromium proxy to `127.0.0.1:9` discard sink; verified by route comparison checks. |
