// ============================================================
// SHADER: WAVES (Ondas de Neón y Partículas)
// Archivo: public/shaders/waves.frag
// ============================================================

precision highp float;
uniform vec2 u_resolution;
uniform float u_time;

// Uniforms configurables
// uniform: u_speed, label: "Velocidad de Onda", type: float, default: 1.0, min: 0.1, max: 4.0, step: 0.1
uniform float u_speed;
// uniform: u_waves_count, label: "Cantidad de Ondas", type: float, default: 5.0, min: 1.0, max: 12.0, step: 1.0
uniform float u_waves_count;
// uniform: u_color1, label: "Color Neón 1", type: vec3, default: [0.0, 0.8, 1.0]
uniform vec3 u_color1;
// uniform: u_color2, label: "Color Neón 2", type: vec3, default: [1.0, 0.2, 0.8]
uniform vec3 u_color2;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float speed = u_speed > 0.0 ? u_speed : 1.0;
  float count = u_waves_count > 0.0 ? u_waves_count : 5.0;
  vec3 c1 = length(u_color1) > 0.001 ? u_color1 : vec3(0.0, 0.8, 1.0);
  vec3 c2 = length(u_color2) > 0.001 ? u_color2 : vec3(1.0, 0.2, 0.8);
  
  vec3 bgTop = vec3(0.0, 0.05, 0.15);
  vec3 bgBottom = vec3(0.0, 0.1, 0.3);
  vec3 color = mix(bgBottom, bgTop, uv.y);
  
  for (float i = 0.0; i < 15.0; i++) {
    if (i >= count) break;
    float freq = 8.0 + i * 4.0;
    float spd = (1.0 + i * 0.3) * speed;
    float amplitude = 0.03 + i * 0.01;
    float wave = sin(uv.x * freq + u_time * spd + i * 1.5) * amplitude;
    wave += sin(uv.x * freq * 0.5 - u_time * spd * 0.7) * amplitude * 0.5;
    float waveY = 0.3 + i * 0.15 + wave;
    float dist = abs(uv.y - waveY);
    float glow = 0.005 / (dist + 0.005);
    glow = pow(glow, 1.5);
    vec3 waveColor = mix(c1, c2, i / count);
    color += waveColor * glow * 0.3;
  }
  
  for (float i = 0.0; i < 20.0; i++) {
    float seed = i * 1.618033;
    float px = fract(sin(seed) * 43758.5453);
    float py = fract(sin(seed * 2.0) * 43758.5453);
    px += sin(u_time * 0.5 * speed + i) * 0.02;
    py += cos(u_time * 0.3 * speed + i * 0.5) * 0.02;
    float dist = length(uv - vec2(px, py));
    float particle = 0.003 / (dist + 0.003);
    particle = pow(particle, 2.0);
    color += vec3(0.5, 0.8, 1.0) * particle * 0.1;
  }
  
  gl_FragColor = vec4(color, 1.0);
}
