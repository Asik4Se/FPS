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
  vx50: [1000, 4], bls7: [900, 4], as50x: [600, 3.5], dr90: [450, 3.5], svu: [400, 3.5],
  ar94: [150, 3], m8: [170, 3], sw56: [130, 3], ls60: [160, 2.5],
  sm7: [105, 3], msc: [115, 3], pd50: [95, 3],
  r870: [110, 1.5], sg12: [80, 1.5], ex9: [70, 1.5],
  p9: [60, 3], b23: [70, 3],
  rpd: [180, 2.5], ksg: [130, 1.5], python: [500, 2.5],
};
const ZDMG_CLS = { sniper: [500, 3.5], ar: [140, 3], lmg: [150, 2.5], smg: [100, 3], sg: [130, 1.5], pistol: [60, 3] };
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
  if (e.rise < 1) dmg *= 1;
  if (z.insta > 0) dmg = e.hp + 1;
  e.hp -= dmg; e.lastDmgT = G.time;
  if (src && src.isPlayer) { src.hitT = G.time; src.hitKill = e.hp <= 0; sfxHit(e.hp <= 0); }
  if (e.hp > 0) { if (src && src.isPlayer && zone !== 'explosive') zmAddPoints(10); return; }
  e.alive = false; e.deathT = G.time; z.kills++;
  if (src && src.isPlayer) {
    src.kills++;
    if (zone === 'melee') zmAddPoints(130); else if (zone === 'head') { zmAddPoints(100); z.heads++; } else zmAddPoints(60);
    src.score = z.points;
  }
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
function zmSpawnOne() {
  const z = G.zm, P = G.player;
  const win = zqPickWindow(P);
  let sp;
  if (win) { const tg = [-win.n[2], win.n[0]], o = rand(-0.9, 0.9); sp = [win.outside[0] - win.n[0] * 1.2 + tg[0] * o, win.outside[2] - win.n[2] * 1.2 + tg[1] * o]; }
  else { const pts = []; for (const k in W.zoneSpawn) if (W.zones[k]) pts.push(...W.zoneSpawn[k]); sp = pts.length ? pick(pts) : [0, 20]; }
  const b = makeEnt('ゾンビ', false);
  const r = z.round, roll = Math.random();
  const sprintP = clamp((r - 4) * 0.13, 0, 0.85), jogP = clamp((r - 2) * 0.25, 0, 1);
  const kind = roll < sprintP ? 'sprint' : roll < sprintP + jogP * (1 - sprintP) ? 'jog' : 'walk';
  Object.assign(b, { isZombie: true, team: 'Z', pos: [sp[0], 0, sp[1]], win, wst: win ? 'tear' : null, hp: zmHP(r), kind, spd: { walk: 1.25, jog: 2.7, sprint: 4.7 }[kind] * rand(0.9, 1.1),
    rise: 0, atkT: 0, walkT: rand(0, 6), yaw: rand(0, 6.28), stance: 'stand', pose: null, pitch: -0.25, skin: pick(ZSKINS), stuckT: 0, lastPos: [0, 0, 0], bob: rand(0, 6) });
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
  z.insta = Math.max(0, z.insta - dt); z.dbl = Math.max(0, z.dbl - dt);
  // rounds
  const alive = G.zombies.filter(b => b.alive).length;
  if (z.betweenT > 0) {
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
    if (b.rise < 1) { b.rise = Math.min(1, b.rise + dt * 0.9); continue; }
    b.atkT -= dt;
    if (zqWindowZombie(b, dt, P)) continue;
    const dx = P.pos[0] - b.pos[0], dz = P.pos[2] - b.pos[2], dist = Math.hypot(dx, dz);
    let mx = 0, mz = 0;
    if (P.alive) {
      if (dist < 9 && Math.abs(P.pos[1] - b.pos[1]) < 1.6 && walkClear(b.pos, P.pos)) { mx = dx / dist; mz = dz / dist; }
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
    let spd = b.spd;
    if (dist < 1.3 && P.alive && Math.abs(P.pos[1] - b.pos[1]) < 1.3) {
      spd *= 0.2;
      if (b.atkT <= 0) { b.atkT = 1.1; b.swingT = G.time; setTimeout(() => { if (b.alive && P.alive && V.dist2(b.pos, P.pos) < 1.75) zmHitPlayer(P, b, 45); }, 380); }
    }
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    b.vel[0] = approach(b.vel[0], mx * spd, 20 * dt); b.vel[2] = approach(b.vel[2], mz * spd, 20 * dt); b.vel[1] -= GRAV * dt;
    const r = moveEntity(b, b.vel[0] * dt, b.vel[1] * dt, b.vel[2] * dt, 0.28, 1.75, 0.46);
    if (r.ground) b.vel[1] = 0;
    if (ml > 0.1) b.yaw += clamp(angDiff(b.yaw, Math.atan2(-mx, -mz)), -6 * dt, 6 * dt);
    b.walkT += dt * Math.hypot(b.vel[0], b.vel[2]) * 2.0;
    if (z.groanT <= 0 && dist < 22 && Math.random() < 0.15) { z.groanT = rand(0.4, 1.2); const rel = angDiff(P.camYaw, Math.atan2(-(b.pos[0] - P.pos[0]), -(b.pos[2] - P.pos[2]))); sfxGroan(dist, clamp(-Math.sin(rel), -1, 1)); }
    b.stuckT += dt;
    if (b.stuckT > 3) { if (V.dist2(b.pos, b.lastPos) < 0.5 && dist > 3) { b.pos[1] = 0; b.vel = [0, 0, 0]; } b.stuckT = 0; b.lastPos = b.pos.slice(); }
  }
  // cleanup corpses
  for (const b of G.zombies) if (!b.alive && G.time - b.deathT > 2.6) b.gone = true;
  if (G.zombies.some(b => b.gone)) { G.zombies = G.zombies.filter(b => !b.gone); G.ents = G.ents.filter(e => !e.gone); }
  // power-ups
  for (const pw of z.pows) {
    pw.t += dt;
    if (P.alive && V.dist(pw.pos, [P.pos[0], P.pos[1] + 0.9, P.pos[2]]) < 1.6) {
      pw.dead = true; popup(ZPOW[pw.type].name, '#ffd24a'); sfxUAV();
      if (pw.type === 'ammo') { for (const w of P.wpn) { w.res = w.d.res * (w.up ? 2 : 1); } P.lethals = Math.max(P.lethals, 4); }
      if (pw.type === 'insta') z.insta = 30;
      if (pw.type === 'double') z.dbl = 30;
      if (pw.type === 'nuke') { for (const b of G.zombies) if (b.alive) { b.alive = false; b.deathT = G.time; z.kills++; } zmAddPoints(400); P.shake = 1; sfxBoom(5, 0, true); }
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
      return { kind: 'wall', b, cost, has, text: has ? `[F] ${has.d.name}${has.up ? '改' : ''} の弾薬（${cost}）` : `[F] ${WPN[b.wid].name} を購入（${cost}）` };
    }
    if (b.type === 'perk' && dist < 1.9 && z.parts && !z.power) return { kind: 'info', text: `${ZPERKS[b.perk].name}：電源が入っていない` };
    if (b.type === 'pap' && dist < 2.2 && z.parts && !(z.power && z.fuseIn >= 3)) return { kind: 'info', text: `改造台は停止中（電源 ${z.power ? '○' : '×'}／ヒューズ ${z.fuseIn}/3）` };
    if (b.type === 'perk' && dist < 1.9) { const pk = ZPERKS[b.perk]; return { kind: 'perk', b, cost: pk.cost, text: z.perks.has(b.perk) ? `${pk.name}（所持済み）` : `[F] ${pk.name}を飲む（${pk.cost}）— ${pk.desc}` }; }
    if (b.type === 'pap' && dist < 2.2) { const w = curW(P); return { kind: 'pap', b, cost: 5000, text: w.up ? '改造済み' : `[F] ${w.d.name} を改造（5000）` }; }
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
  if (!['door', 'wall', 'perk', 'pap', 'box', 'take', 'busy'].includes(n.kind)) { zqUse(P, n); return; }
  const pay = c => { if (z.points < c) { sfxDeny(); popup('ポイントが足りない', '#ff6a5a'); return false; } z.points -= c; sfxBuy(); return true; };
  if (n.kind === 'door') { if (pay(n.cost)) { openDoor(n.d); popup('ドアが開いた', '#fff'); G.zm.flowT = 0; } }
  else if (n.kind === 'wall') { if (n.has) { if (n.has.res < n.has.d.res * (n.has.up ? 2 : 1) && pay(n.cost)) n.has.res = n.has.d.res * (n.has.up ? 2 : 1); } else if (pay(n.cost)) zmGive(P, n.b.wid); }
  else if (n.kind === 'perk') {
    if (z.perks.has(n.b.perk)) return;
    if (pay(n.cost)) { z.perks.add(n.b.perk); popup(ZPERKS[n.b.perk].name, '#fff'); if (n.b.perk === 'jug') { P.maxHp = 250; P.hp = 250; } if (n.b.perk === 'rev') z.revives = 3; }
  }
  else if (n.kind === 'pap') {
    const w = curW(P); if (w.up) return;
    if (pay(5000)) { w.up = true; w.dmgMul = w.d.cls === 'sniper' ? 3 : 2; w.magMax = Math.round(w.magMax * 1.5); w.mag = w.magMax; w.res = w.d.res * 2; w.camo = CAMO_BY_ID[w.d.cls === 'pistol' ? 'cyber' : 'dragon']; popup(`${w.d.name}改 完成`, '#d07aff'); }
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
