# ShadowBrowse Threat Model

This document outlines the threat actors, protected vectors, unprotectable vectors, and residual risks in ShadowBrowse.

---

## 1. Threat Actors & Scenarios

| Threat Actor | Capabilities & Techniques | ShadowBrowse Protection | What Cannot Be Protected |
| :--- | :--- | :--- | :--- |
| **Cross-Site Ad Trackers** | Third-party cookies, tracking pixels, persistent click parameters (`fbclid`, `gclid`), fingerprinting. | Session cookies cleared on exit; identifier query params flagged in Autopsy; canvas/WebGL probing detected and normalized. | Direct first-party account tracking if the user voluntarily logs into the same account across sessions. |
| **Network / ISP Observers** | Passive eavesdropping on DNS queries, TLS Server Name Indication (SNI), and destination IP addresses. | Traffic routed through Tor SOCKS5; DNS queries resolved remotely over Tor circuit; direct ISP view blocked. | Traffic before reaching Tor entry guard; malicious Tor exit nodes inspecting unencrypted HTTP payloads (HTTPS mitigates this). |
| **Fingerprinting Scripts** | Canvas readback, WebGL hardware probes, AudioContext synthesis, font enumeration. | Active detection in `injectGuard.js`; normalization heuristics; factual exposure level calculation. | Browser build characteristics inherent to Chromium (e.g. V8 engine quirks, CSS feature support). |
| **WebRTC Leakage** | STUN/TURN binding requests to discover host/LAN IP addresses behind proxies or NAT. | WebRTC IP handling policy locked to `disable_non_proxied_udp`. | Legitimate WebRTC video calls will be disabled or routed via relay, potentially degrading call latency. |
| **Voluntary Identity Leakage** | User logs into Google, Microsoft, Facebook, or enters billing address / phone number on web forms. | Real-time warnings when sensitive authentication domains are visited during Anonymous Mode. | ShadowBrowse **cannot** prevent a site from knowing who you are if you enter your credentials. |
| **Malicious Webpages targeting Agent** | CSRF / fetch requests to `http://127.0.0.1:<PORT>` attempting to reconfigure proxy or inspect status. | Agent validates origin header (rejects arbitrary web origins), enforces `X-Shadow-Token`, and rate-limits. | Compromised local applications already running with user privileges on the host OS. |

---

## 2. Residual Risks & Technical Honesty

1. **Chromium Engine Uniformity**: An extension running on Chromium cannot alter low-level C++ rendering pipelines or V8 engine micro-architectural timings. Unlike the Tor Browser (built on a heavily modified Firefox ESR codebase), Chromium has distinct architectural boundaries.
2. **Voluntary Authentication**: Anonymity at the network layer is instantly negated at the application layer if a user signs in.
3. **Exit Node Vulnerabilities**: Exit nodes in Tor can observe destination IPs and intercept plain HTTP. ShadowBrowse expects HTTPS for end-to-end transport confidentiality.
