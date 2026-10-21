// Deja una escena "al aire" en el socket del JPStageDesign local, para que
// cualquier cliente nuevo (p. ej. el screenshot headless del 3D) la reciba.
//   node tests/_set_scene.js '<json de la escena>'
const { io } = require('socket.io-client');

const scene = JSON.parse(process.argv[2] || '{"type":"web","src":"/jpstagedesign/"}');
const socket = io('http://localhost:' + (process.env.PORT || 6645), {
  path: '/jpstagedesign/socket.io',
  transports: ['websocket', 'polling']
});

socket.on('connect', () => {
  console.log('conectado', socket.id);
  socket.emit('selectScene', scene);
  setTimeout(() => { socket.close(); process.exit(0); }, 900);
});
socket.on('connect_error', (e) => { console.error('error de conexión:', e.message); process.exit(1); });
setTimeout(() => { console.error('timeout'); process.exit(1); }, 8000);
