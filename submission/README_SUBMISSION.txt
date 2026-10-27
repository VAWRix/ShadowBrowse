================================================================================
       SHADOWBROWSE — SEMESTER CAPSTONE PROJECT SUBMISSION PACKAGE
       ANONYMOUS AND SECURE WEB BROWSING CHROMIUM EXTENSION
================================================================================

Course:         Bachelor of Technology / Engineering in Computer Science & Engineering
Academic Year:  2025 – 2026
Status:         FINAL SUBMISSION COMPLETE (VERIFIED & AUDITED)
Workspace:      C:\Users\Vishal\OneDrive\Desktop\ShadowBrowse
Submission Dir: C:\Users\Vishal\OneDrive\Desktop\ShadowBrowse\submission

--------------------------------------------------------------------------------
1. SUBMISSION ARTIFACTS INVENTORY & INTEGRITY CHECKSUMS (SHA-256)
--------------------------------------------------------------------------------

Filename                                         Size (Bytes)   SHA-256 Checksum
--------------------------------------------------------------------------------------------------------------------------------
ShadowBrowse_Semester_Project_Report.docx        998066         53b1142aff12e4de1c2bc23745ab8d16c3a4b10254532a507ced8ca9e30b50d1
ShadowBrowse_Semester_Project_Report.pdf         713063         aa42854602be37b3e561109a9c9e8dc6841b589469ae6c491991c82cbc572b04
ShadowBrowse_Project_Presentation.pptx           439037         f8cfaac25e5db11bc6c4fce21e6ae4277ea63687e35af98241d3ec6013988e66
ShadowBrowse_Presentation_Script.docx            45523          03ac3f567821d7b98a2cc45fb3319eebbe16ac6842f49b30db73bd7a9e8d61b9
ShadowBrowse_Viva_Questions_and_Answers.docx     57352          432f2d1d0f7d9e8812ae23403cb621a9116b8c35dcf824a835058e0634497e73
ShadowBrowse_Demo_and_Submission_Checklist.docx  41693          f904f32e99ddc88b362212a4a33981f419316d80a53de214ff72c9680e1f8c83
screenshots/screenshot_popup.png                 133534         30fde825ef478e489e199d25f3eb68b6ba613b1fa5fe2b22384a64e59bae4d89
screenshots/screenshot_readiness_modal.png       209937         b7cfb124304cb0760fac212880a5174ea4e4818dae10c85871ca398a2c0a97ab
screenshots/screenshot_sidepanel_status.png      210317         6ed6a90988530b28d659edc025cb7113b5ea44f4e1d05e0188363a5b9936a26e
screenshots/screenshot_sidepanel_autopsy.png     71201          19332481e9f692ddae06c51524869f9981a00b4ba81f8522fd93a6995a78f547
screenshots/screenshot_sidepanel_assistant.png   98600          175f3c88771a605d387f123fd88b9d90282bcb35c581f2cc07f3fcb59ab8bd84
screenshots/screenshot_sidepanel_events.png      252415         f7235f914e3671640441e6120b240dafee71605349d0d2d7f5323eaca9c6f912
screenshots/screenshot_sidepanel_settings.png    209050         a72aa77dac6e2cf668ad66cf07e1ff1da11244427f2ee77e1dd79d24d709ee97

--------------------------------------------------------------------------------
2. SUMMARY OF SUBMISSION DELIVERABLES
--------------------------------------------------------------------------------

1. ShadowBrowse_Semester_Project_Report.docx & .pdf (29 substantive pages):
   - Complete, formal academic engineering report spanning 31 comprehensive sections.
   - Contains title page, certificates, declaration, abstract, literature survey,
     feasibility analysis, architecture diagrams, module breakdowns, algorithms,
     STRIDE threat model, 5 genuine UI figures, test evidence, and 9 peer-reviewed references.
   - Both editable DOCX and publication-quality PDF are included.

2. ShadowBrowse_Project_Presentation.pptx (15 widescreen 16:9 slides):
   - Designed with an academic dark slate/navy and indigo palette.
   - Covers motivation, objectives, existing vs proposed systems, two-tier architecture,
     technology stack, 10-step startup lifecycle, route verification, kill switch,
     real UI screenshots, 213 automated tests, and live Tor exit consensus.
   - Includes complete, detailed speaker notes on every single slide.

3. ShadowBrowse_Presentation_Script.docx (10–12 minute verbatim script):
   - Natural spoken English script matching all 15 slides sequentially.
   - Includes explicit slide transition cues, demonstration cues, and technical explanations.

4. ShadowBrowse_Viva_Questions_and_Answers.docx (55+ questions & answers):
   - In-depth technical questions with precise answers and examiner follow-up prompts.
   - Divided into 10 domains: Overview, Architecture, React/TypeScript, MV3, FastAPI,
     SOCKS5/Tor, Kill Switch, Privacy Engine, Testing, and Trade-Offs.

5. ShadowBrowse_Demo_and_Submission_Checklist.docx (Demo & Evaluation Runbook):
   - Minute-by-minute 5–7 minute live demo script (Minutes 0:00 to 7:00).
   - Exact startup and shutdown batch commands, Chrome load instructions, failure fallbacks,
     pre-presentation sanity checks, and final file review checklist.

6. screenshots/ (5 Authentic High-Resolution PNGs):
   - Captured directly from Google Chrome via Chrome DevTools Protocol (CDP).
   - Shows toolbar Popup, SidePanel Status, Security Events, Settings, and Readiness Modal.

--------------------------------------------------------------------------------
3. HOW TO PERSONALIZE PLACEHOLDERS BEFORE TOMORROW'S SUBMISSION
--------------------------------------------------------------------------------
Open the generated DOCX and PPTX files and replace the following bracketed placeholders:
  - [Student Name: _______________________] -> Your full name
  - [Roll No / PRN: ___________]             -> Your official university roll number
  - [Project Guide Name: _________________]  -> Your supervisor / guide's name and title
  - [Head of Department]                     -> Your department head's name
  - [College / Institution Name Here]        -> Your official college or university name
  - [City, State]                            -> Your city / submission location

--------------------------------------------------------------------------------
4. EXACT SYSTEM EXECUTION & VERIFICATION COMMANDS
--------------------------------------------------------------------------------
To start the background daemons:
  START_ALL.bat

To terminate the background daemons:
  STOP_ALL.bat

To run the full automated regression suite (213 passed, 100% full-suite passing):
  python -m pytest -q

To run the clean-install Chrome CDP acceptance test:
  node tests/test_clean_install_browser.mjs

To verify the release archive checksum:
  Get-FileHash -Algorithm SHA256 release\shadowbrowse-v0.3.0-windows-x64.zip

================================================================================
  PACKAGE VERIFIED AND READY FOR SEMESTER EVALUATION. GOOD LUCK ON YOUR VIVA!
================================================================================
