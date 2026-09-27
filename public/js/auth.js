// ============================================================
// 🔑 FSC AUTH (SSO) — JPStageDesign
// Estándar del ecosistema FullScreen Code: el login vive en fscauth
// (JWT central, mismo JWT_SECRET para todas las apps). Acá NO hay
// gating: la botonera y los links de preset siguen siendo públicos.
//
//   Ingresar  → fscauth (si ya hay sesión central, entra directo)
//   Salir     → fscauth/api/auth/logout
//   Vuelta    → ?token=&username=&userId=  → localStorage + URL limpia
// ============================================================
(function () {
  'use strict';

  const KEY_TOKEN = 'fsc_token';
  const KEY_USER = 'fsc_user';
  const ORIGIN_APP = 'jpstagedesign';
  const FSCAUTH = (window.CONFIG && window.CONFIG.FSCAUTH_URL) || 'https://vps-4455523-x.dattaweb.com/fscauth';
  // Perfil unificado: la MISMA página en cualquier app del ecosistema que use fscauth.
  const PROFILE_URL = ((window.CONFIG && window.CONFIG.BASE) || '/jpstagedesign') + '/profile.html';

  const getToken = () => localStorage.getItem(KEY_TOKEN);
  const setToken = (t) => localStorage.setItem(KEY_TOKEN, t);
  const getUser = () => { try { return JSON.parse(localStorage.getItem(KEY_USER) || 'null'); } catch (e) { return null; } };
  const setUser = (u) => localStorage.setItem(KEY_USER, JSON.stringify(u || {}));
  const removeSession = () => { localStorage.removeItem(KEY_TOKEN); localStorage.removeItem(KEY_USER); };
  const isLoggedIn = () => !!getToken();
  const isAdmin = () => { const u = getUser(); return !!u && (u.role === 'ADMIN' || u.role === 'SYSTEM'); };

  function parseJwt(token) {
    try {
      const b = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(atob(b).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
    } catch (e) { return null; }
  }

  // URL actual sin los params que devuelve fscauth
  function cleanUrl() {
    const u = new URL(window.location.href);
    ['token', 'username', 'userId', 'ssoset', 'nosession'].forEach(k => u.searchParams.delete(k));
    return u.toString();
  }

  function goLogin() {
    window.location.href = `${FSCAUTH}/login.html?redirect=${encodeURIComponent(cleanUrl())}&origin=${ORIGIN_APP}`;
  }
  function goRegister() {
    window.location.href = `${FSCAUTH}/register.html?redirect=${encodeURIComponent(cleanUrl())}&origin=${ORIGIN_APP}`;
  }
  function logout() {
    removeSession();
    render();
    window.location.href = `${FSCAUTH}/api/auth/logout?redirect=${encodeURIComponent(cleanUrl())}`;
  }

  // Ingresar: si ya hay sesión central, sso-check devuelve el token (sin formulario);
  // si no la hay, vamos al login. Si la verificación falla (CORS/red), vamos al login igual.
  async function login() {
    const back = cleanUrl();
    try {
      const r = await fetch(`${FSCAUTH}/api/auth/verify`, { credentials: 'include' });
      const d = await r.json();
      if (d && d.loggedIn) {
        window.location.href = `${FSCAUTH}/api/auth/sso-check?redirect=${encodeURIComponent(back)}`;
        return;
      }
    } catch (e) { /* seguimos al login */ }
    goLogin();
  }

  function render() {
    const box = document.getElementById('authWidget');
    if (!box) return;
    const u = getUser();
    if (isLoggedIn() && u) {
      const name = u.username || u.email || 'Usuario';
      box.innerHTML = '';
      const chip = document.createElement('a');
      chip.className = 'auth-chip';
      chip.href = PROFILE_URL;
      chip.title = 'Ver mi perfil (' + (u.email || name) + (isAdmin() ? ' · ADMIN' : '') + ')';
      chip.innerHTML = '<span class="auth-dot"></span>' +
        '<span class="auth-name">' + String(name).replace(/[<>&]/g, '') + '</span>' +
        (isAdmin() ? '<span class="auth-role">ADMIN</span>' : '');
      const out = document.createElement('button');
      out.className = 'auth-btn auth-btn-out';
      out.textContent = 'Salir';
      out.addEventListener('click', logout);
      box.appendChild(chip);
      box.appendChild(out);
    } else {
      box.innerHTML = '';
      const inBtn = document.createElement('button');
      inBtn.className = 'auth-btn auth-btn-in';
      inBtn.textContent = '🔑 Ingresar';
      inBtn.title = 'Ingresar con tu cuenta FullScreen Code (fscauth)';
      inBtn.addEventListener('click', () => { inBtn.disabled = true; login(); });
      const reg = document.createElement('button');
      reg.className = 'auth-btn auth-btn-reg';
      reg.textContent = 'Registrarme';
      reg.addEventListener('click', goRegister);
      box.appendChild(inBtn);
      box.appendChild(reg);
    }
  }

  function initAuth() {
    const p = new URLSearchParams(window.location.search);
    const token = p.get('token');
    if (token) {
      setToken(token);
      const d = parseJwt(token);
      setUser({
        id: p.get('userId'), _id: p.get('userId'),
        username: p.get('username') || (d ? d.username : ''),
        email: d ? d.email : null,
        role: (d && d.role) || 'USER'
      });
      window.history.replaceState({}, document.title, cleanUrl());
      window.dispatchEvent(new Event('authStateChanged'));
    } else if (p.get('nosession')) {
      window.history.replaceState({}, document.title, cleanUrl());
    }
    render();
  }

  window.FSCAuth = {
    getToken, getUser, isLoggedIn, isAdmin, login, logout, goLogin, goRegister, render,
    get FSCAUTH_URL() { return FSCAUTH; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAuth);
  else initAuth();
})();
