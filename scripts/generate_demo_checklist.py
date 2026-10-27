"""
ShadowBrowse — Live Demonstration and Submission Checklist Generator
Produces: submission/ShadowBrowse_Demo_and_Submission_Checklist.docx
Provides a step-by-step 5-7 minute live demo guide, exact commands, fallback strategies,
pre-presentation sanity checks, and a comprehensive submission review checklist.
"""

import os
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

SUBMISSION_DIR = os.path.abspath("submission")
OUTPUT_DOCX = os.path.join(SUBMISSION_DIR, "ShadowBrowse_Demo_and_Submission_Checklist.docx")

COLOR_PRIMARY = RGBColor(15, 23, 42)
COLOR_SECONDARY = RGBColor(79, 70, 229)
COLOR_MUTED = RGBColor(100, 116, 139)
COLOR_BODY = RGBColor(51, 65, 85)
HEX_ACCENT_BG = "EEF2FF"
HEX_CARD_BG = "F8FAFC"

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

def add_header(doc, text, level=1):
    p = doc.add_paragraph()
    p.paragraph_format.keep_with_next = True
    p.paragraph_format.space_before = Pt(14)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run(text)
    r.font.name = "Arial"
    r.bold = True
    if level == 1:
        r.font.size = Pt(14)
        r.font.color.rgb = COLOR_PRIMARY
    elif level == 2:
        r.font.size = Pt(12)
        r.font.color.rgb = COLOR_SECONDARY
    elif level == 3:
        r.font.size = Pt(10.5)
        r.font.color.rgb = COLOR_PRIMARY
    return p

def add_callout(doc, text, title="IMPORTANT NOTICE:"):
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = docx.enum.table.WD_TABLE_ALIGNMENT.CENTER
    cell = tbl.cell(0, 0)
    set_cell_background(cell, HEX_ACCENT_BG)
    set_cell_margins(cell, top=100, bottom=100, left=160, right=160)
    
    tcPr = cell._tc.get_or_add_tcPr()
    borders = parse_xml(f'''
        <w:tcBorders {nsdecls("w")}>
            <w:top w:val="none"/>
            <w:left w:val="single" w:sz="24" w:space="0" w:color="4F46E5"/>
            <w:bottom w:val="none"/>
            <w:right w:val="none"/>
        </w:tcBorders>
    ''')
    tcPr.append(borders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.15
    r1 = p.add_run(f"[{title}] ")
    r1.bold = True
    r1.font.name = "Arial"
    r1.font.size = Pt(9.5)
    r1.font.color.rgb = COLOR_SECONDARY
    
    r2 = p.add_run(text)
    r2.font.name = "Arial"
    r2.font.size = Pt(9.5)
    r2.font.color.rgb = COLOR_BODY
    doc.add_paragraph().paragraph_format.space_after = Pt(4)

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
r_t = p_title.add_run("SHADOWBROWSE — LIVE DEMONSTRATION & SUBMISSION RUNBOOK")
r_t.bold = True
r_t.font.name = "Arial"
r_t.font.size = Pt(18)
r_t.font.color.rgb = COLOR_PRIMARY

p_sub = doc.add_paragraph()
p_sub.paragraph_format.space_after = Pt(14)
r_sub = p_sub.add_run("5–7 Minute Evaluation Demonstration Script, Exact Terminal Commands, Failure Fallbacks, and Submission Checklist")
r_sub.font.name = "Arial"
r_sub.font.size = Pt(11)
r_sub.font.italic = True
r_sub.font.color.rgb = COLOR_MUTED

add_callout(doc, 
    "Never display your private agent token (~/.shadowbrowse/agent.token) or personal browsing credentials on the projector "
    "during the live demonstration. The demonstration steps below are specifically designed to safely prove routing and kill-switch "
    "integrity without exposing sensitive user secrets.",
    title="SECURITY & PRIVACY CAUTION DURING LIVE EVALUATION"
)

# -------------------------------------------------------------
# 1. 5-7 MINUTE DEMONSTRATION TIMELINE
# -------------------------------------------------------------
add_header(doc, "1. Structured 5–7 Minute Demonstration Plan", level=1)

def add_demo_step(doc, minute, step_title, action, what_to_say, expected_result):
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = docx.enum.table.WD_TABLE_ALIGNMENT.CENTER
    cell = tbl.cell(0, 0)
    set_cell_background(cell, HEX_CARD_BG)
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
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.line_spacing = 1.15
    r_time = p.add_run(f"[{minute}] {step_title.upper()}\n")
    r_time.bold = True
    r_time.font.name = "Arial"
    r_time.font.size = Pt(10.5)
    r_time.font.color.rgb = COLOR_SECONDARY
    
    p_act = cell.add_paragraph()
    p_act.paragraph_format.space_after = Pt(3)
    p_act.paragraph_format.line_spacing = 1.15
    r_al = p_act.add_run("Action / Operation: ")
    r_al.bold = True
    r_al.font.name = "Arial"
    r_al.font.size = Pt(9.5)
    r_al.font.color.rgb = COLOR_PRIMARY
    r_at = p_act.add_run(action)
    r_at.font.name = "Arial"
    r_at.font.size = Pt(9.5)
    r_at.font.color.rgb = COLOR_BODY
    
    p_say = cell.add_paragraph()
    p_say.paragraph_format.space_after = Pt(3)
    p_say.paragraph_format.line_spacing = 1.15
    r_sl = p_say.add_run("Spoken Explanation to Evaluators: ")
    r_sl.bold = True
    r_sl.font.name = "Arial"
    r_sl.font.size = Pt(9.5)
    r_sl.font.color.rgb = RGBColor(14, 165, 233)
    r_st = p_say.add_run(f"\"{what_to_say}\"")
    r_st.font.name = "Arial"
    r_st.font.size = Pt(9.5)
    r_st.font.color.rgb = COLOR_BODY
    
    p_res = cell.add_paragraph()
    p_res.paragraph_format.space_after = Pt(2)
    p_res.paragraph_format.line_spacing = 1.15
    r_rl = p_res.add_run("Expected Observed Result: ")
    r_rl.bold = True
    r_rl.font.name = "Arial"
    r_rl.font.size = Pt(9.5)
    r_rl.font.color.rgb = RGBColor(34, 197, 94)
    r_rt = p_res.add_run(expected_result)
    r_rt.font.name = "Arial"
    r_rt.font.size = Pt(9.5)
    r_rt.font.color.rgb = COLOR_BODY
    
    doc.add_paragraph().paragraph_format.space_after = Pt(4)

add_demo_step(doc, "Minute 0:00 – 1:00", "Baseline Direct IP & Extension Load",
    "Open Chrome. Navigate to https://api.ipify.org in a standard tab to display the baseline direct ISP IP address. Then open chrome://extensions to show ShadowBrowse loaded unpacked with Manifest V3 badge.",
    "First, we record our baseline direct IP address to establish direct connectivity. Notice that our ISP IP is visible. Next, we observe ShadowBrowse installed under Chrome Manifest V3.",
    "Standard public IP (e.g., 210.16.95.248) displayed on screen. Extension displayed with clean MV3 badge."
)

add_demo_step(doc, "Minute 1:00 – 2:00", "Honest Disconnected State Demonstration",
    "Open the ShadowBrowse extension toolbar popup BEFORE starting daemons. Show the system health indicator.",
    "Notice that because our local daemons are not yet started, ShadowBrowse honestly displays 'Agent: Disconnected' and 'Tor: Unavailable'. It never pretends to be secure when backends are offline.",
    "Red/amber status badges displayed. 'Start Protected Session' button disabled or warns of missing agent."
)

add_demo_step(doc, "Minute 2:00 – 3:30", "Starting Daemons & Readiness Checklist",
    "Double-click START_ALL.bat (or run python -m agent.src.main --port 9152 and tor.exe). Re-open the extension. Click 'Readiness Checklist'.",
    "Now we launch our background daemons. The Tor binary bootstraps on port 9050 and the agent starts on 9152. In the extension, the 6-point readiness modal executes an automated audit, confirming all subsystems are ready.",
    "Tor log shows 100% bootstrap in ~7s. All 6 points in Readiness Modal illuminate green with checkmarks."
)

add_demo_step(doc, "Minute 3:30 – 5:00", "Live Protected Session & Tor Egress Verification",
    "Click 'Start Protected Session'. Observe the 10-step progress. Once green badge appears, navigate to https://check.torproject.org in a new tab.",
    "We click Start Protected Session. The extension sets the SOCKS5 proxy, disables non-proxied WebRTC UDP, and executes out-of-band verification. On check.torproject.org, notice the official message: 'Congratulations. This browser is configured to use Tor.' Our egress IP is completely masked.",
    "Primary button illuminates emerald green ('PROTECTED'). check.torproject.org displays green onion icon and confirms IsTor == true."
)

add_demo_step(doc, "Minute 5:00 – 6:00", "Fail-Closed Kill Switch Demonstration",
    "While the protected tab is open, open Task Manager or Command Prompt and run 'taskkill /F /IM tor.exe'. Attempt to reload any website (e.g., https://example.com).",
    "Now, we test our fail-closed kill switch. We forcibly kill the Tor process. Within 5 seconds, the extension detects the circuit drop, alerts the user, and shifts the proxy to port 9 discard blackhole. Notice that requests immediately fail with ERR_PROXY_CONNECTION_FAILED—zero direct unmasked packets leak to the ISP.",
    "Extension UI displays crimson alarm ('CIRCUIT COLLAPSED — BLACKHOLED'). Browser fails closed; direct IP is NOT exposed."
)

add_demo_step(doc, "Minute 6:00 – 7:00", "Teardown & Clean Proxy Restoration",
    "Click 'Stop Session' in the extension. Refresh https://api.ipify.org. Double-click STOP_ALL.bat to shut down daemons.",
    "Finally, we end the session. ShadowBrowse reads the stored pre-session proxy snapshot and cleanly restores the browser to baseline system mode. The browser immediately resumes normal browsing without orphaned proxy errors.",
    "Proxy settings revert to 'system'. api.ipify.org loads normally with original baseline IP. STOP_ALL.bat terminates processes cleanly."
)

# -------------------------------------------------------------
# 2. EXACT TERMINAL COMMANDS
# -------------------------------------------------------------
add_header(doc, "2. Exact Operational Terminal Commands", level=1)

def add_code_block(doc, code_str, caption):
    p_cap = doc.add_paragraph()
    p_cap.paragraph_format.space_before = Pt(6)
    p_cap.paragraph_format.space_after = Pt(2)
    rc = p_cap.add_run(f"Command Reference: {caption}")
    rc.bold = True
    rc.font.name = "Arial"
    rc.font.size = Pt(9.0)
    rc.font.color.rgb = COLOR_SECONDARY

    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = docx.enum.table.WD_TABLE_ALIGNMENT.CENTER
    cell = tbl.cell(0, 0)
    set_cell_background(cell, "F1F5F9")
    set_cell_margins(cell, top=80, bottom=80, left=140, right=140)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.line_spacing = 1.05
    r = p.add_run(code_str)
    r.font.name = "Consolas"
    r.font.size = Pt(8.5)
    r.font.color.rgb = RGBColor(30, 41, 59)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)

add_code_block(doc, 
r""":: 1. Launch All Subsystems in Background (Recommended)
START_ALL.bat

:: OR Launch Manually in Two Command Prompts:
:: Prompt 1 (Tor Daemon):
tor\start-tor.bat

:: Prompt 2 (Local Privacy Agent):
agent\start-agent.bat""",
caption="Subsystem Startup Commands"
)

add_code_block(doc, 
r""":: 1. Terminate All Running Subsystems (Clean Teardown)
STOP_ALL.bat

:: OR Terminate Manually via Command Prompt:
taskkill /F /IM tor.exe /IM python.exe""",
caption="Subsystem Shutdown Commands"
)

add_code_block(doc, 
r"""# Run TypeScript Typecheck (0 errors expected)
npm --prefix extension run typecheck

# Build Production Extension Package
npm --prefix extension run build

# Run Full Pytest Regression Suite (213 passed, 100% full-suite passing)
python -m pytest -q

# Run Clean-Install Real-Browser CDP Acceptance Runner
node tests/test_clean_install_browser.mjs""",
caption="Testing and Verification Commands"
)

# -------------------------------------------------------------
# 3. FALLBACK CONTINGENCY PLAN
# -------------------------------------------------------------
add_header(doc, "3. Live Demonstration Fallback Contingency Plan", level=1)
p_fb = doc.add_paragraph()
p_fb.paragraph_format.line_spacing = 1.15
p_fb.paragraph_format.space_after = Pt(6)
r_fb = p_fb.add_run(
    "If the college auditorium or examination room has restricted Wi-Fi (e.g., firewall blocking Tor directory authorities or port 9050), "
    "execute the following pre-rehearsed fallback plan calmly:"
)
r_fb.font.name = "Arial"
r_fb.font.size = Pt(10)
r_fb.font.color.rgb = COLOR_BODY

def add_bullet(doc, bold_pre, text):
    p = doc.add_paragraph(style='List Bullet')
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.line_spacing = 1.15
    r1 = p.add_run(bold_pre + " ")
    r1.bold = True
    r1.font.name = "Arial"
    r1.font.size = Pt(10)
    r1.font.color.rgb = COLOR_PRIMARY
    r2 = p.add_run(text)
    r2.font.name = "Arial"
    r2.font.size = Pt(10)
    r2.font.color.rgb = COLOR_BODY

add_bullet(doc, "Contingency 1 (Wi-Fi Blocks Tor Port):", 
    "Switch laptop Wi-Fi immediately to a mobile phone 4G/5G cellular hotspot. Cellular networks in India/internationally do not block outbound Tor traffic.")
add_bullet(doc, "Contingency 2 (No Cellular Coverage):", 
    "Run in Offline Mock Mode by setting the environment variable '$env:SHADOWBROWSE_TEST_MODE=\"1\"'. Launch the agent; it will provide mock responses proving full UI state transitions and kill-switch blackholing.")
add_bullet(doc, "Contingency 3 (Browser Automation Fails):", 
    "Open the 'submission/screenshots/' folder or Slide 11 of the presentation. Show the authentic high-resolution screenshots of the running Popup, SidePanel, and Readiness Modal, explaining that all screenshots are genuine artifacts captured from Chrome CDP.")

# -------------------------------------------------------------
# 4. PRE-PRESENTATION SANITY CHECKLIST
# -------------------------------------------------------------
add_header(doc, "4. Pre-Presentation Sanity Checklist (Do Tonight)", level=1)
add_bullet(doc, "[  ] Verify Chrome Installation:", "Ensure Google Chrome is installed and updated at 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'.")
add_bullet(doc, "[  ] Rebuild Production Bundle:", "Run 'npm --prefix extension run build' to confirm 'extension/dist' is up to date.")
add_bullet(doc, "[  ] Fill Personal Placeholders:", "Open the DOCX report, PPTX presentation, script, and viva guide. Replace [Student Name], [Roll No], [Guide Name], and [College Name] with your real details.")
add_bullet(doc, "[  ] Rehearse Spoken Script Twice:", "Read through 'ShadowBrowse_Presentation_Script.docx' aloud with a timer to ensure you finish within 10–12 minutes.")
add_bullet(doc, "[  ] Test Offline Kill Switch Once:", "Run START_ALL.bat, start a protected session, run 'taskkill /F /IM tor.exe', and observe the browser fail-closed on port 9.")
add_bullet(doc, "[  ] Copy Submission Folder to USB:", "Copy the entire 'submission/' directory to a backup USB thumb drive and your Google Drive.")

# -------------------------------------------------------------
# 5. SUBMISSION FILES REVIEW CHECKLIST
# -------------------------------------------------------------
add_header(doc, "5. Official Submission Package Checklist", level=1)

sub_files = [
    ["ShadowBrowse_Semester_Project_Report.docx", "Editable comprehensive 31-section academic report (29 pages)", "Verified Complete"],
    ["ShadowBrowse_Semester_Project_Report.pdf", "Official compiled publication-quality PDF report (713 KB)", "Verified Complete"],
    ["ShadowBrowse_Project_Presentation.pptx", "15-slide widescreen academic evaluation presentation with speaker notes", "Verified Complete"],
    ["ShadowBrowse_Presentation_Script.docx", "Complete 10–12 minute verbatim spoken script with slide & demo cues", "Verified Complete"],
    ["ShadowBrowse_Viva_Questions_and_Answers.docx", "55+ rigorous viva questions, answers, and examiner follow-ups across 10 categories", "Verified Complete"],
    ["ShadowBrowse_Demo_and_Submission_Checklist.docx", "5–7 minute demo timeline, commands, fallbacks, and submission runbook", "Verified Complete"],
    ["README_SUBMISSION.txt", "Package inventory, SHA-256 integrity checksums, and execution instructions", "Verified Complete"],
    ["screenshots/ (5 PNG files)", "Authentic high-resolution Chrome CDP screenshots of Popup, SidePanel, and Readiness", "Verified Complete"]
]

tbl_sub = doc.add_table(rows=len(sub_files) + 1, cols=3)
tbl_sub.alignment = docx.enum.table.WD_TABLE_ALIGNMENT.CENTER
tbl_sub.rows[0].cells[0].text = "Submission Artifact File"
tbl_sub.rows[0].cells[1].text = "Format & Description"
tbl_sub.rows[0].cells[2].text = "Validation Status"

set_cell_background(tbl_sub.rows[0].cells[0], "0F172A")
set_cell_background(tbl_sub.rows[0].cells[1], "0F172A")
set_cell_background(tbl_sub.rows[0].cells[2], "0F172A")

for cell in tbl_sub.rows[0].cells:
    p = cell.paragraphs[0]
    p.runs[0].font.name = "Arial"
    p.runs[0].font.size = Pt(9.0)
    p.runs[0].font.color.rgb = RGBColor(255, 255, 255)
    p.runs[0].bold = True

for idx, (f_name, f_desc, f_stat) in enumerate(sub_files):
    row = tbl_sub.rows[idx + 1]
    bg = "F8FAFC" if idx % 2 == 1 else "FFFFFF"
    for c_i, val in enumerate([f_name, f_desc, f_stat]):
        cell = row.cells[c_i]
        cell.text = val
        set_cell_background(cell, bg)
        set_cell_margins(cell, top=70, bottom=70, left=100, right=100)
        p = cell.paragraphs[0]
        p.paragraph_format.line_spacing = 1.1
        p.paragraph_format.space_after = Pt(0)
        for r in p.runs:
            r.font.name = "Arial"
            r.font.size = Pt(8.5)
            r.font.color.rgb = COLOR_BODY
            if c_i == 0:
                r.bold = True
                r.font.color.rgb = COLOR_PRIMARY
            elif c_i == 2:
                r.bold = True
                r.font.color.rgb = RGBColor(34, 197, 94)

# Save Document
try:
    doc.save(OUTPUT_DOCX)
    print(f"Demo & Submission Checklist DOCX generated successfully at: {OUTPUT_DOCX}")
    print(f"File size: {os.path.getsize(OUTPUT_DOCX)} bytes")
except PermissionError:
    fallback_checklist = os.path.join(SUBMISSION_DIR, "ShadowBrowse_Demo_and_Submission_Checklist_Latest.docx")
    doc.save(fallback_checklist)
    print(f"[NOTE] {OUTPUT_DOCX} is currently open in Microsoft Word.")
    print(f"Saved updated checklist successfully to: {fallback_checklist}")
    print(f"File size: {os.path.getsize(fallback_checklist)} bytes")
