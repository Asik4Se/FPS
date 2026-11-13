// ============================================================
//  RENDER: world / sky / bots / fx / viewmodel
// ============================================================
let SKY = null;
const _m = new Float32Array(16), _b = new Float32Array(16), _vm = new Float32Array(16);
function buildSky() {
  const top = R.skyTop, hor = R.fogCol, arr = [];
  for (const [n, q] of FACES) {
    const P = q.map(k => [k[0] ? 1 : -1, k[1] ? 1 : -1, k[2] ? 1 : -1]);
    for (const i of [0, 1, 2, 0, 2, 3]) { const p = P[i], c = p[1] > 0 ? top : hor; arr.push(p[0], p[1] * 0.35, p[2], -n[0], -n[1], -n[2], c[0], c[1], c[2]); }
  }
  if (SKY) R.gl.deleteBuffer(SKY.buf);
  SKY = makeMesh(arr);
}
function renderFrame() {
  const gl = R.gl, p = G.player;
  gl.viewport(0, 0, R.w, R.h);
  gl.clearColor(R.fogCol[0], R.fogCol[1], R.fogCol[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  _curMesh = null;
  // camera
  let eye, yaw, pitch, roll;
  if (p.alive) { eye = eyePos(p); yaw = p.camYaw; pitch = p.camPitch; roll = p.camRoll; }
  else { const k = p.deathCam; eye = [p.pos[0], p.pos[1] + lerp(p.eyeH, 0.3, k), p.pos[2]]; yaw = p.camYaw; pitch = p.camPitch + k * 0.3; roll = k * 0.6; }
  const fov = p.alive ? p.fov : SET.fov;
  M4.persp(R.P, fov * DEG, R.w / R.h, 0.05, 600);
  const Vw = M4.ident(R.Vw); M4.rz(Vw, -roll); M4.rx(Vw, -pitch); M4.ry(Vw, -yaw); M4.tr(Vw, -eye[0], -eye[1], -eye[2]);
  R.VP = mat4mul(R.P, Vw); R.eye = eye;
  // sky
  gl.disable(gl.CULL_FACE); gl.depthMask(false);
  beginPass(R.P, Vw, 1e6, 2e6);
  M4.ident(_m); M4.tr(_m, eye[0], eye[1], eye[2]); M4.sc(_m, 300, 300, 300);
  drawMesh(SKY, _m, null, 1, 0);
  gl.depthMask(true); gl.enable(gl.CULL_FACE);
  // world
  beginPass(R.P, Vw, R.fogNear, R.fogFar);
  drawMesh(R.world, R.I, null, 0, 1);
  // emissive lamps
  for (const b of W.boxes) if (b.emis) { M4.ident(_m); M4.tr(_m, (b.mn[0] + b.mx[0]) / 2, b.mn[1] - 0.02, (b.mn[2] + b.mx[2]) / 2); M4.sc(_m, b.mx[0] - b.mn[0] - 0.05, 0.03, b.mx[2] - b.mn[2] - 0.05); drawCube(_m, [1, 0.97, 0.85], 1); }
  // bots / zombies
  for (const b of G.bots) drawBot(b);
  for (const b of G.zombies) drawBot(b);
  drawExtras();
  if (p.alive && !G.menuCam) drawOwnLegs(p);
  // particles (solid)
  for (const q of G.parts) { if (q.smoke) continue; M4.ident(_m); M4.tr(_m, ...q.pos); M4.sc(_m, q.size, q.size, q.size); drawCube(_m, q.col, q.emis || 0); }
  // transparent: tracers
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
  for (const q of G.parts) { if (!q.smoke) continue; const k = q.t / q.life, sz = q.size * (0.6 + k * 0.8); M4.ident(_m); M4.tr(_m, ...q.pos); M4.ry(_m, q.size * 3 + k); M4.rx(_m, q.size * 2); M4.sc(_m, sz, sz, sz); drawCube(_m, q.col, 0.35, 0.55 * Math.sin(Math.PI * Math.min(1, k * 1.2))); }
  for (const t of G.tracers) {
    const k = t.t / t.life; const a = t.a, bb = t.b;
    const d = V.sub(bb, a), L = V.len(d); if (L < 0.5) continue;
    // draw only a moving segment for bots, full beam fading for player sniper
    const s0 = t.bot ? clamp(k * 1.4 - 0.3, 0, 1) : 0, s1 = t.bot ? clamp(k * 1.4, 0, 1) : 1;
    const pa = V.add(a, V.mul(d, s0)), pb = V.add(a, V.mul(d, s1)), mid = V.mul(V.add(pa, pb), 0.5), seg = L * (s1 - s0);
    if (seg < 0.1) continue;
    const [ty, tp] = yawPitchOf(V.mul(d, 1 / L));
    M4.ident(_m); M4.tr(_m, ...mid); M4.ry(_m, ty); M4.rx(_m, tp); if (t.zap) { M4.rz(_m, Math.random() * 6); M4.sc(_m, 0.05, 0.05, seg); drawCube(_m, [0.55, 0.85, 1], 1, 0.9 * (1 - k)); continue; }
    M4.sc(_m, 0.012, 0.012, seg);
    drawCube(_m, t.bot ? [1, 0.85, 0.45] : [1, 0.95, 0.8], 1, t.bot ? 0.7 : 0.5 * (1 - k));
  }
  gl.depthMask(true); gl.disable(gl.BLEND);
  // viewmodel
  if (p.alive && !isScoped(p)) drawViewmodel(p);
}
function mat4mul(a, b) { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
function box(c, s, col, emis, ry, alpha) { M4.ident(_m); M4.tr(_m, ...c); if (ry) M4.ry(_m, ry); M4.sc(_m, ...s); drawCube(_m, col, emis, alpha); }
const NADE_COL = { frag: [0.25, 0.32, 0.20], semtex: [0.55, 0.55, 0.52], c4: [0.55, 0.45, 0.30], claymore: [0.30, 0.36, 0.22], flash: [0.75, 0.75, 0.72], stun: [0.35, 0.40, 0.55], smoke: [0.40, 0.45, 0.35], sensor: [0.25, 0.30, 0.38], gl: [0.25, 0.30, 0.20], bomb: [0.25, 0.25, 0.27] };
// player's own legs in the world (visible when looking down, and while sliding / diving)
function drawOwnLegs(p) {
  const pants = [0.24, 0.25, 0.20], boot = [0.14, 0.13, 0.12];
  const sl = p.slideK || 0, pr = p.stance === 'prone' ? 1 : 0;
  M4.ident(_b); M4.tr(_b, p.pos[0], p.pos[1], p.pos[2]); M4.ry(_b, p.yaw);
  const segW = (a, b, th, col) => { const d = V.sub(b, a), L = V.len(d); if (L < 0.01) return; const [ty, tp] = yawPitchOf(V.mul(d, 1 / L)), mid = V.mul(V.add(a, b), 0.5); M4.copy(_m, _b); M4.tr(_m, ...mid); M4.ry(_m, ty); M4.rx(_m, tp); M4.sc(_m, th, th, L); drawCube(_m, col); };
  for (const sd of [-1, 1]) {
    let hip, knee, foot;
    if (sl > 0.05) { // sliding: legs stretched forward, one knee bent
      hip = [sd * 0.13, 0.32, 0.12]; knee = sd < 0 ? [sd * 0.17, 0.42, -0.42] : [sd * 0.15, 0.2, -0.5]; foot = sd < 0 ? [sd * 0.2, 0.12, -0.75] : [sd * 0.16, 0.12, -0.98];
    } else if (pr) { // prone: legs behind
      hip = [sd * 0.13, 0.2, 0.2]; knee = [sd * 0.17, 0.16, 0.62]; foot = [sd * 0.2, 0.12, 1.05];
    } else {
      const sw = Math.sin(p.bobT) * 0.18 * p.bobAmt * sd, crouch = p.stance === 'crouch' ? 1 : 0;
      hip = [sd * 0.11, crouch ? 0.56 : 0.88, 0.1]; knee = crouch ? [sd * 0.12, 0.36, -0.28] : [sd * 0.11, 0.46, 0.06 - sw]; foot = [sd * 0.12, 0.08, crouch ? 0.05 : 0.04 + sw * 1.2];
    }
    segW(hip, knee, 0.17, pants); segW(knee, foot, 0.15, pants);
    M4.copy(_m, _b); M4.tr(_m, foot[0], foot[1] - 0.02, foot[2] - (pr ? -0.06 : 0.08)); M4.sc(_m, 0.13, 0.11, 0.27); drawCube(_m, boot);
  }
}
function drawExtras() {
  const t = G.time;
  // projectiles
  for (const pr of G.projs) {
    if (pr.type === 'axe') {
      M4.ident(_m); M4.tr(_m, ...pr.pos); M4.ry(_m, pr.yaw || 0); M4.rx(_m, pr.spin || 0);
      M4.copy(_b, _m); M4.sc(_b, 0.04, 0.04, 0.45); drawCube(_b, [0.35, 0.25, 0.15]);
      M4.copy(_b, _m); M4.tr(_b, 0, 0.06, -0.18); M4.sc(_b, 0.02, 0.16, 0.12); drawCube(_b, [0.6, 0.62, 0.65]); continue;
    }
    if (pr.type === 'plasma') { box(pr.pos, [0.18, 0.18, 0.18], [0.4, 1, 0.5], 1, t * 5); continue; }
    if (pr.type === 'claymore') { box([pr.pos[0], pr.pos[1] + 0.12, pr.pos[2]], [0.28, 0.2, 0.06], NADE_COL.claymore, 0, pr.yaw); for (const sx of [-0.08, 0.08]) box([pr.pos[0], pr.pos[1] + 0.03, pr.pos[2]], [0.02, 0.06, 0.02], [0.2, 0.2, 0.2], 0, pr.yaw); if (pr.owner && pr.owner.isPlayer || pr.team && pr.team === G.player.team) box([pr.pos[0] - Math.sin(pr.yaw) * 0.04, pr.pos[1] + 0.25, pr.pos[2] - Math.cos(pr.yaw) * 0.04], [0.02, 0.02, 0.02], [1, 0.1, 0.1], 1); continue; }
    const c = NADE_COL[pr.type] || [0.3, 0.3, 0.3], sz = pr.type === 'bomb' ? [0.35, 0.35, 1.2] : pr.type === 'c4' ? [0.2, 0.1, 0.14] : [0.11, 0.15, 0.11];
    M4.ident(_m); M4.tr(_m, ...pr.pos); M4.ry(_m, pr.yaw || 0); if (!pr.stuck && pr.type !== 'bomb') M4.rx(_m, pr.spin || 0); if (pr.type === 'bomb') M4.rx(_m, Math.PI / 2); M4.sc(_m, ...sz); drawCube(_m, c);
    if ((pr.type === 'semtex' || pr.type === 'c4' || pr.type === 'sensor') && Math.sin(t * 14) > 0) box(V.add(pr.pos, [0, 0.08, 0]), [0.03, 0.03, 0.03], pr.type === 'sensor' ? [0.3, 0.6, 1] : [1, 0.1, 0.1], 1);
  }
  // drones
  for (const d of G.drones) {
    const yaw = Math.atan2(-d.vel[0], -d.vel[2]);
    box(d.pos, [0.35, 0.12, 0.5], [0.18, 0.19, 0.2], 0, yaw);
    for (const [ox, oz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) box(V.add(d.pos, [ox, 0.08, oz]), [0.28, 0.02, 0.06], [0.1, 0.1, 0.1], 0, t * 40 + ox);
    box(V.add(d.pos, [0, -0.08, 0]), [0.05, 0.05, 0.05], isEnemy(G.player, d.owner) ? [1, 0.15, 0.1] : [0.3, 0.7, 1], 1);
  }
  // sentries
  for (const s of G.sentries) {
    const p = s.pos;
    for (const a of [0, 2.1, 4.2]) { M4.ident(_m); M4.tr(_m, p[0], p[1] + 0.35, p[2]); M4.ry(_m, a); M4.rx(_m, 0.45); M4.sc(_m, 0.05, 0.75, 0.05); drawCube(_m, [0.2, 0.2, 0.2]); }
    M4.ident(_b); M4.tr(_b, p[0], p[1] + 1.0, p[2]); M4.ry(_b, s.yaw); M4.rx(_b, s.pitch || 0);
    M4.copy(_m, _b); M4.sc(_m, 0.3, 0.25, 0.45); drawCube(_m, [0.30, 0.33, 0.28]);
    M4.copy(_m, _b); M4.tr(_m, 0, 0.02, -0.45); M4.sc(_m, 0.06, 0.06, 0.5); drawCube(_m, [0.12, 0.12, 0.12]);
    M4.copy(_m, _b); M4.tr(_m, 0, 0.16, 0); M4.sc(_m, 0.04, 0.04, 0.04); drawCube(_m, s.team && s.team === G.player.team || s.owner === G.player ? [0.3, 0.7, 1] : [1, 0.2, 0.1], 1);
    if (s.firedT && t - s.firedT < 0.04) { M4.copy(_m, _b); M4.tr(_m, 0, 0.02, -0.75); M4.sc(_m, 0.12, 0.12, 0.15); drawCube(_m, [1, 0.8, 0.4], 1); }
  }
  // domination flags
  for (const f of G.flags) {
    const c = f.owner ? TEAMC3[f.owner === G.player.team ? 'A' : 'B'] : [0.85, 0.85, 0.85];
    box([f.pos[0], 1.6, f.pos[2]], [0.08, 3.2, 0.08], [0.3, 0.3, 0.32]);
    box([f.pos[0] + 0.45, 2.8, f.pos[2]], [0.9, 0.55, 0.03], c, 0.35, Math.sin(t * 2) * 0.2);
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; box([f.pos[0] + Math.cos(a) * 4.5, 0.03, f.pos[2] + Math.sin(a) * 4.5], [1.6, 0.05, 0.12], c, 0.6, -a + Math.PI / 2); }
  }
  // KC tags
  for (const tg of G.tags) box([tg.pos[0], tg.pos[1] + Math.sin(t * 3 + tg.pos[0]) * 0.1, tg.pos[2]], [0.22, 0.32, 0.03], tg.team === G.player.team ? [0.3, 0.65, 1] : [1, 0.75, 0.15], 0.7, t * 2.5);
  // zombies: buyables, power-ups, box
  if (G.mode === 'zombies' && G.zm) {
    for (const b of W.buys) {
      if (b.type === 'wall') { // chalk outline of the weapon on the wall
        const yaw = Math.atan2(-b.n[0], -b.n[2]) + Math.PI, p = V.add(b.pos, V.mul(b.n, 0.02));
        M4.ident(_b); M4.tr(_b, ...p); M4.ry(_b, yaw);
        const chalk = [0.92, 0.90, 0.82];
        for (const [cx, cy, sx, sy] of [[0, 0, 0.9, 0.04], [0, -0.13, 0.5, 0.03], [-0.42, -0.06, 0.04, 0.16], [0.42, -0.02, 0.04, 0.08], [-0.1, -0.24, 0.05, 0.2], [0.2, -0.22, 0.05, 0.16]]) { M4.copy(_m, _b); M4.tr(_m, cx, cy, 0); M4.sc(_m, sx, sy, 0.01); drawCube(_m, chalk, 0.7); }
      }
      if (b.type === 'perk') { const pk = ZPERKS[b.perk], p = b.pos; box([p[0], 1.45, p[2]], b.rot ? [0.92, 0.5, 0.6] : [0.6, 0.5, 0.92], pk.col, 0.8); box([p[0], 2.3, p[2]], [0.5, 0.15, 0.5], pk.col, 1, t); }
      if (b.type === 'ammo') { const p = b.pos; box([p[0], 0.81, p[2]], [1.22, 0.04, 0.2], [0.9, 0.72, 0.2], 0.5); for (let i = 0; i < 4; i++) box([p[0] - 0.33 + i * 0.22, 0.95, p[2]], [0.07, 0.24, 0.07], [0.85, 0.65, 0.25], 0.35); box([p[0], 1.35 + Math.sin(t * 2) * 0.05, p[2]], [0.12, 0.12, 0.12], [0.5, 1, 0.5], 0.9, t); }
      if (b.type === 'pap') { const p = b.pos; box([p[0], 1.7, p[2]], [1.6, 0.15, 1.0], [0.75, 0.35, 1], 0.5 + 0.4 * Math.sin(t * 3)); box([p[0], 0.9, p[2] - 0.72], [1.4, 0.3, 0.04], [0.75, 0.35, 1], 0.9); }
    }
    const bl = W.boxLocs[G.zm.box];
    if (bl) {
      const p = bl.pos; box([p[0], 0.45, p[2]], [1.8, 0.9, 0.9], [0.40, 0.28, 0.16]); box([p[0], 0.92, p[2]], [1.85, 0.06, 0.95], [0.30, 0.20, 0.10]);
      box([p[0], 3.5, p[2]], [0.25, 7, 0.25], [0.6, 0.85, 1], 0.9, 0, 0.18);
      const r = G.zm.roll;
      if (r) { const show = r.done ? r.wid : pick(PRIMARIES); box([p[0], 1.3 + Math.min(r.t, 3) * 0.12, p[2]], [0.7, 0.14, 0.08], WPN[show].cls === 'sniper' ? [0.4, 0.4, 0.35] : [0.25, 0.25, 0.26], r.done ? 0.3 : 0.6, t * (r.done ? 0.5 : 6)); }
    }
    for (const pw of G.zm.pows) { if (pw.t > 20 && Math.sin(t * 12) < 0) continue; box([pw.pos[0], pw.pos[1] + Math.sin(t * 3) * 0.15, pw.pos[2]], [0.45, 0.45, 0.45], ZPOW[pw.type].col, 0.9, t * 2); }
    for (const d of W.doors) if (!d.open) box([d.pos[0], 3.1, d.pos[2]], [0.3, 0.06, 0.3], [1, 0.8, 0.3], 1, t);
    zqDraw(t);
  }
}
const SKINC = { skin: [0.80, 0.62, 0.50], glove: [0.14, 0.14, 0.15], boots: [0.16, 0.14, 0.12], gun: [0.12, 0.12, 0.13], visor: [0.05, 0.06, 0.07] };
function drawBot(b) {
  if (!b.alive && G.time - b.deathT > 2.6) return;
  const flash = G.time - b.lastDmgT < 0.08;
  const tc = b.team && b.team !== 'Z' ? TEAMC3[b.team === G.player.team ? 'A' : 'B'] : null;
  const col = k => b.isZombie ? (k === 'skin' || k === 'glove' ? b.skin.skin : k === 'shirt' ? b.skin.shirt : k === 'pants' || k === 'boots' ? b.skin.pants : SKINC[k])
    : k === 'shirt' ? b.skin.shirt : k === 'pants' ? b.skin.pants : k === 'vest' ? (tc ? tc.map(v => v * 0.45) : b.skin.vest) : k === 'helmet' ? (tc ? tc.map(v => v * 0.7) : b.skin.vest.map(v => v * 1.15)) : SKINC[k];
  const parts = rigParts(b);
  let gun = null;
  for (const p of parts) {
    M4.copy(_m, p.m); M4.sc(_m, ...p.s);
    drawCube(_m, flash ? [1, 0.8, 0.8] : col(p.k), flash ? 0.3 : 0);
    if (p.gun) gun = p;
  }
  if (b.isZombie) { const head = parts.find(p => p.z === 'head'); if (head) for (const ex of [-0.06, 0.06]) { M4.copy(_m, head.m); M4.tr(_m, ex, 0.01, -0.136); M4.sc(_m, 0.045, 0.03, 0.01); drawCube(_m, [1, 0.55, 0.1], 1); } }
  if (gun && b.alive && G.time - b.firedT < 0.045) { M4.copy(_m, gun.m); M4.tr(_m, 0, 0.02, -0.48); M4.sc(_m, 0.14, 0.14, 0.2); drawCube(_m, [1, 0.8, 0.4], 1); }
}
// ---------- viewmodel ----------
const _l = new Float32Array(16);
let VMGLASS = [];
let VMW = null; // weapon being drawn (for camo)
function seg(base, a, b, th, col) {
  const d = V.sub(b, a), L = V.len(d), [ty, tp] = yawPitchOf(V.mul(d, 1 / L)), mid = V.mul(V.add(a, b), 0.5);
  M4.copy(_m, base); M4.tr(_m, ...mid); M4.ry(_m, ty); M4.rx(_m, tp); M4.sc(_m, th, th, L); drawCube(_m, col);
}
function part(base, c, s, col, emis, camo) {
  M4.copy(_m, base); M4.tr(_m, ...c); M4.sc(_m, ...s);
  if (camo && VMW && VMW.camo && VMW.camo.pat) { M4.ident(_l); M4.tr(_l, ...c); M4.sc(_l, ...s); setCamo(VMW.camo, _l); drawCube(_m, col, emis); setCamo(null); }
  else drawCube(_m, col, emis);
}
const smooth = t => t * t * (3 - 2 * t);
// ---------- iron sights (per weapon model) ----------
// y = sight line height (screen center when ADS). rear: closer to the eye, front: near the muzzle.
const IRON = {
  rifle:    { y: 0.070, base: 0.035, rear: { t: 'notch', z: 0.10, w: 0.040 }, front: { t: 'hood', z: -0.50 } },
  rifle2:   { y: 0.072, base: 0.035, rear: { t: 'peep', z: 0.11, r: 0.009 }, front: { t: 'ears', z: -0.56, dot: [1, 1, 1] } },
  burst:    { y: 0.095, base: 0.055, rear: { t: 'ghost', z: 0.10, r: 0.016, handle: 1 }, front: { t: 'tower', z: -0.47, dot: [0.3, 1, 0.4] } },
  smg:      { y: 0.070, base: 0.035, rear: { t: 'peep', z: 0.09, r: 0.008 }, front: { t: 'hood', z: -0.36, dot: [1, 1, 1] } },
  smgc:     { y: 0.070, base: 0.042, rear: { t: 'notch', z: 0.06, w: 0.034, dots: [1, 1, 1] }, front: { t: 'post', z: -0.22, dot: [1, 1, 1] } },
  pdw:      { y: 0.115, base: 0.093, rear: { t: 'ghost', z: 0.12, r: 0.015 }, front: { t: 'post', z: -0.15, dot: [1, 0.55, 0.1] } },
  lmg:      { y: 0.090, base: 0.065, rear: { t: 'leaf', z: 0.08, w: 0.044 }, front: { t: 'ears', z: -0.60, dot: [1, 0.55, 0.1] } },
  autosg:   { y: 0.072, base: 0.042, rear: { t: 'ghost', z: 0.08, r: 0.014 }, front: { t: 'post', z: -0.55, dot: [1, 0.15, 0.1] } },
  shotgun:  { y: 0.045, base: 0.035, rear: { t: 'rib', z: -0.06 }, front: { t: 'bead', z: -0.73 } },
  pistol:   { y: 0.055, base: 0.040, rear: { t: 'notch', z: 0.01, w: 0.032, dots: [1, 1, 1] }, front: { t: 'post', z: -0.17, dot: [1, 1, 1] } },
  bpistol:  { y: 0.055, base: 0.040, rear: { t: 'notch', z: 0.03, w: 0.032, dots: [0.3, 1, 0.4] }, front: { t: 'post', z: -0.20, dot: [0.3, 1, 0.4] } },
  revolver: { y: 0.060, base: 0.042, rear: { t: 'notch', z: 0.02, w: 0.030 }, front: { t: 'post', z: -0.25, dot: [1, 0.15, 0.1] } },
};
const SIGHT = [0.10, 0.10, 0.11];
function partR(base, c, s, rz, col, emis) { M4.copy(_m, base); M4.tr(_m, ...c); M4.rz(_m, rz); M4.sc(_m, ...s); drawCube(_m, col, emis); }
function ring(base, cy, z, r, th, dep, col, segs) {
  const n = segs || 12, len = 2 * Math.PI * r / n * 1.18;
  for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * Math.PI * 2; partR(base, [Math.cos(a) * r, cy + Math.sin(a) * r, z], [len, th, dep], a + Math.PI / 2, col); }
}
const dot = (b, c, col) => part(b, c, [0.0042, 0.0042, 0.003], col, 1);
function pillar(b, x, y0, y1, z, w, d, col) { if (y1 > y0) part(b, [x, (y0 + y1) / 2, z], [w, y1 - y0, d], col || SIGHT); }
function drawIron(b, S) {
  const y = S.y, base = S.base, R0 = S.rear, F = S.front;
  // ---- rear ----
  switch (R0.t) {
    case 'notch': case 'leaf': {
      // two ears with an open gap; the front post sits in the gap, its top level with the ears
      const leaf = R0.t === 'leaf', gap = leaf ? 0.016 : 0.013, ew = leaf ? 0.006 : 0.007, eh = leaf ? 0.02 : 0.012, z = R0.z;
      const ex = gap / 2 + ew / 2;
      pillar(b, -ex, y - eh, y + 0.0005, z, ew, 0.007); pillar(b, ex, y - eh, y + 0.0005, z, ew, 0.007);
      pillar(b, 0, y - eh - 0.003, y - eh, z, gap + ew * 2, 0.007);
      if (leaf) { partR(b, [-gap / 2 + 0.001, y - eh * 0.6, z], [0.0025, eh * 0.9, 0.006], 0.3, SIGHT); partR(b, [gap / 2 - 0.001, y - eh * 0.6, z], [0.0025, eh * 0.9, 0.006], -0.3, SIGHT); }
      pillar(b, 0, base, y - eh - 0.003, z, 0.006, 0.014);
      if (R0.dots) { dot(b, [-ex, y - 0.004, z + 0.004], R0.dots); dot(b, [ex, y - 0.004, z + 0.004], R0.dots); }
      break;
    }
    case 'peep': {
      const r = R0.r, z = R0.z;
      ring(b, y, z, r, 0.0045, 0.008, SIGHT, 12);
      pillar(b, -(r + 0.006), y - r * 0.6, y + 0.006, z, 0.004, 0.01); pillar(b, r + 0.006, y - r * 0.6, y + 0.006, z, 0.004, 0.01);
      pillar(b, 0, y - r - 0.004, y - r * 0.6, z, 2 * r + 0.016, 0.01);
      pillar(b, 0, base, y - r - 0.004, z, 0.006, 0.012);
      break;
    }
    case 'ghost': {
      const r = R0.r, z = R0.z;
      ring(b, y, z, r, 0.0032, 0.006, SIGHT, 14);
      pillar(b, -(r + 0.003), base, y - r * 0.4, z, 0.0035, 0.008); pillar(b, r + 0.003, base, y - r * 0.4, z, 0.0035, 0.008);
      pillar(b, 0, base, y - r, z, 0.005, 0.008);
      if (R0.handle) { part(b, [-0.022, y - r - 0.004, -0.02], [0.006, 0.008, 0.26], SIGHT); part(b, [0.022, y - r - 0.004, -0.02], [0.006, 0.008, 0.26], SIGHT); }
      break;
    }
    case 'rib':
      part(b, [0, y - 0.006, -0.38], [0.008, 0.003, 0.7], SIGHT);
      part(b, [0, y - 0.003, -0.32], [0.006, 0.006, 0.005], [0.85, 0.85, 0.85], 0.4);
      break;
  }
  // ---- front ----
  const z = F.z;
  if (F.t === 'bead') {
    part(b, [0, y - 0.003, z], [0.012, 0.012, 0.012], [1, 0.82, 0.35], 0.8);
  } else {
    // post: top exactly at the sight line
    pillar(b, 0, y - 0.018, y, z, 0.0055, 0.006);
    pillar(b, 0, base, y - 0.018, z, 0.009, 0.014);
    if (F.t === 'hood') ring(b, y - 0.002, z, 0.012, 0.003, 0.012, SIGHT, 12);
    if (F.t === 'ears') { pillar(b, -0.012, y - 0.022, y + 0.006, z, 0.0045, 0.008); pillar(b, 0.012, y - 0.022, y + 0.006, z, 0.0045, 0.008); pillar(b, 0, y - 0.026, y - 0.02, z, 0.029, 0.01); }
    if (F.t === 'tower') { partR(b, [-0.009, y - 0.012, z], [0.005, 0.03, 0.01], -0.35, SIGHT); partR(b, [0.009, y - 0.012, z], [0.005, 0.03, 0.01], 0.35, SIGHT); }
    if (F.dot) dot(b, [0, y - 0.0035, z + 0.0035], F.dot);
  }
}
const GC = { G1: [0.20, 0.20, 0.21], G2: [0.32, 0.32, 0.33], G3: [0.42, 0.39, 0.34], tan: [0.55, 0.48, 0.36], od: [0.36, 0.38, 0.30], wood: [0.42, 0.28, 0.16] };
// returns {muzzle:[x,y,z], lh:[x,y,z], sightY}
function drawGunModel(b, w, d, p) {
  const { G1, G2, G3 } = GC, m = d.model, att = w.att, opt = optic(w);
  const extK = att.has('ext') ? 1.3 : 1;
  let muzzle = [0, 0.012, -0.75], lh = [0, -0.035, -0.26], sightY = 0.07, railY = 0.05, railZ = -0.04;
  const body = d.cls === 'sniper' ? [0.40, 0.41, 0.35] : G2;
  const boltPos = d.bolt && w.boltT > 0 ? clamp(Math.sin(clamp(1 - w.boltT / d.rof, 0, 1) * Math.PI) * 1.4, 0, 1) : 0;
  const pumpK = d.pump && p.pumpT > 0 ? Math.sin(clamp(1 - p.pumpT / d.rof, 0, 1) * Math.PI) : 0;
  switch (m) {
    case 'bullpup':
      part(b, [0, 0, 0.04], [0.055, 0.085, 0.62], body, 0, 1); part(b, [0, -0.06, 0.18], [0.045, 0.08 * extK, 0.10], G1);
      part(b, [0, -0.07, 0.0], [0.035, 0.09, 0.05], G1); part(b, [0, 0.015, -0.48], [0.026, 0.026, 0.55], G1);
      part(b, [0, 0.015, -0.76], [0.045, 0.04, 0.07], G2); part(b, [0, -0.01, -0.22], [0.05, 0.06, 0.2], G3, 0, 1); part(b, [0, 0.0, 0.36], [0.05, 0.1, 0.06], G1);
      muzzle = [0, 0.015, -0.82]; lh = [0, -0.035, -0.28]; break;
    case 'semi':
      part(b, [0, 0, 0.0], [0.065, 0.095, 0.5], [0.28, 0.27, 0.23], 0, 1); part(b, [0, -0.075, -0.06], [0.05, 0.1 * extK, 0.09], G1);
      part(b, [0, -0.07, 0.12], [0.04, 0.1, 0.05], G1); part(b, [0, 0.01, -0.5], [0.03, 0.03, 0.55], G1);
      part(b, [0, 0.01, -0.8], [0.06, 0.05, 0.1], G2); part(b, [0, -0.02, 0.36], [0.055, 0.12, 0.22], G2, 0, 1);
      muzzle = [0, 0.01, -0.86]; lh = [0, -0.04, -0.3]; break;
    case 'dmr':
      part(b, [0, 0, -0.05], [0.045, 0.07, 0.5], GC.wood, 0, 1); part(b, [0, 0.0, 0.3], [0.03, 0.03, 0.28], G1); part(b, [0, -0.08, 0.3], [0.03, 0.02, 0.24], G1);
      part(b, [0, -0.04, 0.44], [0.045, 0.13, 0.035], G1, 0, 1); part(b, [0, 0.012, -0.62], [0.02, 0.02, 0.7], G1); part(b, [0, -0.085, -0.06], [0.04, 0.11 * extK, 0.07], G1);
      part(b, [0, -0.07, 0.1], [0.035, 0.09, 0.045], G1); muzzle = [0, 0.012, -0.98]; lh = [0, -0.035, -0.32]; break;
    case 'svu':
      part(b, [0, 0, 0.08], [0.055, 0.09, 0.5], GC.od, 0, 1); part(b, [0, 0.0, -0.3], [0.05, 0.065, 0.25], G2, 0, 1); part(b, [0, 0.01, -0.55], [0.025, 0.025, 0.35], G1);
      part(b, [0, 0.01, -0.74], [0.05, 0.05, 0.08], G2); part(b, [0, -0.075, 0.16], [0.045, 0.1 * extK, 0.08], G1); part(b, [0, -0.07, -0.02], [0.035, 0.09, 0.045], G1);
      muzzle = [0, 0.01, -0.79]; lh = [0, -0.035, -0.3]; break;
    case 'bolt':
      part(b, [0, -0.01, 0.0], [0.05, 0.075, 0.55], body, 0, 1); part(b, [0, -0.06, -0.04], [0.04, 0.06 * extK, 0.07], G1);
      part(b, [0, -0.07, 0.11], [0.035, 0.09, 0.045], G1); part(b, [0, 0.012, -0.47], [0.022, 0.022, 0.55], G1);
      part(b, [0, -0.03, 0.34], [0.05, 0.12, 0.16], body, 0, 1); part(b, [0, 0.012, -0.75], [0.035, 0.035, 0.06], G2);
      muzzle = [0, 0.012, -0.79]; lh = [0, -0.035, -0.28]; break;
    case 'rifle': case 'rifle2': {
      const r2 = m === 'rifle2';
      part(b, [0, 0, -0.04], [0.05, 0.075, 0.42], G1, 0, 1); part(b, [0, 0.0, r2 ? -0.4 : -0.36], [0.055, 0.065, r2 ? 0.32 : 0.26], G2, 0, 1);
      part(b, [0, 0.005, r2 ? -0.66 : -0.6], [0.02, 0.02, 0.18], G1);
      M4.copy(_vm, b); M4.tr(_vm, 0, -0.08, -0.08); M4.rx(_vm, r2 ? 0.35 : 0.25); part(_vm, [0, -0.02 * (extK - 1), 0], [0.035, 0.13 * extK, 0.06], G1);
      part(b, [0, -0.07, 0.08], [0.035, 0.09, 0.045], G1); part(b, [0, -0.01, 0.24], [0.04, r2 ? 0.08 : 0.07, 0.18], G2, 0, 1);
      muzzle = [0, 0.005, r2 ? -0.76 : -0.7]; lh = [0, -0.04, -0.3]; break;
    }
    case 'burst':
      part(b, [0, 0.005, -0.05], [0.062, 0.1, 0.46], [0.30, 0.31, 0.28], 0, 1); part(b, [0, 0, -0.38], [0.06, 0.075, 0.24], G2, 0, 1);
      part(b, [0, 0.01, -0.58], [0.02, 0.02, 0.16], G1); part(b, [0, -0.11, -0.08], [0.035, 0.13 * extK, 0.06], G1);
      part(b, [0, -0.08, 0.08], [0.035, 0.09, 0.045], G1); part(b, [0, 0, 0.27], [0.05, 0.09, 0.2], G2, 0, 1);
      railY = 0.06; muzzle = [0, 0.01, -0.67]; lh = [0, -0.045, -0.32]; break;
    case 'smg':
      part(b, [0, 0, -0.04], [0.05, 0.075, 0.32], G1, 0, 1); part(b, [0, 0.0, -0.27], [0.055, 0.065, 0.16], G2, 0, 1);
      part(b, [0, 0.005, -0.42], [0.02, 0.02, 0.18], G1); part(b, [0, -0.08 - 0.03 * (extK - 1), -0.08], [0.035, 0.16 * extK, 0.06], G1);
      part(b, [0, -0.07, 0.08], [0.035, 0.09, 0.045], G1); part(b, [0, -0.01, 0.2], [0.035, 0.06, 0.14], G2, 0, 1);
      muzzle = [0, 0.005, -0.52]; lh = [0, -0.04, -0.25]; break;
    case 'smgc':
      part(b, [0, 0, -0.06], [0.055, 0.085, 0.28], G1, 0, 1); part(b, [0, -0.13 - 0.04 * (extK - 1), -0.13], [0.03, 0.19 * extK, 0.05], G1);
      part(b, [0, 0.005, -0.25], [0.022, 0.022, 0.1], G1); part(b, [0, -0.07, 0.05], [0.035, 0.09, 0.045], G1);
      part(b, [0, -0.03, 0.17], [0.02, 0.02, 0.2], G2); part(b, [0, -0.04, 0.27], [0.03, 0.07, 0.02], G2);
      muzzle = [0, 0.005, -0.31]; lh = [0, -0.16, -0.14]; break;
    case 'pdw':
      part(b, [0, 0, 0.0], [0.06, 0.11, 0.44], [0.25, 0.26, 0.24], 0, 1); part(b, [0, 0.075, 0.0], [0.05, 0.035, 0.34 * Math.min(extK, 1.15)], [0.15, 0.16, 0.15], 0.05);
      part(b, [0, -0.075, -0.06], [0.035, 0.07, 0.05], G1); part(b, [0, 0.0, -0.26], [0.03, 0.03, 0.08], G1);
      sightY = 0.115; railY = 0.095; muzzle = [0, 0.0, -0.31]; lh = [0, -0.06, -0.16]; break;
    case 'shotgun':
      part(b, [0, 0, -0.02], [0.05, 0.08, 0.24], G1, 0, 1); part(b, [0, 0.02, -0.45], [0.026, 0.026, 0.6], G1);
      part(b, [0, -0.02, -0.4], [0.024, 0.024, 0.5], G1); part(b, [0, -0.02, -0.3 + pumpK * 0.09], [0.048, 0.048, 0.17], GC.wood, 0, 1);
      part(b, [0, -0.07, 0.08], [0.035, 0.09, 0.045], G1); part(b, [0, -0.03, 0.27], [0.045, 0.1, 0.26], GC.wood, 0, 1);
      sightY = 0.045; railY = 0.045; muzzle = [0, 0.02, -0.76]; lh = [0, -0.05, -0.3 + pumpK * 0.09]; break;
    case 'autosg':
      part(b, [0, 0, -0.04], [0.055, 0.085, 0.32], G1, 0, 1); part(b, [0, 0.015, -0.42], [0.03, 0.03, 0.42], G1); part(b, [0, -0.015, -0.33], [0.05, 0.05, 0.2], G2, 0, 1);
      part(b, [0, -0.09, -0.06], [0.045, 0.1 * extK, 0.09], G1); part(b, [0, -0.07, 0.09], [0.035, 0.09, 0.045], G1); part(b, [0, -0.02, 0.25], [0.045, 0.09, 0.2], G2, 0, 1);
      sightY = 0.06; muzzle = [0, 0.015, -0.64]; lh = [0, -0.05, -0.32]; break;
    case 'lmg':
      part(b, [0, 0.01, -0.05], [0.075, 0.11, 0.42], G1, 0, 1); part(b, [0, 0.01, -0.5], [0.03, 0.03, 0.5], G1); part(b, [0, 0.0, -0.33], [0.065, 0.07, 0.2], G2, 0, 1);
      part(b, [-0.02, -0.1, -0.06], [0.09, 0.12, 0.12], GC.od, 0, 1); part(b, [0.042, 0.03, -0.12], [0.012, 0.025, 0.1], G1);
      part(b, [0, -0.08, 0.1], [0.04, 0.1, 0.05], G1); part(b, [0, -0.01, 0.28], [0.05, 0.1, 0.22], G2, 0, 1);
      part(b, [0.015, -0.03, -0.62], [0.01, 0.01, 0.16], G1); part(b, [-0.015, -0.03, -0.62], [0.01, 0.01, 0.16], G1);
      sightY = 0.085; railY = 0.07; muzzle = [0, 0.01, -0.76]; lh = [0, -0.06, -0.3]; break;
    case 'revolver':
      part(b, [0, 0.01, -0.03], [0.055, 0.055, 0.07], G2, 0, 1); part(b, [0, 0.025, -0.16], [0.032, 0.032, 0.2], G1, 0, 1);
      part(b, [0, 0.02, 0.03], [0.03, 0.05, 0.06], G1); part(b, [0, -0.05, 0.04], [0.032, 0.1, 0.05], GC.wood);
      sightY = 0.06; railY = 0.04; muzzle = [0, 0.025, -0.27]; lh = [-0.01, -0.06, 0.0]; break;
    case 'knife':
      part(b, [0, -0.02, 0.04], [0.03, 0.035, 0.11], G1); part(b, [0, -0.012, -0.1], [0.008, 0.03, 0.18], [0.72, 0.74, 0.78]); part(b, [0, -0.02, -0.01], [0.05, 0.012, 0.012], G2);
      sightY = 0.05; muzzle = [0, 0, -0.2]; lh = [-0.01, -0.06, 0.0]; break;
    case 'launcher':
      part(b, [0, 0, -0.1], [0.07, 0.07, 0.5], [0.30, 0.33, 0.25], 0, 1); part(b, [0, 0.0, -0.18], [0.11, 0.11, 0.18], G1); part(b, [0, -0.08, 0.05], [0.035, 0.1, 0.05], G1);
      part(b, [0, -0.02, 0.24], [0.045, 0.09, 0.2], G2); part(b, [0, 0.06, -0.1], [0.02, 0.03, 0.08], G1);
      sightY = 0.08; muzzle = [0, 0, -0.38]; lh = [0, -0.06, -0.24]; break;
    case 'plasma':
      part(b, [0, 0.01, -0.06], [0.05, 0.06, 0.22], [0.25, 0.27, 0.3], 0, 1); part(b, [0, 0.01, -0.2], [0.07, 0.07, 0.06], [0.2, 0.9, 0.4], 0.8);
      part(b, [0, -0.045, 0.0], [0.032, 0.1, 0.05], G1); part(b, [0, 0.05, -0.06], [0.02, 0.02, 0.16], [0.2, 0.9, 0.4], 0.9);
      sightY = 0.07; muzzle = [0, 0.01, -0.24]; lh = [-0.01, -0.06, 0.0]; break;
    case 'arc': { // original prototype: copper coils + twin electrodes
      const glow = 0.6 + 0.4 * Math.sin(G.time * 18), cu = [0.72, 0.42, 0.18], bl = [0.45, 0.8, 1];
      part(b, [0, 0, -0.02], [0.07, 0.09, 0.36], [0.24, 0.25, 0.27], 0, 1); part(b, [0, -0.08, 0.06], [0.035, 0.1, 0.05], G1);
      for (let i = 0; i < 4; i++) part(b, [0, 0.005, -0.22 - i * 0.06], [0.12, 0.12, 0.035], cu, 0.45);
      part(b, [0, 0.005, -0.32], [0.03, 0.03, 0.26], [0.3, 0.3, 0.32]);
      part(b, [0.035, 0.035, -0.48], [0.018, 0.018, 0.1], bl, glow); part(b, [-0.035, 0.035, -0.48], [0.018, 0.018, 0.1], bl, glow); part(b, [0, 0.035, -0.53], [0.09, 0.012, 0.012], bl, glow);
      part(b, [0, 0.07, 0.02], [0.05, 0.03, 0.12], bl, 0.4 * glow); part(b, [0, -0.02, 0.25], [0.05, 0.08, 0.16], G2, 0, 1);
      sightY = 0.09; muzzle = [0, 0.03, -0.53]; lh = [0, -0.05, -0.3]; break;
    }
    case 'grav': { // original prototype: heavy emitter with resonance rings
      const pulse = 0.5 + 0.5 * Math.sin(G.time * 6), vi = [0.7, 0.45, 1];
      part(b, [0, 0, 0.0], [0.11, 0.12, 0.42], [0.20, 0.20, 0.23], 0, 1); part(b, [0, -0.1, 0.05], [0.04, 0.11, 0.05], G1);
      for (let i = 0; i < 3; i++) part(b, [0, 0.0, -0.26 - i * 0.07], [0.2 - i * 0.025, 0.2 - i * 0.025, 0.03], [0.55, 0.45, 0.7], 0.35);
      part(b, [0, 0.0, -0.35], [0.06, 0.06, 0.2], vi, 0.5 + 0.5 * pulse); part(b, [0, 0.085, -0.02], [0.03, 0.03, 0.28], vi, 0.3 * pulse);
      part(b, [0, -0.02, 0.27], [0.06, 0.1, 0.16], G2, 0, 1);
      sightY = 0.1; muzzle = [0, 0.0, -0.47]; lh = [0, -0.07, -0.26]; break;
    }
    default: { // pistol / bpistol
      const bp = m === 'bpistol';
      part(b, [0, 0.02, -0.08], [0.035, 0.04, bp ? 0.24 : 0.2], G1, 0, 1); part(b, [0, -0.04, -0.01], [0.032, 0.11, 0.05], G2, 0, 1);
      if (bp) part(b, [0, 0.02, -0.215], [0.04, 0.035, 0.03], G2);
      if (att.has('ext')) part(b, [0, -0.11, -0.01], [0.03, 0.04, 0.045], G1);
      sightY = 0.055; railY = 0.04; muzzle = [0, 0.02, bp ? -0.23 : -0.2]; lh = [-0.01, -0.06, 0.0];
    }
  }
  // ---- optics ----
  if (opt === 'scope') {
    part(b, [0, 0.075, -0.06], [0.044, 0.044, 0.30], G1, 0, 1); part(b, [0, 0.075, -0.24], [0.062, 0.062, 0.08], G1, 0, 1);
    part(b, [0, 0.075, 0.12], [0.056, 0.056, 0.06], G1); part(b, [0, 0.105, -0.05], [0.025, 0.02, 0.04], G2); part(b, [0.03, 0.075, -0.05], [0.02, 0.025, 0.04], G2);
    part(b, [0, 0.045, -0.14], [0.02, 0.03, 0.03], G2); part(b, [0, 0.045, 0.04], [0.02, 0.03, 0.03], G2);
    part(b, [0, 0.075, -0.281], [0.05, 0.05, 0.004], [0.25, 0.32, 0.45], 0.4);
    sightY = 0.075;
  } else if (opt === 'acog') {
    // hollow tube: you look THROUGH it (no solid block in the middle)
    const cy = railY + 0.035, AC = [0.17, 0.17, 0.18];
    ring(b, cy, 0.0, 0.028, 0.0035, 0.014, AC, 16); ring(b, cy, -0.13, 0.026, 0.0035, 0.014, AC, 16);
    part(b, [0, cy - 0.031, -0.065], [0.016, 0.006, 0.13], AC); part(b, [0, cy + 0.031, -0.065], [0.016, 0.006, 0.13], AC);
    part(b, [0, railY + 0.004, -0.06], [0.03, 0.014, 0.1], G1); part(b, [0, cy + 0.038, -0.06], [0.012, 0.01, 0.03], G1);
    VMGLASS.push({ base: M4.copy(new Float32Array(16), b), c: [0, cy, -0.12], s: [0.04, 0.04, 0.002], col: [0.55, 0.45, 0.2] });
    sightY = cy;
  } else if (opt === 'dot') {
    // open reflex frame: thin border only, glass is see-through
    const cy = railY + 0.035, hw = 0.03, hh = 0.025;
    part(b, [0, railY + 0.005, -0.02], [0.04, 0.012, 0.08], G1);
    part(b, [-hw, cy, -0.04], [0.004, hh * 2 + 0.004, 0.012], G1); part(b, [hw, cy, -0.04], [0.004, hh * 2 + 0.004, 0.012], G1);
    part(b, [0, cy + hh, -0.04], [hw * 2 + 0.004, 0.004, 0.012], G1); part(b, [0, cy - hh, -0.04], [hw * 2 + 0.004, 0.006, 0.012], G1);
    pillar(b, -hw, railY + 0.008, cy - hh, -0.04, 0.004, 0.02, G1); pillar(b, hw, railY + 0.008, cy - hh, -0.04, 0.004, 0.02, G1);
    VMGLASS.push({ base: M4.copy(new Float32Array(16), b), c: [0, cy, -0.04], s: [hw * 2, hh * 2, 0.002], col: [0.35, 0.65, 0.6] });
    sightY = cy;
  } else if (IRON[m]) {
    drawIron(b, IRON[m]); sightY = IRON[m].y;
  }
  if (d.bolt) { const bz = 0.06 + boltPos * 0.1; part(b, [0.035 + boltPos * 0.01, 0.025, bz], [0.05, 0.014, 0.014], G2); part(b, [0.065, 0.02, bz], [0.02, 0.02, 0.02], G1); }
  // ---- barrel / under attachments ----
  if (att.has('lb')) { part(b, [0, muzzle[1], muzzle[2] - 0.06], [0.022, 0.022, 0.12], G1); muzzle = [muzzle[0], muzzle[1], muzzle[2] - 0.12]; }
  if (att.has('sup')) { part(b, [0, muzzle[1], muzzle[2] - 0.1], [0.045, 0.045, 0.2], [0.12, 0.12, 0.13]); muzzle = [muzzle[0], muzzle[1], muzzle[2] - 0.2]; }
  if (att.has('grip')) part(b, [0, -0.08, lh[2] - 0.02], [0.03, 0.09, 0.03], G1);
  if (att.has('laser')) { part(b, [0.04, -0.005, lh[2] - 0.04], [0.02, 0.025, 0.07], G1); part(b, [0.04, -0.005, lh[2] - 0.076], [0.012, 0.012, 0.004], [1, 0.1, 0.05], 1); }
  if (att.has('stock')) part(b, [0, -0.02, 0.36], [0.05, 0.11, 0.05], G1);
  if (att.has('cpu')) part(b, [-0.035, 0.075, 0.0], [0.02, 0.03, 0.06], [0.15, 0.2, 0.15], 0.2);
  return { muzzle, lh, sightY };
}
function drawViewmodel(p) {
  const gl = R.gl, w = curW(p), d = w.d;
  gl.clear(gl.DEPTH_BUFFER_BIT);
  M4.persp(_vm, 56 * DEG, R.w / R.h, 0.01, 10);
  const Vr = M4.ident(new Float32Array(16)); M4.rz(Vr, -p.camRoll); M4.rx(Vr, -p.camPitch); M4.ry(Vr, -p.camYaw);
  const s = R.sun, sv = [Vr[0] * s[0] + Vr[4] * s[1] + Vr[8] * s[2], Vr[1] * s[0] + Vr[5] * s[1] + Vr[9] * s[2], Vr[2] * s[0] + Vr[6] * s[1] + Vr[10] * s[2]];
  beginPass(_vm, R.I, 50, 100, sv);
  const opt = optic(w), sn = d.cls === 'sniper';
  const ads = smooth(p.ads), t = G.time;
  // pass 1: measure sight height (draw invisible? no: compute from table)
  const sightY = opt === 'scope' ? 0.075 : opt === 'acog' || opt === 'dot' ? ({ burst: 0.095, pdw: 0.13, lmg: 0.105, shotgun: 0.08, pistol: 0.075, bpistol: 0.075, revolver: 0.075 }[d.model] || 0.085)
    : (IRON[d.model] ? IRON[d.model].y : 0.07);
  const VW = d.cls === 'pistol' || d.cls === 'knife' ? 1.3 : 1.45; // viewmodel width/height scale (chunkier guns, bigger sight windows)
  const hip = d.cls === 'pistol' ? [0.16, -0.19, -0.48] : [0.2, -0.23, -0.68];
  const adsPos = [0, -sightY * VW, opt === 'scope' ? -0.52 : opt === 'acog' ? -0.22 : opt === 'dot' ? -0.3 : d.cls === 'pistol' ? -0.4 : -0.5];
  const pos = [lerp(hip[0], adsPos[0], ads), lerp(hip[1], adsPos[1], ads), lerp(hip[2], adsPos[2], ads)];
  let ry = 0, rx = 0, rz = 0;
  const bob = p.bobAmt * (1 - ads * 0.85);
  pos[0] += Math.sin(p.bobT) * 0.012 * bob; pos[1] += -Math.abs(Math.cos(p.bobT)) * 0.012 * bob;
  pos[1] += Math.sin(t * 1.6) * 0.002 * (1 - ads);
  const spr = (p.sprint ? 1 : clamp(p.sprintOutT / Math.max(0.01, d.sprintOut), 0, 1)) * (w.reloadT > 0 ? 0.25 : 1);
  if (spr > 0) { const k = smooth(spr); pos[0] -= 0.05 * k; pos[1] -= 0.06 * k; ry += 0.7 * k; rz += 0.25 * k; rx -= 0.15 * k; pos[1] += Math.sin(p.bobT) * 0.02 * k; }
  if (p.swapT > 0) { const k = smooth(p.swapT / Math.max(0.01, p.swapTot)); pos[1] -= 0.35 * k; rx -= 0.6 * k; }
  if (w.reloadT > 0) { const k = w.shellMode ? 0.6 : Math.sin(clamp(1 - w.reloadT / w.reloadTot, 0, 1) * Math.PI); rz -= 0.5 * k; rx += 0.25 * k; pos[1] -= 0.06 * k; pos[0] -= 0.04 * k; }
  if (p.meleeT > 0) { if (d.cls === 'knife') { const k = Math.sin((1 - p.meleeT / 0.55) * Math.PI); pos[2] -= 0.25 * k; pos[0] -= 0.1 * k; rx -= 0.3 * k; } else { pos[1] -= 0.15; rx -= 0.4; } }
  if (p.throwT > 0) { const k = Math.sin((p.throwT / 0.65) * Math.PI); pos[1] -= 0.2 * k; rz += 0.3 * k; }
  if (p.mantle) { pos[1] -= 0.25; rx -= 0.4; }
  const sinceShot = t - p.lastShotT;
  if (sinceShot < 0.25) { const k = Math.exp(-sinceShot * 18) * (sn || d.cls === 'sg' ? 1.2 : 0.35); pos[2] += 0.06 * k; rx += 0.12 * k; }
  if (p.boltKick > 0) { rz -= 0.25 * p.boltKick * (1 - ads * 0.5); pos[1] -= 0.03 * p.boltKick; }
  const na = 1 - ads; // motion offsets fade out while aiming so the sight stays centred
  rx += p.landKick * 0.02 * na;
  // stance change: the gun lags behind the body, dipping and rolling
  if (p.stanceKick > 0) { const k = Math.sin(p.stanceKick * Math.PI) * p.stanceDir * (0.25 + 0.75 * na); pos[1] -= 0.035 * k; rz += 0.09 * k; rx -= 0.05 * k; }
  // going prone / getting up: weapon pulled in
  if (p.proneTrans > 0) { const k = Math.sin(clamp(p.proneTrans / 0.5, 0, 1) * Math.PI); pos[1] -= 0.22 * k; pos[0] -= 0.05 * k; rx -= 0.45 * k; rz += 0.35 * k; }
  // crawling: gun lowered and swaying with the elbows
  if (p.crawl > 0) { const k = smooth(p.crawl) * na, cs = Math.sin(p.crawlT); pos[1] -= 0.17 * k + Math.abs(cs) * 0.03 * k; pos[0] += cs * 0.05 * k; ry += 0.55 * k; rz += (0.35 + cs * 0.12) * k; rx -= 0.2 * k; }
  // slide: canted weapon
  if (p.slideK > 0) { const k = smooth(p.slideK) * na; rz += 0.28 * k; pos[1] -= 0.03 * k; pos[0] -= 0.02 * k; }
  // dive: arms thrown forward
  if (p.diveK > 0) { const k = smooth(p.diveK) * na; pos[2] -= 0.08 * k; pos[1] += 0.03 * k; rx += 0.18 * k; }
  if (p.diveLand > 0) { const k = Math.sin(p.diveLand / 0.5 * Math.PI) * na; pos[1] -= 0.06 * k; rx -= 0.12 * k; }
  M4.ident(_b); M4.tr(_b, ...pos); M4.ry(_b, ry); M4.rx(_b, rx); M4.rz(_b, rz); M4.sc(_b, VW, VW, 1);
  VMW = w; VMGLASS = [];
  let { muzzle, lh } = drawGunModel(_b, w, d, p);
  VMW = null;
  const sleeve = [0.33, 0.35, 0.27], glove = [0.17, 0.17, 0.17];
  seg(_b, [0.01, -0.05, 0.12], [0.16, -0.32, 0.55], 0.075, sleeve); part(_b, [0.0, -0.06, 0.11], [0.06, 0.07, 0.08], glove);
  if (w.reloadT > 0 && (w.shellMode || w.reloadT < w.reloadTot * 0.85)) { const k = w.shellMode ? 0.5 + 0.5 * Math.sin(w.reloadT / w.reloadTot * Math.PI) : Math.sin((1 - w.reloadT / w.reloadTot) * Math.PI); lh = [lh[0] - 0.05 * k, lh[1] - 0.12 * k, lh[2] + 0.18 * k]; }
  if (d.cls !== 'pistol' && d.cls !== 'knife') { seg(_b, lh, [-0.24, -0.32, 0.25], 0.075, sleeve); part(_b, lh, [0.065, 0.06, 0.08], glove); }
  if (t - p.muzzleT < 0.05 && !w.att.has('sup')) { part(_b, muzzle, [0.09, 0.09, 0.14], [1, 0.85, 0.5], 1); part(_b, V.add(muzzle, [0, 0, -0.05]), [0.18, 0.04, 0.04], [1, 0.75, 0.4], 1); }
  if (VMGLASS.length) { // translucent lens, drawn last
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    for (const g of VMGLASS) { M4.copy(_m, g.base); M4.tr(_m, ...g.c); M4.sc(_m, ...g.s); drawCube(_m, g.col, 0.6, 0.12); }
    gl.depthMask(true); gl.disable(gl.BLEND);
  }
  if (p.cookT) { M4.ident(_b); M4.tr(_b, -0.18, -0.16, -0.36); part(_b, [0, 0, 0], [0.07, 0.09, 0.07], NADE_COL.frag); part(_b, [0.03, -0.02, 0.06], [0.05, 0.05, 0.1], glove); }
  if (p.meleeT > 0 && d.cls !== 'knife') {
    const k = Math.sin((1 - p.meleeT / 0.55) * Math.PI);
    M4.ident(_b); M4.tr(_b, 0.12 - 0.1 * k, -0.15, -0.3 - 0.25 * k); M4.rx(_b, -0.3);
    part(_b, [0, 0, 0], [0.03, 0.035, 0.1], GC.G1); part(_b, [0, 0.005, -0.13], [0.008, 0.03, 0.17], [0.7, 0.72, 0.75]);
  }
}
