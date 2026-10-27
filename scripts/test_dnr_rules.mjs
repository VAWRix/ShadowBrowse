/**
 * Inspect Active Declarative Net Request (DNR) Rules in ShadowBrowse
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EXT_DIR = path.resolve('extension', 'dist');
const USER_DATA_DIR = path.resolve('submission', 'tmp_dnr_test_profile');
const CDP_PORT = 9227;

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

    // Open popup to trigger session start
    const popupTarget = await cdp.send('Target.createTarget', {
      url: `chrome-extension://${extId}/popup.html`,
    });
    const popupSession = (
      await cdp.send('Target.attachToTarget', {
        targetId: popupTarget.result.targetId,
        flatten: true,
      })
    ).result.sessionId;

    await cdp.send('Page.enable', {}, popupSession);
    await cdp.send('Runtime.enable', {}, popupSession);
    await sleep(1500);

    // Query active dynamic DNR rules from background service worker
    const bgRules = await cdp.eval(`
      new Promise((resolve) => {
        chrome.declarativeNetRequest.getDynamicRules((rules) => {
          resolve(rules);
        });
      })
    `, popupSession);

    console.log(`[+] Total Dynamic DNR Rules Currently Registered: ${bgRules?.length || 0}`);
    console.log('Sample Registered DNR Rules:');
    for (const rule of (bgRules || []).slice(0, 10)) {
      console.log(`    - Rule #${rule.id}: action=${rule.action.type}, filter="${rule.condition.urlFilter}", types=${JSON.stringify(rule.condition.resourceTypes || 'ALL')}`);
    }

    // Now start private session in popup
    console.log('\n[*] Starting Private Session via UI click...');
    await cdp.eval(`
      const startBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Start'));
      if (startBtn) startBtn.click();
    `, popupSession);

    await sleep(3500);

    const postStartRules = await cdp.eval(`
      new Promise((resolve) => {
        chrome.declarativeNetRequest.getDynamicRules((rules) => {
          resolve(rules);
        });
      })
    `, popupSession);

    console.log(`\n[+] Dynamic DNR Rules After Session Start: ${postStartRules?.length || 0}`);
    for (const rule of (postStartRules || []).slice(0, 10)) {
      console.log(`    - Rule #${rule.id}: action=${rule.action.type}, filter="${rule.condition.urlFilter}"`);
    }

    chromeProc.kill();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    chromeProc.kill();
    process.exit(1);
  }
}

run();
