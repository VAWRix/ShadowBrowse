# ShadowBrowse Privacy Model

## 1. Core Principles

ShadowBrowse strictly enforces **Privacy by Design**:
1. **Data Minimization**: Collect only the bare minimum diagnostic signals required to execute privacy protections.
2. **Local-First Architecture**: All telemetry, autopsy evidence, and assistant logic execute locally on the user's workstation.
3. **No Persistent History**: ShadowBrowse never maintains a persistent database of browsing URLs, search queries, or form inputs.
4. **No External Analytics**: No Google Analytics, no telemetry beacons, no cloud profiling.
5. **No Selling / Sharing**: Zero external endpoints receive user browsing metadata.
6. **Technical Honesty**: Never display "100% Anonymous" or simulate Tor connectivity. If Tor is offline, the status explicitly reads `NOT AVAILABLE` or `DEGRADED`.

---

## 2. Ephemeral Session Lifecycle

```
        USER ACTION: Start Anonymous Session
                         │
                         ▼
        1. Generate Cryptographic UUID (crypto.randomUUID())
           - Independent of MAC, IP, hardware, or username.
        2. Set Proxy to 127.0.0.1:9050 (Tor SOCKS5 with remote DNS).
        3. Lock WebRTC IP Policy: disable_non_proxied_udp.
        4. Enable in-page fingerprint detection & normalization.
        5. Initialize in-memory session event ring-buffer.
                         │
                         ▼
        USER BROWSES NORMALLY
        (Live evidence gathered in-memory; no URLs persisted to disk)
                         │
                         ▼
        USER ACTION: End Anonymous Session
                         │
                         ▼
        1. Revert Proxy Settings back to Direct / System Default.
        2. Restore WebRTC Policy to standard.
        3. Clear Session Browsing Data:
           - Remove cookies created during session.
           - Purge session cache, localStorage, and IndexedDB.
        4. Clear in-memory event buffer.
        5. Destroy ephemeral Session UUID.
```

---

## 3. Privacy Assistant Confidentiality

The Privacy Assistant embedded in the Side Panel operates entirely locally:
- Uses deterministic rule evaluation and live in-memory autopsy evidence.
- Never transmits prompt text or page contents to cloud LLMs by default.
- Rejects any command to log or upload history.
