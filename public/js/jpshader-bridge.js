// ============================================================
// JPSE — Puente entre JPStageDesign y el motor de jpShadereditor
// ------------------------------------------------------------
// Trae la BIBLIOTECA de shaders del editor (índice completo) y los
// reproduce con el MISMO motor que usa el include/editor:
//   plan (GET /jpshadereditor/api/include/plan?shader=…)  +  WebGLRenderer
// No usa el panel del include: acá la interfaz la pone JPStageDesign.
//
// API pública (window.JPSE):
//   JPSE.API / JPSE.FRONT               endpoints
//   JPSE.listShaders({refresh})         -> [{nombre, autor, fecha, thumb, compiles}]
//   JPSE.getPlan(nombre)                -> plan del editor
//   JPSE.loadEngine()                   -> Promise (inyecta webglrenderer + jp-*)
//   JPSE.uniforms(plan)                 -> [{name,type,min,max,step,value,passes}]
//   JPSE.createView(canvas, plan, opts) -> vista con render loop propio
// ============================================================

(function (root) {
  'use strict';

  var VPS = 'https://vps-4455523-x.dattaweb.com';
  var host = (location.hostname || '').toLowerCase();
  var isLocal = (host === 'localhost' || host === '127.0.0.1');
  var isVps = /dattaweb\.com$/.test(host) || /^vps-/.test(host);

  // El backend (plan / listado) vive SIEMPRE en el VPS: fullscreencode.com es
  // Apache estático y ahí /jpshadereditor/api/* da 404.
  var API = VPS + '/jpshadereditor/api';
  // Los assets del front del editor (js/lib, webglrenderer) sí están en el FTP
  // cuando navegamos fullscreencode.com: mismo origen, sin CORS.
  var FRONT = (isLocal || isVps ? VPS : '') + '/jpshadereditor';

  // ---------------------------------------------------------------- utilidades
  var loadedScripts = {};
  function loadScript(src) {
    if (loadedScripts[src]) return loadedScripts[src];
    loadedScripts[src] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = function () { resolve(src); };
      s.onerror = function () { reject(new Error('No se pudo cargar ' + src)); };
      document.head.appendChild(s);
    });
    return loadedScripts[src];
  }

  function fetchJSON(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' en ' + url);
      return r.json();
    });
  }

  function getRendererClass() {
    if (root.WebGLRenderer) return root.WebGLRenderer;
    try { return (typeof WebGLRenderer !== 'undefined') ? WebGLRenderer : null; } catch (e) { return null; }
  }

  // ------------------------------------------------------------------ motor
  var enginePromise = null;
  function loadEngine() {
    if (enginePromise) return enginePromise;
    var files = [
      FRONT + '/js/lib/jp-pointers.js',
      FRONT + '/js/lib/jp-node-graph.js',
      FRONT + '/js/lib/uniform-types.js',
      FRONT + '/js/shadereditor/webglrenderer.js'
    ];
    enginePromise = files.reduce(function (p, src) {
      return p.then(function () { return loadScript(src); });
    }, Promise.resolve()).then(function () {
      if (!getRendererClass() || !root.JPNodeGraph) throw new Error('motor del editor incompleto');
      return true;
    });
    enginePromise.catch(function () { enginePromise = null; });  // reintentable
    return enginePromise;
  }

  // -------------------------------------------------------------- biblioteca
  var listCache = null;
  function listShaders(opts) {
    opts = opts || {};
    if (listCache && !opts.refresh && (Date.now() - listCache.at) < 120000) {
      return Promise.resolve(listCache.data);
    }
    var cfg = root.CONFIG || {};
    var local = (cfg.API_URL ? cfg.API_URL : '') + '/jpshaders';
    var normalize = function (payload) {
      var arr = Array.isArray(payload) ? payload
        : (payload && (payload.shaders || payload.data)) || [];
      return arr.map(function (s) {
        return {
          nombre: s.nombre || s.name || s.shader || '',
          autor: s.autor || s.author || s.username || '',
          fecha: s.fechaActualizacion || s.fecha || s.updatedAt || null,
          thumb: s.imagePath || s.thumb || s.thumbnail || null,
          compiles: s.compiles !== false
        };
      }).filter(function (s) { return !!s.nombre; });
    };
    return fetchJSON(local + (opts.refresh ? '?refresh=1' : ''))
      .then(normalize)
      .catch(function () { return fetchJSON(API + '/shaders').then(normalize); })
      .then(function (data) {
        listCache = { at: Date.now(), data: data };
        return data;
      });
  }

  var planCache = {};
  function getPlan(nombre) {
    if (!nombre) return Promise.reject(new Error('falta el nombre del shader'));
    if (planCache[nombre]) return Promise.resolve(planCache[nombre]);
    return fetchJSON(API + '/include/plan?shader=' + encodeURIComponent(nombre))
      .then(function (plan) {
        if (!plan || !Array.isArray(plan.passes) || !plan.passes.length) {
          throw new Error('el plan de "' + nombre + '" no trae pases');
        }
        planCache[nombre] = plan;
        return plan;
      });
  }

  // ---------------------------------------------------------------- uniforms
  var GLOBALES = {
    time: 1, resolution: 1, mouse: 1, fxrand: 1, iFrame: 1, BPM: 1, bpm: 1,
    iTime: 1, iMouse: 1, iResolution: 1, iFrame: 1,
    pointers: 1, pointersCount: 1, pointerCount: 1,
    lidarPointers: 1, lidarPointersCount: 1,
    simulatedPointers: 1, simulatedPointersCount: 1,
    iChannel0: 1, iChannel1: 1, iChannel2: 1, iChannel3: 1,
    backbuffer: 1, date: 1, sampleRate: 1, frame: 1
  };

  var DECL_RE = /uniform\s+(?:lowp\s+|mediump\s+|highp\s+)?(float|bool|int|vec2|vec3|vec4)\s+([A-Za-z_]\w*)\s*(\[[^\]]*\])?\s*;/g;

  function rangos(formato) {
    // 'slider:0:5' -> {min:0, max:5} · 'slider' -> 0..1 · ausente -> null
    if (!formato || typeof formato !== 'string') return null;
    var p = formato.split(':');
    if (p[0] !== 'slider' && p[0] !== 'range') return null;
    if (p.length >= 3) {
      var a = parseFloat(p[1]), b = parseFloat(p[2]);
      if (isFinite(a) && isFinite(b) && b > a) return { min: a, max: b };
    }
    return { min: 0, max: 1 };
  }

  function valorPorDefecto(tipo) {
    if (tipo === 'bool') return 1;
    if (tipo === 'vec2') return [0, 0];
    if (tipo === 'vec3') return [0.5, 0.5, 0.5];
    if (tipo === 'vec4') return [0.5, 0.5, 0.5, 0.5];
    return 0;
  }

  function uniforms(plan) {
    var out = [];
    var vistos = {};
    var fmt = plan.uniformFormats || {};
    (plan.passes || []).forEach(function (pase) {
      var src = String(pase.source || '');
      var m;
      DECL_RE.lastIndex = 0;
      while ((m = DECL_RE.exec(src))) {
        var tipo = m[1], nombre = m[2], esArray = m[3];
        if (esArray) continue;                     // arrays (pointers, lidar…) no son sliders
        if (GLOBALES[nombre]) continue;            // los llena el motor
        if (nombre.indexOf('iChannel') === 0) continue;
        if (!vistos[nombre]) {
          vistos[nombre] = {
            name: nombre,
            type: tipo,
            passes: [],
            value: (pase.uniforms && pase.uniforms[nombre] !== undefined)
              ? pase.uniforms[nombre]
              : valorPorDefecto(tipo),
            format: fmt[nombre] || null
          };
          out.push(vistos[nombre]);
        }
        if (vistos[nombre].passes.indexOf(pase.id) === -1) vistos[nombre].passes.push(pase.id);
      }
    });

    out.forEach(function (u) {
      var r = rangos(u.format);
      var v = u.value;
      if (u.type === 'bool') { u.min = 0; u.max = 1; u.step = 1; u.value = (v ? 1 : 0); return; }
      if (u.type === 'int') {
        u.min = r ? Math.round(r.min) : 0;
        u.max = r ? Math.round(r.max) : Math.max(4, Math.ceil(Math.abs(Number(v) || 0) * 2) || 4);
        u.step = 1;
        u.value = Math.round(Number(v) || 0);
        return;
      }
      if (u.type === 'vec2' || u.type === 'vec3' || u.type === 'vec4') {
        var n = (u.type === 'vec2') ? 2 : (u.type === 'vec3' ? 3 : 4);
        var arr = Array.isArray(v) ? v.slice(0, n) : [Number(v) || 0];
        while (arr.length < n) arr.push(0);
        u.value = arr.map(function (x) { return Number(x) || 0; });
        u.min = r ? r.min : 0;
        u.max = r ? r.max : 1;
        u.step = 0.01;
        return;
      }
      // float
      u.min = r ? r.min : 0;
      u.max = r ? r.max : (Math.abs(Number(v) || 0) > 1 ? Math.ceil(Math.abs(Number(v)) * 2) : 1);
      u.step = (u.max - u.min) > 20 ? 0.1 : 0.01;
      u.value = Number(v) || 0;
    });

    return out;
  }

  // ------------------------------------------------------------------- vista
  var SLOTS = 4;

  function normalizarInput(inp) {
    if (!inp) return null;
    if (inp.type === 'texture_url' && inp.id && !/^(https?:|data:|blob:)/i.test(inp.id)) {
      return { type: 'texture_url', id: FRONT + '/' + String(inp.id).replace(/^\/+/, '') };
    }
    return inp;
  }

  function createView(canvas, plan, opts) {
    opts = opts || {};
    var RC = getRendererClass();
    var NG = root.JPNodeGraph;
    if (!RC || !NG) throw new Error('motor del editor no cargado (JPSE.loadEngine)');
    if (!canvas) throw new Error('createView sin canvas');

    var maxDpr = Number(opts.maxDpr) > 0 ? Number(opts.maxDpr) : 1.5;
    var view = {
      canvas: canvas, plan: plan, renderer: null, frames: 0,
      destroyed: false, errors: [], view: view
    };

    var R = new RC(canvas, function (titulo, msg) {
      var txt = ((titulo || '') + (msg ? ': ' + msg : '')).trim();
      if (txt) { view.errors.push(txt); if (opts.onError) opts.onError(txt); }
    }, {});
    view.renderer = R;
    if (!R.inicializarContexto()) throw new Error('sin WebGL disponible');

    // tamaño REAL del canvas (los render targets se crean con este tamaño)
    function medir() {
      var cw = canvas.clientWidth || canvas.offsetWidth || Number(canvas.getAttribute('width')) || 640;
      var ch = canvas.clientHeight || canvas.offsetHeight || Number(canvas.getAttribute('height')) || 360;
      var dpr = Math.min(root.devicePixelRatio || 1, maxDpr);
      return { w: Math.max(1, Math.round(cw * dpr)), h: Math.max(1, Math.round(ch * dpr)) };
    }

    function fijarTamano(forzar) {
      var s = medir();
      if (!forzar && canvas.width === s.w && canvas.height === s.h && R.parameters.screenWidth === s.w) return;
      canvas.width = s.w;
      canvas.height = s.h;
      R.parameters.screenWidth = s.w;
      R.parameters.screenHeight = s.h;
      R.passes.forEach(function (pass) {
        (pass.renderTargets || []).forEach(function (t, i) {
          if (t) {
            try { R.gl.deleteFramebuffer(t.framebuffer); } catch (e) { }
            try { R.gl.deleteTexture(t.texture); } catch (e) { }
          }
          pass.renderTargets[i] = R.createTarget(s.w, s.h, 'LINEAR');
        });
      });
    }

    function construir() {
      Array.from(R.passes.keys()).forEach(function (id) {
        try { R.removePass(id); } catch (e) { }
      });
      R.passOrder = [];
      (plan.passes || []).forEach(function (p) {
        var pass = R.addPass(p.id, p.name, 'buffer');
        pass.inputAliases = p.aliases || {};
        R.compilePass(p.id, p.source, NG.VERTEX, null);
        for (var i = 0; i < (NG.SLOTS || SLOTS); i++) {
          pass.inputs[i] = normalizarInput((p.inputs || [])[i]) || null;
        }
        Object.keys(p.uniforms || {}).forEach(function (n) {
          try { R.setPassUniform(p.id, n, p.uniforms[n]); } catch (e) { }
        });
      });
      R.passOrder = (plan.order && plan.order.length)
        ? plan.order.slice()
        : (plan.passes || []).map(function (p) { return p.id; });
      R.displayPassId = plan.displayPassId || R.passOrder[R.passOrder.length - 1];
    }

    function setUniform(nombre, valor) {
      var tocado = false;
      R.passes.forEach(function (pass) {
        if (!pass.program) return;
        var tipos = pass.uniformTypes || {};
        if (tipos[nombre] === undefined) return;   // ese pase no lo usa
        try { R.setPassUniform(pass.id, nombre, valor); tocado = true; } catch (e) { }
      });
      return tocado;
    }

    function applyUniforms(obj) {
      if (!obj) return;
      Object.keys(obj).forEach(function (n) { setUniform(n, obj[n]); });
    }

    // ------------------------------------------------------------ mouse/touch
    // M = estado del puntero que se le pasa al shader en cada frame.
    //   ext   -> lo maneja el HOST (output3d: raycast sobre la pantalla 3D)
    //   win   -> sigue el mouse de la ventana (se apaga cuando el host manda)
    //   lidar -> replica el toque en lidarPointers[] además de pointers[]
    var modo = opts.mouse === undefined ? 'canvas' : opts.mouse;   // 'canvas' | 'window' | 'none'
    var M = { x: 0.5, y: 0.5, down: 0, ext: false, win: (modo !== 'none'), lidar: false };
    var listeners = [];

    function clamp01(v) { v = Number(v); return isFinite(v) ? Math.min(1, Math.max(0, v)) : 0; }

    function on(target, ev, fn, opts2) {
      target.addEventListener(ev, fn, opts2 || { passive: true });
      listeners.push(function () { target.removeEventListener(ev, fn, opts2 || { passive: true }); });
    }
    function setPos(clientX, clientY, deCanvas) {
      if (M.ext || !M.win) return;              // el host tomó el control del puntero
      var r = deCanvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: root.innerWidth, height: root.innerHeight };
      M.x = (clientX - r.left) / Math.max(1, r.width);
      M.y = 1 - (clientY - r.top) / Math.max(1, r.height);
      M.x = Math.min(1, Math.max(0, M.x));
      M.y = Math.min(1, Math.max(0, M.y));
    }
    function pulsar(v) {
      if (M.ext || !M.win) return;
      M.down = v ? 1 : 0;
    }
    if (modo === 'canvas') {
      on(canvas, 'mousemove', function (e) { setPos(e.clientX, e.clientY, true); });
      on(canvas, 'mousedown', function (e) { pulsar(1); setPos(e.clientX, e.clientY, true); });
      on(root, 'mouseup', function () { pulsar(0); });
      on(canvas, 'touchstart', function (e) {
        var t = e.touches && e.touches[0]; pulsar(1); if (t) setPos(t.clientX, t.clientY, true);
      });
      on(canvas, 'touchmove', function (e) {
        var t = e.touches && e.touches[0]; if (t) setPos(t.clientX, t.clientY, true);
      });
      on(canvas, 'touchend', function () { pulsar(0); });
      on(canvas, 'touchcancel', function () { pulsar(0); });
    } else {
      // 'window' y también 'none': en 'none' los listeners quedan registrados
      // pero dormidos (M.win = false), así `setWindowMouse(true)` los puede
      // prender en caliente sin recrear la vista.
      on(root, 'mousemove', function (e) { setPos(e.clientX, e.clientY, false); });
      on(root, 'mousedown', function (e) { pulsar(1); setPos(e.clientX, e.clientY, false); });
      on(root, 'mouseup', function () { pulsar(0); });
      on(root, 'touchstart', function (e) {
        var t = e.touches && e.touches[0]; pulsar(1); if (t) setPos(t.clientX, t.clientY, false);
      });
      on(root, 'touchmove', function (e) {
        var t = e.touches && e.touches[0]; if (t) setPos(t.clientX, t.clientY, false);
      });
      on(root, 'touchend', function (e) {
        if (!e.touches || !e.touches.length) pulsar(0);
      });
      on(root, 'touchcancel', function () { pulsar(0); });
    }

    var ro = null;
    if (root.ResizeObserver) {
      ro = new ResizeObserver(function () { fijarTamano(false); });
      ro.observe(canvas);
    }

    // --------------------------------------------------------------- arranque
    fijarTamano(true);
    construir();
    if (opts.uniforms) applyUniforms(opts.uniforms);

    function frame() {
      if (view.destroyed) return;
      view.raf = root.requestAnimationFrame(frame);
      try {
        R.updateMouse(M.x * R.parameters.screenWidth, M.y * R.parameters.screenHeight, M.down, 0);
        if (R.parameters.pointers !== undefined) {
          R.parameters.pointers = M.down ? [{ x: M.x, y: M.y }] : [];
        }
        // LIDAR simulado (raycast sobre la pantalla 3D): mismo toque, pero con
        // y = 0 ARRIBA, que es la convención con la que llegan los puntos del
        // sensor (los shaders los espejan con resolution.y - y).
        if (M.lidar && R.parameters.lidarPointers !== undefined) {
          R.parameters.lidarPointers = M.down ? [{ x: M.x, y: 1 - M.y }] : [];
        }
        R.render(null);
        view.frames++;
      } catch (e) {
        if (!view._errFrame) { view._errFrame = 1; console.warn('[JPSE] render:', e && e.message); }
      }
    }
    view.raf = root.requestAnimationFrame(frame);

    view.setUniform = setUniform;
    view.applyUniforms = applyUniforms;
    view.resize = function () { fijarTamano(true); };
    view.rebuild = function (nuevoPlan) {
      if (nuevoPlan) { plan = nuevoPlan; view.plan = nuevoPlan; }
      construir();
    };
    view.value = function (nombre) {
      var pass = R.passes.get(R.passOrder[0]);
      if (!pass || !pass.uniformValues) return undefined;
      return pass.uniformValues[nombre];
    };
    view.swap = function () { return { renderer: R, view: view }; };

    // ------------------------------------------------- puntero externo (host)
    // El host (output3d.html) manda el TOQUE sobre la pantalla 3D: x,y
    // normalizados 0..1 con y = 0 ABAJO (igual que gl_FragCoord), que es
    // justo lo que espera pointers[]/mouse.
    //   o.lidar = true  -> además lo replica en lidarPointers[]
    view.setPointer = function (x, y, down, o) {
      o = o || {};
      M.ext = true;
      M.x = clamp01(x);
      M.y = clamp01(y);
      M.down = down ? 1 : 0;
      if (o.lidar !== undefined) M.lidar = !!o.lidar;
    };
    // Suelta el control: el puntero vuelve al mouse de la ventana (si `win`).
    view.releasePointer = function () { M.ext = false; M.down = 0; };
    // ¿El shader sigue el mouse de la ventana mientras nadie toca la pantalla?
    view.setWindowMouse = function (v) {
      M.win = !!v;
      if (!M.win && !M.ext) M.down = 0;
    };
    view.pointer = function () {
      return { x: M.x, y: M.y, down: !!M.down, ext: M.ext, lidar: M.lidar };
    };
    view.destroy = function () {
      view.destroyed = true;
      if (view.raf) cancelAnimationFrame(view.raf);
      if (ro) { try { ro.disconnect(); } catch (e) { } }
      listeners.forEach(function (off) { try { off(); } catch (e) { } });
      listeners = [];
      try {
        var lose = R.gl && R.gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      } catch (e) { }
      R.passes.clear();
    };

    return view;
  }

  root.JPSE = {
    version: '1.0.0',
    API: API,
    FRONT: FRONT,
    listShaders: listShaders,
    getPlan: getPlan,
    loadEngine: loadEngine,
    uniforms: uniforms,
    createView: createView
  };

})(window);
