
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;


#ifndef MAPR_FUNC
#define MAPR_FUNC
float mapr(float val, float minOut, float maxOut) {
  return minOut + val * (maxOut - minOut);
}
#endif
#define iResolution u_resolution
#define time u_time
// uniform: iterations, label: "Iteraciones (Fractal)", type: float, default: 0.5, min: 0.0, max: 1.0, step: 0.05
uniform float iterations;

// uniform: formuparam, label: "Fórmula Paramétrica", type: float, default: 0.53, min: 0.1, max: 1.0, step: 0.01
uniform float formuparam;

// uniform: volsteps, label: "Pasos Volumétricos", type: float, default: 0.75, min: 0.0, max: 1.0, step: 0.05
uniform float volsteps;

// uniform: stepsize, label: "Tamaño de Paso", type: float, default: 0.1, min: 0.01, max: 0.3, step: 0.01
uniform float stepsize;

// uniform: zoom, label: "Zoom", type: float, default: 0.8, min: 0.1, max: 2.5, step: 0.05
uniform float zoom;

// uniform: tile, label: "Tile (Repetición)", type: float, default: 0.85, min: 0.1, max: 2.0, step: 0.05
uniform float tile;

// uniform: speedx, label: "Velocidad X", type: float, default: 0.5, min: 0.0, max: 1.0, step: 0.01
uniform float speedx;

// uniform: speedy, label: "Velocidad Y", type: float, default: 0.5, min: 0.0, max: 1.0, step: 0.01
uniform float speedy;

// uniform: brightness, label: "Brillo", type: float, default: 0.5, min: 0.0, max: 1.0, step: 0.01
uniform float brightness;

// uniform: darkmatter, label: "Materia Oscura", type: float, default: 0.3, min: 0.0, max: 1.0, step: 0.01
uniform float darkmatter;

// uniform: distfading, label: "Desvanecimiento Dist.", type: float, default: 0.73, min: 0.1, max: 1.0, step: 0.01
uniform float distfading;

// uniform: saturation, label: "Saturación", type: float, default: 0.85, min: 0.0, max: 1.0, step: 0.05
uniform float saturation;

// uniform: ma1, label: "Rotación Ángulo 1", type: float, default: 0.0, min: -3.14, max: 3.14, step: 0.05
uniform float ma1;

// uniform: ma2, label: "Rotación Ángulo 2", type: float, default: 0.0, min: -3.14, max: 3.14, step: 0.05
uniform float ma2;

void main()
{
	// Coordenadas y dirección normalizadas
	vec2 uv = gl_FragCoord.xy / iResolution.xy - 0.5;
	uv.y *= iResolution.y / iResolution.x;
	vec3 dir = vec3(uv * (zoom > 0.0 ? zoom : 0.8) * 5.0, 1.0);

	// Rotación de cámara
	float a1 = 0.5 + 1.0 / iResolution.x * 2.0 + ma1;
	float a2 = 0.8 + 1.0 / iResolution.y * 2.0 + ma2;
	mat2 rot1 = mat2(cos(a1), sin(a1), -sin(a1), cos(a1));
	mat2 rot2 = mat2(cos(a2), sin(a2), -sin(a2), cos(a2));
	dir.xz *= rot1;
	dir.xy *= rot2;

	vec3 from = vec3(1.0, 0.5, 0.5);
	from += vec3(time * mapr(speedx, -0.05, 0.05), time * mapr(speedy, -0.05, 0.05), -2.0);
	
	// Renderizado volumétrico
	float s = 0.1;
	float fade = 1.0;
	vec3 v = vec3(0.0);
	
	int mite = int(floor(mapr(iterations, 10.0, 25.0)));
	int mvolsteps = int(floor(mapr(volsteps, 0.0, 20.0)));
	float mbri = mapr(brightness, 0.0, 0.0030);
	float mdarkmatter = mapr(darkmatter, 0.0, 10.0);
	float ttile = tile > 0.0 ? tile : 0.85;
	float fparam = formuparam > 0.0 ? formuparam : 0.53;
	float dfading = distfading > 0.0 ? distfading : 0.73;
	float ssize = stepsize > 0.0 ? stepsize : 0.1;
	float sat = saturation >= 0.0 ? saturation : 0.85;

	for (int r = 0; r < 20; r++) {
		if (r >= mvolsteps) break;
		vec3 p = from + s * dir * 0.5;
		p = abs(vec3(ttile) - mod(p, vec3(ttile * 2.0))); // tiling fold
		float pa = 0.0;
		float a = 0.0;
		for (int i = 0; i < 25; i++) {
			if (i >= mite) break;
			p = abs(p) / dot(p, p) - fparam; // the magic formula
			a += abs(length(p) - pa); // absolute sum of average change
			pa = length(p);
		}
		float dm = max(0.0, mdarkmatter - a * a * 0.001); // dark matter
		a *= a * a; // add contrast
		if (r > 6) fade *= 1.0 - dm; // dark matter, don't render near
		v += vec3(fade);
		v += vec3(s, s * s, s * s * s * s) * a * mbri * fade; // coloring based on distance
		fade *= dfading; // distance fading
		s += ssize;
	}
	v = mix(vec3(length(v)), v, sat); // color adjust
	gl_FragColor = vec4(v * 0.01, 1.0);
}
