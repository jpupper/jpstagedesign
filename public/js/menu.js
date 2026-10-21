// ============================================================
// BOTONERA FSC - Lógica del Menú (MASTER)
// Modo User (botonera 6 botones) + Modo Advanced (materiales)
// Comunicación con Output vía Socket.io
// ============================================================

(function() {
  'use strict';
  
  // --- ELEMENTOS DOM ---
  const modeSwitchUser = document.getElementById('modeSwitchUser');
  const modeSwitchAdvanced = document.getElementById('modeSwitchAdvanced');
  const modeUserView = document.getElementById('mode-user');
  const modeAdvancedView = document.getElementById('mode-advanced');
  const userButtons = document.getElementById('userButtons');
  const materialList = document.getElementById('materialList');
  const inputTabs = document.getElementById('inputTabs');
  const inputPaneCargados = document.getElementById('inputPaneCargados');
  const inputPaneEditor = document.getElementById('inputPaneEditor');
  const inputCountCargados = document.getElementById('inputCountCargados');
  const inputCountEditor = document.getElementById('inputCountEditor');
  const jpeGrid = document.getElementById('jpeGrid');
  const jpeSearch = document.getElementById('jpeSearch');
  const jpeAuthor = document.getElementById('jpeAuthor');
  const jpeSort = document.getElementById('jpeSort');
  const jpeReload = document.getElementById('jpeReload');
  const jpeMeta = document.getElementById('jpeMeta');
  const jpePager = document.getElementById('jpePager');
  const buttonAssignments = document.getElementById('buttonAssignments');
  const btnAddMaterial = document.getElementById('btnAddMaterial');
  const btnSaveButtons = document.getElementById('btnSaveButtons');
  const btnSettings = document.getElementById('btnSettings');
  const settingsPanel = document.getElementById('settingsPanel');
  const statusDotAdvanced = document.getElementById('statusDotAdvanced');
  const statusTextAdvanced = document.getElementById('statusTextAdvanced');
  const open3dBtn = document.getElementById('open3D');
  const styleSelector = document.getElementById('styleSelector');
  const styleSelect = document.getElementById('styleSelect');
  
  // --- ESTADO LOCAL ---
  let socket = null;
  let amIMaster = false;
  let activeSceneId = null;
  let isConnected = false;
  let bgShaderCtx = null; // Contexto del shader de fondo (motor local .frag)
  let bgJpView = null;         // 🎨 fondo con el MOTOR DEL EDITOR (shader elegido en INPUTS)
  let bgShaderName = null;     // shader del editor usado como fondo (null = shaderfondo.frag)
  let activePresetName = null; // preset cargado: dónde se guarda lo que se toca acá
  // Build del front: se usa como cache-buster al abrir Outputs en otra pestaña.
  const BUILD_MENU = '2026-10-20-jpshader';
  let currentStyle = 'light'; // Estilo visual: light | dark | matrix
  let userButtonShaderContexts = {}; // Shader contexts for user buttons
  
  // --- BIBLIOTECA DE MATERIALES ---
  const API_BASE = CONFIG.API_URL;
  
  let materialLibrary = [];
  let buttonSlots = [
    { slot: 1, materialId: null, label: null },
    { slot: 2, materialId: null, label: null },
    { slot: 3, materialId: null, label: null },
    { slot: 4, materialId: null, label: null },
    { slot: 5, materialId: null, label: null },
    { slot: 6, materialId: null, label: null }
  ];
  
  // --- INICIALIZACIÓN ---
  function init() {
    connectSocket();
    setupEventListeners();
    loadSettings();
    initFondo();            // fondo: shader del editor elegido en INPUTS o shaderfondo.frag
    initActivePreset();
    initPresentacion();
    setupKeyboardShortcuts();
    initMaterialUI();
    initInputTabs();
    setupDropzone();
    initTheme();
    initLogoUI();
  }

  // Activar el botón 1 por defecto al cargar
  function activateDefaultButton() {
    if (buttonSlots && buttonSlots.length > 0 && buttonSlots[0].materialId) {
      const slot = buttonSlots[0];
      const mat = getMaterialById(slot.materialId);
      if (mat) {
        // Marcar como activo
        updateActiveButton(mat.id);
        // Enviar al socket si estamos conectados
        if (socket && isConnected) {
          const scene = synthesizeScene(mat);
          socket.emit('selectScene', scene);
        }
      }
    }
  }
  
  // ============================================================
  // SHADER DE FONDO (Cargado 100% desde shaderfondo.frag)
  // ============================================================
  /** Lee el fondo guardado y recién ahí monta el shader. */
  async function initFondo() {
    try {
      const d = await apiFetch(API_BASE + '/bg-shader');
      bgShaderName = (d && d.shader) ? d.shader : null;
    } catch (e) {
      bgShaderName = null;
    }
    initBackgroundShader();
  }

  /** 🎨 Fondo con el motor de jpShadereditor (shader elegido en INPUTS). */
  async function mountJpBackground(nombre) {
    const canvas = document.getElementById('bgShaderCanvas');
    if (!canvas || typeof JPSE === 'undefined') return false;
    destroyJpBackground();
    try {
      await JPSE.loadEngine();
      const plan = await JPSE.getPlan(nombre);
      bgJpView = JPSE.createView(canvas, plan, {
        maxDpr: 1.25,
        mouse: 'window',
        uniforms: {},
        onError: (t) => console.warn('[FONDO][JPSE]', t)
      });
      console.log('[MENU] Fondo del editor: ' + nombre + ' · ' + plan.passes.length + ' pase(s)');
      document.body.classList.add('bg-jpshader');
      return true;
    } catch (e) {
      console.warn('[MENU] No se pudo montar el fondo del editor:', e.message);
      bgJpView = null;
      return false;
    }
  }

  function destroyJpBackground() {
    if (bgJpView) {
      try { bgJpView.destroy(); } catch (e) { /* noop */ }
      bgJpView = null;
    }
    document.body.classList.remove('bg-jpshader');
  }

  /**
   * Elige el FONDO de la app: un shader del editor (lo pide a jpShadereditor) o
   * null para volver al shaderfondo.frag local. Se guarda en el servidor.
   */
  async function setAppBackground(nombre) {
    const limpio = nombre ? String(nombre) : null;
    try {
      await apiFetch(API_BASE + '/bg-shader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shader: limpio })
      });
    } catch (e) {
      showToast('⚠️ No se pudo guardar el fondo: ' + e.message);
      return;
    }
    bgShaderName = limpio;
    if (bgShaderName) {
      const ok = await mountJpBackground(bgShaderName);
      if (!ok) showToast('⚠️ No se pudo reproducir el shader; se deja el fondo anterior');
    } else {
      destroyJpBackground();
      initBackgroundShaderLocal();
    }
    showToast(limpio ? ('🎨 Fondo: ' + limpio) : '🎨 Fondo por defecto (shaderfondo)');
    renderJpEditorIndex();
  }

  function initBackgroundShader() {
    if (bgShaderName) {
      mountJpBackground(bgShaderName);
      return;
    }
    destroyJpBackground();
    initBackgroundShaderLocal();
  }

  async function initBackgroundShaderLocal() {
    var canvas = document.getElementById('bgShaderCanvas');
    if (!canvas) return;
    
    try {
      const basePath = (window.CONFIG && window.CONFIG.BASE) || (window.FUTUREX_CONFIG && window.FUTUREX_CONFIG.BASE) || '/jpstagedesign';
      let fragText = '';

      if (typeof Shaders !== 'undefined' && Shaders.getShader) {
        try {
          const shaderObj = await Shaders.getShader('shaderfondo');
          if (shaderObj && shaderObj.fragment) {
            fragText = shaderObj.fragment;
          }
        } catch (e) {}
      }

      if (!fragText) {
        const candidateUrls = [
          `${basePath}/shaders/shaderfondo.frag`,
          `/shaders/shaderfondo.frag`
        ];

        for (const url of candidateUrls) {
          try {
            const res = await fetch(url + '?t=' + Date.now());
            if (res.ok) {
              fragText = await res.text();
              break;
            }
          } catch (e) {}
        }
      }

      if (!fragText) {
        console.warn('[MENU] No se pudo cargar shaderfondo.frag, reintentando en 300ms...');
        setTimeout(initBackgroundShader, 300);
        return;
      }

      var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        console.error('[MENU] WebGL no disponible');
        return;
      }
      
      var vsSource = `
        attribute vec2 a_position;
        void main() {
          gl_Position = vec4(a_position, 0.0, 1.0);
        }
      `;

      var vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs, vsSource);
      gl.compileShader(vs);
      if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
        console.error('[MENU] Error vertex shader fondo:', gl.getShaderInfoLog(vs));
        return;
      }
      
      var fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, fragText);
      gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        console.error('[MENU] Error fragment shader fondo:', gl.getShaderInfoLog(fs));
        return;
      }
      
      var program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('[MENU] Error link shader fondo:', gl.getProgramInfoLog(program));
        return;
      }
      gl.useProgram(program);
      
      var buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 1, -1, -1, 1,
        -1, 1, 1, -1, 1, 1
      ]), gl.STATIC_DRAW);
      
      var posLoc = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
      
      var uResolution = gl.getUniformLocation(program, 'u_resolution');
      var uTime = gl.getUniformLocation(program, 'u_time');
      var startTime = performance.now();
      
      if (bgShaderCtx && bgShaderCtx.rafId) {
        cancelAnimationFrame(bgShaderCtx.rafId);
      }

      bgShaderCtx = { gl, program, buffer, posLoc, uResolution, uTime, startTime, rafId: null };
      
      function render() {
        gl.useProgram(program);
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
        if (uResolution) gl.uniform2f(uResolution, canvas.width, canvas.height);
        if (uTime) gl.uniform1f(uTime, (performance.now() - startTime) / 1000.0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        bgShaderCtx.rafId = requestAnimationFrame(render);
      }
      
      render();
      console.log('[MENU] Shader de fondo iniciado desde shaderfondo.frag');
    } catch (e) {
      console.error('[MENU] Error shader de fondo:', e);
    }
  }
  
  // Recargar el shader de fondo (el del editor o el .frag local)
  function reloadShader() {
    if (bgShaderName) {
      console.log('[MENU] Recargando fondo del editor: ' + bgShaderName);
      mountJpBackground(bgShaderName);
      return;
    }
    console.log('[MENU] Recargando shaderfondo.frag...');
    if (bgShaderCtx && bgShaderCtx.gl && bgShaderCtx.program) {
      if (bgShaderCtx.rafId) cancelAnimationFrame(bgShaderCtx.rafId);
      bgShaderCtx.gl.deleteProgram(bgShaderCtx.program);
    }
    initBackgroundShaderLocal();
  }
  
  // ============================================================
  // TECLAS DE ATAJO
  // ============================================================
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
      // Ignorar si estamos escribiendo en un campo
      const tag = document.activeElement.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (typing) return;
      
      // Q = cambiar entre Modo User y Modo Advanced
      if (e.key === 'q' || e.key === 'Q') {
        toggleMode();
      }
      
      // P = toggle settings panel
      if (e.key === 'p' || e.key === 'P') {
        toggleSettings();
      }
      
      // R = Recargar shader
      if (e.key === 'r' || e.key === 'R') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          reloadShader();
        }
      }
    });
    console.log('[MENU] Teclas configuradas: Q = cambiar modo, P = mostrar CONFIG, R = recargar shader');
  }
  
  function toggleMode() {
    const isUser = modeUserView.style.display !== 'none';
    switchMode(isUser ? 'advanced' : 'user');
  }
  
  function toggleConfigButton() {
    // P key: toggle the config button visibility
    if (btnSettings) {
      if (btnSettings.style.display === 'none') {
        btnSettings.style.display = 'flex';
      } else {
        btnSettings.style.display = 'none';
      }
    }
  }
  
  // ============================================================
  // CONEXIÓN SOCKET
  // ============================================================
  function connectSocket() {
    if (typeof io === 'undefined') {
      console.warn('[MENU] Socket.io no disponible, reintentando...');
      setTimeout(connectSocket, 500);
      return;
    }

    const socketOptions = {
      path: CONFIG.SOCKET_PATH,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    };
    
    if (CONFIG.SOCKET_URL) {
      socket = io(CONFIG.SOCKET_URL, socketOptions);
    } else {
      socket = io(socketOptions);
    }
    
    socket.on('connect', () => {
      console.log('[MENU] Conectado al servidor');
      isConnected = true;
      updateStatus('Conectado - Reclamando master...', false);
      socket.emit('claimMaster');
    });
    
    socket.on('disconnect', () => {
      console.log('[MENU] Desconectado');
      isConnected = false;
      updateStatus('Desconectado', false);
      amIMaster = false;
    });
    
    socket.on('connect_error', (error) => {
      console.error('[MENU] Error de conexión:', error.message);
      updateStatus('Error de conexión', false);
    });
    
    socket.on('masterClaimed', (data) => {
      amIMaster = (data.socketId === socket.id);
      updateStatus(amIMaster ? 'MASTER ACTIVO' : 'MODO ESCUCHA', amIMaster);
      console.log(`[MENU] Master: ${data.socketId} | Yo: ${socket.id} | Soy master: ${amIMaster}`);
    });
    
    socket.on('masterReleased', () => {
      amIMaster = false;
      updateStatus('MASTER LIBERADO', false);
    });
    
    socket.on('masterStatus', (data) => {
      amIMaster = (data.masterId === socket.id);
      updateStatus(amIMaster ? 'MASTER ACTIVO' : 'MODO ESCUCHA', amIMaster);
      if (data.mappingMode) {
        updateMappingUI(data.mappingMode);
      }
      if (data.logoUrl) {
        updateAppLogo(data.logoUrl);
      }
    });

    socket.on('logoChanged', (data) => {
      if (data && data.logoUrl) {
        updateAppLogo(data.logoUrl);
      }
    });
    
    socket.on('mappingModeChanged', (data) => {
      console.log('[MENU] Modo de mapeo recibido:', data.mode);
      updateMappingUI(data.mode);
    });
    
    socket.on('sceneChanged', (data) => {
      console.log(`[MENU] Escena cambiada: ${data.sceneId || data.id}`);
      updateActiveButton(data.sceneId || data.id);
    });
    
    socket.on('sceneCleared', () => {
      console.log('[MENU] Escena limpiada / Blackout');
      updateActiveButton('blackout');
    });

    // 🗂️ PRESETS — el que está cargado (todo lo que se guarda va ahí)
    socket.on('presetChanged', (data) => {
      activePresetName = (data && data.name) ? data.name : null;
      updatePresetBadge();
      if (data && data.activated) {
        showToast('🗂 Preset cargado: ' + data.name);
        loadMaterialsFromServer({ activateDefault: false });
        initFondo();     // el preset puede traer otro fondo
      }
    });

    // 🧠 AGENTE / API — la biblioteca de inputs cambió en el servidor
    // (un agente agregó links/imágenes o armó una instalación completa).
    socket.on('libraryChanged', (data) => {
      console.log('[MENU] Biblioteca actualizada por agente/API', data && data.materials ? `(${data.materials.length} inputs)` : '');
      loadMaterialsFromServer({ activateDefault: false });
    });
  }

  // ============================================================
  // GESTIÓN DE LOGO PERSONALIZADO (MODO ADVANCED)
  // ============================================================
  function updateAppLogo(url) {
    if (!url) return;
    const logos = document.querySelectorAll('.logo-img, .logo-output-img, #logoPreviewAdvanced');
    logos.forEach(img => {
      img.src = url;
    });
  }

  async function initLogoUI() {
    const input = document.getElementById('customLogoInput');
    const btnReset = document.getElementById('btnResetLogo');
    const statusMsg = document.getElementById('logoUploadStatus');
    // API del logo: en el FTP (estatico) tiene que apuntar al VPS, no al host actual
    const API_LOGO = ((window.CONFIG && window.CONFIG.API_URL) || '/jpstagedesign/api') + '/logo';

    // Cargar logo actual
    try {
      const res = await fetch(API_LOGO);
      const data = await res.json();
      if (data.ok && data.logoUrl) {
        updateAppLogo(data.logoUrl);
      }
    } catch (e) {
      console.warn('[LOGO] No se pudo cargar logo inicial:', e);
    }

    if (input) {
      input.addEventListener('change', async () => {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];
        const formData = new FormData();
        formData.append('logo', file);

        if (statusMsg) {
          statusMsg.textContent = 'Subiendo logo...';
          statusMsg.className = 'status-msg';
        }

        try {
          const res = await fetch(API_LOGO, {
            method: 'POST',
            body: formData
          });
          const data = await res.json();
          if (data.ok && data.logoUrl) {
            updateAppLogo(data.logoUrl);
            if (statusMsg) {
              statusMsg.textContent = '✅ Logo actualizado correctamente';
              statusMsg.className = 'status-msg';
            }
          } else {
            if (statusMsg) {
              statusMsg.textContent = 'Error: ' + (data.error || 'No se pudo subir');
              statusMsg.className = 'status-msg';
            }
          }
        } catch (err) {
          if (statusMsg) {
            statusMsg.textContent = 'Error de conexión: ' + err.message;
            statusMsg.className = 'status-msg';
          }
        }
        input.value = '';
      });
    }

    if (btnReset) {
      btnReset.addEventListener('click', async () => {
        if (statusMsg) {
          statusMsg.textContent = 'Restaurando logo por defecto...';
          statusMsg.className = 'status-msg';
        }
        try {
          const res = await fetch(API_LOGO, {
            method: 'DELETE'
          });
          const data = await res.json();
          if (data.ok && data.logoUrl) {
            updateAppLogo(data.logoUrl);
            if (statusMsg) {
              statusMsg.textContent = '✅ Logo por defecto restaurado';
              statusMsg.className = 'status-msg';
            }
          }
        } catch (err) {
          if (statusMsg) {
            statusMsg.textContent = 'Error: ' + err.message;
            statusMsg.className = 'status-msg';
          }
        }
      });
    }
  }
  
  // ============================================================
  // BOTONERA USER - Disparar material
  // ============================================================
  function onUserButtonClick(slot) {
    const material = getMaterialById(slot.materialId);
    if (!material) {
      setStatus('assignStatus', 'Este botón no tiene material asignado', 'err');
      return;
    }
    
    if (!isConnected) {
      alert('No hay conexión con el servidor');
      return;
    }
    
    if (!amIMaster) {
      socket.emit('claimMaster');
      amIMaster = true;
      updateStatus('MASTER ACTIVO', true);
    }
    
    const scene = synthesizeScene(material);
    socket.emit('selectScene', scene);
    updateActiveButton(scene.id);
    console.log(`[MENU] Botón ${slot.slot} -> ${material.name} (${scene.type})`);
  }
  
  function synthesizeScene(material) {
    const base = { id: material.id, label: material.name || 'Material', type: material.type };
    if (material.type === 'jpshader') {
      // El nombre del editor viaja EXACTO (es la clave del plan en el backend):
      // asi el Output 3D reproduce el mismo shader que se eligió en la botonera.
      base.type = 'jpshader';
      base.editor = 'jpshader';
      base.shader = material.shader || material.effect || material.name;
      base.thumb = getMaterialThumb(material);
      base.uniforms = (typeof getMaterialUniformValues === 'function') ? getMaterialUniformValues(material) : (currentShaderUniformValues[material.id] || {});
    }
    if (material.type === 'effect' || material.type === 'shader') {
      base.type = 'shader';
      base.shader = (material.effect || material.shader || material.name || '').toLowerCase();
      base.uniforms = (typeof getMaterialUniformValues === 'function') ? getMaterialUniformValues(material) : (currentShaderUniformValues[material.id] || {});
    }
    if (material.type === 'image') base.src = material.src;
    if (material.type === 'youtube') base.videoId = material.videoId;
    if (material.type === 'video') base.src = material.src;
    if (material.type === 'web') { base.type = 'web'; base.src = material.src; base.url = material.src; }
    return base;
  }
  
  function updateActiveButton(sceneId) {
    activeSceneId = sceneId;
    const isBlackout = (sceneId === 'blackout');
    
    const btnBlackout = document.getElementById('btnBlackout');
    if (btnBlackout) {
      btnBlackout.classList.toggle('active', isBlackout);
    }
    
    document.querySelectorAll('.user-btn').forEach(b => {
      b.classList.toggle('active', !isBlackout && b.dataset.matId === sceneId);
    });
    document.querySelectorAll('.mat-item').forEach(b => {
      b.classList.toggle('active', !isBlackout && b.dataset.matId === sceneId);
    });
  }
  
  function triggerBlackout() {
    if (!isConnected) {
      alert('No hay conexión con el servidor');
      return;
    }
    
    if (!amIMaster) {
      socket.emit('claimMaster');
      amIMaster = true;
      updateStatus('MASTER ACTIVO', true);
    }
    
    const blackoutScene = {
      id: 'blackout',
      sceneId: 'blackout',
      label: 'BLACKOUT',
      name: 'BLACKOUT',
      type: 'blackout'
    };
    
    socket.emit('selectScene', blackoutScene);
    socket.emit('clearScene');
    updateActiveButton('blackout');
    console.log('[MENU] BLACKOUT activado (pantallas apagadas)');
  }
  
  // ============================================================
  // ABRIR OUTPUT / 3D
  // ============================================================
  function openOutput() {
    window.open(CONFIG.OUTPUT_URL, '_blank');
  }

  function open3D() {
    // Cache-buster por BUILD: un deploy nuevo del 3D nunca se abre con la copia
    // vieja que el navegador tenga guardada.
    const sep = CONFIG.OUTPUT_3D_URL.indexOf('?') === -1 ? '?' : '&';
    window.open(CONFIG.OUTPUT_3D_URL + sep + 'v=' + BUILD_MENU, '_blank');
  }

  function openScreenSlice(screenNum) {
    const base = CONFIG.OUTPUT_URL.replace(/\/$/, '');
    window.open(`${base}/?screen=${screenNum}`, '_blank');
  }
  
  // ============================================================
  // CONFIGURACIÓN (habitación y mapeo)
  // ============================================================
  let currentMappingMode = 'duplicated';

  function setMappingMode(mode) {
    currentMappingMode = mode === 'extended' ? 'extended' : 'duplicated';
    localStorage.setItem('fsc_mapping_mode', currentMappingMode);
    updateMappingUI(currentMappingMode);
    if (socket && isConnected) {
      socket.emit('setMappingMode', { mode: currentMappingMode });
    }
  }

  function updateMappingUI(mode) {
    currentMappingMode = (mode === 'extended') ? 'extended' : 'duplicated';
    // Persistir SIEMPRE: así la botonera, el simulador 3D y las salidas (mismo origen)
    // convergen al mismo modo y nadie queda con un valor viejo.
    try { localStorage.setItem('fsc_mapping_mode', currentMappingMode); } catch (e) { /* noop */ }
    const btnDup = document.getElementById('mappingDuplicated');
    const btnExt = document.getElementById('mappingExtended');
    if (btnDup) btnDup.classList.toggle('active', currentMappingMode === 'duplicated');
    if (btnExt) btnExt.classList.toggle('active', currentMappingMode === 'extended');
  }

  function toggleSettings() {
    const isOpen = settingsPanel.classList.toggle('open');
    if (btnSettings) {
      btnSettings.classList.toggle('panel-open', isOpen);
    }
  }
  
  function loadSettings() {
    const savedMapping = localStorage.getItem('fsc_mapping_mode');
    if (savedMapping) {
      updateMappingUI(savedMapping);
    }

    const saved = localStorage.getItem('fsc_room_settings');
    if (saved) {
      const settings = JSON.parse(saved);
      CONFIG.ROOM.length = settings.length || 4480;
      CONFIG.ROOM.width = settings.width || 3015;
      CONFIG.ROOM.height = settings.height || 200;
      
      document.getElementById('roomLength').value = CONFIG.ROOM.length;
      document.getElementById('roomWidth').value = CONFIG.ROOM.width;
      document.getElementById('roomHeight').value = CONFIG.ROOM.height;
    }
  }
  
  function saveSettings() {
    CONFIG.ROOM.length = parseInt(document.getElementById('roomLength').value) || 4480;
    CONFIG.ROOM.width = parseInt(document.getElementById('roomWidth').value) || 3015;
    CONFIG.ROOM.height = parseInt(document.getElementById('roomHeight').value) || 200;
    
    localStorage.setItem('fsc_room_settings', JSON.stringify(CONFIG.ROOM));
    toggleSettings();
    
    if (socket && isConnected) {
      socket.emit('roomConfig', CONFIG.ROOM);
    }
  }
  
  // ============================================================
  // EVENT LISTENERS
  // ============================================================
  function setupEventListeners() {
    if (modeSwitchUser) modeSwitchUser.addEventListener('click', () => switchMode('user'));
    if (modeSwitchAdvanced) modeSwitchAdvanced.addEventListener('click', () => switchMode('advanced'));
    
    const btnDup = document.getElementById('mappingDuplicated');
    if (btnDup) btnDup.addEventListener('click', () => setMappingMode('duplicated'));
    
    const btnExt = document.getElementById('mappingExtended');
    if (btnExt) btnExt.addEventListener('click', () => setMappingMode('extended'));
    
    document.querySelectorAll('.btn-screen-slice').forEach(btn => {
      btn.addEventListener('click', () => {
        const scr = btn.dataset.screen;
        if (scr) openScreenSlice(scr);
      });
    });

    if (btnAddMaterial) btnAddMaterial.addEventListener('click', onAddMaterial);
    if (btnSaveButtons) btnSaveButtons.addEventListener('click', onSaveButtons);
    if (btnSettings) btnSettings.addEventListener('click', toggleSettings);
    
    const closeBtn = document.getElementById('closeSettings');
    if (closeBtn) closeBtn.addEventListener('click', toggleSettings);
    
    const saveBtn = document.getElementById('saveSettings');
    if (saveBtn) saveBtn.addEventListener('click', saveSettings);
    
    const btnOpenOutput = document.getElementById('btnOpenOutput');
    if (btnOpenOutput) btnOpenOutput.addEventListener('click', openOutput);
    
    const btnOpen3d = document.getElementById('btnOpen3d');
    if (btnOpen3d) btnOpen3d.addEventListener('click', open3D);
    
    if (open3dBtn) open3dBtn.addEventListener('click', open3D);
    
    const btnBlackout = document.getElementById('btnBlackout');
    if (btnBlackout) btnBlackout.addEventListener('click', triggerBlackout);

    // Botón OUTPUT 3D en el header (al lado de BLACKOUT)
    const btnOpen3dHeader = document.getElementById('btnOpen3dHeader');
    if (btnOpen3dHeader) btnOpen3dHeader.addEventListener('click', open3D);
  }
  
  // ============================================================
  // ACTUALIZAR STATUS (en panel avanzado)
  // ============================================================
  function updateStatus(text, isMaster) {
    if (statusTextAdvanced) {
      statusTextAdvanced.textContent = text;
    }
    
    if (statusDotAdvanced) {
      statusDotAdvanced.classList.toggle('master', isMaster);
      
      if (text.includes('Error') || text.includes('Desconectado')) {
        statusDotAdvanced.style.background = '#ff0000';
        statusDotAdvanced.style.boxShadow = '0 0 8px rgba(255, 0, 0, 0.4)';
      } else if (isMaster) {
        statusDotAdvanced.style.background = '#00e676';
        statusDotAdvanced.style.boxShadow = '0 0 12px rgba(0, 230, 118, 0.6)';
      } else {
        statusDotAdvanced.style.background = '#ccc';
        statusDotAdvanced.style.boxShadow = 'none';
      }
    }
  }
  
  // ============================================================
  // MATERIALES - Biblioteca, carga y asignación
  // ============================================================
  
  async function apiFetch(url, options) {
    const res = await fetch(url, options);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || ('Error HTTP ' + res.status));
    return json;
  }
  
  async function loadMaterialsFromServer(opts = {}) {
    try {
      const data = await apiFetch(API_BASE + '/materials');
      materialLibrary = data.materials || [];
      if (data.buttons && data.buttons.length === 6) {
        buttonSlots = data.buttons.slice().sort((a, b) => a.slot - b.slot);
      }

      // Cargar parámetros guardados en currentShaderUniformValues
      if (data.shaderParams && typeof data.shaderParams === 'object') {
        Object.entries(data.shaderParams).forEach(([id, params]) => {
          if (params && typeof params === 'object') {
            currentShaderUniformValues[id] = Object.assign({}, currentShaderUniformValues[id] || {}, params);
          }
        });
      }
      materialLibrary.forEach(m => {
        if (m.savedUniforms && typeof m.savedUniforms === 'object') {
          currentShaderUniformValues[m.id] = Object.assign({}, currentShaderUniformValues[m.id] || {}, m.savedUniforms);
          const cleanName = (m.effect || m.shader || m.name || '').toLowerCase();
          if (cleanName) {
            currentShaderUniformValues[cleanName] = Object.assign({}, currentShaderUniformValues[cleanName] || {}, m.savedUniforms);
          }
        }
      });

      // Shaders del editor: los params se guardan con el NOMBRE del editor como
      // clave, así que se rehidratan por ahí (no por el id del material).
      materialLibrary.forEach(m => {
        if (!isJpShader(m)) return;
        const nombre = m.shader || m.effect || '';
        const src = data.shaderParams && (data.shaderParams[nombre] || data.shaderParams[nombre.toLowerCase()]);
        if (src && typeof src === 'object') {
          currentShaderUniformValues[m.id] = Object.assign({}, currentShaderUniformValues[m.id] || {}, src);
        }
      });

      renderUserButtons();
      renderMaterialList();
      renderButtonAssignments();
      setStatus('uploadStatus', 'Biblioteca cargada desde el servidor', 'ok');

      // Activar botón 1 por defecto (se omite en refrescos automáticos,
      // p. ej. cuando un agente/API acaba de reescribir la biblioteca)
      if (opts.activateDefault !== false) {
        setTimeout(() => activateDefaultButton(), 500);
      }
    } catch (err) {
      console.error('[MENU] Error cargando materiales:', err);
      setStatus('uploadStatus', 'No se pudo conectar al servidor de materiales', 'err');
      renderUserButtons();
      renderMaterialList();
      renderButtonAssignments();
    }
  }
  
  function getMaterialById(id) {
    return materialLibrary.find(m => m.id === id) || null;
  }
  
  // --- Capturas / previews de los inputs (thumbnail de cada tarjeta) ---
  // Lo que ya tiene una imagen o un video con miniatura se muestra tal cual;
  // las webs se capturan con el headless del backend (/api/webthumb) y los
  // shaders del editor se renderizan acá mismo en un canvas offscreen.
  let inputFilter = 'todos';   // todos | cargados | imagen | web

  function matThumb(m) {
    if (!m) return null;
    if (m.thumb) return m.thumb;
    if (m.type === 'image' && m.src) return m.src;
    if (m.type === 'youtube' && m.videoId) return 'https://img.youtube.com/vi/' + m.videoId + '/mqdefault.jpg';
    return null;
  }

  async function jpThumbDataUrl(m) {
    if (typeof JPSE === 'undefined') return null;
    const nombre = m.shader || m.effect || '';
    if (!nombre) return null;
    await JPSE.loadEngine();
    const plan = await JPSE.getPlan(nombre);
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 400;
    const view = JPSE.createView(canvas, plan, { maxDpr: 1, mouse: 'none', uniforms: {} });
    await new Promise(r => setTimeout(r, 800));
    let data = null;
    try { data = canvas.toDataURL('image/jpeg', 0.7); } catch (e) { data = null; }
    try { view.destroy(); } catch (e) { /* noop */ }
    return data;
  }

  /** Saca (o rehace) la captura de un input y la guarda en el servidor. */
  async function captureThumb(m) {
    if (!m || m.builtin) return null;
    let thumb = null;
    try {
      // OJO: las webs guardan la URL en `src` (no en `url`)
      const webUrl = m.type === 'web' ? (m.url || m.src) : null;
      if (webUrl) {
        const d = await apiFetch(API_BASE + '/webthumb?url=' + encodeURIComponent(webUrl));
        if (d && d.thumb) thumb = d.thumb;
      } else if (m.type === 'youtube' && m.videoId) {
        thumb = 'https://img.youtube.com/vi/' + m.videoId + '/mqdefault.jpg';
      } else if (isJpShader(m)) {
        thumb = await jpThumbDataUrl(m);
      } else if (m.type === 'image' && m.src) {
        thumb = m.src;
      }
    } catch (e) {
      console.warn('[THUMB] ' + (m.name || m.id) + ': ' + e.message);
    }
    if (!thumb) return null;
    m.thumb = thumb;   // se muestra ya, aunque el guardado falle
    try {
      await apiFetch(API_BASE + '/materials/' + m.id + '/thumb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thumb })
      });
    } catch (e) {
      console.warn('[THUMB] no se pudo guardar en el servidor:', e.message);
    }
    return thumb;
  }

  function matchesFilter(m) {
    if (inputFilter === 'cargados') return !m.builtin;
    if (inputFilter === 'imagen') return m.type === 'image';
    if (inputFilter === 'web') return m.type === 'web';
    return true;
  }

  function filteredMaterials() {
    return materialLibrary.filter(matchesFilter);
  }

  function initInputFilters() {
    const saved = localStorage.getItem('fsc_input_filter') || 'todos';
    inputFilter = ['todos', 'cargados', 'imagen', 'web'].indexOf(saved) >= 0 ? saved : 'todos';
    document.querySelectorAll('#inputFilters [data-ifilter]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.ifilter === inputFilter);
      btn.addEventListener('click', () => {
        inputFilter = btn.dataset.ifilter;
        localStorage.setItem('fsc_input_filter', inputFilter);
        document.querySelectorAll('#inputFilters [data-ifilter]').forEach(b => b.classList.toggle('active', b === btn));
        renderMaterialList();
      });
    });
  }

  function materialIcon(m) {
    if (m.type === 'jpshader') return '🌀';
    if (m.type === 'shader' || m.type === 'effect') return '✨';
    if (m.type === 'image') return '🖼️';
    if (m.type === 'youtube') return '🎬';
    if (m.type === 'video') return '🎥';
    if (m.type === 'web') return '🌐';
    return '📦';
  }
  
  function materialTypeLabel(m) {
    if (m.type === 'jpshader') return 'JP Shader Editor';
    if (m.type === 'shader' || m.type === 'effect') return 'Shader';
    if (m.type === 'image') return 'Imagen';
    if (m.type === 'youtube') return 'Video YT';
    if (m.type === 'video') return 'Video';
    if (m.type === 'web') return 'Página Web';
    return m.type;
  }

  // Un shader del editor se reproduce con el motor de jpShadereditor (plan),
  // no con los .frag locales de shaders.js.
  function isJpShader(m) {
    return !!m && m.type === 'jpshader';
  }

  // ¿Abre panel de parámetros? (shader local o shader del editor)
  function isParamsable(m) {
    return !!m && (m.type === 'shader' || m.type === 'effect' || m.type === 'jpshader');
  }
  
  function setStatus(id, text, cls) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '';
    el.className = 'status-msg' + (cls ? ' ' + cls : '');
  }
  
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // --- Helpers de color y uniforms ---
  function vec3ToHex(v) {
    if (!Array.isArray(v) || v.length < 3) return '#ffffff';
    const r = Math.min(255, Math.max(0, Math.round(v[0] * 255))).toString(16).padStart(2, '0');
    const g = Math.min(255, Math.max(0, Math.round(v[1] * 255))).toString(16).padStart(2, '0');
    const b = Math.min(255, Math.max(0, Math.round(v[2] * 255))).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  function hexToVec3(hex) {
    hex = (hex || '#ffffff').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const num = parseInt(hex, 16) || 0;
    return [
      Number((((num >> 16) & 255) / 255.0).toFixed(3)),
      Number((((num >> 8) & 255) / 255.0).toFixed(3)),
      Number(((num & 255) / 255.0).toFixed(3))
    ];
  }

  // Estado de parámetros abiertos y valores de uniforms
  let openShaderParamsMatId = null;
  const currentShaderUniformValues = {}; // [matId]: { u_speed: 1.0, ... }

  // Obtener todos los uniforms configurados o sus valores por defecto del shader
  function getMaterialUniformValues(mat) {
    if (!mat) return {};
    if (!currentShaderUniformValues[mat.id]) {
      currentShaderUniformValues[mat.id] = {};
    }
    const res = Object.assign({}, currentShaderUniformValues[mat.id]);
    if (Array.isArray(mat.uniforms)) {
      mat.uniforms.forEach(u => {
        if (res[u.name] === undefined && u.default !== undefined) {
          res[u.name] = u.default;
          currentShaderUniformValues[mat.id][u.name] = u.default;
        }
      });
    }
    return res;
  }
  
  // --- Render botonera User ---
  
  const EFFECT_THUMBS = {
    space: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=600&q=80',
    fire: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&q=80',
    waves: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=80',
    lines: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=600&q=80',
    hearts: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=600&q=80',
    rain: 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?w=600&q=80',
    gradient: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=600&q=80',
    noise: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=600&q=80',
    solid: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=600&q=80'
  };

  function getMaterialThumb(mat) {
    if (!mat) return null;
    if (mat.type === 'jpshader') {
      return mat.thumb || mat.src || null;   // miniatura publicada por el editor
    }
    if (mat.type === 'effect' || mat.type === 'shader') {
      const eff = (mat.effect || mat.shader || mat.name || '').toLowerCase();
      return EFFECT_THUMBS[eff] || EFFECT_THUMBS.space;
    }
    if (mat.type === 'image') {
      return mat.src;
    }
    if (mat.type === 'youtube' && mat.videoId) {
      return `https://img.youtube.com/vi/${mat.videoId}/hqdefault.jpg`;
    }
    if (mat.type === 'video') {
      return mat.thumb || mat.src || null;
    }
    if (mat.type === 'web') {
      try {
        const host = new URL(mat.src).hostname;
        return `https://www.google.com/s2/favicons?sz=128&domain=${host}`;
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  function renderUserButtons() {
    if (!userButtons) return;
    userButtons.innerHTML = '';
    buttonSlots.forEach(slot => {
      const mat = getMaterialById(slot.materialId);
      const btn = document.createElement('button');
      btn.className = 'user-btn' + (mat ? '' : ' empty');
      btn.dataset.slot = slot.slot;
      btn.dataset.matId = mat ? mat.id : '';
      
      const isShader = mat && (mat.type === 'shader' || mat.type === 'effect');
      const isJp = isJpShader(mat);
      
      // Shader del editor (jpshader): la tarjeta usa la miniatura del editor.
      // El render en vivo lo hace el motor del editor en el panel de parámetros.
      if (isJp) {
        const thumbUrl = getMaterialThumb(mat);
        if (thumbUrl) {
          const bgImg = document.createElement('img');
          bgImg.className = 'user-btn-thumb';
          bgImg.src = thumbUrl;
          bgImg.alt = mat.name || '';
          bgImg.onerror = function () { this.style.display = 'none'; };
          btn.appendChild(bgImg);
        }
      } else if (isShader) {
        const canvas = document.createElement('canvas');
        canvas.className = 'user-btn-shader-canvas';
        canvas.dataset.slot = slot.slot;
        canvas.dataset.shaderName = (mat.effect || mat.shader || mat.name || '').toLowerCase();
        btn.appendChild(canvas);
        
        // Renderizar un frame estático inicial para que el botón no arranque en negro
        renderStaticShaderPreview(canvas, mat);
        
        // Animación continua al pasar el mouse
        btn.addEventListener('mouseenter', () => {
          startShaderPreview(canvas, mat);
        });
        
        btn.addEventListener('mouseleave', () => {
          stopShaderPreview(canvas);
        });
        
        // También en clic / touch
        btn.addEventListener('mousedown', () => {
          startShaderPreview(canvas, mat);
        });
        
        btn.addEventListener('mouseup', () => {
          stopShaderPreview(canvas);
        });
        
        btn.addEventListener('touchstart', () => {
          startShaderPreview(canvas, mat);
        }, { passive: true });
        
        btn.addEventListener('touchend', () => {
          stopShaderPreview(canvas);
        });
      } else {
        const thumbUrl = getMaterialThumb(mat);
        if (thumbUrl) {
          const bgImg = document.createElement('img');
          bgImg.className = 'user-btn-thumb';
          bgImg.src = thumbUrl;
          bgImg.alt = mat ? mat.name : '';
          bgImg.onerror = function() {
            this.style.display = 'none';
          };
          btn.appendChild(bgImg);
        }
      }
      
      const overlay = document.createElement('div');
      overlay.className = 'user-btn-overlay';
      btn.appendChild(overlay);
      
      const content = document.createElement('div');
      content.className = 'user-btn-content';
      
      const label = document.createElement('span');
      label.className = 'user-btn-label';
      label.textContent = slot.label || (mat ? mat.name : '') || ('Botón ' + slot.slot);
      content.appendChild(label);
      
      btn.appendChild(content);
      
      // Add parameter button for shader materials
      if (isShader || isJp) {
        const btnParams = document.createElement('button');
        btnParams.className = 'user-btn-params-btn';
        btnParams.title = 'Configurar parámetros (uniforms)';
        btnParams.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <circle cx="8" cy="6" r="2.5" fill="currentColor"></circle>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <circle cx="16" cy="12" r="2.5" fill="currentColor"></circle>
            <line x1="3" y1="18" x2="21" y2="18"></line>
            <circle cx="9" cy="18" r="2.5" fill="currentColor"></circle>
          </svg>
        `;
        btn.appendChild(btnParams);
      }
      
      if (activeSceneId && activeSceneId === mat?.id) btn.classList.add('active');
      
      btn.addEventListener('click', (e) => {
        // Check if clicking on params button
        if (e.target.closest('.user-btn-params-btn')) {
          e.stopPropagation();
          e.preventDefault();
          openShaderParamsForUserButton(mat, slot);
          return;
        }
        onUserButtonClick(slot);
      });
      userButtons.appendChild(btn);
    });
  }
  
  // --- Renderizar un frame estático inicial para previsualizar shader sin animación continua ---
  function renderStaticShaderPreview(canvas, mat) {
    if (!canvas || !mat || typeof Shaders === 'undefined') return;
    const shaderName = (mat.effect || mat.shader || mat.name || '').toLowerCase();
    const slot = canvas.dataset.slot;

    Shaders.getShader(shaderName).then(shaderCode => {
      if (!shaderCode) return;
      try {
        const uniformsVal = getMaterialUniformValues(mat);
        const ctx = Shaders.initShader(canvas, shaderCode, {
          uniforms: uniformsVal
        });
        if (ctx) {
          userButtonShaderContexts[slot] = ctx;
          requestAnimationFrame(() => {
            Shaders.renderFrame(ctx, canvas, 1.5);
          });
        }
      } catch (e) {
        console.warn('[MENU] Error renderizando frame estático en botón:', e);
      }
    }).catch(e => {
      console.warn('[MENU] Error cargando shader estático:', e);
    });
  }

  // --- Shader preview for user buttons (animación al hover) ---
  function startShaderPreview(canvas, mat) {
    if (!canvas || !mat || typeof Shaders === 'undefined') return;
    
    const shaderName = (mat.effect || mat.shader || mat.name || '').toLowerCase();
    const slot = canvas.dataset.slot;
    const btn = canvas.closest('.user-btn');
    
    if (btn) {
      btn.classList.add('shader-preview-active');
    }
    
    const uniformsVal = getMaterialUniformValues(mat);

    // Si ya existe contexto previo renderizado, reutilizarlo y arrancar el loop
    let ctx = userButtonShaderContexts[slot];
    if (ctx) {
      Shaders.setUniforms(ctx, uniformsVal);
      Shaders.render(ctx, canvas);
      return;
    }

    // Get shader code
    Shaders.getShader(shaderName).then(shaderCode => {
      if (!shaderCode) return;
      try {
        ctx = Shaders.initShader(canvas, shaderCode, {
          uniforms: uniformsVal
        });
        
        if (ctx) {
          userButtonShaderContexts[slot] = ctx;
          Shaders.render(ctx, canvas);
        }
      } catch (e) {
        console.error('[MENU] Error starting shader preview:', e);
        if (btn) {
          btn.classList.remove('shader-preview-active');
        }
      }
    }).catch(e => {
      console.error('[MENU] Error loading shader for preview:', e);
      if (btn) {
        btn.classList.remove('shader-preview-active');
      }
    });
  }
  
  function stopShaderPreview(canvas) {
    if (!canvas) return;
    
    const slot = canvas.dataset.slot;
    const btn = canvas.closest('.user-btn');
    
    if (userButtonShaderContexts[slot]) {
      // Detener el loop de animación pero conservar el fotograma dibujado en el canvas
      Shaders.stop(userButtonShaderContexts[slot]);
    }
    
    if (btn) {
      btn.classList.remove('shader-preview-active');
    }
  }
  
  // --- Open shader parameters panel for user button ---
  function openShaderParamsForUserButton(mat, slot) {
    // First activate the material
    if (!isConnected) {
      alert('No hay conexión con el servidor');
      return;
    }
    
    if (!amIMaster) {
      socket.emit('claimMaster');
      amIMaster = true;
      updateStatus('MASTER ACTIVO', true);
    }
    
    const scene = synthesizeScene(mat);
    socket.emit('selectScene', scene);
    updateActiveButton(scene.id);
    
    // Open user-specific parameters panel (different from advanced interface)
    openUserShaderParamsPanel(mat, slot);
    console.log(`[MENU] Abriendo parámetros de usuario para material: ${mat.name}`);
  }
  
  // --- User-specific shader parameters panel ---
  let openUserParamsMatId = null;
  
  function openUserShaderParamsPanel(mat, slot) {
    openUserParamsMatId = mat.id;
    
    // Add params-active-mode to the mode-user container
    const modeUser = document.getElementById('mode-user');
    if (modeUser) {
      modeUser.classList.add('params-active-mode');
    }
    
    // Mark the focused button
    document.querySelectorAll('.user-btn').forEach(btn => {
      btn.classList.remove('is-params-focused');
      if (btn.dataset.slot === String(slot.slot)) {
        btn.classList.add('is-params-focused');
      }
    });
    
    // Create the large params panel
    renderUserShaderParamsPanelLarge(mat, slot);
  }
  
  function closeUserShaderParams() {
    openUserParamsMatId = null;

    // Detener el loop del preview
    stopShaderPreview();
    jpDestroyPreview();
    
    // Remove params-active-mode
    const modeUser = document.getElementById('mode-user');
    if (modeUser) {
      modeUser.classList.remove('params-active-mode');
    }
    
    // Remove is-params-focused from all buttons
    document.querySelectorAll('.user-btn').forEach(btn => {
      btn.classList.remove('is-params-focused');
    });
    
    // Remove the large panel
    const existingPanel = document.getElementById('userShaderParamsPanelLarge');
    if (existingPanel) {
      existingPanel.remove();
    }
  }
  
  function renderUserShaderParamsPanelLarge(mat, slot) {
    // Shader del editor: mismo panel, pero con el motor de jpShadereditor
    if (isJpShader(mat)) return renderUserJpShaderParamsPanelLarge(mat, slot);

    // Remove existing panel if any
    const existingPanel = document.getElementById('userShaderParamsPanelLarge');
    if (existingPanel) {
      existingPanel.remove();
    }
    
    // Create new panel
    const panel = document.createElement('div');
    panel.id = 'userShaderParamsPanelLarge';
    panel.className = 'user-params-panel-large';
    
    // Header
    const header = document.createElement('div');
    header.className = 'user-params-large-header';
    
    const titleGroup = document.createElement('div');
    titleGroup.className = 'user-params-title-group';
    
    const badge = document.createElement('span');
    badge.className = 'user-params-badge';
    badge.textContent = 'UNIFORMS';
    
    const title = document.createElement('h3');
    title.className = 'user-params-main-title';
    title.textContent = slot.label || mat.name;
    
    titleGroup.appendChild(badge);
    titleGroup.appendChild(title);
    
    const btnBack = document.createElement('button');
    btnBack.className = 'btn-user-params-back';
    btnBack.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="19" y1="12" x2="5" y2="12"></line>
        <polyline points="12 19 5 12 12 5"></polyline>
      </svg>
      Volver
    `;
    btnBack.title = 'Volver a todos los botones';
    btnBack.addEventListener('click', (e) => {
      e.stopPropagation();
      closeUserShaderParams();
    });
    
    header.appendChild(titleGroup);
    header.appendChild(btnBack);
    panel.appendChild(header);

    // Preview horizontal (animado, igual que en el panel avanzado)
    const previewSection = document.createElement('div');
    previewSection.className = 'shader-preview-section';
    const previewLabel = document.createElement('div');
    previewLabel.className = 'shader-preview-label';
    previewLabel.textContent = 'Previsualización';
    previewSection.appendChild(previewLabel);

    const previewCanvas = document.createElement('canvas');
    previewCanvas.className = 'shader-preview-canvas';
    previewCanvas.width = 640;
    previewCanvas.height = 360;
    previewSection.appendChild(previewCanvas);
    panel.appendChild(previewSection);
    
    // Status indicator para guardado (inmediato y automático)
    const statusIndicator = document.createElement('span');
    statusIndicator.className = 'user-params-status-text';
    statusIndicator.style.cssText = 'font-size: 0.75rem; color: #888; transition: all 0.2s; white-space: nowrap;';

    // Parameters list
    const paramsList = document.createElement('div');
    paramsList.className = 'user-params-large-list';
    
    const uniforms = mat.uniforms || [];
    if (!currentShaderUniformValues[mat.id]) {
      currentShaderUniformValues[mat.id] = {};
    }
    
    if (!uniforms || uniforms.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'user-params-empty-large';
      emptyMsg.textContent = 'Este shader no tiene parámetros configurables';
      paramsList.appendChild(emptyMsg);
    } else {
      uniforms.forEach(u => {
        const item = document.createElement('div');
        item.className = 'user-param-item-large';
        
        const itemHeader = document.createElement('div');
        itemHeader.className = 'user-param-header-large';
        
        const label = document.createElement('span');
        label.className = 'user-param-label-large';
        label.textContent = u.label || u.name;
        
        const meta = document.createElement('span');
        meta.className = 'user-param-meta-large';
        meta.textContent = `${u.name} (${u.type})`;
        
        itemHeader.appendChild(label);
        itemHeader.appendChild(meta);
        
        const controlWrap = document.createElement('div');
        controlWrap.className = 'user-param-control-wrap';
        
        let currentVal = currentShaderUniformValues[mat.id][u.name];
        if (currentVal === undefined) {
          currentVal = (u.value !== undefined) ? u.value : u.default;
          currentShaderUniformValues[mat.id][u.name] = currentVal;
        }
        
        if (u.type === 'float') {
          const slider = document.createElement('input');
          slider.type = 'range';
          slider.className = 'user-param-slider-large';
          slider.min = (u.min !== undefined) ? u.min : 0;
          slider.max = (u.max !== undefined) ? u.max : 5;
          slider.step = (u.step !== undefined) ? u.step : 0.05;
          slider.value = currentVal;
          
          const numDisplay = document.createElement('span');
          numDisplay.className = 'user-param-val-large';
          numDisplay.textContent = Number(currentVal).toFixed(2);
          
          slider.addEventListener('input', () => {
            const val = parseFloat(slider.value);
            numDisplay.textContent = val.toFixed(2);
            currentShaderUniformValues[mat.id][u.name] = val;
            const slotCtx = userButtonShaderContexts[slot.slot];
            const btnCanvas = document.querySelector(`.user-btn-shader-canvas[data-slot="${slot.slot}"]`);
            if (slotCtx && btnCanvas) {
              Shaders.setUniform(slotCtx, u.name, val);
              Shaders.renderFrame(slotCtx, btnCanvas);
            }
            renderShaderPreviewCanvas(mat, previewCanvas);
            if (socket && isConnected) {
              socket.emit('updateShaderUniforms', {
                shader: (mat.effect || mat.name).toLowerCase(),
                uniforms: { [u.name]: val }
              });
            }
            scheduleAutoSaveShaderParams(mat, statusIndicator);
          });
          
          controlWrap.appendChild(slider);
          controlWrap.appendChild(numDisplay);
        } else if (u.type === 'vec3') {
          const hex = vec3ToHex(currentVal);
          const colorInput = document.createElement('input');
          colorInput.type = 'color';
          colorInput.className = 'user-param-color-large';
          colorInput.value = hex;
          
          const hexDisplay = document.createElement('span');
          hexDisplay.className = 'user-param-hex-large';
          hexDisplay.textContent = hex;
          
          colorInput.addEventListener('input', () => {
            const newHex = colorInput.value;
            hexDisplay.textContent = newHex;
            const newVec3 = hexToVec3(newHex);
            currentShaderUniformValues[mat.id][u.name] = newVec3;
            const slotCtx = userButtonShaderContexts[slot.slot];
            const btnCanvas = document.querySelector(`.user-btn-shader-canvas[data-slot="${slot.slot}"]`);
            if (slotCtx && btnCanvas) {
              Shaders.setUniform(slotCtx, u.name, newVec3);
              Shaders.renderFrame(slotCtx, btnCanvas);
            }
            renderShaderPreviewCanvas(mat, previewCanvas);
            if (socket && isConnected) {
              socket.emit('updateShaderUniforms', {
                shader: (mat.effect || mat.name).toLowerCase(),
                uniforms: { [u.name]: newVec3 }
              });
            }
            scheduleAutoSaveShaderParams(mat, statusIndicator);
          });
          
          controlWrap.appendChild(colorInput);
          controlWrap.appendChild(hexDisplay);
        } else if (u.type === 'int' || u.type === 'bool') {
          const chk = document.createElement('input');
          chk.type = 'checkbox';
          chk.className = 'user-param-checkbox-large';
          chk.checked = !!currentVal;
          chk.addEventListener('change', () => {
            const val = chk.checked ? 1 : 0;
            currentShaderUniformValues[mat.id][u.name] = val;
            const slotCtx = userButtonShaderContexts[slot.slot];
            const btnCanvas = document.querySelector(`.user-btn-shader-canvas[data-slot="${slot.slot}"]`);
            if (slotCtx && btnCanvas) {
              Shaders.setUniform(slotCtx, u.name, val);
              Shaders.renderFrame(slotCtx, btnCanvas);
            }
            renderShaderPreviewCanvas(mat, previewCanvas);
            if (socket && isConnected) {
              socket.emit('updateShaderUniforms', {
                shader: (mat.effect || mat.name).toLowerCase(),
                uniforms: { [u.name]: val }
              });
            }
            scheduleAutoSaveShaderParams(mat, statusIndicator);
          });
          controlWrap.appendChild(chk);
        }
        
        item.appendChild(itemHeader);
        item.appendChild(controlWrap);
        paramsList.appendChild(item);
      });
    }
    
    panel.appendChild(paramsList);
    
    // Footer con botón de guardar y restaurar
    if (uniforms && uniforms.length > 0) {
      const footer = document.createElement('div');
      footer.className = 'user-params-large-footer';

      const leftWrap = document.createElement('div');
      leftWrap.style.display = 'flex';
      leftWrap.style.alignItems = 'center';
      leftWrap.style.gap = '0.75rem';

      const btnSave = document.createElement('button');
      btnSave.className = 'btn-params-save';
      btnSave.innerHTML = '💾 Guardar parámetros';
      btnSave.title = 'Guardar permanentemente en el servidor';
      btnSave.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (autoSaveShaderTimers[mat.id]) {
          clearTimeout(autoSaveShaderTimers[mat.id]);
          delete autoSaveShaderTimers[mat.id];
        }
        btnSave.disabled = true;
        btnSave.innerHTML = '⏳ Guardando...';
        const ok = await saveShaderParamsToServer(mat, statusIndicator);
        btnSave.innerHTML = ok ? '✅ ¡Guardado!' : '⚠️ Reintentar';
        setTimeout(() => {
          btnSave.disabled = false;
          btnSave.innerHTML = '💾 Guardar parámetros';
        }, 2000);
      });

      leftWrap.appendChild(btnSave);
      leftWrap.appendChild(statusIndicator);
      
      const btnReset = document.createElement('button');
      btnReset.className = 'btn-user-params-reset';
      btnReset.textContent = '↺ Restaurar valores por defecto';
      btnReset.title = 'Volver a los valores de fábrica';
      btnReset.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (autoSaveShaderTimers[mat.id]) {
          clearTimeout(autoSaveShaderTimers[mat.id]);
          delete autoSaveShaderTimers[mat.id];
        }
        const resetObj = {};
        uniforms.forEach(u => {
          currentShaderUniformValues[mat.id][u.name] = u.default;
          resetObj[u.name] = u.default;
        });
        if (socket && isConnected) {
          socket.emit('updateShaderUniforms', {
            shader: (mat.effect || mat.name).toLowerCase(),
            uniforms: resetObj
          });
        }
        await saveShaderParamsToServer(mat, statusIndicator);
        renderUserShaderParamsPanelLarge(mat, slot);
      });
      
      footer.appendChild(leftWrap);
      footer.appendChild(btnReset);
      panel.appendChild(footer);
    }
    
    // Append to mode-user container
    const modeUser = document.getElementById('mode-user');
    if (modeUser) {
      modeUser.appendChild(panel);
    }

    // Preview inicial: render continuo con los valores guardados
    setTimeout(() => renderShaderPreviewCanvas(mat, previewCanvas), 60);
    loadShaderParamsFromServer(mat)
      .then(() => renderShaderPreviewCanvas(mat, previewCanvas))
      .catch(() => {});
  }
  
  // --- Render lista de materiales / INPUTS (Advanced) ---
  
  function triggerMaterial(material) {
    if (!isConnected) {
      alert('No hay conexión con el servidor');
      return;
    }
    
    if (!amIMaster) {
      socket.emit('claimMaster');
      amIMaster = true;
      updateStatus('MASTER ACTIVO', true);
    }
    
    const scene = synthesizeScene(material);
    socket.emit('selectScene', scene);
    updateActiveButton(scene.id);
    console.log(`[MENU] Triggered INPUT -> ${material.name} (${scene.type})`);
  }

  function toggleShaderParams(m) {
    if (openShaderParamsMatId === m.id) {
      openShaderParamsMatId = null;
    } else {
      openShaderParamsMatId = m.id;
      triggerMaterial(m);
    }
    renderMaterialList();
  }

  function renderShaderParamsPanel(m) {
    const panel = document.createElement('div');
    panel.className = 'shader-params-container';

    const header = document.createElement('div');
    header.className = 'shader-params-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'shader-params-title-wrap';

    const badge = document.createElement('span');
    badge.className = 'shader-params-badge';
    badge.textContent = 'UNIFORMS';

    const title = document.createElement('span');
    title.className = 'shader-params-title';
    title.textContent = `Parámetros: ${m.name}`;

    titleWrap.appendChild(badge);
    titleWrap.appendChild(title);

    const btnBack = document.createElement('button');
    btnBack.className = 'btn-params-back';
    btnBack.innerHTML = '✕ Volver';
    btnBack.title = 'Cerrar y volver a la lista de inputs';
    btnBack.addEventListener('click', (e) => {
      e.stopPropagation();
      openShaderParamsMatId = null;
      stopShaderPreview();
      renderMaterialList();
    });

    header.appendChild(titleWrap);
    header.appendChild(btnBack);
    panel.appendChild(header);

    // Preview canvas
    const previewSection = document.createElement('div');
    previewSection.className = 'shader-preview-section';
    const previewLabel = document.createElement('div');
    previewLabel.className = 'shader-preview-label';
    previewLabel.textContent = 'Previsualización';
    previewSection.appendChild(previewLabel);
    
    const previewCanvas = document.createElement('canvas');
    previewCanvas.className = 'shader-preview-canvas';
    previewCanvas.width = 320;
    previewCanvas.height = 180;
    previewSection.appendChild(previewCanvas);
    panel.appendChild(previewSection);

    // Status indicator para guardado (inmediato y automático)
    const statusIndicator = document.createElement('span');
    statusIndicator.className = 'shader-params-status-text';
    statusIndicator.style.cssText = 'font-size: 0.75rem; color: #888; transition: all 0.2s; white-space: nowrap;';

    // Lista de uniforms
    const uniformsList = document.createElement('div');
    uniformsList.className = 'shader-params-list';

    const uniforms = m.uniforms || [];
    if (!currentShaderUniformValues[m.id]) {
      currentShaderUniformValues[m.id] = {};
    }

    if (!uniforms || uniforms.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'shader-params-empty';
      emptyMsg.textContent = 'Este shader no expone uniforms configurables en su código .frag.';
      uniformsList.appendChild(emptyMsg);
    } else {
      uniforms.forEach(u => {
        const item = document.createElement('div');
        item.className = 'param-item';

        const itemHeader = document.createElement('div');
        itemHeader.className = 'param-item-header';

        const label = document.createElement('span');
        label.className = 'param-label';
        label.textContent = u.label || u.name;

        const meta = document.createElement('span');
        meta.className = 'param-meta';
        meta.textContent = `${u.name} (${u.type})`;

        itemHeader.appendChild(label);
        itemHeader.appendChild(meta);
        item.appendChild(itemHeader);

        const inputWrap = document.createElement('div');
        inputWrap.className = 'param-input-wrap';

        let currentVal = currentShaderUniformValues[m.id][u.name];
        if (currentVal === undefined) {
          currentVal = (u.value !== undefined) ? u.value : u.default;
          currentShaderUniformValues[m.id][u.name] = currentVal;
        }

        if (u.type === 'float') {
          const slider = document.createElement('input');
          slider.type = 'range';
          slider.className = 'param-range-slider';
          slider.min = (u.min !== undefined) ? u.min : 0;
          slider.max = (u.max !== undefined) ? u.max : 5;
          slider.step = (u.step !== undefined) ? u.step : 0.05;
          slider.value = currentVal;
          slider.dataset.uniformName = u.name;

          const numDisplay = document.createElement('span');
          numDisplay.className = 'param-num-val';
          numDisplay.textContent = Number(currentVal).toFixed(2);

          slider.addEventListener('input', () => {
            const val = parseFloat(slider.value);
            numDisplay.textContent = val.toFixed(2);
            currentShaderUniformValues[m.id][u.name] = val;
            renderShaderPreviewCanvas(m, previewCanvas);
            if (socket && isConnected) {
              socket.emit('updateShaderUniforms', {
                shader: (m.effect || m.name).toLowerCase(),
                uniforms: { [u.name]: val }
              });
            }
            scheduleAutoSaveShaderParams(m, statusIndicator);
          });

          inputWrap.appendChild(slider);
          inputWrap.appendChild(numDisplay);
        } else if (u.type === 'vec3') {
          const hex = vec3ToHex(currentVal);
          const colorInput = document.createElement('input');
          colorInput.type = 'color';
          colorInput.className = 'param-color-picker';
          colorInput.value = hex;
          colorInput.dataset.uniformName = u.name;

          const hexDisplay = document.createElement('span');
          hexDisplay.className = 'param-color-hex';
          hexDisplay.textContent = hex;

          colorInput.addEventListener('input', () => {
            const newHex = colorInput.value;
            hexDisplay.textContent = newHex;
            const newVec3 = hexToVec3(newHex);
            currentShaderUniformValues[m.id][u.name] = newVec3;
            renderShaderPreviewCanvas(m, previewCanvas);
            if (socket && isConnected) {
              socket.emit('updateShaderUniforms', {
                shader: (m.effect || m.name).toLowerCase(),
                uniforms: { [u.name]: newVec3 }
              });
            }
            scheduleAutoSaveShaderParams(m, statusIndicator);
          });

          inputWrap.appendChild(colorInput);
          inputWrap.appendChild(hexDisplay);
        } else if (u.type === 'int' || u.type === 'bool') {
          const chk = document.createElement('input');
          chk.type = 'checkbox';
          chk.checked = !!currentVal;
          chk.dataset.uniformName = u.name;
          chk.addEventListener('change', () => {
            const val = chk.checked ? 1 : 0;
            currentShaderUniformValues[m.id][u.name] = val;
            renderShaderPreviewCanvas(m, previewCanvas);
            if (socket && isConnected) {
              socket.emit('updateShaderUniforms', {
                shader: (m.effect || m.name).toLowerCase(),
                uniforms: { [u.name]: val }
              });
            }
            scheduleAutoSaveShaderParams(m, statusIndicator);
          });
          inputWrap.appendChild(chk);
        }

        item.appendChild(inputWrap);
        uniformsList.appendChild(item);
      });
    }

    panel.appendChild(uniformsList);

    // Footer con botones guardar y resetear
    if (uniforms && uniforms.length > 0) {
      const footer = document.createElement('div');
      footer.className = 'shader-params-footer';

      const leftWrap = document.createElement('div');
      leftWrap.style.display = 'flex';
      leftWrap.style.alignItems = 'center';
      leftWrap.style.gap = '0.75rem';

      const btnSave = document.createElement('button');
      btnSave.className = 'btn-params-save';
      btnSave.innerHTML = '💾 Guardar parámetros';
      btnSave.title = 'Guardar permanentemente en el servidor';
      btnSave.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (autoSaveShaderTimers[m.id]) {
          clearTimeout(autoSaveShaderTimers[m.id]);
          delete autoSaveShaderTimers[m.id];
        }
        btnSave.disabled = true;
        btnSave.innerHTML = '⏳ Guardando...';
        const ok = await saveShaderParamsToServer(m, statusIndicator);
        btnSave.innerHTML = ok ? '✅ ¡Guardado!' : '⚠️ Reintentar';
        setTimeout(() => {
          btnSave.disabled = false;
          btnSave.innerHTML = '💾 Guardar parámetros';
        }, 2000);
      });

      leftWrap.appendChild(btnSave);
      leftWrap.appendChild(statusIndicator);

      const btnReset = document.createElement('button');
      btnReset.className = 'btn-params-reset';
      btnReset.textContent = '↺ Restaurar valores por defecto';
      btnReset.title = 'Volver a los valores de fábrica';
      btnReset.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (autoSaveShaderTimers[m.id]) {
          clearTimeout(autoSaveShaderTimers[m.id]);
          delete autoSaveShaderTimers[m.id];
        }
        const resetObj = {};
        uniforms.forEach(u => {
          currentShaderUniformValues[m.id][u.name] = u.default;
          resetObj[u.name] = u.default;
        });
        if (socket && isConnected) {
          socket.emit('updateShaderUniforms', {
            shader: (m.effect || m.name).toLowerCase(),
            uniforms: resetObj
          });
        }
        await saveShaderParamsToServer(m, statusIndicator);
        renderMaterialList();
      });

      footer.appendChild(leftWrap);
      footer.appendChild(btnReset);
      panel.appendChild(footer);
    }

    // Load saved params and update UI
    loadShaderParamsFromServer(m).then(() => {
      const uniforms = m.uniforms || [];
      uniforms.forEach(u => {
        const savedVal = currentShaderUniformValues[m.id]?.[u.name];
        if (savedVal === undefined) return;
        
        const input = panel.querySelector(`[data-uniform-name="${u.name}"]`);
        if (!input) return;
        
        if (u.type === 'float') {
          input.value = savedVal;
          const numDisplay = input.parentElement.querySelector('.param-num-val');
          if (numDisplay) numDisplay.textContent = Number(savedVal).toFixed(2);
        } else if (u.type === 'vec3') {
          const hex = vec3ToHex(savedVal);
          input.value = hex;
          const hexDisplay = input.parentElement.querySelector('.param-color-hex');
          if (hexDisplay) hexDisplay.textContent = hex;
        } else if (u.type === 'int' || u.type === 'bool') {
          input.checked = !!savedVal;
        }
      });
      
      // Emitir valores cargados al socket
      if (socket && isConnected) {
        socket.emit('updateShaderUniforms', {
          shader: (m.effect || m.name).toLowerCase(),
          uniforms: currentShaderUniformValues[m.id] || {}
        });
      }
      
      // Re-render preview with loaded values
      renderShaderPreviewCanvas(m, previewCanvas);
    }).catch(() => {});
    
    // Initial preview render
    setTimeout(() => renderShaderPreviewCanvas(m, previewCanvas), 50);

    return panel;
  }

  // ============================================================
  // PREVIEW DEL SHADER EN EL PANEL DE PARÁMETROS
  // Caja vertical + render CONTINUO (animación en vivo)
  // ============================================================
  let shaderPreviewCtx = null;
  let shaderPreviewCanvas = null;
  let shaderPreviewShaderName = null;
  let shaderPreviewInitToken = 0; // evita inicializaciones duplicadas (2 loops peleando = parpadeo)

  // Detiene el loop de animación y libera el contexto WebGL
  function stopShaderPreview() {
    shaderPreviewInitToken++; // invalida cualquier init en vuelo
    if (shaderPreviewCtx) {
      try { Shaders.stop(shaderPreviewCtx); } catch (e) {}
      try {
        const gl = shaderPreviewCtx.gl;
        if (gl) {
          const lose = gl.getExtension('WEBGL_lose_context');
          if (lose) lose.loseContext();
        }
      } catch (e) {}
    }
    shaderPreviewCtx = null;
    shaderPreviewCanvas = null;
    shaderPreviewShaderName = null;
  }

  function renderShaderPreviewCanvas(mat, canvas) {
    if (!canvas || !mat || typeof Shaders === 'undefined') return;

    const shaderName = (mat.effect || mat.shader || mat.name || '').toLowerCase();
    const uniforms = getMaterialUniformValues(mat);

    // Mismo canvas + mismo shader: el loop ya está corriendo, sólo actualizamos uniforms
    if (shaderPreviewCtx && shaderPreviewCanvas === canvas && shaderPreviewShaderName === shaderName) {
      Shaders.setUniforms(shaderPreviewCtx, uniforms);
      if (!shaderPreviewCtx.rafId) {
        Shaders.render(shaderPreviewCtx, canvas); // reanudar si se había detenido
      }
      return;
    }

    // Otro shader u otro canvas: reiniciar el preview (una sola vez)
    stopShaderPreview();
    const token = shaderPreviewInitToken;

    Shaders.getShader(shaderName).then(shaderCode => {
      if (token !== shaderPreviewInitToken) return; // se pidió otro preview mientras cargaba
      if (!shaderCode) return;
      if (!canvas.isConnected) return;              // el panel se cerró mientras cargaba
      try {
        const ctx = Shaders.initShader(canvas, shaderCode, { uniforms });
        if (ctx) {
          shaderPreviewCtx = ctx;
          shaderPreviewCanvas = canvas;
          shaderPreviewShaderName = shaderName;
          // Loop continuo: el shader se renderiza constantemente
          Shaders.render(ctx, canvas);
        }
      } catch (e) {
        console.warn('[MENU] Error renderizando preview de shader:', e);
      }
    }).catch(e => {
      console.warn('[MENU] Error cargando shader para preview:', e);
    });
  }

  // ============================================================
  // GUARDAR / CARGAR PARÁMETROS DEL SERVIDOR
  // ============================================================
  const autoSaveShaderTimers = {};

  function scheduleAutoSaveShaderParams(mat, statusEl) {
    if (!mat) return;
    if (autoSaveShaderTimers[mat.id]) {
      clearTimeout(autoSaveShaderTimers[mat.id]);
    }
    if (statusEl) {
      statusEl.textContent = '✎ Cambios sin guardar...';
      statusEl.style.color = '#e2a03f';
    }
    autoSaveShaderTimers[mat.id] = setTimeout(async () => {
      delete autoSaveShaderTimers[mat.id];
      await saveShaderParamsToServer(mat, statusEl);
    }, 1200);
  }

  async function saveShaderParamsToServer(mat, statusEl) {
    if (!mat) return false;
    const shaderId = paramsKey(mat);
    const uniforms = currentShaderUniformValues[mat.id] || {};

    try {
      if (statusEl) {
        statusEl.textContent = '⏳ Guardando en el servidor...';
        statusEl.style.color = '#00e5ff';
      }

      const data = await apiFetch(API_BASE + '/shader-params', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shaderId, uniforms })
      });

      if (data && data.ok) {
        showToast(`💾 Parámetros de "${mat.name}" guardados`);
        if (statusEl) {
          statusEl.textContent = '✓ Guardado permanentemente';
          statusEl.style.color = '#22c55e';
          setTimeout(() => {
            if (statusEl.textContent === '✓ Guardado permanentemente') {
              statusEl.textContent = '';
            }
          }, 4000);
        }

        // Actualizar material local en memoria
        if (mat.uniforms && Array.isArray(mat.uniforms)) {
          mat.uniforms.forEach(u => {
            if (uniforms[u.name] !== undefined) {
              u.default = uniforms[u.name];
              u.value = uniforms[u.name];
            }
          });
        }
        mat.savedUniforms = Object.assign({}, mat.savedUniforms || {}, uniforms);
        return true;
      } else {
        throw new Error((data && data.error) || 'Error desconocido');
      }
    } catch (err) {
      console.error('[MENU] Error guardando params:', err);
      showToast('⚠️ Error al guardar parámetros: ' + err.message);
      if (statusEl) {
        statusEl.textContent = '⚠️ Error: ' + err.message;
        statusEl.style.color = '#ef4444';
      }
      return false;
    }
  }

  async function showToast(msg) {
    let toast = document.getElementById('menuToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'menuToast';
      toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(-20px);
        background: rgba(15, 17, 23, 0.95);
        border: 1px solid #00e5ff;
        color: #fff;
        padding: 10px 20px;
        border-radius: 25px;
        font-size: 12px;
        font-weight: 600;
        opacity: 0;
        pointer-events: none;
        transition: all 0.3s ease;
        z-index: 9999;
        box-shadow: 0 10px 30px rgba(0, 229, 255, 0.3);
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(-20px)';
    }, 3000);
  }

  function loadShaderParamsFromServer(mat) {
    return (async () => {
      try {
        const data = await apiFetch(API_BASE + '/shader-params/' + encodeURIComponent(paramsKey(mat)));
        if (data && data.ok && data.uniforms) {
          currentShaderUniformValues[mat.id] = Object.assign({}, currentShaderUniformValues[mat.id] || {}, data.uniforms);
          console.log(`[MENU] Parámetros cargados para ${mat.id}:`, data.uniforms);
        }
      } catch (e) {
        console.warn('[MENU] No se pudieron cargar params guardados:', e);
      }
    })();
  }

  function renderMaterialList() {
    if (!materialList) return;
    const visibles = filteredMaterials();
    if (!materialLibrary.length) {
      materialList.innerHTML = '<div class="mat-empty">Sin inputs cargados</div>';
      return;
    }
    if (!visibles.length) {
      materialList.innerHTML = '<div class="mat-empty">No hay inputs de ese tipo todavía</div>';
      updateInputCounts();
      return;
    }

    if (openShaderParamsMatId) {
      materialList.classList.add('params-active-mode');
    } else {
      materialList.classList.remove('params-active-mode');
      stopShaderPreview(); // sin panel abierto: apagar el loop del preview
      jpDestroyPreview();  // idem para el motor del editor
    }
    updateInputCounts();

    materialList.innerHTML = '';
    visibles.forEach(m => {
      const isShader = (m.type === 'shader' || m.type === 'effect');
      const isJp = isJpShader(m);
      const canParams = isShader || isJp;
      const isParamsOpen = (openShaderParamsMatId === m.id);

      const item = document.createElement('div');
      item.className = 'mat-item' + 
        (activeSceneId === m.id ? ' active' : '') + 
        (isParamsOpen ? ' is-params-open' : '') +
        (!m.builtin ? ' has-del' : '');
      item.dataset.matId = m.id;
      item.title = isParamsOpen ? '' : 'Clic para disparar en Output y 3D';
      
      const icon = document.createElement('span');
      icon.className = 'mat-icon';
      const thumbSrc = matThumb(m);
      if (thumbSrc) {
        icon.classList.add('has-thumb');
        const img = document.createElement('img');
        img.src = thumbSrc;
        img.alt = '';
        img.loading = 'lazy';
        img.draggable = false;
        img.addEventListener('error', () => {
          icon.classList.remove('has-thumb');
          icon.innerHTML = '';
          icon.textContent = materialIcon(m);
        });
        icon.appendChild(img);
      } else {
        icon.textContent = materialIcon(m);
      }
      
      const info = document.createElement('div');
      info.className = 'mat-info';
      
      const name = document.createElement('span');
      name.className = 'mat-name';
      name.textContent = m.name || 'Sin nombre';
      
      const type = document.createElement('span');
      type.className = 'mat-type';
      type.textContent = materialTypeLabel(m);
      
      info.appendChild(name);
      info.appendChild(type);
      
      item.appendChild(icon);
      item.appendChild(info);

      // Si es shader, agregar el botón de 3 líneas con círculos en la esquina superior derecha
      if (canParams) {
        const btnParams = document.createElement('button');
        btnParams.className = 'mat-params-btn' + (isParamsOpen ? ' is-active' : '');
        btnParams.title = isParamsOpen ? 'Cerrar parámetros' : 'Configurar parámetros (uniforms)';
        btnParams.innerHTML = `
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <circle cx="8" cy="6" r="2.5" fill="currentColor"></circle>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <circle cx="16" cy="12" r="2.5" fill="currentColor"></circle>
            <line x1="3" y1="18" x2="21" y2="18"></line>
            <circle cx="9" cy="18" r="2.5" fill="currentColor"></circle>
          </svg>
        `;
        btnParams.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleShaderParams(m);
        });
        item.appendChild(btnParams);
      }
      
      // 📸 sin captura todavía: botón para sacarla (web / shader del editor / video)
      if (!m.builtin && !thumbSrc && (m.type === 'web' || m.type === 'video' || isJp)) {
        const btnShot = document.createElement('button');
        btnShot.className = 'mat-shot-btn';
        btnShot.textContent = '📸';
        btnShot.title = m.type === 'web' ? 'Sacar captura de la web' : 'Sacar preview del shader';
        btnShot.addEventListener('click', async (e) => {
          e.stopPropagation();
          btnShot.disabled = true;
          btnShot.textContent = '⏳';
          const ok = await captureThumb(m);
          if (!ok) {
            btnShot.disabled = false;
            btnShot.textContent = '📸';
            showToast('⚠️ No se pudo sacar la captura');
            return;
          }
          renderMaterialList();
        });
        item.appendChild(btnShot);
      }

      // Clic para disparar el contenido en el Output y Output 3D
      item.addEventListener('click', (e) => {
        if (e.target.closest('.mat-del') || e.target.closest('.mat-params-btn')) return;
        triggerMaterial(m);
      });
      
      if (!m.builtin) {
        const del = document.createElement('button');
        del.className = 'mat-del';
        del.textContent = '✕';
        del.title = 'Eliminar';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          onDeleteMaterial(m);
        });
        item.appendChild(del);
      }
      
      materialList.appendChild(item);

      // Si tiene los parámetros abiertos, insertar el panel de parámetros
      if (isParamsOpen) {
        const paramsContainer = isJp ? renderJpShaderParamsPanel(m) : renderShaderParamsPanel(m);
        materialList.appendChild(paramsContainer);
      }
    });
  }
  
  async function onDeleteMaterial(material) {
    if (!confirm('¿Eliminar "' + material.name + '"?')) return;
    try {
      await apiFetch(API_BASE + '/materials/' + material.id, { method: 'DELETE' });
      setStatus('uploadStatus', 'Material eliminado', 'ok');
      await loadMaterialsFromServer();
    } catch (err) {
      setStatus('uploadStatus', 'Error al eliminar: ' + err.message, 'err');
    }
  }
  
  // --- Render asignación de botones (Advanced) ---
  
  function renderButtonAssignments() {
    if (!buttonAssignments) return;
    buttonAssignments.innerHTML = '';
    buttonSlots.forEach(slot => {
      const row = document.createElement('div');
      row.className = 'slot-row';
      
      const num = document.createElement('span');
      num.className = 'slot-num';
      num.textContent = slot.slot;
      
      const select = document.createElement('select');
      select.dataset.slot = slot.slot;
      
      const none = document.createElement('option');
      none.value = '';
      none.textContent = '— Sin asignar —';
      select.appendChild(none);
      
      const groupDefinitions = [
        { label: 'Shaders', types: ['shader', 'effect'] },
        { label: 'Imágenes', types: ['image'] },
        { label: 'Páginas Web', types: ['web'] },
        { label: 'Videos (YouTube)', types: ['youtube'] },
        { label: 'Videos (archivo)', types: ['video'] }
      ];

      const handledIds = new Set();
      groupDefinitions.forEach(group => {
        const mats = materialLibrary.filter(m => group.types.includes(m.type));
        if (!mats.length) return;
        const og = document.createElement('optgroup');
        og.label = group.label;
        mats.forEach(m => {
          handledIds.add(m.id);
          const opt = document.createElement('option');
          opt.value = m.id;
          opt.textContent = m.name || m.id;
          og.appendChild(opt);
        });
        select.appendChild(og);
      });

      const otherMats = materialLibrary.filter(m => !handledIds.has(m.id));
      if (otherMats.length) {
        const ogOther = document.createElement('optgroup');
        ogOther.label = 'Otros';
        otherMats.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.id;
          opt.textContent = m.name || m.id;
          ogOther.appendChild(opt);
        });
        select.appendChild(ogOther);
      }
      
      select.value = slot.materialId || '';

      const mat = getMaterialById(slot.materialId);
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'slot-name-input';
      nameInput.placeholder = mat ? mat.name : ('Botón ' + slot.slot);
      nameInput.value = slot.label || '';
      nameInput.title = 'Nombre para este botón (opcional)';

      select.addEventListener('change', () => {
        const slotNum = parseInt(select.dataset.slot, 10);
        const slotObj = buttonSlots.find(s => s.slot === slotNum);
        if (slotObj) {
          slotObj.materialId = select.value || null;
          const currentMat = getMaterialById(slotObj.materialId);
          nameInput.placeholder = currentMat ? currentMat.name : ('Botón ' + slot.slot);
        }
        renderUserButtons();
      });

      nameInput.addEventListener('input', () => {
        const slotNum = parseInt(select.dataset.slot, 10);
        const slotObj = buttonSlots.find(s => s.slot === slotNum);
        if (slotObj) {
          slotObj.label = nameInput.value.trim() || null;
        }
        renderUserButtons();
      });
      
      row.appendChild(num);
      row.appendChild(select);
      row.appendChild(nameInput);
      buttonAssignments.appendChild(row);
    });
  }
  
  async function onSaveButtons() {
    try {
      const payload = buttonSlots.map(s => ({ slot: s.slot, materialId: s.materialId, label: s.label || null }));
      const data = await apiFetch(API_BASE + '/buttons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buttons: payload })
      });
      if (data.buttons) buttonSlots = data.buttons.slice().sort((a, b) => a.slot - b.slot);
      renderUserButtons();
      renderButtonAssignments();
      setStatus('assignStatus', 'Asignación guardada en el servidor' + (activePresetName ? (' · preset: ' + activePresetName) : ' · (sin preset cargado)'), 'ok');
      showToast('💾 Botonera guardada' + (activePresetName ? (' en "' + activePresetName + '"') : ''));
    } catch (err) {
      setStatus('assignStatus', 'Error al guardar: ' + err.message, 'err');
    }
  }
  
  // --- Cargar material ---
  
  function extractYouTubeId(input) {
    const m = String(input).match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : null;
  }

  const IMG_URL_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|tiff?)(\?.*)?$/i;
  const VID_URL_RE = /\.(mp4|webm|mov|ogg|m4v|avi|mkv)(\?.*)?$/i;

  function nameFromUrl(url, fallback) {
    try {
      const parsed = new URL(url);
      const pathName = parsed.pathname.split('/').pop();
      return decodeURIComponent(pathName).replace(/\.[^/.]+$/, '') || fallback;
    } catch (e) {
      return fallback;
    }
  }

  function webNameFromUrl(url) {
    try {
      const parsed = new URL(/^https?:\/\//i.test(url) ? url : ('https://' + url));
      const host = parsed.hostname.replace(/^www\./, '');
      const seg = parsed.pathname.split('/').filter(Boolean).pop();
      return seg ? `Web ${host}/${seg}` : `Web ${host}`;
    } catch (e) {
      return 'Página Web';
    }
  }
  
  // --- Cargar material y Drag & Drop ---
  
  function setupDropzone() {
    const dropzone = document.getElementById('materialDropzone');
    const fileInput = document.getElementById('newMatFile');
    if (!dropzone || !fileInput) return;
    
    dropzone.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length) {
        handleFilesUpload(fileInput.files);
        fileInput.value = '';
      }
    });
    
    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
      });
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
      });
    });
    
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length) {
        handleFilesUpload(dt.files);
      }
    });
  }
  
  // --- ESTILOS VISUALES (Claro / Oscuro / Matrix / Minimal Neon) ---
  const THEME_CLASSES = ['dark-mode', 'matrix-mode', 'neon-mode'];
  const VALID_STYLES = ['light', 'dark', 'matrix', 'neon'];

  function applyStyle(style) {
    currentStyle = VALID_STYLES.indexOf(style) !== -1 ? style : 'light';
    THEME_CLASSES.forEach(c => document.body.classList.remove(c));
    if (currentStyle === 'dark') document.body.classList.add('dark-mode');
    if (currentStyle === 'matrix') document.body.classList.add('matrix-mode');
    if (currentStyle === 'neon') document.body.classList.add('neon-mode');
    document.body.setAttribute('data-style', currentStyle);
    if (styleSelect) styleSelect.value = currentStyle;
    localStorage.setItem('fsc_theme', currentStyle);
    console.log('[MENU] Estilo aplicado:', currentStyle);
  }

  function initTheme() {
    // Estilo guardado (compat: 'dark'/'light' antiguos siguen siendo válidos)
    const saved = localStorage.getItem('fsc_theme') || 'light';
    applyStyle(saved);
    if (styleSelect) {
      styleSelect.addEventListener('change', (e) => applyStyle(e.target.value));
    }
  }

  async function handleFilesUpload(files) {
    setStatus('uploadStatus', `Subiendo ${files.length} archivo(s)...`, '');
    let uploadedCount = 0;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const defaultName = file.name.replace(/\.[^/.]+$/, "");
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', defaultName);
      
      try {
        await apiFetch(API_BASE + '/materials/upload', { method: 'POST', body: fd });
        uploadedCount++;
      } catch (err) {
        console.error('[MENU] Error subiendo archivo:', file.name, err);
      }
    }
    
    if (uploadedCount > 0) {
      setStatus('uploadStatus', `${uploadedCount} archivo(s) agregado(s) con éxito`, 'ok');
      await loadMaterialsFromServer();
    } else {
      setStatus('uploadStatus', 'Error al subir archivo(s)', 'err');
    }
  }

  async function onAddMaterial() {
    const url = document.getElementById('newMatUrl').value.trim();
    let name = document.getElementById('newMatName').value.trim();
    const typeSelEl = document.getElementById('newMatType');
    const forcedType = typeSelEl ? typeSelEl.value : 'auto';

    if (!url) {
      setStatus('uploadStatus', 'Pegá una URL (web, YouTube, imagen o video) o arrastrá un archivo', 'err');
      return;
    }

    const post = (payload) => apiFetch(API_BASE + '/materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    try {
      let type = forcedType;
      const videoId = extractYouTubeId(url);

      // AUTO: deduce el tipo a partir de la URL
      if (type === 'auto') {
        if (videoId) type = 'youtube';
        else if (VID_URL_RE.test(url)) type = 'video';
        else if (IMG_URL_RE.test(url)) type = 'image';
        else type = 'web'; // URL sin extensión de archivo => página web
      }

      let created = null;
      if (type === 'youtube') {
        if (!videoId) {
          setStatus('uploadStatus', 'La URL no parece ser de YouTube', 'err');
          return;
        }
        if (!name) name = 'YouTube ' + videoId;
        created = await post({ type: 'youtube', name, videoId });
      } else if (type === 'web') {
        if (!name) name = webNameFromUrl(url);
        created = await post({ type: 'web', name, url });
      } else if (type === 'video') {
        if (!name) name = nameFromUrl(url, 'Video');
        created = await post({ type: 'video', name, url });
      } else {
        if (!name) name = nameFromUrl(url, 'Imagen');
        created = await post({ type: 'image', name, url });
      }

      document.getElementById('newMatUrl').value = '';
      document.getElementById('newMatName').value = '';
      if (typeSelEl) typeSelEl.value = 'auto';
      setStatus('uploadStatus', `Input agregado correctamente (${type === 'web' ? 'Página Web' : type})`, 'ok');
      await loadMaterialsFromServer();

      // 📸 al agregar se le saca la captura (web / preview de shader / imagen)
      const mat = created && created.material;
      if (mat && !mat.builtin) {
        setStatus('uploadStatus', 'Sacando captura del input…', '');
        const thumb = await captureThumb(mat);
        await loadMaterialsFromServer();
        setStatus('uploadStatus', thumb
          ? `Input agregado con captura (${type === 'web' ? 'Página Web' : type})`
          : `Input agregado (${type === 'web' ? 'Página Web' : type}) · sin captura`, thumb ? 'ok' : '');
        showToast(thumb ? '📸 Captura lista' : '⚠️ El input se agregó pero no se pudo capturar');
      }
    } catch (err) {
      console.error('[MENU] Error agregando material:', err);
      setStatus('uploadStatus', 'Error: ' + err.message, 'err');
    }
  }
  
  // --- Cambio de modo ---
  
  function switchMode(mode) {
    const isUser = mode === 'user';
    modeUserView.style.display = isUser ? 'flex' : 'none';
    modeAdvancedView.style.display = isUser ? 'none' : 'flex';
    if (modeSwitchUser) modeSwitchUser.classList.toggle('active', isUser);
    if (modeSwitchAdvanced) modeSwitchAdvanced.classList.toggle('active', !isUser);
    // El panel de configuración permanece abierto al cambiar de modo
  }
  
  // ============================================================
  // PRESETS — el estado vivo pertenece al preset cargado
  // ============================================================
  async function initActivePreset() {
    try {
      const d = await apiFetch(API_BASE + '/presets');
      activePresetName = (d && d.active) ? d.active.name : null;
    } catch (e) {
      activePresetName = null;
    }
    updatePresetBadge();
  }

  function updatePresetBadge() {
    const el = document.getElementById('presetBadge');
    if (!el) return;
    el.textContent = activePresetName ? ('PRESET · ' + activePresetName) : 'SIN PRESET';
    el.classList.toggle('is-empty', !activePresetName);
    el.title = activePresetName
      ? 'Todo lo que guardes en la botonera y en el 3D cae en este preset (se administra en el perfil)'
      : 'No hay preset cargado: guardá uno desde el perfil';
  }

  // ============================================================
  // JP SHADER EDITOR — índice de shaders + motor del editor
  // ============================================================
  //
  // Inputs "jpshader": el material NO guarda GLSL, guarda el NOMBRE del shader
  // del editor. El render lo hace el motor de jpShadereditor (plan + WebGLRenderer)
  // a través de js/jpshader-bridge.js, con la estética de esta app.

  let activeJpView = null;            // vista WebGL viva (una por panel abierto)
  let activeJpMat = null;
  const jpUniformCache = {};          // nombre del editor -> uniforms escaneados
  const jpServerLoaded = {};          // matId -> ya se mergearon los params guardados

  function paramsKey(mat) {
    // Los params del editor se guardan/leen con el nombre EXACTO del shader.
    return isJpShader(mat) ? (mat.shader || mat.effect || mat.id) : mat.id;
  }

  function jpShaderName(mat) {
    return mat && (mat.shader || mat.effect || mat.name) || '';
  }

  function jpDestroyPreview() {
    if (activeJpView) {
      try { activeJpView.destroy(); } catch (e) { /* noop */ }
      activeJpView = null;
    }
    activeJpMat = null;
  }

  // Plan + uniforms + valores (servidor > plan) para un shader del editor.
  async function jpLoad(mat) {
    if (typeof JPSE === 'undefined') throw new Error('no cargó js/jpshader-bridge.js');
    const nombre = jpShaderName(mat);
    if (!nombre) throw new Error('el material no tiene nombre de shader');
    await JPSE.loadEngine();
    const plan = await JPSE.getPlan(nombre);
    let lista = jpUniformCache[nombre];
    if (!lista) {
      lista = JPSE.uniforms(plan);
      jpUniformCache[nombre] = lista;
    }
    if (!currentShaderUniformValues[mat.id]) currentShaderUniformValues[mat.id] = {};
    const vals = currentShaderUniformValues[mat.id];

    if (!jpServerLoaded[mat.id]) {
      jpServerLoaded[mat.id] = true;
      try {
        const data = await apiFetch(API_BASE + '/shader-params/' + encodeURIComponent(paramsKey(mat)));
        if (data && data.ok && data.uniforms) Object.assign(vals, data.uniforms);
      } catch (e) { /* sin params guardados todavía */ }
    }

    const conValores = lista.map(u => {
      const v = (vals[u.name] !== undefined) ? vals[u.name] : u.value;
      vals[u.name] = v;
      return Object.assign({}, u, { value: v });
    });
    return { plan, uniforms: conValores };
  }

  function jpMountPreview(canvas, plan, mat) {
    jpDestroyPreview();
    activeJpMat = mat;
    activeJpView = JPSE.createView(canvas, plan, {
      maxDpr: 1.25,
      mouse: 'canvas',
      uniforms: currentShaderUniformValues[mat.id] || {},
      onError: (txt) => console.warn('[MENU][JPSE]', txt)
    });
    return activeJpView;
  }

  // Un cambio de uniform: preview + outputs (socket) + guardado automático.
  function jpApply(mat, nombre, valor, statusEl) {
    if (activeJpView && activeJpMat && activeJpMat.id === mat.id) {
      try { activeJpView.setUniform(nombre, valor); } catch (e) { /* noop */ }
    }
    if (!currentShaderUniformValues[mat.id]) currentShaderUniformValues[mat.id] = {};
    currentShaderUniformValues[mat.id][nombre] = valor;
    if (socket && isConnected) {
      socket.emit('updateShaderUniforms', {
        shader: jpShaderName(mat).toLowerCase(),
        uniforms: { [nombre]: valor }
      });
    }
    scheduleAutoSaveShaderParams(mat, statusEl);
  }

  // Clases por panel: el de INPUTS y el grande de la botonera ya tienen las suyas.
  function jpKinds(kind) {
    if (kind === 'user') {
      return {
        row: 'user-param-item-large', header: 'user-param-header-large',
        label: 'user-param-label-large', meta: 'user-param-meta-large',
        wrap: 'user-param-control-wrap', range: 'user-param-slider-large',
        val: 'user-param-val-large', color: 'user-param-color-large',
        hex: 'user-param-hex-large', check: 'user-param-checkbox-large'
      };
    }
    return {
      row: 'param-item', header: 'param-item-header', label: 'param-label',
      meta: 'param-meta', wrap: 'param-input-wrap', range: 'param-range-slider',
      val: 'param-num-val', color: 'param-color-picker', hex: 'param-color-hex',
      check: 'param-checkbox'
    };
  }

  function jpControlRow(u, kinds, onChange) {
    const item = document.createElement('div');
    item.className = kinds.row;
    item.dataset.uniform = u.name;

    const head = document.createElement('div');
    head.className = kinds.header;
    const label = document.createElement('span');
    label.className = kinds.label;
    label.textContent = u.name;
    const meta = document.createElement('span');
    meta.className = kinds.meta;
    meta.textContent = u.type + (u.passes && u.passes.length > 1 ? ' · ' + u.passes.join(' + ') : '');
    head.appendChild(label);
    head.appendChild(meta);
    item.appendChild(head);

    const wrap = document.createElement('div');
    wrap.className = kinds.wrap;

    const esVec = (u.type === 'vec3' || u.type === 'vec4' || u.type === 'vec2');
    const esColor = (u.type === 'vec3') && Array.isArray(u.value) &&
      u.value.length >= 3 && u.value.every(v => v >= 0 && v <= 1);

    if (u.type === 'bool') {
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.className = kinds.check;
      chk.dataset.uniformName = u.name;
      chk.checked = !!Number(u.value);
      const txt = document.createElement('span');
      txt.className = kinds.val;
      txt.textContent = chk.checked ? 'ON' : 'OFF';
      chk.addEventListener('change', () => {
        txt.textContent = chk.checked ? 'ON' : 'OFF';
        onChange(u.name, chk.checked ? 1 : 0);
      });
      wrap.appendChild(chk);
      wrap.appendChild(txt);
    } else if (esColor) {
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.className = kinds.color;
      colorInput.dataset.uniformName = u.name;
      colorInput.value = vec3ToHex(u.value);
      const hex = document.createElement('span');
      hex.className = kinds.hex;
      hex.textContent = colorInput.value;
      colorInput.addEventListener('input', () => {
        hex.textContent = colorInput.value;
        onChange(u.name, hexToVec3(colorInput.value));
      });
      wrap.appendChild(colorInput);
      wrap.appendChild(hex);
    } else if (esVec) {
      // Un slider por componente (vec2 / vec4, o vec3 fuera de 0..1).
      const n = u.type === 'vec2' ? 2 : (u.type === 'vec3' ? 3 : 4);
      const etiquetas = ['x', 'y', 'z', 'w'];
      const vals = Array.isArray(u.value) ? u.value.slice() : [];
      while (vals.length < n) vals.push(0);
      for (let i = 0; i < n; i++) {
        const fila = document.createElement('div');
        fila.className = 'jp-comp-row';
        const et = document.createElement('span');
        et.className = kinds.val;
        et.textContent = etiquetas[i];
        const sl = document.createElement('input');
        sl.type = 'range';
        sl.className = kinds.range;
        const ini = Number(vals[i]) || 0;
        sl.min = Math.min(u.min, ini);
        sl.max = Math.max(u.max, ini, sl.min + 0.0001);
        sl.step = u.step || 0.01;
        sl.value = ini;
        const num = document.createElement('span');
        num.className = kinds.val;
        num.textContent = ini.toFixed(2);
        sl.addEventListener('input', () => {
          const v = parseFloat(sl.value);
          vals[i] = v;
          num.textContent = v.toFixed(2);
          onChange(u.name, vals.slice());
        });
        fila.appendChild(et);
        fila.appendChild(sl);
        fila.appendChild(num);
        wrap.appendChild(fila);
      }
    } else {
      // float / int -> slider
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = kinds.range;
      slider.dataset.uniformName = u.name;
      slider.min = u.min;
      slider.max = u.max;
      slider.step = u.step || (u.type === 'int' ? 1 : 0.01);
      slider.value = u.value;
      const numDisplay = document.createElement('span');
      numDisplay.className = kinds.val;
      numDisplay.textContent = (u.type === 'int') ? String(Math.round(u.value)) : Number(u.value).toFixed(2);
      slider.addEventListener('input', () => {
        const val = (u.type === 'int') ? parseInt(slider.value, 10) : parseFloat(slider.value);
        numDisplay.textContent = (u.type === 'int') ? String(val) : val.toFixed(2);
        onChange(u.name, val);
      });
      wrap.appendChild(slider);
      wrap.appendChild(numDisplay);
    }

    item.appendChild(wrap);
    return item;
  }

  function jpEmptyMsg(kinds, texto) {
    const d = document.createElement('div');
    d.className = (kinds.row === 'param-item') ? 'shader-params-empty' : 'user-params-empty-large';
    d.textContent = texto;
    return d;
  }

  function jpResetToPlanDefaults(mat, plan, statusEl) {
    const defaults = JPSE.uniforms(plan);   // valores del plan (los del editor)
    if (!currentShaderUniformValues[mat.id]) currentShaderUniformValues[mat.id] = {};
    defaults.forEach(u => {
      currentShaderUniformValues[mat.id][u.name] = u.value;
      if (activeJpView && activeJpMat && activeJpMat.id === mat.id) {
        try { activeJpView.setUniform(u.name, u.value); } catch (e) { /* noop */ }
      }
    });
    jpServerLoaded[mat.id] = true;          // no volver a pisar con lo guardado
    saveShaderParamsToServer(mat, statusEl);
  }

  // --- Panel de parámetros del shader del editor (dentro de INPUTS) ---
  function renderJpShaderParamsPanel(m) {
    const panel = document.createElement('div');
    panel.className = 'shader-params-container jp-params-container';

    const header = document.createElement('div');
    header.className = 'shader-params-header';
    const titleWrap = document.createElement('div');
    titleWrap.className = 'shader-params-title-wrap';
    const badge = document.createElement('span');
    badge.className = 'shader-params-badge';
    badge.textContent = 'JP EDITOR';
    const title = document.createElement('span');
    title.className = 'shader-params-title';
    title.textContent = `Parámetros: ${m.name}`;
    titleWrap.appendChild(badge);
    titleWrap.appendChild(title);

    const btnBack = document.createElement('button');
    btnBack.className = 'btn-params-back';
    btnBack.innerHTML = '✕ Volver';
    btnBack.title = 'Cerrar y volver a la lista de inputs';
    btnBack.addEventListener('click', (e) => {
      e.stopPropagation();
      openShaderParamsMatId = null;
      jpDestroyPreview();
      renderMaterialList();
    });
    header.appendChild(titleWrap);
    header.appendChild(btnBack);
    panel.appendChild(header);

    const previewSection = document.createElement('div');
    previewSection.className = 'shader-preview-section';
    const previewLabel = document.createElement('div');
    previewLabel.className = 'shader-preview-label';
    previewLabel.textContent = 'Previsualización · ' + jpShaderName(m);
    previewSection.appendChild(previewLabel);
    const previewCanvas = document.createElement('canvas');
    previewCanvas.className = 'shader-preview-canvas jp-preview-canvas';
    previewCanvas.width = 640;
    previewCanvas.height = 360;
    previewSection.appendChild(previewCanvas);
    panel.appendChild(previewSection);

    const statusIndicator = document.createElement('span');
    statusIndicator.className = 'shader-params-status-text';
    statusIndicator.style.cssText = 'font-size: 0.75rem; color: #888; transition: all 0.2s; white-space: nowrap;';

    const uniformsList = document.createElement('div');
    uniformsList.className = 'shader-params-list';
    const loading = document.createElement('div');
    loading.className = 'shader-params-empty';
    loading.textContent = 'Cargando el plan del editor…';
    uniformsList.appendChild(loading);
    panel.appendChild(uniformsList);

    const kinds = jpKinds('adv');
    jpLoad(m).then(({ plan, uniforms }) => {
      uniformsList.innerHTML = '';
      try {
        jpMountPreview(previewCanvas, plan, m);
      } catch (err) {
        loading.textContent = '⚠️ No se pudo iniciar el motor WebGL: ' + err.message;
        uniformsList.appendChild(loading);
      }
      if (!uniforms.length) {
        uniformsList.appendChild(jpEmptyMsg(kinds, 'Este shader no declara uniforms propios: sólo se reproduce.'));
      }
      uniforms.forEach(u => {
        uniformsList.appendChild(jpControlRow(u, kinds, (n, v) => jpApply(m, n, v, statusIndicator)));
      });

      const footer = document.createElement('div');
      footer.className = 'shader-params-footer';
      const leftWrap = document.createElement('div');
      leftWrap.style.display = 'flex';
      leftWrap.style.alignItems = 'center';
      leftWrap.style.gap = '0.75rem';

      const btnSave = document.createElement('button');
      btnSave.className = 'btn-params-save';
      btnSave.innerHTML = '💾 Guardar parámetros';
      btnSave.addEventListener('click', async (e) => {
        e.stopPropagation();
        btnSave.disabled = true;
        const ok = await saveShaderParamsToServer(m, statusIndicator);
        btnSave.disabled = false;
        btnSave.innerHTML = ok ? '✅ ¡Guardado!' : '⚠️ Reintentar';
        setTimeout(() => { btnSave.innerHTML = '💾 Guardar parámetros'; }, 2200);
      });

      const btnReset = document.createElement('button');
      btnReset.className = 'btn-params-reset';
      btnReset.innerHTML = '↺ Valores del editor';
      btnReset.title = 'Volver a los valores con los que está guardado el shader en jpShadereditor';
      btnReset.addEventListener('click', (e) => {
        e.stopPropagation();
        jpResetToPlanDefaults(m, plan, statusIndicator);
        openShaderParamsMatId = m.id;
        renderMaterialList();
      });

      leftWrap.appendChild(btnSave);
      leftWrap.appendChild(btnReset);
      leftWrap.appendChild(statusIndicator);
      footer.appendChild(leftWrap);
      panel.appendChild(footer);
    }).catch(err => {
      console.error('[MENU] params jpshader:', err);
      uniformsList.innerHTML = '';
      uniformsList.appendChild(jpEmptyMsg(kinds, '⚠️ ' + err.message));
    });

    return panel;
  }

  // --- Panel grande (Modo User) del shader del editor ---
  function renderUserJpShaderParamsPanelLarge(mat, slot) {
    const existing = document.getElementById('userShaderParamsPanelLarge');
    if (existing) existing.remove();
    jpDestroyPreview();

    const panel = document.createElement('div');
    panel.id = 'userShaderParamsPanelLarge';
    panel.className = 'user-params-panel-large';

    const header = document.createElement('div');
    header.className = 'user-params-large-header';
    const titleGroup = document.createElement('div');
    titleGroup.className = 'user-params-title-group';
    const badge = document.createElement('span');
    badge.className = 'user-params-badge';
    badge.textContent = 'JP EDITOR';
    const title = document.createElement('h3');
    title.className = 'user-params-main-title';
    title.textContent = slot.label || mat.name;
    titleGroup.appendChild(badge);
    titleGroup.appendChild(title);

    const btnBack = document.createElement('button');
    btnBack.className = 'btn-user-params-back';
    btnBack.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg> Volver';
    btnBack.title = 'Volver a todos los botones';
    btnBack.addEventListener('click', (e) => {
      e.stopPropagation();
      closeUserShaderParams();
    });
    header.appendChild(titleGroup);
    header.appendChild(btnBack);
    panel.appendChild(header);

    const previewSection = document.createElement('div');
    previewSection.className = 'shader-preview-section';
    const previewLabel = document.createElement('div');
    previewLabel.className = 'shader-preview-label';
    previewLabel.textContent = 'Previsualización · ' + jpShaderName(mat);
    previewSection.appendChild(previewLabel);
    const previewCanvas = document.createElement('canvas');
    previewCanvas.className = 'shader-preview-canvas jp-preview-canvas';
    previewCanvas.width = 640;
    previewCanvas.height = 360;
    previewSection.appendChild(previewCanvas);
    panel.appendChild(previewSection);

    const statusIndicator = document.createElement('span');
    statusIndicator.className = 'user-params-status-text';
    statusIndicator.style.cssText = 'font-size: 0.75rem; color: #888; transition: all 0.2s; white-space: nowrap;';

    const paramsList = document.createElement('div');
    paramsList.className = 'user-params-large-list';
    const loading = document.createElement('div');
    loading.className = 'user-params-empty-large';
    loading.textContent = 'Cargando el plan del editor…';
    paramsList.appendChild(loading);
    panel.appendChild(paramsList);

    // Se inserta ya (para que el panel exista mientras carga el plan)
    const modeUser = document.getElementById('mode-user');
    (modeUser || document.body).appendChild(panel);

    const kinds = jpKinds('user');
    jpLoad(mat).then(({ plan, uniforms }) => {
      paramsList.innerHTML = '';
      try {
        jpMountPreview(previewCanvas, plan, mat);
      } catch (err) {
        loading.textContent = '⚠️ No se pudo iniciar el motor WebGL: ' + err.message;
        paramsList.appendChild(loading);
      }
      if (!uniforms.length) {
        paramsList.appendChild(jpEmptyMsg(kinds, 'Este shader no declara uniforms propios: sólo se reproduce.'));
      }
      uniforms.forEach(u => {
        paramsList.appendChild(jpControlRow(u, kinds, (n, v) => jpApply(mat, n, v, statusIndicator)));
      });

      const footer = document.createElement('div');
      footer.className = 'user-params-large-footer';
      const leftWrap = document.createElement('div');
      leftWrap.style.display = 'flex';
      leftWrap.style.alignItems = 'center';
      leftWrap.style.gap = '0.75rem';

      const btnSave = document.createElement('button');
      btnSave.className = 'btn-params-save';
      btnSave.innerHTML = '💾 Guardar parámetros';
      btnSave.addEventListener('click', async (e) => {
        e.stopPropagation();
        btnSave.disabled = true;
        const ok = await saveShaderParamsToServer(mat, statusIndicator);
        btnSave.disabled = false;
        btnSave.innerHTML = ok ? '✅ ¡Guardado!' : '⚠️ Reintentar';
        setTimeout(() => { btnSave.innerHTML = '💾 Guardar parámetros'; }, 2200);
      });

      const btnReset = document.createElement('button');
      btnReset.className = 'btn-params-reset';
      btnReset.innerHTML = '↺ Valores del editor';
      btnReset.addEventListener('click', (e) => {
        e.stopPropagation();
        jpResetToPlanDefaults(mat, plan, statusIndicator);
        openUserShaderParamsPanel(mat, slot);
      });

      leftWrap.appendChild(btnSave);
      leftWrap.appendChild(btnReset);
      leftWrap.appendChild(statusIndicator);
      footer.appendChild(leftWrap);
      panel.appendChild(footer);
    }).catch(err => {
      console.error('[MENU] params jpshader (user):', err);
      paramsList.innerHTML = '';
      paramsList.appendChild(jpEmptyMsg(kinds, '⚠️ ' + err.message));
    });
  }

  // ---------------------------------------------------------------- indexador
  const jpeState = { items: [], loaded: false, loading: false, query: '', autor: '', sort: 'recientes', page: 0, per: 48 };

  // --- Enlaces al editor de shaders (galería + shader puntual) ---
  function editorFront() {
    return (typeof JPSE !== 'undefined' && JPSE.FRONT) ? JPSE.FRONT : 'https://fullscreencode.com/jpshadereditor';
  }
  function editorShaderUrl(nombre) {
    return editorFront() + '/shader.html?shader=' + encodeURIComponent(nombre);
  }

  function updateBgBar() {
    const nameEl = document.getElementById('jpeBgName');
    const clear = document.getElementById('jpeBgClear');
    if (nameEl) nameEl.textContent = bgShaderName || 'shaderfondo.frag (por defecto)';
    if (clear) clear.hidden = !bgShaderName;
  }

  function initInputTabs() {
    if (inputTabs) {
      inputTabs.addEventListener('click', (e) => {
        const btn = e.target.closest('.input-tab');
        if (!btn) return;
        setInputTab(btn.dataset.itab);
      });
    }
    if (jpeSearch) {
      jpeSearch.addEventListener('input', () => {
        jpeState.query = jpeSearch.value || '';
        jpeState.page = 0;
        renderJpEditorIndex();
      });
    }
    if (jpeAuthor) {
      jpeAuthor.addEventListener('change', () => {
        jpeState.autor = jpeAuthor.value || '';
        jpeState.page = 0;
        renderJpEditorIndex();
      });
    }
    if (jpeSort) {
      jpeSort.addEventListener('change', () => {
        jpeState.sort = jpeSort.value || 'recientes';
        jpeState.page = 0;
        renderJpEditorIndex();
      });
    }
    if (jpeReload) {
      jpeReload.addEventListener('click', () => loadJpEditorIndex(true));
    }
    const bgClear = document.getElementById('jpeBgClear');
    if (bgClear) bgClear.addEventListener('click', () => setAppBackground(null));
    initInputFilters();
    updateInputCounts();
    updateBgBar();
  }

  function setInputTab(clave) {
    const esEditor = clave === 'jpeditor';
    if (inputTabs) {
      inputTabs.querySelectorAll('.input-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.itab === clave);
      });
    }
    if (inputPaneCargados) inputPaneCargados.hidden = esEditor;
    if (inputPaneEditor) inputPaneEditor.hidden = !esEditor;
    if (esEditor && !jpeState.loaded && !jpeState.loading) loadJpEditorIndex(false);
  }

  function updateInputCounts() {
    if (inputCountCargados) inputCountCargados.textContent = materialLibrary.length;
    const cuenta = {
      todos: materialLibrary.length,
      cargados: materialLibrary.filter(m => !m.builtin).length,
      imagen: materialLibrary.filter(m => m.type === 'image').length,
      web: materialLibrary.filter(m => m.type === 'web').length
    };
    Object.keys(cuenta).forEach(k => {
      const el = document.getElementById('ifCount' + k.charAt(0).toUpperCase() + k.slice(1));
      if (el) el.textContent = cuenta[k];
    });
    if (inputCountEditor && jpeState.items.length) inputCountEditor.textContent = jpeState.items.length;
  }

  async function loadJpEditorIndex(force) {
    if (typeof JPSE === 'undefined') {
      if (jpeMeta) jpeMeta.textContent = '⚠️ Falta js/jpshader-bridge.js';
      return;
    }
    jpeState.loading = true;
    if (jpeMeta) jpeMeta.textContent = 'Indexando jpShadereditor…';
    try {
      const items = await JPSE.listShaders({ refresh: !!force });
      jpeState.items = items;
      jpeState.loaded = true;

      if (jpeAuthor) {
        const autores = Array.from(new Set(items.map(s => s.autor).filter(Boolean)))
          .sort((a, b) => a.localeCompare(b, 'es'));
        const actual = jpeAuthor.value;
        jpeAuthor.innerHTML = '<option value="">Todos los autores</option>' +
          autores.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
        jpeAuthor.value = autores.indexOf(actual) >= 0 ? actual : '';
        jpeState.autor = jpeAuthor.value;
      }
      if (inputCountEditor) inputCountEditor.textContent = items.length;
      renderJpEditorIndex();
    } catch (err) {
      console.error('[MENU] índice jpShadereditor:', err);
      if (jpeMeta) jpeMeta.textContent = '⚠️ No se pudo leer el índice: ' + err.message;
    } finally {
      jpeState.loading = false;
    }
  }

  function jpeFiltered() {
    const q = jpeState.query.trim().toLowerCase();
    let arr = jpeState.items;
    if (jpeState.autor) arr = arr.filter(s => s.autor === jpeState.autor);
    if (q) {
      arr = arr.filter(s =>
        s.nombre.toLowerCase().indexOf(q) >= 0 ||
        String(s.autor || '').toLowerCase().indexOf(q) >= 0);
    }
    arr = arr.slice();
    if (jpeState.sort === 'az') {
      arr.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    } else if (jpeState.sort === 'autor') {
      arr.sort((a, b) => String(a.autor || '').localeCompare(String(b.autor || ''), 'es') ||
        a.nombre.localeCompare(b.nombre, 'es'));
    } else {
      arr.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) ||
        a.nombre.localeCompare(b.nombre, 'es'));
    }
    return arr;
  }

  function jpeMaterialFor(nombre) {
    const n = String(nombre || '').toLowerCase();
    return materialLibrary.find(m => isJpShader(m) && String(m.shader || m.effect || '').toLowerCase() === n) || null;
  }

  function jpeSlotDe(materialId) {
    const slot = buttonSlots.find(s => s.materialId === materialId);
    return slot ? slot.slot : 0;
  }

  function jpeCard(item) {
    const mat = jpeMaterialFor(item.nombre);
    const card = document.createElement('article');
    card.className = 'jpe-card' + (mat ? ' is-indexed' : '');
    card.dataset.shader = item.nombre;

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'jpe-thumb';
    if (item.thumb) {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.alt = item.nombre;
      img.src = item.thumb;
      img.onerror = function () { this.remove(); };
      thumbWrap.appendChild(img);
    } else {
      const ph = document.createElement('span');
      ph.className = 'jpe-thumb-ph';
      ph.textContent = '🌀';
      thumbWrap.appendChild(ph);
    }
    card.appendChild(thumbWrap);

    const info = document.createElement('div');
    info.className = 'jpe-info';
    const name = document.createElement('strong');
    name.className = 'jpe-name';
    name.textContent = item.nombre;
    name.title = item.nombre;
    const sub = document.createElement('span');
    sub.className = 'jpe-sub';
    const fecha = item.fecha ? String(item.fecha).slice(0, 10) : '';
    sub.textContent = [item.autor || 'sin autor', fecha].filter(Boolean).join(' · ');
    info.appendChild(name);
    info.appendChild(sub);
    card.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'jpe-actions';

    const btnAdd = document.createElement('button');
    btnAdd.className = 'jpe-add' + (mat ? ' is-in' : '');
    btnAdd.textContent = mat ? '✓ EN INPUTS' : '＋ INPUTS';
    btnAdd.disabled = !!mat;
    btnAdd.title = mat ? 'Ya está indexado en INPUTS' : 'Indexar este shader en INPUTS';
    btnAdd.addEventListener('click', async () => {
      btnAdd.disabled = true;
      btnAdd.textContent = '⏳…';
      try {
        const nuevo = await addJpShaderToInputs(item);
        // 📸 el preview del shader se renderiza acá mismo y queda de thumbnail
        if (nuevo && !nuevo.thumb) {
          showToast('🎨 Renderizando preview…');
          const thumb = await captureThumb(nuevo);
          await loadMaterialsFromServer();
          renderJpEditorIndex();
          showToast(thumb ? '📸 Preview listo en INPUTS' : '⚠️ El shader se indexó sin preview');
        } else if (nuevo) {
          renderJpEditorIndex();
          showToast('＋ ' + nuevo.name + ' en INPUTS con su preview');
        }
      } catch (err) {
        showToast('⚠️ ' + err.message);
        btnAdd.disabled = false;
        btnAdd.textContent = '＋ INPUTS';
      }
    });
    actions.appendChild(btnAdd);

    const slotSel = document.createElement('select');
    slotSel.className = 'jpe-slot';
    slotSel.title = mat ? 'Mandar este shader a un botón de la botonera' : 'Primero indexalo en INPUTS';
    slotSel.disabled = !mat;
    slotSel.innerHTML = '<option value="">→ BOTÓN</option>' +
      [1, 2, 3, 4, 5, 6].map(n => `<option value="${n}">BOTÓN ${n}</option>`).join('');
    if (mat) slotSel.value = String(jpeSlotDe(mat.id) || '');
    slotSel.addEventListener('change', async () => {
      const num = parseInt(slotSel.value, 10);
      try {
        await assignJpToSlot(mat.id, isNaN(num) ? 0 : num);
      } catch (err) {
        showToast('⚠️ ' + err.message);
      }
    });
    actions.appendChild(slotSel);
    card.appendChild(actions);

    // 🎨 FONDO (fondo de la app) + ↗ abrir en JP Shader Editor
    const actions2 = document.createElement('div');
    actions2.className = 'jpe-actions jpe-actions-2';

    const esFondo = !!bgShaderName && String(bgShaderName).toLowerCase() === String(item.nombre).toLowerCase();
    const btnBg = document.createElement('button');
    btnBg.className = 'jpe-add jpe-bg' + (esFondo ? ' is-in' : '');
    btnBg.textContent = esFondo ? '✓ FONDO' : '🎨 FONDO';
    btnBg.title = esFondo ? 'Es el fondo actual · click para volver al fondo por defecto' : 'Usar este shader como FONDO de la aplicación';
    btnBg.addEventListener('click', async () => {
      btnBg.disabled = true;
      await setAppBackground(esFondo ? null : item.nombre);
      btnBg.disabled = false;
    });
    actions2.appendChild(btnBg);

    const btnEd = document.createElement('a');
    btnEd.className = 'jpe-editor-btn';
    btnEd.textContent = '↗';
    btnEd.href = editorShaderUrl(item.nombre);
    btnEd.target = '_blank';
    btnEd.rel = 'noopener';
    btnEd.title = 'Abrir este shader en JP Shader Editor';
    actions2.appendChild(btnEd);

    card.appendChild(actions2);
    return card;
  }

  function renderJpEditorIndex() {
    if (!jpeGrid) return;
    const total = jpeState.items.length;
    const arr = jpeFiltered();
    const paginas = Math.max(1, Math.ceil(arr.length / jpeState.per));
    if (jpeState.page > paginas - 1) jpeState.page = paginas - 1;
    const desde = jpeState.page * jpeState.per;
    const pagina = arr.slice(desde, desde + jpeState.per);

    if (jpeMeta) {
      jpeMeta.textContent = total
        ? `${arr.length} de ${total} shaders · ${jpeState.autor || 'todos los autores'} · página ${jpeState.page + 1}/${paginas}`
        : 'Sin resultados';
    }
    updateBgBar();
    const linkEditor = document.getElementById('jpeEditorLink');
    if (linkEditor) linkEditor.href = editorFront() + '/';

    jpeGrid.innerHTML = '';
    pagina.forEach(item => jpeGrid.appendChild(jpeCard(item)));

    if (jpePager) {
      jpePager.innerHTML = '';
      if (paginas > 1) {
        const prev = document.createElement('button');
        prev.className = 'jpe-page-btn';
        prev.textContent = '‹';
        prev.disabled = jpeState.page === 0;
        prev.addEventListener('click', () => { jpeState.page--; renderJpEditorIndex(); jpeGrid.scrollIntoView({ block: 'nearest' }); });
        const next = document.createElement('button');
        next.className = 'jpe-page-btn';
        next.textContent = '›';
        next.disabled = jpeState.page >= paginas - 1;
        next.addEventListener('click', () => { jpeState.page++; renderJpEditorIndex(); jpeGrid.scrollIntoView({ block: 'nearest' }); });
        const info = document.createElement('span');
        info.className = 'jpe-page-info';
        info.textContent = `${jpeState.page + 1} / ${paginas}`;
        jpePager.appendChild(prev);
        jpePager.appendChild(info);
        jpePager.appendChild(next);
      }
    }
    updateInputCounts();
  }

  async function addJpShaderToInputs(item) {
    const ya = jpeMaterialFor(item.nombre);
    if (ya) return ya;
    await apiFetch(API_BASE + '/materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'jpshader', name: item.nombre, shader: item.nombre, thumb: item.thumb || null })
    });
    await loadMaterialsFromServer({ activateDefault: false });
    showToast('＋ ' + item.nombre + ' indexado en INPUTS');
    renderJpEditorIndex();
    return jpeMaterialFor(item.nombre);
  }

  async function assignJpToSlot(materialId, slotNum) {
    const slot = buttonSlots.find(s => s.slot === slotNum);
    if (!slot) {
      // slot 0 = sacarlo de la botonera
      buttonSlots.forEach(s => {
        if (s.materialId === materialId) { s.materialId = null; s.label = null; }
      });
      await onSaveButtons();
      renderJpEditorIndex();
      showToast('Sacado de la botonera');
      return;
    }
    // un material no puede estar en dos botones a la vez
    buttonSlots.forEach(s => {
      if (s.materialId === materialId && s.slot !== slotNum) { s.materialId = null; s.label = null; }
    });
    slot.materialId = materialId;
    const mat = getMaterialById(materialId);
    slot.label = mat ? mat.name : null;
    await onSaveButtons();
    renderJpEditorIndex();
    if (mat) showToast('➜ ' + mat.name + ' al BOTÓN ' + slotNum);
  }

  // ============================================================
  // PRESENTACIÓN DEL SITIO (qué es, para qué sirve, con capturas)
  // ============================================================
  const PRESENTACION_KEY = 'fsc_presentacion_visto:v1';

  function openPresentacion() {
    const box = document.getElementById('presentacion');
    if (!box) return;
    box.hidden = false;
    document.body.classList.add('presentacion-abierta');
  }

  function closePresentacion() {
    const box = document.getElementById('presentacion');
    if (box) box.hidden = true;
    document.body.classList.remove('presentacion-abierta');
    try { localStorage.setItem(PRESENTACION_KEY, '1'); } catch (e) { /* noop */ }
  }

  function initPresentacion() {
    const box = document.getElementById('presentacion');
    if (!box) return;

    const btn = document.getElementById('btnPresentacion');
    if (btn) btn.addEventListener('click', openPresentacion);
    document.getElementById('presClose')?.addEventListener('click', closePresentacion);
    document.getElementById('presClose2')?.addEventListener('click', closePresentacion);
    document.getElementById('presGoBotonera')?.addEventListener('click', closePresentacion);

    // click en el fondo oscuro cierra
    box.addEventListener('mousedown', (e) => { if (e.target === box) closePresentacion(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !box.hidden) closePresentacion();
    });

    // Primera visita: se muestra sola (una vez por navegador).
    let visto = '0';
    try { visto = localStorage.getItem(PRESENTACION_KEY) || '0'; } catch (e) { /* noop */ }
    if (visto !== '1') setTimeout(openPresentacion, 900);
  }

  function initMaterialUI() {
    loadMaterialsFromServer();
  }
  
  // --- ARRANCAR ---
  init();
  
})();