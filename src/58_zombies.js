// ============================================================
//  ZOMBIES (original wave-survival mode)
// ============================================================
const ZPOW = {
  ammo: { name: '弾薬補給', col: [0.3, 0.9, 0.3] }, insta: { name: '一撃必殺', col: [0.95, 0.2, 0.2] },
  double: { name: 'ダブルポイント', col: [1.0, 0.85, 0.2] }, nuke: { name: '全滅ボム', col: [0.95, 0.5, 0.1] },
};
const zmHas = id => !!(G.zm && G.zm.perks.has(id));
const zmKnifeDmg = () => 150 + (G.zm ? Math.max(0, G.zm.round - 1) * 30 : 0);
// zombie-mode damage profile (separate from multiplayer, like the original):
// per-bullet body damage and headshot multiplier. Round 1 zombie = 150 HP, +100 per round up to 9, then x1.1 per round.
const ZDMG = {
  vx50: [1400, 4], bls7: [1250, 4], as50x: [850, 3.5], dr90: [650, 3.5], svu: [560, 3.5],
  ar94: [210, 3], m8: [240, 3], sw56: [185, 3], ls60: [225, 2.5],
  sm7: [150, 3], msc: [160, 3], pd50: [135, 3],
  r870: [155, 1.5], sg12: [115, 1.5], ex9: [100, 1.5],
  p9: [85, 3], b23: [100, 3],
  // mystery-box exclusives hit much harder
  rpd: [420, 3], ksg: [300, 1.8], python: [1400, 3],
};
const ZDMG_CLS = { sniper: [700, 3.5], ar: [200, 3], lmg: [210, 2.5], smg: [140, 3], sg: [180, 1.5], pistol: [85, 3] };
function zmWeaponDamage(d, zone, dist, att) {
  const id = d._zid || (d._zid = Object.keys(WPN).find(k => WPN[k] === d) || '-');
  const [base, head] = ZDMG[id] || ZDMG_CLS[d.cls] || [100, 2];
  let k = 1;
  if (d.pellets) { const r0 = d.r0 * 1.3, r1 = d.r1 * 1.6; k = dist <= r0 ? 1 : dist >= r1 ? 0.3 : lerp(1, 0.3, (dist - r0) / (r1 - r0)); }
  else if (d.cls !== 'sniper') { const r0 = (d.r0 || 20) * 1.5, r1 = (d.r1 || 40) * 2; k = dist <= r0 ? 1 : dist >= r1 ? 0.75 : lerp(1, 0.75, (dist - r0) / (r1 - r0)); }
  if (att && att.has('sup')) k *= 0.9;
  const zm = zone === 'head' ? head : zone === 'neck' ? Math.max(1.5, head * 0.5) : zone === 'upper' || zone === 'lower' ? 1 : 0.85;
  return base * k * zm;
}
// find the top of the obstacle just ahead and climb onto it (cars, crates, containers up to ~2.8 m)
function zmTryVault(b, dx, dz, wantUp) {
  const q = [b.pos[0] + dx * 0.55, 0, b.pos[2] + dz * 0.55];
  const hits = boxesNear(q[0], q[2], 1.2).filter(bx => !(bx.ground || bx.flat || bx.noRay || bx.invis) && q[0] >= bx.mn[0] - 0.2 && q[0] <= bx.mx[0] + 0.2 && q[2] >= bx.mn[2] - 0.2 && q[2] <= bx.mx[2] + 0.2).sort((x, y) => x.mn[1] - y.mn[1]);
  let top = b.pos[1];
  for (const bx of hits) if (bx.mn[1] <= top + 0.6) top = Math.max(top, bx.mx[1]); // stacked parts (car body + cabin, crate on crate)
  const rise = top - b.pos[1];
  if (rise < 0.4 || rise > 2.9 || (!wantUp && rise > 1.3)) return false;
  for (const f of [0.95, 1.4, 0.65, 1.9]) {
    const land = [b.pos[0] + dx * f, top, b.pos[2] + dz * f];
    if (!spaceFree(land, 0.28, 1.7)) continue;
    b.vault = { a: b.pos.slice(), b: land, t: 0, dur: 0.45 + rise * 0.22 }; b.climbK = 0; b.yaw = Math.atan2(-dx, -dz);
    return true;
  }
  return false;
}
function zmAmmoCost(w) {
  const d = w.d, id = d._zid || (d._zid = Object.keys(WPN).find(k => WPN[k] === d) || '-');
  const base = ZWONDER.includes(id) ? 2500 : { pistol: 200, smg: 400, ar: 500, lmg: 600, sg: 450, sniper: 750, launcher: 1000 }[d.cls] || 500;
  return Math.round(base * [1, 3, 4, 5][papLv(w)] * (ZBOX_ONLY.includes(id) ? 1.5 : 1) / 50) * 50;
}
// ---------- Pack-a-Punch: 3 upgrade levels, then random elemental affixes ----------
const PAP_COST = [5000, 7500, 10000], AFFIX_COST = 3000;
const PAP_DMG = [1, 2, 3, 4.2], PAP_MAG = [1, 1.5, 1.75, 2];
const ELEMS = {
  fire: { name: '火炎', col: [1, 0.45, 0.1], css: '#ff7a2a', desc: '命中で燃やして継続ダメージ' },
  shock: { name: '電撃', col: [0.5, 0.85, 1], css: '#7ad8ff', desc: '電撃が周囲のゾンビに連鎖' },
  frost: { name: '凍結', col: [0.6, 0.9, 1], css: '#bff2ff', desc: '命中したゾンビを大きく減速' },
  blast: { name: '炸裂', col: [1, 0.8, 0.3], css: '#ffd25a', desc: '命中地点で小爆発' },
  acid: { name: '腐食', col: [0.5, 1, 0.3], css: '#9aff5a', desc: '被ダメージを最大60%増やす' },
};
const papLv = w => (w && w.up) | 0;
const zmResMax = w => Math.round(w.d.res * (1 + 0.5 * papLv(w)));
const zmWName = w => w.d.name + ['', '改', '改II', '改III'][papLv(w)] + (w.elem ? `［${ELEMS[w.elem].name}］` : '');
function papUpgrade(w) {
  const lv = Math.min(3, papLv(w) + 1); w.up = lv;
  if (!w.baseMag) w.baseMag = w.magMax;
  w.dmgMul = PAP_DMG[lv] * (w.d.cls === 'sniper' ? 1.5 : 1);
  w.magMax = Math.max(w.baseMag, Math.round(w.baseMag * PAP_MAG[lv])); w.mag = w.magMax; w.res = zmResMax(w);
  w.camo = PAP_CAMOS[lv - 1];
}
function papAffix(w) { const pool = Object.keys(ELEMS).filter(k => k !== w.elem); w.elem = pick(pool); w.mag = w.magMax; w.res = zmResMax(w); }
// elemental effects on a hit (called from zmOnDamage)
function zmElemHit(e, dmg, w, pos) {
  if (!w || !w.elem || !e.alive) return;
  const boss = e.isBoss;
  if (w.elem === 'fire') { e.burnT = 3; e.burnDps = boss ? 900 : Math.max(120, (e.maxHp || 500) * 0.18); }
  else if (w.elem === 'frost') { e.slowT = boss ? 1.2 : 2.5; }
  else if (w.elem === 'acid') { e.acid = Math.min(5, (e.acid || 0) + 1); e.acidT = 4; }
  else if (w.elem === 'shock' && Math.random() < 0.25) {
    let from = [e.pos[0], e.pos[1] + 1.1, e.pos[2]], n = 0;
    for (const o of G.zombies) {
      if (o === e || !o.alive || o.rise < 1 || n >= 4 || V.dist(o.pos, e.pos) > 6) continue;
      const to = [o.pos[0], o.pos[1] + 1.1, o.pos[2]]; G.tracers.push({ a: from, b: to, t: 0, life: 0.18, zap: 1 }); from = to; n++;
      o.stunT = 0.7; zmOnDamage(o, dmg * 0.8, G.player, null, 'elem');
    }
    e.stunT = boss ? 0.15 : 0.7; if (n) sfxPlasma(0.5);
  }
  else if (w.elem === 'blast' && Math.random() < 0.18) {
    const c = pos || [e.pos[0], e.pos[1] + 1, e.pos[2]];
    for (let i = 0; i < 14; i++) G.parts.push({ pos: c.slice(), vel: [rand(-5, 5), rand(1, 6), rand(-5, 5)], life: rand(0.2, 0.45), t: 0, size: rand(0.12, 0.3), col: [1, rand(0.5, 0.8), 0.2], emis: 1, g: 6 });
    sfxBoom(Math.max(1, V.dist(c, G.player.pos)), 0, false);
    for (const o of G.zombies) if (o !== e && o.alive && V.dist(o.pos, c) < 3.2) zmOnDamage(o, dmg * 1.5, G.player, null, 'elem');
  }
}
function zmCount(r) { return r <= 5 ? [6, 8, 13, 18, 24][r - 1] : Math.min(90, Math.floor(24 + (r - 5) * 6)); }
function zmHP(r) { return r < 10 ? 150 + 100 * (r - 1) : Math.floor(950 * Math.pow(1.1, r - 9)); }
function zmStart() {
  G.zm = { round: 0, toSpawn: 0, spawnT: 2, betweenT: 4, points: 500, kills: 0, heads: 0, downs: 0, perks: new Set(), revives: 0,
    pows: [], powThisRound: 0, insta: 0, dbl: 0, box: 0, boxUses: 0, roll: null, prompt: '', flow: null, flowT: 0, groanT: 0, floats: [] };
  G.zombies = [];
  zqInit();
}
function zmEquip(p) {
  p.wpn = [makeInst('p9', [])]; p.wpn[0].res = 48; p.cur = 0; p.lethals = 2; p.tacticals = 0;
  p.maxHp = zmHas('jug') ? 250 : 100; p.hp = p.maxHp;
}
function zmAddPoints(n) { const z = G.zm; const v = n * (z.dbl > 0 ? 2 : 1); z.points += v; z.floats.push({ v, t: G.time }); if (z.floats.length > 6) z.floats.shift(); }
function zmOnDamage(e, dmg, src, d, zone) {
  const z = G.zm; if (!z || !e.alive) return;
  if (e.acidT > 0) dmg *= 1 + 0.12 * (e.acid || 0);
  if (e.isBoss) { if (e.state === 'stagger') dmg *= 1.5; if (zone === 'head') dmg *= 0.55; } // the boss head is armored: weaker headshot bonus
  else if (z.insta > 0) dmg = e.hp + 1;
  e.hp -= dmg; e.lastDmgT = G.time;
  if (src && src.isPlayer && d && zone !== 'elem' && zone !== 'explosive') { const w = curW(src); if (w && w.d === d) zmElemHit(e, dmg, w); }
  if (e.isBoss) { zbOnDamage(e, dmg, src, zone); return; }
  if (src && src.isPlayer) { src.hitT = G.time; src.hitKill = e.hp <= 0; sfxHit(e.hp <= 0); }
  if (e.hp > 0) { if (src && src.isPlayer && zone !== 'explosive' && zone !== 'elem' && zone !== 'burn') zmAddPoints(10); return; }
  e.alive = false; e.deathT = G.time; z.kills++;
  if (src && src.isPlayer) {
    src.kills++;
    if (zone === 'melee') zmAddPoints(130); else if (zone === 'head') { zmAddPoints(100); z.heads++; } else zmAddPoints(60);
    src.score = z.points;
  }
  if (z.boss) zbOnZombieDeath(e);
  zqOnZombieDeath(e);
  if (z.powThisRound < 4 && Math.random() < 0.035) { z.powThisRound++; z.pows.push({ type: pick(Object.keys(ZPOW)), pos: [e.pos[0], e.pos[1] + 0.9, e.pos[2]], t: 0 }); }
}
function zmPlayerDown(p) {
  const z = G.zm;
  if (zmHas('rev') && z.revives > 0) {
    z.revives--; if (z.revives <= 0) z.perks.delete('rev');
    p.hp = p.maxHp; p.invulnT = G.time + 3; popup(`セカンドライフ発動（残り${z.revives}回）`, '#9fd7ff'); sfxUAV();
    for (const zb of G.zombies) if (zb.alive && V.dist(zb.pos, p.pos) < 5) { const dv = V.norm(V.sub(zb.pos, p.pos)); zb.pos = V.add(zb.pos, V.mul([dv[0], 0, dv[2]], 2)); }
    return;
  }
  p.alive = false; p.hp = 0; p.deathCam = 0; p.respawnT = 1e9; p.killer = { name: 'ゾンビ', wpn: '' };
  endMatch();
}
function zmSpawnOne(at) {
  const z = G.zm, P = G.player;
  const win = at ? null : zqPickWindow(P);
  let sp;
  if (at) sp = [at[0] + rand(-0.8, 0.8), at[1] + rand(-0.8, 0.8)];
  else if (win) { const tg = [-win.n[2], win.n[0]], o = rand(-0.9, 0.9); sp = [win.outside[0] - win.n[0] * 1.2 + tg[0] * o, win.outside[2] - win.n[2] * 1.2 + tg[1] * o]; }
  else { const pts = []; for (const k in W.zoneSpawn) if (W.zones[k]) pts.push(...W.zoneSpawn[k]); sp = pts.length ? pick(pts) : [0, 20]; }
  const b = makeEnt('ゾンビ', false);
  const r = z.round, roll = Math.random();
  const sprintP = clamp((r - 4) * 0.13, 0, 0.85), jogP = clamp((r - 2) * 0.25, 0, 1);
  const kind = roll < sprintP ? 'sprint' : roll < sprintP + jogP * (1 - sprintP) ? 'jog' : 'walk';
  Object.assign(b, { isZombie: true, team: 'Z', pos: [sp[0], 0, sp[1]], win, wst: win ? 'tear' : null, hp: zmHP(r), kind, spd: kind === 'sprint' ? BASE_SPEED * 1.5 * rand(0.86, 0.93) : { walk: 1.35, jog: 3.3 }[kind] * rand(0.92, 1.08),
    rise: 0, atkT: 0, walkT: rand(0, 6), maxHp: zmHP(r), yaw: rand(0, 6.28), stance: 'stand', pose: null, pitch: -0.25, skin: pick(ZSKINS), stuckT: 0, lastPos: [0, 0, 0], bob: rand(0, 6) });
  b.vel = [0, 0, 0];
  G.zombies.push(b); G.ents.push(b);
}
const ZSKINS = [
  { skin: [0.46, 0.52, 0.40], shirt: [0.30, 0.28, 0.26], pants: [0.22, 0.22, 0.25] },
  { skin: [0.52, 0.50, 0.44], shirt: [0.42, 0.36, 0.28], pants: [0.25, 0.22, 0.18] },
  { skin: [0.42, 0.47, 0.42], shirt: [0.55, 0.55, 0.52], pants: [0.30, 0.30, 0.32] },
  { skin: [0.50, 0.44, 0.40], shirt: [0.25, 0.30, 0.38], pants: [0.20, 0.20, 0.20] },
];
// flow field (distance to player over nav grid)
function zmFlow() {
  const z = G.zm, P = G.player, gh = W.gh, N = W.gw * gh;
  if (!z.flow || z.flow.length !== N) z.flow = new Float32Array(N);
  const f = z.flow; f.fill(1e9);
  const s = nearestFree(...navCell(P.pos[0], P.pos[2])); if (!s) return;
  const q = new Int32Array(N); let qh = 0, qt = 0;
  f[s[0] * gh + s[1]] = 0; q[qt++] = s[0] * gh + s[1];
  while (qh < qt) {
    const k = q[qh++], i = (k / gh) | 0, j = k % gh, base = f[k];
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue; const ni = i + di, nj = j + dj;
      if (!navFree(ni, nj)) continue;
      if (di && dj && (!navFree(i + di, j) || !navFree(i, j + dj))) continue;
      const nk = ni * gh + nj, c = base + (di && dj ? 1.414 : 1);
      if (c < f[nk]) { f[nk] = c; q[qt++] = nk; if (qt >= N) qt = N - 1; }
    }
  }
}
function updateZombies(dt) {
  const z = G.zm, P = G.player; if (!z) return;
  zbTick();
  z.insta = Math.max(0, z.insta - dt); z.dbl = Math.max(0, z.dbl - dt);
  // rounds
  const alive = G.zombies.filter(b => b.alive).length;
  if (z.boss) zbSpawnTick(dt, alive); // inside the vault: rounds are frozen, zombies keep coming
  else if (z.betweenT > 0) {
    z.betweenT -= dt;
    if (z.betweenT <= 0) { z.round++; z.repairPts = 0; z.toSpawn = zmCount(z.round); z.powThisRound = 0; z.spawnT = 1; sfxRound(true); popup(`ラウンド ${z.round}`, '#ff3a2a'); if (z.round > 1) P.lethals = Math.min(4, P.lethals + 2); }
  } else if (z.toSpawn > 0) {
    z.spawnT -= dt;
    if (z.spawnT <= 0 && alive < 24) { zmSpawnOne(); z.toSpawn--; z.spawnT = Math.max(0.35, 2.0 - z.round * 0.12); }
  } else if (alive === 0 && z.round > 0) { z.betweenT = 9; sfxRound(false); popup(`ラウンド ${z.round} クリア`, '#ff8a6a'); }
  // flow field
  z.flowT -= dt; if (z.flowT <= 0) { z.flowT = 0.35; zmFlow(); }
  // zombies
  z.groanT -= dt;
  for (const b of G.zombies) {
    if (!b.alive) continue;
    rigUpdate(b, dt);
    if (b.isBoss) { zbUpdate(b, dt, P); continue; }
    if (b.rise < 1) { b.rise = Math.min(1, b.rise + dt * 0.9); continue; }
    // elemental status effects
    if (b.burnT > 0) { b.burnT -= dt; if (Math.random() < dt * 14) G.parts.push({ pos: [b.pos[0] + rand(-0.25, 0.25), b.pos[1] + rand(0.3, 1.6), b.pos[2] + rand(-0.25, 0.25)], vel: [0, rand(1, 2.5), 0], life: 0.4, t: 0, size: rand(0.06, 0.14), col: [1, rand(0.4, 0.7), 0.1], emis: 1, g: -1 }); zmOnDamage(b, b.burnDps * dt, P, null, 'burn'); if (!b.alive) continue; }
    b.slowT = Math.max(0, (b.slowT || 0) - dt); b.stunT = Math.max(0, (b.stunT || 0) - dt); if ((b.acidT = Math.max(0, (b.acidT || 0) - dt)) <= 0) b.acid = 0;
    b.atkT -= dt;
    if (zqWindowZombie(b, dt, P)) continue;
    if (b.vault) { // climbing up onto a car / crate / container
      const v = b.vault; v.t += dt / v.dur; const k = Math.min(1, v.t), up = Math.min(1, k * 1.7), fw = clamp((k - 0.4) / 0.6, 0, 1);
      b.pos = [lerp(v.a[0], v.b[0], fw), lerp(v.a[1], v.b[1], up) + Math.sin(k * Math.PI) * 0.15, lerp(v.a[2], v.b[2], fw)]; b.climbK = k; b.stance = k > 0.2 && k < 0.8 ? 'crouch' : 'stand';
      if (k >= 1) { b.vault = null; b.climbK = null; b.pos = v.b.slice(); b.vel = [0, 0, 0]; b.stance = 'stand'; }
      continue;
    }
    const dx = P.pos[0] - b.pos[0], dz = P.pos[2] - b.pos[2], dist = Math.hypot(dx, dz);
    let mx = 0, mz = 0;
    if (P.alive) {
      if ((dist < 9 && Math.abs(P.pos[1] - b.pos[1]) < 1.6 && walkClear(b.pos, P.pos)) || (dist < 5 && P.pos[1] - b.pos[1] > 0.35)) { mx = dx / dist; mz = dz / dist; }
      else if (z.flow) {
        const [ci, cj] = navCell(b.pos[0], b.pos[2]), gh = W.gh; let best = z.flow[ci * gh + cj], bi = ci, bj = cj;
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const ni = ci + di, nj = cj + dj; if (!navFree(ni, nj)) continue; if (di && dj && (!navFree(ci + di, cj) || !navFree(ci, cj + dj))) continue; const v = z.flow[ni * gh + nj]; if (v < best) { best = v; bi = ni; bj = nj; } }
        const tx = W.minX + bi + 0.5 - b.pos[0], tz = W.minZ + bj + 0.5 - b.pos[2], tl = Math.hypot(tx, tz);
        if (tl > 0.05) { mx = tx / tl; mz = tz / tl; } else if (dist > 0.1) { mx = dx / dist; mz = dz / dist; }
      }
    }
    // separation
    for (const o of G.zombies) { if (o === b || !o.alive) continue; const ox = b.pos[0] - o.pos[0], oz = b.pos[2] - o.pos[2], od = Math.hypot(ox, oz); if (od < 0.75 && od > 0.001) { mx += ox / od * 0.6; mz += oz / od * 0.6; } }
    // attack
    let spd = b.spd * (b.slowT > 0 ? 0.45 : 1) * (b.stunT > 0 ? 0 : 1);
    if (dist < 1.3 && P.alive && Math.abs(P.pos[1] - b.pos[1]) < 1.3) {
      spd *= 0.2;
      if (b.atkT <= 0) { b.atkT = 1.1; b.swingT = G.time; setTimeout(() => { if (b.alive && P.alive && V.dist2(b.pos, P.pos) < 1.75) zmHitPlayer(P, b, 45); }, 380); }
    }
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    b.vel[0] = approach(b.vel[0], mx * spd, 20 * dt); b.vel[2] = approach(b.vel[2], mz * spd, 20 * dt); b.vel[1] -= GRAV * dt;
    const r = moveEntity(b, b.vel[0] * dt, b.vel[1] * dt, b.vel[2] * dt, 0.28, 1.75, 0.46);
    if (r.ground) b.vel[1] = 0;
    if (r.hitWall && r.ground && ml > 0.1 && P.alive && (P.pos[1] - b.pos[1] > 0.35 || dist > 2)) zmTryVault(b, mx / ml, mz / ml, P.pos[1] - b.pos[1] > 0.35);
    if (ml > 0.1) b.yaw += clamp(angDiff(b.yaw, Math.atan2(-mx, -mz)), -6 * dt, 6 * dt);
    b.walkT += dt * Math.hypot(b.vel[0], b.vel[2]) * 2.0;
    if (z.groanT <= 0 && dist < 22 && Math.random() < 0.15) { z.groanT = rand(0.4, 1.2); const rel = angDiff(P.camYaw, Math.atan2(-(b.pos[0] - P.pos[0]), -(b.pos[2] - P.pos[2]))); sfxGroan(dist, clamp(-Math.sin(rel), -1, 1)); }
    b.stuckT += dt;
    if (b.stuckT > 3) { if (V.dist2(b.pos, b.lastPos) < 0.5 && dist > 3) { b.vel = [0, 0, 0]; } b.stuckT = 0; b.lastPos = b.pos.slice(); }
  }
  // cleanup corpses
  for (const b of G.zombies) if (!b.alive && G.time - b.deathT > 2.6) b.gone = true;
  if (G.zombies.some(b => b.gone)) { G.zombies = G.zombies.filter(b => !b.gone); G.ents = G.ents.filter(e => !e.gone); }
  // power-ups
  for (const pw of z.pows) {
    pw.t += dt;
    if (P.alive && V.dist(pw.pos, [P.pos[0], P.pos[1] + 0.9, P.pos[2]]) < 1.6) {
      pw.dead = true; popup(ZPOW[pw.type].name, '#ffd24a'); sfxUAV();
      if (pw.type === 'ammo') { for (const w of P.wpn) { w.res = zmResMax(w); } P.lethals = Math.max(P.lethals, 4); }
      if (pw.type === 'insta') z.insta = 30;
      if (pw.type === 'double') z.dbl = 30;
      if (pw.type === 'nuke') { for (const b of G.zombies) if (b.alive && !b.isBoss) { b.alive = false; b.deathT = G.time; z.kills++; } zmAddPoints(400); P.shake = 1; sfxBoom(5, 0, true); }
    }
    if (pw.t > 26) pw.dead = true;
  }
  z.pows = z.pows.filter(p => !p.dead);
  // mystery box roll
  if (z.roll) { z.roll.t += dt; if (z.roll.t > 3 && !z.roll.done) { z.roll.done = true; sfxBuy(); if (ZWONDER.includes(z.roll.wid)) { popup(`試作兵器 ${WPN[z.roll.wid].name}！`, '#7ae0ff'); sfxUAV(); } } if (z.roll.t > 3 + 9) z.roll = null; }
  zqUpdate(dt);
  zmPromptUpdate();
}
// ---------- buyables ----------
function zmNear() {
  const P = G.player, z = G.zm; if (!P.alive) return null;
  const qn = zqNear(P); if (qn && qn.kind === 'window') return qn;
  for (const d of W.doors) if (!d.open && V.dist2(d.pos, P.pos) < 2.8) return { kind: 'door', d, cost: d.cost, text: `[F] ドアを開ける（${d.cost}）` };
  for (const b of W.buys) {
    const dist = V.dist2(b.pos, P.pos);
    if (b.type === 'wall' && dist < 1.7) {
      const has = P.wpn.find(w => w.id === b.wid);
      const cost = has ? (has.up ? 4500 : Math.round(b.cost / 2)) : b.cost;
      return { kind: 'wall', b, cost, has, text: has ? `[F] ${zmWName(has)} の弾薬（${cost}）` : `[F] ${WPN[b.wid].name} を購入（${cost}）` };
    }
    if (b.type === 'perk' && dist < 1.9 && z.parts && !z.power) return { kind: 'info', text: `${ZPERKS[b.perk].name}：電源が入っていない` };
    if (b.type === 'ammo' && dist < 1.9) {
      const w = curW(P), max = zmResMax(w), c = zmAmmoCost(w);
      if (w.d.melee || !max) return { kind: 'info', text: '弾薬ボックス' };
      return w.res >= max && w.mag >= w.magMax ? { kind: 'info', text: `弾薬ボックス — ${zmWName(w)} は満タン` } : { kind: 'ammo', b, cost: c, text: `[F] 弾薬ボックス — ${zmWName(w)} の弾を補充（${c}）` };
    }
    if (b.type === 'pap' && dist < 2.2 && z.parts && !(z.power && z.fuseIn >= 3)) return { kind: 'info', text: `改造台は停止中（電源 ${z.power ? '○' : '×'}／ヒューズ ${z.fuseIn}/3）` };
    if (b.type === 'perk' && dist < 1.9) { const pk = ZPERKS[b.perk]; return { kind: 'perk', b, cost: pk.cost, text: z.perks.has(b.perk) ? `${pk.name}（所持済み）` : `[F] ${pk.name}を飲む（${pk.cost}）— ${pk.desc}` }; }
    if (b.type === 'pap' && dist < 2.2) {
      const w = curW(P), lv = papLv(w);
      if (w.d.melee) return { kind: 'info', text: '改造台' };
      if (lv < 3) return { kind: 'pap', b, cost: PAP_COST[lv], text: `[F] ${zmWName(w)} を改造 Lv${lv + 1}（${PAP_COST[lv]}）— 威力・弾倉アップ` };
      return { kind: 'pap', b, cost: AFFIX_COST, text: `[F] ${zmWName(w)} に属性をランダム付与（${AFFIX_COST}）${w.elem ? '— 今の属性以外から抽選' : ''}` };
    }
  }
  const bl = W.boxLocs[z.box];
  if (bl && V.dist2(bl.pos, P.pos) < 2.0) {
    if (z.roll && z.roll.done) return { kind: 'take', text: `[F] ${WPN[z.roll.wid].name} を受け取る${ZWONDER.includes(z.roll.wid) ? '（試作兵器）' : ZBOX_ONLY.includes(z.roll.wid) ? '（ボックス限定）' : ''}` };
    if (z.roll) return { kind: 'busy', text: '…' };
    return { kind: 'box', cost: 950, text: '[F] ランダムボックス（950）' };
  }
  return qn;
}
function zmPromptUpdate() { const n = zmNear(); G.zm.prompt = n ? n.text : ''; }
function zmGive(P, wid) {
  const inst = makeInst(wid, []);
  if (P.wpn.length < 2) { P.wpn.push(inst); P.cur = P.wpn.length - 1; }
  else P.wpn[P.cur] = inst;
  P.swapT = P.swapTot = 0.5; P.ads = 0;
}
function zmUse(P) {
  const z = G.zm, n = zmNear(); if (!n || n.kind === 'info' || n.kind === 'window') return;
  if (!['door', 'wall', 'perk', 'pap', 'box', 'take', 'busy', 'ammo'].includes(n.kind)) { zqUse(P, n); return; }
  const pay = c => { if (z.points < c) { sfxDeny(); popup('ポイントが足りない', '#ff6a5a'); return false; } z.points -= c; sfxBuy(); return true; };
  if (n.kind === 'ammo') { const w = curW(P); if (pay(n.cost)) { w.res = zmResMax(w); w.mag = w.magMax; popup(`${zmWName(w)} の弾を補充`, '#9fe0ff'); } return; }
  if (n.kind === 'door') { if (pay(n.cost)) { openDoor(n.d); popup('ドアが開いた', '#fff'); G.zm.flowT = 0; } }
  else if (n.kind === 'wall') { if (n.has) { if (n.has.res < zmResMax(n.has) && pay(n.cost)) n.has.res = zmResMax(n.has); } else if (pay(n.cost)) zmGive(P, n.b.wid); }
  else if (n.kind === 'perk') {
    if (z.perks.has(n.b.perk)) return;
    if (pay(n.cost)) { z.perks.add(n.b.perk); popup(ZPERKS[n.b.perk].name, '#fff'); if (n.b.perk === 'jug') { P.maxHp = 250; P.hp = 250; } if (n.b.perk === 'rev') z.revives = 3; }
  }
  else if (n.kind === 'pap') {
    const w = curW(P);
    if (!pay(n.cost)) return;
    if (papLv(w) < 3) { papUpgrade(w); popup(`${zmWName(w)} 完成`, '#d07aff'); }
    else { papAffix(w); const E = ELEMS[w.elem]; popup(`属性「${E.name}」— ${E.desc}`, E.css); }
    sfxUAV();
  }
  else if (n.kind === 'box') {
    if (!pay(950)) return;
    const has = id => P.wpn.some(w => w.id === id);
    const pool = PRIMARIES.concat(SECONDARIES, ZBOX_ONLY, ZBOX_ONLY).filter(id => !has(id)), wonders = ZWONDER.filter(id => !has(id));
    const wid = wonders.length && Math.random() < 0.12 ? pick(wonders) : pick(pool);
    z.roll = { t: 0, wid, done: false }; z.boxUses++;
    if (z.boxUses > 3 && Math.random() < 0.15 && W.boxLocs.length > 1) {
      z.roll = null; z.points += 950; const prev = z.box; do { z.box = (Math.random() * W.boxLocs.length) | 0; } while (z.box === prev);
      popup(`ボックスが${ZONE_NAME[W.boxLocs[z.box].zone] || ''}へ移動した`, '#ff6a5a'); sfxDeny(); z.boxUses = 0;
    }
  }
  else if (n.kind === 'take') { zmGive(P, z.roll.wid); z.roll = null; }
}
