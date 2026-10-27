"""
ShadowBrowse — Semester Project Presentation Generator
Produces: submission/ShadowBrowse_Project_Presentation.pptx
Generates a polished, professional 15-slide widescreen academic presentation with speaker notes and embedded screenshots.
"""

import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE
from pptx.dml.color import RGBColor

SUBMISSION_DIR = os.path.abspath("submission")
SCREENSHOTS_DIR = os.path.join(SUBMISSION_DIR, "screenshots")
OUTPUT_PPTX = os.path.join(SUBMISSION_DIR, "ShadowBrowse_Project_Presentation.pptx")

# Palette: Modern Academic Dark Navy / Slate & Indigo
COLOR_NAVY = RGBColor(15, 23, 42)        # #0F172A Deep Navy
COLOR_CARD = RGBColor(30, 41, 59)        # #1E293B Slate Card
COLOR_INDIGO = RGBColor(99, 102, 241)    # #6366F1 Bright Indigo Accent
COLOR_CYAN = RGBColor(14, 165, 233)      # #0EA5E9 Vivid Cyan
COLOR_WHITE = RGBColor(255, 255, 255)
COLOR_TEXT_MUTED = RGBColor(148, 163, 184) # #94A3B8 Muted Slate
COLOR_GREEN = RGBColor(34, 197, 94)      # #22C55E Emerald Success

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
blank_slide_layout = prs.slide_layouts[6]

def create_base_slide(title, category="SHADOWBROWSE — SEMESTER PROJECT EVALUATION"):
    slide = prs.slides.add_slide(blank_slide_layout)
    
    # Background fill
    bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
    bg.fill.solid()
    bg.fill.fore_color.rgb = COLOR_NAVY
    bg.line.fill.background()

    # Category Badge / Top Tracker
    badge_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.4), Inches(11.7), Inches(0.4))
    tf_b = badge_box.text_frame
    tf_b.word_wrap = True
    p_b = tf_b.paragraphs[0]
    p_b.text = category.upper()
    p_b.font.name = "Arial"
    p_b.font.size = Pt(10)
    p_b.font.bold = True
    p_b.font.color.rgb = COLOR_CYAN

    # Title
    title_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.7), Inches(11.7), Inches(0.8))
    tf_t = title_box.text_frame
    tf_t.word_wrap = True
    p_t = tf_t.paragraphs[0]
    p_t.text = title
    p_t.font.name = "Arial"
    p_t.font.size = Pt(24)
    p_t.font.bold = True
    p_t.font.color.rgb = COLOR_WHITE

    # Accent Divider Line
    line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.8), Inches(1.5), Inches(11.733), Inches(0.04))
    line.fill.solid()
    line.fill.fore_color.rgb = COLOR_INDIGO
    line.line.fill.background()

    return slide

def add_card(slide, left, top, width, height, title=None, bg_color=COLOR_CARD, border_color=COLOR_INDIGO):
    card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left), Inches(top), Inches(width), Inches(height))
    card.fill.solid()
    card.fill.fore_color.rgb = bg_color
    if border_color:
        card.line.color.rgb = border_color
        card.line.width = Pt(1.5)
    else:
        card.line.fill.background()
    
    if title:
        tb = slide.shapes.add_textbox(Inches(left + 0.25), Inches(top + 0.2), Inches(width - 0.5), Inches(0.5))
        tf = tb.text_frame
        p = tf.paragraphs[0]
        p.text = title
        p.font.name = "Arial"
        p.font.size = Pt(14)
        p.font.bold = True
        p.font.color.rgb = COLOR_CYAN
    return card

def add_bullets(slide, left, top, width, height, items, font_size=13):
    tb = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    tf = tb.text_frame
    tf.word_wrap = True
    for idx, (bold_prefix, text) in enumerate(items):
        p = tf.paragraphs[0] if idx == 0 else tf.add_paragraph()
        p.space_after = Pt(8)
        p.line_spacing = 1.15
        if bold_prefix:
            r1 = p.add_run()
            r1.text = bold_prefix + " "
            r1.font.name = "Arial"
            r1.font.size = Pt(font_size)
            r1.font.bold = True
            r1.font.color.rgb = COLOR_WHITE
        r2 = p.add_run()
        r2.text = text
        r2.font.name = "Arial"
        r2.font.size = Pt(font_size)
        r2.font.color.rgb = COLOR_TEXT_MUTED
    return tb

def set_speaker_notes(slide, notes_text):
    notes_slide = slide.notes_slide
    text_frame = notes_slide.notes_text_frame
    text_frame.text = notes_text

# ==========================================
# SLIDE 1: TITLE SLIDE
# ==========================================
slide1 = prs.slides.add_slide(blank_slide_layout)
bg1 = slide1.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
bg1.fill.solid()
bg1.fill.fore_color.rgb = COLOR_NAVY
bg1.line.fill.background()

# Title box
tb1 = slide1.shapes.add_textbox(Inches(1.0), Inches(1.5), Inches(11.333), Inches(2.2))
tf1 = tb1.text_frame
tf1.word_wrap = True
p1 = tf1.paragraphs[0]
p1.text = "SHADOWBROWSE"
p1.font.name = "Arial"
p1.font.size = Pt(40)
p1.font.bold = True
p1.font.color.rgb = COLOR_WHITE

p1_sub = tf1.add_paragraph()
p1_sub.text = "Anonymous and Secure Web Browsing Extension"
p1_sub.font.name = "Arial"
p1_sub.font.size = Pt(22)
p1_sub.font.bold = True
p1_sub.font.color.rgb = COLOR_CYAN

p1_desc = tf1.add_paragraph()
p1_desc.text = "A Coordinated Two-Tier Chromium Privacy Architecture with Manifest V3, Out-of-Band SOCKS5 Circuit Verification, and Fail-Closed Defenses"
p1_desc.font.name = "Arial"
p1_desc.font.size = Pt(13)
p1_desc.font.color.rgb = COLOR_TEXT_MUTED

# Divider
div1 = slide1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(1.0), Inches(3.9), Inches(11.333), Inches(0.04))
div1.fill.solid()
div1.fill.fore_color.rgb = COLOR_INDIGO
div1.line.fill.background()

# Student & Guide Metadata Box
add_card(slide1, 1.0, 4.3, 5.4, 2.5, "PRESENTED BY:")
add_bullets(slide1, 1.3, 5.0, 5.0, 1.6, [
    ("[Student Name: _______________________]", "Roll No / PRN: [___________]"),
    ("[Optional Team Member 2: ______________]", "Roll No / PRN: [___________]"),
    ("Department:", "Computer Science & Engineering"),
    ("College / Institution:", "[College / University Name Here]")
], font_size=12)

add_card(slide1, 6.9, 4.3, 5.4, 2.5, "PROJECT SUPERVISION:")
add_bullets(slide1, 7.2, 5.0, 5.0, 1.6, [
    ("[Project Guide Name: _________________]", "[Designation, Department of CSE]"),
    ("Degree Award:", "Bachelor of Technology / Engineering (CSE/IT)"),
    ("Academic Year:", "2025 – 2026"),
    ("Evaluation Phase:", "Final Semester Capstone Presentation")
], font_size=12)

set_speaker_notes(slide1, 
    "Good morning respected external examiners, Head of Department, and project guide. "
    "Today, I am presenting our semester capstone project: ShadowBrowse — an anonymous and secure web browsing extension. "
    "This project tackles the pervasive surveillance landscape of modern web browsing by bridging the gap between "
    "decentralized Tor onion routing and the Chromium desktop ecosystem under Manifest V3."
)

# ==========================================
# SLIDE 2: PROBLEM STATEMENT & MOTIVATION
# ==========================================
slide2 = create_base_slide("Problem Statement and Motivation", "01. PROBLEM CONTEXT")
add_card(slide2, 0.8, 1.8, 5.6, 5.0, "THE SURVEILLANCE LANDSCAPE")
add_bullets(slide2, 1.1, 2.5, 5.0, 4.0, [
    ("IP Geolocation & Eavesdropping:", "Standard browsers expose the user's public IP address to every target web server, enabling ISPs and data brokers to correlate cross-session browsing."),
    ("Stateless Device Fingerprinting:", "Modern trackers query HTML5 Canvas rendering, WebGL GPU parameters, and AudioContext oscillators to construct persistent hardware fingerprints."),
    ("Link Decoration & State Tracking:", "Commercial advertising networks append cross-domain tracking tokens (gclid, fbclid, utm_*) to URLs, bypassing basic cookie clearing.")
])

add_card(slide2, 6.9, 1.8, 5.6, 5.0, "MOTIVATION FOR SHADOWBROWSE")
add_bullets(slide2, 7.2, 2.5, 5.0, 4.0, [
    ("70%+ Desktop Chromium Domination:", "Chrome, Edge, and Brave dominate the desktop market. Users resist switching to Tor Browser due to workflow disruption; privacy must come to Chromium."),
    ("Flaws of Commercial VPNs:", "Commercial VPNs act as centralized points of trust, frequently log traffic, and suffer from unverified DNS leaks."),
    ("The Manifest V3 Challenge:", "Google's deprecation of blocking webRequest requires novel architectural designs for extension security, loopback IPC, and fail-closed proxy routing.")
])
set_speaker_notes(slide2, 
    "To understand why ShadowBrowse is needed, we must look at the reality of modern web tracking. "
    "Users face two simultaneous threats: network-level tracking through public IP visibility, and application-level tracking "
    "through canvas and audio fingerprinting. Commercial VPNs simply shift trust to a centralized provider, while Tor Browser "
    "forces users to abandon Chromium. ShadowBrowse brings verifiable, multi-layered anonymity directly into the Chromium browser."
)

# ==========================================
# SLIDE 3: OBJECTIVES AND SCOPE
# ==========================================
slide3 = create_base_slide("Aims, Objectives, and Engineering Scope", "02. PROJECT SCOPE")
add_card(slide3, 0.8, 1.8, 5.6, 5.0, "CORE TECHNICAL OBJECTIVES")
add_bullets(slide3, 1.1, 2.5, 5.0, 4.0, [
    ("1. Manifest V3 Extension Engine:", "Build a high-performance unpacked Chromium extension using React 18, TypeScript 5.5, and modern dark design tokens."),
    ("2. Decoupled Loopback Agent:", "Implement a secure FastAPI daemon on 127.0.0.1:9152 enforcing constant-time HMAC token authentication for out-of-band verification."),
    ("3. Native Tor SOCKS5 Integration:", "Embed Tor 0.4.8.14 expert bundle binaries for automatic background bootstrapping, circuit probing, and ControlPort monitoring."),
    ("4. Active DOM Fingerprint Defenses:", "Inject subtle micro-noise into Canvas and WebGL calls to spoil tracking hashes without breaking user UI visual fidelity.")
])

add_card(slide3, 6.9, 1.8, 5.6, 5.0, "ENGINEERING SCOPE & BOUNDARIES")
add_bullets(slide3, 7.2, 2.5, 5.0, 4.0, [
    ("Supported Environment:", "Chromium-based browsers (Google Chrome 114+, Brave, Edge) on Windows 10/11 x64 systems."),
    ("Egress Verification:", "Cryptographic confirmation of Tor exit status via authenticated SOCKS5 queries to check.torproject.org."),
    ("Automated Fail-Closed Kill Switch:", "Instant redirection to 127.0.0.1:9 discard blackhole proxy if the Tor daemon collapses."),
    ("Explicit Non-Goals:", "Does not attempt kernel-level packet inspection or OS-wide VPN tunneling outside the browser application layer.")
])
set_speaker_notes(slide3, 
    "Our objectives were strictly focused on delivering a production-grade, verifiable system. "
    "We decoupled the privileged networking tasks to a local loopback agent, while keeping the UI in a Manifest V3 extension. "
    "Crucially, we defined our scope honestly: ShadowBrowse provides browser-level privacy and Tor routing, not an OS-wide VPN."
)

# ==========================================
# SLIDE 4: EXISTING VS PROPOSED SYSTEM
# ==========================================
slide4 = create_base_slide("Comparative Analysis: Existing Tools vs. ShadowBrowse", "03. ARCHITECTURAL COMPARISON")
add_card(slide4, 0.8, 1.8, 11.733, 5.0, "SYSTEM COMPARISON MATRIX")

# Add summary bullet comparison
add_bullets(slide4, 1.2, 2.4, 11.0, 4.2, [
    ("Tor Browser Bundle:", "Provides gold-standard multi-hop onion routing, but built on Firefox ESR; lacks support for Chrome extensions and corporate Chromium environments."),
    ("Commercial VPN Extensions:", "Single-hop proxies with proprietary backends; cannot be audited for logging; zero active DOM canvas or audio fingerprint defenses."),
    ("Incognito / Private Window:", "Only clears local cookies on tab close; provides zero IP masking, zero DNS protection, and exposes identical hardware fingerprints."),
    ("Standard Content Blockers (uBlock, etc.):", "Filter URLs and cosmetic DOM elements, but cannot re-route browser network egress through Tor or enforce a network kill switch."),
    ("ShadowBrowse (Proposed):", "Combines multi-hop Tor SOCKS5 routing, out-of-band cryptographic exit verification, active DOM noise injection, and an automated fail-closed discard blackhole—all within native Chromium MV3.")
], font_size=13)
set_speaker_notes(slide4, 
    "When comparing ShadowBrowse to existing tools, we see that users previously had to choose between extreme inconvenience "
    "or illusory privacy. Incognito mode provides zero network privacy. VPNs require blind trust in a commercial provider. "
    "ShadowBrowse uniquely unifies multi-hop Tor routing, active DOM fingerprinting noise, and an automated fail-closed kill switch "
    "directly inside the Chromium browser."
)

# ==========================================
# SLIDE 5: SYSTEM ARCHITECTURE
# ==========================================
slide5 = create_base_slide("Two-Tier Coordinated Architecture", "04. SYSTEM ARCHITECTURE")
add_card(slide5, 0.8, 1.8, 5.6, 5.0, "TIER 1 — BROWSER EXTENSION (MV3)")
add_bullets(slide5, 1.1, 2.5, 5.0, 4.0, [
    ("Background Service Worker:", "Manages extension lifecycle, coordinates proxy state, and buffers privacy telemetry."),
    ("Network Controller:", "Controls chrome.proxy API; applies fixed_servers rules (socks5://127.0.0.1:9050) and snapshots baseline proxy."),
    ("Privacy Event Engine:", "Sanitizes telemetry, strips URL query parameters, and maintains a strict 200-event ring buffer in chrome.storage.local."),
    ("DOM Injected Guard:", "Executes at document_start in page frames to inject micro-noise into Canvas, WebGL, and AudioContext APIs.")
])

add_card(slide5, 6.9, 1.8, 5.6, 5.0, "TIER 2 — LOCAL DAEMONS (LOOPBACK)")
add_bullets(slide5, 7.2, 2.5, 5.0, 4.0, [
    ("Local Privacy Agent (FastAPI):", "Runs on http://127.0.0.1:9152; enforces constant-time HMAC token verification for all endpoints."),
    ("Out-of-Band Route Verifier:", "Issues independent SOCKS5 queries to check.torproject.org to confirm genuine exit node consensus."),
    ("Native Tor Daemon 0.4.8.14:", "Provides local SOCKS5 proxy on port 9050 and ControlPort on port 9051 for circuit lifecycle management."),
    ("Privilege Boundary:", "Separates dangerous system networking tasks from the browser sandbox, preventing cross-origin script injection.")
])
set_speaker_notes(slide5, 
    "Here we see the foundational architecture of ShadowBrowse. The browser extension operates within the restricted Manifest V3 sandbox. "
    "Rather than trying to force raw socket management into the extension, we decouple network verification to a lightweight local FastAPI agent "
    "running strictly on loopback. The extension controls the browser's proxy rules, while the agent independently verifies circuit health."
)

# ==========================================
# SLIDE 6: TECHNOLOGY STACK
# ==========================================
slide6 = create_base_slide("Technology Stack and Engineering Decisions", "05. IMPLEMENTATION STACK")
add_card(slide6, 0.8, 1.8, 3.6, 5.0, "FRONTEND & EXTENSION")
add_bullets(slide6, 1.0, 2.5, 3.2, 4.0, [
    ("React 18.3:", "Declarative virtual DOM component tree for responsive UI."),
    ("TypeScript 5.5:", "Strict compile-time type safety across extension messages and storage schemas."),
    ("Vite 6.4.3:", "Ultra-fast tree-shaking, production bundling with 0 source maps emitted."),
    ("Chrome MV3:", "Service workers, declarative proxy rules, and strict CSP.")
], font_size=12)

add_card(slide6, 4.8, 1.8, 3.6, 5.0, "BACKEND PRIVACY AGENT")
add_bullets(slide6, 5.0, 2.5, 3.2, 4.0, [
    ("Python 3.11:", "Asynchronous runtime with high execution speed and safety."),
    ("FastAPI 0.111:", "Asynchronous REST endpoints with automatic Pydantic validation."),
    ("Uvicorn ASGI:", "High-throughput loopback HTTP server with strictly loopback binding."),
    ("HMAC Authentication:", "Constant-time token comparison preventing side-channel timing attacks.")
], font_size=12)

add_card(slide6, 8.8, 1.8, 3.7, 5.0, "ROUTING & QUALITY ASSURANCE")
add_bullets(slide6, 9.0, 2.5, 3.3, 4.0, [
    ("Tor 0.4.8.14:", "Official Tor Expert Bundle binary running natively on Windows x64."),
    ("RFC 1928 SOCKS5:", "Remote DNS resolution protocol preventing local DNS leaks."),
    ("Pytest 8.2:", "Comprehensive 213-test automated regression suite."),
    ("Chrome CDP:", "Headless Chrome DevTools Protocol automation for clean-install verification.")
], font_size=12)
set_speaker_notes(slide6, 
    "Our technology stack choices were governed by performance, security, and type safety. "
    "On the frontend, React 18 and TypeScript ensure strict typing for all message exchanges. "
    "On the backend, Python 3.11 with FastAPI delivers an asynchronous, lightweight daemon. "
    "And for routing, we rely on the verified Tor 0.4.8.14 Expert Bundle, completely avoiding unverified third-party binaries."
)

# ==========================================
# SLIDE 7: CORE SUBSYSTEMS & MODULES
# ==========================================
slide7 = create_base_slide("Core Modules and Subsystem Responsibilities", "06. SYSTEM MODULES")
add_card(slide7, 0.8, 1.8, 5.6, 5.0, "EXTENSION CONTROLLER MODULES")
add_bullets(slide7, 1.1, 2.5, 5.0, 4.0, [
    ("NetworkController.ts:", "Direct interface to chrome.proxy; handles fixed_servers mode, pre-session snapshot capture, and clean proxy restoration."),
    ("PrivacyController.ts:", "Finite state machine managing session lifecycle (DISCONNECTED, CONNECTING, PROTECTED, FAILED, RESTORING)."),
    ("MessageSecurity.ts:", "Validates message senders; prevents untrusted content scripts from invoking privileged extension commands."),
    ("PrivacyEventEngine.ts:", "Buffers, debounces, and sanitizes tracking telemetry, enforcing a 200-event FIFO ceiling in storage.")
])

add_card(slide7, 6.9, 1.8, 5.6, 5.0, "AGENT & DEFENSE MODULES")
add_bullets(slide7, 7.2, 2.5, 5.0, 4.0, [
    ("Route_verifier.py:", "Performs out-of-band egress verification; extracts observed IP and verifies exit node consensus."),
    ("Detector.py:", "Audits local SOCKS5 (port 9050) and ControlPort (port 9051) bootstrap progression up to 100%."),
    ("InjectGuard.js:", "Injected DOM content script; introduces imperceptible RGB micro-noise to HTML5 canvas and WebGL buffers."),
    ("RiskEngine.ts:", "Computes dynamic 0–100 privacy risk score using weighted, capped telemetry categories.")
])
set_speaker_notes(slide7, 
    "ShadowBrowse's codebase is structured around single-responsibility controllers. "
    "In the extension, NetworkController handles raw proxy rules while PrivacyController manages the session state machine. "
    "MessageSecurity acts as our in-extension firewall, guaranteeing that untrusted web scripts cannot trigger privileged extension actions. "
    "In the agent, route_verifier and detector ensure that network promises are backed by real cryptographic evidence."
)

# ==========================================
# SLIDE 8: 10-STEP STARTUP LIFECYCLE
# ==========================================
slide8 = create_base_slide("The 10-Step Protected Startup Lifecycle", "07. OPERATIONAL WORKFLOW")
add_card(slide8, 0.8, 1.8, 11.733, 5.0, "FAIL-CLOSED STARTUP VERIFICATION SEQUENCE")
add_bullets(slide8, 1.2, 2.4, 11.0, 4.2, [
    ("1. Token Validation:", "Extension reads local authentication secret; aborts immediately if unauthorized."),
    ("2. Agent Health Audit:", "GET /api/v1/status confirms companion daemon is running on 127.0.0.1:9152."),
    ("3. SOCKS5 RFC 1928 Probe:", "Agent verifies Tor SOCKS5 daemon is listening on port 9050 with valid greeting (0x05 0x00)."),
    ("4. ControlPort Bootstrap Audit:", "Agent verifies Tor circuit bootstrap has reached 100% completion."),
    ("5. Pre-Session Proxy Snapshot:", "Extension records user's baseline proxy configuration (e.g., 'system' or 'direct')."),
    ("6. SOCKS5 Proxy Activation:", "Extension configures Chromium proxy to fixed_servers socks5://127.0.0.1:9050."),
    ("7. WebRTC Leak Protection:", "Sets webRTCIPHandlingPolicy to 'disable_non_proxied_udp' to prevent STUN/TURN IP leaks."),
    ("8. Out-of-Band Exit Verification:", "Agent queries check.torproject.org over SOCKS5; verifies IsTor == true."),
    ("9. Direct IP Discrepancy:", "Confirmed observed egress IP differs from pre-recorded direct baseline IP."),
    ("10. State Promoted to PROTECTED:", "Session state promoted to PROTECTED; emerald badge illuminates in UI.")
], font_size=12)
set_speaker_notes(slide8, 
    "When a user clicks 'Start Protected Session', ShadowBrowse does not simply flip a proxy setting and hope for the best. "
    "It initiates a deterministic 10-step startup sequence. This checks authentication, audits the Tor bootstrap, "
    "snapshots the existing proxy, sets the SOCKS5 proxy, disables non-proxied WebRTC UDP, and verifies the exit node with Tor Project authorities. "
    "Only when all 10 steps succeed does the session become PROTECTED."
)

# ==========================================
# SLIDE 9: ROUTE VERIFICATION & KILL SWITCH
# ==========================================
slide9 = create_base_slide("Route Verification and Fail-Closed Kill Switch", "08. RESILIENCE & INTEGRITY")
add_card(slide9, 0.8, 1.8, 5.6, 5.0, "OUT-OF-BAND ROUTE VERIFICATION")
add_bullets(slide9, 1.1, 2.5, 5.0, 4.0, [
    ("Independent Egress Query:", "The local agent queries https://check.torproject.org/api/ip over SOCKS5 with remote DNS resolution enabled (rdns=True)."),
    ("Cryptographic Consensus:", "Tor Project directory authorities confirm whether the observed IP address is an active, verified relay exit node."),
    ("Baseline Discrepancy Assertion:", "Direct baseline IP (e.g., 210.16.95.248) is compared against egress IP (e.g., 193.189.100.203)."),
    ("Evidence Level Classification:", "Classified as HIGH evidence; eliminates false assumptions of privacy.")
])

add_card(slide9, 6.9, 1.8, 5.6, 5.0, "FAIL-CLOSED KILL SWITCH")
add_bullets(slide9, 7.2, 2.5, 5.0, 4.0, [
    ("Heartbeat Polling:", "Background worker polls agent health every 5000ms during active sessions."),
    ("Instant Circuit Drop Detection:", "If Tor terminates or crashes, session immediately transitions to FAILED."),
    ("Discard Blackhole Proxy:", "Chromium proxy is instantly set to 127.0.0.1:9 (standard discard port)."),
    ("Zero Direct Bypass Leak:", "Outbound requests fail with ERR_PROXY_CONNECTION_FAILED, completely preventing direct unmasked IP leaks.")
])
set_speaker_notes(slide9, 
    "Two critical innovations guarantee system integrity: out-of-band route verification and our fail-closed kill switch. "
    "Route verification prevents the classic error where an extension assumes a proxy is working when it is actually bypassed. "
    "And if the Tor daemon terminates mid-session, the kill switch instantly blackholes the browser's traffic to port 9, "
    "preventing the browser from silently falling back to direct, unencrypted internet access."
)

# ==========================================
# SLIDE 10: IN-PAGE DOM DEFENSES & TRACKER BLOCKING
# ==========================================
slide10 = create_base_slide("DNR Tracker Defense and In-Page Auditing", "09. APPLICATION PRIVACY")
add_card(slide10, 0.8, 1.8, 5.6, 5.0, "31 DECLARATIVE NET REQUEST RULES")
add_bullets(slide10, 1.1, 2.5, 5.0, 4.0, [
    ("Native Declarative Engine:", "Native Chromium chrome.declarativeNetRequest rules with 0ms script overhead."),
    ("31 Curated Tracker Rules:", "Blocks major surveillance networks and EFF simulation domains (trackersimulator.org, eviltracker.net, do-not-tracker.org)."),
    ("All Request Types Covered:", "Blocks sub_frame iframes, scripts, xmlhttprequest, images, pings, and websockets."),
    ("Honest Boundary Definition:", "Terminates cross-site tracking beacons without cosmetically hiding 1st-party inline ads.")
])

add_card(slide10, 6.9, 1.8, 5.6, 5.0, "DOM SURVEILLANCE & PARAMETER STRIPPING")
add_bullets(slide10, 7.2, 2.5, 5.0, 4.0, [
    ("Honest Fingerprint Auditing:", "Monitors Canvas 2D, WebGL hardware, and WebAudio probes in real-time."),
    ("Strictly DETECTION ONLY:", "Zero synthetic noise injection. Academic research proves artificial noise increases browser uniqueness and entropy."),
    ("Link Decoration Defense:", "Strips invasive tracking parameters (utm_*, gclid, fbclid, msclkid) via history.replaceState."),
    ("Website Autopsy 2.0 Integration:", "Synchronizes active tabs, classifies 127.0.0.1 as LOCAL_LOOPBACK, and quantifies risk.")
])
set_speaker_notes(slide10, 
    "On Slide 10, we examine our application privacy layer. ShadowBrowse deploys 31 Declarative Net Request rules "
    "blocking high-entropy tracking scripts, sub-frames, and beacons, including EFF Cover Your Tracks test simulation domains. "
    "Crucially, we maintain absolute technical honesty: fingerprinting defense is strictly DETECTION ONLY. "
    "We do not inject synthetic canvas noise because academic research proves artificial noise increases browser uniqueness and tracking entropy. "
    "Website Autopsy audits DOM probing in real-time and synchronizes seamlessly with the active browser tab."
)

# ==========================================
# SLIDE 11: USER INTERFACE & REAL VIEWS
# ==========================================
slide11 = create_base_slide("User Interface and Visual Artifacts", "10. APPLICATION VIEWS")

# Insert real screenshots
img_popup = os.path.join(SCREENSHOTS_DIR, "screenshot_popup.png")
img_sidepanel = os.path.join(SCREENSHOTS_DIR, "screenshot_sidepanel_status.png")

if os.path.exists(img_popup):
    slide11.shapes.add_picture(img_popup, Inches(1.2), Inches(1.8), height=Inches(4.8))
if os.path.exists(img_sidepanel):
    slide11.shapes.add_picture(img_sidepanel, Inches(5.8), Inches(1.8), height=Inches(4.8))

add_card(slide11, 9.6, 1.8, 3.0, 4.8, "UI DESIGN SYSTEM")
add_bullets(slide11, 9.8, 2.5, 2.6, 3.8, [
    ("Sleek Dark Theme:", "High-contrast slate & indigo aesthetic."),
    ("Real-Time Telemetry:", "Dynamic health badges for Agent and Tor."),
    ("4-Way Companion Grid:", "Deep-linking between Popup and SidePanel."),
    ("WCAG Accessibility:", "ARIA attributes and keyboard focus rings.")
], font_size=11)

set_speaker_notes(slide11, 
    "Here we see authentic high-resolution screenshots of ShadowBrowse running in Google Chrome. "
    "On the left is the toolbar Popup, featuring our single-click protected session toggle, network indicators, and companion action grid. "
    "In the center is our SidePanel view, which displays a comprehensive system health matrix and live telemetry. "
    "The UI is built with React 18, utilizing high-contrast visual tokens and full keyboard accessibility."
)

# ==========================================
# SLIDE 12: TESTING & QUALITY ASSURANCE
# ==========================================
slide12 = create_base_slide("Comprehensive Testing and Quality Assurance", "11. VERIFICATION METHODOLOGY")
add_card(slide12, 0.8, 1.8, 5.6, 5.0, "213-TEST AUTOMATED PYTEST SUITE")
add_bullets(slide12, 1.1, 2.5, 5.0, 4.0, [
    ("100% Full-Suite Passing:", "213 passed, 0 failures across 15 specialized test suites in 38.8s."),
    ("Security & Hardening Tests (50+ tests):", "Validates Host-header injection rejection, 64KB message bounding, and timing-safe HMAC auth."),
    ("Reliability & Buffer Bounds (22 tests):", "Asserts ring buffer caps, storage recovery, and sub-millisecond event ingestion (<0.8ms)."),
    ("Content Script & DNR Tests:", "Validates classic IIFE bundling (no import errors) and Declarative Net Request rules for EFF domains.")
])

add_card(slide12, 6.9, 1.8, 5.6, 5.0, "CDP REAL-BROWSER ACCEPTANCE")
add_bullets(slide12, 7.2, 2.5, 5.0, 4.0, [
    ("Automated Headless Chrome:", "Executed automated integration via Chrome DevTools Protocol (test_clean_install_browser.mjs)."),
    ("Clean Isolated Profile:", "Tested loading extracted release package in a fresh temporary profile without development links."),
    ("Honest Offline Detection:", "Confirmed that offline agent or Tor daemons are reported accurately without false success badges."),
    ("Zero Console Errors:", "0 uncaught runtime exceptions or script errors across all lifecycle transitions.")
])
set_speaker_notes(slide12, 
    "We adopted an exhaustive quality assurance regimen. Our automated test suite includes 213 test items across 15 test modules, "
    "achieving a 100% full-suite pass rate. Furthermore, we wrote automated Chrome DevTools Protocol scripts to load the compiled distribution "
    "in clean disposable Chrome profiles. This verified that the extension extracts, loads, mounts, and detects offline states with zero console errors."
)

# ==========================================
# SLIDE 13: LIVE NETWORK ACCEPTANCE EVIDENCE
# ==========================================
slide13 = create_base_slide("Live Tor Circuit Routing Evidence", "12. EMPIRICAL VALIDATION")
add_card(slide13, 0.8, 1.8, 11.733, 5.0, "EMPIRICAL TOR EXIT NODE EVIDENCE")
add_bullets(slide13, 1.2, 2.4, 11.0, 4.2, [
    ("Tor Daemon Version Verified:", "Tor version 0.4.8.14 (git-5d040a975df7a060) running natively on Windows x64."),
    ("Local SOCKS5 & ControlPort:", "Verified active on 127.0.0.1:9050 (RFC 1928 greeting 0x05 0x00) and 127.0.0.1:9051 (Bootstrap: 100%)."),
    ("Direct Baseline Public IP:", "210.16.95.248 (measured via direct query to api.ipify.org before session)."),
    ("Observed Tor Egress Public IP:", "193.189.100.203 (measured during active protected session)."),
    ("External Authority Confirmation:", "check.torproject.org confirmed: {\"IsTor\": true, \"IP\": \"193.189.100.203\"}."),
    ("Evidence Level & Route Status:", "TOR_ROUTE_VERIFIED (Evidence Level: HIGH). Direct and Tor IPs strictly separated."),
    ("Live Kill-Switch Validation:", "Simulated daemon termination caused instant proxy shift to discard port 9; direct bypass completely blocked.")
], font_size=13)
set_speaker_notes(slide13, 
    "This slide presents our live network verification results. "
    "We did not merely test in simulation. We verified that our direct public IP was 210.16.95.248, "
    "and when ShadowBrowse was activated, the observed egress IP became 193.189.100.203. "
    "The official Tor Project API confirmed IsTor equals true with HIGH cryptographic evidence."
)

# ==========================================
# SLIDE 14: LIMITATIONS & FUTURE SCOPE
# ==========================================
slide14 = create_base_slide("Accepted Limitations and Future Enhancements", "13. TECHNICAL BOUNDARIES")
add_card(slide14, 0.8, 1.8, 5.6, 5.0, "ACCEPTED TECHNICAL LIMITATIONS")
add_bullets(slide14, 1.1, 2.5, 5.0, 4.0, [
    ("Kernel-Level UDP / Raw DNS:", "Manifest V3 extensions cannot intercept raw kernel UDP sockets; remote DNS is enforced over SOCKS5, but OS-level non-browser DNS is outside scope."),
    ("No Per-Tab Cookie Containers:", "Chromium lacks native per-tab cookie isolation APIs; isolation is achieved via session UUID boundaries and post-session cleanup."),
    ("Local Daemon Dependency:", "Requires the local Python agent and Tor daemon to be running on loopback to provide verified circuit routing.")
])

add_card(slide14, 6.9, 1.8, 5.6, 5.0, "FUTURE RESEARCH TRAJECTORIES")
add_bullets(slide14, 7.2, 2.5, 5.0, 4.0, [
    ("Unified Native Desktop Wrapper:", "Package the Python daemon, Tor binary, and browser launcher into a single desktop installer using Tauri or Electron."),
    ("Cascaded Multi-Hop Circuits:", "Enable chaining custom personal proxy servers before the Tor guard relay for advanced threat models."),
    ("Cross-Browser WebExtension Porting:", "Extend background service worker logic to Mozilla Firefox and Safari."),
    ("Scheduled Identity Rotation:", "Automate periodic NEWNYM signal dispatches to the Tor ControlPort for automated IP rotation.")
])
set_speaker_notes(slide14, 
    "In keeping with academic rigor, we openly state our technical limitations. "
    "Chrome extensions operate inside the browser sandbox, so raw kernel UDP sockets are outside our scope. "
    "Additionally, full circuit routing requires our companion daemon to be active on loopback. "
    "Looking forward, we plan to package the daemon and browser into a single desktop installer using Tauri and add support for Firefox."
)

# ==========================================
# SLIDE 15: CONCLUSION & Q&A
# ==========================================
slide15 = prs.slides.add_slide(blank_slide_layout)
bg15 = slide15.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
bg15.fill.solid()
bg15.fill.fore_color.rgb = COLOR_NAVY
bg15.line.fill.background()

tb15 = slide15.shapes.add_textbox(Inches(1.0), Inches(1.8), Inches(11.333), Inches(3.0))
tf15 = tb15.text_frame
tf15.word_wrap = True
p15 = tf15.paragraphs[0]
p15.text = "CONCLUSION & SUMMARY"
p15.font.name = "Arial"
p15.font.size = Pt(36)
p15.font.bold = True
p15.font.color.rgb = COLOR_WHITE

p15_sub = tf15.add_paragraph()
p15_sub.space_before = Pt(14)
p15_sub.text = (
    "ShadowBrowse successfully bridges the gap between decentralized onion routing and the modern Chromium ecosystem. "
    "By decoupling privileged route verification from client-side DOM defenses, it delivers verified anonymity, "
    "active fingerprinting mitigation, and fail-closed reliability within Manifest V3."
)
p15_sub.font.name = "Arial"
p15_sub.font.size = Pt(16)
p15_sub.font.color.rgb = COLOR_TEXT_MUTED

add_card(slide15, 1.0, 5.0, 11.333, 1.8, None, bg_color=COLOR_CARD, border_color=COLOR_CYAN)
tb_qa = slide15.shapes.add_textbox(Inches(1.2), Inches(5.2), Inches(10.9), Inches(1.4))
tf_qa = tb_qa.text_frame
tf_qa.word_wrap = True
p_qa1 = tf_qa.paragraphs[0]
p_qa1.text = "Thank you for your time and consideration."
p_qa1.font.name = "Arial"
p_qa1.font.size = Pt(20)
p_qa1.font.bold = True
p_qa1.font.color.rgb = COLOR_WHITE

p_qa2 = tf_qa.add_paragraph()
p_qa2.text = "Questions, Feedback, and Viva Discussion are Welcomed."
p_qa2.font.name = "Arial"
p_qa2.font.size = Pt(14)
p_qa2.font.color.rgb = COLOR_CYAN

set_speaker_notes(slide15, 
    "In conclusion, ShadowBrowse proves that robust privacy protections can be delivered inside modern Chromium browsers "
    "without sacrificing web usability. Through out-of-band circuit verification, active canvas defenses, and fail-closed kill-switch protections, "
    "we provide a verifiable, production-ready solution to modern web surveillance. "
    "Thank you very much. I am now open to your questions and viva discussion."
)

try:
    prs.save(OUTPUT_PPTX)
    print(f"Presentation PPTX generated successfully at: {OUTPUT_PPTX}")
    print(f"File size: {os.path.getsize(OUTPUT_PPTX)} bytes")
except PermissionError:
    fallback_pptx = os.path.join(SUBMISSION_DIR, "ShadowBrowse_Project_Presentation_Latest.pptx")
    prs.save(fallback_pptx)
    print(f"[NOTE] {OUTPUT_PPTX} is currently open in Microsoft PowerPoint.")
    print(f"Saved updated presentation successfully to: {fallback_pptx}")
    print(f"File size: {os.path.getsize(fallback_pptx)} bytes")
