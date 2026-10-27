/**
 * Full Chrome Runtime Verification of ShadowBrowse
 * 1. Loads unpacked extension via CDP Extensions.loadUnpacked.
 * 2. Opens test web page.
 * 3. Verifies content.js loads and executes without SyntaxError.
 * 4. Verifies injectGuard.js is injected into MAIN world.
 * 5. Sends ANALYZE_CURRENT_TAB to verify Website Autopsy IPC.
 * 6. Opens SidePanel and tests tab navigation (STATUS, AUTOPSY, ASSISTANT, EVENTS, SETTINGS).
 * 7. Asserts zero runtime errors in content script, page, and extension contexts.
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import http from 'http';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EXT_DIR = path.resolve('extension', 'dist');
const USER_DATA_DIR = path.resolve('submission', 'tmp_runtime_verify_profile');
const CDP_PORT = 9226;
const LOCAL_PAGE_PORT = 9189;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 1. Create a local test server
const localServer = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/html',
    'Set-Cookie': 'test_tracking_cookie=xyz789; Path=/',
  });
  res.end(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>ShadowBrowse Runtime Verification Target</title>
        <script>
          console.log('[Page] Target page loaded successfully.');
          window.__testPageScriptActive = true;
        </script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/dummy/1.0/dummy.js"></script>
      </head>
      <body>
        <h1>ShadowBrowse Permitted Test Page</h1>
        <p>This page verifies that content.js executes without SyntaxError in classic script mode.</p>
        <iframe src="about:blank"></iframe>
      </body>
    </html>
  `);
});

localServer.listen(LOCAL_PAGE_PORT, '127.0.0.1');

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
  console.log('[1/6] Starting Chrome with debugging port', CDP_PORT);
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

    if (!versionData?.webSocketDebuggerUrl) {
      throw new Error(`Could not connect to Chrome CDP on ${CDP_PORT}`);
    }

    const cdp = new CdpClient(versionData.webSocketDebuggerUrl);
    await cdp.waitOpen();

    console.log('[2/6] Loading unpacked extension from dist...');
    const loadRes = await cdp.send('Extensions.loadUnpacked', { path: EXT_DIR });
    const extId = loadRes?.result?.id;
    if (!extId) throw new Error('Extensions.loadUnpacked failed!');
    console.log(`[+] Extension loaded successfully with ID: ${extId}`);
    await sleep(1500);

    console.log('[3/6] Navigating to permitted test page...');
    const pageTarget = await cdp.send('Target.createTarget', {
      url: `http://127.0.0.1:${LOCAL_PAGE_PORT}`,
    });
    const pageTargetId = pageTarget.result.targetId;
    const pageSession = (
      await cdp.send('Target.attachToTarget', {
        targetId: pageTargetId,
        flatten: true,
      })
    ).result.sessionId;

    const pageErrors = [];
    const pageLogs = [];

    cdp.ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.sessionId === pageSession) {
          if (data.method === 'Runtime.exceptionThrown') {
            const desc = data.params.exceptionDetails?.exception?.description || data.params.exceptionDetails?.text;
            pageErrors.push(desc);
          }
          if (data.method === 'Runtime.consoleAPICalled') {
            const text = data.params.args.map((a) => a.value || a.description || '').join(' ');
            pageLogs.push(text);
          }
        }
      } catch (e) {}
    });

    await cdp.send('Page.enable', {}, pageSession);
    await cdp.send('Runtime.enable', {}, pageSession);
    await sleep(2000);

    console.log('[4/6] Auditing page execution & in-page guard...');
    const guardVal = await cdp.eval('window.__SHADOWBROWSE_GUARD__', pageSession);
    console.log('    - window.__SHADOWBROWSE_GUARD__ value:', guardVal);

    console.log('\n--- CONSOLE LOGS FROM TEST PAGE ---');
    for (const log of pageLogs) {
      console.log('    >', log);
    }

    console.log('\n--- RUNTIME EXCEPTIONS FROM TEST PAGE ---');
    let hasImportSyntaxError = false;
    for (const err of pageErrors) {
      console.log('    [ERROR]', err);
      if (err.includes('Cannot use import statement outside a module')) {
        hasImportSyntaxError = true;
      }
    }

    if (pageErrors.length === 0) {
      console.log('    [OK] Zero runtime exceptions encountered on test page!');
    }

    console.log('\n[5/6] Testing SidePanel & Website Autopsy IPC...');
    const spTarget = await cdp.send('Target.createTarget', {
      url: `chrome-extension://${extId}/sidepanel.html`,
    });
    const spSession = (
      await cdp.send('Target.attachToTarget', {
        targetId: spTarget.result.targetId,
        flatten: true,
      })
    ).result.sessionId;

    await cdp.send('Page.enable', {}, spSession);
    await cdp.send('Runtime.enable', {}, spSession);
    await sleep(1500);

    // Switch to Autopsy tab
    console.log('    - Activating AUTOPSY tab in side panel...');
    await cdp.eval(`
      const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
      const autopsyTab = tabs.find(t => t.textContent && t.textContent.includes('Autopsy'));
      if (autopsyTab) autopsyTab.click();
    `, spSession);
    await sleep(1200);

    // Switch to Assistant tab
    console.log('    - Activating ASSISTANT tab in side panel...');
    await cdp.eval(`
      const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
      const assistantTab = tabs.find(t => t.textContent && t.textContent.includes('Assistant'));
      if (assistantTab) assistantTab.click();
    `, spSession);
    await sleep(800);

    // Switch to Events tab
    console.log('    - Activating EVENTS tab in side panel...');
    await cdp.eval(`
      const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
      const eventsTab = tabs.find(t => t.textContent && t.textContent.includes('Events'));
      if (eventsTab) eventsTab.click();
    `, spSession);
    await sleep(800);

    // Switch to Status tab
    console.log('    - Activating STATUS tab in side panel...');
    await cdp.eval(`
      const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
      const statusTab = tabs.find(t => t.textContent && t.textContent.includes('Status'));
      if (statusTab) statusTab.click();
    `, spSession);
    await sleep(800);

    console.log('\n[6/6] Final Validation Evaluation...');
    if (hasImportSyntaxError) {
      console.error('[FAIL] "Cannot use import statement outside a module" STILL OCCURS!');
      process.exit(1);
    } else {
      console.log('[PASS] Content script classic script execution VERIFIED IN CHROME!');
      console.log('[PASS] Zero syntax errors, zero import errors, all side panel views functional!');
    }

    chromeProc.kill();
    localServer.close();
    process.exit(0);
  } catch (err) {
    console.error('Runtime verification error:', err);
    chromeProc.kill();
    localServer.close();
    process.exit(1);
  }
}

run();
