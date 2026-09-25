// ============================================================
// BOTONERA FSC - Configuración Global
// Estándar FSC: window.CONFIG expuesto globalmente
// ============================================================

const VPS_ORIGIN = 'https://vps-4455523-x.dattaweb.com';
const FTP_ORIGIN = 'https://fullscreencode.com';
const IS_NODE_SERVER = (
  location.hostname === 'localhost' ||
  location.hostname === '127.0.0.1' ||
  location.hostname.includes('dattaweb.com') ||
  location.hostname.includes('vps-')
);
const IS_FTP_HOST = location.hostname.includes('ferozo') || location.hostname.includes('fullscreencode.com');
// Host local (desarrollo / servidor Node local): los Outputs se abren en el MISMO host
const IS_LOCAL_HOST = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

window.CONFIG = {
  BASE: '/jpstagedesign',
  APP_NAME: 'jpstagedesign',
  
  // Detectar si estamos corriendo desde el servidor Node (local/VPS) o desde estático (Ferozo)
  IS_NODE_SERVER: IS_NODE_SERVER,
  
  // Origen del backend
  SOCKET_URL: IS_NODE_SERVER ? '' : VPS_ORIGIN,
  SOCKET_PATH: '/jpstagedesign/socket.io',
  API_URL: (IS_NODE_SERVER ? '' : VPS_ORIGIN) + '/jpstagedesign/api',
  FSCAUTH_URL: VPS_ORIGIN + '/fscauth',
  
  // URLs de Output (se usan cuando el usuario hace clic en "Abrir Output")
  // - En local (localhost/127.0.0.1): mismo host local
  // - En el FTP: apuntan al FTP
  // - En el VPS: apuntan al VPS
  OUTPUT_URL: IS_LOCAL_HOST ? (location.origin + '/jpstagedesign/')
            : (IS_FTP_HOST ? FTP_ORIGIN + '/jpstagedesign/' : VPS_ORIGIN + '/jpstagedesign/'),
  OUTPUT_3D_URL: IS_LOCAL_HOST ? (location.origin + '/jpstagedesign/output3d.html')
            : (IS_FTP_HOST ? FTP_ORIGIN + '/jpstagedesign/output3d.html' : VPS_ORIGIN + '/jpstagedesign/output3d.html'),
  
  // Medidas de la habitación (por defecto)
  ROOM: {
    length: 4480,  // cm
    width: 3015,   // cm
    height: 200    // cm (2m)
  },
  
  // Categorías de la botonera
  CATEGORIES: [
    { id: 'efectos-visuales', label: 'Efectos Visuales', icon: '✨', description: 'Shaders inmersivos animados' },
    { id: 'ambientes', label: 'Ambientes', icon: '🖼️', description: 'Imágenes de paisajes' },
    { id: 'videos', label: 'Videos', icon: '🎬', description: 'Videos de YouTube' }
  ],
  
  // Escenas disponibles organizadas por categoría
  SCENES: [
    { id: 'shader-espacio', label: 'Espacio', category: 'efectos-visuales', type: 'shader', shader: 'space' },
    { id: 'shader-lineas', label: 'Líneas', category: 'efectos-visuales', type: 'shader', shader: 'lines' },
    { id: 'shader-corazones', label: 'Corazones', category: 'efectos-visuales', type: 'shader', shader: 'hearts' },
    { id: 'shader-fuego', label: 'Fuego', category: 'efectos-visuales', type: 'shader', shader: 'fire' },
    { id: 'shader-lluvia', label: 'Lluvia', category: 'efectos-visuales', type: 'shader', shader: 'rain' },
    { id: 'shader-ondas', label: 'Ondas', category: 'efectos-visuales', type: 'shader', shader: 'waves' },
    { id: 'amb-playa', label: 'Playa', category: 'ambientes', type: 'image', src: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=90' },
    { id: 'amb-bosque', label: 'Bosque', category: 'ambientes', type: 'image', src: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&q=90' },
    { id: 'amb-campo', label: 'Campo', category: 'ambientes', type: 'image', src: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1920&q=90' },
    { id: 'amb-montaña', label: 'Montaña', category: 'ambientes', type: 'image', src: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920&q=90' },
    { id: 'amb-ciudad', label: 'Ciudad', category: 'ambientes', type: 'image', src: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1920&q=90' },
    { id: 'amb-atardecer', label: 'Atardecer', category: 'ambientes', type: 'image', src: 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=1920&q=90' },
    { id: 'vid-naturaleza', label: 'Naturaleza', category: 'videos', type: 'youtube', videoId: 'O_xXKUQVu2Q' },
    { id: 'vid-relajante', label: 'Relajante', category: 'videos', type: 'youtube', videoId: 'GAOQ1EHvR_c' },
    { id: 'vid-fuegos', label: 'Fuegos Artificiales', category: 'videos', type: 'youtube', videoId: 'ePBeinQOoXY' },
    { id: 'vid-oceano', label: 'Océano', category: 'videos', type: 'youtube', videoId: 'bn9F19Hi1Lk' },
    { id: 'vid-espacio-yt', label: 'Espacio', category: 'videos', type: 'youtube', videoId: 'uD4izuDMUQA' },
    { id: 'vid-aurora', label: 'Aurora Boreal', category: 'videos', type: 'youtube', videoId: 'izYiDDt6d8s' }
  ]
};

// Backward compatibility
window.JPSTAGEDESIGN_CONFIG = window.CONFIG;
window.FUTUREX_CONFIG = window.CONFIG;
window.BOTONERA_CONFIG = window.CONFIG;
const CONFIG = window.CONFIG;
