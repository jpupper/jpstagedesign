// ============================================================
// SHADER FONDO - Fragment Shader Procedural para Menú
// Archivo: public/shaders/shaderfondo.frag
// Modifica este archivo para cambiar el shader de fondo de la interfaz
// ============================================================

precision highp float;
uniform vec2 u_resolution;
uniform float u_time;

// Hash para generar ruido aleatorio
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Noise con interpolación suave
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Fractal Brownian Motion (6 octavas)
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 6; i++) {
    value += amplitude * noise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.x;
  vec2 st = uv * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.5;
  
  // Capas de noise con evolución temporal sutil
  float n1 = fbm(st + u_time * 0.015);
  float n2 = fbm(st * 0.5 + vec2(u_time * 0.008, -u_time * 0.012));
  float n3 = fbm(st * 1.0 - u_time * 0.005 + 43.0);
  float n4 = fbm(st * 2.0 + vec2(-u_time * 0.003, u_time * 0.007) + 17.0);
  float n = n1 * 0.4 + n2 * 0.3 + n3 * 0.2 + n4 * 0.1;
  
  // Rango estético negro/blanco sutil para contraste con la botonera
  vec3 color = vec3(n * 0.35 + 0.08);
  
  gl_FragColor = vec4(color, 1.0);
}
