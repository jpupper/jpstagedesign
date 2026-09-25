// ============================================================
// SHADER: HEARTS (Corazones Flotantes) — v3
// Archivo: public/shaders/hearts.frag
// ------------------------------------------------------------------
// v3: SIN parpadeo. Se eliminó la pulsación por corazón (beat) y el
//     núcleo blanco saturado, y se suavizaron bordes/glow con blend
//     "screen" (no aditivo puro), que era lo que hacía titilar los
//     corazones al cruzarse. Hash sin seno (estable en cualquier
//     precisión). SDF de corazón + corrección de aspect ratio.
// ============================================================

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 u_resolution;
uniform float u_time;

// Uniforms configurables
// uniform: u_speed, label: "Velocidad", type: float, default: 1.0, min: 0.1, max: 4.0, step: 0.1
uniform float u_speed;
// uniform: u_count, label: "Cantidad", type: float, default: 18.0, min: 3.0, max: 40.0, step: 1.0
uniform float u_count;
// uniform: u_heart_color, label: "Color de Corazones", type: vec3, default: [1.0, 0.22, 0.45]
uniform vec3 u_heart_color;
// uniform: u_size, label: "Tamaño", type: float, default: 1.0, min: 0.3, max: 3.0, step: 0.05
uniform float u_size;
// uniform: u_glow, label: "Brillo (Glow)", type: float, default: 1.0, min: 0.0, max: 3.0, step: 0.05
uniform float u_glow;

// --- Hash estable (sin seno): no titila en mediump ni al cruzar corazones
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

// --- Unión suave (para unir lóbulos y punta sin costuras duras)
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// --- SDF de corazón. p en unidades locales: ancho ~1.8, alto ~1.5, +y arriba.
//     Devuelve distancia (negativa = adentro).
float sdHeart(vec2 p) {
  p.x *= 1.10;                                  // corazón un poco más angosto
  float r = 0.5;
  float d1 = length(p - vec2(-0.5, 0.45)) - r;  // lóbulo izquierdo
  float d2 = length(p - vec2( 0.5, 0.45)) - r;  // lóbulo derecho
  // Punta inferior: cuadrado rotado 45° (rombo) con vértice en la muesca
  vec2 pc = p - vec2(0.0, -0.05);
  vec2 q = vec2(0.70710678 * (pc.x + pc.y), 0.70710678 * (pc.y - pc.x));
  vec2 b = abs(q) - vec2(0.35355, 0.35355);
  float d3 = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0);

  float d = smin(smin(d1, d2, 0.10), d3, 0.10);
  return d / 1.06;                              // compensa el estrechado en x
}

void main() {
  vec2 res = max(u_resolution, vec2(1.0));
  float aspect = res.x / res.y;
  float px = 1.0 / res.y;                       // 1 pixel en unidades normalizadas

  // Espacio corregido por aspect: 1.0 = altura de pantalla completa
  vec2 uv = vec2(gl_FragCoord.x / res.y, gl_FragCoord.y / res.y);

  float speed   = u_speed > 0.0 ? u_speed : 1.0;
  float count   = u_count > 0.0 ? u_count : 18.0;
  float sizeMul = u_size > 0.0 ? u_size : 1.0;
  float glowMul = u_glow >= 0.0 ? u_glow : 1.0;
  vec3  hColor  = length(u_heart_color) > 0.001 ? u_heart_color : vec3(1.0, 0.22, 0.45);

  float t = u_time * speed;

  // --- Fondo: degradado romántico oscuro + respiración GLOBAL (no titila por corazón)
  vec2 sc = vec2(uv.x / aspect, uv.y) - 0.5;
  float vig = 1.0 - 0.85 * dot(sc, sc);
  vec3 color = mix(vec3(0.010, 0.0, 0.026), vec3(0.045, 0.0, 0.085), uv.y) * clamp(vig, 0.0, 1.0);
  color += hColor * 0.035 * glowMul * (0.5 + 0.18 * sin(t * 0.5)) * (1.0 - uv.y);

  // --- Corazones
  for (float i = 0.0; i < 40.0; i++) {
    if (i >= count) break;

    float h1 = hash11(i * 1.70 + 0.31);
    float h2 = hash11(i * 3.30 + 1.77);
    float h3 = hash11(i * 5.10 + 2.13);
    float h4 = hash11(i * 7.90 + 0.59);

    // Tamaños variados: chicos al fondo, grandes adelante
    float size  = (0.036 + 0.060 * h1 * h1) * sizeMul;
    float depth = clamp((size / sizeMul - 0.036) / 0.060, 0.0, 1.0);  // 0 lejos - 1 cerca

    // Posición horizontal + vaivén lento
    float x = (0.06 + 0.88 * h2) * aspect;
    x += sin(t * (0.22 + 0.30 * h3) + i * 1.9) * (0.008 + 0.022 * h4);

    // Deriva ascendente (los de adelante se mueven algo más rápido)
    float spd = (0.045 + 0.070 * depth) * (0.75 + 0.5 * h3);
    float yRaw = fract(h4 - t * spd);
    float y = yRaw * (1.0 + 2.0 * size) - size;
    // Fade estable en bordes (evita apariciones/desapariciones bruscas)
    float fade = smoothstep(0.0, 0.16, yRaw) * (1.0 - smoothstep(0.84, 1.0, yRaw));

    // Rotación / inclinación suave
    float ang = sin(t * 0.4 + i * 2.7) * 0.24 + (h1 - 0.5) * 0.28;
    float ca = cos(ang);
    float sa = sin(ang);

    vec2 p = uv - vec2(x, y);
    p = mat2(ca, -sa, sa, ca) * p;
    p /= size;

    float d = sdHeart(p);

    // Antialias ancho (~2.5 px): menos "shimmer" al moverse sobre la pared
    float soft = 2.5 * px / size;
    float mask = smoothstep(soft, -soft, d);
    // Halo amplio y suave: además de verse lindo, disimula el borde (anti-shimmer)
    float halo = exp(-max(d, 0.0) * (2.2 + 2.6 * (1.0 - depth)));

    // Color estable por corazón (sin variación temporal)
    vec3 c = hColor * (0.80 + 0.40 * h2);
    c = mix(c, vec3(1.0), 0.16 * h3 * h3);

    // Cuerpo: composición "over" (los corazones se tapan, no se suman -> sin destellos)
    float coreA = mask * (0.72 + 0.28 * depth) * fade;
    color = mix(color, c, clamp(coreA, 0.0, 1.0));

    // Halo: blend "screen" (nunca satura a blanco, no parpadea al cruzarse)
    vec3 glow = c * halo * (0.20 + 0.22 * depth) * glowMul * fade;
    color = 1.0 - (1.0 - color) * (1.0 - clamp(glow, 0.0, 1.0));
  }

  // --- Viñeta final
  float vig2 = 1.0 - 0.50 * dot(sc, sc);
  color *= clamp(vig2, 0.30, 1.0);

  gl_FragColor = vec4(color, 1.0);
}
