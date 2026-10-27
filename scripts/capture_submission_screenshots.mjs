/**
 * Capture High-Resolution Real UI Screenshots of ShadowBrowse
 * For Semester Project Report, Presentation Slides, and Demo Guide.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EXT_DIR = path.resolve('extension', 'dist');
const USER_DATA_DIR = path.resolve('submission', 'tmp_screenshot_profile');
const SCREENSHOT_DIR = path.resolve('submission', 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

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

  async captureScreenshot(outputPath, sessionId = undefined) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' }, sessionId);
    if (res?.result?.data) {
      fs.writeFileSync(outputPath, Buffer.from(res.result.data, 'base64'));
      console.log(`Saved screenshot: ${outputPath} (${fs.statSync(outputPath).size} bytes)`);
    } else {
      console.warn(`Failed to capture screenshot for ${outputPath}`, res);
    }
  }
}

async function main() {
  console.log('[1/5] Starting Chrome with remote debugging on port 9225...');
  const chromeProcess = spawn(CHROME_PATH, [
    `--remote-debugging-port=9225`,
    `--user-data-dir=${USER_DATA_DIR}`,
    `--window-size=1280,800`,
    `--no-first-run`,
    `--no-default-browser-check`,
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    let versionData = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      await sleep(300);
      try {
        const resp = await fetch('http://127.0.0.1:9225/json/version');
        versionData = await resp.json();
        if (versionData?.webSocketDebuggerUrl) break;
      } catch (e) {}
    }

    if (!versionData?.webSocketDebuggerUrl) {
      throw new Error('Could not connect to Chrome CDP on 9225');
    }

    const cdp = new CdpClient(versionData.webSocketDebuggerUrl);
    await cdp.waitOpen();

    console.log('[2/5] Loading extension from extension/dist...');
    const loadRes = await cdp.send('Extensions.loadUnpacked', { path: EXT_DIR });
    const extId = loadRes?.result?.id;
    if (!extId) throw new Error('Failed to load extension');
    console.log(`Loaded extension: ${extId}`);
    await sleep(1200);

    // 1. Popup Screenshot (with Diagnostics opened)
    console.log('[3/5] Capturing Popup screenshot...');
    const popupTarget = await cdp.send('Target.createTarget', {
      url: `chrome-extension://${extId}/popup.html`,
    });
    const popupSession = (await cdp.send('Target.attachToTarget', {
      targetId: popupTarget.result.targetId,
      flatten: true,
    })).result.sessionId;
    await cdp.send('Page.enable', {}, popupSession);
    await cdp.send('Runtime.enable', {}, popupSession);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 440,
      height: 700,
      deviceScaleFactor: 2,
      mobile: false,
    }, popupSession);
    await sleep(1200);

    // Click Technical Diagnostics collapsible summary to show DNS Classification
    await cdp.eval(`
      const summary = document.querySelector('.sb-details-summary');
      if (summary) summary.click();
    `, popupSession);
    await sleep(800);
    await cdp.captureScreenshot(path.join(SCREENSHOT_DIR, 'screenshot_popup.png'), popupSession);

    // 2. Sidepanel Screenshots
    console.log('[4/5] Capturing SidePanel screenshots (Status, Autopsy, Assistant, Events, Settings)...');
    const spTarget = await cdp.send('Target.createTarget', {
      url: `chrome-extension://${extId}/sidepanel.html`,
    });
    const spSession = (await cdp.send('Target.attachToTarget', {
      targetId: spTarget.result.targetId,
      flatten: true,
    })).result.sessionId;
    await cdp.send('Page.enable', {}, spSession);
    await cdp.send('Runtime.enable', {}, spSession);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 480,
      height: 750,
      deviceScaleFactor: 2,
      mobile: false,
    }, spSession);
    await sleep(1500);

    // Tab 1: Status
    await cdp.captureScreenshot(path.join(SCREENSHOT_DIR, 'screenshot_sidepanel_status.png'), spSession);

    // Tab 2: Autopsy
    console.log('Capturing Autopsy view...');
    await cdp.eval(`document.getElementById('tab-autopsy')?.click()`, spSession);
    await sleep(800);
    await cdp.captureScreenshot(path.join(SCREENSHOT_DIR, 'screenshot_sidepanel_autopsy.png'), spSession);

    // Tab 3: Assistant
    console.log('Capturing Assistant view...');
    await cdp.eval(`document.getElementById('tab-assistant')?.click()`, spSession);
    await sleep(800);
    await cdp.captureScreenshot(path.join(SCREENSHOT_DIR, 'screenshot_sidepanel_assistant.png'), spSession);

    // Tab 4: Security Events
    console.log('Capturing Events view...');
    await cdp.eval(`document.getElementById('tab-events')?.click()`, spSession);
    await sleep(800);
    await cdp.captureScreenshot(path.join(SCREENSHOT_DIR, 'screenshot_sidepanel_events.png'), spSession);

    // Tab 5: Settings
    console.log('Capturing Settings view...');
    await cdp.eval(`document.getElementById('tab-settings')?.click()`, spSession);
    await sleep(800);
    await cdp.captureScreenshot(path.join(SCREENSHOT_DIR, 'screenshot_sidepanel_settings.png'), spSession);

    // Return to Status and open Readiness Checklist
    console.log('[5/5] Capturing Readiness Checklist...');
    await cdp.eval(`document.getElementById('tab-status')?.click()`, spSession);
    await sleep(600);
    await cdp.eval(`
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Readiness') || b.textContent.includes('Checklist'));
      if (btn) btn.click();
    `, spSession);
    await sleep(800);
    await cdp.captureScreenshot(path.join(SCREENSHOT_DIR, 'screenshot_readiness_modal.png'), spSession);

    console.log('All authentic UI screenshots captured successfully!');
  } finally {
    chromeProcess.kill();
    await sleep(500);
    try {
      fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
    } catch (e) {}
  }
}

main().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
