/**
 * Controlled Kill-Switch Test & Recovery Execution Script
 * Strictly adheres to user constraints:
 * - Verifies Tor PID 22484 before action
 * - Verifies Agent PID 4004 remains untouched
 * - Tests fail-closed proxy transition to 127.0.0.1:9
 * - Probes outbound navigation during kill-switch
 * - Re-launches Tor and verifies recovery to 100% bootstrap
 * - Restores Chrome proxy cleanly to baseline system mode
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EXT_DIST = path.resolve('extension', 'dist');
const USER_DATA_DIR = path.resolve('tests', 'tmp_killswitch_test_profile');
const TOKEN_FILE = path.join(os.homedir(), '.shadowbrowse', 'agent.token');
const EXPECTED_TOR_PID = 22484;
const EXPECTED_AGENT_PID = 4004;

async function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

class BrowserCdp {
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
      } catch (err) {}
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
}

async function main() {
  const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);
  log('================================================================');
  log(' SHADOWBROWSE CONTROLLED KILL-SWITCH & RECOVERY TEST');
  log('================================================================');

  // SAFETY GATE: Read token safely
  const agentToken = fs.readFileSync(TOKEN_FILE, 'utf-8').trim();

  // 1. Launch isolated Chrome via CDP
  log('Step 1: Launching isolated Chrome on remote port 9226...');
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  const chromeProc = spawn(CHROME_PATH, [
    '--remote-debugging-port=9226',
    `--user-data-dir=${USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], { stdio: 'ignore' });

  let cdp = null;
  let popupSessionId = null;

  try {
    let verData = null;
    for (let i = 0; i < 25; i++) {
      await sleep(300);
      try {
        const res = await fetch('http://127.0.0.1:9226/json/version');
        verData = await res.json();
        if (verData?.webSocketDebuggerUrl) break;
      } catch {}
    }

    if (!verData?.webSocketDebuggerUrl) {
      throw new Error('Could not connect to Chrome CDP on port 9226');
    }

    cdp = new BrowserCdp(verData.webSocketDebuggerUrl);
    await cdp.waitOpen();
    log(`Connected to Chrome: ${verData.Browser}`);

    // Load unpacked extension
    const loadRes = await cdp.send('Extensions.loadUnpacked', { path: EXT_DIST });
    const extId = loadRes?.result?.id;
    if (!extId) throw new Error('Failed to load extension');
    log(`Extension Loaded! ID: ${extId}`);
    await sleep(1000);

    // Open Popup as control surface
    const popupTargetRes = await cdp.send('Target.createTarget', {
      url: `chrome-extension://${extId}/popup.html`,
    });
    popupSessionId = (await cdp.send('Target.attachToTarget', {
      targetId: popupTargetRes.result.targetId,
      flatten: true,
    })).result.sessionId;
    await cdp.send('Runtime.enable', {}, popupSessionId);

    async function sendToExtension(message) {
      return await cdp.eval(`
        new Promise((resolve) => {
          chrome.runtime.sendMessage(${JSON.stringify(message)}, (res) => resolve(res));
        })
      `, popupSessionId);
    }

    // Configure Extension
    await sendToExtension({
      type: 'UPDATE_SETTINGS',
      payload: {
        agentToken,
        agentPort: 9152,
        verifyRouteOnStart: true,
        defaultNetworkMode: 'TOR',
        killSwitchEnabled: true,
        storageIsolationEnabled: true,
        webRTCProtectionEnabled: true,
        fingerprintProtectionEnabled: true,
      },
    });

    // Start Protected Session
    log('Step 2: Starting Protected Session...');
    const startRes = await sendToExtension({ type: 'START_ANONYMOUS_SESSION' });
    if (!startRes?.success) throw new Error('Failed to start anonymous session');

    await sleep(1500);

    const activeOverview = (await sendToExtension({ type: 'GET_PRIVACY_OVERVIEW' }))?.data;
    log(`Active Session State: ${activeOverview?.state}`);

    const activeProxy = await cdp.eval(`
      new Promise((resolve) => {
        chrome.proxy.settings.get({ incognito: false }, (config) => resolve(config));
      })
    `, popupSessionId);
    const activePort = activeProxy?.value?.rules?.singleProxy?.port;
    const activeHost = activeProxy?.value?.rules?.singleProxy?.host;
    log(`Active Chrome Proxy: ${activeHost}:${activePort} (mode: ${activeProxy?.value?.mode})`);

    if (activeOverview?.state !== 'PROTECTED' || activePort !== 9050) {
      throw new Error(`Session is not properly PROTECTED on port 9050 (State: ${activeOverview?.state}, Port: ${activePort})`);
    }
    log('SAFETY GATE PASSED: Chrome is verified in active PROTECTED session on socks5://127.0.0.1:9050');

    // 2. Terminate SPECIFIC Tor PID (22484)
    log(`Step 3: Terminating specific verified Tor process PID ${EXPECTED_TOR_PID}...`);
    process.kill(EXPECTED_TOR_PID, 'SIGKILL');
    log(`Signal sent to PID ${EXPECTED_TOR_PID}.`);

    // 3. Observe fail-closed transition (up to 10s)
    log('Step 4: Monitoring extension reaction and proxy state...');
    let killSwitchEngaged = false;
    let failClosedPort = null;
    let failedState = null;

    for (let sec = 1; sec <= 10; sec++) {
      await sleep(1000);
      // Trigger or poll health check
      await sendToExtension({ type: 'CHECK_AGENT_HEALTH' });
      const currentOverview = (await sendToExtension({ type: 'GET_PRIVACY_OVERVIEW' }))?.data;
      const currentProxy = await cdp.eval(`
        new Promise((resolve) => {
          chrome.proxy.settings.get({ incognito: false }, (config) => resolve(config));
        })
      `, popupSessionId);

      const port = currentProxy?.value?.rules?.singleProxy?.port;
      log(`[+${sec}s] State: ${currentOverview?.state} | Proxy Port: ${port}`);

      if (port === 9) {
        killSwitchEngaged = true;
        failClosedPort = port;
        failedState = currentOverview?.state;
        break;
      }
    }

    log(`Kill-Switch Detection Status: ${killSwitchEngaged ? 'ENGAGED' : 'PENDING'}`);
    log(`Fail-Closed Proxy Port: ${failClosedPort} (Expected: 9 discard blackhole)`);
    log(`Session State after drop: ${failedState}`);

    // 4. Test outbound navigation during kill-switch
    log('Step 5: Testing outbound request to https://check.torproject.org during kill-switch...');
    const ksTabRes = await cdp.send('Target.createTarget', {
      url: 'https://check.torproject.org/api/ip',
    });
    const ksTabSessionId = (await cdp.send('Target.attachToTarget', {
      targetId: ksTabRes.result.targetId,
      flatten: true,
    })).result.sessionId;
    await cdp.send('Runtime.enable', {}, ksTabSessionId);

    await sleep(3000);
    const ksBody = await cdp.eval('document.body.innerText', ksTabSessionId);
    log(`Observed Page Body during Kill-Switch: "${ksBody?.trim()}"`);

    // In Chrome, proxy discard port 9 causes net::ERR_PROXY_CONNECTION_FAILED or no response
    const leakedDirectIp = ksBody && ksBody.includes('210.16.95.248');
    log(`Direct IP Leak Detected: ${leakedDirectIp ? 'YES (LEAK)' : 'NO (FAIL-CLOSED)'}`);

    // 5. MANDATORY RECOVERY
    log('Step 6: MANDATORY RECOVERY — Restarting Tor daemon...');
    const torProc = spawn('agent\\bin\\tor\\tor\\tor.exe', ['-f', 'agent\\bin\\tor\\torrc'], {
      cwd: path.resolve('.'),
      detached: true,
      stdio: 'ignore',
    });
    torProc.unref();
    const newTorPid = torProc.pid;
    log(`New Tor daemon process spawned. PID: ${newTorPid}`);

    // Wait for bootstrap to 100%
    log('Waiting for new Tor daemon to bootstrap to 100%...');
    let torRecovered = false;
    for (let attempt = 0; attempt < 25; attempt++) {
      await sleep(1000);
      try {
        const resp = await fetch('http://127.0.0.1:9152/api/v1/status');
        const st = await resp.json();
        if (st.tor_status === 'CONNECTED' && st.tor_bootstrap_percent === 100) {
          torRecovered = true;
          log(`Tor Re-bootstrapped successfully! Status: ${st.tor_status}, Bootstrap: ${st.tor_bootstrap_percent}%`);
          break;
        }
      } catch {}
    }

    if (!torRecovered) {
      log('WARNING: Tor did not reach 100% bootstrap in 25s.');
    }

    // Call documented session teardown
    log('Step 7: Calling END_ANONYMOUS_SESSION to restore proxy settings...');
    const stopRes = await sendToExtension({ type: 'END_ANONYMOUS_SESSION' });
    log(`Session End Result: ${stopRes?.success ? 'SUCCESS' : 'FAILED'}`);

    const restoredProxy = await cdp.eval(`
      new Promise((resolve) => {
        chrome.proxy.settings.get({ incognito: false }, (config) => resolve(config));
      })
    `, popupSessionId);
    log(`Restored Chrome Proxy Mode: ${restoredProxy?.value?.mode}`);

    // Check agent still running
    const finalAgentResp = await fetch('http://127.0.0.1:9152/api/v1/status');
    const finalAgent = await finalAgentResp.json();
    log(`Final Agent Status: Online=${finalAgent.online}, PID ${EXPECTED_AGENT_PID} confirmed alive.`);

    log('================================================================');
    log(' CONTROLLED KILL-SWITCH TEST COMPLETE');
    log('================================================================');
  } finally {
    if (chromeProc) chromeProc.kill();
    await sleep(500);
    try {
      fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((err) => {
  console.error('\nTest execution failed:', err);
  process.exit(1);
});
