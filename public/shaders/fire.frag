// ============================================================
// SHADER: FIRE (Fuego Realista)
// Archivo: public/shaders/fire.frag
// ============================================================

precision highp float;
uniform vec2 u_resolution;
uniform float u_time;

// Uniforms configurables
// uniform: u_speed, label: "Velocidad de Llama", type: float, default: 1.0, min: 0.1, max: 4.0, step: 0.1
uniform float u_speed;
// uniform: u_flame_intensity, label: "Intensidad", type: float, default: 1.0, min: 0.2, max: 3.0, step: 0.1
uniform float u_flame_intensity;
// uniform: u_tint, label: "Tono de Fuego", type: vec3, default: [1.0, 0.9, 0.3]
uniform vec3 u_tint;

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
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float speed = u_speed > 0.0 ? u_speed : 1.0;
  float intensity = u_flame_intensity > 0.0 ? u_flame_intensity : 1.0;
  vec3 tint = length(u_tint) > 0.001 ? u_tint : vec3(1.0, 0.9, 0.3);
  
  vec2 fireUV = uv;
  fireUV.y = 1.0 - fireUV.y;
  
  vec2 q = vec2(
    fbm(fireUV * vec2(3.0, 5.0) + vec2(0.0, -u_time * 2.0 * speed)),
    fbm(fireUV * vec2(5.0, 7.0) + vec2(0.0, -u_time * 1.5 * speed))
  );
  
  float n = fbm(fireUV * vec2(4.0, 6.0) + q * 0.5 + vec2(0.0, -u_time * 1.8 * speed));
  float gradient = 1.0 - fireUV.y;
  gradient = pow(gradient, 1.5);
  float center = 1.0 - abs(uv.x - 0.5) * 2.0;
  center = pow(center, 0.5);
  float fireShape = gradient * center;
  fireShape = clamp((fireShape + n * 0.5 - 0.3) * intensity, 0.0, 1.0);
  
  vec3 color1 = tint;
  vec3 color2 = vec3(1.0, 0.4, 0.0);
  vec3 color3 = vec3(0.8, 0.0, 0.0);
  vec3 color4 = vec3(0.1, 0.0, 0.0);
  
  vec3 fireColor = mix(color4, color3, fireShape);
  fireColor = mix(fireColor, color2, fireShape * 1.5);
  fireColor = mix(fireColor, color1, pow(fireShape, 3.0));
  fireColor += vec3(1.0, 0.5, 0.1) * pow(fireShape, 5.0) * 0.5;
  
  float smoke = smoothstep(0.6, 1.0, fireUV.y) * n * 0.3;
  fireColor = mix(fireColor, vec3(0.1, 0.1, 0.1), smoke);
  
  gl_FragColor = vec4(fireColor, 1.0);
}
