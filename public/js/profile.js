// ============================================================
// profile.html — identidad (foto · usuario · bio) + PRESETS
// Un PRESET = configuración de la BOTONERA (inputs + botones) +
// configuración del OUTPUT 3D (sala, pantallas, proyectores).
// El preset "cargado" es el estado vivo: lo que se guarda desde la
// botonera o desde el simulador 3D cae ahí.
// ============================================================

(function () {
  'use strict';

  const VPS = 'https://vps-4455523-x.dattaweb.com';
  const API = ((window.CONFIG && CONFIG.API_URL) || '/jpstagedesign/api').replace(/\/$/, '');
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));

  let presetsState = { activeId: null, presets: [] };

  // ---------------------------------------------------------------- utilidades
  function fmtDate(v) {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function initials(name) {
    const parts = String(name || '?').trim().split(/[\s._-]+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }

  let toastTimer = null;
  function toast(msg) {
    let t = el('pfToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'pfToast';
      t.className = 'pf-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 2800);
  }

  async function api(path, opts) {
    const res = await fetch(API + path, opts);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || ('HTTP ' + res.status));
    return json;
  }

  // ---------------------------------------------------------------- identidad
  function renderIdentity(user) {
    const card = el('pfIdentity');
    const gate = el('pfGate');
    if (!user) {
      card.hidden = true;
      gate.hidden = false;
      return;
    }
    gate.hidden = true;
    card.hidden = false;

    const name = user.displayName || user.username || 'Usuario';
    const username = user.username || '';
    const av = el('pfAvatar');
    av.innerHTML = '';
    if (user.avatar) {
      const img = document.createElement('img');
      img.alt = username || name;
      img.src = user.avatar;
      img.onerror = () => { av.textContent = initials(name); };
      av.appendChild(img);
    } else {
      av.textContent = initials(name);
    }

    el('pfHandle').textContent = '@' + (username || '—');
    const bio = el('pfBio');
    if (user.bio && String(user.bio).trim()) {
      bio.textContent = String(user.bio).trim();
      bio.classList.remove('is-empty');
      bio.hidden = false;
    } else {
      bio.textContent = 'Sin bio.';
      bio.classList.add('is-empty');
      bio.hidden = false;
    }
  }

  async function loadIdentity() {
    if (!window.FSCAuth || !FSCAuth.isLoggedIn()) { renderIdentity(null); return; }
    try {
      const r = await fetch(API + '/auth/profile', { headers: { Authorization: 'Bearer ' + FSCAuth.getToken() } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok || !d.user) throw new Error((d && d.error) || 'sesión inválida');
      renderIdentity(d.user);
    } catch (err) {
      renderIdentity(null);
      const s = el('pfGateStatus');
      if (s) s.textContent = 'No pudimos leer tu perfil: ' + (err.message || err);
    }
  }

  // ---------------------------------------------------------------- presets
  function presetCard(p) {
    const card = document.createElement('article');
    card.className = 'preset-card' + (p.id === presetsState.activeId ? ' is-active' : '');
    card.dataset.id = p.id;

    const s = p.summary || {};
    const botones = s.buttons || [];
    const asignados = botones.filter(b => b.materialId);
    const botonesTxt = asignados.length
      ? asignados.map(b => `${b.slot}: ${b.label || b.materialId}`).join(' · ')
      : 'sin botones asignados';

    card.innerHTML =
      '<div class="preset-head">' +
        '<strong class="preset-name">' + esc(p.name) + '</strong>' +
        (p.id === presetsState.activeId ? '<span class="preset-badge">cargado</span>' : '') +
      '</div>' +
      '<div class="preset-meta">' +
        (s.screens || 0) + ' pantallas · ' + (s.projectors || 0) + ' proyectores · ' +
        (s.materials || 0) + ' inputs · ' + (s.botonesAsignados || 0) + '/6 botones<br>' +
        esc(botonesTxt) + '<br>' +
        'guardado ' + esc(fmtDate(p.updatedAt)) +
      '</div>' +
      '<div class="preset-buttons">' +
        '<button class="pf-btn primary" data-act="load">▶ Cargar</button>' +
        '<button class="pf-btn" data-act="rename">✎ Nombre</button>' +
        '<button class="pf-btn" data-act="export-botonera">⬇ Botonera</button>' +
        '<button class="pf-btn" data-act="export-3d">⬇ Output 3D</button>' +
        '<button class="pf-btn" data-act="export-all">⬇ Todo</button>' +
        '<button class="pf-btn danger" data-act="delete">🗑</button>' +
      '</div>';

    card.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      onPresetAction(btn.dataset.act, p, btn);
    });
    return card;
  }

  function renderPresets() {
    const list = el('pfPresets');
    list.innerHTML = '';
    if (!presetsState.presets.length) {
      const e = document.createElement('div');
      e.className = 'pf-empty';
      e.textContent = 'Todavía no hay presets. Guardá el estado actual con el botón de arriba.';
      list.appendChild(e);
    } else {
      presetsState.presets.forEach(p => list.appendChild(presetCard(p)));
    }

    const active = presetsState.presets.find(p => p.id === presetsState.activeId);
    const nameEl = el('pfActiveName');
    nameEl.textContent = active ? active.name : 'ninguno (el estado vivo no está guardado)';
    nameEl.classList.toggle('none', !active);
    el('pfSyncActive').disabled = !active;

    // "Guardar cambios" tiene sentido sólo con un preset cargado
    const nombreInput = el('pfPresetName');
    if (nombreInput && active && !nombreInput.value) nombreInput.placeholder = 'Nombre del preset (ej. Tríptico Sincretismo)';
  }

  async function loadPresets() {
    try {
      const d = await api('/presets');
      presetsState = { activeId: d.activeId || null, presets: d.presets || [] };
      renderPresets();
    } catch (err) {
      toast('⚠️ No se pudieron leer los presets: ' + err.message);
    }
  }

  async function onPresetAction(act, p, btn) {
    if (!p) return;
    const prev = btn.innerHTML;
    try {
      if (act === 'load') {
        btn.disabled = true; btn.innerHTML = '⏳…';
        await api('/presets/' + encodeURIComponent(p.id) + '/activate', { method: 'POST' });
        toast('▶ Preset cargado: ' + p.name + ' (botonera + 3D en vivo)');
        await loadPresets();
      } else if (act === 'rename') {
        const nuevo = prompt('Nuevo nombre del preset:', p.name);
        if (!nuevo || !nuevo.trim()) return;
        await api('/presets/' + encodeURIComponent(p.id), {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: nuevo.trim() })
        });
        toast('✎ Renombrado a "' + nuevo.trim() + '"');
        await loadPresets();
      } else if (act === 'delete') {
        if (!confirm('¿Borrar el preset "' + p.name + '"?\nNo se puede deshacer.')) return;
        await api('/presets/' + encodeURIComponent(p.id), { method: 'DELETE' });
        toast('🗑 Preset borrado');
        await loadPresets();
      } else if (act.indexOf('export-') === 0) {
        const part = act === 'export-botonera' ? 'botonera' : (act === 'export-3d' ? 'output3d' : 'all');
        window.location.href = API + '/presets/' + encodeURIComponent(p.id) + '/export?part=' + part;
        toast('⬇ Exportando ' + (part === 'all' ? 'botonera + output 3D' : part === 'botonera' ? 'la botonera' : 'el output 3D'));
      }
    } catch (err) {
      toast('⚠️ ' + err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = prev;
    }
  }

  async function onSaveAsPreset() {
    const input = el('pfPresetName');
    const name = (input.value || '').trim();
    if (!name) { input.focus(); toast('Ponele un nombre al preset'); return; }
    const btn = el('pfSavePreset');
    btn.disabled = true;
    const prev = btn.innerHTML;
    btn.innerHTML = '⏳ Guardando…';
    try {
      const d = await api('/presets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name })
      });
      input.value = '';
      toast('💾 Preset guardado: ' + d.preset.name);
      await loadPresets();
    } catch (err) {
      toast('⚠️ ' + err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = prev;
    }
  }

  async function onSyncActive() {
    const btn = el('pfSyncActive');
    btn.disabled = true;
    const prev = btn.innerHTML;
    btn.innerHTML = '⏳…';
    try {
      const d = await api('/presets/active/sync', { method: 'POST' });
      toast('💾 Cambios guardados en "' + d.preset.name + '"');
      await loadPresets();
    } catch (err) {
      toast('⚠️ ' + err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = prev;
    }
  }

  // ---------------------------------------------------------------- tema
  const THEME_CLASSES = ['dark-mode', 'matrix-mode', 'neon-mode'];
  const VALID_STYLES = ['light', 'dark', 'matrix', 'neon'];
  const STYLE_KEY = 'fsc_theme';   // misma clave que la botonera

  function applyStyle(style) {
    const s = VALID_STYLES.indexOf(style) >= 0 ? style : 'light';
    document.body.classList.remove.apply(document.body.classList, THEME_CLASSES);
    if (s === 'dark') document.body.classList.add('dark-mode');
    if (s === 'matrix') document.body.classList.add('matrix-mode');
    if (s === 'neon') document.body.classList.add('neon-mode');
    try { localStorage.setItem(STYLE_KEY, s); } catch (e) { /* noop */ }
    const sel = el('styleSelect');
    if (sel) sel.value = s;
  }

  function initTheme() {
    let style = 'light';
    try { style = localStorage.getItem(STYLE_KEY) || 'light'; } catch (e) { /* noop */ }
    applyStyle(style);
    const sel = el('styleSelect');
    if (sel) sel.addEventListener('change', () => applyStyle(sel.value));
  }

  // ---------------------------------------------------------------- arranque
  function init() {
    initTheme();

    // sesión
    const login = el('pfLogin');
    if (login) login.addEventListener('click', () => {
      if (window.FSCAuth) FSCAuth.login();
      else location.href = VPS + '/fscauth/login.html';
    });
    const reg = el('pfRegister');
    if (reg) reg.addEventListener('click', () => {
      if (window.FSCAuth) FSCAuth.goRegister();
      else location.href = VPS + '/fscauth/register.html';
    });
    window.addEventListener('authStateChanged', loadIdentity);
    if (window.FSCAuth) FSCAuth.render();
    loadIdentity();

    // presets
    el('pfSavePreset').addEventListener('click', onSaveAsPreset);
    el('pfSyncActive').addEventListener('click', onSyncActive);
    el('pfReloadPresets').addEventListener('click', () => { loadPresets(); toast('↻ Lista actualizada'); });
    el('pfPresetName').addEventListener('keydown', (e) => { if (e.key === 'Enter') onSaveAsPreset(); });
    loadPresets();

    // si otra pestaña guarda/carga un preset, refrescamos la lista
    if (window.io && window.CONFIG) {
      try {
        const socket = io(CONFIG.SOCKET_URL || undefined, { path: CONFIG.SOCKET_PATH, withCredentials: true });
        socket.on('presetChanged', () => loadPresets());
      } catch (e) { /* sin socket igual funciona */ }
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
