// ============================================================
// SHADER: NOISE (Ruido Fractal)
// Archivo: public/shaders/noise.frag
// ============================================================

precision highp float;
uniform vec2 u_resolution;
uniform float u_time;

// Uniforms configurables
// uniform: u_speed, label: "Velocidad", type: float, default: 1.0, min: 0.1, max: 4.0, step: 0.1
uniform float u_speed;
// uniform: u_scale, label: "Escala", type: float, default: 4.0, min: 1.0, max: 15.0, step: 0.5
uniform float u_scale;
// uniform: u_intensity, label: "Intensidad", type: float, default: 1.0, min: 0.2, max: 3.0, step: 0.1
uniform float u_intensity;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

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
  float scale = u_scale > 0.0 ? u_scale : 4.0;
  float speed = u_speed > 0.0 ? u_speed : 1.0;
  float intensity = u_intensity > 0.0 ? u_intensity : 1.0;
  
  vec2 st = uv * vec2(u_resolution.x / u_resolution.y, 1.0) * scale;
  
  float n1 = fbm(st + u_time * 0.1 * speed);
  float n2 = fbm(st * 2.0 + vec2(u_time * 0.07 * speed, -u_time * 0.05 * speed));
  float n3 = fbm(st * 4.0 - u_time * 0.03 * speed);
  float n = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
  
  vec3 color = vec3(1.0 - n * 0.15 * intensity);
  gl_FragColor = vec4(color, 1.0);
}
