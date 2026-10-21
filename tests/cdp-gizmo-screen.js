// Regresión: con el panel ADMIN abierto y una PANTALLA seleccionada (gizmo visible),
// el click sobre las FLECHITAS del gizmo tiene que MOVER la pantalla y NO disparar
// el toque/raycast sobre la pantalla (que alimenta el shader / la web).
//
// Incluye el caso que rompía: el mouse viene del PANEL (no hubo hover sobre el
// canvas), así que `transformControls.axis` estaba viejo/null en el pointerdown.
//
// Uso: node tests/cdp-gizmo-screen.js ["<url>"] [out.png]
// Restaura data/room3d_config.json al terminar (el arrastre autoguarda la escena).
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://localhost:6645/jpstagedesign/output3d.html';
const OUT = process.argv[3] || path.join(os.tmpdir(), 'gizmo_screen.png');
const CONFIG = path.join(__dirname, '..', 'data', 'room3d_config.json');
const BAK = CONFIG + '.gizmotest.bak';
const PORT = 9400 + Math.floor(Math.random() * 30);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function connect(u) { return new Promise((res, rej) => { const ws = new WebSocket(u, { perMessageDeflate: false, maxPayload: 512 * 1024 * 1024 }); ws.on('open', () => res(ws)); ws.on('error', rej); }); }
let id = 0;
function cdp(ws, method, params = {}) {
  const mid = ++id;
  return new Promise((res, rej) => {
    const on = (raw) => { let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; } if (m.id !== mid) return; ws.off('message', on); if (m.error) return rej(new Error(method + ' ' + JSON.stringify(m.error))); res(m.result); };
    ws.on('message', on); ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
async function ev(ws, expr) {
  const r = await cdp(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500));
  return r.result ? r.result.value : undefined;
}

(async () => {
  if (fs.existsSync(CONFIG)) fs.copyFileSync(CONFIG, BAK);
  const profile = path.join(os.tmpdir(), 'jp-gzscreen-' + Date.now());
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1600,900', '--hide-scrollbars',
    '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks', 'about:blank'], { stdio: 'ignore' });
  const R = { url: BASE };
  try {
    let target = null;
    for (let i = 0; i < 50; i++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); target = l.find(t => t.type === 'page'); if (target && target.webSocketDebuggerUrl) break; } catch (e) { } await sleep(300); }
    const ws = await connect(target.webSocketDebuggerUrl);
    await cdp(ws, 'Page.enable'); await cdp(ws, 'Runtime.enable');
    await cdp(ws, 'Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp(ws, 'Page.navigate', { url: BASE });

    for (let i = 0; i < 40; i++) { await sleep(700); const ok = await ev(ws, `!!(window.JPStageTouch && window.JPStageTouch.screens && window.JPStageTouch.screens().length)`); if (ok) break; }
    await sleep(2500);

    const move = (x, y, extra = {}) => cdp(ws, 'Input.dispatchMouseEvent', Object.assign({ type: 'mouseMoved', x: Math.round(x), y: Math.round(y), button: 'none', buttons: 0, pointerType: 'mouse' }, extra));
    const press = (x, y) => cdp(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, buttons: 1, pointerType: 'mouse' });
    const release = (x, y) => cdp(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, buttons: 0, pointerType: 'mouse' });
    const key = async (k, code, vk) => {
      await cdp(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
      await cdp(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    };

    // 1) modo ADMIN
    await key('p', 'KeyP', 80);
    await sleep(700);
    R.adminMode = await ev(ws, `document.body.classList.contains('admin-mode')`);

    // 2) punto cerca del centro de una PANTALLA (la más grande y no muteada)
    const hit = await ev(ws, `(() => {
      const T = window.JPStageTouch;
      const scr = T.screens().filter(s => !s.muted && !/calco|marca/i.test(s.name)).sort((a,b) => (b.width*b.height) - (a.width*a.height))[0];
      if (!scr) return null;
      let best = null;
      for (let y = 80; y < innerHeight - 80; y += 6) for (let x = 240; x < innerWidth - 40; x += 6) {
        const s = T.pick(x, y); if (!s || s.id !== scr.id) continue;
        const pt = T.point(s, x, y); if (!pt) continue;
        const d = Math.abs(pt.u - .5) + Math.abs(pt.v - .5);
        if (!best || d < best.d) best = { d, x, y, id: s.id, name: s.name };
      }
      return best;
    })()`);
    R.pantallaElegida = hit;
    if (!hit) throw new Error('no se encontró una pantalla en viewport');

    // 3) click real para seleccionarla
    await move(hit.x, hit.y);
    await press(hit.x, hit.y); await release(hit.x, hit.y);
    await sleep(700);
    R.seleccion = await ev(ws, `(() => { const tc = window.JPStageTouch.transform(); return { adjunto: !!(tc && tc.object), id: tc && tc.object && tc.object.userData && tc.object.userData.screenId, modo: tc && tc.mode }; })()`);

    // 4) buscar un punto del gizmo (flecha) alrededor del objeto
    const axis = await ev(ws, `(() => {
      const tc = window.JPStageTouch.transform(), cam = window.JPStageTouch.camera();
      if (!tc || !tc.object) return null;
      const wp = new THREE.Vector3(); tc.object.getWorldPosition(wp);
      const p = wp.clone().project(cam);
      const cx = (p.x + 1) / 2 * innerWidth, cy = (-p.y + 1) / 2 * innerHeight;
      return { cx, cy };
    })()`);
    let found = null;
    outer:
    for (const rad of [40, 55, 70, 90, 110, 135]) {
      for (let a = 0; a < 32; a++) {
        const ang = (a / 32) * Math.PI * 2;
        const x = axis.cx + Math.cos(ang) * rad, y = axis.cy + Math.sin(ang) * rad;
        await move(x, y);
        const ax = await ev(ws, `(window.JPStageTouch.transform() || {}).axis || null`);
        if (ax) { found = { x: Math.round(x), y: Math.round(y), rad, ang: +ang.toFixed(2), axis: ax }; break outer; }
      }
    }
    R.puntoGizmo = found;
    R.gizmoDetectado = !!found;
    if (!found) throw new Error('no se encontró el gizmo de la pantalla');

    // 5) CASO QUE FALLABA: el mouse viene del PANEL y se presiona directo en la flecha
    //    (sin hover previo sobre el canvas ⇒ `axis` viejo o null).
    await move(1380, 700);              // sobre el panel de control
    await sleep(200);
    const posAntes = await ev(ws, `window.JPStageTouch.transform().object.position.toArray().map(v=>+v.toFixed(3))`);
    await press(found.x, found.y);
    await sleep(150);
    R.alPresionar = await ev(ws, `(() => { const tc = window.JPStageTouch.transform(); return { dragging: !!tc.dragging, axis: tc.axis || null, touchActivo: !!window.JPStageTouch.state.active, controlsOn: window.JPStageTouch.controls().enabled, pointer: window.JPStageTouch.pointer() }; })()`);
    const dx = Math.cos(found.ang) * 40, dy = Math.sin(found.ang) * 40;
    for (let i = 1; i <= 8; i++) { await move(found.x + dx * i / 8, found.y + dy * i / 8, { button: 'left', buttons: 1 }); await sleep(50); }
    await release(found.x + dx, found.y + dy);
    await sleep(600);
    const posDespues = await ev(ws, `window.JPStageTouch.transform().object.position.toArray().map(v=>+v.toFixed(3))`);
    R.arrastre = {
      posAntes, posDespues,
      seMovio: Math.abs(posDespues[0] - posAntes[0]) + Math.abs(posDespues[1] - posAntes[1]) + Math.abs(posDespues[2] - posAntes[2]) > 0.02,
      touchActivoFinal: await ev(ws, `!!window.JPStageTouch.state.active`)
    };

    // 6) NO romper el toque: click sobre la pantalla LEJOS del gizmo sigue alimentando el shader/web
    await sleep(400);
    const lejos = await ev(ws, `(() => {
      const T = window.JPStageTouch, tc = T.transform(), cam = T.camera();
      const s = T.screens().find(x => x.id === tc.object.userData.screenId);
      const wp = new THREE.Vector3(); tc.object.getWorldPosition(wp); const p = wp.clone().project(cam);
      const cx = (p.x + 1) / 2 * innerWidth, cy = (-p.y + 1) / 2 * innerHeight;
      // buscar un punto de la MISMA pantalla donde el gizmo NO esté
      for (const rad of [70, 95, 130, 170, 210]) for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const x = Math.round(cx + Math.cos(ang) * rad), y = Math.round(cy + Math.sin(ang) * rad);
        const hit = T.pick(x, y);
        if (hit && hit.id === s.id) return { x, y, rad };
      }
      return null;
    })()`);
    R.puntoLejos = lejos;
    if (lejos) {
      await move(lejos.x, lejos.y);
      await press(lejos.x, lejos.y);
      await sleep(200);
      R.toqueLejosDelGizmo = await ev(ws, `(() => ({ activo: !!window.JPStageTouch.state.active, pointer: window.JPStageTouch.pointer() }))()`);
      await release(lejos.x, lejos.y);
      await sleep(200);
    }

    await cdp(ws, 'Page.captureScreenshot', { format: 'png' }).then(r => fs.writeFileSync(OUT, Buffer.from(r.data, 'base64'))).catch(() => { });
    R.errores = await ev(ws, `JSON.stringify(window.__errs || [])`);
    console.log(JSON.stringify(R, null, 1));
    console.log('captura:', OUT);
  } catch (e) {
    console.log('ERROR:', e.message);
    console.log(JSON.stringify(R, null, 1));
    process.exitCode = 1;
  } finally {
    try { chrome.kill(); } catch (e) { }
    // devolver la escena como estaba (el arrastre autoguarda)
    if (fs.existsSync(BAK)) { try { fs.copyFileSync(BAK, CONFIG); fs.unlinkSync(BAK); console.log('escena restaurada'); } catch (e) { } }
  }
})();
