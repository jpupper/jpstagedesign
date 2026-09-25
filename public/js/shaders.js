// ============================================================
// BOTONERA FSC - Shaders Inmersivos (WebGL)
// Todos los shaders se cargan dinámicamente desde archivos .frag
// ============================================================

const Shaders = (() => {

  const defaultVertex = `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  // Parser de uniforms en el cliente
  function parseUniformsFromGLSL(glslCode) {
    const uniforms = [];
    if (!glslCode) return uniforms;
    const lines = glslCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('// uniform:') || line.startsWith('//uniform:')) {
        try {
          const metaStr = line.replace(/^\/\/\s*uniform:\s*/, '');
          const parts = metaStr.split(/,\s*(?=[a-zA-Z0-9_]+\s*:)/);
          const u = { name: '', label: '', type: 'float', default: 1.0, min: 0.0, max: 5.0, step: 0.1 };

          if (parts[0] && !parts[0].includes(':')) {
            u.name = parts[0].trim();
          }

          parts.forEach(p => {
            const colonIdx = p.indexOf(':');
            if (colonIdx > -1) {
              const key = p.substring(0, colonIdx).trim();
              let val = p.substring(colonIdx + 1).trim();
              if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
              else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
              else if (val.startsWith('[') && val.endsWith(']')) {
                try { val = JSON.parse(val); } catch(e){}
              } else if (!isNaN(Number(val))) {
                val = Number(val);
              }
              u[key] = val;
            }
          });
          if (u.name) {
            if (!u.label) u.label = u.name;
            uniforms.push(u);
          }
        } catch (err) {}
      } else {
        const match = line.match(/^uniform\s+(float|vec2|vec3|vec4|int|bool)\s+([a-zA-Z0-9_]+)\s*;/);
        if (match) {
          const type = match[1];
          const name = match[2];
          if (name !== 'u_resolution' && name !== 'u_time' && name !== 'iResolution' && name !== 'iTime' && name !== 'time') {
            if (!uniforms.find(u => u.name === name)) {
              let defVal = 1.0;
              if (type === 'vec3') defVal = [1.0, 1.0, 1.0];
              else if (type === 'vec4') defVal = [1.0, 1.0, 1.0, 1.0];
              else if (type === 'vec2') defVal = [1.0, 1.0];
              else if (type === 'int' || type === 'bool') defVal = 0;

              uniforms.push({
                name: name,
                label: name.replace(/^u_/, '').replace(/_/g, ' '),
                type: type,
                default: defVal,
                min: (type === 'float') ? 0.0 : undefined,
                max: (type === 'float') ? 5.0 : undefined,
                step: (type === 'float') ? 0.1 : undefined
              });
            }
          }
        }
      }
    }
    return uniforms;
  }

  // --- APLICAR VALOR DE UNIFORM SEGÚN TIPO WEBGL ---
  function applyUniformValue(gl, uInfo, val) {
    if (!uInfo || !uInfo.location || val === undefined || val === null) return;
    const type = uInfo.type;
    
    // float
    if (type === 0x1406) { // gl.FLOAT
      gl.uniform1f(uInfo.location, Number(val));
    }
    // vec2
    else if (type === 0x8B50) { // gl.FLOAT_VEC2
      if (Array.isArray(val) && val.length >= 2) gl.uniform2f(uInfo.location, val[0], val[1]);
    }
    // vec3
    else if (type === 0x8B51) { // gl.FLOAT_VEC3
      if (Array.isArray(val) && val.length >= 3) gl.uniform3f(uInfo.location, val[0], val[1], val[2]);
    }
    // vec4
    else if (type === 0x8B52) { // gl.FLOAT_VEC4
      if (Array.isArray(val) && val.length >= 4) gl.uniform4f(uInfo.location, val[0], val[1], val[2], val[3]);
    }
    // int o bool
    else if (type === 0x1404 || type === 0x8B56) { // gl.INT, gl.BOOL
      gl.uniform1i(uInfo.location, Math.round(Number(val)));
    }
    else {
      if (typeof val === 'number') gl.uniform1f(uInfo.location, val);
    }
  }

  // Resolver pragma includes recursivamente
  async function resolveIncludes(glslCode, baseDir) {
    if (!glslCode || typeof glslCode !== 'string') return glslCode;
    const includeRegex = /^[ \t]*#pragma[ \t]+include[ \t]+["<]([^">]+)[">][ \t]*$/gm;
    let match;
    let result = glslCode;
    const processed = new Set();

    while ((match = includeRegex.exec(glslCode)) !== null) {
      const fullMatch = match[0];
      const includePath = match[1];
      if (processed.has(includePath)) continue;
      processed.add(includePath);

      try {
        const clean = includePath.replace(/^(\.\.\/|\.\/)/, '');
        const candidateUrls = [
          includePath.startsWith('/') ? includePath : null,
          baseDir + '/' + clean,
          (baseDir.replace(/\/[^\/]+\/?$/, '')) + '/' + clean,
          `/jpstagedesign/shaders/${clean}`,
          `/futurex/shaders/${clean}`,
          `/shaders/${clean}`,
          `/jpstagedesign/${clean}`,
          `/futurex/${clean}`,
          `/${clean}`
        ].filter(Boolean);

        let incText = '';
        for (const targetUrl of candidateUrls) {
          try {
            const res = await fetch(targetUrl + '?t=' + Date.now());
            if (res.ok) {
              incText = await res.text();
              incText = await resolveIncludes(incText, targetUrl.substring(0, targetUrl.lastIndexOf('/')));
              break;
            }
          } catch (e) {}
        }

        if (incText) {
          result = result.replace(fullMatch, incText);
        } else {
          console.warn('[SHADERS] No se pudo resolver #pragma include:', includePath);
          result = result.replace(fullMatch, '// include omitted: ' + includePath);
        }
      } catch (err) {
        console.warn('[SHADERS] Error resolviendo #pragma include:', includePath, err.message);
        result = result.replace(fullMatch, '// include error: ' + includePath);
      }
    }
    return result;
  }

  // --- INICIALIZAR SHADER ---
  function initShader(canvas, shaderCode, options = {}) {
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, alpha: true }) || 
               canvas.getContext('experimental-webgl', { preserveDrawingBuffer: true, alpha: true });
    if (!gl) {
      console.error('[SHADERS] WebGL no soportado');
      return null;
    }
    
    const vSource = (typeof shaderCode === 'object' && shaderCode.vertex) ? shaderCode.vertex : defaultVertex;
    const fSource = (typeof shaderCode === 'object' && shaderCode.fragment) ? shaderCode.fragment : (typeof shaderCode === 'string' ? shaderCode : '');

    if (!fSource) {
      console.error('[SHADERS] Falta código fragment shader');
      return null;
    }

    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vSource);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      console.error('[SHADERS] Error vertex shader:', gl.getShaderInfoLog(vs));
      return null;
    }
    
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fSource);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error('[SHADERS] Error fragment shader:', gl.getShaderInfoLog(fs));
      return null;
    }
    
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[SHADERS] Error linking:', gl.getProgramInfoLog(program));
      return null;
    }
    
    gl.useProgram(program);
    
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1
    ]), gl.STATIC_DRAW);
    
    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    
    const uResolution = gl.getUniformLocation(program, 'u_resolution') || gl.getUniformLocation(program, 'iResolution');
    const uTime = gl.getUniformLocation(program, 'u_time') || gl.getUniformLocation(program, 'time') || gl.getUniformLocation(program, 'iTime');
    
    // Inspeccionar todos los uniforms activos dinámicamente
    const activeUniforms = {};
    const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
      const info = gl.getActiveUniform(program, i);
      if (!info) continue;
      const loc = gl.getUniformLocation(program, info.name);
      activeUniforms[info.name] = {
        location: loc,
        type: info.type,
        size: info.size,
        name: info.name
      };
    }

    let initValues = {};
    if (Array.isArray(options.uniforms)) {
      options.uniforms.forEach(u => {
        if (u && u.name) {
          initValues[u.name] = (u.value !== undefined) ? u.value : (u.default !== undefined ? u.default : 1.0);
        }
      });
    } else if (options.uniforms && typeof options.uniforms === 'object') {
      initValues = Object.assign({}, options.uniforms);
    }

    const ctx = {
      gl,
      program,
      uResolution,
      uTime,
      activeUniforms,
      values: initValues,
      startTime: performance.now(),
      rafId: null
    };

    // Aplicar uniformes iniciales
    if (Object.keys(initValues).length > 0) {
      setUniforms(ctx, initValues);
    }

    return ctx;
  }

  // --- RENDERIZAR UN SOLO FRAME ESTÁTICO ---
  function renderFrame(shaderCtx, canvas, timeSec = 1.0) {
    if (!shaderCtx || !canvas) return;
    const { gl, program, uResolution, uTime } = shaderCtx;
    gl.useProgram(program);

    const isVisible = !!(canvas.clientWidth && canvas.clientHeight);
    const w = isVisible ? canvas.clientWidth : (canvas.width || 512);
    const h = isVisible ? canvas.clientHeight : (canvas.height || 256);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    if (uResolution) gl.uniform2f(uResolution, canvas.width, canvas.height);
    if (uTime) gl.uniform1f(uTime, Number(timeSec) || 1.0);

    // Aplicar uniforms
    if (shaderCtx.values && shaderCtx.activeUniforms) {
      for (const [uName, uVal] of Object.entries(shaderCtx.values)) {
        const uInfo = findUniformInfo(shaderCtx.activeUniforms, uName);
        if (uInfo) {
          applyUniformValue(gl, uInfo, uVal);
        }
      }
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  // --- RENDER LOOP CONTINUO ---
  function render(shaderCtx, canvas) {
    if (!shaderCtx || !canvas) return;
    const { gl, program, uResolution, uTime, startTime } = shaderCtx;

    // Si ya hay un bucle corriendo, detenerlo antes de iniciar otro
    if (shaderCtx.rafId) {
      cancelAnimationFrame(shaderCtx.rafId);
      shaderCtx.rafId = null;
    }
    
    function frame() {
      gl.useProgram(program);
      const isVisible = !!(canvas.clientWidth && canvas.clientHeight);
      const w = isVisible ? canvas.clientWidth : (canvas.width || 1024);
      const h = isVisible ? canvas.clientHeight : (canvas.height || 512);
      if (isVisible && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (uResolution) gl.uniform2f(uResolution, canvas.width, canvas.height);
      if (uTime) gl.uniform1f(uTime, (performance.now() - startTime) / 1000.0);

      // Aplicar dinámicamente los uniforms configurables
      if (shaderCtx.values && shaderCtx.activeUniforms) {
        for (const [uName, uVal] of Object.entries(shaderCtx.values)) {
          const uInfo = findUniformInfo(shaderCtx.activeUniforms, uName);
          if (uInfo) {
            applyUniformValue(gl, uInfo, uVal);
          }
        }
      }

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      shaderCtx.rafId = requestAnimationFrame(frame);
    }
    
    frame();
  }

  // Buscar uniform coincidente con o sin prefijo u_
  function findUniformInfo(activeUniforms, name) {
    if (!activeUniforms || !name) return null;
    if (activeUniforms[name]) return activeUniforms[name];
    if (!name.startsWith('u_') && activeUniforms['u_' + name]) return activeUniforms['u_' + name];
    if (name.startsWith('u_')) {
      const stripped = name.replace(/^u_/, '');
      if (activeUniforms[stripped]) return activeUniforms[stripped];
    }
    return null;
  }

  // --- DETENER ---
  function stop(shaderCtx) {
    if (shaderCtx && shaderCtx.rafId) {
      cancelAnimationFrame(shaderCtx.rafId);
      shaderCtx.rafId = null;
    }
  }

  // --- ACTUALIZAR UNIFORMS EN TIEMPO REAL ---
  function setUniform(shaderCtx, name, value) {
    if (!shaderCtx || !shaderCtx.values) return;
    shaderCtx.values[name] = value;
    if (shaderCtx.gl && shaderCtx.program && shaderCtx.activeUniforms) {
      const uInfo = findUniformInfo(shaderCtx.activeUniforms, name);
      if (uInfo) {
        shaderCtx.gl.useProgram(shaderCtx.program);
        applyUniformValue(shaderCtx.gl, uInfo, value);
      }
    }
  }

  function setUniforms(shaderCtx, uniformObj) {
    if (!shaderCtx || !shaderCtx.values || !uniformObj) return;
    let map = {};
    if (Array.isArray(uniformObj)) {
      uniformObj.forEach(u => {
        if (u && u.name) {
          map[u.name] = (u.value !== undefined ? u.value : (u.default !== undefined ? u.default : 1.0));
        }
      });
    } else if (typeof uniformObj === 'object') {
      map = uniformObj;
    }
    Object.assign(shaderCtx.values, map);
    if (shaderCtx.gl && shaderCtx.program && shaderCtx.activeUniforms) {
      shaderCtx.gl.useProgram(shaderCtx.program);
      for (const [name, val] of Object.entries(map)) {
        const uInfo = findUniformInfo(shaderCtx.activeUniforms, name);
        if (uInfo) {
          applyUniformValue(shaderCtx.gl, uInfo, val);
        }
      }
    }
  }

  // Caché de shaders dinámicos cargados desde .frag
  const shaderCache = {};

  async function getShader(nameOrUrl) {
    if (!nameOrUrl) return getShader('space');
    const cleanName = nameOrUrl.replace(/^(effect|shader)-/, '').replace(/\.frag$/, '').toLowerCase();

    if (shaderCache[cleanName]) {
      return shaderCache[cleanName];
    }

    // Rutas candidatas para buscar el archivo .frag
    const basePath = (typeof window !== 'undefined' && ((window.CONFIG && window.CONFIG.BASE) || (window.FUTUREX_CONFIG && window.FUTUREX_CONFIG.BASE))) || '/jpstagedesign';
    const candidateUrls = [];

    if (nameOrUrl.startsWith('/') || nameOrUrl.startsWith('http')) {
      candidateUrls.push(nameOrUrl);
    } else {
      candidateUrls.push(`${basePath}/shaders/${cleanName}.frag`);
      candidateUrls.push(`/shaders/${cleanName}.frag`);
    }

    for (const url of candidateUrls) {
      try {
        const res = await fetch(url + '?t=' + Date.now());
        if (res.ok) {
          let fragText = await res.text();
          const baseFolder = url.substring(0, url.lastIndexOf('/'));
          // Resolver #pragma include
          fragText = await resolveIncludes(fragText, baseFolder);
          const shaderObj = {
            vertex: defaultVertex,
            fragment: fragText
          };
          shaderCache[cleanName] = shaderObj;
          return shaderObj;
        }
      } catch (e) {
        // Seguir con siguiente candidato
      }
    }

    console.error('[SHADERS] No se pudo cargar fragment .frag para:', cleanName);
    return null;
  }

  function clearCache() {
    for (const key of Object.keys(shaderCache)) {
      delete shaderCache[key];
    }
  }

  // --- API PÚBLICA ---
  const api = {
    initShader,
    render,
    renderFrame,
    stop,
    setUniform,
    setUniforms,
    getShader,
    clearCache,
    parseUniformsFromGLSL
  };

  if (typeof window !== 'undefined') {
    window.Shaders = api;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.Shaders = api;
  }

  return api;

})();
