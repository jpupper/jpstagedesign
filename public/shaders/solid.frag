// ============================================================
// SHADER: SOLID (Color Sólido)
// Archivo: public/shaders/solid.frag
// ============================================================

precision highp float;
uniform vec2 u_resolution;
uniform float u_time;

// Uniforms configurables
// uniform: u_color, label: "Color Sólido", type: vec3, default: [1.0, 0.0, 0.0]
uniform vec3 u_color;

void main() {
  vec3 col = length(u_color) > 0.001 ? u_color : vec3(1.0, 0.0, 0.0);
  gl_FragColor = vec4(col, 1.0);
}
