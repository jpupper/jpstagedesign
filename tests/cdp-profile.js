// Verifica profile.html (perfil unificado FSC) en jpstagedesign:
//   a) sin sesión: gate visible, cuenta oculta, botones Ingresar/Registrarme
//   b) índice de apps: todas las tarjetas con href (y variante por origen)
//   c) el chip de sesión del ecosistema linkea a profile.html
//   d) /api/auth/profile responde 401 JSON sin token y con token inválido
//      (prueba que el proxy existe y valida contra fscauth, no que sirve HTML)
// Uso: node tests/cdp-profile.js [base] [out.png]
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || process.env.JPSTAGE_BASE || 'http://localhost:6645/jpstagedesign';
const OUT = process.argv[3] || path.join(os.tmpdir(), 'profile.png');
const PORTA = 9455 + Math.floor(Math.random() * 30);
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
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result ? r.result.value : undefined;
}

(async () => {
  const R = { base: BASE };
  const profile = path.join(os.tmpdir(), 'jp-profile-' + Date.now());
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORTA}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1400,1000',
    '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks', 'about:blank'], { stdio: 'ignore' });
  let target = null;
  for (let i = 0; i < 50; i++) { try { const l = await (await fetch(`http://127.0.0.1:${PORTA}/json/list`)).json(); target = l.find(t => t.type === 'page'); if (target && target.webSocketDebuggerUrl) break; } catch (e) {} await sleep(300); }
  const ws = await connect(target.webSocketDebuggerUrl);
  await cdp(ws, 'Page.enable'); await cdp(ws, 'Runtime.enable');
  await cdp(ws, 'Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: "window.__errs=[];window.addEventListener('error',e=>window.__errs.push(String(e.message)));" });

  try {
    // (a) profile.html sin sesión
    await cdp(ws, 'Page.navigate', { url: BASE + '/profile.html' });
    for (let i = 0; i < 40; i++) { await sleep(500); const ok = await ev(ws, `!!document.getElementById('pfApps') && document.getElementById('pfApps').children.length > 0`); if (ok) break; }
    await sleep(1200);
    R.a_sinSesion = JSON.parse(await ev(ws, `JSON.stringify({
      gateVisible: !document.getElementById('pfGate').hidden,
      cuentaOculta: document.getElementById('pfAccount').hidden === true,
      botones: Array.from(document.querySelectorAll('#pfGate button')).map(b=>b.textContent.trim()),
      apps: document.getElementById('pfApps').children.length,
      tieneToken: !!localStorage.getItem('fsc_token'),
      widgetSesion: !!document.getElementById('authWidget'),
      errores: (window.__errs || []).length
    })`));
    R.b_indice = JSON.parse(await ev(ws, `JSON.stringify({
      total: document.getElementById('pfApps').children.length,
      sinHref: Array.from(document.querySelectorAll('#pfApps .pf-app')).filter(a=>!a.href).length,
      externos: Array.from(document.querySelectorAll('#pfApps .pf-app')).filter(a=>a.href.indexOf(location.origin) !== 0).length,
      nombres: Array.from(document.querySelectorAll('#pfApps .pf-app .t')).slice(0,4).map(e=>e.textContent)
    })`));
    const shot = await cdp(ws, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));

    // (c) handoff con token falso → el chip del ecosistema linkea al perfil
    const payload = Buffer.from(JSON.stringify({ id: 'u1', email: 'test@fsc.test', role: 'USER' })).toString('base64').replace(/=+$/, '');
    const fake = `h.${payload}.s`;
    await cdp(ws, 'Page.navigate', { url: BASE + '/?token=' + encodeURIComponent(fake) + '&username=jp_test&userId=u1' });
    for (let i = 0; i < 30; i++) { await sleep(500); const ok = await ev(ws, `!!document.querySelector('#authWidget .auth-chip')`); if (ok) break; }
    await sleep(1000);
    R.c_chip = JSON.parse(await ev(ws, `JSON.stringify((()=>{ const c=document.querySelector('#authWidget .auth-chip'); return { existe: !!c, href: c?c.getAttribute('href'):null, esEnlace: c?c.tagName:'-' }; })())`));

    // (c2) profile.html con ese token (inválido para fscauth) → gate + mensaje de error, sin crash
    await cdp(ws, 'Page.navigate', { url: BASE + '/profile.html' });
    await sleep(2500);
    R.c2_tokenInvalido = JSON.parse(await ev(ws, `JSON.stringify({
      gateVisible: !document.getElementById('pfGate').hidden,
      status: (document.getElementById('pfStatus')||{}).textContent || '',
      apps: document.getElementById('pfApps').children.length
    })`));

    // (d) /api/auth/profile
    R.d_api = JSON.parse(await ev(ws, `(async () => {
      const out = {};
      try { const r = await fetch('${BASE}/api/auth/profile'); out.sinToken = r.status + ' ' + (await r.text()).slice(0,120); } catch(e) { out.sinToken = 'ERR ' + e.message; }
      try { const r = await fetch('${BASE}/api/auth/profile?token=abc.def.ghi'); out.tokenInvalido = r.status + ' ' + (await r.text()).slice(0,120); } catch(e) { out.tokenInvalido = 'ERR ' + e.message; }
      try { const r = await fetch('${BASE}/api/auth/profile?token=abc.def.ghi'); const t = await r.text(); out.esJson = t.trim().startsWith('{'); } catch(e) { out.esJson = false; }
      return JSON.stringify(out);
    })()`));

    // (e) render con sesión: se mockea SOLO la red (fetch del perfil) para verificar
    //     el render del registro unificado (nombre, rol, permisos, campos, índice).
    const MOCK = `(() => {
      localStorage.setItem('fsc_token', 'h.${payload}.s');
      localStorage.setItem('fsc_user', JSON.stringify({ id:'u1', username:'jp_test', email:'test@fsc.test', role:'ADMIN' }));
      const orig = window.fetch;
      window.fetch = function (u) {
        if (String(u).indexOf('/auth/profile') !== -1) {
          return Promise.resolve(new Response(JSON.stringify({ ok:true, loggedIn:true, source:'profile', user:{
            id:'u1', username:'jp_test', email:'test@fsc.test', displayName:'Julian Puppo', avatar:'',
            bio:'Stage design, shaders y proyeccion.', hexId:'#a1b2c3',
            socials:{ instagram:'jpupper', whatsapp:'5492640000000', facebook:'jpupper' },
            role:'ADMIN', origin:'jpshadereditor',
            permissions:{ artedigital:{role:'ADMINISTRADOR'}, pizarraia:{canCreateSessions:true,canAccessAdmin:false}, jpshader:{canUpload:true,isAdmin:true} },
            meta:{ lastLogin:'2026-09-01T12:00:00.000Z', loginCount:12 }, createdAt:'2025-03-04T12:00:00.000Z'
          }}), { status:200, headers:{'Content-Type':'application/json'} }));
        }
        return orig.apply(this, arguments);
      };
    })();`;
    await cdp(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: MOCK });
    await cdp(ws, 'Page.navigate', { url: BASE + '/profile.html' });
    for (let i = 0; i < 30; i++) { await sleep(500); const ok = await ev(ws, `!document.getElementById('pfAccount').hidden`); if (ok) break; }
    await sleep(800);
    R.e_conSesion = JSON.parse(await ev(ws, `JSON.stringify({
      cuentaVisible: !document.getElementById('pfAccount').hidden,
      gateOculto: document.getElementById('pfGate').hidden === true,
      nombre: document.getElementById('pfName').textContent,
      handle: document.getElementById('pfHandle').textContent,
      avatarIniciales: document.getElementById('pfAvatar').textContent.trim(),
      bio: document.getElementById('pfBio').textContent,
      badges: Array.from(document.querySelectorAll('#pfBadges .pf-badge')).map(e=>e.textContent),
      campos: Array.from(document.querySelectorAll('#pfFields .pf-field')).map(f=>f.querySelector('.k').textContent),
      permisos: Array.from(document.querySelectorAll('#pfApps .pf-badge')).map(e=>e.textContent),
      errores: (window.__errs || []).length
    })`));
    const shot3 = await cdp(ws, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(OUT.replace(/\.png$/, '_cuenta.png'), Buffer.from(shot3.data, 'base64'));
  } catch (e) { R.error = String(e.message || e); }
  finally { try { chrome.kill(); } catch (e) {} }

  console.log(JSON.stringify(R, null, 1));
  console.log('captura:', OUT);
  setTimeout(() => process.exit(0), 300);
})();
