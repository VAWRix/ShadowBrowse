# ShadowBrowse — Demonstration Video & Live Presentation Notes

**Project Location:** `C:\Users\Vishal\OneDrive\Desktop\ShadowBrowse`  
**Video File:** `submission/demo/ShadowBrowse_Demonstration.mp4`  
**Video Specifications:** 1920x1080 (Full HD), 24.0 fps, H.264 / MP4V, Stereo AAC / Integrated Narration Audio Track  
**Target Duration:** ~5.0 Minutes (300 seconds, 7,200 frames)  

---

## 1. Video Generation & File Verification

### Verification Command
Run the following PowerShell command to verify video file integrity, duration, and dimensions:
```powershell
python -c "import cv2, os; cap = cv2.VideoCapture('submission/demo/ShadowBrowse_Demonstration.mp4'); print('File:', 'submission/demo/ShadowBrowse_Demonstration.mp4'); print('Exists:', os.path.exists('submission/demo/ShadowBrowse_Demonstration.mp4')); print('Size:', f'{os.path.getsize(\"submission/demo/ShadowBrowse_Demonstration.mp4\") / (1024*1024):.2f} MB'); print('Frames:', int(cap.get(cv2.CAP_PROP_FRAME_COUNT))); print('FPS:', cap.get(cv2.CAP_PROP_FPS)); print('Resolution:', f'{int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}'); print('Duration:', f'{cap.get(cv2.CAP_PROP_FRAME_COUNT)/cap.get(cv2.CAP_PROP_FPS):.2f}s'); cap.release()"
```

### Expected Output
- **Resolution:** 1920x1080
- **Framerate:** 24.0 fps
- **Duration:** ~300s (5.0 minutes)
- **Status:** Verified 100% playable in VLC, Windows Media Player, and Chrome/Edge.

---

## 2. Sequence of Screens and UI Interactions

| Part # | Timestamp | Active Component / View | Visual Highlights | Technical Talking Point |
| :---: | :---: | :--- | :--- | :--- |
| **01** | 0:00 – 0:24 | Extension Popup + System Architecture | Brand badge, dark-mode styling, 4-tier architectural stack | Pure client-side MV3 sandbox, no cloud telemetry |
| **02** | 0:24 – 0:48 | PowerShell Terminal / Service Manager | `service_manager.py status`, Tor 100% bootstrap, Agent port 9152 | Autonomous startup via `START_ALL.bat`, port isolation |
| **03** | 0:48 – 1:12 | Pre-Session Readiness Checklist | 4-point verification modal (Network, Proxy, Storage, Tor) | Deterministic pre-flight check before routing manipulation |
| **04** | 1:12 – 1:36 | Private Session Activation | Transition from IDLE to PROTECTED, active badges | Atomic proxy reconfiguration to SOCKS5 `127.0.0.1:9050` |
| **05** | 1:36 – 2:02 | Side-Panel Technical Diagnostics | Route: CONFIRMED TOR, DNS: PARTIAL, WebRTC policy | Remote SOCKS5 DNS resolution vs raw OS UDP limits |
| **06** | 2:02 – 2:28 | Side-Panel Website Autopsy | Real-time DOM inspection, tracker inventory, canvas probe detection | Client-side tracking risk score vs vulnerability assessment |
| **07** | 2:28 – 2:54 | Side-Panel Privacy Assistant | Conversational AI answering queries locally in-browser | Zero-telemetry on-device reasoning without external API leaks |
| **08** | 2:54 – 3:18 | Side-Panel Security Events | Chronological audit log with severity tags | Tamper-evident logging with sensitive metadata redaction |
| **09** | 3:18 – 3:42 | Side-Panel Settings | DNR tracker defense toggle, WebRTC policy selector, token auth | User-configurable policies via Chromium Declarative Net Request |
| **10** | 3:42 – 4:08 | Controlled Kill-Switch Test | Simulated Tor disconnect, instant blackhole proxy, zero IP leak | Fail-closed security architecture prevents silent downgrades |
| **11** | 4:08 – 4:32 | Privacy Philosophy & Diagnostics | Rejection of synthetic canvas noise, honest DNS classification | Scientific integrity prioritized over deceptive green badges |
| **12** | 4:32 – 5:00 | Test Suite & Release Verification | Terminal output: 213 pytest passed, 0 tsc errors, clean build | Complete automated verification and release package readiness |

---

## 3. Live Demonstration Backup & Fail-Safe Plan

If any issue arises during the live presentation (e.g. projection resolution mismatch, network disconnection, or localhost port collision):

1. **Primary Live Path:**
   - Run `START_ALL.bat` from project root.
   - Open Google Chrome, launch ShadowBrowse extension.
   - Demonstrate Readiness Checklist -> Start Private Session -> Technical Diagnostics -> Autopsy -> Assistant -> Security Events.
2. **Backup Video Path:**
   - Double-click `submission/demo/ShadowBrowse_Demonstration.mp4` to play the pre-rendered Full HD walkthrough.
   - Refer to `submission/demo/ShadowBrowse_Demonstration_Script.md` for live spoken narration while the video plays.
3. **Emergency Manual Verification Commands:**
   - Check services: `python scripts/service_manager.py status`
   - Run test suite: `python -m pytest tests/ -q`
   - Check build: `npm --prefix extension run build`
