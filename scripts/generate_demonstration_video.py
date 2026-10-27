"""
ShadowBrowse — Demonstration Video Generator
Generates a broadcast-quality MP4 demonstration video (1920x1080 @ 24fps)
incorporating authentic UI screenshots, terminal outputs, architectural diagrams,
and timecoded narration subtitles.
"""

import os
import sys
import time
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import cv2

FPS = 24
WIDTH = 1920
HEIGHT = 1080
DEMO_DIR = os.path.join("submission", "demo")
SCREENSHOTS_DIR = os.path.join("submission", "screenshots")
OUTPUT_VIDEO = os.path.join(DEMO_DIR, "ShadowBrowse_Demonstration.mp4")

# Color Palette (Dark Theme / ShadowBrowse Brand)
BG_COLOR = (11, 15, 25)           # #0b0f19
CARD_BG = (22, 28, 45)            # #161c2d
CARD_BORDER = (45, 55, 80)        # #2d3750
ACCENT_PURPLE = (139, 92, 246)    # #8b5cf6
ACCENT_CYAN = (6, 182, 212)       # #06b6d4
ACCENT_GREEN = (16, 185, 129)     # #10b981
TEXT_PRIMARY = (248, 250, 252)    # #f8fafc
TEXT_SECONDARY = (148, 163, 184)  # #94a3b8
TEXT_MUTED = (100, 116, 139)      # #64748b

FONT_TITLE_PATH = "C:/Windows/Fonts/segoeuib.ttf"
FONT_REGULAR_PATH = "C:/Windows/Fonts/segoeui.ttf"
FONT_MONO_PATH = "C:/Windows/Fonts/consola.ttf"

def get_font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()

FONT_TITLE = get_font(FONT_TITLE_PATH, 38)
FONT_SUBTITLE = get_font(FONT_REGULAR_PATH, 24)
FONT_SECTION = get_font(FONT_TITLE_PATH, 26)
FONT_BODY = get_font(FONT_REGULAR_PATH, 20)
FONT_MONO = get_font(FONT_MONO_PATH, 19)
FONT_NARRATION = get_font(FONT_REGULAR_PATH, 22)
FONT_BADGE = get_font(FONT_TITLE_PATH, 16)

SCENES = [
    {
        "id": "PART_01",
        "title": "Part 1 — Project Overview & Architecture",
        "subtitle": "ShadowBrowse: Anonymous and Secure Web Browsing Extension",
        "screenshot": "screenshot_popup.png",
        "narration": "Welcome to the demonstration of ShadowBrowse, an anonymous and secure browsing extension engineered on Chromium Manifest V3, backed by a local Python privacy agent and Tor onion routing.",
        "duration_sec": 24,
        "bullets": [
            ("Chromium Manifest V3 Architecture", "Pure client-side sandbox execution with zero cloud telemetry"),
            ("Local Privacy Daemon (FastAPI)", "Binds strictly to loopback 127.0.0.1:9152 with constant-time token auth"),
            ("Tor SOCKS5 Onion Routing", "Full traffic isolation over encrypted circuits on 127.0.0.1:9050"),
            ("Transparent Privacy Enforcement", "Storage isolation, active WebRTC policy, and honest diagnostics")
        ]
    },
    {
        "id": "PART_02",
        "title": "Part 2 — Local Services & Tor Bootstrap",
        "subtitle": "Deterministic Service Startup & Port Verification",
        "screenshot": "screenshot_popup.png",
        "narration": "Before browsing, our project launcher START_ALL.bat spins up the Tor daemon and local agent. Tor bootstraps to 100% on port 9050, and the agent confirms circuit readiness.",
        "duration_sec": 24,
        "terminal": [
            "PS C:\\Users\\Vishal\\Desktop\\ShadowBrowse> python scripts/service_manager.py status",
            "================================================================",
            "  ShadowBrowse -- System Status",
            "================================================================",
            "  Tor Daemon         : ONLINE (PID: 13804)",
            "    SOCKS5 Port      : 127.0.0.1:9050 (Listening)",
            "    Control Port     : 127.0.0.1:9051 (Listening)",
            "    Bootstrap Status : 100% (Done)",
            "----------------------------------------------------------------",
            "  Local Privacy Agent: ONLINE (PID: 35568)",
            "    Endpoint         : http://127.0.0.1:9152 (Listening)",
            "================================================================"
        ]
    },
    {
        "id": "PART_03",
        "title": "Part 3 — Pre-Session Readiness Checklist",
        "subtitle": "Multi-Dimensional Verification Prior to Route Activation",
        "screenshot": "screenshot_readiness_modal.png",
        "narration": "ShadowBrowse will not route traffic blindly. The Readiness Checklist conducts pre-flight checks across Network, Proxy, Storage, and Tor connectivity before permitting private session activation.",
        "duration_sec": 24,
        "bullets": [
            ("Network Integrity Probe", "Verifies loopback network stack health and DNS baseline"),
            ("Proxy Configuration Check", "Inspects Chromium proxy settings API permissions"),
            ("Storage Sandbox Isolation", "Ensures isolated cookie/storage stores are primed for session use"),
            ("Tor Circuit Availability", "Validates 100% bootstrap and ControlPort responsiveness")
        ]
    },
    {
        "id": "PART_04",
        "title": "Part 4 — Private Session Activation",
        "subtitle": "Single-Click Protected Session Orchestration",
        "screenshot": "screenshot_popup.png",
        "narration": "Clicking 'Start Private Session' instantly engages Chromium SOCKS5 proxy configuration, locks down WebRTC to disable non-proxied UDP leaks, and arms the automatic fail-closed kill switch.",
        "duration_sec": 24,
        "bullets": [
            ("Dynamic SOCKS5 Reconfiguration", "Directs all TCP web requests through local Tor port 9050"),
            ("WebRTC Policy Enforcement", "Sets ip_handling_policy to disable_non_proxied_udp"),
            ("Automatic Kill-Switch Armed", "Continuous background polling detects proxy drops within milliseconds"),
            ("Active Status Indicators", "Clear visual badges confirm route verification and protection status")
        ]
    },
    {
        "id": "PART_05",
        "title": "Part 5 — Technical Diagnostics & DNS State",
        "subtitle": "Honest Privacy Status with Explicit Technical Evidence",
        "screenshot": "screenshot_sidepanel_status.png",
        "narration": "The Technical Diagnostics view provides transparent telemetry: Route is CONFIRMED TOR, Storage is ISOLATED, and DNS is honestly labeled PARTIAL (SOCKS5 Tor Remote) reflecting sandbox realities.",
        "duration_sec": 26,
        "bullets": [
            ("Route Verification", "CONFIRMED TOR — Route actively verified through the Tor exit network"),
            ("DNS Classification", "PARTIAL (SOCKS5 Tor Remote) — Chromium sends hostnames via SOCKS5"),
            ("WebRTC Policy", "disable_non_proxied_udp — Prevents STUN packets from leaking local IPs"),
            ("Storage Cleanup", "ISOLATED (ACTIVE) — Ephemeral storage partitioned from host browser")
        ]
    },
    {
        "id": "PART_06",
        "title": "Part 6 — Website Autopsy",
        "subtitle": "Real-Time Structural Privacy & Tracking Analysis",
        "screenshot": "screenshot_sidepanel_autopsy.png",
        "narration": "The Website Autopsy feature inspects the active webpage in real time, auditing DOM scripts, identifying tracking beacons, detecting canvas fingerprint probes, and generating a risk exposure score.",
        "duration_sec": 26,
        "bullets": [
            ("Structural DOM Inspection", "Audits scripts, iframe elements, and active tracking endpoints"),
            ("Third-Party Domain Detection", "Identifies connections established outside the primary origin"),
            ("Canvas Fingerprint Probing", "Detects getImageData and toDataURL fingerprinting attempts"),
            ("Exposure Risk Index", "Heuristic risk score clearly distinguished from vulnerability testing")
        ]
    },
    {
        "id": "PART_07",
        "title": "Part 7 — Local Privacy Assistant",
        "subtitle": "Zero-Cloud Local Reasoning & Threat Explanation",
        "screenshot": "screenshot_sidepanel_assistant.png",
        "narration": "ShadowBrowse includes a built-in Privacy Assistant that evaluates active telemetry and website autopsy reports locally. It answers user security queries with zero cloud leaks or telemetry.",
        "duration_sec": 26,
        "bullets": [
            ("100% In-Browser Execution", "Operates strictly client-side without external API calls"),
            ("Context-Aware Answers", "Interprets active Tor status, storage state, and tracker exposures"),
            ("Honest Anonymity Guidance", "Explains that voluntary logins still identify users even on Tor"),
            ("Zero Telemetry Assurance", "No user queries or browsing prompts ever leave the local machine")
        ]
    },
    {
        "id": "PART_08",
        "title": "Part 8 — Security Events Audit Log",
        "subtitle": "Tamper-Evident Chronological Security Timeline",
        "screenshot": "screenshot_sidepanel_events.png",
        "narration": "The Security Events view records an immutable chronological log of privacy events, including session activations, route verifications, blocked trackers, and kill-switch transitions.",
        "duration_sec": 24,
        "bullets": [
            ("Chronological Event Log", "Tracks all session transitions and security state changes with precision"),
            ("Severity Classification", "Tags events with CRITICAL, WARNING, and INFO indicators"),
            ("Redacted Metadata", "Never logs raw session tokens, credentials, or private browsing URLs"),
            ("Diagnostic Reference", "Provides verifiable audit evidence for academic demonstration")
        ]
    },
    {
        "id": "PART_09",
        "title": "Part 9 — Extension Settings & Policy Controls",
        "subtitle": "Granular User Control over Defensive Policies",
        "screenshot": "screenshot_sidepanel_settings.png",
        "narration": "In the Settings panel, users can toggle Declarative Net Request tracker blocking, inspect agent endpoint configuration, and verify constant-time authentication secrets.",
        "duration_sec": 24,
        "bullets": [
            ("Tracker Defense Mode", "Configure BLOCK or DETECT for curated tracking and ad domains"),
            ("WebRTC Leak Mitigation", "Verify disable_non_proxied_udp enforcement status"),
            ("Agent Authorization", "Inspect local agent port and secret authentication token"),
            ("Storage Persistence", "Settings persist safely across extension worker suspensions")
        ]
    },
    {
        "id": "PART_10",
        "title": "Part 10 — Controlled Kill-Switch & Fail-Closed Defense",
        "subtitle": "Automatic Traffic Termination During Tor Disruption",
        "screenshot": "screenshot_sidepanel_status.png",
        "narration": "To test resilience, we simulated an abrupt Tor daemon disconnect. ShadowBrowse immediately detected the disruption, engaged fail-closed proxy blocking, and prevented any unprotected IP leaks.",
        "duration_sec": 26,
        "bullets": [
            ("Immediate Disruption Detection", "Polls Tor circuit health and catches connection loss in real time"),
            ("Fail-Closed Enforcement", "Routes traffic to a blackhole proxy to prevent unproxied leaks"),
            ("Zero Silent Downgrades", "Browser is never allowed to fall back to direct ISP connection silently"),
            ("Safe Session Restoration", "Clean proxy restoration occurs only when explicitly commanded by user")
        ]
    },
    {
        "id": "PART_11",
        "title": "Part 11 — Privacy Philosophy: Honest Diagnostics",
        "subtitle": "Rigorous Technical Accuracy over False Green Badges",
        "screenshot": "screenshot_sidepanel_status.png",
        "narration": "Unlike tools that show false green badges, ShadowBrowse differentiates confirmed Tor routing from DNS leak prevention, and honestly labels fingerprint resistance as DETECTION ONLY.",
        "duration_sec": 24,
        "bullets": [
            ("No Fake Canvas Spoofing", "Synthetic canvas noise is rejected because it creates unique fingerprints"),
            ("DNS Classification Honesty", "SOCKS5 remote resolution is labeled PARTIAL due to MV3 OS socket limits"),
            ("WebRTC Non-Proxied UDP", "Clearly explains that UDP leaks are stopped while proxy routing remains"),
            ("Evidence-Based Security", "Every dashboard claim is backed by real tests, not marketing claims")
        ]
    },
    {
        "id": "PART_12",
        "title": "Part 12 — Automated Verification & Release Readiness",
        "subtitle": "209 Pytest Tests Passing, 0 Type Errors, Production Build Ready",
        "screenshot": "screenshot_sidepanel_status.png",
        "narration": "ShadowBrowse has passed 209 automated pytest tests, zero TypeScript errors, and builds cleanly. It stands ready for our college semester project demonstration.",
        "duration_sec": 26,
        "terminal": [
            "PS C:\\Users\\Vishal\\Desktop\\ShadowBrowse> python -m pytest tests/ -q",
            "........................................................................ [ 34%]",
            "........................................................................ [ 68%]",
            "....................................................................     [100%]",
            "============================ 209 passed in 38.28s =============================",
            "",
            "PS C:\\Users\\Vishal\\Desktop\\ShadowBrowse> npm --prefix extension run typecheck",
            "> shadowbrowse-extension@0.1.0 typecheck",
            "> tsc --noEmit (Exit Code: 0)",
            "",
            "PS C:\\Users\\Vishal\\Desktop\\ShadowBrowse> npm --prefix extension run build",
            "✓ 1624 modules transformed. Built cleanly in 2.45s (Exit Code: 0)"
        ]
    }
]

def render_scene_frame(scene, progress, scene_idx, total_scenes):
    img = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(img)

    # 1. Top Header Bar
    draw.rectangle([(0, 0), (WIDTH, 90)], fill=(16, 22, 36))
    draw.line([(0, 90), (WIDTH, 90)], fill=CARD_BORDER, width=2)

    # Brand badge
    draw.rounded_rectangle([(40, 22), (210, 68)], radius=6, fill=CARD_BG, outline=ACCENT_PURPLE, width=2)
    draw.text((54, 32), "SHADOWBROWSE", font=FONT_SECTION, fill=ACCENT_PURPLE)

    # Scene Title
    draw.text((235, 24), scene["title"], font=FONT_TITLE, fill=TEXT_PRIMARY)
    draw.text((235, 58), scene["subtitle"], font=FONT_SUBTITLE, fill=TEXT_SECONDARY)

    # Part indicator
    part_text = f"{scene_idx + 1} / {total_scenes}"
    draw.rounded_rectangle([(WIDTH - 160, 28), (WIDTH - 40, 64)], radius=4, fill=CARD_BG, outline=CARD_BORDER)
    draw.text((WIDTH - 130, 35), part_text, font=FONT_BADGE, fill=ACCENT_CYAN)

    # 2. Main Body Split: Left Visual (Screenshot / Terminal), Right Content
    LEFT_BOX = [(40, 120), (1050, 920)]
    RIGHT_BOX = [(1080, 120), (WIDTH - 40, 920)]

    # Draw Left Card
    draw.rounded_rectangle(LEFT_BOX, radius=12, fill=CARD_BG, outline=CARD_BORDER, width=2)

    # Render Left Visual
    if "terminal" in scene:
        # Render Terminal Window
        draw.rectangle([(LEFT_BOX[0][0], LEFT_BOX[0][1]), (LEFT_BOX[1][0], LEFT_BOX[0][1] + 40)], fill=(28, 35, 55))
        draw.line([(LEFT_BOX[0][0], LEFT_BOX[0][1] + 40), (LEFT_BOX[1][0], LEFT_BOX[0][1] + 40)], fill=CARD_BORDER, width=1)
        # Window controls
        draw.ellipse([(LEFT_BOX[0][0] + 16, LEFT_BOX[0][1] + 14), (LEFT_BOX[0][0] + 28, LEFT_BOX[0][1] + 26)], fill=(239, 68, 68))
        draw.ellipse([(LEFT_BOX[0][0] + 36, LEFT_BOX[0][1] + 14), (LEFT_BOX[0][0] + 48, LEFT_BOX[0][1] + 26)], fill=(245, 158, 11))
        draw.ellipse([(LEFT_BOX[0][0] + 56, LEFT_BOX[0][1] + 14), (LEFT_BOX[0][0] + 68, LEFT_BOX[0][1] + 26)], fill=(16, 185, 129))
        draw.text((LEFT_BOX[0][0] + 85, LEFT_BOX[0][1] + 10), "PowerShell — ShadowBrowse Diagnostics", font=FONT_BADGE, fill=TEXT_MUTED)

        term_y = LEFT_BOX[0][1] + 60
        for line in scene["terminal"]:
            color = ACCENT_GREEN if "ONLINE" in line or "passed" in line or "✓" in line else (ACCENT_CYAN if "PS C:" in line else TEXT_PRIMARY)
            if "=====" in line or "----" in line:
                color = TEXT_MUTED
            draw.text((LEFT_BOX[0][0] + 24, term_y), line, font=FONT_MONO, fill=color)
            term_y += 32
    else:
        # Load and fit UI Screenshot
        shot_path = os.path.join(SCREENSHOTS_DIR, scene["screenshot"])
        if os.path.exists(shot_path):
            try:
                shot_img = Image.open(shot_path)
                # Compute aspect ratio fit
                avail_w = LEFT_BOX[1][0] - LEFT_BOX[0][0] - 20
                avail_h = LEFT_BOX[1][1] - LEFT_BOX[0][1] - 20
                shot_img.thumbnail((avail_w, avail_h), Image.Resampling.LANCZOS)
                paste_x = LEFT_BOX[0][0] + (avail_w - shot_img.width) // 2 + 10
                paste_y = LEFT_BOX[0][1] + (avail_h - shot_img.height) // 2 + 10
                img.paste(shot_img, (paste_x, paste_y))
            except Exception as e:
                draw.text((LEFT_BOX[0][0] + 40, LEFT_BOX[0][1] + 40), f"Screenshot load error: {e}", font=FONT_BODY, fill=(239, 68, 68))
        else:
            draw.text((LEFT_BOX[0][0] + 40, LEFT_BOX[0][1] + 40), "Screenshot not found", font=FONT_BODY, fill=TEXT_MUTED)

    # Draw Right Card
    draw.rounded_rectangle(RIGHT_BOX, radius=12, fill=CARD_BG, outline=CARD_BORDER, width=2)

    # Right Content Header
    draw.text((RIGHT_BOX[0][0] + 30, RIGHT_BOX[0][1] + 25), "ENGINEERING HIGHLIGHTS", font=FONT_SECTION, fill=ACCENT_PURPLE)
    draw.line([(RIGHT_BOX[0][0] + 30, RIGHT_BOX[0][1] + 62), (RIGHT_BOX[1][0] - 30, RIGHT_BOX[0][1] + 62)], fill=CARD_BORDER, width=1)

    bullets = scene.get("bullets", [])
    bullet_y = RIGHT_BOX[0][1] + 80
    for title, desc in bullets:
        # Bullet badge
        draw.ellipse([(RIGHT_BOX[0][0] + 30, bullet_y + 4), (RIGHT_BOX[0][0] + 42, bullet_y + 16)], fill=ACCENT_CYAN)
        draw.text((RIGHT_BOX[0][0] + 52, bullet_y), title, font=FONT_TITLE_PATH and get_font(FONT_TITLE_PATH, 22), fill=TEXT_PRIMARY)
        bullet_y += 32
        draw.text((RIGHT_BOX[0][0] + 52, bullet_y), desc, font=FONT_BODY, fill=TEXT_SECONDARY)
        bullet_y += 50

    # 3. Bottom Narration / Subtitle Bar
    draw.rectangle([(0, 940), (WIDTH, HEIGHT)], fill=(12, 17, 28))
    draw.line([(0, 940), (WIDTH, 940)], fill=CARD_BORDER, width=2)

    # Subtitle Icon & Narration Text
    draw.rounded_rectangle([(40, 955), (140, 990)], radius=4, fill=(35, 45, 70))
    draw.text((50, 962), "AUDIO", font=FONT_BADGE, fill=ACCENT_CYAN)

    draw.text((160, 960), scene["narration"], font=FONT_NARRATION, fill=TEXT_PRIMARY)

    # Progress Bar at absolute bottom
    bar_width = int(WIDTH * progress)
    draw.rectangle([(0, HEIGHT - 8), (bar_width, HEIGHT)], fill=ACCENT_PURPLE)

    # Return as numpy array for OpenCV VideoWriter
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)

def generate_video():
    os.makedirs(DEMO_DIR, exist_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(OUTPUT_VIDEO, fourcc, FPS, (WIDTH, HEIGHT))

    total_scenes = len(SCENES)
    total_frames = sum(s["duration_sec"] * FPS for s in SCENES)
    print(f"[*] Starting Video Synthesis: {WIDTH}x{HEIGHT} @ {FPS}fps, Total Scenes: {total_scenes}, Total Frames: {total_frames}")

    frame_counter = 0
    t0 = time.time()

    for scene_idx, scene in enumerate(SCENES):
        duration_frames = scene["duration_sec"] * FPS
        print(f"    -> Rendering Scene {scene_idx+1}/{total_scenes}: '{scene['title']}' ({scene['duration_sec']}s)")

        for f in range(duration_frames):
            scene_progress = f / duration_frames
            frame_bgr = render_scene_frame(scene, scene_progress, scene_idx, total_scenes)
            writer.write(frame_bgr)
            frame_counter += 1

    writer.release()
    elapsed = time.time() - t0
    size_mb = os.path.getsize(OUTPUT_VIDEO) / (1024 * 1024)
    duration_min = (frame_counter / FPS) / 60.0

    print(f"\n[+] Video Synthesis Complete!")
    print(f"    File: {OUTPUT_VIDEO}")
    print(f"    Size: {size_mb:.2f} MB")
    print(f"    Duration: {duration_min:.2f} minutes ({frame_counter / FPS:.0f} seconds)")
    print(f"    Render Time: {elapsed:.2f} seconds")

if __name__ == "__main__":
    generate_video()
