# ShadowBrowse — Demonstration Video Narration Script

**Project Title:** ShadowBrowse — Anonymous and Secure Web Browsing Extension  
**Duration:** ~5 Minutes (12 Structured Parts)  
**Format:** Full HD 1080p (1920x1080 @ 24fps MP4)  
**Target Audience:** Academic Evaluators, External Examiners & Project Guides  

---

## Part 1 — Project Overview & Architecture (0:00 – 0:24)

### Visual Cue
- ShadowBrowse extension popup loaded on screen with dark-mode aesthetic.
- Architecture breakdown card displaying: Chromium Manifest V3, Local Privacy Daemon, Tor Onion Routing, and Transparent Privacy Enforcement.

### Spoken Narration
> "Respected evaluators, welcome to the demonstration of ShadowBrowse. ShadowBrowse is an anonymous and secure browsing extension engineered on the modern Chromium Manifest V3 architecture. Unlike conventional extensions that rely on third-party cloud VPNs, ShadowBrowse combines a zero-telemetry client-side extension, a local Python and FastAPI privacy agent binding strictly to loopback, and a local Tor SOCKS5 daemon. This provides true traffic isolation, storage sandboxing, and verifiable onion routing with zero third-party telemetry."

### Key Viva Points
- Pure client-side execution in Chromium Manifest V3.
- No remote cloud analytics, no telemetry, no centralized VPN logging.
- Strict loopback isolation: agent binds exclusively to `127.0.0.1:9152`.

---

## Part 2 — Local Services & Tor Bootstrap (0:24 – 0:48)

### Visual Cue
- PowerShell terminal executing `python scripts/service_manager.py status`.
- Tor Daemon displaying `ONLINE (PID: 13804)`, SOCKS5 port `127.0.0.1:9050`, ControlPort `127.0.0.1:9051`, and Bootstrap status `100% (Done)`.
- Local Privacy Agent displaying `ONLINE (PID: 35568)` on `http://127.0.0.1:9152`.

### Spoken Narration
> "To guarantee complete autonomy, ShadowBrowse manages its own localized networking stack. Using our unified service manager and launcher `START_ALL.bat`, we initialize the packaged Tor executable and FastAPI agent. As shown in the status console, Tor reaches 100% bootstrap on SOCKS5 port 9050 and ControlPort 9051, while our local agent listens on port 9152 with constant-time token verification."

### Key Viva Points
- Port isolation: 9050 (SOCKS5), 9051 (ControlPort), 9152 (Agent).
- Autonomous startup without requiring external system proxy alterations.

---

## Part 3 — Pre-Session Readiness Checklist (0:48 – 1:12)

### Visual Cue
- Pre-Session Readiness Checklist modal displayed over extension interface.
- 4 green verified indicators: Network Stack Integrity, Chromium Proxy API Permissions, Storage Sandbox Isolation, and Tor Circuit Health.

### Spoken Narration
> "In safety-critical privacy engineering, a tool must never route traffic blindly. ShadowBrowse enforces a deterministic Pre-Session Readiness Checklist. Before an anonymous session can be activated, the extension probes the local network stack, confirms Chrome proxy API permissions, verifies ephemeral storage partitioning, and confirms Tor ControlPort readiness. If any dependency is absent, the system prevents route activation."

### Key Viva Points
- Fail-safe design: prevents users from browsing in a false sense of security.
- Comprehensive pre-flight inspection before proxy manipulation.

---

## Part 4 — Private Session Activation (1:12 – 1:36)

### Visual Cue
- User clicks 'Start Private Session'.
- Status transitions to `PROTECTED`, proxy changes to `socks5://127.0.0.1:9050`, WebRTC policy is updated to `disable_non_proxied_udp`, and the fail-closed kill-switch is armed.

### Spoken Narration
> "Activating the private session orchestrates multiple defensive controls with a single click. Chromium's proxy settings are dynamically directed to SOCKS5 port 9050, WebRTC is locked to prevent non-proxied UDP leaks, session storage is partitioned, and our background kill switch is armed to monitor proxy integrity continuously."

### Key Viva Points
- Atomic multi-point configuration in a single user gesture.
- Chrome proxy settings, WebRTC policy, and storage sandbox all engaged concurrently.

---

## Part 5 — Technical Diagnostics & DNS State (1:36 – 2:02)

### Visual Cue
- Side-panel Technical Diagnostics view displaying:
  - Route Verification: `CONFIRMED TOR`
  - DNS Classification: `PARTIAL (SOCKS5 Tor Remote)`
  - WebRTC Policy: `disable_non_proxied_udp`
  - Storage Cleanup: `ISOLATED (ACTIVE)`
  - Detailed diagnostic explanation card.

### Spoken Narration
> "Our Technical Diagnostics view reflects our core philosophy of honest privacy reporting. While Route Verification confirms traffic exits via Tor, DNS classification is transparently reported as PARTIAL. Under Chromium's Manifest V3 architecture, the browser sends unresolved domain names to the Tor SOCKS5 proxy, but extensions cannot inspect the operating system's kernel UDP sockets. Rather than displaying an unverified green badge, ShadowBrowse provides accurate technical telemetry."

### Key Viva Points
- Why DNS is labeled `PARTIAL (SOCKS5 Tor Remote)`: Chromium delegates hostname resolution to Tor proxy (`ATYP 0x03`), but browser extensions lack kernel socket visibility.
- Resolvers seen in third-party leak tests are upstream resolvers of the Tor exit relay, not the user's local ISP.

---

## Part 6 — Website Autopsy (2:02 – 2:28)

### Visual Cue
- Website Autopsy view scanning active tab.
- Displays domain, third-party domain list, known tracking beacons, canvas fingerprint probe detection, and overall Exposure Risk Score.

### Spoken Narration
> "For deep website inspection, ShadowBrowse includes Website Autopsy. Injected into the active tab via content scripts, Autopsy analyzes third-party scripts, audits cookie declarations, detects canvas fingerprint probing such as getImageData calls, and calculates an exposure index. This gives the user clear, real-time insight into the tracking vectors present on any visited site."

### Key Viva Points
- Real-time client-side DOM analysis without external scanning servers.
- Distinguishes heuristic privacy risks from confirmed server-side vulnerabilities.

---

## Part 7 — Local Privacy Assistant (2:28 – 2:54)

### Visual Cue
- Privacy Assistant chat interface in the side panel.
- Assistant answering queries regarding active Tor masking, website exposures, and tracking risks with zero external network requests.

### Spoken Narration
> "ShadowBrowse integrates a local Privacy Assistant directly within the side panel. The assistant evaluates active session telemetry and Website Autopsy reports to answer security questions in real time. Crucially, the assistant operates 100% locally in the browser with zero cloud telemetry, ensuring that privacy questions never leak to external LLM servers."

### Key Viva Points
- Zero cloud transmission: prompts and telemetry remain on-device.
- Context-aware responses based on current session state and tab autopsy.

---

## Part 8 — Security Events Audit Log (2:54 – 3:18)

### Visual Cue
- Security Events timeline displaying chronological audit entries with timestamps: `SESSION_START`, `ROUTE_VERIFIED`, `TRACKER_BLOCKED`, `KILLSWITCH_ARMED`.
- Severity badges (`INFO`, `WARNING`, `CRITICAL`).

### Spoken Narration
> "Accountability requires transparency. The Security Events log provides an immutable, chronological audit trail of all security state transitions. Route verifications, tracker block events, WebRTC policy applications, and kill-switch state updates are recorded with microsecond timestamps and strict redaction of sensitive URLs or tokens."

### Key Viva Points
- Tamper-evident, structured event logging for verifiable forensic audit.
- Strict redaction ensures no private credentials or session secrets enter logs.

---

## Part 9 — Extension Settings & Policy Controls (3:18 – 3:42)

### Visual Cue
- Settings panel showing toggles for Declarative Net Request (DNR) tracker blocking mode (`BLOCK` vs `DETECT`), WebRTC policy enforcement, and Local Agent Token verification.

### Spoken Narration
> "In the Settings panel, users maintain complete authority over defensive policies. Users can configure Declarative Net Request rules to actively block known tracking domains or operate in observation mode. The local agent endpoint and authentication token are managed securely, ensuring that only authorized extension contexts can communicate with the privacy daemon."

### Key Viva Points
- Uses Chromium Declarative Net Request (DNR) rules for high-performance blocking.
- Constant-time token verification prevents unauthorized local access.

---

## Part 10 — Controlled Kill-Switch & Fail-Closed Defense (3:42 – 4:08)

### Visual Cue
- Demonstration of Tor disconnection simulation:
  - Agent detects connection drop.
  - Proxy immediately fails closed to blackhole configuration.
  - Security event logged: `ROUTE_LOST` / `KILLSWITCH_TRIGGERED`.
  - Zero direct IP leakage.

### Spoken Narration
> "The defining hallmark of a serious privacy system is how it responds to failure. When we simulate an abrupt Tor daemon failure, ShadowBrowse's kill switch engages immediately. Rather than silently falling back to an unprotected direct ISP route, traffic is instantly blackholed, failing closed. Traffic cannot flow until the route is either safely recovered or explicitly terminated by the user."

### Key Viva Points
- Prevents silent downgrade attacks: protected sessions fail closed, never open.
- Immediate blackhole proxy configuration stops data egress during circuit drops.

---

## Part 11 — Privacy Philosophy: Honest Diagnostics (4:08 – 4:32)

### Visual Cue
- Comparison card highlighting:
  - No synthetic canvas noise (prevents unique fingerprint entropy).
  - Fingerprint protection labeled `DETECTION ONLY`.
  - Transparent SOCKS5 DNS limitation documentation.

### Spoken Narration
> "ShadowBrowse rejects deceptive security theater. Many commercial tools inject synthetic canvas noise, which ironically makes the browser fingerprint completely unique on tests like EFF Cover Your Tracks. ShadowBrowse labels fingerprint protection honestly as DETECTION ONLY, and documents the exact boundaries of Manifest V3 network routing. We prioritize verifiable engineering over false marketing claims."

### Key Viva Points
- Avoiding canvas noise injection: noise creates high entropy, increasing fingerprint uniqueness.
- Honest academic approach: documenting technical limitations strengthens scientific validity.

---

## Part 12 — Automated Verification & Release Readiness (4:32 – 5:00)

### Visual Cue
- Terminal showing:
  - `python -m pytest tests/ -q` (213 passed in 38.81s)
  - `npm --prefix extension run typecheck` (0 errors)
  - `npm --prefix extension run build` (1,622 modules transformed, built in 2.36s)
- Final closing card with project metadata.

### Spoken Narration
> "In conclusion, ShadowBrowse delivers a verified, robust privacy solution backed by comprehensive automated testing: 213 passing pytest tests, zero TypeScript errors, and a clean production build. The extension, local agent, and Tor integration stand fully verified and ready for demonstration. Thank you."

### Key Viva Points
- 213 passing tests covering security, routing, DNS, API contracts, DNR rules, and packaging.
- Deterministic, repeatable build and clean-install verification.
