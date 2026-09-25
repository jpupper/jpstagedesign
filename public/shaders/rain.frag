// ============================================================
// SHADER: RAIN (Lluvia Cibernética y Rayos)
// Archivo: public/shaders/rain.frag
// ============================================================

precision highp float;
uniform vec2 u_resolution;
uniform float u_time;

// Uniforms configurables
// uniform: u_speed, label: "Velocidad de Caída", type: float, default: 1.0, min: 0.1, max: 4.0, step: 0.1
uniform float u_speed;
// uniform: u_density, label: "Densidad de Gotas", type: float, default: 1.0, min: 0.2, max: 3.0, step: 0.1
uniform float u_density;
// uniform: u_drop_color, label: "Color de Gotas", type: vec3, default: [0.4, 0.6, 1.0]
uniform vec3 u_drop_color;

float hash(float n) {
  return fract(sin(n) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float speed = u_speed > 0.0 ? u_speed : 1.0;
  float density = u_density > 0.0 ? u_density : 1.0;
  vec3 dropColor = length(u_drop_color) > 0.001 ? u_drop_color : vec3(0.4, 0.6, 1.0);
  
  vec3 bgColor = vec3(0.02, 0.03, 0.06);
  vec3 color = bgColor;
  
  for (float i = 0.0; i < 3.0; i++) {
    float spd = (1.5 + i * 0.5) * speed;
    float offset = i * 100.0;
    float y = fract(uv.y * (20.0 + i * 10.0) + u_time * spd * 0.5);
    float x = floor(uv.x * (30.0 + i * 15.0) + offset);
    float xOffset = hash(x) * 0.5;
    float dropX = (floor(uv.x * (30.0 + i * 15.0)) + xOffset) / (30.0 + i * 15.0);
    float dropWidth = 0.001 + hash(x) * 0.001;
    float dropLength = 0.02 + hash(x + 1.0) * 0.02;
    float dist = abs(uv.x - dropX);
    float drop = 0.0;
    
    if (dist < dropWidth && uv.y > (1.0 - y * 0.5)) {
      float dropStart = 1.0 - y * 0.5;
      float dropEnd = dropStart + dropLength;
      if (uv.y >= dropStart && uv.y <= dropEnd) {
        drop = 1.0 - dist / dropWidth;
        drop *= 0.6 + sin(u_time * 10.0 * speed + x) * 0.2;
      }
    }
    
    color = mix(color, dropColor, drop * (0.5 - i * 0.1) * density);
  }
  
  float lightning = step(0.998, fract(sin(floor(u_time * 0.5 * speed) * 12.9898) * 43758.5453));
  color += vec3(0.8, 0.9, 1.0) * lightning * 0.5;
  float vignette = 1.0 - length(uv - 0.5) * 0.8;
  color *= vignette;
  
  gl_FragColor = vec4(color, 1.0);
}
