// ============================================================
// COMMON FUNCTIONS & DEFINITIONS FOR SHADERS
// Archivo: public/shaders/common.frag
// ============================================================

#ifndef COMMON_FRAG
#define COMMON_FRAG

precision highp float;

uniform vec2 u_resolution;
uniform float u_time;

#ifndef iResolution
#define iResolution u_resolution
#endif
#ifndef time
#define time u_time
#endif
#ifndef iTime
#define iTime u_time
#endif
#ifndef fragColor
#define fragColor gl_FragColor
#endif

#ifndef MAPR_FUNC
#define MAPR_FUNC
// Mapeo lineal de un valor normalizado al rango [minOut, maxOut]
float mapr(float val, float minOut, float maxOut) {
  return minOut + val * (maxOut - minOut);
}
#endif

// Hash para ruido aleatorio
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

#endif
