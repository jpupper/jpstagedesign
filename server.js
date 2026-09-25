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

function saveLibrary() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(MATERIALS_FILE, JSON.stringify(library, null, 2), 'utf8');
    console.log('[MATERIALES] Biblioteca guardada en ' + MATERIALS_FILE);
  } catch (err) {
    console.error('[MATERIALES] Error guardando biblioteca:', err.message);
  }
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
    io.emit('shaderUniformsChanged', {
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
  io.emit('logoChanged', { logoUrl: fileUrl, isCustom: true });

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
  io.emit('logoChanged', { logoUrl: defaultLogo, isCustom: false });

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

const handlePostRoom3DConfig = (req, res) => {
  try {
    const config = req.body;
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'Configuración inválida' });
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ROOM3D_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    console.log('[ROOM3D] Configuración guardada en ' + ROOM3D_CONFIG_FILE);
    res.json({ ok: true, message: 'Configuración guardada exitosamente' });
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
    const payload = { name: cleanName, slug, savedAt: new Date().toISOString(), config };
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
    io.emit('mappingModeChanged', { mode: currentMappingMode });
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
    io.emit('sceneChanged', data);
  });

  // --- LIMPIAR OUTPUT / BLACKOUT ---
  socket.on('clearScene', () => {
    currentScene = { id: 'blackout', label: 'BLACKOUT', name: 'BLACKOUT', type: 'blackout' };
    console.log('[BOTONERA] BLACKOUT / Escena limpiada');
    io.emit('sceneCleared');
    io.emit('sceneChanged', currentScene);
  });

  // --- CONFIGURACIÓN DE HABITACIÓN ---
  socket.on('roomConfig', (data) => {
    console.log(`[BOTONERA] Config de habitación: ${JSON.stringify(data)}`);
    io.emit('roomConfig', data);
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
    io.emit('shaderUniformsChanged', data);
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
