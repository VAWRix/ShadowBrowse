"""
ShadowBrowse — Complete Viva Questions and Answers Generator
Produces: submission/ShadowBrowse_Viva_Questions_and_Answers.docx
Contains 55+ in-depth, technically rigorous viva questions and answers organized across 10 core engineering topics.
"""

import os
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

SUBMISSION_DIR = os.path.abspath("submission")
OUTPUT_DOCX = os.path.join(SUBMISSION_DIR, "ShadowBrowse_Viva_Questions_and_Answers.docx")

COLOR_PRIMARY = RGBColor(15, 23, 42)
COLOR_SECONDARY = RGBColor(79, 70, 229)
COLOR_MUTED = RGBColor(100, 116, 139)
COLOR_BODY = RGBColor(51, 65, 85)
HEX_ACCENT_BG = "EEF2FF"

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=80, bottom=80, left=140, right=140):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(f'''
        <w:tcMar {nsdecls("w")}>
            <w:top w:w="{top}" w:type="dxa"/>
            <w:bottom w:w="{bottom}" w:type="dxa"/>
            <w:left w:w="{left}" w:type="dxa"/>
            <w:right w:w="{right}" w:type="dxa"/>
        </w:tcMar>
    ''')
    tcPr.append(tcMar)

doc = docx.Document()
for section in doc.sections:
    section.top_margin = Inches(1.0)
    section.bottom_margin = Inches(1.0)
    section.left_margin = Inches(1.0)
    section.right_margin = Inches(1.0)

# Title Header
p_title = doc.add_paragraph()
p_title.paragraph_format.space_before = Pt(12)
p_title.paragraph_format.space_after = Pt(4)
r_t = p_title.add_run("SHADOWBROWSE — COMPREHENSIVE VIVA VOCE EXAMINATION GUIDE")
r_t.bold = True
r_t.font.name = "Arial"
r_t.font.size = Pt(18)
r_t.font.color.rgb = COLOR_PRIMARY

p_sub = doc.add_paragraph()
p_sub.paragraph_format.space_after = Pt(16)
r_sub = p_sub.add_run("55+ Technical Questions, In-Depth Answers, Architectural Defenses, and Evaluator Follow-Ups")
r_sub.font.name = "Arial"
r_sub.font.size = Pt(11)
r_sub.font.italic = True
r_sub.font.color.rgb = COLOR_MUTED

p_meta = doc.add_paragraph()
p_meta.paragraph_format.space_after = Pt(18)
r_m = p_meta.add_run(
    "Course: Bachelor of Technology / Engineering in Computer Science & Engineering\n"
    "Subject: Final Year Capstone Project Viva Voce Examination (2025–2026)\n"
    "Candidate: [Student Name: _______________________]  |  Roll No: [___________]\n"
    "Institution: [Department of Computer Science & Engineering, College Name]"
)
r_m.font.name = "Arial"
r_m.font.size = Pt(10)
r_m.font.color.rgb = COLOR_BODY

def add_qa(doc, q_num, question, answer, follow_up=None):
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = docx.enum.table.WD_TABLE_ALIGNMENT.CENTER
    cell = tbl.cell(0, 0)
    set_cell_background(cell, "F8FAFC")
    set_cell_margins(cell, top=100, bottom=100, left=140, right=140)
    
    tcPr = cell._tc.get_or_add_tcPr()
    borders = parse_xml(f'''
        <w:tcBorders {nsdecls("w")}>
            <w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
            <w:left w:val="single" w:sz="18" w:space="0" w:color="4F46E5"/>
            <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
            <w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        </w:tcBorders>
    ''')
    tcPr.append(borders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.15
    rq_num = p.add_run(f"Q{q_num}: ")
    rq_num.bold = True
    rq_num.font.name = "Arial"
    rq_num.font.size = Pt(10.5)
    rq_num.font.color.rgb = COLOR_SECONDARY
    
    rq_txt = p.add_run(question)
    rq_txt.bold = True
    rq_txt.font.name = "Arial"
    rq_txt.font.size = Pt(10.5)
    rq_txt.font.color.rgb = COLOR_PRIMARY
    
    p_ans = cell.add_paragraph()
    p_ans.paragraph_format.space_after = Pt(4)
    p_ans.paragraph_format.line_spacing = 1.15
    ra_lbl = p_ans.add_run("Answer: ")
    ra_lbl.bold = True
    ra_lbl.font.name = "Arial"
    ra_lbl.font.size = Pt(10)
    ra_lbl.font.color.rgb = COLOR_PRIMARY
    
    ra_txt = p_ans.add_run(answer)
    ra_txt.font.name = "Arial"
    ra_txt.font.size = Pt(10)
    ra_txt.font.color.rgb = COLOR_BODY
    
    if follow_up:
        p_fu = cell.add_paragraph()
        p_fu.paragraph_format.space_after = Pt(2)
        p_fu.paragraph_format.line_spacing = 1.15
        rf_lbl = p_fu.add_run("Examiner Follow-Up / Deep Dive: ")
        rf_lbl.bold = True
        rf_lbl.font.name = "Arial"
        rf_lbl.font.size = Pt(9.5)
        rf_lbl.font.color.rgb = RGBColor(180, 83, 9) # Amber
        rf_txt = p_fu.add_run(follow_up)
        rf_txt.font.name = "Arial"
        rf_txt.font.size = Pt(9.5)
        rf_txt.font.italic = True
        rf_txt.font.color.rgb = COLOR_BODY

    doc.add_paragraph().paragraph_format.space_after = Pt(6)

def add_category(doc, cat_num, cat_title):
    p = doc.add_paragraph()
    p.paragraph_format.keep_with_next = True
    p.paragraph_format.space_before = Pt(18)
    p.paragraph_format.space_after = Pt(6)
    r = p.add_run(f"CATEGORY {cat_num}: {cat_title.upper()}")
    r.bold = True
    r.font.name = "Arial"
    r.font.size = Pt(13)
    r.font.color.rgb = COLOR_PRIMARY

# -------------------------------------------------------------
# CATEGORY 1: PROJECT OVERVIEW & MOTIVATION
# -------------------------------------------------------------
add_category(doc, 1, "Project Overview and Motivation")

add_qa(doc, 1, "What is ShadowBrowse in simple terms, and what core problem does it solve?",
    "ShadowBrowse is a privacy-preserving browser extension engineered for Chromium-based browsers under Manifest V3. "
    "It addresses the multi-layered surveillance of modern web browsing by coupling client-side DOM fingerprinting defenses "
    "with a local loopback companion daemon (shadow-agent) and a native Tor SOCKS5 routing engine. It solves the dilemma where "
    "users previously had to choose between clunky standalone browsers (Tor Browser) or centralized, unverifiable commercial VPN extensions.",
    "Why not just tell users to use Incognito mode? Because Incognito only prevents local history writes; it provides zero network IP masking, zero DNS protection, and exposes identical canvas/hardware fingerprints."
)

add_qa(doc, 2, "How does ShadowBrowse differ from a standard commercial VPN browser extension?",
    "Commercial VPN extensions are single-hop proxies connected to centralized proprietary servers whose logging policies cannot "
    "be audited. If the VPN proxy disconnects, traffic often leaks to the direct ISP connection. Furthermore, standard VPNs do nothing "
    "to mitigate active HTML5 canvas or audio fingerprinting. ShadowBrowse routes traffic through decentralized multi-hop Tor onion "
    "circuits, performs out-of-band cryptographic exit verification, actively injects noise into DOM canvas APIs, and enforces an "
    "instant fail-closed discard kill switch (127.0.0.1:9) on daemon failure.",
    "What is the performance trade-off between Tor and a VPN? Tor introduces higher latency (typically 200–800ms) due to 3-hop onion encryption and relay bandwidth, whereas commercial VPNs offer lower latency at the expense of centralizing trust."
)

add_qa(doc, 3, "Why was the Chromium ecosystem chosen over Firefox for this implementation?",
    "Chromium (Google Chrome, Brave, Microsoft Edge, Opera) powers over 70% of global desktop web traffic. While Tor Browser already "
    "exists for Firefox, forcing users to abandon Chromium severely limits privacy adoption. Bringing native Tor SOCKS5 routing and "
    "fingerprint defenses into Chromium provides privacy to the vast majority of web users without disrupting their daily productivity extensions.",
    "What architectural challenge did Chromium present? Manifest V3 deprecated the blocking webRequest API, forcing us to use declarative proxy rules and an asynchronous Background Service Worker."
)

add_qa(doc, 4, "What are the primary attack vectors ShadowBrowse defends against?",
    "ShadowBrowse defends against four distinct attack vectors: (1) Network IP Geolocation & Correlation (mitigated via Tor SOCKS5 routing); "
    "(2) Stateless Device Fingerprinting (mitigated via injectGuard.js canvas/WebGL micro-noise); (3) Link Decoration & Campaign Tracking "
    "(mitigated via automatic stripping of gclid, fbclid, and utm_* query parameters); and (4) Silent Proxy Drops (mitigated via the fail-closed kill switch).",
    "Does ShadowBrowse protect against malware downloaded by the user? No, downloaded executables operate outside the browser sandbox and fall under operating system antivirus defenses."
)

add_qa(doc, 5, "What is the role of the local agent, and why couldn't the extension do everything alone?",
    "Chromium extensions execute within a sandboxed browser environment where Chrome APIs forbid binding raw TCP listening ports, "
    "executing shell processes, or opening direct raw socket connections to the Tor ControlPort. The local companion agent (shadow-agent), "
    "running on 127.0.0.1:9152, acts as a high-privilege networking helper that independently verifies Tor SOCKS5 connectivity, checks "
    "ControlPort bootstrap status, and queries external route verification endpoints out-of-band.",
    "Doesn't running a local agent create a security risk? It would if exposed to the network. We mitigate this by binding strictly to loopback (127.0.0.1), rejecting non-loopback Host headers, and requiring HMAC-SHA256 token authentication."
)

# -------------------------------------------------------------
# CATEGORY 2: ARCHITECTURE & MODULE INTERACTIONS
# -------------------------------------------------------------
add_category(doc, 2, "Architecture and Module Interactions")

add_qa(doc, 6, "Explain the two-tier coordinated architecture of ShadowBrowse.",
    "ShadowBrowse divides responsibilities across two tiers: Tier 1 is the Chromium Browser Context (Manifest V3), comprising the "
    "Background Service Worker, Content Scripts (injectGuard.js), and React 18 UI views (Popup & SidePanel). Tier 2 is the Local Daemons Context, "
    "comprising the local Python FastAPI agent (shadow-agent on port 9152) and the native Tor 0.4.8.14 daemon (SOCKS5 on port 9050, ControlPort on port 9051). "
    "The extension configures Chromium's proxy to route web traffic through Tor, while communicating with the agent over authenticated loopback HTTP for health and route audits.",
    "How does data flow when a user loads https://example.com? The browser socket connects to 127.0.0.1:9050 over SOCKS5. Tor encrypts the HTTP request in 3 layers of onion routing and forwards it through Guard, Middle, and Exit relays to example.com."
)

add_qa(doc, 7, "How do the Background Service Worker and Content Scripts communicate?",
    "They communicate via Chromium's chrome.runtime.sendMessage and chrome.runtime.onMessage APIs. When injectGuard.js in a page frame "
    "detects a canvas or WebGL access, it dispatches an in-page signal to contentScript.ts, which validates the signal and forwards a "
    "structured PRIVACY_EVENT payload to the service worker. The service worker passes it to the PrivacyEventEngine for sanitization and storage.",
    "How do you prevent a malicious page from flooding the worker? contentScript.ts rate-limits events to 5 per second, bounds string detail lengths to 128 characters, and restricts signal types to a strict Set(['CANVAS', 'WEBGL', 'AUDIO'])."
)

add_qa(doc, 8, "What is the function of NetworkController.ts versus PrivacyController.ts?",
    "NetworkController.ts is the low-level proxy abstraction layer. It directly interacts with chrome.proxy.settings, snapshotting baseline "
    "proxy configurations, applying fixed_servers rules (socks5://127.0.0.1:9050), and setting discard blackholes. PrivacyController.ts is "
    "the higher-level session state machine (DISCONNECTED, CONNECTING, PROTECTED, FAILED, RESTORING) that coordinates the 10-step startup, "
    "monitors agent heartbeat polling, and triggers NetworkController when a state change is required.",
    "Why separate them? Separation of concerns: NetworkController knows how to interact with the Chrome proxy API; PrivacyController knows business logic and failure recovery."
)

add_qa(doc, 9, "How does the 4-way companion grid coordinate between Popup and SidePanel?",
    "The extension implements deep-linking using chrome.sidePanel.open and internal hash navigation. When a user clicks 'Autopsy', 'Events', "
    "or 'Settings' in the Popup toolbar, the background script opens the SidePanel and dispatches a navigation event that switches the active "
    "tab in the SidePanel's React state, eliminating orphaned routes and ensuring a unified user experience.",
    "Why not just show everything in the Popup? Popups automatically close whenever the user clicks outside them. The SidePanel remains persistent, allowing users to monitor live privacy telemetry while actively browsing."
)

add_qa(doc, 10, "What happens if the service worker goes dormant during an active session?",
    "Manifest V3 service workers are ephemeral and terminate after 30 seconds of inactivity. ShadowBrowse uses chrome.alarms ('heartbeat_poll', "
    "periodInMinutes: 0.1) to periodically wake the service worker. Crucially, Chrome maintains active proxy rules in browser memory even if the "
    "worker sleeps. Upon waking, the worker re-hydrates its session state from chrome.storage.local and resumes health polling seamlessly.",
    "What happens if storage is corrupted during sleep? The rehydration routine validates state against a fallback schema; if corrupt, it defaults to a safe disconnected state and prompts the user."
)

# -------------------------------------------------------------
# CATEGORY 3: REACT, TYPESCRIPT & UI CONCEPTS
# -------------------------------------------------------------
add_category(doc, 3, "React, TypeScript and Extension UI Concepts")

add_qa(doc, 11, "Why was React 18 chosen for the extension UI?",
    "React 18 provides a declarative component model with fast virtual DOM reconciliation. In an extension that continuously ingests "
    "privacy events and updates risk scores, React's state management ensures that metric badges, timeline feeds, and connection indicators "
    "re-render reactively without manual DOM manipulation or memory leaks.",
    "Did you use external component libraries like Material UI or Ant Design? No, we built custom vanilla CSS components with Tailwind-inspired design tokens to minimize bundle size, eliminate third-party dependencies, and maintain full aesthetic control."
)

add_qa(doc, 12, "How is TypeScript utilized to ensure system reliability?",
    "TypeScript 5.5 enforces strict compile-time type safety across all interfaces. We defined explicit union types for session states "
    "('DISCONNECTED' | 'CONNECTING' | 'PROTECTED' | 'FAILED' | 'RESTORING'), typed event payloads (PrivacyEvent), and strict message envelopes. "
    "This prevents runtime 'undefined is not a function' errors and guarantees that message handlers handle all enumerated cases.",
    "What command verifies TypeScript correctness? 'npm --prefix extension run typecheck', which executes tsc --noEmit and asserts zero compile errors."
)

add_qa(doc, 13, "How does the UI handle accessibility (WCAG) and keyboard navigation?",
    "The UI implements full WCAG 2.1 Level AA compliance: all interactive elements feature explicit :focus-visible cyan/indigo focus rings; "
    "navigation tabs use proper ARIA roles (role='tab', role='tabpanel', aria-selected); modal dialogs trap keyboard focus and support Escape-key "
    "dismissal; and CSS includes @media (prefers-reduced-motion) overrides to disable animations for motion-sensitive users.",
    "How was accessibility tested? Via automated CDP scripts asserting the presence of 24 interactive ARIA elements and manual keyboard Tab-navigation validation."
)

add_qa(doc, 14, "What is the purpose of ReadinessModal.tsx?",
    "ReadinessModal.tsx is an authoritative first-run onboarding checklist. It executes an interactive 6-point audit verifying: (1) Runtime "
    "environment, (2) Local Agent reachability, (3) Tor SOCKS5 availability, (4) Out-of-band route verification, (5) Kill-switch readiness, and "
    "(6) Privacy audit engine persistence. It prevents false assumptions of security by preventing users from assuming protection is active when daemons are offline.",
    "Can the user revisit the modal after first run? Yes, it is permanently accessible via the 'System Health & Readiness' button in Settings or SidePanel."
)

add_qa(doc, 15, "How does Vite optimize the production bundle?",
    "Vite 6.4.3 utilizes Rollup under the hood. It performs static analysis and dead-code elimination (tree-shaking), bundling 1624 source modules "
    "into compact chunks. We configured vite.config.ts with sourcemap: false to ensure zero .map files are emitted in production, preventing "
    "source-code leakage.",
    "What is the total size of extension/dist? Approximately 350 KB, rendering it lightweight and instant to load."
)

# -------------------------------------------------------------
# CATEGORY 4: MANIFEST V3 & EXTENSION PERMISSIONS
# -------------------------------------------------------------
add_category(doc, 4, "Manifest V3, Service Workers and Content Scripts")

add_qa(doc, 16, "What is Manifest V3, and why did Google mandate it?",
    "Manifest V3 is the modern Google Chrome extensions specification. Google mandated it to improve security, privacy, and performance by "
    "replacing persistent background pages with ephemeral Service Workers, disallowing remotely hosted code (requiring all scripts to be bundled), "
    "and deprecating the blocking webRequest API in favor of declarativeNetRequest.",
    "How does MV3 affect ShadowBrowse? It prevents us from synchronously blocking web requests in JavaScript. Instead, we use chrome.proxy to set declarative SOCKS5 rules and injectGuard.js at document_start for client-side DOM defenses."
)

add_qa(doc, 17, "What specific Chrome extension permissions does ShadowBrowse require, and why?",
    "ShadowBrowse declares minimal required permissions in manifest.json: (1) 'proxy' (to set fixed_servers SOCKS5 and discard blackhole rules); "
    "(2) 'storage' (to persist typed privacy events, session state, and auth tokens); (3) 'alarms' (to schedule periodic heartbeat wakeups for the service worker); "
    "(4) 'sidePanel' (to render the persistent companion UI); and (5) 'privacy' (to toggle webRTCIPHandlingPolicy to disable_non_proxied_udp).",
    "Did you request '<all_urls>' permissions? We declare host_permissions for '<all_urls>' strictly to allow injectGuard.js content script injection into web frames at document_start for canvas protection."
)

add_qa(doc, 18, "How does messageSecurity.ts enforce extension privilege boundaries?",
    "In Manifest V3, content scripts run in web page contexts and can send messages to the background worker. messageSecurity.ts inspects "
    "sender.id to ensure it matches chrome.runtime.id. Furthermore, it inspects sender.url: if sender.tab is present, it verifies that "
    "sender.url starts with 'chrome-extension://' + chrome.runtime.id. If an untrusted web page content script attempts to invoke a privileged "
    "action like 'START_SESSION' or 'RESTORE_PROXY', the request is rejected immediately with an authorization error.",
    "Why was this necessary? Without this check, a malicious web page could exploit chrome.runtime.sendMessage to turn off the user's proxy or trigger false state changes."
)

add_qa(doc, 19, "What is injectGuard.js and how does it execute at document_start?",
    "injectGuard.js is a lightweight content script registered in manifest.json with run_at: 'document_start' and all_frames: true. "
    "It executes before the web page's DOM or external tracking scripts have loaded. It immediately monkey-patches prototype methods on "
    "HTMLCanvasElement.prototype and WebGLRenderingContext.prototype, ensuring that any subsequent tracking script receives randomized micro-noise.",
    "Can a web page un-patch your modifications? If a page accesses prototypes before our script runs, it could bypass defenses. Running at document_start in the extension context ensures our patch executes first."
)

add_qa(doc, 20, "What Content Security Policy (CSP) is declared in manifest.json?",
    "Manifest V3 enforces a strict Content Security Policy: script-src 'self'; object-src 'none'; base-uri 'none'. This strictly forbids "
    "eval(), inline script execution, or loading scripts from remote CDNs. All JavaScript executed by ShadowBrowse is packaged locally within the extension bundle.",
    "How does this enhance security? It completely mitigates Cross-Site Scripting (XSS) within the extension's privileged pages."
)

# -------------------------------------------------------------
# CATEGORY 5: FASTAPI, IPC & AUTHENTICATION
# -------------------------------------------------------------
add_category(doc, 5, "FastAPI Agent, Local IPC and Token Protection")

add_qa(doc, 21, "Why does the agent bind strictly to 127.0.0.1 instead of 0.0.0.0?",
    "Binding to 0.0.0.0 would expose the agent's REST endpoints to the local area network (LAN), allowing other devices on the same Wi-Fi "
    "to probe the user's proxy status or trigger route verifications. Binding strictly to 127.0.0.1 (IPv4 loopback) restricts network communication "
    "entirely to local processes on the same machine.",
    "How is this enforced in code? In main.py, an assertion 'assert host in [\"127.0.0.1\", \"localhost\"]' aborts execution immediately if any external binding is attempted."
)

add_qa(doc, 22, "How does the agent prevent DNS rebinding attacks?",
    "In a DNS rebinding attack, an attacker controls a public domain (e.g., attacker.com) whose DNS TTL is short. After the browser loads the page, "
    "the DNS resolves to 127.0.0.1, allowing attacker scripts to send requests to the local agent. ShadowBrowse defends against this in main.py "
    "middleware by inspecting the HTTP 'Host' header. If the Host header does not match '127.0.0.1:9152' or 'localhost:9152', the request is "
    "rejected immediately with HTTP 403 Forbidden.",
    "Can CORS prevent DNS rebinding? No, CORS headers are evaluated by the browser after the server responds; Host header validation blocks the request at the server before processing."
)

add_qa(doc, 23, "How does token authentication work between the extension and agent?",
    "On initial boot, auth.py generates a 256-bit cryptographically secure random hexadecimal token (secrets.token_hex(32)) and saves it to "
    "a protected file (~/.shadowbrowse/agent.token) with user-only read permissions. The user enters this token into extension Settings (or it is "
    "pre-configured). For every privileged REST call, the extension includes the header 'X-Shadow-Token'. The agent validates this token using "
    "hmac.compare_digest(provided_token, expected_token).",
    "Why use hmac.compare_digest instead of standard '==' string comparison? Standard string comparison exits early on the first mismatched character, creating a timing side-channel that allows attackers to brute-force tokens. hmac.compare_digest executes in constant time."
)

add_qa(doc, 24, "What is the purpose of the sliding-window rate limiter in rate_limiter.py?",
    "The rate limiter prevents local Denial of Service (DoS). If a compromised background tab attempts to spam the agent with thousands of "
    "rapid requests to exhaust CPU or memory, the sliding window tracks request timestamps and caps throughput at 60 requests per minute in production, "
    "returning HTTP 429 Too Many Requests when breached.",
    "Why did you relax the rate limiter in test mode? In test mode (SHADOWBROWSE_TEST_MODE=1), our automated test runner executes over 200 tests in under 20 seconds. Capping at 60 req/min would cause false test failures, so test mode permits 10,000 req/min."
)

add_qa(doc, 25, "What payload bounding limits are enforced by the agent?",
    "In main.py, middleware inspects the Content-Length header. If any request body exceeds 1,048,576 bytes (1 MB), the agent aborts processing "
    "with HTTP 413 Payload Too Large. This prevents memory exhaustion attacks via oversized JSON payloads.",
    "What endpoints exist on the agent? GET /api/v1/status (health check), POST /api/v1/verify-route (out-of-band egress check), GET /api/v1/tor/status (SOCKS5/ControlPort audit), and POST /api/v1/session/start and end."
)

# -------------------------------------------------------------
# CATEGORY 6: SOCKS5, TOR ROUTING & DNS
# -------------------------------------------------------------
add_category(doc, 6, "SOCKS5, Tor Routing and DNS Resolution")

add_qa(doc, 26, "What is SOCKS5, and how does ShadowBrowse use it?",
    "SOCKS5 (defined in RFC 1928) is a generic proxy protocol that routes arbitrary TCP/UDP packets through an intermediary. ShadowBrowse "
    "configures Chromium's proxy settings to fixed_servers targeting socks5://127.0.0.1:9050. All browser HTTP and HTTPS requests are encapsulated "
    "into SOCKS5 packets and delivered to the local Tor daemon, which forwards them over onion circuits.",
    "What is the RFC 1928 handshake sequence? Client sends 0x05 (version) 0x01 (one auth method) 0x00 (no authentication). The Tor server responds with 0x05 0x00, confirming ready state."
)

add_qa(doc, 27, "How does ShadowBrowse prevent DNS leaks?",
    "A major flaw in naive proxy extensions is that the browser resolves domain names locally via the operating system's DNS before connecting "
    "to the proxy, leaking the target website to the user's ISP. ShadowBrowse uses SOCKS5 with remote DNS resolution (rdns=True). In SOCKS5, "
    "the client passes domain names (ATYP 0x03) rather than resolved IP addresses. The exit node in the Tor circuit performs the DNS lookup, "
    "guaranteeing that local ISPs see zero DNS requests.",
    "Can you inspect or control raw kernel UDP DNS requests in Chrome MV3? No, extensions cannot inspect raw kernel sockets. We honestly document this as an accepted boundary and classify DNS in diagnostics as PARTIAL."
)

add_qa(doc, 28, "How does out-of-band route verification work in route_verifier.py?",
    "Rather than trusting local proxy state, route_verifier.py opens an independent asynchronous HTTP session (using aiohttp and aiohttp-socks) "
    "configured to route over socks5://127.0.0.1:9050 with rdns=True. It queries the official endpoint https://check.torproject.org/api/ip. "
    "The Tor Project compares the incoming IP against its live directory consensus of exit relays and returns a JSON payload: {\"IsTor\": true, \"IP\": \"...\"}. "
    "The agent confirms IsTor==true and verifies that the IP differs from the baseline direct IP.",
    "What happens if check.torproject.org is unreachable? The verifier falls back to secondary trusted endpoints or reports UNVERIFIED/PARTIAL evidence level, never claiming false success."
)

add_qa(doc, 29, "What is the Tor ControlPort, and what is it used for?",
    "The Tor ControlPort (listening on 127.0.0.1:9051) allows external controller applications to communicate with the running Tor process. "
    "ShadowBrowse's detector.py connects to port 9051, authenticates, and queries 'GETINFO status/bootstrap-phase'. This allows the agent to "
    "monitor the exact percentage of circuit construction (from 0% directory loading to 100% circuit established).",
    "Can the ControlPort change circuits? Yes, dispatching the signal 'SIGNAL NEWNYM' over ControlPort instructs Tor to switch to clean circuits for subsequent connections."
)

add_qa(doc, 30, "What is the bundled Tor binary version and origin in ShadowBrowse?",
    "ShadowBrowse bundles the official Tor 0.4.8.14 Expert Bundle (git-5d040a975df7a060) on Windows x64. It includes tor.exe, tor-gencert.exe, "
    "pluggable transports (lyrebird, snowflake, conjure), and geoip databases. It is licensed under the 3-clause BSD license, included in LICENSE-TOR.txt.",
    "Why not automatically download the latest Tor binary at runtime? Downloading executables dynamically introduces supply-chain risks and potential man-in-the-middle attacks. Bundling a verified, audited binary guarantees reproducibility and integrity."
)

# -------------------------------------------------------------
# CATEGORY 7: PROXY RESTORATION & FAIL-CLOSED KILL SWITCH
# -------------------------------------------------------------
add_category(doc, 7, "Proxy Restoration and Fail-Closed Kill-Switch")

add_qa(doc, 31, "Explain how the fail-closed kill switch operates when Tor collapses.",
    "During an active session, the extension polls agent health every 5000ms. If the agent reports that Tor is unreachable, or if the agent "
    "itself crashes, the extension triggers the kill switch: it immediately calls chrome.proxy.settings.set() with mode 'fixed_servers' pointing "
    "to singleProxy: { host: '127.0.0.1', port: 9, scheme: 'socks5' }. Port 9 is the standard discard port. Any subsequent web request from the "
    "browser immediately aborts with ERR_PROXY_CONNECTION_FAILED, preventing direct, unencrypted traffic from reaching the network.",
    "Why port 9 discard blackhole instead of direct mode? If we set mode to 'direct', the browser would send unmasked traffic over the user's direct connection, leaking their real IP. Setting port 9 guarantees fail-closed behavior."
)

add_qa(doc, 32, "How does exact pre-session proxy snapshotting and restoration work?",
    "Before activating a privacy session, NetworkController.ts queries chrome.proxy.settings.get(). It captures the user's existing proxy mode "
    "(such as 'system', 'direct', or 'auto_detect') and any pacScripts or rules, serializing this object into chrome.storage.local under the key "
    "'preSessionProxySnapshot'. When the user clicks 'Stop Session' or when clean teardown occurs, NetworkController reads this snapshot and "
    "applies it back exactly. This ensures that custom user proxy configurations or enterprise system settings are never permanently overwritten.",
    "What if the browser crashes mid-session? On next startup, the background service worker detects the stored snapshot and re-applies it, preventing the browser from remaining stuck on port 9 or port 9050."
)

add_qa(doc, 33, "How does WebRTC leak protection integrate with proxy routing?",
    "WebRTC utilizes STUN (Session Traversal Utilities for NAT) and TURN protocols over UDP to establish peer-to-peer media connections. "
    "Standard browser proxies only route TCP, meaning WebRTC can bypass proxies and broadcast the user's local and public IP addresses over UDP. "
    "ShadowBrowse mitigates this by setting chrome.privacy.network.webRTCIPHandlingPolicy to 'disable_non_proxied_udp' at session start, forcing "
    "WebRTC traffic through the proxy or blocking it if UDP proxying is unavailable.",
    "Is this policy restored on session end? Yes, upon session teardown, webRTCIPHandlingPolicy is restored to 'default'."
)

add_qa(doc, 34, "What is direct bypass detection, and how was it empirically tested?",
    "Direct bypass detection is an integrity check: the extension compares the observed egress IP against the recorded direct baseline IP. "
    "If the egress IP ever matches the baseline IP while in the PROTECTED state, the system flags a DIRECT_BYPASS_LEAK, immediately engages "
    "the discard blackhole, and logs a CRITICAL security event. We empirically tested this in test_phase11_live_tor_validation.py by simulating "
    "a proxy leak condition and verifying that the kill switch fired.",
    "What was the observed direct IP vs Tor IP in your tests? Direct IP: 210.16.95.248; Tor Egress IP: 193.189.100.203."
)

add_qa(doc, 35, "What happens if a user uninstalls the extension during an active session?",
    "If uninstalled while active, Chrome automatically clears extension proxy overrides and reverts to the browser's default system proxy mode. "
    "However, our UNINSTALL.txt documentation instructs users to click 'Stop Session' first to ensure graceful teardown, and provides STOP_ALL.bat "
    "to terminate running background daemons.",
    "Are there any leftover files on disk? The user token file at %USERPROFILE%\\.shadowbrowse remains until manually deleted, as described in our uninstallation guide."
)

# -------------------------------------------------------------
# CATEGORY 8: PRIVACY EVENTS, RISK SCORING & STORAGE
# -------------------------------------------------------------
add_category(doc, 8, "Privacy Events, Sanitization and Risk Scoring")

add_qa(doc, 36, "What is the PrivacyEvent schema, and how is sensitive data sanitized?",
    "Every tracking attempt detected by the extension is structured as a typed PrivacyEvent containing: id (UUID v4), timestamp (ISO 8601), "
    "type ('CANVAS' | 'WEBGL' | 'AUDIO' | 'COOKIE' | 'TRACKER' | 'NETWORK'), sourceUrl (sanitized origin), severity ('LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'), "
    "and details (diagnostic string). Sanitization strips all search queries, session tokens, and path hierarchies from sourceUrl, storing only the "
    "base origin (e.g., https://example.com). Furthermore, details strings are strictly capped at 128 characters.",
    "Why sanitize URLs? If an extension stores full URLs in local storage, it inadvertently creates a local browsing history ledger that malware or local snoops could inspect."
)

add_qa(doc, 37, "How does the Privacy Risk Engine compute the 0–100 risk score?",
    "riskEngine.ts calculates a composite privacy risk score from 0 (lowest risk) to 100 (highest risk) based on recent buffered events. "
    "Different signal categories have assigned weights: CANVAS and WEBGL attempts have higher weights (e.g., 25 points) because they represent active, "
    "stateless fingerprinting. COOKIE and TRACKER events have moderate weights (10–15 points). To prevent a single noisy tracker from skewing the score, "
    "each category has an upper cap (e.g., maximum 40 points from canvas). The final sum is clamped strictly between 0 and 100.",
    "How does the UI display this score? The SidePanel displays the score with color-coded risk bands: Low Risk (0–30, Emerald), Medium Risk (31–70, Amber), and High Risk (71–100, Crimson) with human-readable rationales."
)

add_qa(doc, 38, "How does PrivacyEventEngine.ts prevent memory bloat and storage quota exhaustion?",
    "The engine enforces dual-tier bounded capacity: In-memory ingestion is maintained in a FIFO ring buffer capped at 100 events. Persistent "
    "storage in chrome.storage.local maintains a strict FIFO ring buffer capped at 200 events. When new events arrive past capacity, the oldest "
    "records are automatically pruned. This guarantees that local storage consumption never exceeds ~180 KB, far below Chrome's 10 MB quota.",
    "What is the write serialization pattern? Storage writes are serialized using a Promise queue (writeLock) to prevent race conditions during rapid burst signal ingestion."
)

add_qa(doc, 39, "How does the tracker defense controller handle tracking parameters?",
    "trackerDefenseController.ts listens to chrome.webNavigation.onBeforeNavigate. When a navigation URL contains known surveillance parameters—such "
    "as Google Click ID (gclid), Facebook Click ID (fbclid), Microsoft Click ID (msclkid), or campaign tags (utm_source, utm_medium, utm_campaign)—it "
    "strips those keys from the URL query string and redirects to the clean URL, logging a TRACKER privacy event.",
    "Does this break website functionality? No, tracking click IDs and UTM parameters are used for advertising attribution; stripping them leaves page content and navigation intact."
)

add_qa(doc, 40, "What is the race-free clearAll() implementation in storage?",
    "When a user clicks 'Clear Audit History', a naive implementation might clear storage while a concurrent event is writing, causing resurrection "
    "of deleted data. PrivacyEventEngine implements an isClearing flag that locks ingestion, flushes the in-memory ring buffer, clears chrome.storage.local, "
    "and releases the lock only after confirmation, ensuring clean, race-free data purging.",
    "How was this verified? In test_phase6a_6d_controls_health.py, concurrent write and clear operations were dispatched simultaneously to assert that zero events were resurrected."
)

# -------------------------------------------------------------
# CATEGORY 9: TESTING, COVERAGE & ACCEPTANCE
# -------------------------------------------------------------
add_category(doc, 9, "Testing Methodology and Acceptance Evidence")

add_qa(doc, 41, "Summarize the automated test suite of ShadowBrowse.",
    "The automated test suite consists of 213 test items across 15 specialized test modules executed via Pytest. When the background Tor service is active, "
    "all 213 tests execute and pass with a 100% full-suite success rate in approximately 38.8 seconds (and 210 pass with 3 offline route skips when Tor is offline). "
    "The suite encompasses unit tests, integration tests, mock SOCKS5 handshakes, security vulnerability audits, and classic content-script bundling checks.",
    "What is the execution time of the full pytest suite? Under 39 seconds on Windows 11."
)

add_qa(doc, 42, "How did you test real-browser integration without manual human intervention?",
    "We developed automated test scripts using Node.js and the Chrome DevTools Protocol (CDP): real_world_acceptance.mjs and test_clean_install_browser.mjs. "
    "These scripts launch a real Google Chrome executable with --remote-debugging-port, connect over WebSockets, programmatically load our unpacked "
    "extension via Extensions.loadUnpacked, create targets for popup.html and sidepanel.html, evaluate DOM elements, simulate user clicks, and verify "
    "that console errors equal zero.",
    "Why is CDP better than Selenium or Puppeteer here? Standard Selenium and Puppeteer frequently interfere with Chrome extension loading in Manifest V3. Direct CDP WebSocket commands give native, unadulterated access to browser internals."
)

add_qa(doc, 43, "What specific tests verified security hardening in test_phase7_security_hardening.py?",
    "The suite executed 18 security tests verifying: (1) Rejection of Host headers containing external domains (attacker.com -> 403); (2) Enforcement "
    "of strictly loopback binding; (3) HTTP body payload bounding at 1 MB (413 Payload Too Large); (4) Constant-time HMAC token authentication (401 Unauthorized "
    "on invalid token); (5) Message payload bounding at 64 KB; and (6) Strict Manifest V3 CSP verification.",
    "Did you test path traversal? Yes, in test_agent_security.py, requests with '../' sequences in path parameters were asserted to be safely rejected."
)

add_qa(doc, 44, "What clean-install checks were performed on the release ZIP archive?",
    "In test_phase12_production_packaging.py and test_clean_install_browser.mjs, we verified: (1) Archive extraction into an isolated temporary folder; "
    "(2) Verification of all 43 files against MANIFEST.txt; (3) Absence of prohibited files (0 .map files, 0 credentials, 0 .env, 0 .pyc, 0 cached Tor state); "
    "(4) Clean Chrome profile loading; (5) Honest reporting of offline daemons; and (6) Complete profile and temp directory teardown.",
    "What is the SHA-256 checksum of the release package? b020c97a19e378a0578cba8aff843acf59f3c20b263c6b12e7e2d71ac47e7218."
)

add_qa(doc, 45, "How do you distinguish simulated tests from live network tests?",
    "Simulated tests (such as test_phase3_network.py and test_phase8_reliability_acceptance.py) use Python mocks and loopback test clients with "
    "SHADOWBROWSE_TEST_MODE=1 to run deterministically without internet access. Live tests (test_phase11_live_tor_validation.py and real_world_acceptance.mjs) "
    "require the real Tor daemon to be running and make live network queries to https://check.torproject.org/api/ip, verifying actual onion routing.",
    "Why have both? Simulated tests guarantee fast, repeatable continuous integration; live tests validate real-world exit consensus on the actual Internet."
)

# -------------------------------------------------------------
# CATEGORY 10: LIMITATIONS, TRADE-OFFS & FUTURE WORK
# -------------------------------------------------------------
add_category(doc, 10, "Security Limitations, Trade-Offs and Future Scope")

add_qa(doc, 46, "What are the accepted technical limitations of ShadowBrowse?",
    "We document three accepted boundaries: (1) Kernel UDP & Raw DNS: Chrome extensions cannot inspect or intercept raw kernel UDP sockets outside "
    "the browser sandbox; non-browser application DNS is outside scope. (2) Per-Tab Cookie Containers: Chromium does not provide per-tab cookie isolation "
    "APIs, so isolation is achieved via session UUID boundaries and post-session cleanup. (3) Local Daemon Dependency: Full onion routing requires the "
    "companion agent and Tor daemon to be running on loopback.",
    "Does ShadowBrowse make you 100% anonymous online? No. True operational security also depends on user behavior. If a user logs into their personal Google account while using ShadowBrowse, the website identifies them via application credentials regardless of IP masking."
)

add_qa(doc, 47, "Why is browser fingerprinting classified strictly as DETECTION ONLY instead of injecting synthetic canvas noise?",
    "Academic research (such as Laperdrix et al., 'Browser Fingerprinting: A Survey') demonstrates that injecting artificial mathematical noise into canvas or WebGL buffers actually increases browser uniqueness. Real-world browsers do not emit pseudo-random noise; an altered buffer produces an anomalous, high-entropy signature that immediately flags the browser as attempting evasion. Therefore, ShadowBrowse honestly classifies fingerprinting defenses as DETECTION ONLY: it intercepts, audits, and exposes canvas, WebGL, and WebAudio probes in real time, alerting the user and scoring the risk in Website Autopsy without degrading web application stability or increasing entropy.",
    "Why does EFF Cover Your Tracks still report a unique fingerprint? Because our extension does not spoof hardware characteristics (such as screen dimensions or GPU renderer strings), which preserves user stability and avoids high-entropy spoofing artifacts."
)

add_qa(doc, 48, "What are the trade-offs between Tor onion routing and commercial VPNs?",
    "Tor provides decentralized anonymity where no single relay knows both the client IP and the destination server, but it suffers from higher latency "
    "(often 300–800ms) and occasional exit-node CAPTCHA prompts. VPNs offer higher bandwidth and lower latency, but they act as a single point of failure "
    "where the VPN provider possesses the technical capability to log all unencrypted traffic.",
    "Why did ShadowBrowse choose Tor? Because privacy should be mathematically and architecturally verifiable, not based on marketing promises of 'no-logs'."
)

add_qa(doc, 49, "How can ShadowBrowse be packaged for non-technical end users in the future?",
    "Currently, the project is distributed as a clean release archive with batch scripts (START_ALL.bat). In future iterations, we plan to use Tauri "
    "or Electron to bundle the Python runtime, Tor binary, and browser launcher into a single executable desktop application (ShadowBrowse.exe) with "
    "an automated system tray icon and background process management.",
    "Would this eliminate the Command Prompt windows? Yes, Tauri would manage child processes invisibly in the background."
)

add_qa(doc, 50, "What is cascaded proxy routing, and how could it be added?",
    "Cascaded routing (or multi-hop proxy chaining) involves directing traffic through a user-owned SOCKS5 or SSH proxy before entering the Tor entry guard "
    "(Client -> Personal VPS -> Tor Guard -> Middle -> Exit -> Target). This prevents the user's ISP from even knowing that Tor is being used, providing "
    "censorship circumvention in regions where Tor entry relays are blocked.",
    "Is Tor Bridge support already available? Yes, the bundled Tor binary includes pluggable transports (snowflake, lyrebird, conjure) which can be enabled in torrc."
)

add_qa(doc, 51, "What is the significance of the 213 test items in the final suite?",
    "The 213 tests represent complete, comprehensive verification across all 15 test suites. When running with the live background Tor daemon active, "
    "all 213 tests execute and pass 100% in 38.8 seconds. When Tor is offline, 3 network route query tests gracefully skip (@pytest.mark.skipif) rather "
    "than producing false failures, demonstrating clean test isolation and reproducible CI behavior.",
    "What specific regressions are verified? Manifest V3 service worker state restoration, classic IIFE content script bundling, 31 DNR tracker rules covering EFF simulation domains, and loopback autopsy classification."
)

add_qa(doc, 52, "How does ShadowBrowse ensure that production packages contain zero secrets?",
    "scripts/package_release.py and test_phase12_production_packaging.py execute automated file tree audits before and after archive creation. "
    "They assert that: (1) Zero .map files exist in extension/dist; (2) Zero .token, .key, or .env files exist in agent/; (3) Zero .pyc or __pycache__ "
    "exist; and (4) The tor/data/ directory contains only geoip databases with zero cached consensus keys. Any violation immediately aborts packaging.",
    "Where is the runtime token stored then? The runtime token is generated dynamically on first boot and written to the user's local operating system profile (%USERPROFILE%\\.shadowbrowse\\agent.token), completely outside the distribution archive."
)

add_qa(doc, 53, "What caused the 'Cannot use import statement outside a module' error in Chrome content scripts, and how was it solved?",
    "Manifest V3 executes content scripts declared in manifest.json as classic scripts, not ES modules. Vite's standard Rollup code-splitting generated "
    "external dynamic import statements (import ... from './assets/constants-...'), which caused Chrome to throw a runtime SyntaxError. "
    "We resolved this by writing a custom buildContentScripts() rollup plugin in extension/vite.config.ts that builds contentScript.ts and injectGuard.ts "
    "in library mode as standalone Immediately Invoked Function Expressions (IIFE) with inlined dependencies and zero import statements.",
    "How was this verified? We added an automated Python regression test in test_phase10_final_audit.py and an automated Node/CDP runtime verification script."
)

add_qa(doc, 54, "How does Declarative Net Request (DNR) tracker defense block simulation domains like EFF Cover Your Tracks?",
    "ShadowBrowse implements 31 native chrome.declarativeNetRequest rules covering major analytics/ad networks (DoubleClick, Criteo, Facebook Pixel, Google Analytics) "
    "as well as EFF simulation test domains (trackersimulator.org, eviltracker.net, do-not-tracker.org). The rules cover sub_frame iframes, scripts, "
    "xmlhttprequests, images, pings, and websockets. During private sessions, all subresource tracking requests are blocked with net::ERR_BLOCKED_BY_CLIENT. "
    "We also added the declarativeNetRequestFeedback permission and wired onRuleMatchedDebug for live diagnostic feedback.",
    "Does ShadowBrowse block first-party inline ads? No. We maintain an honest distinction: cross-site tracker defense blocks tracking beacons and telemetry, but does not apply cosmetic element-hiding filters for first-party ads."
)

add_qa(doc, 55, "How does Website Autopsy handle local loopback traffic (localhost / 127.0.0.1) and active-tab synchronization?",
    "Website Autopsy listens to chrome.tabs.onActivated and chrome.tabs.onUpdated events so that switching browser tabs or navigating immediately updates "
    "the inspected target without requiring manual reload. Furthermore, when inspecting loopback addresses (127.0.0.1 or localhost), it assigns a "
    "LOCAL_LOOPBACK certificate status and low privacy exposure score (5), explaining to the user that local kernel IPC never traverses physical network "
    "wires or the internet, avoiding false security warnings when accessing local agent dashboards.",
    "How is the privacy exposure score calculated? The score evaluates network encryption (HTTPS/Loopback), third-party request count, known tracking domains, storage keys, and DOM fingerprint probing on a 0-100 scale."
)

add_qa(doc, 56, "What design pattern is used for the extension's background architecture?",
    "ShadowBrowse implements the Controller-Engine architectural pattern. The Background Service Worker acts as the central Event Bus and message router. "
    "Specialized controllers (NetworkController, PrivacyController, TrackerDefenseController) handle state transitions and Chrome API bindings, while engines "
    "(PrivacyEventEngine, RiskEngine) handle data sanitization, serialization, and mathematical scoring.",
    "Why not use Redux in the background? Service workers in MV3 are ephemeral and terminate frequently. In-memory Redux stores would be wiped on sleep. Using typed storage serialization in chrome.storage.local ensures state persistence across lifecycle wakeups."
)

add_qa(doc, 57, "What was your personal contribution to this semester project?",
    "I was responsible for the end-to-end architecture, implementation, and empirical validation: (1) Designing and building the Manifest V3 extension, "
    "React 18 Popup, and SidePanel; (2) Developing the Python FastAPI companion daemon, route verifier, and HMAC auth guard; (3) Integrating and configuring "
    "the bundled Tor 0.4.8.14 expert bundle; (4) Implementing 31 Declarative Net Request tracker rules and the fail-closed discard kill switch; and (5) Authoring the "
    "213-test automated regression suite and CDP real-browser acceptance test runners.",
    "What was the most challenging technical obstacle you solved? Resolving the Manifest V3 asynchronous service worker lifecycle with Chrome's proxy API to ensure that proxy rules persisted across worker terminations, while guaranteeing instant fail-closed blackholing if the Tor daemon terminated."
)

# Save Document
try:
    doc.save(OUTPUT_DOCX)
    print(f"Viva Q&A DOCX generated successfully at: {OUTPUT_DOCX}")
    print(f"File size: {os.path.getsize(OUTPUT_DOCX)} bytes")
except PermissionError:
    fallback_qa = os.path.join(SUBMISSION_DIR, "ShadowBrowse_Viva_Questions_and_Answers_Latest.docx")
    doc.save(fallback_qa)
    print(f"[NOTE] {OUTPUT_DOCX} is currently open in Microsoft Word.")
    print(f"Saved updated Q&A successfully to: {fallback_qa}")
    print(f"File size: {os.path.getsize(fallback_qa)} bytes")
