// ============================================================
//  BOTS: model / hitboxes / AI
// ============================================================
const BOT_PARTS = [
  { z: 'head', c: [0, 1.63, 0], s: [0.25, 0.27, 0.27], k: 'skin' },
  { z: 'neck', c: [0, 1.47, 0], s: [0.14, 0.11, 0.14], k: 'skin' },
  { z: 'upper', c: [0, 1.25, 0], s: [0.47, 0.34, 0.28], k: 'shirt' },
  { z: 'lower', c: [0, 0.98, 0], s: [0.41, 0.22, 0.26], k: 'pants' },
  { z: 'upper', c: [-0.30, 1.24, -0.02], s: [0.13, 0.32, 0.14], k: 'shirt', arm: 1 },
  { z: 'upper', c: [0.30, 1.24, -0.02], s: [0.13, 0.32, 0.14], k: 'shirt', arm: 1 },
  { z: 'arm', c: [-0.17, 1.12, -0.25], s: [0.11, 0.11, 0.34], k: 'glove', arm: 1 },
  { z: 'arm', c: [0.21, 1.14, -0.22], s: [0.11, 0.11, 0.32], k: 'glove', arm: 1 },
  { z: 'uleg', c: [-0.11, 0.68, 0], s: [0.18, 0.37, 0.21], k: 'pants', leg: -1 },
  { z: 'uleg', c: [0.11, 0.68, 0], s: [0.18, 0.37, 0.21], k: 'pants', leg: 1 },
  { z: 'lleg', c: [-0.11, 0.26, 0], s: [0.16, 0.50, 0.19], k: 'boots', leg: -1 },
  { z: 'lleg', c: [0.11, 0.26, 0], s: [0.16, 0.50, 0.19], k: 'boots', leg: 1 },
];
const BOT_DECOR = [ // render-only
  { c: [0, 1.75, 0.0], s: [0.30, 0.10, 0.31], k: 'helmet' },
  { c: [0, 1.24, 0.0], s: [0.50, 0.30, 0.31], k: 'vest' },
  { c: [0, 1.30, 0.17], s: [0.30, 0.30, 0.10], k: 'vest' },
  { c: [0.06, 1.17, -0.48], s: [0.075, 0.13, 0.78], k: 'gun', arm: 1 },
  { c: [0, 1.64, -0.135], s: [0.20, 0.05, 0.02], k: 'visor' },
];
const BOT_NAMES = ['KuroNeko', 'xX_Reaper_Xx', 'Tanaka_JP', 'GhostFox', 'MrQuickScope', 'NoScopeNinja', 'Sakura_Snipe', 'ColdSteel', 'Viper77', 'Nighthawk', 'ProneGod', 'Hayabusa', 'BoltAction', 'Ronin', 'TrickShot_Ken', 'Zero_Two', 'IronSight', 'Hachiko'];
const BOT_SKINS = [
  { shirt: [0.32, 0.36, 0.26], pants: [0.28, 0.30, 0.24], vest: [0.22, 0.24, 0.18] },
  { shirt: [0.34, 0.33, 0.30], pants: [0.25, 0.25, 0.26], vest: [0.18, 0.18, 0.19] },
  { shirt: [0.50, 0.44, 0.33], pants: [0.42, 0.37, 0.28], vest: [0.36, 0.31, 0.22] },
  { shirt: [0.22, 0.27, 0.34], pants: [0.20, 0.22, 0.26], vest: [0.14, 0.16, 0.20] },
  { shirt: [0.40, 0.25, 0.22], pants: [0.24, 0.22, 0.22], vest: [0.20, 0.17, 0.16] },
];
const DIFFS = [
  { name: '新兵', react: 1.45, acc: 8.0, turn: 2.4, see: 0.75 },
  { name: '一般', react: 0.92, acc: 5.0, turn: 3.6, see: 0.9 },
  { name: '熟練', react: 0.7, acc: 3.6, turn: 5.0, see: 1.0 },
  { name: 'ベテラン', react: 0.5, acc: 3.0, turn: 7.0, see: 1.1 },
];
const BOT_W = {
  ar: { pool: ['ar94', 'm8', 'sw56'], burst: [3, 7], pause: [0.25, 0.6], range: 70, pref: 30 },
  smg: { pool: ['sm7', 'msc', 'pd50'], burst: [4, 9], pause: [0.2, 0.45], range: 45, pref: 12 },
  sniper: { pool: ['vx50', 'bls7', 'dr90'], burst: [1, 1], pause: [1.4, 2.0], range: 130, pref: 60 },
  sg: { pool: ['r870', 'sg12'], burst: [1, 2], pause: [0.5, 0.9], range: 28, pref: 5 },
  lmg: { pool: ['ls60'], burst: [6, 12], pause: [0.3, 0.6], range: 80, pref: 30 },
  knife: { pool: ['knife'], burst: [1, 1], pause: [0.6, 0.8], range: 40, pref: 1 },
};
function newBot(i) {
  const b = makeEnt(BOT_NAMES[i % BOT_NAMES.length], false);
  const wt = G.mode === 'range' ? 'ar' : i % 4 === 3 ? 'sniper' : pick(['ar', 'ar', 'smg', 'smg', 'sg', 'lmg']);
  Object.assign(b, { wt, bw: BOT_W[wt], wd: WPN[pick(BOT_W[wt].pool)], stepAcc: 0, skin: BOT_SKINS[i % BOT_SKINS.length], thinkT: rand(0, 0.2), target: null, seeT: -99,
    reactT: 0, trackT: 0, fireT: 0, burstLeft: 0, path: null, pathI: 0, repathT: 0, goal: null, strafe: 0, strafeT: 0, walkT: 0,
    alertSrc: null, alertT: -99, stuckT: 0, nadeT: rand(8, 20), meleeT: 0, firstShots: 2, wallT: 0, unstuckT: 0, unstuckDir: [0, 0, 0], blindT: 0, stunT: 0, bstreak: 0, gg: 0, lastPos: [0, 0, 0], aimYaw: 0, aimPitch: 0, errY: 0, errP: 0, stance: 'stand', pose: null, lastSeenPos: null });
  return b;
}
function resetBotAI(b) { b.bstreak = 0; b.blindT = 0; b.stunT = 0; if (G.mode === 'gun') ggEquip(b); b.target = null; b.path = null; b.goal = null; b.alertSrc = null; b.burstLeft = 0; b.stance = 'stand'; b.pose = null; b.aimYaw = b.yaw; b.aimPitch = 0; }

// ============================================================
//  ARTICULATED RIG (stand / crouch / prone / zombie) — used for drawing AND hit detection
// ============================================================
// upper body parts are relative to the pelvis, arms relative to the shoulder pivot (0,0.42,0)
const RIG_UP = [
  { z: 'lower', c: [0, 0.10, 0], s: [0.41, 0.22, 0.26], k: 'pants' },
  { z: 'upper', c: [0, 0.37, 0], s: [0.47, 0.34, 0.28], k: 'shirt' },
  { z: 'neck', c: [0, 0.59, 0], s: [0.14, 0.11, 0.14], k: 'skin', head: 1 },
  { z: 'head', c: [0, 0.75, 0], s: [0.25, 0.27, 0.27], k: 'skin', head: 1 },
  { c: [0, 0.36, 0], s: [0.50, 0.30, 0.31], k: 'vest', deco: 1 },
  { c: [0, 0.42, 0.17], s: [0.30, 0.30, 0.10], k: 'vest', deco: 1 },
  { c: [0, 0.87, 0], s: [0.30, 0.10, 0.31], k: 'helmet', deco: 1, head: 1 },
  { c: [0, 0.76, -0.135], s: [0.20, 0.05, 0.02], k: 'visor', deco: 1, head: 1 },
];
const RIG_ARM = [ // relative to shoulder pivot
  { z: 'upper', c: [-0.30, -0.06, -0.02], s: [0.13, 0.32, 0.14], k: 'shirt' },
  { z: 'upper', c: [0.30, -0.06, -0.02], s: [0.13, 0.32, 0.14], k: 'shirt' },
  { z: 'arm', c: [-0.17, -0.18, -0.25], s: [0.11, 0.11, 0.34], k: 'glove' },
  { z: 'arm', c: [0.21, -0.16, -0.22], s: [0.11, 0.11, 0.32], k: 'glove' },
  { c: [0.06, -0.13, -0.48], s: [0.075, 0.13, 0.78], k: 'gun', deco: 1, gun: 1 },
];
const RIG_POSE = {
  stand: { pel: 0.88, torso: 0.0, hip: 0.0, knee: 0.0, prone: 0, eye: 1.6 },
  crouch: { pel: 0.56, torso: 0.30, hip: 1.12, knee: 2.0, prone: 0, eye: 1.24 },
  prone: { pel: 0.22, torso: 0.0, hip: 0.0, knee: 0.05, prone: 1, eye: 0.45 },
};
const _pm = new Float32Array(16), _pa = new Float32Array(16), _pl = new Float32Array(16), _pk = new Float32Array(16);
function rigUpdate(b, dt) {
  const tgt = RIG_POSE[b.stance || 'stand'] || RIG_POSE.stand;
  if (!b.pose) b.pose = Object.assign({}, tgt);
  const r = Math.min(1, dt * 7);
  for (const k of ['pel', 'torso', 'hip', 'knee', 'prone', 'eye']) b.pose[k] += (tgt[k] - b.pose[k]) * r;
}
// returns [{z, m(rot+trans), s, k, deco, gun}]
function rigParts(b) {
  if (b._rigT === G.time && b._rig) return b._rig;
  const P = b.pose || RIG_POSE.stand, out = b._rig || (b._rig = []);
  out.length = 0;
  const push = (m, part) => { const e = { z: part.z, s: part.s, k: part.k, deco: part.deco, gun: part.gun, m: new Float32Array(16) }; e.m.set(m); M4.tr(e.m, ...part.c); out.push(e); };
  // root
  M4.ident(_pm); M4.tr(_pm, b.pos[0], b.pos[1] - (b.isZombie ? (1 - b.rise) * 1.8 : 0), b.pos[2]); M4.ry(_pm, b.yaw);
  if (!b.alive) { const t = G.time - b.deathT; const f = Math.min(1, t / 0.45); M4.rx(_pm, f * f * 1.45 * (P.prone > 0.5 ? 0.1 : 1)); }
  const pr = P.prone;
  M4.tr(_pm, 0, lerp(P.pel, 0.22, pr), 0); M4.rx(_pm, -Math.PI / 2 * pr);
  // legs
  const walk = Math.sin(b.walkT || 0), amp = b.isZombie ? (b.kind === 'sprint' ? 0.8 : 0.45) : P.prone > 0.5 ? 0.18 : P.hip > 0.5 ? 0.25 : 0.6;
  for (const side of [-1, 1]) {
    M4.copy(_pl, _pm); M4.tr(_pl, side * 0.11, 0, 0);
    const sw = walk * amp * side;
    M4.rx(_pl, P.hip + sw + (pr > 0.5 ? 0 : 0)); if (pr > 0.5) M4.rz(_pl, side * 0.12);
    push(_pl, { z: 'uleg', c: [0, -0.21, 0], s: [0.18, 0.42, 0.21], k: 'pants' });
    M4.tr(_pl, 0, -0.42, 0); M4.rx(_pl, -(P.knee + Math.max(0, -sw) * 0.8));
    push(_pl, { z: 'lleg', c: [0, -0.23, 0], s: [0.16, 0.46, 0.19], k: 'boots' });
    push(_pl, { c: [0, -0.44, -0.07], s: [0.15, 0.08, 0.28], k: 'boots', deco: 1 });
  }
  // upper body
  M4.copy(_pa, _pm); M4.rx(_pa, -(P.torso + (b.isZombie ? 0.35 : 0)));
  for (const part of RIG_UP) {
    if (b.isZombie && (part.k === 'vest' || part.k === 'helmet' || part.k === 'visor')) continue;
    if (part.head) { M4.copy(_pk, _pa); M4.tr(_pk, 0, 0.55, 0); M4.rx(_pk, pr * 1.15); M4.tr(_pk, 0, -0.55, 0); push(_pk, part); }
    else push(_pa, part);
  }
  // arms (aim pitch; prone arms point forward along the ground)
  M4.copy(_pk, _pa); M4.tr(_pk, 0, 0.42, 0);
  const armP = b.isZombie ? (b.kind === 'walk' ? 1.25 : 0.55 + Math.sin(b.walkT || 0) * 0.35) : (b.pitch || 0) + P.torso * 0.9 + pr * (Math.PI / 2 - 0.12);
  M4.rx(_pk, armP);
  for (const part of RIG_ARM) { if (part.gun && (b.isZombie || (b.wd && b.wd.melee))) continue; push(_pk, part); }
  b._rigT = G.time;
  return out;
}
function rayBot(b, o, d, tmax) {
  if (Math.abs(o[0] - b.pos[0]) + Math.abs(o[2] - b.pos[2]) > 2.5 && V.dot(V.sub([b.pos[0], b.pos[1] + 0.9, b.pos[2]], o), d) < -1.5) return null;
  let best = tmax, zone = null;
  for (const p of rigParts(b)) {
    if (!p.z) continue;
    const m = p.m, rx = o[0] - m[12], ry = o[1] - m[13], rz = o[2] - m[14];
    const lo = [m[0] * rx + m[1] * ry + m[2] * rz, m[4] * rx + m[5] * ry + m[6] * rz, m[8] * rx + m[9] * ry + m[10] * rz];
    const ld = [m[0] * d[0] + m[1] * d[1] + m[2] * d[2], m[4] * d[0] + m[5] * d[1] + m[6] * d[2], m[8] * d[0] + m[9] * d[1] + m[10] * d[2]];
    const hx = p.s[0] * 0.55, hy = p.s[1] * 0.55, hz = p.s[2] * 0.55;
    const t = rayBox(lo, ld, [-hx, -hy, -hz], [hx, hy, hz], best);
    if (t >= 0 && t < best) { best = t; zone = p.z; }
  }
  return zone ? { t: best, zone } : null;
}

// ---- AI ----
function botEye(b) { return [b.pos[0], b.pos[1] + (b.pose ? b.pose.eye : 1.6), b.pos[2]]; }
function botCenterY(b) { return b.pose ? b.pose.eye * 0.72 : 1.15; }
function entAimPoint(e, head) {
  if (e.isPlayer) return [e.pos[0], e.pos[1] + (head ? e.h - 0.12 : e.h * 0.72), e.pos[2]];
  const ey = e.pose ? e.pose.eye : 1.6;
  if (e.pose && e.pose.prone > 0.5) { const f = fwdVec(e.yaw, 0); return [e.pos[0] + f[0] * (head ? 0.75 : 0.35), e.pos[1] + (head ? 0.42 : 0.25), e.pos[2] + f[2] * (head ? 0.75 : 0.35)]; }
  return [e.pos[0], e.pos[1] + (head ? ey + 0.02 : ey * 0.75), e.pos[2]];
}
function botPerceive(b) {
  const D = DIFFS[G.diff], eye = botEye(b);
  if (b.blindT > 0) { b.target = null; return; }
  const fwd = fwdVec(b.yaw, 0);
  let best = null, bs = 1e9;
  for (const e of G.ents) {
    if (e === b || !e.alive || !isEnemy(b, e)) continue;
    let range = Math.max(b.bw.range, 45) * D.see;
    if (e.isPlayer) { if (e.stance === 'prone') range *= 0.55; else if (e.stance === 'crouch') range *= 0.8; if (hasPerk('cb')) range *= 0.7; if (G.time - e.firedT < 0.6) range *= 1.6; }
    const tgt = entAimPoint(e, false), dv = V.sub(tgt, eye), dist = V.len(dv);
    if (dist > range) continue;
    let alerted = b.alertSrc === e && G.time - b.alertT < 3;
    if (e.isPlayer && !hasPerk('ds') && e.onGround && e.stance === 'stand') { const hs = Math.hypot(e.vel[0], e.vel[2]); if (hs > 3 && dist < (e.sprint ? 16 : 9)) alerted = true; }
    const dir = V.mul(dv, 1 / dist), ang = Math.acos(clamp(dir[0] * fwd[0] + dir[2] * fwd[2], -1, 1));
    if (!alerted && ang > 75 * DEG && dist > 5) continue;
    if (!losClear(eye, tgt) && !losClear(eye, entAimPoint(e, true))) continue;
    if (G.smokes.length && smokeBlocks(eye, tgt)) continue;
    let sc = dist + (e === b.target ? -15 : 0) + (e.isPlayer ? -5 : 0) + (alerted ? -20 : 0);
    if (sc < bs) { bs = sc; best = e; }
  }
  if (best) {
    if (best !== b.target) {
      const dist = V.dist(best.pos, b.pos);
      b.target = best; b.reactT = D.react * rand(0.85, 1.35) * (1 + dist / 80); b.trackT = 0; b.firstShots = 2;
      b.errY = (Math.random() < 0.5 ? -1 : 1) * rand(0.6, 1) * D.acc * 2.2; b.errP = rand(-1, 1) * D.acc * 1.2;
      b.strafeT = 0;
    }
    else if (G.time - b.seeT > 0.6) { b.reactT = Math.max(b.reactT, D.react * rand(0.5, 0.8)); b.trackT = 0; b.firstShots = 2; }
    b.seeT = G.time; b.lastSeenPos = best.pos.slice();
  } else if (b.target && G.time - b.seeT > 1.5) {
    b.goal = b.lastSeenPos; b.path = null; b.target = null; b.stance = 'stand';
  }
}
function botOnDamaged(b, src) { if (src && src !== b) { b.alertSrc = src; b.alertT = G.time; b.thinkT = 0; if (!b.target) { b.goal = src.pos.slice(); b.path = null; } } }
function botHear(b, src) { if (src === b || G.mode === 'range' || !isEnemy(b, src)) return; if (!b.target) { b.goal = src.pos.slice(); b.path = null; b.repathT = 0; } }

function updateBot(b, dt) {
  if (!b.alive) {
    b.respawnT -= dt;
    if (b.respawnT <= 0 && !G.over) { spawnEnt(b); resetBotAI(b); }
    return;
  }
  const D = DIFFS[G.diff], range = G.mode === 'range';
  b.blindT = Math.max(0, b.blindT - dt); b.stunT = Math.max(0, b.stunT - dt); b.meleeT = Math.max(0, b.meleeT - dt); b.nadeT -= dt;
  b.thinkT -= dt;
  if (b.thinkT <= 0 && !range) { b.thinkT = rand(0.1, 0.2); botPerceive(b); }
  const engaging = b.target && b.target.alive && G.time - b.seeT < 0.35;
  if (b.target && !b.target.alive) { b.target = null; b.stance = 'stand'; }
  let mvx = 0, mvz = 0, spd = BASE_SPEED * 0.95, wantYaw = b.yaw;
  if (engaging) {
    const t = b.target, eye = botEye(b), tp = entAimPoint(t, false);
    const dv = V.sub(tp, eye), dist = V.len(dv);
    const [ty, tpch] = yawPitchOf(V.norm(dv));
    wantYaw = ty;
    // aim converges with tracking time
    b.trackT += dt;
    const conv = Math.max(0.45, 1 - b.trackT * 0.6);
    b.errY = approach(b.errY, 0, dt * D.acc * 1.1); b.errP = approach(b.errP, 0, dt * D.acc * 0.8);
    b.aimYaw = ty + b.errY * DEG * conv; b.aimPitch = tpch + b.errP * DEG * conv;
    // movement while engaging
    b.strafeT -= dt;
    if (b.strafeT <= 0) {
      b.strafeT = rand(0.6, 1.6); b.strafe = b.wt === 'sniper' ? 0 : pick([-1, -1, 0, 1, 1]);
      const rr = Math.random();
      if (b.wt === 'sniper' && dist > 30) b.stance = rr < 0.45 ? 'prone' : rr < 0.8 ? 'crouch' : 'stand';
      else if (dist > 18 && rr < 0.12 && b.wt !== 'sg' && b.wt !== 'knife') b.stance = 'prone';
      else if (rr < 0.35) b.stance = 'crouch'; else b.stance = 'stand';
      if (b.stance === 'prone') { b.strafe = 0; b.strafeT += 1.5; }
    }
    const right = [Math.cos(ty), 0, -Math.sin(ty)], fw = [-Math.sin(ty), 0, -Math.cos(ty)];
    if (b.strafe && (blockedAhead(b.pos, right[0] * b.strafe, right[2] * b.strafe, 0.75) || !navFree(...navCell(b.pos[0] + right[0] * b.strafe * 0.9, b.pos[2] + right[2] * b.strafe * 0.9)))) b.strafe = -b.strafe;
    mvx = right[0] * b.strafe; mvz = right[2] * b.strafe;
    if (dist > b.bw.pref * 1.3 && b.wt !== 'sniper' && walkClear(b.pos, [b.pos[0] + fw[0] * 3, 0, b.pos[2] + fw[2] * 3])) { mvx += fw[0] * 0.8; mvz += fw[2] * 0.8; }
    spd *= b.stance === 'crouch' ? 0.4 : b.stance === 'prone' ? 0.1 : 0.6;
    if ((b.wt === 'knife' || dist < 3) && walkClear(b.pos, t.pos)) { mvx = -Math.sin(ty); mvz = -Math.cos(ty); spd = BASE_SPEED * (b.wt === 'knife' ? 1.2 : 0.9); b.stance = 'stand'; }
    if (dist < 1.9 && b.meleeT <= 0 && !range) { b.meleeT = 0.9; const tgt = t; setTimeout(() => { if (b.alive && tgt.alive && V.dist(b.pos, tgt.pos) < 2.3) damageEnt(tgt, 135, b, null, 'melee', fwdVec(b.yaw, 0), 1); }, 280); }
    // grenades
    if (b.nadeT <= 0 && dist > 9 && dist < 30 && b.trackT > 0.8 && !range && G.mode !== 'gun') {
      b.nadeT = rand(18, 35);
      const tp = t.pos, dxz = Math.hypot(tp[0] - b.pos[0], tp[2] - b.pos[2]), tf = clamp(dxz / 15, 0.6, 2.2);
      const v = [(tp[0] - b.pos[0]) / tf, (tp[1] + 0.3 - (b.pos[1] + 1.6)) / tf + 0.5 * 15 * tf, (tp[2] - b.pos[2]) / tf];
      G.projs.push({ type: 'frag', pos: botEye(b), vel: v, owner: b, team: b.team, t: Math.max(0, 3 - tf - 0.6), stuck: false, spin: 0, yaw: b.yaw });
    }
    // fire
    b.reactT -= dt; b.fireT -= dt;
    const aimOk = Math.abs(angDiff(b.yaw, ty)) < 6 * DEG && b.trackT > 0.25;
    if (b.blindT > 0 || b.stunT > 0) { b.errY += rand(-1, 1) * 30 * dt; b.errP += rand(-1, 1) * 20 * dt; spd *= b.blindT > 0 ? 0.2 : 0.4; }
    if (b.reactT <= 0 && b.fireT <= 0 && aimOk && !range && b.blindT <= 0 && b.wt !== 'knife') {
      if (b.burstLeft <= 0) b.burstLeft = Math.round(rand(...b.bw.burst));
      botShoot(b, dist);
      b.burstLeft--;
      b.fireT = b.burstLeft > 0 ? (b.wd.burst ? 0.07 : b.wd.rof) : Math.max(rand(...b.bw.pause), b.wd.rof);
      if (b.wt === 'sniper' && b.trackT < 1.3) b.fireT = 0.4;
    }
  } else {
    // roam
    b.repathT -= dt;
    if (!b.path || b.pathI >= b.path.length || b.repathT <= 0) {
      const goal = b.goal || (!range && botObjective(b)) || (range ? [b.pos[0] + rand(-8, 8), 0, b.pos[2] + rand(-8, 8)] : pick(W.spawns));
      b.path = findPath(b.pos, goal); b.pathI = 0; b.repathT = range ? rand(2, 4) : G.mode === 'dom' || G.mode === 'kc' ? rand(3, 6) : rand(6, 12); b.goal = null;
      if (!b.path) { b.repathT = 0.5; b.yaw += rand(-1, 1); }
    }
    if (b.path && b.pathI < b.path.length) {
      // skip ahead when a later waypoint is directly walkable
      if (b.pathI + 1 < b.path.length && Math.random() < 0.1 && walkClear(b.pos, b.path[b.pathI + 1])) b.pathI++;
      const wp = b.path[b.pathI], dx = wp[0] - b.pos[0], dz = wp[2] - b.pos[2], dl = Math.hypot(dx, dz);
      if (dl < 0.7) b.pathI++;
      else { mvx = dx / dl; mvz = dz / dl; }
    }
    if (range) spd *= 0.45;
    b.stance = 'stand';
    b.aimYaw = b.yaw; b.aimPitch = approach(b.aimPitch, 0, dt);
  }
  // local obstacle avoidance: never keep running into a wall
  { const ml0 = Math.hypot(mvx, mvz);
    if (ml0 > 0.1) {
      const dx = mvx / ml0, dz = mvz / ml0;
      if (blockedAhead(b.pos, dx, dz, 0.55) || blockedAhead(b.pos, dx, dz, 0.95)) {
        let found = false;
        for (const a of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) { const c = Math.cos(a), sn = Math.sin(a), nx = dx * c - dz * sn, nz = dx * sn + dz * c; if (!blockedAhead(b.pos, nx, nz, 0.55) && !blockedAhead(b.pos, nx, nz, 0.95)) { mvx = nx * ml0; mvz = nz * ml0; found = true; break; } }
        if (!found) { mvx = 0; mvz = 0; b.path = null; b.repathT = 0; }
      }
      if (!engaging) wantYaw = Math.atan2(-mvx, -mvz);
    }
    if (b.unstuckT > 0) { b.unstuckT -= dt; mvx = b.unstuckDir[0]; mvz = b.unstuckDir[2]; if (!engaging) wantYaw = Math.atan2(-mvx, -mvz); }
  }
  // turning
  if (b.stunT > 0) { mvx *= 0.4; mvz *= 0.4; }
  const turn = (engaging ? D.turn : 5) * dt * (b.stunT > 0 ? 0.3 : 1);
  b.yaw += clamp(angDiff(b.yaw, engaging ? b.aimYaw : wantYaw), -turn, turn);
  b.pitch = engaging ? b.aimPitch : approach(b.pitch, 0, dt);
  // physics
  const ml = Math.hypot(mvx, mvz); if (ml > 1) { mvx /= ml; mvz /= ml; }
  b.vel[0] = approach(b.vel[0], mvx * spd, 30 * dt); b.vel[2] = approach(b.vel[2], mvz * spd, 30 * dt);
  b.vel[1] -= GRAV * dt;
  rigUpdate(b, dt);
  const r = moveEntity(b, b.vel[0] * dt, b.vel[1] * dt, b.vel[2] * dt, 0.3, b.stance === 'crouch' ? 1.3 : b.stance === 'prone' ? 0.6 : 1.8, b.onGround ? 0.46 : 0);
  if (r.ground) { b.vel[1] = 0; b.onGround = true; } else b.onGround = false;
  b.wallT = r.hitWall && Math.hypot(mvx, mvz) > 0.1 ? (b.wallT || 0) + dt : 0;
  if (b.wallT > 0.35) { b.wallT = 0; b.path = null; b.repathT = 0; const a = rand(0, Math.PI * 2); b.unstuckDir = [Math.cos(a), 0, Math.sin(a)]; b.unstuckT = 0.4; if (engaging) b.strafe = -b.strafe; }
  const hs = Math.hypot(b.vel[0], b.vel[2]);
  b.walkT += dt * hs * 2.2;
  const P0 = G.player;
  if (P0 && P0.alive && hs > 1.5 && b.onGround) {
    b.stepAcc += hs * dt;
    if (b.stepAcc > 2.0) {
      b.stepAcc = 0; const pd = V.dist(b.pos, P0.pos), maxD = hasPerk('aw') ? 30 : 14;
      if (pd < maxD) { const rel = angDiff(P0.camYaw, Math.atan2(-(b.pos[0] - P0.pos[0]), -(b.pos[2] - P0.pos[2]))); sfxStep((hasPerk('aw') ? 0.16 : 0.07) * (1 - pd / maxD), clamp(-Math.sin(rel), -1, 1) * 0.9); }
    }
  }
  // stuck detection
  b.stuckT += dt;
  if (b.stuckT > 1.0) { if (!engaging && V.dist2(b.pos, b.lastPos) < 0.5 && ml > 0.1) { b.path = null; b.repathT = 0; b.goal = null; const a = rand(0, Math.PI * 2); b.unstuckDir = [Math.cos(a), 0, Math.sin(a)]; b.unstuckT = 0.5; } b.stuckT = 0; b.lastPos = b.pos.slice(); }
}
let _sndBudget = 0;
function botShoot(b, dist) {
  const D = DIFFS[G.diff], wd = b.wd, eye = botEye(b);
  const moving = Math.hypot(b.vel[0], b.vel[2]) > 1;
  const t = b.target;
  const tSpd = Math.hypot(t.vel ? t.vel[0] : 0, t.vel ? t.vel[2] : 0);
  let err = D.acc * 0.62 * (moving ? 1.4 : 1) * (b.wt === 'sniper' ? 0.6 : 1) * (b.stance === 'crouch' ? 0.85 : b.stance === 'prone' ? 0.7 : 1);
  err *= 1 + Math.min(tSpd, 8) / 7;                                  // moving targets are harder
  if (t.isPlayer && (t.sprint || t.slideT > 0 || t.diving)) err *= 1.35;
  if (t.isPlayer && t.stance === 'prone') err *= 1.2;
  if (b.firstShots > 0) { err *= 1.7; b.firstShots--; }               // first shots of an engagement are rushed
  err *= 1 + Math.max(0, (Math.round(b.bw.burst[1]) - b.burstLeft)) * 0.06; // recoil within a burst
  // aim at chest, occasionally head
  const ap = entAimPoint(t, Math.random() < 0.2);
  let dir = V.norm(V.sub(ap, eye));
  // add aim offset (current yaw/pitch error) and random spread
  const [yy, pp] = yawPitchOf(dir);
  dir = fwdVec(yy + angDiff(yy, b.aimYaw), pp + (b.aimPitch - pp));
  dir = coneDir(dir, err * DEG);
  b.firedT = G.time;
  const n = wd.pellets || 1;
  for (let i = 0; i < n; i++) {
    const dd = wd.pellets ? coneDir(dir, wd.pelSpread * 0.8 * DEG) : dir;
    const res = fireBullet(b, eye, dd, wd, b.bw.range + 20);
    if (i < 2) G.tracers.push({ a: V.add(eye, V.mul(dd, 0.8)), b: res.point, t: 0, life: 0.06, bot: 1 });
  }
  const P = G.player;
  if (P && _sndBudget < 4) {
    _sndBudget++;
    const pd = V.dist(b.pos, P.pos);
    if (pd < 140) {
      const rel = angDiff(P.camYaw, Math.atan2(-(b.pos[0] - P.pos[0]), -(b.pos[2] - P.pos[2])));
      sfxShot(wd.kind, Math.max(1, pd), clamp(-Math.sin(rel), -1, 1) * 0.8, false, hasPerk('aw') ? 1.3 : 1);
    }
  }
}

function botStreak(b) {
  b.bstreak = (b.bstreak || 0) + 1;
  if (G.mode === 'range' || G.mode === 'gun' || G.mode === 'zombies') return;
  const P = G.player;
  if (b.bstreak === 3 && isEnemy(b, P)) { if (G.cuavT > 0) popup('敵のUAVを妨害した', '#9fd7ff'); else { G.enemyUavT = 30; popup('敵のUAVが上空にいる', '#ff6a5a'); } }
  if (b.bstreak === 5) { spawnDrone(b, null); if (isEnemy(b, P)) popup('敵のハンタードローンが接近中', '#ff6a5a'); }
}
