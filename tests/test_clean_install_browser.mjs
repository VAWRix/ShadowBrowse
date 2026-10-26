/**
 * ShadowBrowse Phase 12 — Clean-Install Browser Acceptance Validation
 * ===================================================================
 * Verifies that the packaged release ZIP archive extracts and runs cleanly
 * in an isolated environment without relying on the development workspace.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ZIP_PATH = path.resolve('release', 'shadowbrowse-v0.3.0-windows-x64.zip');
const EXTRACT_DIR = path.resolve('tests', 'tmp_clean_install_runtime');
const USER_DATA_DIR = path.resolve('tests', 'tmp_clean_install_chrome_profile');

const results = {
  zipExtracted: false,
  extractedAssetsVerified: false,
  chromeLaunched: false,
  extensionLoaded: false,
  extensionId: null,
  popupLoaded: false,
  missingAgentHandledHonestly: false,
  sidepanelLoaded: false,
  cleanupComplete: false,
};

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.msgId = 0;
    this.callbacks = new Map();
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.id && this.callbacks.has(data.id)) {
          this.callbacks.get(data.id)(data);
          this.callbacks.delete(data.id);
        }
      } catch (e) {}
    };
  }

  async waitOpen() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
  }

  send(method, params = {}, sessionId = undefined) {
    return new Promise((resolve) => {
      const id = ++this.msgId;
      this.callbacks.set(id, resolve);
      const req = { id, method, params };
      if (sessionId) req.sessionId = sessionId;
      this.ws.send(JSON.stringify(req));
    });
  }

  async eval(expression, sessionId = undefined) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    }, sessionId);
    return res?.result?.result?.value;
  }

  close() {
    try {
      this.ws.close();
    } catch (e) {}
  }
}

async function runCleanInstallAcceptance() {
  console.log('=================================================================');
  console.log('SHADOWBROWSE PHASE 12 — CLEAN-INSTALL ACCEPTANCE TEST');
  console.log('=================================================================\n');

  if (!fs.existsSync(ZIP_PATH)) {
    throw new Error(`Release ZIP not found at: ${ZIP_PATH}`);
  }

  // 1. Clean previous temp directories
  if (fs.existsSync(EXTRACT_DIR)) fs.rmSync(EXTRACT_DIR, { recursive: true, force: true });
  if (fs.existsSync(USER_DATA_DIR)) fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(EXTRACT_DIR, { recursive: true });
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });

  // 2. Extract Release ZIP using PowerShell Expand-Archive
  console.log('[1/5] Extracting release ZIP into isolated temporary environment...');
  const extractProc = spawn('powershell', [
    '-NoProfile',
    '-Command',
    `Expand-Archive -Path "${ZIP_PATH}" -DestinationPath "${EXTRACT_DIR}" -Force`,
  ], { stdio: 'inherit' });

  await new Promise((resolve, reject) => {
    extractProc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Expand-Archive failed with code ${code}`));
    });
  });

  results.zipExtracted = true;
  console.log('      Archive extracted successfully.');

  const packageRoot = path.join(EXTRACT_DIR, 'shadowbrowse-v0.3.0-windows-x64');
  const extractedExt = path.join(packageRoot, 'extension');

  // 3. Verify extracted assets
  console.log('[2/5] Verifying extracted package assets and manifest references...');
  const requiredFiles = [
    path.join(packageRoot, 'README.txt'),
    path.join(packageRoot, 'UNINSTALL.txt'),
    path.join(packageRoot, 'LICENSE-TOR.txt'),
    path.join(packageRoot, 'START_ALL.bat'),
    path.join(packageRoot, 'STOP_ALL.bat'),
    path.join(extractedExt, 'manifest.json'),
    path.join(extractedExt, 'popup.html'),
    path.join(extractedExt, 'sidepanel.html'),
    path.join(extractedExt, 'background.js'),
    path.join(extractedExt, 'content.js'),
    path.join(extractedExt, 'injectGuard.js'),
    path.join(packageRoot, 'agent', 'src', 'main.py'),
    path.join(packageRoot, 'agent', 'requirements.txt'),
    path.join(packageRoot, 'tor', 'tor', 'tor.exe'),
    path.join(packageRoot, 'tor', 'torrc'),
  ];

  for (const f of requiredFiles) {
    if (!fs.existsSync(f)) {
      throw new Error(`Clean-install asset verification failed: Missing ${f}`);
    }
  }
  results.extractedAssetsVerified = true;
  console.log('      All extracted runtime files verified present.');

  // 4. Launch Clean Chrome Profile loading the extracted extension
  console.log('[3/5] Launching clean Chrome instance with extracted extension...');
  const chromeProcess = spawn(CHROME_PATH, [
    `--remote-debugging-port=9222`,
    `--user-data-dir=${USER_DATA_DIR}`,
    `--no-first-run`,
    `--no-default-browser-check`,
    'about:blank',
  ], { stdio: 'ignore' });
  results.chromeLaunched = true;

  try {
    let versionData = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      await sleep(400);
      try {
        const resp = await fetch('http://127.0.0.1:9222/json/version');
        versionData = await resp.json();
        if (versionData?.webSocketDebuggerUrl) break;
      } catch (e) {}
    }

    if (!versionData?.webSocketDebuggerUrl) {
      throw new Error('Failed to connect to Chrome DevTools Protocol at http://127.0.0.1:9222');
    }

    const cdp = new CdpClient(versionData.webSocketDebuggerUrl);
    await cdp.waitOpen();
    console.log(`      Connected to ${versionData.Browser}`);

    // Load unpacked extension from the extracted directory
    console.log('[4/5] Loading extracted extension via CDP Extensions.loadUnpacked...');
    const loadRes = await cdp.send('Extensions.loadUnpacked', { path: extractedExt });
    const extId = loadRes?.result?.id;

    if (!extId) {
      throw new Error(`Failed to load extracted extension: ${JSON.stringify(loadRes)}`);
    }
    results.extensionLoaded = true;
    results.extensionId = extId;
    console.log(`      Extracted extension loaded! Extension ID: ${extId}`);

    await sleep(1500);

    // Open Popup
    console.log('[5/5] Exercising extracted Popup UI and honest offline reporting...');
    const popupTargetRes = await cdp.send('Target.createTarget', {
      url: `chrome-extension://${extId}/popup.html`,
    });
    const popupTargetId = popupTargetRes?.result?.targetId;
    const popupAttach = await cdp.send('Target.attachToTarget', {
      targetId: popupTargetId,
      flatten: true,
    });
    const popupSessionId = popupAttach?.result?.sessionId;

    await cdp.send('Runtime.enable', {}, popupSessionId);

    // Wait for React to mount
    let popupMounted = false;
    for (let i = 0; i < 20; i++) {
      await sleep(300);
      const childCount = await cdp.eval('document.getElementById("root")?.children?.length || 0', popupSessionId);
      if (childCount > 0) {
        popupMounted = true;
        break;
      }
    }
    results.popupLoaded = popupMounted;

    // Test honest reporting of offline agent when agent is not running
    const healthCheck = await cdp.eval(`
      new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'CHECK_AGENT_HEALTH' }, (res) => resolve(res));
      })
    `, popupSessionId);

    console.log('      CHECK_AGENT_HEALTH response:', JSON.stringify(healthCheck));
    const isOnline = healthCheck?.data?.online === true;
    const isTorConnected = healthCheck?.data?.torStatus === 'CONNECTED';
    // When agent is offline, it must NOT report online=true or torStatus=CONNECTED
    const honestOffline = healthCheck?.success === true && !isOnline && !isTorConnected;
    results.missingAgentHandledHonestly = honestOffline;
    console.log('      Offline agent reported honestly:', honestOffline);

    // Open Side Panel
    const sidepanelTargetRes = await cdp.send('Target.createTarget', {
      url: `chrome-extension://${extId}/sidepanel.html`,
    });
    const sidepanelTargetId = sidepanelTargetRes?.result?.targetId;
    const sidepanelAttach = await cdp.send('Target.attachToTarget', {
      targetId: sidepanelTargetId,
      flatten: true,
    });
    const sidepanelSessionId = sidepanelAttach?.result?.sessionId;

    await cdp.send('Runtime.enable', {}, sidepanelSessionId);

    let sidepanelMounted = false;
    for (let i = 0; i < 20; i++) {
      await sleep(300);
      const childCount = await cdp.eval('document.getElementById("root")?.children?.length || 0', sidepanelSessionId);
      if (childCount > 0) {
        sidepanelMounted = true;
        break;
      }
    }
    results.sidepanelLoaded = sidepanelMounted;
    console.log('      Extracted side panel mounted successfully:', sidepanelMounted);

    cdp.close();
  } finally {
    console.log('\nCleaning up Chrome test process...');
    chromeProcess.kill('SIGTERM');
    await sleep(1000);
    try {
      chromeProcess.kill('SIGKILL');
    } catch (e) {}

    // Cleanup extracted test dirs
    if (fs.existsSync(EXTRACT_DIR)) fs.rmSync(EXTRACT_DIR, { recursive: true, force: true });
    if (fs.existsSync(USER_DATA_DIR)) fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
    results.cleanupComplete = true;
  }

  console.log('\n=================================================================');
  console.log('CLEAN-INSTALL ACCEPTANCE TEST SUMMARY');
  console.log('=================================================================');
  console.log(`Release Archive:               ${ZIP_PATH}`);
  console.log(`Extracted Assets Verified:     ${results.extractedAssetsVerified}`);
  console.log(`Chrome Clean Launch:           ${results.chromeLaunched}`);
  console.log(`Extracted Extension Loaded:    ${results.extensionLoaded}`);
  console.log(`Extension ID:                  ${results.extensionId}`);
  console.log(`Popup Mounted & Rendered:      ${results.popupLoaded}`);
  console.log(`Honest Offline State Handled:  ${results.missingAgentHandledHonestly}`);
  console.log(`Side Panel Mounted & Rendered: ${results.sidepanelLoaded}`);
  console.log(`Cleanup Completed:             ${results.cleanupComplete}`);
  console.log('=================================================================\n');
}

runCleanInstallAcceptance().catch((err) => {
  console.error('\nCLEAN-INSTALL ACCEPTANCE FAILURE:', err);
  process.exit(1);
});
