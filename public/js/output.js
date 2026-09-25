// ============================================================
// BOTONERA FSC - Lógica del Output (SLAVE)
// Renderiza escenas: shaders, imágenes, YouTube
// ============================================================

(function() {
  'use strict';
  
  // --- ELEMENTOS DOM ---
  const emptyState = document.getElementById('emptyState');
  const sceneContainer = document.getElementById('sceneContainer');
  
  // --- ESTADO ---
  let socket = null;
  let currentScene = null;
  let shaderCtx = null;
  let infoTimeout = null;

  // --- DETECCIÓN DE PANTALLA INDIVIDUAL (?screen=1|2|3|4) ---
  const urlParams = new URLSearchParams(window.location.search);
  const screenParam = parseInt(urlParams.get('screen'), 10);
  const isSlicedScreen = (screenParam >= 1 && screenParam <= 4);
  
  // --- ESTADO DE MAPEO (🪞 ESPEJO / 🧩 REPARTO) ---
  // 'duplicated' = ESPEJO (DEFAULT): cada salida muestra el 100% del contenido.
  // 'extended'   = REPARTO: esta salida (?screen=N) muestra su cuarto del panorama 4x1.
  // El modo lo manda el servidor (lo cambia la botonera); el default es ESPEJO.
  let mappingMode = 'duplicated';
  try {
    if (localStorage.getItem('fsc_mapping_mode') === 'extended') mappingMode = 'extended';
  } catch (e) { /* noop */ }

  // --- INICIALIZACIÓN ---
  function init() {
    setupScreenSlice();
    connectSocket();
  }

  // Aplica el modo de mapeo a ESTA ventana de salida
  function applyMappingMode(mode) {
    mappingMode = (mode === 'extended') ? 'extended' : 'duplicated';
    try { localStorage.setItem('fsc_mapping_mode', mappingMode); } catch (e) { /* noop */ }
    if (!isSlicedScreen) return;   // /output/ sin ?screen=N siempre muestra el 100%
    const sliced = (mappingMode === 'extended');
    document.body.classList.toggle('sliced-screen', sliced);
    document.body.classList.toggle('mirror-mode', !sliced);
    [1, 2, 3, 4].forEach(n => document.body.classList.remove('screen-' + n));
    if (sliced) document.body.classList.add('screen-' + screenParam);
    updateSliceBadge();
  }

  function updateSliceBadge() {
    if (!isSlicedScreen) return;
    let badge = document.querySelector('.screen-indicator-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'screen-indicator-badge';
      document.body.appendChild(badge);
      badge.addEventListener('mouseenter', () => { badge.style.opacity = '1'; });
      badge.addEventListener('mouseleave', () => { badge.style.opacity = '0.3'; });
    }
    const wallNames = {
      1: 'Pared Frontal (0-25%)',
      2: 'Pared Derecha (25-50%)',
      3: 'Pared Trasera (50-75%)',
      4: 'Pared Izquierda (75-100%)'
    };
    badge.textContent = (mappingMode === 'extended')
      ? 'PANTALLA ' + screenParam + '/4 · ' + (wallNames[screenParam] || '')
      : 'PANTALLA ' + screenParam + ' · 🪞 ESPEJO (100%)';
    badge.style.opacity = '1';
    setTimeout(() => { badge.style.opacity = '0.3'; }, 5000);
  }

  function setupScreenSlice() {
    if (!isSlicedScreen) return;
    applyMappingMode(mappingMode);
  }
  
  // --- CONEXIÓN SOCKET ---
  function connectSocket() {
    const socketOptions = {
      path: CONFIG.SOCKET_PATH,
      withCredentials: true,
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
      console.log('[OUTPUT] Conectado al servidor');
      showConnectionStatus('Conectado', 'green');
    });
    
    socket.on('disconnect', () => {
      console.log('[OUTPUT] Desconectado');
      showConnectionStatus('Desconectado', 'red');
    });
    
    socket.on('connect_error', (error) => {
      console.error('[OUTPUT] Error de conexión:', error.message);
      showConnectionStatus('Error de conexión', 'red');
    });
    
    socket.on('sceneChanged', (data) => {
      console.log(`[OUTPUT] Nueva escena: ${data.sceneId}`);
      showScene(data);
    });
    
    socket.on('sceneCleared', () => {
      console.log('[OUTPUT] Escena limpiada');
      clearScene();
    });
    
    function updateLogo(url) {
      if (!url) return;
      const el = document.querySelector('.logo-output-img');
      if (el) el.src = url;
    }

    socket.on('masterStatus', (data) => {
      if (data.currentScene) {
        showScene(data.currentScene);
      }
      if (data.logoUrl) {
        updateLogo(data.logoUrl);
      }
      if (data.mappingMode) {
        applyMappingMode(data.mappingMode);
      }
    });

    // El modo de mapeo cambió (lo dispara la botonera o el simulador 3D)
    socket.on('mappingModeChanged', (data) => {
      applyMappingMode(data && data.mode);
    });

    socket.on('logoChanged', (data) => {
      if (data && data.logoUrl) {
        updateLogo(data.logoUrl);
      }
    });
    
    socket.on('roomConfig', (data) => {
      console.log('[OUTPUT] Config de habitación actualizada:', data);
      CONFIG.ROOM = data;
    });

    socket.on('shaderUniformsChanged', (data) => {
      if (shaderCtx && typeof Shaders !== 'undefined' && data && data.uniforms) {
        const activeClean = (currentScene?.shader || currentScene?.effect || currentScene?.name || '').replace(/^(effect|shader)-/, '').toLowerCase();
        const targetClean = (data.shader || '').replace(/^(effect|shader)-/, '').toLowerCase();
        if (!targetClean || targetClean === activeClean) {
          Shaders.setUniforms(shaderCtx, data.uniforms);
        }
      }
    });
  }
  
  // --- MOSTRAR ESTADO DE CONEXIÓN ---
  function showConnectionStatus(text, color) {
    let statusEl = document.getElementById('connectionStatus');
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.id = 'connectionStatus';
      statusEl.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        padding: 5px 15px;
        border-radius: 5px;
        font-size: 12px;
        font-family: monospace;
        z-index: 9999;
        background: #000;
        color: #fff;
        border: 1px solid #ff0000;
      `;
      document.body.appendChild(statusEl);
    }
    statusEl.textContent = text;
  }
  
  // --- MOSTRAR ESCENA ---
  function showScene(scene) {
    if (!scene) return;
    
    if (scene.type === 'blackout' || scene.id === 'blackout') {
      renderBlackout();
      return;
    }
    
    currentScene = scene;
    
    // Ocultar estado vacío
    emptyState.style.display = 'none';
    sceneContainer.style.display = 'block';
    sceneContainer.style.background = '';
    document.body.style.background = '';
    
    // Limpiar contenedor
    clearSceneContainer();
    
    // Renderizar según tipo
    switch (scene.type) {
      case 'shader':
        renderShader(scene);
        break;
      case 'image':
        renderImage(scene);
        break;
      case 'youtube':
        renderYouTube(scene);
        break;
      case 'video':
        renderVideo(scene);
        break;
      case 'web':
        renderWeb(scene);
        break;
    }
    
    // Mostrar info
    showSceneInfo(scene);
  }
  
  // --- RENDERIZAR SHADER ---
  async function renderShader(scene) {
    const canvas = document.createElement('canvas');
    canvas.className = 'scene-canvas';
    canvas.id = 'shaderCanvas';
    sceneContainer.appendChild(canvas);
    
    const shaderName = (scene.shader || scene.effect || scene.id || 'space').replace(/^(effect|shader)-/, '').toLowerCase();
    
    let shaderCode;
    if (typeof Shaders !== 'undefined' && Shaders.getShader) {
      shaderCode = await Shaders.getShader(shaderName);
    }
    if (!shaderCode && typeof Shaders !== 'undefined') {
      shaderCode = (shaderName === 'noise') ? Shaders.whiteNoise : (Shaders[shaderName] || Shaders.space);
    }
    
    // Iniciar shader con uniforms iniciales si están definidos
    shaderCtx = Shaders.initShader(canvas, shaderCode, { uniforms: scene.uniforms });
    if (shaderCtx) {
      Shaders.render(shaderCtx, canvas);
    }
    
    console.log(`[OUTPUT] Shader renderizado: ${shaderName}`);
  }
  
  // --- RENDERIZAR IMAGEN ---
  function renderImage(scene) {
    const img = document.createElement('img');
    img.className = 'scene-image';
    img.src = scene.src;
    img.alt = scene.label;
    img.onload = () => console.log(`[OUTPUT] Imagen cargada: ${scene.label}`);
    img.onerror = () => {
      console.error(`[OUTPUT] Error cargando imagen: ${scene.src}`);
      img.src = 'https://via.placeholder.com/1920x1080/1a1a2e/00d4ff?text=Imagen+no+disponible';
    };
    sceneContainer.appendChild(img);
  }
  
  // --- RENDERIZAR VIDEO (archivo mp4/webm) ---
  function renderVideo(scene) {
    const video = document.createElement('video');
    video.className = 'scene-video';
    video.src = scene.src;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.controls = false;
    video.addEventListener('error', () => {
      console.error(`[OUTPUT] Error cargando video: ${scene.src}`);
    });
    sceneContainer.appendChild(video);
    video.play().catch(e => console.error('[OUTPUT] No se pudo reproducir el video:', e));
    
    console.log(`[OUTPUT] Video cargado: ${scene.label}`);
  }
  
  // --- RENDERIZAR YOUTUBE ---
  function renderYouTube(scene) {
    const iframe = document.createElement('iframe');
    iframe.className = 'scene-youtube';
    iframe.src = `https://www.youtube.com/embed/${scene.videoId}?autoplay=1&mute=0&controls=1&rel=0&showinfo=0`;
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.title = scene.label;
    sceneContainer.appendChild(iframe);
    
    console.log(`[OUTPUT] YouTube embebido: ${scene.videoId}`);
  }
  
  // --- RENDERIZAR PÁGINA WEB (iframe embebido) ---
  function renderWeb(scene) {
    const url = scene.src || scene.url;
    if (!url) {
      console.error('[OUTPUT] Página web sin URL');
      return;
    }
    const iframe = document.createElement('iframe');
    iframe.className = 'scene-web';
    iframe.src = url;
    iframe.allow = 'autoplay; fullscreen; clipboard-write; encrypted-media; picture-in-picture; accelerometer; gyroscope';
    iframe.allowFullscreen = true;
    iframe.title = scene.label || 'Página Web';
    iframe.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; border:0; background:#000;';
    sceneContainer.appendChild(iframe);

    console.log(`[OUTPUT] Página web embebida: ${url}`);
  }

  // --- MODO BLACKOUT (PANTALLA TOTALMENTE NEGRA) ---
  function renderBlackout() {
    currentScene = { id: 'blackout', label: 'BLACKOUT', type: 'blackout' };
    
    if (shaderCtx) {
      Shaders.stop(shaderCtx);
      shaderCtx = null;
    }
    
    clearSceneContainer();
    emptyState.style.display = 'none';
    sceneContainer.style.display = 'block';
    sceneContainer.style.background = '#000000';
    document.body.style.background = '#000000';
    
    const infoEl = document.getElementById('sceneInfo');
    if (infoEl) infoEl.style.display = 'none';
    
    console.log('[OUTPUT] Modo BLACKOUT activado (pantallas apagadas)');
  }
  
  // --- LIMPIAR ESCENA ---
  function clearScene() {
    renderBlackout();
  }
  
  // --- LIMPIAR CONTENEDOR ---
  function clearSceneContainer() {
    while (sceneContainer.firstChild) {
      const child = sceneContainer.firstChild;
      // Descargar cualquier iframe (YouTube o página web) antes de remover
      if (child.tagName === 'IFRAME') {
        try { child.src = 'about:blank'; } catch (e) { /* noop */ }
      }
      // Pausar videos de archivo antes de remover
      if (child.tagName === 'VIDEO') {
        child.pause();
        child.removeAttribute('src');
        child.load();
      }
      sceneContainer.removeChild(child);
    }
  }
  
  // --- MOSTRAR INFO DE ESCENA ---
  function showSceneInfo(scene) {
    // Remover info anterior
    const oldInfo = sceneContainer.querySelector('.scene-info');
    if (oldInfo) oldInfo.remove();
    
    const info = document.createElement('div');
    info.className = 'scene-info';
    info.innerHTML = `
      <span class="label">${scene.label}</span>
      <span class="type">${scene.type}</span>
    `;
    sceneContainer.appendChild(info);
    
    // Mostrar con delay
    setTimeout(() => info.classList.add('visible'), 100);
    
    // Ocultar después de 4 segundos
    if (infoTimeout) clearTimeout(infoTimeout);
    infoTimeout = setTimeout(() => {
      info.classList.remove('visible');
    }, 4000);
  }
  
  // --- ARRANCAR ---
  init();
  
})();
