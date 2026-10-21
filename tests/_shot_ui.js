// Captura por CDP con PASOS de UI: abre una URL, ejecuta una lista de
// expresiones JS (clicks, abrir paneles), espera entre pasos y saca el PNG.
//   node tests/_shot_ui.js <url> <out.png> <WxH> <steps.json>
// steps.json = [{ "js": "document.getElementById('x').click()", "wait": 800 }, …]
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL_ = process.argv[2];
const OUT = process.argv[3];
const VP = (process.argv[4] || '1600x900').split('x').map(Number);
const STEPS = process.argv[5] ? JSON.parse(fs.readFileSync(process.argv[5], 'utf8')) : [];
const PORT = 9400 + Math.floor(Math.random() * 40);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function connect(u) { return new Promise((res, rej) => { const ws = new WebSocket(u, { perMessageDeflate: false, maxPayload: 512 * 1024 * 1024 }); ws.on('open', () => res(ws)); ws.on('error', rej); }); }
let msgId = 0;
function cdp(ws, method, params = {}) {
  const id = ++msgId;
  return new Promise((res, rej) => {
    const on = (raw) => { let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; } if (m.id !== id) return; ws.off('message', on); if (m.error) return rej(new Error(method + ': ' + JSON.stringify(m.error))); res(m.result); };
    ws.on('message', on); ws.send(JSON.stringify({ id, method, params }));
  });
}
function evaluate(ws, expr) {
  return cdp(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    .then(r => { if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result ? r.result.value : undefined; });
}

(async () => {
  const profile = path.join(os.tmpdir(), 'shotui-' + Date.now());
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--use-angle=swiftshader',
    `--window-size=${VP[0]},${VP[1]}`, '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks', URL_], { stdio: 'ignore' });
  try {
    let target = null;
    for (let i = 0; i < 60; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        target = list.find(t => t.type === 'page' && t.url && t.url.startsWith('http'));
        if (target && target.webSocketDebuggerUrl) break;
      } catch (e) { /* noop */ }
      await sleep(300);
    }
    if (!target) throw new Error('sin target');
    const ws = await connect(target.webSocketDebuggerUrl);
    await cdp(ws, 'Page.enable'); await cdp(ws, 'Runtime.enable');
    await cdp(ws, 'Emulation.setDeviceMetricsOverride', { width: VP[0], height: VP[1], deviceScaleFactor: 1, mobile: false });
    await sleep(6000);

    for (const step of STEPS) {
      if (step.js) {
        try { const r = await evaluate(ws, step.js); if (r !== undefined) console.log('  step ->', JSON.stringify(r).slice(0, 160)); }
        catch (e) { console.warn('  step error:', e.message.slice(0, 200)); }
      }
      await sleep(step.wait || 700);
    }

    const errs = await evaluate(ws, 'JSON.stringify((window.__errs||[]).slice(0,6))').catch(() => '[]');
    console.log('errores de página:', errs);
    const shot = await cdp(ws, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
    console.log('📸', OUT, '(' + Math.round(fs.statSync(OUT).size / 1024) + ' KB)');
    ws.close();
  } finally {
    try { chrome.kill(); } catch (e) { /* noop */ }
  }
  setTimeout(() => process.exit(0), 300);
})();
