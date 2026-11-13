'use strict';
// ============================================================
//  ENGINE: math / WebGL renderer / audio
// ============================================================
const DEG = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const approach = (v, t, d) => v < t ? Math.min(v + d, t) : Math.max(v - d, t);
function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  dist2: (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]),
};
// forward vector for yaw/pitch (yaw=0 looks at -Z)
function fwdVec(yaw, pitch) { const cp = Math.cos(pitch); return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp]; }
function yawPitchOf(d) { return [Math.atan2(-d[0], -d[2]), Math.asin(clamp(d[1], -1, 1))]; }

// ---- 4x4 column-major in-place matrix ops ----
const M4 = {
  ident(m) { m = m || new Float32Array(16); m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  persp(m, fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2); m.fill(0); m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m; },
  tr(m, x, y, z) { for (let r = 0; r < 4; r++) m[12 + r] += m[r] * x + m[4 + r] * y + m[8 + r] * z; return m; },
  sc(m, x, y, z) { for (let r = 0; r < 4; r++) { m[r] *= x; m[4 + r] *= y; m[8 + r] *= z; } return m; },
  ry(m, a) { const c = Math.cos(a), s = Math.sin(a); for (let r = 0; r < 4; r++) { const a0 = m[r], a2 = m[8 + r]; m[r] = a0 * c - a2 * s; m[8 + r] = a0 * s + a2 * c; } return m; },
  rx(m, a) { const c = Math.cos(a), s = Math.sin(a); for (let r = 0; r < 4; r++) { const a1 = m[4 + r], a2 = m[8 + r]; m[4 + r] = a1 * c + a2 * s; m[8 + r] = -a1 * s + a2 * c; } return m; },
  rz(m, a) { const c = Math.cos(a), s = Math.sin(a); for (let r = 0; r < 4; r++) { const a0 = m[r], a1 = m[4 + r]; m[r] = a0 * c + a1 * s; m[4 + r] = -a0 * s + a1 * c; } return m; },
  copy(d, s) { d.set(s); return d; },
};

// ============================================================
//  WebGL renderer (boxes only, but with lighting + fog + procedural detail)
// ============================================================
const R = {
  gl: null, prog: null, loc: {}, cube: null, world: null, worldCount: 0,
  P: new Float32Array(16), Vw: new Float32Array(16), Mm: new Float32Array(16), I: M4.ident(),
  sun: V.norm([0.45, 0.85, 0.3]), fogCol: [0.62, 0.66, 0.70], sunCol: [0.80, 0.76, 0.69], amb: [0.62, 0.62, 0.62], skyTop: [0.36, 0.55, 0.80], fogNear: 45, fogFar: 300, w: 1, h: 1, dyn: 1, camo: 0,
};
const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol;
uniform mat4 uP, uV, uM, uLoc; uniform vec4 uTint;
varying vec3 vN; varying vec3 vC; varying vec3 vW; varying float vD; varying vec3 vL; varying vec3 vLN;
void main(){ vec4 w = uM * vec4(aPos,1.0); vW = w.xyz; vN = mat3(uM) * aNor; vC = aCol * uTint.rgb;
  vL = (uLoc * vec4(aPos,1.0)).xyz; vLN = aNor;
  vec4 v = uV * w; vD = -v.z; gl_Position = uP * v; }`;
const FS = `
precision mediump float;
varying vec3 vN; varying vec3 vC; varying vec3 vW; varying float vD; varying vec3 vL; varying vec3 vLN;
uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uAmb; uniform vec3 uFogCol; uniform vec2 uFog; uniform float uEmis; uniform float uTex; uniform float uAlpha;
uniform float uCamo; uniform vec3 uCA; uniform vec3 uCB; uniform vec3 uCC; uniform float uTime;
float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h2(i),h2(i+vec2(1.0,0.0)),f.x), mix(h2(i+vec2(0.0,1.0)),h2(i+vec2(1.0,1.0)),f.x), f.y); }
void main(){
  vec3 n = normalize(vN);
  vec3 base = vC; float emis = uEmis; float spec = 0.0;
  if (uTex > 0.5) {
    vec3 a = abs(n);
    vec2 uv = a.y > 0.5 ? vW.xz : (a.x > 0.5 ? vW.zy : vW.xy);
    float big = h(floor(vec3(uv*0.5, 1.0) + floor(vW*0.02))) * 0.10 - 0.05;
    float fine = h(floor(vec3(uv*16.0, 3.0))) * 0.05;
    base *= 1.0 + big - fine;
    vec2 g = abs(fract(uv * 0.5) - 0.5);
    base *= 1.0 - smoothstep(0.475, 0.5, max(g.x, g.y)) * 0.10;
    if (a.y < 0.5) base *= 0.72 + 0.28 * clamp(vW.y * 1.2, 0.0, 1.0);
  }
  if (uCamo > 0.5) {
    vec3 ln = abs(vLN);
    vec2 uv = ln.x > 0.5 ? vL.zy : (ln.y > 0.5 ? vL.zx : vL.xy);
    uv *= 1.0;
    vec3 c = uCA;
    if (uCamo < 1.5) { float v = vn(uv*14.0) * 0.65 + vn(uv*31.0) * 0.35; c = v < 0.45 ? uCA : (v < 0.62 ? uCB : uCC); }
    else if (uCamo < 2.5) { vec2 q = floor(uv * 55.0); float v = h2(q) * 0.5 + vn(uv*9.0) * 0.5; c = v < 0.42 ? uCA : (v < 0.62 ? uCB : uCC); }
    else if (uCamo < 3.5) { float s = sin(uv.x * 70.0 + vn(uv*10.0) * 7.0 + uv.y * 20.0); c = s > 0.45 ? uCC : (s > -0.2 ? uCA : uCB); }
    else if (uCamo < 4.5) { float sh = 0.55 + 0.45 * abs(n.y) + 0.45 * pow(max(n.z, 0.0), 6.0); c = uCA * sh; spec = 0.35 + 0.3 * step(0.985, h2(floor(uv*90.0))); }
    else if (uCamo < 5.5) { vec2 q = floor(uv * 26.0 + vec2(uv.y*13.0, 0.0)); float v = h2(q); c = mix(uCA, uCB, v) * (0.8 + 0.4 * v); float sp = step(0.975, h2(q + floor(uTime * 4.0))); c += sp * 0.9; spec = 0.3; emis = max(emis, sp * 0.8); }
    else if (uCamo < 6.5) { float f = vn(vec2(uv.x * 12.0, uv.y * 12.0 + uTime * 2.5)) * 0.6 + vn(vec2(uv.x*25.0 - uTime, uv.y*25.0 + uTime*4.0)) * 0.4; c = f > 0.62 ? uCC : (f > 0.45 ? uCB : uCA); emis = max(emis, smoothstep(0.45, 0.8, f) * 0.7); }
    else if (uCamo < 7.5) { float l = step(0.93, fract(uv.x * 16.0)) + step(0.95, fract(uv.y * 16.0 + floor(uv.x*16.0)*0.37)); float pulse = 0.6 + 0.4 * sin(uTime * 3.0 + uv.x * 20.0); c = mix(uCA, uCB * pulse * 1.4, clamp(l, 0.0, 1.0)); emis = max(emis, clamp(l, 0.0, 1.0) * 0.85); }
    else { vec2 q = fract(uv * 60.0); float wv = step(0.5, q.x) == step(0.5, q.y) ? 1.0 : 0.0; c = mix(uCA, uCB, wv * (0.6 + 0.4 * q.x)); spec = 0.15; }
    base = c;
  }
  float d = max(dot(n, uSun), 0.0);
  float hemi = 0.5 + 0.5 * n.y;
  vec3 col = base * (uAmb * (0.48 + 0.52 * hemi) + uSunCol * d) + spec * uSunCol * d;
  col = mix(col, base, emis);
  float f = clamp((vD - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  col = mix(col, uFogCol, f * (2.0 - f) * 0.92);
  gl_FragColor = vec4(col, uAlpha);
}`;
function glInit(canvas) {
  const ds = !!(SET.desync && !navigator.webdriver), aa = SET.msaa !== false;
  const gl = canvas.getContext('webgl', { antialias: aa, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false, desynchronized: ds }) || canvas.getContext('webgl', { antialias: aa, alpha: false });
  if (!gl) throw new Error('WebGLが使えません');
  R.gl = gl;
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
  const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  R.prog = p; gl.useProgram(p);
  for (const n of ['aPos', 'aNor', 'aCol']) R.loc[n] = gl.getAttribLocation(p, n);
  for (const n of ['uP', 'uV', 'uM', 'uLoc', 'uTint', 'uSun', 'uSunCol', 'uAmb', 'uFogCol', 'uFog', 'uEmis', 'uTex', 'uAlpha', 'uCamo', 'uCA', 'uCB', 'uCC', 'uTime']) R.loc[n] = gl.getUniformLocation(p, n);
  gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
  R.cube = makeMesh(boxVerts([], [-.5, -.5, -.5], [.5, .5, .5], [1, 1, 1], 0));
}
// push 36 verts (pos,nor,col interleaved) for a box
const FACES = [
  [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]], [[-1, 0, 0], [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]]],
  [[0, 1, 0], [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]]], [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
  [[0, 0, 1], [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]]], [[0, 0, -1], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]],
];
function boxVerts(out, mn, mx, col, jitter, skipBottom) {
  for (let fi = 0; fi < 6; fi++) {
    if (skipBottom && fi === 3) continue;
    const [n, q] = FACES[fi];
    const sh = 1 + (jitter ? (Math.random() - .5) * jitter : 0);
    const c = [col[0] * sh, col[1] * sh, col[2] * sh];
    const P = q.map(k => [k[0] ? mx[0] : mn[0], k[1] ? mx[1] : mn[1], k[2] ? mx[2] : mn[2]]);
    for (const i of [0, 1, 2, 0, 2, 3]) out.push(P[i][0], P[i][1], P[i][2], n[0], n[1], n[2], c[0], c[1], c[2]);
  }
  return out;
}
function makeMesh(arr) {
  const gl = R.gl, b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
  return { buf: b, n: arr.length / 9 };
}
function bindMesh(m) {
  const gl = R.gl; gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
  const L = R.loc;
  gl.enableVertexAttribArray(L.aPos); gl.vertexAttribPointer(L.aPos, 3, gl.FLOAT, false, 36, 0);
  gl.enableVertexAttribArray(L.aNor); gl.vertexAttribPointer(L.aNor, 3, gl.FLOAT, false, 36, 12);
  gl.enableVertexAttribArray(L.aCol); gl.vertexAttribPointer(L.aCol, 3, gl.FLOAT, false, 36, 24);
}
// fixed 16:9 stage: everything (3D, HUD, menus) is laid out at STAGE_W x STAGE_H and scaled to fit the window (letterboxed)
const STAGE_W = 1440, STAGE_H = 810;
let _stageKey = '';
function fitStage() {
  const s = Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H), ox = Math.round((innerWidth - STAGE_W * s) / 2), oy = Math.round((innerHeight - STAGE_H * s) / 2);
  const key = innerWidth + 'x' + innerHeight;
  if (key !== _stageKey) { _stageKey = key; const st = document.getElementById('stage'); if (st) st.style.transform = `translate(${ox}px,${oy}px) scale(${s})`; }
  R.stageS = s;
  return s;
}
function resize(gl, hud) {
  const s = fitStage(), dev = Math.min(window.devicePixelRatio || 1, 1.5);
  const dpr = s * dev * (SET.resScale || 1) * (SET.autoRes ? R.dyn : 1);
  const w = Math.max(16, Math.floor(STAGE_W * dpr)), h = Math.max(9, Math.floor(STAGE_H * dpr));
  if (gl.width !== w || gl.height !== h) { gl.width = w; gl.height = h; }
  const hd = s * dev;
  const hw = Math.floor(STAGE_W * hd), hh = Math.floor(STAGE_H * hd);
  if (hud.width !== hw || hud.height !== hh) { hud.width = hw; hud.height = hh; }
  R.w = w; R.h = h; R.hudScale = hd;
}
// set frame-wide uniforms. view: Float32Array, proj: Float32Array
function beginPass(proj, view, fogNear, fogFar, sunDir) {
  const gl = R.gl, L = R.loc;
  gl.uniformMatrix4fv(L.uP, false, proj); gl.uniformMatrix4fv(L.uV, false, view);
  gl.uniform3fv(L.uSun, sunDir || R.sun); gl.uniform3fv(L.uFogCol, R.fogCol); gl.uniform2f(L.uFog, fogNear, fogFar);
  gl.uniform3fv(L.uSunCol, R.sunCol); gl.uniform3fv(L.uAmb, R.amb); gl.uniform1f(L.uTime, (performance.now() / 1000) % 1000);
  gl.uniformMatrix4fv(L.uLoc, false, R.I); gl.uniform1f(L.uCamo, 0); R.camo = 0;
  gl.uniform1f(L.uEmis, 0); gl.uniform1f(L.uTex, 0); gl.uniform1f(L.uAlpha, 1); gl.uniform4f(L.uTint, 1, 1, 1, 1);
}
let _curMesh = null;
function setCamo(c, loc) {
  const gl = R.gl, L = R.loc;
  if (!c || !c.pat) { if (R.camo) { gl.uniform1f(L.uCamo, 0); R.camo = 0; } return; }
  gl.uniform1f(L.uCamo, c.pat); gl.uniform3fv(L.uCA, c.a); gl.uniform3fv(L.uCB, c.b); gl.uniform3fv(L.uCC, c.c); R.camo = c.pat;
  gl.uniformMatrix4fv(L.uLoc, false, loc);
}
function drawMesh(mesh, model, tint, emis, tex, alpha) {
  const gl = R.gl, L = R.loc;
  if (_curMesh !== mesh) { bindMesh(mesh); _curMesh = mesh; }
  gl.uniformMatrix4fv(L.uM, false, model || R.I);
  gl.uniform4f(L.uTint, tint ? tint[0] : 1, tint ? tint[1] : 1, tint ? tint[2] : 1, 1);
  gl.uniform1f(L.uEmis, emis || 0); gl.uniform1f(L.uTex, tex || 0); gl.uniform1f(L.uAlpha, alpha == null ? 1 : alpha);
  gl.drawArrays(gl.TRIANGLES, 0, mesh.n);
}
// draw a cube: model matrix already includes scale
function drawCube(m, col, emis, alpha) { drawMesh(R.cube, m, col, emis, 0, alpha); }

// ============================================================
//  AUDIO (synthesized)
// ============================================================
const AU = { ctx: null, master: null, noise: null, verb: null };
function audioInit() {
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)();
    AU.ctx = c; AU.master = c.createGain(); AU.master.gain.value = SET.vol; AU.master.connect(c.destination);
    const len = c.sampleRate * 1.5, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    AU.noise = b;
    // cheap reverb: feedback delay
    const dl = c.createDelay(1), fb = c.createGain(), lp = c.createBiquadFilter();
    dl.delayTime.value = 0.11; fb.gain.value = 0.38; lp.type = 'lowpass'; lp.frequency.value = 1800;
    dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(AU.master);
    AU.verb = dl;
  } catch (e) { AU.ctx = null; }
}
function sndOut(pan, vol, verb) {
  const c = AU.ctx, g = c.createGain(); g.gain.value = vol;
  let node = g;
  if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); node = p; }
  node.connect(AU.master);
  if (verb) { const vg = c.createGain(); vg.gain.value = verb; g.connect(vg); vg.connect(AU.verb); }
  return g;
}
function noiseBurst(dst, t0, dur, f0, f1, q, type) {
  const c = AU.ctx, s = c.createBufferSource(); s.buffer = AU.noise;
  const f = c.createBiquadFilter(); f.type = type || 'lowpass'; f.Q.value = q || 0.7;
  f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
  const g = c.createGain(); g.gain.setValueAtTime(1, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(dst); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
}
function tone(dst, t0, dur, f0, f1, type, vol) {
  const c = AU.ctx, o = c.createOscillator(); o.type = type || 'sine';
  o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = c.createGain(); g.gain.setValueAtTime(vol || 1, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g); g.connect(dst); o.start(t0); o.stop(t0 + dur + 0.05);
}
// kind: 'sniper','ar','smg','pistol'; dist in meters (0 = own); pan -1..1
function sfxShot(kind, dist, pan, sup, volMul) {
  if (!AU.ctx) return; const c = AU.ctx, t = c.currentTime;
  const far = clamp(dist / 80, 0, 1);
  const vol = (dist ? clamp(1.2 / (1 + dist * 0.06), 0.04, 0.7) : 0.9) * (volMul || 1);
  if (sup) { const o = sndOut(pan, vol * 0.7, 0.1); noiseBurst(o, t, 0.12, 2500, 400, 1.2); tone(o, t, 0.06, 300, 120, 'sine', 0.3); noiseBurst(o, t + 0.01, 0.03, 6000, 4000, 3, 'bandpass'); return; }
  const o = sndOut(pan, vol, 0.25 + far * 0.4);
  if (kind === 'sg') { noiseBurst(o, t, 0.5, lerp(5000, 1200, far), 100, 0.7); tone(o, t, 0.25, 110, 40, 'sine', 1.4); }
  else if (kind === 'sniper') {
    noiseBurst(o, t, 0.9, lerp(6000, 1200, far), 120, 0.8);
    tone(o, t, 0.35, 95, 38, 'sine', 1.3);
    noiseBurst(o, t, 0.06, 9000, 3000, 0.5, 'highpass');
  } else if (kind === 'pistol') {
    noiseBurst(o, t, 0.25, lerp(5000, 1500, far), 200, 0.8); tone(o, t, 0.12, 160, 60, 'sine', 0.7);
  } else {
    noiseBurst(o, t, kind === 'smg' ? 0.16 : 0.22, lerp(4500, 1200, far), 180, 0.8);
    tone(o, t, 0.1, 130, 55, 'sine', 0.8);
  }
}
function sfxClick(f, v, d) { if (!AU.ctx) return; const t = AU.ctx.currentTime, o = sndOut(0, v || 0.3); noiseBurst(o, t, d || 0.04, f || 3000, (f || 3000) * 0.6, 3, 'bandpass'); }
function sfxBolt() { if (!AU.ctx) return; const t = AU.ctx.currentTime, o = sndOut(0, 0.35); noiseBurst(o, t + 0.18, 0.05, 2400, 1500, 4, 'bandpass'); noiseBurst(o, t + 0.36, 0.06, 1800, 1100, 4, 'bandpass'); noiseBurst(o, t + 0.56, 0.05, 2600, 2000, 4, 'bandpass'); }
function sfxHit(kill) { if (!AU.ctx) return; const t = AU.ctx.currentTime, o = sndOut(0, kill ? 0.5 : 0.4); tone(o, t, 0.06, 2600, 2400, 'square', 0.25); noiseBurst(o, t, 0.03, 6000, 5000, 5, 'bandpass'); }
function sfxStep(v, pan) { if (!AU.ctx) return; const t = AU.ctx.currentTime, o = sndOut(pan || 0, v || 0.08); noiseBurst(o, t, 0.08, 700, 200, 1); }
function sfxPump() { if (!AU.ctx) return; const t = AU.ctx.currentTime, o = sndOut(0, 0.35); noiseBurst(o, t + 0.12, 0.07, 1500, 900, 3, 'bandpass'); noiseBurst(o, t + 0.32, 0.07, 1900, 1200, 3, 'bandpass'); }
function sfxBreath(inhale) { if (!AU.ctx) return; const t = AU.ctx.currentTime, o = sndOut(0, 0.12); noiseBurst(o, t, inhale ? 0.45 : 0.6, inhale ? 1500 : 900, inhale ? 2500 : 400, 1.5, 'bandpass'); }
function sfxHurt() { if (!AU.ctx) return; const t = AU.ctx.currentTime, o = sndOut(0, 0.35); noiseBurst(o, t, 0.12, 900, 300, 2); tone(o, t, 0.1, 180, 90, 'triangle', 0.4); }
function sfxSwing() { if (!AU.ctx) return; const t = AU.ctx.currentTime, o = sndOut(0, 0.2); noiseBurst(o, t, 0.18, 1200, 4000, 2, 'bandpass'); }
function sfxUAV() { if (!AU.ctx) return; const t = AU.ctx.currentTime, o = sndOut(0, 0.25); tone(o, t, 0.25, 880, 880, 'sine', 0.4); tone(o, t + 0.28, 0.25, 1320, 1320, 'sine', 0.4); }
function sfxJump() { if (!AU.ctx) return; const t = AU.ctx.currentTime, o = sndOut(0, 0.1); noiseBurst(o, t, 0.1, 500, 200, 1); }
function sfxBoom(dist, pan, big) {
  if (!AU.ctx) return; const t = AU.ctx.currentTime, far = clamp(dist / 60, 0, 1);
  const o = sndOut(pan || 0, clamp(1.4 / (1 + dist * 0.05), 0.08, 1) * (big ? 1.3 : 1), 0.5 + far * 0.3);
  noiseBurst(o, t, 1.4, lerp(3000, 700, far), 60, 0.6); tone(o, t, 0.8, 70, 25, 'sine', 1.6); noiseBurst(o, t + 0.05, 0.4, 1800, 200, 0.8);
}
function sfxBeep(f, v) { if (!AU.ctx) return; const t = AU.ctx.currentTime, o = sndOut(0, v || 0.12); tone(o, t, 0.07, f || 1800, f || 1800, 'square', 0.3); }
function sfxRing() { if (!AU.ctx) return; const t = AU.ctx.currentTime, o = sndOut(0, 0.12); tone(o, t, 3.0, 3600, 3400, 'sine', 0.5); }
function sfxPlasma(dist) { if (!AU.ctx) return; const t = AU.ctx.currentTime, o = sndOut(0, dist ? 0.2 : 0.4, 0.2); tone(o, t, 0.25, 900, 180, 'sawtooth', 0.4); noiseBurst(o, t, 0.15, 4000, 1500, 2, 'bandpass'); }
function sfxBuy() { if (!AU.ctx) return; const t = AU.ctx.currentTime, o = sndOut(0, 0.3); tone(o, t, 0.08, 1320, 1320, 'triangle', 0.6); tone(o, t + 0.09, 0.12, 1760, 1760, 'triangle', 0.6); }
function sfxDeny() { if (!AU.ctx) return; const t = AU.ctx.currentTime, o = sndOut(0, 0.3); tone(o, t, 0.18, 220, 180, 'square', 0.3); }
function sfxRound(start) { if (!AU.ctx) return; const t = AU.ctx.currentTime, o = sndOut(0, 0.35, 0.4); const fs = start ? [196, 233, 294, 233] : [294, 233, 196, 147]; fs.forEach((f, i) => tone(o, t + i * 0.32, 0.6, f, f * 0.99, 'triangle', 0.7)); }
function sfxGroan(dist, pan) { if (!AU.ctx) return; const t = AU.ctx.currentTime, o = sndOut(pan || 0, clamp(0.5 / (1 + dist * 0.15), 0.02, 0.3), 0.3); const f = rand(80, 130); tone(o, t, rand(0.5, 0.9), f, f * 0.7, 'sawtooth', 0.35); noiseBurst(o, t, 0.5, 600, 300, 3, 'bandpass'); }
function sfxSlide() { if (!AU.ctx) return; const t = AU.ctx.currentTime, o = sndOut(0, 0.22); noiseBurst(o, t, 0.75, 1400, 300, 0.8); noiseBurst(o, t, 0.4, 3000, 1200, 1.5, 'bandpass'); }
function sfxThud(v) { if (!AU.ctx) return; const t = AU.ctx.currentTime, o = sndOut(0, v || 0.3); noiseBurst(o, t, 0.25, 600, 120, 1); tone(o, t, 0.15, 90, 45, 'sine', 0.8); }
function sfxCloth() { if (!AU.ctx) return; const t = AU.ctx.currentTime, o = sndOut(0, 0.09); noiseBurst(o, t, 0.22, 2200, 900, 1.2, 'bandpass'); }
