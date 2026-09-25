// ============================================================
// SHADER: GRADIENT (Gradiente animado)
// Archivo: public/shaders/gradient.frag
// ============================================================

precision highp float;
uniform vec2 u_resolution;
uniform float u_time;

// Uniforms configurables
// uniform: u_speed, label: "Velocidad", type: float, default: 1.0, min: 0.1, max: 4.0, step: 0.1
uniform float u_speed;
// uniform: u_color1, label: "Color Primario", type: vec3, default: [1.0, 0.0, 0.0]
uniform vec3 u_color1;
// uniform: u_color2, label: "Color Secundario", type: vec3, default: [0.0, 0.0, 0.0]
uniform vec3 u_color2;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float speed = u_speed > 0.0 ? u_speed : 1.0;
  float t = u_time * 0.2 * speed;
  
  // Dirección del gradiente que rota lentamente
  vec2 dir = vec2(0.5 + 0.5 * sin(t), 0.5 + 0.5 * cos(t * 0.7));
  float g = uv.x * dir.x + uv.y * (1.0 - dir.y);
  float p = 0.5 + 0.5 * sin(g * 6.2831 - t * 3.0);
  
  vec3 c1 = length(u_color1) > 0.001 ? u_color1 : vec3(1.0, 0.0, 0.0);
  vec3 c2 = u_color2;
  vec3 color = mix(c2, c1, p);
  
  // Pulso de intensidad
  color *= 0.85 + 0.15 * sin(u_time * 2.0 * speed);
  gl_FragColor = vec4(color, 1.0);
}
