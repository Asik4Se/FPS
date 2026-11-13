// ============================================================
//  ZOMBIES: final boss "研究体ゼロ" (original design) — sealed vault arena
// ============================================================
const BOSS_NAME = '研究体ゼロ';
const zbInArena = p => { const A = W.zq && W.zq.arena; return !!A && p.pos[0] > A.min[0] && p.pos[0] < A.max[0] - 0.6 && p.pos[2] > A.min[1] && p.pos[2] < A.max[1]; };
function zbSetDoor(open) {
  const d = W.bossDoor; if (!d || d.open === open) return;
  d.open = open;
  if (open) W.boxes = W.boxes.filter(b => !d.boxes.includes(b)); else for (const b of d.boxes) W.boxes.push(b);
  buildNav(); buildMinimap(); buildWorldMesh(); if (G.zm) G.zm.flowT = 0;
}
function zbOpenVault() {
  const z = G.zm; z.vaultOpen = true; W.zones.X = true; zbSetDoor(true);
  popup('封鎖扉が開いた — 奥へ進むと戦闘開始（扉は閉ざされる）', '#ff8adf'); sfxBoom(4, 0, true); G.player.shake = 0.6;
}
function zbStart() {
  const z = G.zm, P = G.player, A = W.zq.arena, R = Math.max(1, z.round);
  zbSetDoor(false);
  // zombies left outside cannot follow: clear them
  for (const b of G.zombies) if (b.alive && !zbInArena(b)) { b.alive = false; b.gone = true; }
  G.zombies = G.zombies.filter(b => !b.gone); G.ents = G.ents.filter(e => !e.gone);
  const hp = Math.round(150000 * (1 + 0.12 * (R - 1)));
  const b = makeEnt(BOSS_NAME, false);
  Object.assign(b, { isZombie: true, isBoss: true, team: 'Z', pos: [A.center[0], -3, A.center[2]], hp, maxHp: hp, rise: 1, yaw: Math.atan2(-(P.pos[0] - A.center[0]), -(P.pos[2] - A.center[2])),
    stance: 'stand', pose: Object.assign({}, RIG_POSE.stand), vel: [0, 0, 0], walkT: 0, state: 'intro', st: 0, cd: { swipe: 1, slam: 3, charge: 6, throw: 4 }, phase: 1, h: 3.4,
    dmgK: 1 + 0.045 * (R - 1), spdK: 1 + Math.min(0.45, 0.022 * R), bp: { lean: 0, armL: 0.2, armR: 0.2, side: 0, crouch: 0, head: 0 }, hitPlayer: false, lastDmgT: -9 });
  G.zombies.push(b); G.ents.push(b);
  z.boss = b; z.bossRound = R; z.spawnT = 6; z.borbs = []; z.bossT = 0;
  popup(`${BOSS_NAME} が目覚めた（ラウンド${R}の強さ）`, '#ff4adf'); sfxBoom(2, 0, true); P.shake = 1;
}
// ---------- per-frame AI ----------
function zbSpawnTick(dt, alive) {
  const z = G.zm; z.spawnT -= dt; z.bossT += dt;
  if (z.spawnT <= 0 && alive < 11 && z.boss && z.boss.alive) { z.spawnT = Math.max(1.0, 3.4 - z.bossRound * 0.07) / (z.boss.phase >= 3 ? 1.5 : 1); zmSpawnOne(pick(W.zq.arena.spawns)); }
}
function zbHitPlayer(P, b, dmg, push) {
  if (!P.alive) return;
  zmHitPlayer(P, b, dmg * b.dmgK);
  if (push) { const d = V.norm([P.pos[0] - b.pos[0], 0, P.pos[2] - b.pos[2]]); P.vel[0] += d[0] * push; P.vel[2] += d[2] * push; P.vel[1] = Math.max(P.vel[1], push * 0.35); P.onGround = false; }
  P.shake = Math.max(P.shake || 0, 0.7);
}
function zbRoarFX(b) { sfxBoom(3, 0, true); sfxGroan(4, 0); setTimeout(() => sfxGroan(4, 0.3), 250); G.player.shake = 1.1; }
function zbUpdate(b, dt, P) {
  const z = G.zm; b.st += dt;
  for (const k in b.cd) b.cd[k] -= dt * (b.phase === 3 ? 1.35 : b.phase === 2 ? 1.15 : 1);
  if (b.burnT > 0) { b.burnT -= dt; if (Math.random() < dt * 20) G.parts.push({ pos: [b.pos[0] + rand(-0.6, 0.6), b.pos[1] + rand(0.5, 3), b.pos[2] + rand(-0.6, 0.6)], vel: [0, rand(1, 3), 0], life: 0.5, t: 0, size: rand(0.1, 0.25), col: [1, 0.5, 0.1], emis: 1, g: -1 }); zmOnDamage(b, b.burnDps * dt, P, null, 'burn'); if (!b.alive) return; }
  b.slowT = Math.max(0, (b.slowT || 0) - dt); b.stunT = Math.max(0, (b.stunT || 0) - dt); if ((b.acidT = Math.max(0, (b.acidT || 0) - dt)) <= 0) b.acid = 0;
  const dx = P.pos[0] - b.pos[0], dz = P.pos[2] - b.pos[2], dist = Math.hypot(dx, dz), face = Math.atan2(-dx, -dz);
  const turn = (to, rate) => { b.yaw += clamp(angDiff(b.yaw, to), -rate * dt, rate * dt); };
  const bp = b.bp, tgt = { lean: 0.15, armL: 0.25 + Math.sin(b.walkT) * 0.35, armR: 0.25 - Math.sin(b.walkT) * 0.35, side: 0, crouch: 0, head: 0 };
  const enr = b.phase === 3 ? 1.35 : b.phase === 2 ? 1.15 : 1, slowK = b.slowT > 0 ? 0.55 : 1;
  const set = s => { b.state = s; b.st = 0; b.hitPlayer = false; };
  const los = () => losClear([b.pos[0], b.pos[1] + 2.4, b.pos[2]], eyePos(P));
  let move = 0, mdir = [0, 0];
  switch (b.state) {
    case 'intro': {
      const k = Math.min(1, b.st / 2.2); b.pos[1] = lerp(-3, W.zq.arena.center[1], 1 - (1 - k) ** 3);
      Object.assign(tgt, { lean: -0.5, side: 1.1, head: -0.6, armL: 0.6, armR: 0.6 });
      if (b.st > 1.2 && !b.roared) { b.roared = true; zbRoarFX(b); }
      if (b.st > 3) { b.roared = false; set('chase'); }
      break;
    }
    case 'chase': {
      move = 3.1 * b.spdK * enr * slowK; mdir = [dx / (dist || 1), dz / (dist || 1)];
      if (!los() && z.flow) { // around pillars via the zombie flow field
        const [ci, cj] = navCell(b.pos[0], b.pos[2]), gh = W.gh; let best = z.flow[ci * gh + cj], bi = ci, bj = cj;
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const ni = ci + di, nj = cj + dj; if (!navFree(ni, nj)) continue; const v = z.flow[ni * gh + nj]; if (v < best) { best = v; bi = ni; bj = nj; } }
        const tx = W.minX + bi + 0.5 - b.pos[0], tz = W.minZ + bj + 0.5 - b.pos[2], tl = Math.hypot(tx, tz); if (tl > 0.05) mdir = [tx / tl, tz / tl];
      }
      turn(Math.atan2(-mdir[0], -mdir[1]), 4);
      if (b.stunT > 0) move = 0;
      if (dist < 3.2 && b.cd.swipe <= 0) set('swipe');
      else if (dist < 6 && b.cd.slam <= 0) set('slam');
      else if (dist > 7 && dist < 28 && b.cd.charge <= 0 && los()) { set('charge'); b.chargeDir = null; }
      else if (dist > 8 && b.cd.throw <= 0 && los()) set('throw');
      break;
    }
    case 'swipe': { // quick claw swipe
      turn(face, 6); Object.assign(tgt, { lean: 0.35, armR: b.st < 0.4 ? -1.9 : 1.6, armL: 0.4, side: 0.3 });
      if (b.st > 0.48 && !b.hitPlayer) { b.hitPlayer = true; sfxSwing(); if (dist < 3.6 && Math.abs(P.pos[1] - b.pos[1]) < 2.5) zbHitPlayer(P, b, 48, 6); }
      if (b.st > 0.95) { b.cd.swipe = 1.3; set('chase'); }
      break;
    }
    case 'slam': { // both fists over the head, ground pound shockwave
      if (b.st < 0.9) turn(face, 3);
      Object.assign(tgt, b.st < 0.9 ? { lean: -0.45, armL: 2.9, armR: 2.9, crouch: 0.1, head: -0.3 } : { lean: 0.75, armL: 0.55, armR: 0.55, crouch: 0.55, head: 0.3 });
      if (b.st > 0.95 && !b.hitPlayer) {
        b.hitPlayer = true; sfxBoom(Math.max(1, dist), 0, true); P.shake = Math.max(P.shake || 0, 1.2);
        const c = [b.pos[0] - Math.sin(b.yaw) * 1.6, b.pos[1], b.pos[2] - Math.cos(b.yaw) * 1.6];
        for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; G.parts.push({ pos: [c[0], c[1] + 0.15, c[2]], vel: [Math.cos(a) * 11, rand(0.5, 2), Math.sin(a) * 11], life: 0.55, t: 0, size: rand(0.15, 0.3), col: [0.75, 0.35, 1], emis: 0.9, g: 2 }); }
        const dd = Math.hypot(P.pos[0] - c[0], P.pos[2] - c[2]);
        if (dd < 6.5 && P.pos[1] - b.pos[1] < 0.7) zbHitPlayer(P, b, 68 * (1 - dd / 9), 9); // jump over the shockwave to dodge it
      }
      if (b.st > 1.7) { b.cd.slam = 6.5; set('chase'); }
      break;
    }
    case 'charge': { // telegraph (glow + crouch), then bull rush
      if (b.st < 0.85) { turn(face, 5); Object.assign(tgt, { lean: 0.9, crouch: 0.4, armL: -0.6, armR: -0.6, head: 0.4 }); if (!b.tele) { b.tele = true; sfxGroan(3, 0); } }
      else {
        b.tele = false;
        if (!b.chargeDir) { const lead = [P.pos[0] + P.vel[0] * 0.25 - b.pos[0], P.pos[2] + P.vel[2] * 0.25 - b.pos[2]], l = Math.hypot(...lead) || 1; b.chargeDir = [lead[0] / l, lead[1] / l]; b.yaw = Math.atan2(-b.chargeDir[0], -b.chargeDir[1]); }
        Object.assign(tgt, { lean: 1.0, crouch: 0.25, armL: -0.9, armR: -0.9, head: 0.5 });
        const sp = 15 * enr * slowK, r = moveEntity(b, b.chargeDir[0] * sp * dt, 0, b.chargeDir[1] * sp * dt, 0.75, 3.2, 0.5);
        b.walkT += dt * sp * 1.2;
        if (Math.random() < dt * 30) G.parts.push({ pos: [b.pos[0], b.pos[1] + 0.1, b.pos[2]], vel: [rand(-1, 1), rand(0.5, 1.5), rand(-1, 1)], life: 0.6, t: 0, size: rand(0.3, 0.6), col: [0.45, 0.43, 0.4], g: -0.2, smoke: 1 });
        if (!b.hitPlayer && Math.hypot(P.pos[0] - b.pos[0], P.pos[2] - b.pos[2]) < 2.0 && Math.abs(P.pos[1] - b.pos[1]) < 2.2) { b.hitPlayer = true; zbHitPlayer(P, b, 85, 14); }
        if (r.hitWall) { sfxBoom(Math.max(1, dist), 0, true); set('stagger'); popup('研究体ゼロがよろめいた — 今がチャンス', '#ffd24a'); break; }
        if (b.st > 2.05) { b.cd.charge = 8; set('chase'); }
      }
      break;
    }
    case 'throw': { // tear off a chunk of glowing biomass and hurl it
      turn(face, 5); Object.assign(tgt, b.st < 0.7 ? { lean: -0.3, armR: 2.6, armL: 0.5, side: -0.2 } : { lean: 0.4, armR: 1.2, armL: 0.4, side: 0.2 });
      if (b.st > 0.72 && !b.hitPlayer) {
        b.hitPlayer = true;
        const hand = [b.pos[0] + Math.cos(b.yaw) * 0.9, b.pos[1] + 3.2, b.pos[2] - Math.sin(b.yaw) * 0.9];
        const tgtP = [P.pos[0] + P.vel[0] * 0.5, P.pos[1] + 1, P.pos[2] + P.vel[2] * 0.5], v = V.sub(tgtP, hand), L = V.len(v), T = L / 18;
        const n = b.phase >= 2 ? 3 : 1;
        for (let i = 0; i < n; i++) { const sp = (i - (n - 1) / 2) * 0.18, dv = [v[0] / T, v[1] / T + 0.5 * 6 * T, v[2] / T]; const c = Math.cos(sp), s = Math.sin(sp); z.borbs.push({ pos: hand.slice(), vel: [dv[0] * c - dv[2] * s, dv[1], dv[0] * s + dv[2] * c], t: 0 }); }
        sfxPlasma(Math.max(1, dist));
      }
      if (b.st > 1.15) { b.cd.throw = 5; set('chase'); }
      break;
    }
    case 'roar': { // phase change: summon + enrage
      Object.assign(tgt, { lean: -0.5, side: 1.2, head: -0.7, armL: 0.7, armR: 0.7 });
      if (b.st > 0.3 && !b.hitPlayer) { b.hitPlayer = true; zbRoarFX(b); for (let i = 0; i < 4 + b.phase; i++) { const a = i / 6 * Math.PI * 2; zmSpawnOne([b.pos[0] + Math.cos(a) * 4, b.pos[2] + Math.sin(a) * 4]); } }
      if (b.st > 2) set('chase');
      break;
    }
    case 'stagger': {
      Object.assign(tgt, { lean: 0.3, side: Math.sin(b.st * 6) * 0.4, armL: 0.1, armR: 0.1, head: 0.6, crouch: 0.3 });
      if (Math.random() < dt * 10) G.parts.push({ pos: [b.pos[0], b.pos[1] + 3.4, b.pos[2]], vel: [rand(-1, 1), rand(1, 2), rand(-1, 1)], life: 0.5, t: 0, size: 0.06, col: [1, 1, 0.5], emis: 1, g: 2 });
      if (b.st > 1.8) { b.cd.charge = 7; set('chase'); }
      break;
    }
  }
  // phase transitions
  const hr = b.hp / b.maxHp;
  if (b.phase === 1 && hr < 0.6 && b.state !== 'charge') { b.phase = 2; popup('研究体ゼロが激昂した', '#ff4adf'); set('roar'); }
  else if (b.phase === 2 && hr < 0.3 && b.state !== 'charge') { b.phase = 3; popup('研究体ゼロ — 最終形態', '#ff2a8a'); set('roar'); }
  // locomotion
  if (move > 0 && dist > 2.6) {
    b.vel[0] = approach(b.vel[0], mdir[0] * move, 12 * dt); b.vel[2] = approach(b.vel[2], mdir[1] * move, 12 * dt);
  } else { b.vel[0] = approach(b.vel[0], 0, 14 * dt); b.vel[2] = approach(b.vel[2], 0, 14 * dt); }
  if (b.state !== 'charge' && b.state !== 'intro') {
    b.vel[1] -= GRAV * dt; const r = moveEntity(b, b.vel[0] * dt, b.vel[1] * dt, b.vel[2] * dt, 0.75, 3.2, 0.5); if (r.ground) b.vel[1] = 0;
    b.walkT += dt * Math.hypot(b.vel[0], b.vel[2]) * 1.3;
    if (Math.hypot(b.vel[0], b.vel[2]) > 0.5 && Math.floor(b.walkT / Math.PI) !== Math.floor((b.walkT - dt * Math.hypot(b.vel[0], b.vel[2]) * 1.3) / Math.PI)) { sfxThud(0.25); P.shake = Math.max(P.shake || 0, clamp(0.35 - dist / 60, 0, 0.3)); }
  }
  for (const k in bp) bp[k] += (tgt[k] - bp[k]) * Math.min(1, dt * (b.state === 'slam' && b.st > 0.9 ? 22 : b.state === 'swipe' ? 16 : 8));
  // biomass projectiles
  for (const o of z.borbs) {
    o.t += dt; o.vel[1] -= 6 * dt; const prev = o.pos.slice(); o.pos = V.add(o.pos, V.mul(o.vel, dt));
    if (Math.random() < dt * 40) G.parts.push({ pos: o.pos.slice(), vel: [rand(-0.5, 0.5), rand(-0.5, 0.5), rand(-0.5, 0.5)], life: 0.3, t: 0, size: 0.12, col: [0.75, 0.3, 1], emis: 1, g: 0 });
    const dv = V.sub(o.pos, prev), L = V.len(dv), h = L > 0 ? rayWorld(prev, V.mul(dv, 1 / L), L) : null;
    const pd = V.dist(o.pos, [P.pos[0], P.pos[1] + 1, P.pos[2]]);
    if (h || pd < 1.2 || o.pos[1] < 0 || o.t > 4) {
      o.dead = true; const c = h ? V.add(prev, V.mul(dv, h.t / L)) : o.pos;
      for (let i = 0; i < 18; i++) G.parts.push({ pos: c.slice(), vel: [rand(-6, 6), rand(1, 6), rand(-6, 6)], life: rand(0.3, 0.6), t: 0, size: rand(0.12, 0.3), col: [0.8, 0.3, 1], emis: 1, g: 6 });
      sfxBoom(Math.max(1, V.dist(c, P.pos)), 0, false);
      const d2 = V.dist(c, [P.pos[0], P.pos[1] + 1, P.pos[2]]); if (d2 < 3.2) zbHitPlayer(P, b, 46 * (1 - d2 / 4), 4);
    }
  }
  z.borbs = z.borbs.filter(o => !o.dead);
}
function zbOnDamage(b, dmg, src, zone) {
  const z = G.zm;
  if (src && src.isPlayer) { src.hitT = G.time; src.hitKill = b.hp <= 0; sfxHit(b.hp <= 0); if (zone !== 'burn' && zone !== 'elem' && zone !== 'explosive') zmAddPoints(10); }
  if (b.hp > 0) return;
  b.alive = false; b.deathT = G.time; z.kills++; z.cleared = true; zmAddPoints(5000);
  for (let i = 0; i < 80; i++) G.parts.push({ pos: [b.pos[0] + rand(-1, 1), b.pos[1] + rand(0.5, 3.2), b.pos[2] + rand(-1, 1)], vel: [rand(-8, 8), rand(2, 10), rand(-8, 8)], life: rand(0.5, 1.2), t: 0, size: rand(0.15, 0.45), col: pick([[0.8, 0.3, 1], [0.3, 1, 0.9], [1, 1, 1]]), emis: 1, g: 6 });
  sfxBoom(1, 0, true); setTimeout(() => sfxBoom(1, 0, true), 300); G.player.shake = 1.5;
  for (const o of G.zombies) if (o.alive && o !== b) { o.alive = false; o.deathT = G.time; }
  const first = !STATS.boss; STATS.boss = true; saveJSON('ls_stats', STATS);
  popup(`${BOSS_NAME} 討伐！`, '#ff4adf');
  popup(first ? '迷彩「ネメシス」解除（全武器）' : 'クリア', '#ffd24a');
  setTimeout(() => endMatch(), 4000);
}
function zbOnZombieDeath(e) { // arena: occasional ammo to keep the fight going
  const z = G.zm; if (e.isBoss || !z.boss || !z.boss.alive) return;
  if (Math.random() < 0.08) z.pows.push({ type: 'ammo', pos: [e.pos[0], e.pos[1] + 0.9, e.pos[2]], t: 0 });
}
// trigger: walk into the vault after opening it
function zbTick() {
  const z = G.zm, P = G.player; if (!z || !W.zq || !W.zq.arena) return;
  if (z.vaultOpen && !z.boss && !z.cleared && P.alive && zbInArena(P) && P.pos[0] < -16) zbStart();
}
// ---------- model (also used for hit detection via rigParts) ----------
const _zb = [new Float32Array(16), new Float32Array(16), new Float32Array(16), new Float32Array(16)];
const ZB_SKIN = [0.56, 0.58, 0.52], ZB_ARM = [0.17, 0.18, 0.21], ZB_GLOW = [0.75, 0.25, 1], ZB_TUBE = [0.3, 0.95, 0.85];
function bossParts(b) {
  if (b._rigT === G.time && b._rig) return b._rig;
  const out = b._rig || (b._rig = []); out.length = 0;
  const bp = b.bp, push = (m, c, s, z, col, emis) => { const e = { z, s, m: new Float32Array(16), col, emis: emis || 0 }; e.m.set(m); M4.tr(e.m, ...c); out.push(e); };
  const [R0, L0, T0, A0] = _zb;
  const dead = !b.alive ? Math.min(1, (G.time - b.deathT) / 1.2) : 0;
  M4.ident(R0); M4.tr(R0, b.pos[0], b.pos[1] - dead * 0.8, b.pos[2]); M4.ry(R0, b.yaw); if (dead) M4.rx(R0, dead * dead * 1.4);
  const hipY = 1.45 - bp.crouch * 0.45, walk = Math.sin(b.walkT || 0);
  // legs
  for (const side of [-1, 1]) {
    M4.copy(L0, R0); M4.tr(L0, side * 0.42, hipY, 0); M4.rx(L0, walk * 0.55 * side + bp.crouch * 0.5);
    push(L0, [0, -0.4, 0], [0.48, 0.82, 0.52], 'uleg', ZB_SKIN);
    M4.tr(L0, 0, -0.8, 0); M4.rx(L0, -(bp.crouch * 1.0 + Math.max(0, -walk * side) * 0.7));
    push(L0, [0, -0.38, 0], [0.42, 0.78, 0.46], 'lleg', ZB_ARM);
    push(L0, [0, -0.78, -0.12], [0.5, 0.2, 0.72], null, ZB_ARM);
  }
  // torso (leans forward/back), slight side twist for roar / throw
  M4.copy(T0, R0); M4.tr(T0, 0, hipY, 0); M4.rx(T0, -bp.lean); M4.rz(T0, bp.side * 0.15);
  push(T0, [0, 0.12, 0], [1.0, 0.4, 0.62], 'lower', ZB_ARM);
  push(T0, [0, 0.8, 0], [1.45, 1.0, 0.9], 'upper', ZB_SKIN);
  const pulse = 0.55 + 0.45 * Math.sin(G.time * (b.phase === 3 ? 9 : 4));
  push(T0, [0, 0.82, -0.47], [0.42, 0.42, 0.08], 'upper', ZB_GLOW, pulse);          // exposed core
  for (const side of [-1, 1]) {
    push(T0, [side * 0.88, 1.32, 0], [0.6, 0.34, 0.8], 'upper', ZB_ARM);              // shoulder plates
    push(T0, [side * 0.3, 1.45, 0.42], [0.14, 0.7, 0.14], null, ZB_TUBE, 0.6 * pulse); // back tubes
    push(T0, [side * 0.55, 0.8, 0.46], [0.3, 0.6, 0.12], null, ZB_ARM);
  }
  // head (weak point)
  M4.copy(A0, T0); M4.tr(A0, 0, 1.38, -0.12); M4.rx(A0, bp.head);
  push(A0, [0, 0.22, -0.05], [0.46, 0.46, 0.5], 'head', ZB_SKIN);
  push(A0, [0, 0.0, -0.18], [0.36, 0.14, 0.3], 'head', ZB_ARM);
  for (const side of [-1, 1]) push(A0, [side * 0.12, 0.28, -0.31], [0.1, 0.05, 0.02], null, ZB_GLOW, 1);
  // arms
  for (const side of [-1, 1]) {
    M4.copy(A0, T0); M4.tr(A0, side * 0.95, 1.15, 0); M4.rx(A0, side < 0 ? bp.armL : bp.armR); M4.rz(A0, side * (0.12 + bp.side * 0.9 * (side > 0 ? 1 : 1)));
    push(A0, [0, -0.42, 0], [0.4, 0.86, 0.4], 'arm', ZB_SKIN);
    M4.tr(A0, 0, -0.86, 0); M4.rx(A0, 0.25);
    push(A0, [0, -0.45, 0], [0.46, 0.9, 0.46], 'arm', ZB_ARM);
    push(A0, [0, -1.0, -0.05], [0.56, 0.36, 0.6], 'arm', ZB_SKIN);
    for (let i = -1; i <= 1; i++) push(A0, [i * 0.17, -1.32, -0.12], [0.07, 0.42, 0.07], null, [0.85, 0.85, 0.8]);
  }
  b._rigT = G.time;
  return out;
}
function drawBoss(b) {
  if (!b.alive && G.time - b.deathT > 3) return;
  const flash = G.time - b.lastDmgT < 0.05, burn = b.burnT > 0, frost = b.slowT > 0;
  for (const p of bossParts(b)) {
    M4.copy(_m, p.m); M4.sc(_m, ...p.s);
    let c = p.col; if (flash) c = c.map(v => Math.min(1, v + 0.35)); else if (burn) c = [c[0] * 0.6 + 0.45, c[1] * 0.6 + 0.15, c[2] * 0.6]; else if (frost) c = [c[0] * 0.6 + 0.2, c[1] * 0.6 + 0.3, c[2] * 0.6 + 0.4];
    drawCube(_m, c, p.emis * (b.alive ? 1 : 0.3));
  }
}
function zbDraw(t) {
  const z = G.zm; if (!z) return;
  for (const o of (z.borbs || [])) box(o.pos, [0.42, 0.42, 0.42], [0.8, 0.3, 1], 1, t * 6);
  // arena charge telegraph: glowing ring under the boss
  const b = z.boss; if (b && b.alive && b.state === 'charge' && b.st < 0.85) box([b.pos[0], b.pos[1] + 0.04, b.pos[2]], [3.2, 0.03, 3.2], [1, 0.3, 0.6], 0.5 + 0.5 * Math.sin(t * 30), t * 2);
}
function zbHUD(c, Wd, H) {
  const z = G.zm, b = z && z.boss; if (!b || (!b.alive && G.time - b.deathT > 4)) return;
  const w = 620, x = Wd / 2 - w / 2, y = 34, k = Math.max(0, b.hp / b.maxHp);
  txt(c, `${BOSS_NAME}　${['', 'フェーズ1', 'フェーズ2（激昂）', '最終形態'][b.phase]}　— ラウンド${z.bossRound}の強さ`, Wd / 2, y - 8, 15, '#ff8adf', 'center', 700);
  c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(x - 2, y - 2, w + 4, 16);
  c.fillStyle = b.phase === 3 ? '#ff2a8a' : b.phase === 2 ? '#d04aff' : '#a84aff'; c.fillRect(x, y, w * k, 12);
  c.fillStyle = 'rgba(255,255,255,.35)'; for (const m of [0.6, 0.3]) c.fillRect(x + w * m, y, 2, 12);
  if (b.state === 'stagger') txt(c, 'よろめき中 — 被ダメージ1.5倍', Wd / 2, y + 30, 13, '#ffd24a', 'center', 700);
}
