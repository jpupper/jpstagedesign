// ============================================================
// BOTONERA FSC - Servidor Express + Socket.io
// Arquitectura: MASTER (menu) / SLAVE (output)
// Ecosistema Fullscreen - Estándar FSC
// ============================================================

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const PORT = process.env.PORT || 6645;
const BASE_PATH = process.env.BASE_PATH || '/jpstagedesign';

const app = express();
const server = http.createServer(app);

// ============================================================
// CORS DINÁMICO - Acepta cualquier origen de fullscreencode.com o el VPS
// ============================================================
const allowedOrigins = [
  "https://fullscreencode.com",
  "https://www.fullscreencode.com",
  "http://fullscreencode.com",
  "http://www.fullscreencode.com",
  "https://vps-4455523-x.dattaweb.com",
  "http://localhost:6645",
  "http://127.0.0.1:6645",
  "http://localhost:3244",
  "http://127.0.0.1:3244",
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
  "http://localhost:3030",
  "http://localhost:3000"
];

const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sin origin (apps móviles, curl, Node scripts)
    if (!origin) return callback(null, true);
    
    // Verificar si el origen está permitido
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Permitir cualquier subdominio de fullscreencode.com
    if (origin.includes('fullscreencode.com') || origin.includes('dattaweb.com')) {
      return callback(null, true);
    }
    
    console.log(`[CORS] Bloqueado: ${origin}`);
    callback(null, true); // En producción, permitir todos para evitar problemas
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
};

// Aplicar CORS a Express
app.use(cors(corsOptions));

// Habilitar preflight para todas las rutas
app.options('*', cors(corsOptions));

// Socket.IO con CORS
const io = new Server(server, {
  path: BASE_PATH + '/socket.io',
  cors: corsOptions,
  allowEIO3: true, // Compatibilidad con socket.io v3 y v4
  transports: ['websocket', 'polling']
});

app.use(express.json({ limit: '50mb' }));

// Servir archivos estáticos (tanto en BASE_PATH como en raíz) con no-cache
const staticOptions = {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
};
app.use(BASE_PATH, express.static(path.join(__dirname, 'public'), staticOptions));
app.use(express.static(path.join(__dirname, 'public'), staticOptions));

// Alias para resolver includes de shaders
app.get(['/common.frag', BASE_PATH + '/common.frag'], (req, res) => {
  res.sendFile(path.join(path.join(__dirname, 'public', 'shaders'), 'common.frag'));
});

// ============================================================
// MATERIALES - Biblioteca persistente (efectos, videos, imágenes)
// Se guarda en data/materials.json en el servidor
// ============================================================

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const MODELS_DIR = path.join(UPLOADS_DIR, 'models');
const SHADERS_DIR = path.join(__dirname, 'public', 'shaders');
const TEMPLATES_DIR = path.join(DATA_DIR, 'templates');
const MATERIALS_FILE = path.join(DATA_DIR, 'materials.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(MODELS_DIR, { recursive: true });
fs.mkdirSync(SHADERS_DIR, { recursive: true });
fs.mkdirSync(TEMPLATES_DIR, { recursive: true });

// Función para parsear uniforms desde código GLSL
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
      } catch (err) {
        console.warn('[SHADERS] Error parseando comentario uniform:', line, err.message);
      }
    } else {
      const match = line.match(/^uniform\s+(float|vec2|vec3|vec4|int|bool)\s+([a-zA-Z0-9_]+)\s*;/);
      if (match) {
        const type = match[1];
        const name = match[2];
        if (name !== 'u_resolution' && name !== 'u_time') {
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

// Escaneo dinámico de todos los archivos .frag en public/shaders
function scanShaderFiles() {
  const list = [];
  try {
    if (!fs.existsSync(SHADERS_DIR)) return list;
    const files = fs.readdirSync(SHADERS_DIR);
    for (const f of files) {
      if (!f.toLowerCase().endsWith('.frag')) continue;
      const baseName = path.basename(f, '.frag');
      const filePath = path.join(SHADERS_DIR, f);
      const code = fs.readFileSync(filePath, 'utf8');
      const parsedUniforms = parseUniformsFromGLSL(code);

      list.push({
        id: 'shader-' + baseName,
        legacyId: 'effect-' + baseName,
        type: 'shader',
        name: baseName, // El nombre lo toma directamente del archivo (ej: noise.frag -> noise)
        effect: baseName,
        shader: baseName,
        src: BASE_PATH + '/shaders/' + f,
        fileName: f,
        builtin: true,
        uniforms: parsedUniforms,
        code
      });
    }
  } catch (err) {
    console.error('[SHADERS] Error escaneando shaders:', err.message);
  }
  return list;
}

// Imágenes de ambiente por defecto (selección clásica)
const DEFAULT_IMAGES = [
  { id: 'image-playa', name: 'Playa', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=90' },
  { id: 'image-bosque', name: 'Bosque', url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&q=90' },
  { id: 'image-campo', name: 'Campo', url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1920&q=90' },
  { id: 'image-montana', name: 'Montaña', url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920&q=90' },
  { id: 'image-ciudad', name: 'Ciudad', url: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1920&q=90' },
  { id: 'image-atardecer', name: 'Atardecer', url: 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=1920&q=90' }
];

// Configuración por defecto: 3 efectos + 3 imágenes
const DEFAULT_BUTTONS = [
  { slot: 1, materialId: 'shader-space', label: 'space' },
  { slot: 2, materialId: 'shader-fire', label: 'fire' },
  { slot: 3, materialId: 'shader-waves', label: 'waves' },
  { slot: 4, materialId: 'image-playa', label: 'Playa' },
  { slot: 5, materialId: 'image-bosque', label: 'Bosque' },
  { slot: 6, materialId: 'image-montana', label: 'Montaña' }
];

function defaultMaterials() {
  const shaders = scanShaderFiles().map(s => ({
    id: s.id,
    type: 'shader',
    name: s.name,
    effect: s.effect,
    shader: s.shader,
    builtin: true,
    src: s.src,
    fileName: s.fileName,
    uniforms: s.uniforms,
    videoId: null,
    createdAt: null
  }));
  const images = DEFAULT_IMAGES.map(img => ({
    id: img.id,
    type: 'image',
    name: img.name,
    effect: null,
    builtin: false,
    src: img.url,
    videoId: null,
    fileName: null,
    createdAt: null
  }));
  return shaders.concat(images);
}

function defaultLibrary() {
  return {
    materials: defaultMaterials(),
    buttons: DEFAULT_BUTTONS
  };
}

let library = null;

function loadLibrary() {
  if (library) return library;
  try {
    const scannedShaders = scanShaderFiles();
    if (fs.existsSync(MATERIALS_FILE)) {
      const raw = fs.readFileSync(MATERIALS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      const existing = parsed.materials || [];
      const byId = {};

      existing.forEach(m => {
        // Normalizar nombres de shaders para que coincidan exactamente con el archivo .frag
        if (m.type === 'effect' || m.type === 'shader' || (m.id && (m.id.startsWith('effect-') || m.id.startsWith('shader-')))) {
          const cleanName = (m.effect || m.shader || m.id.replace(/^(effect|shader)-/, '')).toLowerCase();
          const foundShader = scannedShaders.find(s => s.name === cleanName);
          m.id = 'shader-' + cleanName;
          m.type = 'shader';
          m.name = cleanName; // Nombre exacto del archivo sin .frag
          m.effect = cleanName;
          m.shader = cleanName;
          m.src = BASE_PATH + '/shaders/' + cleanName + '.frag';
          m.fileName = cleanName + '.frag';
          if (foundShader) {
            m.uniforms = foundShader.uniforms;
          }
        }
        byId[m.id] = m;
      });

      // Asegurar que todos los shaders presentes en public/shaders/ existan en la biblioteca
      scannedShaders.forEach(s => {
        if (!byId[s.id] && !byId['effect-' + s.name]) {
          byId[s.id] = {
            id: s.id,
            type: 'shader',
            name: s.name,
            effect: s.effect,
            shader: s.shader,
            builtin: true,
            src: s.src,
            fileName: s.fileName,
            uniforms: s.uniforms,
            videoId: null,
            createdAt: null
          };
        }
      });

      // Normalizar buttonSlots si tenían IDs legados effect-
      const buttons = (parsed.buttons && parsed.buttons.length === 6) ? parsed.buttons : DEFAULT_BUTTONS;
      buttons.forEach(b => {
        if (b.materialId && b.materialId.startsWith('effect-')) {
          b.materialId = b.materialId.replace('effect-', 'shader-');
        }
      });

      // Cargar uniforms guardados desde shader_params.json
      const paramsFile = path.join(DATA_DIR, 'shader_params.json');
      let allParams = {};
      if (fs.existsSync(paramsFile)) {
        try {
          allParams = JSON.parse(fs.readFileSync(paramsFile, 'utf8'));
        } catch (e) {}
      }

      Object.values(byId).forEach(m => {
        if (m.type === 'shader' || m.type === 'effect') {
          const cleanName = (m.effect || m.shader || m.id.replace(/^(effect|shader)-/, '')).toLowerCase();
          const saved = allParams[m.id] || allParams['shader-' + cleanName] || allParams[cleanName];
          if (saved && typeof saved === 'object') {
            m.savedUniforms = Object.assign({}, m.savedUniforms || {}, saved);
            if (Array.isArray(m.uniforms)) {
              m.uniforms.forEach(u => {
                if (saved[u.name] !== undefined) {
                  u.default = saved[u.name];
                  u.value = saved[u.name];
                }
              });
            }
          }
        }
      });

      library = {
        materials: Object.values(byId),
        buttons: buttons
      };
    } else {
      library = defaultLibrary();
      saveLibrary();
    }
  } catch (err) {
    console.error('[MATERIALES] Error cargando biblioteca:', err.message);
    library = defaultLibrary();
  }
  return library;
}

let _presetRestoring = false;   // true mientras se RESTAURA un preset (no re-sincronizar)

function saveLibrary() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(MATERIALS_FILE, JSON.stringify(library, null, 2), 'utf8');
    console.log('[MATERIALES] Biblioteca guardada en ' + MATERIALS_FILE);
  } catch (err) {
    console.error('[MATERIALES] Error guardando biblioteca:', err.message);
  }
  // Lo que se guarda en la BOTONERA (y en INPUTS) va al PRESET cargado.
  if (!_presetRestoring) syncActivePreset('botonera');
}

function makeId(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

// --- UPLOAD DE ARCHIVOS (imágenes, videos y shaders .frag) ---

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.frag') {
      cb(null, SHADERS_DIR);
    } else {
      cb(null, UPLOADS_DIR);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.frag') {
      const safeName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
      cb(null, `${safeName}.frag`);
    } else {
      cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
    }
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const img = /image\/(jpe?g|png|gif|webp|bmp)/;
    const vid = /video\/(mp4|webm|ogg|mov|quicktime)/;

    if (ext === '.frag') {
      file.materialType = 'shader';
      return cb(null, true);
    }
    if (img.test(file.mimetype)) {
      file.materialType = 'image';
      return cb(null, true);
    }
    if (vid.test(file.mimetype)) {
      file.materialType = 'video';
      return cb(null, true);
    }
    cb(new Error('Tipo de archivo no permitido. Subí imágenes (jpg/png/gif/webp), videos (mp4/webm/ogg/mov) o shaders (.frag).'));
  }
});

// --- UPLOAD DE MODELOS 3D (OBJ / GLB / GLTF + MTL y texturas de acompañamiento) ---
// Límite: 120 MB por archivo. Se preserva el nombre original para que las
// referencias relativas (ej. un .obj que apunta a su .mtl / textura) sigan resolviendo.
const MODEL_EXT_OK = ['.obj', '.glb', '.gltf', '.mtl', '.bin', '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'];
const MODELS_MAX_BYTES = 120 * 1024 * 1024;

const modelStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MODELS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .slice(0, 80) || 'modelo';
    let finalName = base + ext;
    // Evitar sobrescribir: si ya existe, agregar sufijo numérico
    let i = 1;
    while (fs.existsSync(path.join(MODELS_DIR, finalName))) {
      finalName = `${base}_${i}${ext}`;
      i++;
    }
    cb(null, finalName);
  }
});

const uploadModel = multer({
  storage: modelStorage,
  limits: { fileSize: MODELS_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (MODEL_EXT_OK.includes(ext)) return cb(null, true);
    cb(new Error('Formato no soportado. Subí modelos .obj / .glb / .gltf (y opcionalmente .mtl / texturas).'));
  }
});

// --- API: POST /api/models (subir modelo 3D, hasta 120 MB) ---
app.post([BASE_PATH + '/api/models', '/api/models'], (req, res) => {
  uploadModel.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'El archivo supera el límite de 120 MB.'
        : err.message;
      console.error('[MODELS] Error de subida:', msg);
      return res.status(400).json({ ok: false, error: msg });
    }
    if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió ningún archivo' });

    const url = BASE_PATH + '/uploads/models/' + encodeURIComponent(req.file.filename);
    const sizeMB = (req.file.size / (1024 * 1024)).toFixed(2);
    console.log(`[MODELS] Subido ${req.file.filename} (${sizeMB} MB)`);
    res.json({
      ok: true,
      model: {
        name: path.basename(req.file.filename, path.extname(req.file.filename)),
        fileName: req.file.filename,
        src: url,
        ext: path.extname(req.file.filename).toLowerCase(),
        size: req.file.size
      }
    });
  });
});

// --- API: GET /api/models (listar modelos 3D disponibles) ---
app.get([BASE_PATH + '/api/models', '/api/models'], (req, res) => {
  try {
    const files = fs.readdirSync(MODELS_DIR)
      .filter(f => ['.obj', '.glb', '.gltf'].includes(path.extname(f).toLowerCase()))
      .map(f => {
        const st = fs.statSync(path.join(MODELS_DIR, f));
        return {
          name: path.basename(f, path.extname(f)),
          fileName: f,
          src: BASE_PATH + '/uploads/models/' + encodeURIComponent(f),
          ext: path.extname(f).toLowerCase(),
          size: st.size,
          mtime: st.mtimeMs
        };
      })
      .sort((a, b) => b.mtime - a.mtime);
    res.json({ ok: true, models: files });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- API: GET /api/materials ---
const handleGetMaterials = (req, res) => {
  loadLibrary();
  const shaders = scanShaderFiles();
  const paramsFile = path.join(DATA_DIR, 'shader_params.json');
  let shaderParams = {};
  if (fs.existsSync(paramsFile)) {
    try {
      shaderParams = JSON.parse(fs.readFileSync(paramsFile, 'utf8'));
    } catch (e) {}
  }
  res.json({
    effects: shaders.map(s => ({ id: s.name, label: s.name })),
    materials: library.materials,
    buttons: library.buttons,
    shaderParams: shaderParams
  });
};
app.get(BASE_PATH + '/api/materials', handleGetMaterials);
app.get('/api/materials', handleGetMaterials);

// --- API: POST /api/materials (JSON: efecto, URL de imagen, YouTube, etc.) ---
app.post(BASE_PATH + '/api/materials', (req, res) => {
  const { type, name, effect, videoId, url } = req.body || {};
  loadLibrary();

  const cleanName = (name || '').toString().trim();
  if (!cleanName) return res.status(400).json({ error: 'Falta el nombre del material' });

  let material;
  if (type === 'effect' || type === 'shader') {
    const shaders = scanShaderFiles();
    const fx = shaders.find(e => e.name === effect || e.id === effect || e.id === 'shader-' + effect);
    if (!fx) return res.status(400).json({ error: 'Shader desconocido: ' + effect });
    material = {
      id: makeId('shader'),
      type: 'shader',
      name: cleanName,
      effect: fx.name,
      shader: fx.name,
      builtin: false,
      src: fx.src,
      videoId: null,
      uniforms: fx.uniforms,
      createdAt: new Date().toISOString()
    };
  } else if (type === 'jpshader') {
    // Shader de jpShadereditor: NO se copia el GLSL, se guarda la referencia
    // (el motor lo pide como plan al editor). La miniatura viene del editor.
    const nombreEditor = ((req.body && (req.body.shader || req.body.effect)) || '').toString().trim();
    if (!nombreEditor) return res.status(400).json({ error: 'Falta el nombre del shader de jpShadereditor' });
    const thumb = ((req.body && req.body.thumb) || '').toString().trim() || null;
    material = {
      id: 'jpshader-' + nombreEditor.toLowerCase().replace(/[^a-z0-9_-]/g, '_'),
      type: 'jpshader',
      name: cleanName || nombreEditor,
      effect: nombreEditor,
      shader: nombreEditor,
      editor: 'jpshader',
      thumb: thumb,
      src: thumb,
      builtin: false,
      videoId: null,
      uniforms: [],
      createdAt: new Date().toISOString()
    };
    const yaEsta = library.materials.findIndex(m => m.id === material.id);
    if (yaEsta >= 0) {
      const previo = library.materials[yaEsta];
      material.createdAt = previo.createdAt;
      library.materials[yaEsta] = material;
      // mantener la asignación de botones que ya lo usaba
      library.buttons.forEach(b => { if (b.materialId === previo.id) b.materialId = material.id; });
      saveLibrary();
      return res.json({ ok: true, material, existed: true });
    }
  } else if (type === 'image') {
    if (!url) return res.status(400).json({ error: 'Falta la URL de la imagen' });
    material = {
      id: makeId('mat'),
      type: 'image',
      name: cleanName,
      effect: null,
      builtin: false,
      src: url,
      videoId: null,
      createdAt: new Date().toISOString()
    };
  } else if (type === 'youtube') {
    if (!videoId) return res.status(400).json({ error: 'Falta el ID de YouTube' });
    material = {
      id: makeId('mat'),
      type: 'youtube',
      name: cleanName,
      effect: null,
      builtin: false,
      src: null,
      videoId: videoId,
      createdAt: new Date().toISOString()
    };
  } else if (type === 'video') {
    if (!url) return res.status(400).json({ error: 'Falta la URL del video' });
    material = {
      id: makeId('mat'),
      type: 'video',
      name: cleanName,
      effect: null,
      builtin: false,
      src: url,
      videoId: null,
      createdAt: new Date().toISOString()
    };
  } else if (type === 'web') {
    if (!url) return res.status(400).json({ error: 'Falta la URL de la página web' });
    let normalized = String(url).trim();
    if (!/^https?:\/\//i.test(normalized)) normalized = 'https://' + normalized;
    material = {
      id: makeId('mat'),
      type: 'web',
      name: cleanName,
      effect: null,
      builtin: false,
      src: normalized,
      videoId: null,
      createdAt: new Date().toISOString()
    };
  } else {
    return res.status(400).json({ error: 'Tipo de material inválido: ' + type });
  }

  library.materials.push(material);
  saveLibrary();
  res.json({ ok: true, material });
});

// --- API: GET /api/shaders (listar todos los shaders disponibles con sus uniforms) ---
const handleGetShaders = (req, res) => {
  const shaders = scanShaderFiles();
  res.json({ ok: true, shaders });
};
app.get(BASE_PATH + '/api/shaders', handleGetShaders);
app.get('/api/shaders', handleGetShaders);

// --- API: GET /api/jpshaders (índice COMPLETO de jpShadereditor) ---
// Proxy + cache: el front (FTP) pide acá y este server consulta el backend del
// editor. Así el índice no depende del CORS del editor y se cachea 5 minutos.
const JPSE_API = process.env.JPSE_API || 'https://vps-4455523-x.dattaweb.com/jpshadereditor/api';
let jpShadersCache = { at: 0, data: null };

const handleGetJpShaders = async (req, res) => {
  const TTL = 5 * 60 * 1000;
  const refresh = String(req.query.refresh || '') === '1';
  if (!refresh && jpShadersCache.data && (Date.now() - jpShadersCache.at) < TTL) {
    return res.json({ ok: true, total: jpShadersCache.data.length, cached: true, shaders: jpShadersCache.data });
  }
  try {
    const r = await fetch(JPSE_API + '/shaders');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const raw = await r.json();
    const arr = Array.isArray(raw) ? raw : (raw && raw.shaders) || [];
    const shaders = arr.map(s => ({
      nombre: s.nombre || s.name || '',
      autor: s.autor || s.author || '',
      fecha: s.fechaActualizacion || s.fecha || null,
      thumb: s.imagePath || s.thumb || null,
      compiles: s.compiles !== false
    })).filter(s => s.nombre);
    jpShadersCache = { at: Date.now(), data: shaders };
    console.log(`[JPSHADERS] Índice actualizado: ${shaders.length} shaders`);
    res.json({ ok: true, total: shaders.length, cached: false, shaders });
  } catch (err) {
    console.error('[JPSHADERS] Error consultando el editor:', err.message);
    if (jpShadersCache.data) {
      return res.json({ ok: true, total: jpShadersCache.data.length, stale: true, shaders: jpShadersCache.data });
    }
    res.status(502).json({ ok: false, error: 'No se pudo leer el índice de jpShadereditor: ' + err.message });
  }
};
app.get(BASE_PATH + '/api/jpshaders', handleGetJpShaders);
app.get('/api/jpshaders', handleGetJpShaders);

// --- API: GET /api/webproxy?url= (levantar una web para MOSTRARLA en vivo en el 3D) ---
// Qué hace: trae la página del lado del server y la sirve desde este origen.
//   · le inyecta <base href="<url real>"> para que sus assets relativos sigan resolviendo
//   · le inyecta el motor de toques (js/web-touch-bridge.js) para poder mandarle
//     los clicks del raycast cuando el padre no puede tocar su document
//   · al quedar servida desde el MISMO origen de la app, el iframe del 3D puede
//     despachar eventos reales dentro de la página (click que maneja la web)
// También resuelve los dos bloqueos clásicos: X-Frame-Options y mixed content
// (https → http://localhost de un server de desarrollo).
const WEB_TOUCH_BRIDGE = `
(function(){
  if (window.__JPSTAGE_WEB_BRIDGE__) return;
  window.__JPSTAGE_WEB_BRIDGE__ = 1;
  window.__JPSTAGE_TOUCHES__ = [];
  function fire(x, y, kind) {
    var t = document.elementFromPoint(x, y) || document.body;
    if (!t) return;
    var base = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, view: window, button: 0, buttons: kind === 'up' ? 0 : 1 };
    var seq = kind === 'down' ? ['pointerdown', 'mousedown']
      : kind === 'up' ? ['pointerup', 'mouseup', 'click']
      : ['pointermove', 'mousemove'];
    seq.forEach(function (n) {
      var E = (n.indexOf('pointer') === 0 && window.PointerEvent) ? PointerEvent : MouseEvent;
      try { t.dispatchEvent(new E(n, base)); } catch (e) {}
    });
    window.__JPSTAGE_TOUCHES__.push({ x: x, y: y, kind: kind, at: Date.now() });
    if (window.__JPSTAGE_TOUCHES__.length > 200) window.__JPSTAGE_TOUCHES__.shift();
  }
  window.addEventListener('message', function (ev) {
    var d = ev.data || {};
    if (!d || d.type !== 'jpstage-web-touch') return;
    fire(Number(d.x) || 0, Number(d.y) || 0, d.kind || 'down');
  });
})();`;

const handleWebProxy = async (req, res) => {
  const raw = String(req.query.url || '').trim();
  if (!raw) return res.status(400).json({ ok: false, error: 'falta ?url=' });
  let target;
  try {
    target = new URL(/^https?:\/\//i.test(raw) ? raw : ('https://' + raw));
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'URL inválida' });
  }
  if (!/^https?:$/.test(target.protocol)) {
    return res.status(400).json({ ok: false, error: 'sólo http/https' });
  }
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 12000);
    const r = await fetch(target.href, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (JPStageDesign webproxy)', 'Accept': 'text/html,application/xhtml+xml,*/*' }
    });
    clearTimeout(timer);
    const ct = String(r.headers.get('content-type') || '');
    if (!/text\/html/i.test(ct)) {
      // No es HTML (imagen, PDF, video…): que el iframe lo cargue directo.
      return res.redirect(302, target.href);
    }
    let html = await r.text();
    // La base va con la URL FINAL (después de redirects), no con la pedida.
    const baseHref = String(r.url || target.href);
    if (!/<base\s/i.test(html)) {
      const baseTag = '<base href="' + baseHref.replace(/"/g, '&quot;') + '">';
      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head[^>]*>/i, m => m + baseTag);
      } else if (/<html[^>]*>/i.test(html)) {
        // Página sin <head> (minificada / rota): se le arma uno para que los
        // assets relativos sigan apuntando al sitio original.
        html = html.replace(/<html[^>]*>/i, m => m + '<head>' + baseTag + '</head>');
      } else {
        html = baseTag + html;
      }
    }
    const bridgeTag = '<script>' + WEB_TOUCH_BRIDGE + '<' + '/script>';
    if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, bridgeTag + '</body>');
    else html += bridgeTag;
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.set('Access-Control-Allow-Origin', '*');
    console.log('[WEBPROXY]', target.href, '->', html.length, 'bytes');
    res.send(html);
  } catch (err) {
    console.error('[WEBPROXY] Error:', target.href, err.message);
    res.status(502).send('<!doctype html><meta charset="utf-8"><body style="font:14px system-ui;background:#0b0d13;color:#ff6b6b;padding:24px">'
      + '<b>No se pudo levantar la web</b><br>' + String(target.href).replace(/</g, '&lt;') + '<br><br>'
      + String(err.message).replace(/</g, '&lt;') + '</body>');
  }
};
app.get(BASE_PATH + '/api/webproxy', handleWebProxy);
app.get('/api/webproxy', handleWebProxy);

// --- API: POST /api/materials/upload (archivo imagen, video o shader .frag) ---
app.post(BASE_PATH + '/api/materials/upload', upload.single('file'), (req, res) => {
  loadLibrary();
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

  const type = req.file.materialType;
  let material;

  if (type === 'shader') {
    const cleanName = path.basename(req.file.originalname, '.frag').toLowerCase();
    const filePath = path.join(SHADERS_DIR, req.file.filename);
    let uniforms = [];
    try {
      const code = fs.readFileSync(filePath, 'utf8');
      uniforms = parseUniformsFromGLSL(code);
    } catch(e) {}

    const fileUrl = BASE_PATH + '/shaders/' + req.file.filename;
    material = {
      id: 'shader-' + cleanName,
      type: 'shader',
      name: cleanName, // Nombre exacto del archivo
      effect: cleanName,
      shader: cleanName,
      builtin: false,
      src: fileUrl,
      videoId: null,
      fileName: req.file.filename,
      uniforms: uniforms,
      createdAt: new Date().toISOString()
    };

    // Reemplazar si ya existía o agregar nuevo
    const existingIdx = library.materials.findIndex(m => m.id === material.id);
    if (existingIdx >= 0) {
      library.materials[existingIdx] = material;
    } else {
      library.materials.push(material);
    }
  } else {
    const cleanName = (req.body.name || '').toString().trim() || path.basename(req.file.originalname, path.extname(req.file.originalname));
    const fileUrl = BASE_PATH + '/uploads/' + req.file.filename;
    material = {
      id: makeId('mat'),
      type: type === 'video' ? 'video' : 'image',
      name: cleanName,
      effect: null,
      builtin: false,
      src: fileUrl,
      videoId: null,
      fileName: req.file.filename,
      createdAt: new Date().toISOString()
    };
    library.materials.push(material);
  }

  saveLibrary();
  res.json({ ok: true, material });
});

// --- API: DELETE /api/materials/:id ---
app.delete(BASE_PATH + '/api/materials/:id', (req, res) => {
  loadLibrary();
  const idx = library.materials.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Material no encontrado' });

  const material = library.materials[idx];
  // No permitir borrar los efectos integrados
  if (material.builtin) return res.status(400).json({ error: 'Los efectos integrados no se pueden eliminar' });

  // Eliminar el archivo subido si existe
  if (material.fileName) {
    const targetDir = material.type === 'shader' ? SHADERS_DIR : UPLOADS_DIR;
    const filePath = path.join(targetDir, material.fileName);
    fs.unlink(filePath, () => {});
  }

  library.materials.splice(idx, 1);

  // Desasignar de los botones
  library.buttons.forEach(b => {
    if (b.materialId === material.id) b.materialId = null;
  });

  saveLibrary();
  res.json({ ok: true });
});

// --- API: POST /api/buttons (asignación de los 6 botones) ---
app.post(BASE_PATH + '/api/buttons', (req, res) => {
  loadLibrary();
  const buttons = req.body && req.body.buttons;
  if (!Array.isArray(buttons) || buttons.length !== 6) {
    return res.status(400).json({ error: 'Se esperaban exactamente 6 botones' });
  }

  const ids = new Set(library.materials.map(m => m.id));
  for (const b of buttons) {
    if (!b || typeof b.slot !== 'number' || (b.materialId !== null && !ids.has(b.materialId))) {
      return res.status(400).json({ error: 'Asignación inválida en el slot ' + (b && b.slot) });
    }
  }

  library.buttons = buttons
    .sort((a, b) => a.slot - b.slot)
    .map(b => ({ slot: b.slot, materialId: b.materialId, label: (b.label || '').toString().trim() || null }));
  saveLibrary();
  res.json({ ok: true, buttons: library.buttons });
});

// --- API: POST /api/shader-params (guardar uniforms de un shader) ---
const handlePostShaderParams = (req, res) => {
  try {
    const { shaderId, uniforms } = req.body;
    if (!shaderId || !uniforms) {
      return res.status(400).json({ error: 'Se requieren shaderId y uniforms' });
    }
    const paramsFile = path.join(DATA_DIR, 'shader_params.json');
    let allParams = {};
    if (fs.existsSync(paramsFile)) {
      try {
        allParams = JSON.parse(fs.readFileSync(paramsFile, 'utf8'));
      } catch (e) {}
    }

    const cleanName = shaderId.replace(/^(shader|effect)-/, '').toLowerCase();
    allParams[shaderId] = uniforms;
    allParams[cleanName] = uniforms;
    allParams['shader-' + cleanName] = uniforms;

    fs.writeFileSync(paramsFile, JSON.stringify(allParams, null, 2), 'utf8');

    // Actualizar biblioteca de materiales en memoria y en data/materials.json
    loadLibrary();
    const targetMat = library.materials.find(m => 
      m.id === shaderId || 
      m.id === 'shader-' + cleanName || 
      (m.name && m.name.toLowerCase() === cleanName) ||
      (m.shader && m.shader.toLowerCase() === cleanName) ||
      (m.effect && m.effect.toLowerCase() === cleanName)
    );
    if (targetMat) {
      targetMat.savedUniforms = Object.assign({}, targetMat.savedUniforms || {}, uniforms);
      if (Array.isArray(targetMat.uniforms)) {
        targetMat.uniforms.forEach(u => {
          if (uniforms[u.name] !== undefined) {
            u.default = uniforms[u.name];
            u.value = uniforms[u.name];
          }
        });
      }
      saveLibrary();
    }

    // Si la escena activa corresponde a este shader, actualizar sus uniforms en tiempo real
    if (currentScene) {
      const activeClean = (currentScene.effect || currentScene.name || currentScene.shader || '').toLowerCase();
      if (!activeClean || activeClean === cleanName) {
        if (!currentScene.uniforms) currentScene.uniforms = {};
        Object.assign(currentScene.uniforms, uniforms);
      }
    }

    // Notificar a todos los outputs y clientes conectados vía WebSocket
    emitSiCambio('shaderUniformsChanged', {
      shader: cleanName,
      uniforms: uniforms
    });

    console.log(`[SHADER PARAMS] Guardados uniforms para ${shaderId} (${cleanName}):`, uniforms);
    res.json({ ok: true, uniforms });
  } catch (err) {
    console.error('[SHADER PARAMS] Error guardando:', err.message);
    res.status(500).json({ error: err.message });
  }
};

app.post(BASE_PATH + '/api/shader-params', handlePostShaderParams);
app.post('/api/shader-params', handlePostShaderParams);

// --- API: GET /api/shader-params/:shaderId (cargar uniforms guardados) ---
const handleGetShaderParams = (req, res) => {
  try {
    const paramsFile = path.join(DATA_DIR, 'shader_params.json');
    if (!fs.existsSync(paramsFile)) {
      return res.json({ ok: false, uniforms: null });
    }
    const allParams = JSON.parse(fs.readFileSync(paramsFile, 'utf8'));
    const id = req.params.shaderId;
    const cleanName = id.replace(/^(shader|effect)-/, '').toLowerCase();
    const uniforms = allParams[id] || allParams[cleanName] || allParams['shader-' + cleanName] || null;
    res.json({ ok: true, uniforms });
  } catch (err) {
    console.error('[SHADER PARAMS] Error cargando:', err.message);
    res.status(500).json({ error: err.message });
  }
};

app.get(BASE_PATH + '/api/shader-params/:shaderId', handleGetShaderParams);
app.get('/api/shader-params/:shaderId', handleGetShaderParams);

// --- API: GET /api/status (salud del servidor) ---
app.get(BASE_PATH + '/api/status', (req, res) => {
  res.json({ ok: true, materials: loadLibrary().materials.length });
});

// ============================================================
// CONFIGURACIÓN DE SETTINGS & LOGO PERSONALIZADO (data/settings.json)
// ============================================================
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

function getSettings() {
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    } catch (e) {
      console.error('[SETTINGS] Error leyendo settings:', e.message);
    }
  }
  return { customLogoUrl: null };
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (e) {
    console.error('[SETTINGS] Error guardando settings:', e.message);
  }
}

// Multer storage para logo
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `custom-logo-${Date.now()}${ext}`);
  }
});

const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype.includes('image') || ext === '.svg' || ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp') {
      return cb(null, true);
    }
    cb(new Error('Tipo de archivo no permitido para el logo. Debe ser PNG, SVG, JPG o WebP.'));
  }
});

// GET /api/logo
const handleGetLogo = (req, res) => {
  const settings = getSettings();
  const defaultLogo = BASE_PATH + '/img/logo.svg';
  res.json({
    ok: true,
    logoUrl: settings.customLogoUrl || defaultLogo,
    isCustom: !!settings.customLogoUrl
  });
};

app.get(BASE_PATH + '/api/logo', handleGetLogo);
app.get('/api/logo', handleGetLogo);

// POST /api/logo (subir logo personalizado)
const handlePostLogo = (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se subió ningún archivo' });
  }
  const fileUrl = BASE_PATH + '/uploads/' + req.file.filename;
  const settings = getSettings();
  settings.customLogoUrl = fileUrl;
  settings.updatedAt = new Date().toISOString();
  saveSettings(settings);

  console.log('[LOGO] Nuevo logo personalizado subido:', fileUrl);
  emitSiCambio('logoChanged', { logoUrl: fileUrl, isCustom: true });

  res.json({ ok: true, logoUrl: fileUrl });
};

app.post(BASE_PATH + '/api/logo', uploadLogo.single('logo'), handlePostLogo);
app.post('/api/logo', uploadLogo.single('logo'), handlePostLogo);

// DELETE /api/logo (restaurar logo por defecto)
const handleDeleteLogo = (req, res) => {
  const settings = getSettings();
  settings.customLogoUrl = null;
  settings.updatedAt = new Date().toISOString();
  saveSettings(settings);

  const defaultLogo = BASE_PATH + '/img/logo.svg';
  console.log('[LOGO] Logo restaurado al valor por defecto');
  emitSiCambio('logoChanged', { logoUrl: defaultLogo, isCustom: false });

  res.json({ ok: true, logoUrl: defaultLogo, message: 'Logo por defecto restaurado' });
};

app.delete(BASE_PATH + '/api/logo', handleDeleteLogo);
app.delete('/api/logo', handleDeleteLogo);

// ============================================================
// CONFIGURACIÓN 3D & PROYECTORES (data/room3d_config.json)
// ============================================================
const ROOM3D_CONFIG_FILE = path.join(DATA_DIR, 'room3d_config.json');

function getRoom3DConfig() {
  if (fs.existsSync(ROOM3D_CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(ROOM3D_CONFIG_FILE, 'utf8'));
    } catch (e) {
      console.error('[ROOM3D] Error leyendo config:', e.message);
    }
  }
  return null;
}

const handleGetRoom3DConfig = (req, res) => {
  const config = getRoom3DConfig();
  if (config) {
    res.json({ ok: true, config });
  } else {
    res.json({ ok: false, message: 'Sin configuración guardada' });
  }
};

const writeRoom3DConfig = (config) => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(ROOM3D_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  console.log('[ROOM3D] Configuración guardada en ' + ROOM3D_CONFIG_FILE);
  return config;
};

const handlePostRoom3DConfig = (req, res) => {
  try {
    const config = req.body;
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'Configuración inválida' });
    }
    writeRoom3DConfig(config);
    if (!_presetRestoring) syncActivePreset('output3d');
    res.json({ ok: true, message: 'Configuración guardada exitosamente', preset: activePresetSummary() });
  } catch (err) {
    console.error('[ROOM3D] Error guardando config:', err.message);
    res.status(500).json({ error: err.message });
  }
};

app.get(BASE_PATH + '/api/room3d-config', handleGetRoom3DConfig);
app.get('/api/room3d-config', handleGetRoom3DConfig);
app.post(BASE_PATH + '/api/room3d-config', handlePostRoom3DConfig);
app.post('/api/room3d-config', handlePostRoom3DConfig);

// ============================================================
// PRESETS — un seteo = BOTONERA (inputs + botones) + OUTPUT 3D (sala)
// ------------------------------------------------------------
// data/presets.json:  { activeId, presets: [{ id, name, author, createdAt,
//                       updatedAt, library, room3d, shaderParams }] }
// El preset ACTIVO es el estado vivo: cualquier guardado desde la botonera o
// desde el simulador 3D se espeja acá (syncActivePreset). Cargar un preset
// escribe materials.json + room3d_config.json y avisa por socket.
// ============================================================
const PRESETS_FILE = path.join(DATA_DIR, 'presets.json');
const SHADER_PARAMS_FILE = path.join(DATA_DIR, 'shader_params.json');

function loadPresetsStore() {
  try {
    if (fs.existsSync(PRESETS_FILE)) {
      const d = JSON.parse(fs.readFileSync(PRESETS_FILE, 'utf8'));
      return { activeId: d.activeId || null, presets: Array.isArray(d.presets) ? d.presets : [] };
    }
  } catch (e) {
    console.error('[PRESETS] Error leyendo presets:', e.message);
  }
  return { activeId: null, presets: [] };
}

function savePresetsStore(store) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(PRESETS_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (e) {
    console.error('[PRESETS] Error guardando presets:', e.message);
  }
}

function readShaderParams() {
  try {
    if (fs.existsSync(SHADER_PARAMS_FILE)) return JSON.parse(fs.readFileSync(SHADER_PARAMS_FILE, 'utf8'));
  } catch (e) { /* noop */ }
  return {};
}

function presetSnapshot() {
  loadLibrary();
  return {
    library: { materials: library.materials, buttons: library.buttons },
    room3d: getRoom3DConfig(),
    shaderParams: readShaderParams()
  };
}

function presetSummary(p) {
  if (!p) return null;
  const mats = (p.library && p.library.materials) || [];
  if (!library) loadLibrary();
  const nameOf = (id) => {
    const m = (library.materials || []).find(x => x.id === id);
    return m ? m.name : null;
  };
  const buttons = ((p.library && p.library.buttons) || []).map(b => ({
    slot: b.slot, materialId: b.materialId, label: b.label || (b.materialId ? nameOf(b.materialId) : null)
  }));
  return {
    screens: ((p.room3d && p.room3d.screens) || []).length,
    projectors: ((p.room3d && p.room3d.projectors) || []).length,
    materials: mats.length,
    buttons: buttons,
    botonesAsignados: buttons.filter(b => b.materialId).length,
    mappingMode: (p.room3d && p.room3d.mappingMode) || 'duplicated'
  };
}

function presetPublic(p) {
  return {
    id: p.id, name: p.name, author: p.author || null,
    createdAt: p.createdAt, updatedAt: p.updatedAt,
    summary: presetSummary(p)
  };
}

function activePreset() {
  const store = loadPresetsStore();
  if (!store.activeId) return null;
  return store.presets.find(p => p.id === store.activeId) || null;
}

function activePresetSummary() {
  const p = activePreset();
  return p ? presetPublic(p) : null;
}

/** Copia el estado VIVO dentro del preset activo (lo llaman los guardados). */
function syncActivePreset(reason) {
  const store = loadPresetsStore();
  if (!store.activeId) return null;
  const idx = store.presets.findIndex(p => p.id === store.activeId);
  if (idx < 0) return null;
  const snap = presetSnapshot();
  store.presets[idx] = Object.assign({}, store.presets[idx], snap, { updatedAt: new Date().toISOString() });
  savePresetsStore(store);
  console.log(`[PRESETS] "${store.presets[idx].name}" actualizado (${reason})`);
  return store.presets[idx];
}

function presetSlug(name) {
  return String(name || '')
    .trim().toLowerCase()
    .replace(/[áàäâã]/g, 'a').replace(/[éèëê]/g, 'e').replace(/[íìïî]/g, 'i')
    .replace(/[óòöô]/g, 'o').replace(/[úùüû]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'preset';
}

// --- GET /api/presets : lista + cuál está cargado
const handleGetPresets = (req, res) => {
  const store = loadPresetsStore();
  res.json({
    ok: true,
    activeId: store.activeId,
    active: activePresetSummary(),
    presets: store.presets
      .slice()
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      .map(presetPublic)
  });
};
app.get(BASE_PATH + '/api/presets', handleGetPresets);
app.get('/api/presets', handleGetPresets);

// --- POST /api/presets : guarda el estado vivo COMO preset (crea o pisa)
const handlePostPreset = (req, res) => {
  const name = String((req.body && req.body.name) || '').trim();
  const id = (req.body && req.body.id) ? String(req.body.id) : null;
  if (!name) return res.status(400).json({ error: 'Falta el nombre del preset' });
  if (!library) loadLibrary();

  const store = loadPresetsStore();
  const snap = presetSnapshot();
  const ahora = new Date().toISOString();

  let preset = id ? store.presets.find(p => p.id === id) : null;
  if (preset) {
    Object.assign(preset, snap, { name: name, updatedAt: ahora });
  } else {
    preset = Object.assign({
      id: 'preset-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      name: name,
      author: (req.body && req.body.author) || null,
      createdAt: ahora,
      updatedAt: ahora
    }, snap);
    store.presets.push(preset);
  }
  store.activeId = preset.id;
  savePresetsStore(store);
  emitSiCambio('presetChanged', { activeId: preset.id, name: preset.name });
  console.log(`[PRESETS] Guardado "${preset.name}" (${preset.id}) · ${presetSummary(preset).materials} inputs`);
  res.json({ ok: true, preset: presetPublic(preset), activeId: preset.id });
};
app.post(BASE_PATH + '/api/presets', handlePostPreset);
app.post('/api/presets', handlePostPreset);

// --- POST /api/presets/active/sync : "guardar" sobre el preset cargado
const handleSyncActive = (req, res) => {
  const p = syncActivePreset('manual');
  if (!p) return res.status(400).json({ error: 'No hay un preset cargado' });
  emitSiCambio('presetChanged', { activeId: p.id, name: p.name });
  res.json({ ok: true, preset: presetPublic(p) });
};
app.post(BASE_PATH + '/api/presets/active/sync', handleSyncActive);
app.post('/api/presets/sync', handleSyncActive);

// --- POST /api/presets/:id/activate : carga un preset en vivo
const handleActivatePreset = (req, res) => {
  const store = loadPresetsStore();
  const preset = store.presets.find(p => p.id === req.params.id);
  if (!preset) return res.status(404).json({ error: 'Preset no encontrado' });

  _presetRestoring = true;
  try {
    // 1) biblioteca (inputs + botones)
    if (preset.library && Array.isArray(preset.library.materials)) {
      library = {
        materials: preset.library.materials,
        buttons: (preset.library.buttons && preset.library.buttons.length === 6)
          ? preset.library.buttons
          : library.buttons
      };
      fs.writeFileSync(MATERIALS_FILE, JSON.stringify(library, null, 2), 'utf8');
    }
    // 2) uniformes guardados
    if (preset.shaderParams && typeof preset.shaderParams === 'object') {
      fs.writeFileSync(SHADER_PARAMS_FILE, JSON.stringify(preset.shaderParams, null, 2), 'utf8');
    }
    // 3) sala / escena 3D
    if (preset.room3d && typeof preset.room3d === 'object') writeRoom3DConfig(preset.room3d);

    store.activeId = preset.id;
    savePresetsStore(store);
  } finally {
    _presetRestoring = false;
  }

  // 4) avisar a las pestañas abiertas (botonera + 3D) sin recargar
  emitSiCambio('libraryChanged', { materials: library.materials, buttons: library.buttons });
  io.emit('stageConfig', { config: preset.room3d, source: 'preset' });
  io.emit('presetChanged', { activeId: preset.id, name: preset.name, activated: true });
  console.log(`[PRESETS] Cargado "${preset.name}" (${preset.id})`);
  res.json({ ok: true, activeId: preset.id, preset: presetPublic(preset) });
};
app.post(BASE_PATH + '/api/presets/:id/activate', handleActivatePreset);

// --- PATCH /api/presets/:id : renombrar
const handleRenamePreset = (req, res) => {
  const store = loadPresetsStore();
  const preset = store.presets.find(p => p.id === req.params.id);
  if (!preset) return res.status(404).json({ error: 'Preset no encontrado' });
  const name = String((req.body && req.body.name) || '').trim();
  if (!name) return res.status(400).json({ error: 'Falta el nombre' });
  preset.name = name;
  preset.updatedAt = new Date().toISOString();
  savePresetsStore(store);
  emitSiCambio('presetChanged', { activeId: store.activeId, name: preset.name });
  res.json({ ok: true, preset: presetPublic(preset) });
};
app.patch(BASE_PATH + '/api/presets/:id', handleRenamePreset);

// --- DELETE /api/presets/:id
const handleDeletePreset = (req, res) => {
  const store = loadPresetsStore();
  const idx = store.presets.findIndex(p => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Preset no encontrado' });
  const [borrado] = store.presets.splice(idx, 1);
  if (store.activeId === borrado.id) store.activeId = null;
  savePresetsStore(store);
  emitSiCambio('presetChanged', { activeId: store.activeId, name: null });
  res.json({ ok: true, deleted: borrado.id });
};
app.delete(BASE_PATH + '/api/presets/:id', handleDeletePreset);

// --- GET /api/presets/:id/export : descarga BOTONERA y/o OUTPUT 3D
const handleExportPreset = (req, res) => {
  const store = loadPresetsStore();
  const preset = store.presets.find(p => p.id === req.params.id);
  if (!preset) return res.status(404).json({ error: 'Preset no encontrado' });
  const part = String(req.query.part || 'all');   // all | botonera | output3d
  const slug = presetSlug(preset.name);

  const payload = {
    app: 'jpstagedesign',
    tipo: part === 'all' ? 'preset-completo' : ('preset-' + part),
    version: 1,
    preset: { id: preset.id, nombre: preset.name, actualizadoEn: preset.updatedAt },
    exportadoEn: new Date().toISOString()
  };
  if (part !== 'output3d') {
    payload.botonera = {
      materiales: (preset.library && preset.library.materials) || [],
      botones: (preset.library && preset.library.buttons) || [],
      shaderParams: preset.shaderParams || {}
    };
  }
  if (part !== 'botonera') {
    payload.output3d = { sala: preset.room3d || null };
  }

  const sufijo = part === 'all' ? '' : '-' + part;
  const filename = `jpstagedesign-preset-${slug}${sufijo}.json`;
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="' + filename + '"');
  console.log(`[PRESETS] Export ${filename} (${part})`);
  res.send(JSON.stringify(payload, null, 2));
};
app.get(BASE_PATH + '/api/presets/:id/export', handleExportPreset);

// --- SHADER DE FONDO de la botonera (shader del editor elegido en INPUTS)
const handleGetBgShader = (req, res) => {
  const settings = getSettings();
  res.json({ ok: true, shader: settings.bgShader || null });
};
app.get(BASE_PATH + '/api/bg-shader', handleGetBgShader);
app.get(BASE_PATH + '/api/settings/background', handleGetBgShader);

const handlePostBgShader = (req, res) => {
  const raw = req.body && req.body.shader;
  const shader = (raw === null || raw === undefined || raw === '') ? null : String(raw);
  const settings = getSettings();
  settings.bgShader = shader;
  settings.updatedAt = new Date().toISOString();
  saveSettings(settings);
  emitSiCambio('bgShaderChanged', { shader: shader });
  console.log('[FONDO] Shader de fondo:', shader || '(por defecto shaderfondo.frag)');
  res.json({ ok: true, shader: shader });
};
app.post(BASE_PATH + '/api/bg-shader', handlePostBgShader);
app.post(BASE_PATH + '/api/settings/background', handlePostBgShader);

// ============================================================
// TEMPLATES DE ESCENARIO (guardar / cargar configuraciones con nombre)
// ============================================================
function templateSlug(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[áàäâã]/g, 'a').replace(/[éèëê]/g, 'e').replace(/[íìïî]/g, 'i')
    .replace(/[óòöô]/g, 'o').replace(/[úùüû]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'template';
}

function listTemplates() {
  try {
    return fs.readdirSync(TEMPLATES_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const st = fs.statSync(path.join(TEMPLATES_DIR, f));
        let meta = {};
        try { meta = JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, f), 'utf8')); } catch (e) {}
        return {
          slug: path.basename(f, '.json'),
          owner: meta.owner || '',
          name: meta.name || path.basename(f, '.json'),
          savedAt: meta.savedAt || st.mtime.toISOString(),
          screens: (meta.config && meta.config.screens) ? meta.config.screens.length : 0,
          projectors: (meta.config && meta.config.projectors) ? meta.config.projectors.length : 0,
          furniture: (meta.config && meta.config.furniture) ? meta.config.furniture.length : 0
        };
      })
      .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  } catch (e) {
    return [];
  }
}

// GET /api/templates -> listar templates
app.get([BASE_PATH + '/api/templates', '/api/templates'], (req, res) => {
  res.json({ ok: true, templates: listTemplates() });
});

// POST /api/templates { name, config } -> guardar template
app.post([BASE_PATH + '/api/templates', '/api/templates'], (req, res) => {
  try {
    const { name, config } = req.body || {};
    const cleanName = String(name || '').trim();
    if (!cleanName) return res.status(400).json({ ok: false, error: 'Falta el nombre del template' });
    if (!config || typeof config !== 'object') return res.status(400).json({ ok: false, error: 'Configuración inválida' });

    fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
    const slug = templateSlug(cleanName);
    const file = path.join(TEMPLATES_DIR, slug + '.json');
    const owner = String((req.body && req.body.owner) || '').trim();
    const payload = { name: cleanName, slug, savedAt: new Date().toISOString(), owner, config };
    fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`[TEMPLATES] Guardado "${cleanName}" (${slug}.json)`);
    res.json({ ok: true, slug, name: cleanName, templates: listTemplates() });
  } catch (err) {
    console.error('[TEMPLATES] Error guardando:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/templates/:slug -> obtener template completo
app.get([BASE_PATH + '/api/templates/:slug', '/api/templates/:slug'], (req, res) => {
  try {
    const slug = templateSlug(req.params.slug);
    const file = path.join(TEMPLATES_DIR, slug + '.json');
    if (!fs.existsSync(file)) return res.status(404).json({ ok: false, error: 'Template no encontrado' });
    const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
    res.json({ ok: true, name: payload.name, slug, savedAt: payload.savedAt, config: payload.config });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/templates/:slug -> eliminar template
app.delete([BASE_PATH + '/api/templates/:slug', '/api/templates/:slug'], (req, res) => {
  try {
    const slug = templateSlug(req.params.slug);
    const file = path.join(TEMPLATES_DIR, slug + '.json');
    if (!fs.existsSync(file)) return res.status(404).json({ ok: false, error: 'Template no encontrado' });
    fs.unlinkSync(file);
    console.log(`[TEMPLATES] Eliminado "${slug}"`);
    res.json({ ok: true, templates: listTemplates() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// 🗂️ FSC — índice universal de assets (lo llama el perfil de fscauth)
// GET /jpstagedesign/api/fsc/assets?username=X
// Los escenarios guardados SIGUEN viviendo acá (data/templates/*.json,
// arquitectura bicompartida): fscauth solo los INDEXA para el pasaporte.
// Los templates son del estudio (compartidos) y cada uno tiene su link público
// de preset: output3d.html?preset=<slug>.
// ============================================================
async function fscAssetsAuthorized(req, username) {
  const internal = process.env.FSC_INTERNAL_KEY || process.env.JWT_SECRET || '';
  const key = req.headers['x-fsc-internal'];
  if (internal && key && key === internal) return true;
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return false;
  try {
    const r = await fetch(FSCAUTH_API + '/api/auth/verify', { headers: { Authorization: 'Bearer ' + token } });
    const d = await r.json();
    if (!d || d.loggedIn !== true || !d.user) return false;
    if (String(d.user.username || '').toLowerCase() === String(username || '').toLowerCase()) return true;
    return d.user.role === 'ADMIN' || d.user.role === 'SYSTEM';
  } catch (err) {
    console.error('[FSC-ASSETS] no se pudo validar contra fscauth:', err.message);
    return false;
  }
}

app.get([BASE_PATH + '/api/fsc/assets', '/api/fsc/assets'], async (req, res) => {
  const username = String(req.query.username || '').trim();
  if (!username) return res.status(400).json({ ok: false, error: 'username requerido' });
  if (!(await fscAssetsAuthorized(req, username))) return res.status(401).json({ ok: false, error: 'No autorizado' });
  try {
    const templates = listTemplates();
    const user = String(username).toLowerCase();
    const item = (t) => ({
      id: t.slug,
      title: t.name,
      url: '/jpstagedesign/output3d.html?preset=' + encodeURIComponent(t.slug),
      meta: { pantallas: t.screens, proyectores: t.projectors, objetos: t.furniture, guardado: t.savedAt }
    });
    // Solo son "tuyos" los que tienen autor; los demas son presets del sistema.
    const propios = templates.filter((t) => t.owner && String(t.owner).toLowerCase() === user);
    const sistema = templates.filter((t) => !t.owner);
    const groups = [];
    if (propios.length) {
      groups.push({ type: 'escenario', label: 'Escenarios guardados', count: propios.length, items: propios.slice(0, 100).map(item) });
    }
    if (sistema.length) {
      groups.push({ type: 'escenario-sistema', label: 'Escenarios del sistema (presets)', count: sistema.length, items: sistema.slice(0, 100).map(item) });
    }
    res.json({ ok: true, app: 'jpstagedesign', username, total: groups.reduce((n, g) => n + g.count, 0), groups });
  } catch (err) {
    console.error('[FSC-ASSETS] error:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo indexar los assets' });
  }
});

// ============================================================
// 🔑 FSC AUTH (SSO) — sesión central del ecosistema FullScreen Code
// El login real lo hace fscauth (puerto 3027). Acá solo verificamos el token
// contra su API, así no hace falta agregar jsonwebtoken ni copiar JWT_SECRET.
// La botonera NO se bloquea: sin sesión se usa igual (los presets son públicos).
// ============================================================
const FSCAUTH_API = process.env.FSCAUTH_URL || 'https://vps-4455523-x.dattaweb.com/jpconnect';

app.get([BASE_PATH + '/api/auth/me', '/api/auth/me'], async (req, res) => {
  try {
    const auth = String(req.headers.authorization || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : (req.query.token || '');
    if (!token) return res.status(401).json({ ok: false, loggedIn: false, error: 'Sin token' });
    const r = await fetch(FSCAUTH_API + '/api/auth/verify', { headers: { Authorization: 'Bearer ' + token } });
    const d = await r.json().catch(() => ({}));
    if (!d || d.loggedIn !== true) {
      return res.status(401).json({ ok: false, loggedIn: false, error: 'Sesión inválida o expirada' });
    }
    return res.json({ ok: true, loggedIn: true, user: d.user || null });
  } catch (err) {
    console.error('[AUTH] verify error:', err.message);
    return res.status(502).json({ ok: false, error: 'No se pudo contactar el sistema central de autenticación' });
  }
});

// Perfil unificado (profile.html): proxy al perfil central de fscauth.
// Requiere un Bearer válido. Si el fscauth desplegado todavía no expone
// /api/auth/profile (deploy viejo), degrada a /api/auth/verify (identidad mínima).
app.get([BASE_PATH + '/api/auth/profile', '/api/auth/profile'], async (req, res) => {
  try {
    const auth = String(req.headers.authorization || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : (req.query.token || '');
    if (!token) return res.status(401).json({ ok: false, loggedIn: false, error: 'Sin token' });
    const r = await fetch(FSCAUTH_API + '/api/auth/profile', { headers: { Authorization: 'Bearer ' + token } });
    if (r.ok) {
      const d = await r.json().catch(() => ({}));
      if (d && d.ok === true && d.user) {
        return res.json({ ok: true, loggedIn: true, user: d.user, source: 'profile' });
      }
    }
    const rv = await fetch(FSCAUTH_API + '/api/auth/verify', { headers: { Authorization: 'Bearer ' + token } });
    const dv = await rv.json().catch(() => ({}));
    if (!dv || dv.loggedIn !== true) {
      return res.status(401).json({ ok: false, loggedIn: false, error: 'Sesión inválida o expirada' });
    }
    return res.json({ ok: true, loggedIn: true, user: dv.user || null, source: 'verify' });
  } catch (err) {
    console.error('[AUTH] profile error:', err.message);
    return res.status(502).json({ ok: false, error: 'No se pudo contactar el sistema central de autenticación' });
  }
});

app.post([BASE_PATH + '/api/auth/login', '/api/auth/login'], async (req, res) => {
  try {
    const { identifier, username, password } = req.body || {};
    const loginId = identifier || username;
    if (!loginId || !password) {
      return res.status(400).json({ ok: false, error: 'Email/usuario y contraseña son obligatorios' });
    }
    const r = await fetch(FSCAUTH_API + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: loginId, password })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ ok: false, error: d.error || 'Login fallido' });
    return res.json({ ok: true, token: d.token, user: d.user });
  } catch (err) {
    console.error('[AUTH] login error:', err.message);
    return res.status(502).json({ ok: false, error: 'No se pudo contactar el sistema central de autenticación' });
  }
});

app.post([BASE_PATH + '/api/auth/register', '/api/auth/register'], async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) {
      return res.status(400).json({ ok: false, error: 'Todos los campos son obligatorios' });
    }
    const r = await fetch(FSCAUTH_API + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, origin: 'jpstagedesign' })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ ok: false, error: d.error || 'Registro fallido' });
    return res.status(201).json({ ok: true, token: d.token, user: d.user });
  } catch (err) {
    console.error('[AUTH] register error:', err.message);
    return res.status(502).json({ ok: false, error: 'No se pudo contactar el sistema central de autenticación' });
  }
});

// ============================================================
// SUBIDA DIRECTA DE ARCHIVOS (publicar en el servidor)
// POST /api/uploads/:name  (body crudo) → guarda en public/uploads/ con ese nombre.
// Lo usa el visor 3D cuando el diseño se hace en local y se publica al VPS:
// manda las imágenes que referencia el preset para que el link del cliente las vea.
// ============================================================
app.post([BASE_PATH + '/api/uploads/:name', '/api/uploads/:name'],
  express.raw({ type: () => true, limit: '150mb' }),
  (req, res) => {
    try {
      const safe = path.basename(String(req.params.name || '')).replace(/[^a-zA-Z0-9._-]/g, '_');
      if (!safe || safe === '.' || safe === '..') {
        return res.status(400).json({ ok: false, error: 'Nombre de archivo inválido' });
      }
      const body = req.body;
      if (!body || !body.length) {
        return res.status(400).json({ ok: false, error: 'Body vacío' });
      }
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      fs.writeFileSync(path.join(UPLOADS_DIR, safe), body);
      console.log(`[UPLOADS] Publicado ${safe} (${body.length} bytes)`);
      res.json({ ok: true, name: safe, bytes: body.length, url: BASE_PATH + '/uploads/' + encodeURIComponent(safe) });
    } catch (err) {
      console.error('[UPLOADS] Error publicando:', err.message);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

// ============================================================
// API PARA AGENTES (/api/agent/*) — diseño automático de instalaciones
// Ver agent_api.js + lib/installation.js
// ============================================================
require('./agent_api')({
  app,
  io,
  BASE_PATH,
  loadLibrary,
  saveLibrary,
  getLibrary: () => library,
  setLibrary: (lib) => { library = lib; },
  getRoom3DConfig,
  writeRoom3DConfig,
  TEMPLATES_DIR,
  UPLOADS_DIR,
  templateSlug,
  listTemplates
});

// --- Manejo de errores de upload (multer) ---
app.use((err, req, res, next) => {
  if (err) {
    console.error('[MATERIALES] Error de upload:', err.message);
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ error: err.message || 'Error en el upload' });
  }
  next();
});

// Ruta principal redirige al menu
app.get(BASE_PATH, (req, res) => {
  res.redirect(BASE_PATH + '/');
});

app.get(BASE_PATH + '/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get(BASE_PATH + '/output', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'output.html'));
});

app.get(BASE_PATH + '/output/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'output.html'));
});

app.get(BASE_PATH + '/output3d.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'output3d.html'));
});

app.get(BASE_PATH + '/presupuesto.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'presupuesto.html'));
});

app.get(BASE_PATH + '/common.frag', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'shaders', 'common.frag'));
});
app.get('/common.frag', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'shaders', 'common.frag'));
});

// Compatibilidad: Redirección de /futurex a /jpstagedesign
app.use('/futurex', (req, res) => {
  const target = req.url === '/' ? '' : req.url;
  res.redirect(301, BASE_PATH + target);
});

// Rutas raíz (para acceso directo en http://localhost:6645/)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/output', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'output.html'));
});

app.get('/output/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'output.html'));
});

app.get('/output3d.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'output3d.html'));
});

app.get('/presupuesto.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'presupuesto.html'));
});

app.get('/presupuesto', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'presupuesto.html'));
});

// ============================================================
// SOCKET.IO - Comunicación MASTER/SLAVE
// ============================================================

// Estado del master activo y mapeo
let masterSocketId = null;
let currentScene = null;
let currentMappingMode = 'duplicated'; // 'duplicated' o 'extended'

// No reemitir un payload identico al anterior: repintaba TODAS las pantallas al pedo.
// Los eventos de estado son idempotentes; los de borde (masterClaimed, sceneCleared)
// siguen emitiendose siempre. Un cliente nuevo recibe el estado en `masterStatus`.
const _emitCache = new Map();
function emitSiCambio(evento, payload) {
  try {
    const clave = JSON.stringify(payload);
    if (_emitCache.get(evento) === clave) return;
    _emitCache.set(evento, clave);
  } catch (e) { /* payload no serializable: se emite igual */ }
  io.emit(evento, payload);
}

io.on('connection', (socket) => {
  console.log(`[JPSTAGE DESIGN] Cliente conectado: ${socket.id} desde ${socket.handshake.headers.origin || 'unknown'}`);

  const currentSettings = getSettings();
  const currentLogo = currentSettings.customLogoUrl || (BASE_PATH + '/img/logo.svg');

  // Enviar estado actual al nuevo cliente
  socket.emit('masterStatus', {
    masterId: masterSocketId,
    currentScene: currentScene,
    mappingMode: currentMappingMode,
    logoUrl: currentLogo
  });

  // --- MODO DE MAPEO (Duplicado vs Extendido) ---
  socket.on('setMappingMode', (data) => {
    const mode = (data && data.mode) ? data.mode : data;
    currentMappingMode = mode === 'extended' ? 'extended' : 'duplicated';
    console.log(`[BOTONERA] Modo de mapeo actualizado: ${currentMappingMode}`);
    emitSiCambio('mappingModeChanged', { mode: currentMappingMode });
  });

  // --- CLAIM MASTER ---
  socket.on('claimMaster', () => {
    masterSocketId = socket.id;
    console.log(`[BOTONERA] Nuevo MASTER: ${socket.id}`);
    
    // Notificar a todos los clientes
    io.emit('masterClaimed', { socketId: socket.id });
  });

  // --- SELECCIONAR ESCENA ---
  socket.on('selectScene', (data) => {
    masterSocketId = socket.id;
    currentScene = data;
    console.log(`[BOTONERA] Escena activa: ${data.sceneId || data.id || 'sin-id'} - ${data.label || data.name || ''} (por socket ${socket.id})`);
    
    // Broadcast a todos los clientes (incluido el master y pantallas 3D/output)
    emitSiCambio('sceneChanged', data);
  });

  // --- LIMPIAR OUTPUT / BLACKOUT ---
  socket.on('clearScene', () => {
    currentScene = { id: 'blackout', label: 'BLACKOUT', name: 'BLACKOUT', type: 'blackout' };
    console.log('[BOTONERA] BLACKOUT / Escena limpiada');
    io.emit('sceneCleared');
    emitSiCambio('sceneChanged', currentScene);
  });

  // --- CONFIGURACIÓN DE HABITACIÓN ---
  socket.on('roomConfig', (data) => {
    console.log(`[BOTONERA] Config de habitación: ${JSON.stringify(data)}`);
    emitSiCambio('roomConfig', data);
  });

  // --- ACTUALIZACIÓN DINÁMICA DE UNIFORMS DE SHADER ---
  socket.on('updateShaderUniforms', (data) => {
    console.log(`[BOTONERA] Uniforms actualizados para ${data.shader}:`, data.uniforms);
    if (currentScene && data && data.uniforms) {
      const activeClean = (currentScene.effect || currentScene.name || currentScene.shader || '').toLowerCase();
      const targetClean = (data.shader || '').replace(/^(effect|shader)-/, '').toLowerCase();
      if (!targetClean || targetClean === activeClean) {
        if (!currentScene.uniforms) currentScene.uniforms = {};
        Object.assign(currentScene.uniforms, data.uniforms);
      }
    }
    emitSiCambio('shaderUniformsChanged', data);
  });

  // --- DISCONNECT ---
  socket.on('disconnect', () => {
    if (socket.id === masterSocketId) {
      masterSocketId = null;
      console.log(`[BOTONERA] MASTER desconectado`);
      io.emit('masterReleased');
    }
  });
});

// ============================================================
// INICIAR SERVIDOR
// ============================================================
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`[JPSTAGE DESIGN] Servidor FSC iniciado`);
    console.log(`[JPSTAGE DESIGN] Puerto: ${PORT}`);
    console.log(`[JPSTAGE DESIGN] Base: ${BASE_PATH}`);
    console.log(`[JPSTAGE DESIGN] Menu Tablet: http://localhost:${PORT}${BASE_PATH}/`);
    console.log(`[JPSTAGE DESIGN] Output 3D:   http://localhost:${PORT}${BASE_PATH}/output3d.html`);
    console.log(`[JPSTAGE DESIGN] Output Proy: http://localhost:${PORT}${BASE_PATH}/output/`);
    console.log(`========================================`);
  });
}

module.exports = { app, server };
