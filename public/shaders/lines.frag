// ============================================================
// SHADER: LINES (Líneas cibernéticas)
// Archivo: public/shaders/lines.frag
// ============================================================

precision highp float;
uniform vec2 u_resolution;
uniform float u_time;

// Uniforms configurables
// uniform: u_speed, label: "Velocidad", type: float, default: 1.0, min: 0.1, max: 4.0, step: 0.1
uniform float u_speed;
// uniform: u_line_count, label: "Cantidad de Líneas", type: float, default: 20.0, min: 5.0, max: 50.0, step: 1.0
uniform float u_line_count;
// uniform: u_line_color, label: "Color de Líneas", type: vec3, default: [0.0, 0.8, 1.0]
uniform vec3 u_line_color;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float speed = u_speed > 0.0 ? u_speed : 1.0;
  float count = u_line_count > 0.0 ? u_line_count : 20.0;
  vec3 baseColor = length(u_line_color) > 0.001 ? u_line_color : vec3(0.0, 0.8, 1.0);
  
  float lineWidth = 0.005;
  vec3 color = vec3(0.02, 0.02, 0.05);
  
  for (float i = 0.0; i < 50.0; i++) {
    if (i >= count) break;
    float y = i / count;
    float distorsion = sin(uv.x * 8.0 + u_time * 2.0 * speed + i * 0.5) * 0.02;
    distorsion += sin(uv.x * 15.0 - u_time * 1.5 * speed + i * 0.3) * 0.01;
    y += distorsion;
    float width = lineWidth + sin(u_time * speed + i) * 0.002;
    if (abs(uv.y - y) < width) {
      float intensity = 1.0 - abs(uv.y - y) / width;
      color = mix(color, baseColor, intensity * 0.8);
    }
  }
  
  for (float i = 0.0; i < 10.0; i++) {
    float x = i / 10.0;
    float distorsion = sin(uv.y * 6.0 + u_time * 1.5 * speed) * 0.01;
    x += distorsion;
    if (abs(uv.x - x) < 0.002) {
      color += baseColor * 0.1;
    }
  }
  
  float pulse = sin(u_time * 3.0 * speed) * 0.1 + 0.9;
  color *= pulse;
  gl_FragColor = vec4(color, 1.0);
}
