/**
 * Test Website Autopsy active tab tracking and loopback classification
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EXT_DIR = path.resolve('extension', 'dist');
const USER_DATA_DIR = path.resolve('submission', 'tmp_autopsy_test_profile');
const CDP_PORT = 9229;

if (fs.existsSync(USER_DATA_DIR)) {
  fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
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
    const res = await this.send(
      'Runtime.evaluate',
      {
        expression,
        awaitPromise: true,
        returnByValue: true,
      },
      sessionId
    );
    return res?.result?.result?.value;
  }
}

async function run() {
  const chromeProc = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${USER_DATA_DIR}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  try {
    let versionData = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      await sleep(300);
      try {
        const resp = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
        versionData = await resp.json();
        if (versionData?.webSocketDebuggerUrl) break;
      } catch (e) {}
    }

    const cdp = new CdpClient(versionData.webSocketDebuggerUrl);
    await cdp.waitOpen();

    const loadRes = await cdp.send('Extensions.loadUnpacked', { path: EXT_DIR });
    const extId = loadRes?.result?.id;
    console.log(`[+] Loaded extension ID: ${extId}`);
    await sleep(1500);

    // Tab 1: 127.0.0.1:9152 (Agent API / Dashboard)
    console.log('\n[*] Navigating Tab 1 to http://127.0.0.1:9152/health...');
    const tab1 = await cdp.send('Target.createTarget', {
      url: 'http://127.0.0.1:9152/health',
    });
    const session1 = (
      await cdp.send('Target.attachToTarget', {
        targetId: tab1.result.targetId,
        flatten: true,
      })
    ).result.sessionId;
    await cdp.send('Page.enable', {}, session1);
    await sleep(2000);

    // Get background service worker to test sending message to tab 1
    const targets = await cdp.send('Target.getTargets');
    const bgTarget = targets.result.targetInfos.find(
      t => t.type === 'service_worker' && t.url.includes(extId)
    );
    const bgSession = (
      await cdp.send('Target.attachToTarget', {
        targetId: bgTarget.targetId,
        flatten: true,
      })
    ).result.sessionId;

    // Find tab 1 ID from extension context
    const tab1Info = await cdp.eval(`
      new Promise((resolve) => {
        chrome.tabs.query({ url: '*://127.0.0.1/*' }, (tabs) => {
          resolve(tabs[0]);
        });
      })
    `, bgSession);

    console.log(`[+] Found Tab 1 in Chrome (ID #${tab1Info.id}, URL: ${tab1Info.url})`);

    // Send ANALYZE_CURRENT_TAB from extension context to Tab 1
    const autopsy1 = await cdp.eval(`
      new Promise((resolve) => {
        chrome.tabs.sendMessage(${tab1Info.id}, { type: 'ANALYZE_CURRENT_TAB' }, (res) => {
          resolve(res?.data);
        });
      })
    `, bgSession);

    console.log(`[+] Tab 1 Autopsy Results:`);
    console.log(`    Domain: ${autopsy1?.domain}`);
    console.log(`    Exposure Score: ${autopsy1?.exposureScore}`);
    console.log(`    Privacy Exposure: ${autopsy1?.privacyExposure}`);
    console.log(`    Certificate Status: ${autopsy1?.network?.certificateStatus}`);
    console.log(`    Protocol: ${autopsy1?.network?.protocol}`);
    console.log(`    Explanations: ${JSON.stringify(autopsy1?.explanations)}`);

    // Tab 2: Remote HTTPS site
    console.log('\n[*] Navigating Tab 2 to https://example.com...');
    const tab2 = await cdp.send('Target.createTarget', {
      url: 'https://example.com',
    });
    await sleep(2000);

    const tab2Info = await cdp.eval(`
      new Promise((resolve) => {
        chrome.tabs.query({ url: '*://example.com/*' }, (tabs) => {
          resolve(tabs[0]);
        });
      })
    `, bgSession);

    console.log(`[+] Found Tab 2 in Chrome (ID #${tab2Info.id}, URL: ${tab2Info.url})`);

    const autopsy2 = await cdp.eval(`
      new Promise((resolve) => {
        chrome.tabs.sendMessage(${tab2Info.id}, { type: 'ANALYZE_CURRENT_TAB' }, (res) => {
          resolve(res?.data);
        });
      })
    `, bgSession);

    console.log(`[+] Tab 2 Autopsy Results:`);
    console.log(`    Domain: ${autopsy2?.domain}`);
    console.log(`    Exposure Score: ${autopsy2?.exposureScore}`);
    console.log(`    Privacy Exposure: ${autopsy2?.privacyExposure}`);
    console.log(`    Certificate Status: ${autopsy2?.network?.certificateStatus}`);
    console.log(`    Protocol: ${autopsy2?.network?.protocol}`);
    console.log(`    Explanations: ${JSON.stringify(autopsy2?.explanations)}`);

    chromeProc.kill();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    chromeProc.kill();
    process.exit(1);
  }
}

run();
