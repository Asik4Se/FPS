// ============================================================
//  THROWABLES / EXPLOSIONS / SMOKE / SCORESTREAKS
// ============================================================
const isEnemy = (a, b) => a !== b && !!a && !!b && (!a.team || !b.team || a.team !== b.team);
const XDEF = {
  frag: { name: 'フラグ', cls: 'explosive' }, semtex: { name: 'セムテックス', cls: 'explosive' }, c4: { name: 'C4', cls: 'explosive' }, claymore: { name: 'クレイモア', cls: 'explosive' },
  gl: { name: 'グレネードランチャー', cls: 'streak' }, bomb: { name: '空爆', cls: 'streak' }, drone: { name: 'ハンタードローン', cls: 'streak' }, plasma: { name: 'プラズマピストル', cls: 'explosive' },
  sentry: { name: 'セントリーガン', cls: 'streak', dmg: 24, mult: mm({ head: 1.3 }) },
};
function throwItem(p, type, cookT) {
  const e = eyePos(p), yaw = p.isPlayer ? p.camYaw : p.yaw, pitch = p.isPlayer ? p.camPitch : p.pitch;
  const f = fwdVec(yaw, pitch);
  if (type === 'claymore') {
    const pos = [p.pos[0] + f[0] * 0.9, p.pos[1], p.pos[2] + f[2] * 0.9];
    G.projs.push({ type, pos, vel: [0, 0, 0], owner: p, team: p.team, t: 0, stuck: true, yaw, armT: 0.8 });
    return;
  }
  const spd = type === 'axe' ? 24 : 17;
  G.projs.push({ type, pos: V.add(e, V.mul(f, 0.5)), vel: V.add(V.mul(f, spd), [0, 3.2, 0]), owner: p, team: p.team, t: cookT || 0, stuck: false, spin: 0, yaw });
}
const FUSE = { frag: 3.0, semtex: 2.5, flash: 1.5, stun: 1.5, smoke: 1.2, sensor: 0.6 };
function updateProjectiles(dt) {
  for (const pr of G.projs) {
    pr.t += dt;
    if (pr.dead) continue;
    if (pr.stuckTo) { if (!pr.stuckTo.alive) pr.stuckTo = null; else pr.pos = V.add(pr.stuckTo.pos, pr.offset); }
    // fuses / triggers
    if (FUSE[pr.type] && pr.t >= FUSE[pr.type]) { detonate(pr); continue; }
    if (pr.type === 'claymore' && pr.t > pr.armT) {
      for (const e of G.ents) {
        if (!e.alive || !isEnemy(pr.owner, e) || e.isZombie && false) continue;
        const dv = V.sub(e.pos, pr.pos), d = Math.hypot(dv[0], dv[2]);
        if (d < 3.6 && Math.abs(e.pos[1] - pr.pos[1]) < 1.5) { const ang = Math.abs(angDiff(pr.yaw, Math.atan2(-dv[0], -dv[2]))); if (ang < 1.0) { sfxBeep(2400, 0.2); pr.trigT = pr.trigT || G.time; } }
      }
      if (pr.trigT && G.time - pr.trigT > 0.25) { detonate(pr); continue; }
    }
    if (pr.type === 'sensor' && pr.stuck) { }
    if (pr.stuck || pr.stuckTo) { if (pr.type === 'axe' && pr.t > 6) pr.dead = true; continue; }
    // flight
    const g = pr.type === 'gl' ? 6 : pr.type === 'plasma' ? 0 : pr.type === 'bomb' ? 0 : 15;
    const prev = pr.pos.slice();
    pr.vel[1] -= g * dt; pr.pos = V.add(pr.pos, V.mul(pr.vel, dt)); pr.spin = (pr.spin || 0) + dt * 14; pr.yaw = Math.atan2(-pr.vel[0], -pr.vel[2]);
    const dv = V.sub(pr.pos, prev), L = V.len(dv);
    if (L < 1e-5) continue;
    const dir = V.mul(dv, 1 / L);
    // entity contact
    if (pr.type !== 'bomb') for (const e of G.ents) {
      if (e === pr.owner || !e.alive) continue;
      if (pr.type !== 'axe' && pr.type !== 'semtex' && pr.type !== 'gl' && pr.type !== 'plasma') break;
      if (!isEnemy(pr.owner, e)) continue;
      const c = e.isPlayer ? [e.pos[0], e.pos[1] + e.h * 0.6, e.pos[2]] : [e.pos[0], e.pos[1] + botCenterY(e), e.pos[2]];
      const tt = clamp(V.dot(V.sub(c, prev), dv) / (L * L), 0, 1), q = V.add(prev, V.mul(dv, tt));
      if (Math.abs(q[0] - c[0]) < 0.45 && Math.abs(q[2] - c[2]) < 0.45 && Math.abs(q[1] - c[1]) < 0.85) {
        if (pr.type === 'axe') { damageEnt(e, 150, pr.owner, null, 'axe', dir, V.dist(pr.owner.pos, e.pos)); bloodPuff(q, dir); pr.dead = true; }
        else if (pr.type === 'semtex') { pr.stuckTo = e; pr.offset = V.sub(q, e.pos); pr.pos = q; sfxBeep(1500, 0.2); if (pr.owner.isPlayer) popup('張り付けた!', '#ffcf5a'); }
        else { pr.pos = q; detonate(pr); }
        break;
      }
    }
    if (pr.dead || pr.stuckTo) continue;
    const h = rayWorld(prev, dir, L);
    if (h) {
      const hp = V.add(prev, V.mul(dir, Math.max(0, h.t - 0.03)));
      if (pr.type === 'gl') { if (V.dist(hp, pr.start || hp) > 3) { pr.pos = hp; detonate(pr); } else { pr.dead = true; impactFX(hp, h.n, h.box); } continue; }
      if (pr.type === 'plasma' || pr.type === 'bomb') { pr.pos = hp; detonate(pr); continue; }
      if (pr.type === 'axe' || pr.type === 'semtex' || pr.type === 'c4' || pr.type === 'sensor') { pr.pos = hp; pr.stuck = true; pr.n = h.n; sfxClick(1800, 0.2, 0.05); continue; }
      // bounce
      const n = h.n, vn = V.dot(pr.vel, n);
      pr.vel = V.sub(pr.vel, V.mul(n, vn * 1.4)); pr.vel = V.mul(pr.vel, 0.62);
      pr.pos = V.add(hp, V.mul(n, 0.05));
      if (V.len(pr.vel) < 1.2 && n[1] > 0.5) { pr.vel = [0, 0, 0]; pr.stuck = true; }
      else if (Math.abs(vn) > 2) sfxClick(900, 0.12, 0.04);
    }
    if (pr.pos[1] < -5 || pr.t > 15) pr.dead = true;
  }
  G.projs = G.projs.filter(pr => !pr.dead);
  // smoke clouds
  for (const s of G.smokes) { s.t += dt; if (Math.random() < dt * 25 && s.t < s.life - 2) G.parts.push({ pos: V.add(s.pos, [rand(-1, 1) * s.r * 0.6, rand(0.3, 2.5), rand(-1, 1) * s.r * 0.6]), vel: [rand(-0.3, 0.3), rand(0.05, 0.3), rand(-0.3, 0.3)], life: rand(2.5, 4), t: 0, size: rand(1.6, 2.8), col: [0.72, 0.73, 0.74], g: 0, smoke: 1 }); }
  G.smokes = G.smokes.filter(s => s.t < s.life);
  for (const s of G.sensors) s.t += dt;
  G.sensors = G.sensors.filter(s => s.t < 20);
}
function smokeBlocks(a, b) {
  for (const s of G.smokes) {
    if (s.t < 0.8 || s.t > s.life - 1) continue;
    const r = s.r * Math.min(1, s.t / 2), ab = V.sub(b, a), L2 = V.dot(ab, ab) || 1;
    const t = clamp(V.dot(V.sub(s.pos, a), ab) / L2, 0, 1), q = V.add(a, V.mul(ab, t));
    if (V.dist(q, [s.pos[0], s.pos[1] + 1.2, s.pos[2]]) < r) return true;
  }
  return false;
}
function detonate(pr) {
  if (pr.dead) return; pr.dead = true;
  const o = pr.owner, pos = pr.pos;
  switch (pr.type) {
    case 'frag': explode(pos, 6.5, 160, 45, o, XDEF.frag); break;
    case 'semtex': explode(pos, 5.5, 160, 45, o, XDEF.semtex); break;
    case 'c4': explode(pos, 6.5, 200, 60, o, XDEF.c4, true); break;
    case 'claymore': explode(V.add(pos, [0, 0.4, 0]), 4.5, 200, 60, o, XDEF.claymore); break;
    case 'gl': if (pr.def) explode(pos, 5.5, pr.dmg, pr.dmg * 0.35, o, pr.def); else explode(pos, 5, 200, 50, o, XDEF.gl); break;
    case 'bomb': explode(pos, 7, 300, 80, o, XDEF.bomb, true); break;
    case 'plasma': explode(pos, 2.4, pr.dmg || 1000, (pr.dmg || 1000) * 0.5, o, XDEF.plasma, false, true); break;
    case 'flash': flashBang(pos, o); break;
    case 'stun': stunBang(pos, o); break;
    case 'smoke': G.smokes.push({ pos: pos.slice(), t: 0, life: 17, r: 6.5 }); sfxClick(500, 0.3, 0.4); break;
    case 'sensor': break;
  }
}
function explode(pos, rad, maxD, minD, owner, def, big, plasma) {
  // fx
  for (let i = 0; i < (plasma ? 10 : 26); i++) G.parts.push({ pos: V.add(pos, [rand(-0.4, 0.4), rand(0, 0.6), rand(-0.4, 0.4)]), vel: [rand(-7, 7), rand(2, 10), rand(-7, 7)], life: rand(0.25, 0.6), t: 0, size: rand(0.15, 0.4), col: plasma ? [0.4, 1, 0.5] : [1, rand(0.45, 0.8), 0.2], emis: 1, g: 6 });
  if (!plasma) for (let i = 0; i < 12; i++) G.parts.push({ pos: V.add(pos, [rand(-1, 1), rand(0.3, 1.5), rand(-1, 1)]), vel: [rand(-1, 1), rand(1, 2.5), rand(-1, 1)], life: rand(1.2, 2.2), t: 0, size: rand(0.8, 1.6), col: [0.3, 0.29, 0.28], g: -0.3, smoke: 1 });
  const P0 = G.player;
  if (P0) {
    const d = V.dist(pos, P0.pos), rel = angDiff(P0.camYaw, Math.atan2(-(pos[0] - P0.pos[0]), -(pos[2] - P0.pos[2])));
    if (plasma) sfxPlasma(d); else sfxBoom(d, clamp(-Math.sin(rel), -1, 1) * 0.7, big);
    if (!plasma) P0.shake = Math.max(P0.shake || 0, clamp(1.4 - d / 18, 0, 1.4));
  }
  for (const e of G.ents) {
    if (!e.alive) continue;
    if (e !== owner && !isEnemy(owner, e)) continue;
    const c = e.isPlayer ? [e.pos[0], e.pos[1] + e.h * 0.5, e.pos[2]] : [e.pos[0], e.pos[1] + 1.0, e.pos[2]];
    const d = V.dist(pos, c); if (d > rad) continue;
    if (!losClear(V.add(pos, [0, 0.3, 0]), c) && !losClear(V.add(pos, [0, 0.3, 0]), V.add(c, [0, 0.7, 0]))) continue;
    let dmg = lerp(maxD, minD, d / rad);
    if (e === owner) { if (plasma || (def && def.cls === 'streak')) continue; if (G.mode === 'zombies') dmg = Math.min(dmg * 0.25, 60); }
    if (e.isPlayer && hasPerk('flak')) dmg *= 0.35;
    damageEnt(e, dmg, owner, def, 'explosive', V.norm(V.sub(c, pos)), d);
  }
  // drones caught in blast
  for (const dr of G.drones) if (V.dist(dr.pos, pos) < rad * 0.6 && isEnemy(owner, dr.owner)) dr.hp = 0;
}
function flashBang(pos, o) {
  for (let i = 0; i < 16; i++) G.parts.push({ pos: pos.slice(), vel: [rand(-6, 6), rand(0, 6), rand(-6, 6)], life: 0.2, t: 0, size: 0.25, col: [1, 1, 1], emis: 1, g: 0 });
  const P0 = G.player; if (P0) sfxBoom(V.dist(pos, P0.pos) * 1.5, 0, false);
  for (const e of G.ents) {
    if (!e.alive || (e !== o && !isEnemy(o, e))) continue;
    const eye = e.isPlayer ? eyePos(e) : botEye(e), d = V.dist(eye, pos);
    if (d > 20 || !losClear(V.add(pos, [0, 0.2, 0]), eye)) continue;
    const f = fwdVec(e.isPlayer ? e.camYaw : e.yaw, e.isPlayer ? e.camPitch : 0), face = 0.4 + 0.6 * Math.max(0, V.dot(f, V.norm(V.sub(pos, eye))));
    const k = (1 - d / 20) * face;
    if (e.isPlayer) { e.flashT = Math.max(e.flashT || 0, 0.8 + 3.5 * k); e.flashMax = e.flashT; sfxRing(); }
    else { e.blindT = Math.max(e.blindT || 0, 1.5 + 3.5 * k); if (o && o.isPlayer) popup('フラッシュ命中', '#fff'); }
  }
}
function stunBang(pos, o) {
  for (let i = 0; i < 12; i++) G.parts.push({ pos: pos.slice(), vel: [rand(-4, 4), rand(0, 4), rand(-4, 4)], life: 0.3, t: 0, size: 0.2, col: [0.8, 0.85, 1], emis: 1, g: 0 });
  const P0 = G.player; if (P0) sfxBoom(V.dist(pos, P0.pos) * 1.3, 0, false);
  for (const e of G.ents) {
    if (!e.alive || (e !== o && !isEnemy(o, e))) continue;
    const c = e.isPlayer ? eyePos(e) : botEye(e), d = V.dist(c, pos);
    if (d > 14 || !losClear(V.add(pos, [0, 0.2, 0]), c)) continue;
    const t = 1.5 + 2.5 * (1 - d / 14);
    e.stunT = Math.max(e.stunT || 0, e.isPlayer && hasPerk('tough') ? t * 0.6 : t);
    if (!e.isPlayer && o && o.isPlayer) popup('スタン命中', '#fff');
  }
}
// ---------------- SCORESTREAKS ----------------
function streakCost(id) { return Math.round(STREAK_BY_ID[id].cost * (hasPerk('hl') ? 0.8 : 1)); }
function awardStreakPoints(p, pts) {
  if (G.mode === 'zombies' || G.mode === 'gun' || G.mode === 'range') return;
  p.streakPts += pts;
  STREAK_SEL.list.forEach((id, i) => {
    if (!p.awarded[i] && p.streakPts >= streakCost(id)) { p.awarded[i] = true; p.earned[i] = (p.earned[i] || 0) + 1; popup(`${STREAK_BY_ID[id].name} 使用可能 [${4 + i}]`, '#9fd7ff'); sfxUAV(); }
  });
}
function useStreak(p, i) {
  const id = STREAK_SEL.list[i]; if (!id || !p.earned[i]) return;
  if (id === 'wm' && p.wpn.some(w => w.temp)) return;
  p.earned[i]--;
  activateStreak(p, id);
}
function activateStreak(p, id) {
  const name = STREAK_BY_ID[id].name;
  switch (id) {
    case 'uav': G.uavT = 30; sfxUAV(); popup('UAV オンライン', '#9fd7ff'); break;
    case 'cuav': G.cuavT = 30; G.enemyUavT = 0; sfxUAV(); popup('カウンターUAV オンライン', '#9fd7ff'); break;
    case 'vsat': G.vsatT = 45; sfxUAV(); popup('アドバンスドUAV オンライン', '#9fd7ff'); break;
    case 'ammo': {
      for (const w of p.wpn) { w.res = w.d.res; w.mag = w.magMax; }
      p.lethals = lethalMax(); p.tacticals = tacMax(); popup('補給物資: 弾薬全回復', '#9fd7ff'); sfxBuy();
      if (Math.random() < 0.3) { const others = STREAKS.filter(s => s.id !== 'ammo'); const s = pick(others); popup(`補給物資の中身: ${s.name}`, '#ffcf5a'); activateStreak(p, s.id); }
      break;
    }
    case 'hk': spawnDrone(p, null); popup('ハンタードローン 発射', '#9fd7ff'); break;
    case 'swarm': G.swarm = { owner: p, t: 0, next: 0 }; popup('ドローンスウォーム 接近中', '#9fd7ff'); break;
    case 'strike': {
      const e = eyePos(p), f = fwdVec(p.camYaw, p.camPitch), h = rayWorld(e, f, 150);
      const tgt = h ? V.add(e, V.mul(f, h.t)) : V.add(e, V.mul(f, 60)); const side = [Math.cos(p.camYaw), 0, -Math.sin(p.camYaw)], fw = [-Math.sin(p.camYaw), 0, -Math.cos(p.camYaw)];
      for (let k = 0; k < 5; k++) {
        const at = V.add(tgt, V.add(V.mul(fw, (k - 2) * 4.5), V.mul(side, rand(-2, 2))));
        G.timers.push({ t: 1.8 + k * 0.22, fn: () => G.projs.push({ type: 'bomb', pos: [at[0], 70, at[2]], vel: [0, -80, 0], owner: p, team: p.team, t: 0 }) });
      }
      popup('空爆 要請', '#9fd7ff'); sfxUAV(); break;
    }
    case 'wm': { const w = makeInst('gl', []); w.temp = true; w.res = 0; p.wpn.push(w); p.cur = p.wpn.length - 1; p.swapT = p.swapTot = 0.5; p.ads = 0; popup(name, '#9fd7ff'); break; }
    case 'sentry': {
      const f = [-Math.sin(p.yaw), 0, -Math.cos(p.yaw)];
      let pos = [p.pos[0] + f[0] * 1.6, p.pos[1], p.pos[2] + f[2] * 1.6];
      if (!spaceFree(pos, 0.4, 1.2)) pos = p.pos.slice();
      G.sentries.push({ pos, yaw: p.yaw, t: 0, life: 60, owner: p, team: p.team, fireT: 0, target: null, scanT: 0 });
      popup('セントリーガン 設置', '#9fd7ff'); sfxClick(800, 0.3, 0.2); break;
    }
  }
}
function spawnDrone(owner, target) {
  const start = V.add(owner.pos, [rand(-3, 3), 18, rand(-3, 3)]);
  G.drones.push({ pos: start, vel: [0, 0, 0], owner, team: owner.team, target, t: 0, life: 22, hp: 1 });
}
function nearestEnemy(owner, from, filter) {
  let best = null, bd = 1e9;
  for (const e of G.ents) { if (!e.alive || !isEnemy(owner, e)) continue; if (filter && !filter(e)) continue; const d = V.dist(e.pos, from); if (d < bd) { bd = d; best = e; } }
  return best;
}
function updateStreaks(dt) {
  for (const k of ['uavT', 'cuavT', 'vsatT', 'enemyUavT']) if (G[k] > 0) G[k] -= dt;
  // timers
  for (const tm of G.timers) { tm.t -= dt; if (tm.t <= 0 && !tm.done) { tm.done = true; tm.fn(); } }
  G.timers = G.timers.filter(t => !t.done);
  // swarm
  if (G.swarm) { const s = G.swarm; s.t += dt; s.next -= dt; if (s.next <= 0) { s.next = 3.2; spawnDrone(s.owner, null); } if (s.t > 40) G.swarm = null; }
  // drones
  for (const dr of G.drones) {
    dr.t += dt;
    if (!dr.target || !dr.target.alive) dr.target = nearestEnemy(dr.owner, dr.pos, e => !(e.isPlayer && hasPerk('cb')) && !G.drones.some(o => o !== dr && o.target === e));
    if (!dr.target) dr.target = nearestEnemy(dr.owner, dr.pos, e => !(e.isPlayer && hasPerk('cb')));
    let goal;
    if (dr.target) { const tp = [dr.target.pos[0], dr.target.pos[1] + 1.2, dr.target.pos[2]]; goal = dr.t < 1.5 ? V.add(dr.pos, [0, 2, 0]) : V.dist2(dr.pos, tp) > 12 ? [tp[0], Math.max(tp[1] + 8, 10), tp[2]] : tp; }
    else goal = V.add(dr.pos, [0, 0, 0]);
    const want = V.mul(V.norm(V.sub(goal, dr.pos)), dr.t < 1.5 ? 6 : 17);
    dr.vel = V.add(dr.vel, V.mul(V.sub(want, dr.vel), Math.min(1, dt * 3)));
    const prev = dr.pos; dr.pos = V.add(dr.pos, V.mul(dr.vel, dt));
    if (dr.hp <= 0) { dr.dead = true; explode(dr.pos, 2, 0, 0, dr.owner, XDEF.drone); continue; }
    if (dr.target && V.dist(dr.pos, [dr.target.pos[0], dr.target.pos[1] + 1.1, dr.target.pos[2]]) < 1.6) { dr.dead = true; explode(dr.pos, 3.5, 220, 120, dr.owner, XDEF.drone); continue; }
    const h = rayWorld(prev, V.norm(V.sub(dr.pos, prev)), V.dist(prev, dr.pos) + 0.01);
    if (h && dr.t > 1.5 && h.t < V.dist(prev, dr.pos)) { dr.pos = V.add(prev, V.mul(V.norm(V.sub(dr.pos, prev)), h.t)); dr.dead = true; explode(dr.pos, 3.5, 220, 120, dr.owner, XDEF.drone); continue; }
    if (dr.t > dr.life) { dr.dead = true; explode(dr.pos, 2, 0, 0, dr.owner, XDEF.drone); }
  }
  G.drones = G.drones.filter(d => !d.dead);
  // sentries
  for (const s of G.sentries) {
    s.t += dt; s.fireT -= dt; s.scanT -= dt;
    const eye = [s.pos[0], s.pos[1] + 1.05, s.pos[2]];
    if (s.scanT <= 0) {
      s.scanT = 0.25; s.target = null; let bd = 45;
      for (const e of G.ents) { if (!e.alive || !isEnemy(s.owner, e)) continue; const c = entAimPoint(e, false), d = V.dist(c, eye); if (d < bd && losClear(eye, c) && !smokeBlocks(eye, c)) { bd = d; s.target = e; } }
    }
    if (s.target && s.target.alive) {
      const c = entAimPoint(s.target, false), [ty, tp] = yawPitchOf(V.norm(V.sub(c, eye)));
      s.yaw += clamp(angDiff(s.yaw, ty), -4 * dt, 4 * dt); s.pitch = tp;
      if (Math.abs(angDiff(s.yaw, ty)) < 0.1 && s.fireT <= 0) {
        s.fireT = 0.11; s.firedT = G.time;
        const dir = coneDir(fwdVec(s.yaw, tp), 1.6 * DEG);
        const res = fireBullet(s.owner, eye, dir, XDEF.sentry, 60);
        G.tracers.push({ a: V.add(eye, V.mul(dir, 0.6)), b: res.point, t: 0, life: 0.05, bot: 1 });
        const P0 = G.player; if (P0 && _sndBudget < 6) { _sndBudget++; sfxShot('ar', Math.max(1, V.dist(P0.pos, s.pos)), 0, false, 0.7); }
      }
    } else s.yaw += dt * 0.6;
  }
  G.sentries = G.sentries.filter(s => s.t < s.life);
}
// bullets can shoot down enemy drones
function rayDrones(shooter, o, d, tmax) {
  let best = null, bt = tmax;
  for (const dr of G.drones) {
    if (!isEnemy(shooter, dr.owner)) continue;
    const oc = V.sub(dr.pos, o), t = V.dot(oc, d); if (t < 0 || t > bt) continue;
    const q = V.add(o, V.mul(d, t)); if (V.dist(q, dr.pos) < 0.6) { bt = t; best = dr; }
  }
  return best ? { dr: best, t: bt } : null;
}
