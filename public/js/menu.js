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
  let bgShaderCtx = null; // Contexto del shader de fondo
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
    initBackgroundShader();
    setupKeyboardShortcuts();
    initMaterialUI();
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
  async function initBackgroundShader() {
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
  
  // Recargar shader desde archivo .frag
  function reloadShader() {
    console.log('[MENU] Recargando shaderfondo.frag...');
    if (bgShaderCtx && bgShaderCtx.gl && bgShaderCtx.program) {
      if (bgShaderCtx.rafId) cancelAnimationFrame(bgShaderCtx.rafId);
      bgShaderCtx.gl.deleteProgram(bgShaderCtx.program);
    }
    initBackgroundShader();
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
    window.open(CONFIG.OUTPUT_3D_URL, '_blank');
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
  
  async function loadMaterialsFromServer() {
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

      renderUserButtons();
      renderMaterialList();
      renderButtonAssignments();
      setStatus('uploadStatus', 'Biblioteca cargada desde el servidor', 'ok');
      
      // Activar botón 1 por defecto
      setTimeout(() => activateDefaultButton(), 500);
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
  
  function materialIcon(m) {
    if (m.type === 'shader' || m.type === 'effect') return '✨';
    if (m.type === 'image') return '🖼️';
    if (m.type === 'youtube') return '🎬';
    if (m.type === 'video') return '🎥';
    if (m.type === 'web') return '🌐';
    return '📦';
  }
  
  function materialTypeLabel(m) {
    if (m.type === 'shader' || m.type === 'effect') return 'Shader';
    if (m.type === 'image') return 'Imagen';
    if (m.type === 'youtube') return 'Video YT';
    if (m.type === 'video') return 'Video';
    if (m.type === 'web') return 'Página Web';
    return m.type;
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
      
      // For shader materials, add canvas for preview instead of image
      if (isShader) {
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
      if (isShader) {
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
    const shaderId = mat.id;
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
        const data = await apiFetch(API_BASE + '/shader-params/' + encodeURIComponent(mat.id));
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
    if (!materialLibrary.length) {
      materialList.innerHTML = '<div class="mat-empty">Sin inputs cargados</div>';
      return;
    }

    if (openShaderParamsMatId) {
      materialList.classList.add('params-active-mode');
    } else {
      materialList.classList.remove('params-active-mode');
      stopShaderPreview(); // sin panel abierto: apagar el loop del preview
    }

    materialList.innerHTML = '';
    materialLibrary.forEach(m => {
      const isShader = (m.type === 'shader' || m.type === 'effect');
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
      icon.textContent = materialIcon(m);
      
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
      if (isShader) {
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
        const paramsContainer = renderShaderParamsPanel(m);
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
      setStatus('assignStatus', 'Asignación guardada en el servidor', 'ok');
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

      if (type === 'youtube') {
        if (!videoId) {
          setStatus('uploadStatus', 'La URL no parece ser de YouTube', 'err');
          return;
        }
        if (!name) name = 'YouTube ' + videoId;
        await post({ type: 'youtube', name, videoId });
      } else if (type === 'web') {
        if (!name) name = webNameFromUrl(url);
        await post({ type: 'web', name, url });
      } else if (type === 'video') {
        if (!name) name = nameFromUrl(url, 'Video');
        await post({ type: 'video', name, url });
      } else {
        if (!name) name = nameFromUrl(url, 'Imagen');
        await post({ type: 'image', name, url });
      }

      document.getElementById('newMatUrl').value = '';
      document.getElementById('newMatName').value = '';
      if (typeSelEl) typeSelEl.value = 'auto';
      setStatus('uploadStatus', `Input agregado correctamente (${type === 'web' ? 'Página Web' : type})`, 'ok');
      await loadMaterialsFromServer();
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
  
  function initMaterialUI() {
    loadMaterialsFromServer();
  }
  
  // --- ARRANCAR ---
  init();
  
})();