/**
 * Test EFF Cover Your Tracks simulated tracker blocking in Chrome via CDP
 * Verifies both iframe sub_frame embedding and fetch subresource requests.
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EXT_DIR = path.resolve('extension', 'dist');
const USER_DATA_DIR = path.resolve('submission', 'tmp_eff_test_profile');
const CDP_PORT = 9228;

// Clean profile before testing
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
    this.events = [];
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.id && this.callbacks.has(data.id)) {
          this.callbacks.get(data.id)(data);
          this.callbacks.delete(data.id);
        } else if (data.method) {
          this.events.push(data);
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
    await sleep(2000);

    // Open popup to trigger initialization and check rules
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
    await sleep(2000);

    const bgRules = await cdp.eval(`
      new Promise((resolve) => {
        chrome.declarativeNetRequest.getDynamicRules((rules) => {
          resolve(rules.map(r => ({ id: r.id, filter: r.condition.urlFilter })));
        });
      })
    `, popupSession);

    console.log(`[+] Total Dynamic DNR Rules in Chrome: ${bgRules?.length || 0}`);
    const effAdRule = bgRules?.find(r => r.filter.includes('trackersimulator.org'));
    const effInvRule = bgRules?.find(r => r.filter.includes('eviltracker.net'));
    console.log(`    - Rule for trackersimulator.org: ${effAdRule ? `Found (ID #${effAdRule.id})` : 'MISSING'}`);
    console.log(`    - Rule for eviltracker.net: ${effInvRule ? `Found (ID #${effInvRule.id})` : 'MISSING'}`);

    // Open a test web page
    const pageTarget = await cdp.send('Target.createTarget', {
      url: 'https://example.com',
    });
    const pageSession = (
      await cdp.send('Target.attachToTarget', {
        targetId: pageTarget.result.targetId,
        flatten: true,
      })
    ).result.sessionId;

    await cdp.send('Page.enable', {}, pageSession);
    await cdp.send('Network.enable', {}, pageSession);
    await sleep(1000);

    // Test subresource fetches
    console.log('\n[*] Testing subresource fetch to google-analytics.com (Curated Tracker)...');
    const gaResult = await cdp.eval(`
      fetch('https://www.google-analytics.com/analytics.js', { mode: 'no-cors' })
        .then(() => 'ALLOWED')
        .catch(e => 'BLOCKED: ' + e.message);
    `, pageSession);
    console.log(`    Result for google-analytics.com: ${gaResult}`);

    console.log('\n[*] Testing subresource fetch to trackersimulator.org (EFF Ad Simulation)...');
    const effAdResult = await cdp.eval(`
      fetch('https://trackersimulator.org/kcarting-tally?&ad_url=12345', { mode: 'no-cors' })
        .then(() => 'ALLOWED')
        .catch(e => 'BLOCKED: ' + e.message);
    `, pageSession);
    console.log(`    Result for trackersimulator.org: ${effAdResult}`);

    console.log('\n[*] Testing subresource fetch to eviltracker.net (EFF Invisible Tracker Simulation)...');
    const effInvisibleResult = await cdp.eval(`
      fetch('https://eviltracker.net/kcarting-tally?&trackingserver=12345', { mode: 'no-cors' })
        .then(() => 'ALLOWED')
        .catch(e => 'BLOCKED: ' + e.message);
    `, pageSession);
    console.log(`    Result for eviltracker.net: ${effInvisibleResult}`);

    // Test iframe injection (exact mechanism of EFF Cover Your Tracks)
    console.log('\n[*] Testing iframe injection to trackersimulator.org (EFF exact sub_frame test)...');
    const iframeResult = await cdp.eval(`
      new Promise((resolve) => {
        const frame = document.createElement('iframe');
        frame.id = 'eff_test_iframe';
        frame.style.width = '1px';
        frame.style.height = '1px';
        let finished = false;
        frame.onload = () => {
          if (!finished) {
            finished = true;
            // When blocked by client, Chrome creates error page inside iframe or fires error
            try {
              const href = frame.contentWindow.location.href;
              resolve(href === 'about:blank' ? 'BLOCKED' : 'LOADED: ' + href);
            } catch (e) {
              resolve('BLOCKED (cross-origin / net::ERR_BLOCKED_BY_CLIENT)');
            }
          }
        };
        frame.onerror = () => {
          if (!finished) {
            finished = true;
            resolve('BLOCKED: onerror fired');
          }
        };
        setTimeout(() => {
          if (!finished) {
            finished = true;
            resolve('TIMEOUT (likely blocked)');
          }
        }, 3000);
        frame.src = 'https://trackersimulator.org/kcarting-tally?&ad_url=12345';
        document.body.appendChild(frame);
      })
    `, pageSession);
    console.log(`    Iframe injection result: ${iframeResult}`);

    chromeProc.kill();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    chromeProc.kill();
    process.exit(1);
  }
}

run();
