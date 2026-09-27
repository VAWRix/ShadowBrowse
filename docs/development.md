# Developer & Setup Guide

## Quickstart

### 1. Build the Browser Extension
```bash
cd extension
npm install
npm run build
```
The unpacked Chrome extension will be compiled into `extension/dist/`.

#### Loading the Unpacked Extension in Chrome:
1. Open Google Chrome (or Edge / Brave).
2. Navigate to `chrome://extensions/`.
3. Enable **Developer mode** toggle in the top-right corner.
4. Click **Load unpacked**.
5. Select the folder: `<project-root>/extension/dist` (or `./extension/dist`).
6. Pin the **ShadowBrowse** icon to your browser toolbar.

---

### 2. Start the Local Privacy Agent (`shadow-agent`)
```bash
# In project root
python -m agent.src.main --port 9152
```
This binds the local agent strictly to `127.0.0.1:9152` and outputs the secret `X-Shadow-Token`.

---

### 3. Run the Automated Test Suite
```bash
# Run Python agent unit & security tests
python -m pytest agent/tests/test_agent.py -v

# Typecheck and lint extension
cd extension
npm run typecheck
```

---

### 4. Run the Controlled Web Lab
```bash
python tests/web-lab/server.py
```
Visit `http://127.0.0.1:8080/` to test trackers, canvas fingerprint probing, WebRTC candidate leaks, and storage isolation.
