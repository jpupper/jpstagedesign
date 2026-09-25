// ============================================================
// ARCHIVO DEPRECADO: public/shaders/shaderfondo.js
// Todos los shaders corren 100% dentro de archivos .frag
// El shader activo de fondo es: public/shaders/shaderfondo.frag
// ============================================================

const ShaderFondo = {
  // Sin código GLSL embebido: todo se lee desde shaderfondo.frag
  async loadFragment() {
    const base = (typeof window !== 'undefined' && (window.CONFIG?.BASE || window.FUTUREX_CONFIG?.BASE)) || '/jpstagedesign';
    let res = await fetch(base + '/shaders/shaderfondo.frag?t=' + Date.now());
    if (!res.ok) {
      res = await fetch('/jpstagedesign/shaders/shaderfondo.frag?t=' + Date.now());
    }
    return res.ok ? await res.text() : '';
  }
};

if (typeof window !== 'undefined') {
  window.ShaderFondo = ShaderFondo;
}
