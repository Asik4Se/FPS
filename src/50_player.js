// ============================================================
//  GAME STATE + PLAYER (movement / weapon handling / shooting)
// ============================================================
const SCOPE_AT = 0.92;          // ADS progress where the scope overlay pops in (= full accuracy)
const STANCE = { stand: { h: 1.8, eye: 1.62, spd: 1 }, crouch: { h: 1.25, eye: 1.05, spd: 0.65 }, prone: { h: 0.62, eye: 0.36, spd: 0.18 } };
const BASE_SPEED = 4.8, GRAV = 20.3, PGRAV = 13.0, JUMP_V = 5.4, HW = 0.3;
const G = { mode: 'ffa', map: 'yard', ents: [], bots: [], player: null, time: 0, timeLeft: 600, scoreLimit: 30, over: false, running: false, paused: true,
  tracers: [], parts: [], projs: [], killfeed: [], popups: [], uavT: 0, diff: 1, botCount: 7, stats: null, lastHitInfo: null, pendingClass: -1,
  smokes: [], sensors: [], drones: [], sentries: [], timers: [], flags: [], tags: [], teamScore: null, cuavT: 0, vsatT: 0, enemyUavT: 0, swarm: null, zombies: [], zm: null };

function makeEnt(name, isPlayer) {
  return { name, isPlayer, pos: [0, 0, 0], vel: [0, 0, 0], yaw: 0, pitch: 0, hp: 100, alive: true, kills: 0, deaths: 0, score: 0,
    streak: 0, stance: 'stand', h: 1.8, eyeH: 1.62, onGround: true, lastDmgT: -99, respawnT: 0, firedT: -99, firedSup: false };
}
function newPlayer() {
  const p = makeEnt('あなた', true);
  Object.assign(p, { wpn: [], cur: 0, ads: 0, adsPrev: false, sprint: false, stamina: 4, sprintOutT: 0, swapT: 0, swapTot: 0, meleeT: 0, throwT: 0,
    breath: 4, holding: false, exhaustT: 0, swayT: rand(0, 10), swayRamp: 0, swayMul: 1, recoilP: 0, recoilY: 0, flinchP: 0, flinchY: 0,
    bobT: 0, bobAmt: 0, stepAcc: 0, mantle: null, diveT: 0, zoomLv: 1, hitT: -9, hitKill: false, adsStart: 0, snap: null, lethals: 1,
    dmgDirs: [], deathCam: 0, killer: null, streakPts: 0, uavReady: false, fireBuf: 0, jumpBuf: 0, coyote: 0, muzzleT: -9, camYaw: 0, camPitch: 0, camRoll: 0,
    lastShotT: -9, fov: 75, boltKick: 0, pumpT: 0, landKick: 0, airT: 0, earned: [0, 0, 0], awarded: [false, false, false], tacticals: 0, flashT: 0, stunT: 0, shake: 0, cookT: 0, maxHp: 100, gg: 0, slideT: 0, slideDur: 0.85, slideSpd: 0, slideV: [0, 0, -1], slideCD: 0, cPend: false, zPend: false, cHoldUsed: false,
    proneTrans: 0, stanceKick: 0, stanceDir: 0, eyeV: 0, crawl: 0, crawlT: 0, diving: false, diveLand: 0 });
  equipClass(p);
  return p;
}
function equipClass(p) {
  if (G.pendingClass >= 0) { CLASSES.cur = G.pendingClass; CLS = CLASSES.list[G.pendingClass]; G.pendingClass = -1; saveClasses(); }
  ACTIVE = G.mode === 'gun' ? Object.assign({}, DEFAULT_CLASS, { perks: [['lw'], [], ['dex']], wild: [], lethal: 'none', tactical: 'none', att: [], satt: [] })
    : G.mode === 'zombies' ? Object.assign({}, DEFAULT_CLASS, { perks: [[], [], []], wild: [], lethal: 'frag', tactical: 'none', att: [], satt: [] }) : CLS;
  const c = ACTIVE;
  p.wpn = [makeInst(c.primary, c.att, c.pcamo)];
  if (c.secondary) p.wpn.push(makeInst(c.secondary, c.satt, c.scamo));
  p.cur = 0; p.zoomLv = 1;
  p.lethals = lethalMax(); p.tacticals = tacMax();
  if (G.mode === 'gun') ggEquip(p);
  if (G.mode === 'zombies') zmEquip(p);
}
function lethalMax() { const c = ACTIVE; return c.lethal === 'none' ? 0 : (c.wild.includes('dl') ? 2 : 1); }
function tacMax() { const c = ACTIVE; return c.tactical === 'none' ? 0 : (c.wild.includes('tm') ? 2 : 1); }
const curW = p => p.wpn[p.cur];
const eyePos = e => [e.pos[0], e.pos[1] + e.eyeH, e.pos[2]];
function chooseSpawn(forEnt) {
  if (G.mode === 'zombies') return [0, 0, 0];
  const others = G.ents.filter(e => e !== forEnt && e.alive && isEnemy(forEnt, e));
  const mates = forEnt.team ? G.ents.filter(e => e !== forEnt && e.alive && e.team === forEnt.team) : [];
  const pool = forEnt.team && G.time < 1 ? teamSideSpawns(forEnt.team) : W.spawns;
  const scored = pool.map(s => {
    let m = 1e9; for (const o of others) m = Math.min(m, V.dist2(s, o.pos));
    let vis = 0; for (const o of others) if (V.dist2(s, o.pos) < 60 && losClear([s[0], 1.6, s[2]], eyePos(o))) vis++;
    let mt = 0; for (const o of mates) mt += Math.max(0, 30 - V.dist2(s, o.pos)); if (mates.length) mt /= mates.length;
    return { s, sc: Math.min(m, 60) - vis * 25 + mt * 0.6 + rand(0, 10) };
  });
  scored.sort((a, b) => b.sc - a.sc);
  return pick(scored.slice(0, 4)).s;
}
function spawnEnt(e) {
  const s = chooseSpawn(e);
  e.pos = [s[0] + rand(-0.3, 0.3), 0, s[2] + rand(-0.3, 0.3)]; e.vel = [0, 0, 0];
  e.hp = 100; e.alive = true; e.stance = 'stand'; e.h = 1.8; e.eyeH = 1.62; e.lastDmgT = -99; e.blindT = 0; e.stunT = 0; e.bstreak = 0;
  const cx = (W.minX + W.maxX) / 2, cz = (W.minZ + W.maxZ) / 2;
  e.yaw = Math.atan2(-(cx - e.pos[0]), -(cz - e.pos[2])) + rand(-0.4, 0.4); e.pitch = 0;
  if (e.isPlayer) {
    e.ads = 0; e.sprint = false; e.recoilP = e.recoilY = e.flinchP = e.flinchY = 0; e.mantle = null; e.diveT = 0;
    e.breath = 4; e.exhaustT = 0; e.snap = null; e.dmgDirs = []; e.meleeT = 0; e.killer = null; e.fireBuf = 0; e.jumpBuf = 0;
    equipClass(e); e.stamina = hasPerk('ec') ? 8 : 4; e.swapT = 0.2; e.swapTot = 0.2; e.streak = 0;
    e.streakPts = 0; e.awarded = [false, false, false]; e.flashT = 0; e.stunT = 0; e.cookT = 0; e.hp = e.maxHp || 100;
    e.slideT = 0; e.cPend = e.zPend = false; e.proneTrans = 0; e.stanceKick = 0; e.eyeV = 0; e.crawl = 0; e.diving = false; e.diveLand = 0;
  }
  if (G.online && (e.isPlayer || e.netBot)) netOnSpawn(e);
}
function setStance(p, s) {
  if (s === p.stance) return true;
  const h = STANCE[s].h;
  if (h > p.h && !spaceFree(p.pos, HW, h)) return false;
  p.stance = s; p.h = h; return true;
}
function curFovTarget(p) {
  const w = curW(p), d = w.d, o = optic(w);
  if (!p.alive) return SET.fov;
  if (o === 'scope') {
    const zl = w.att.has('vz') ? [20, 12.5, 6.5][p.zoomLv] : d.zoom;
    return p.ads >= SCOPE_AT ? zl : lerp(SET.fov, SET.fov * 0.86, p.ads / SCOPE_AT);
  }
  if (o === 'acog') return lerp(SET.fov, d.cls === 'sniper' ? 24 : 30, smooth(p.ads));
  const adsF = Math.min(SET.fov * d.zoom / 65, SET.fov * 0.82) * (o === 'dot' ? 0.95 : 1);
  return lerp(SET.fov + (p.sprint ? 4 : 0), adsF, p.ads);
}
// full-screen optic overlay is up (sniper scope or ACOG)
const isScoped = p => { if (!p.alive) return false; return optic(curW(p)) === 'scope' && p.ads >= SCOPE_AT; };
const isSniperScope = p => p.alive && optic(curW(p)) === 'scope' && p.ads >= SCOPE_AT;

function updatePlayer(p, a, dt) {
  if (!p.alive) {
    p.respawnT -= dt; p.deathCam = Math.min(1, p.deathCam + dt * 2);
    if (p.respawnT <= 0 && !G.over) spawnEnt(p);
    return;
  }
  const w = curW(p), d = w.d;
  // ---------- look (raw, no smoothing) ----------
  const tanBase = Math.tan(SET.fov * DEG / 2), ratio = Math.tan(p.fov * DEG / 2) / tanBase;
  const adsScale = p.ads > 0.5 ? ratio * SET.adsSens : ratio;
  let lookMul = 1;
  if (aimAssistOn(a)) lookMul = aimSlowdown(p);
  p.stunT = Math.max(0, (p.stunT || 0) - dt); p.flashT = Math.max(0, (p.flashT || 0) - dt); p.shake = Math.max(0, (p.shake || 0) - dt * 2.5);
  const stunK = p.stunT > 0 ? 0.3 : 1;
  a.mouseX *= stunK; a.mouseY *= stunK; lookMul *= stunK;
  const inv = SET.invertY ? -1 : 1;
  p.yaw -= a.mouseX * SET.sens * 0.00044 * adsScale;
  p.pitch -= a.mouseY * SET.sens * 0.00044 * adsScale * inv;
  if (a.pad) {
    const rate = (1.0 + SET.padSens * 0.45) * (p.ads > 0.5 ? Math.pow(ratio, 0.85) : 1) * lookMul;
    p.yaw -= a.lookX * rate * dt; p.pitch -= a.lookY * rate * 0.75 * dt * inv;
  }
  p.pitch = clamp(p.pitch, -88 * DEG, 88 * DEG);

  // ---------- stance / jump / dive / mantle ----------
  const fwd = [-Math.sin(p.yaw), 0, -Math.cos(p.yaw)], right = [Math.cos(p.yaw), 0, -Math.sin(p.yaw)];
  if (p.mantle) {
    const m = p.mantle; m.t += dt / m.dur;
    const t = Math.min(1, m.t), up = Math.min(1, t * 1.6), fw = clamp((t - 0.35) / 0.65, 0, 1);
    p.pos = [lerp(m.a[0], m.b[0], fw), lerp(m.a[1], m.b[1], up), lerp(m.a[2], m.b[2], fw)];
    p.vel = [0, 0, 0];
    if (m.t >= 1) { p.mantle = null; p.onGround = true; }
  }
  // ---------- stance / slide / dive (context sensitive) ----------
  // while sprinting:  hold C = slide, tap C = crouch;  hold Z = dive, tap Z = drop prone
  const free = !p.mantle;
  const toggleCrouch = () => { if (p.stance === 'crouch') changeStance(p, 'stand'); else changeStance(p, 'crouch'); };
  const toggleProne = () => { if (p.stance === 'prone') { changeStance(p, 'stand') || changeStance(p, 'crouch'); } else changeStance(p, 'prone'); };
  // slide / dive only after sprinting for SPRINT_MIN seconds; SET.slideMode: 'hold' (hold the key) or 'tap' (instant on press)
  const sdReady = p.sprint && p.onGround && (p.sprintDur || 0) >= SPRINT_MIN, tapMode = SET.slideMode === 'tap';
  if (a.cPress && free) {
    p.cHoldUsed = false;
    if (sdReady) { if (tapMode) { p.cHoldUsed = true; startSlide(p, fwd, d); } else p.cPend = true; }
    else if (p.sprint) { stopSprintNow(p, d); changeStance(p, 'crouch'); }
    else if (p.slideT > 0) endSlide(p); else toggleCrouch();
  }
  if (p.cPend) {
    if (!p.onGround) p.cPend = false;
    else if (a.cHoldT >= 0.15) { p.cPend = false; p.cHoldUsed = true; startSlide(p, fwd, d); }
    else if (a.cRelease || !p.sprint) { p.cPend = false; stopSprintNow(p, d); changeStance(p, 'crouch'); }
  }
  if (a.cHeld && !p.cPend && !p.cHoldUsed && !(p.slideT > 0) && a.cHoldT >= 0.32 && free) { p.cHoldUsed = true; changeStance(p, 'prone'); }
  if (a.zPress && free) {
    if (sdReady) { if (tapMode) startDive(p, fwd, d); else p.zPend = true; }
    else if (p.sprint) { stopSprintNow(p, d); changeStance(p, 'prone'); }
    else if (p.slideT > 0) { endSlide(p); changeStance(p, 'prone'); } else toggleProne();
  }
  if (p.zPend) {
    if (a.zHoldT >= 0.15) { p.zPend = false; startDive(p, fwd, d); }
    else if (a.zRelease || !p.sprint) { p.zPend = false; stopSprintNow(p, d); changeStance(p, 'prone'); }
  }
  if (a.padDown) { if (sdReady && free) startDive(p, fwd, d); else if (!p.sprint) useStreak(p, 2); }
  if (a.jumpP) p.jumpBuf = 0.13;
  p.jumpBuf = Math.max(0, p.jumpBuf - dt);
  p.coyote = p.onGround ? 0.1 : Math.max(0, p.coyote - dt);
  if (p.jumpBuf > 0 && !p.mantle) {
    if (p.slideT > 0) { // slide-cancel jump keeps momentum
      endSlide(p); if (setStance(p, 'stand')) { p.vel[1] = JUMP_V; p.onGround = false; sfxJump(); } p.jumpBuf = 0;
    }
    else if (p.stance === 'prone') { changeStance(p, 'crouch'); p.jumpBuf = 0; }
    else if (p.stance === 'crouch') { changeStance(p, 'stand'); p.jumpBuf = 0; }
    else if (p.onGround || p.coyote > 0) {
      const m = a.my > 0.3 ? findMantle(p, fwd) : null;
      if (m) { p.mantle = { a: p.pos.slice(), b: m, t: 0, dur: hasPerk('dex') ? 0.3 : 0.45 }; p.sprint = false; sfxJump(); }
      else { p.vel[1] = JUMP_V; p.onGround = false; sfxJump(); }
      p.jumpBuf = 0; p.coyote = 0;
    }
  }
  p.proneTrans = Math.max(0, p.proneTrans - dt); p.slideCD = Math.max(0, p.slideCD - dt); p.diveLand = Math.max(0, p.diveLand - dt);
  p.stanceKick = approach(p.stanceKick, 0, dt * 3.5);
  // eye height: critically damped spring (smooth, weighty stance changes)
  const eyeTarget = p.slideT > 0 ? 0.78 : p.diving ? 1.0 : STANCE[p.stance].eye;
  const k = p.stance === 'prone' || p.proneTrans > 0 ? 70 : 170, cdamp = 2 * Math.sqrt(k) * 0.95;
  p.eyeV += ((eyeTarget - p.eyeH) * k - p.eyeV * cdamp) * dt; p.eyeH += p.eyeV * dt;
  const hsNow = Math.hypot(p.vel[0], p.vel[2]);
  p.crawl = approach(p.crawl, p.stance === 'prone' && p.onGround && hsNow > 0.35 && !p.diveLand ? 1 : 0, dt * 5);
  if (p.crawl > 0.3) { p.crawlT += dt * hsNow * 4.5; if (Math.floor(p.crawlT / Math.PI) !== Math.floor((p.crawlT - dt * hsNow * 4.5) / Math.PI)) sfxCloth(); }

  // ---------- sprint (press or hold Shift + forward) ----------
  const maxSt = hasPerk('ec') ? 8 : 4;
  const wantAds = a.ads && p.swapT <= 0 && p.meleeT <= 0 && !p.mantle && (w.reloadT <= 0 || w.shellMode) && !p.diving && p.proneTrans <= 0 && p.crawl < 0.5;
  const canSprintNow = a.my > 0.5 && p.stamina > 0.3 && !a.ads && p.ads < 0.3 && !p.holding && !(p.slideT > 0) && !p.diving && !p.cPend && !p.zPend && p.diveLand <= 0;
  if (!p.sprint && canSprintNow && (a.sprintP || (a.sprintHeld && p.stance === 'stand'))) {
    if (p.stance !== 'stand') changeStance(p, 'stand');
    if (p.stance === 'stand') p.sprint = true; // reloading continues while sprinting
  }
  const stopSprint = () => { if (p.sprint) { p.sprint = false; p.sprintOutT = d.sprintOut; } };
  if (p.sprint && !p.cPend && !p.zPend && (a.my < 0.5 || p.stamina <= 0 || wantAds || p.stance !== 'stand' || p.fireBuf > 0)) stopSprint();
  p.sprintDur = p.sprint ? (p.sprintDur || 0) + dt : 0;
  if (p.sprint) p.stamina = Math.max(0, p.stamina - dt);
  else p.stamina = Math.min(maxSt, p.stamina + dt * 1.0);
  p.sprintOutT = Math.max(0, p.sprintOutT - dt);

  // ---------- movement (snappy vector acceleration) ----------
  let wx = fwd[0] * a.my + right[0] * a.mx, wz = fwd[2] * a.my + right[2] * a.mx;
  const wl = Math.hypot(wx, wz); if (wl > 1) { wx /= wl; wz /= wl; }
  const adsSlow = d.cls === 'sniper' ? 0.42 : d.cls === 'lmg' ? 0.5 : w.att.has('stock') ? 0.85 : 0.6;
  let spd = BASE_SPEED * d.mob * (hasPerk('lw') ? 1.07 : 1) * STANCE[p.stance].spd * lerp(1, adsSlow, p.ads) * (p.sprint ? 1.5 : 1) * (p.stunT > 0 ? 0.5 : 1) * (p.proneTrans > 0 ? 0.3 : 1);
  if (!p.mantle) {
    const tx = wx * spd, tz = wz * spd;
    if (p.slideT > 0) {
      p.slideT -= dt;
      const k0 = 1 - p.slideT / p.slideDur, sp = lerp(p.slideSpd, BASE_SPEED * 0.65, k0 * k0);
      if (wl > 0.1) { const cur = Math.atan2(-p.slideV[0], -p.slideV[2]), want = Math.atan2(-wx, -wz); const ny = cur + clamp(angDiff(cur, want), -1.1 * dt, 1.1 * dt); p.slideV = [-Math.sin(ny), 0, -Math.cos(ny)]; }
      if (p.onGround) { p.vel[0] = p.slideV[0] * sp; p.vel[2] = p.slideV[2] * sp; }
      if (p.slideT <= 0) endSlide(p);
    } else if (p.diveLand > 0 && p.onGround) {
      p.vel[0] = approach(p.vel[0], 0, 9 * dt); p.vel[2] = approach(p.vel[2], 0, 9 * dt);
    } else if (p.onGround && !p.diving) {
      const dvx = tx - p.vel[0], dvz = tz - p.vel[2], dl = Math.hypot(dvx, dvz);
      const acc = (wl > 0.05 ? 60 : 75) * dt;
      if (dl <= acc) { p.vel[0] = tx; p.vel[2] = tz; } else { p.vel[0] += dvx / dl * acc; p.vel[2] += dvz / dl * acc; }
    } else if (!p.onGround && wl > 0.1) {
      const acc = 10 * dt, cur = Math.hypot(p.vel[0], p.vel[2]);
      p.vel[0] = approach(p.vel[0], tx, acc); p.vel[2] = approach(p.vel[2], tz, acc);
      const nv = Math.hypot(p.vel[0], p.vel[2]), cap = Math.max(cur, spd); if (nv > cap) { p.vel[0] *= cap / nv; p.vel[2] *= cap / nv; }
    } else if (p.onGround) { p.vel[0] = approach(p.vel[0], 0, 9 * dt); p.vel[2] = approach(p.vel[2], 0, 9 * dt); }
    p.vel[1] -= PGRAV * dt;
    const preY = p.vel[1];
    const r = moveEntity(p, p.vel[0] * dt, p.vel[1] * dt, p.vel[2] * dt, HW, p.h, p.onGround ? 0.46 : 0.0);
    if (r.hitWall && p.slideT > 0 && Math.hypot(p.vel[0], p.vel[2]) > 3) endSlide(p);
    if (r.ground && p.diving) { p.diving = false; p.diveLand = 0.5; p.landKick = 3.5; p.stanceKick = 1; sfxThud(0.35); }
    if (r.ground) {
      if (!p.onGround && preY < -3.5) { p.landKick = clamp(-preY * 0.25, 0, 3); sfxStep(0.18); if (preY < -11 && !hasPerk('lw')) damageEnt(p, (-preY - 11) * 9, null, null, 'fall'); }
      p.vel[1] = 0; p.onGround = true; p.airT = 0;
    } else { p.onGround = false; p.airT += dt; }
    if (p.stepped) { p.eyeH -= Math.min(p.stepped, 0.3); p.stepped = 0; }
  }
  const hs = Math.hypot(p.vel[0], p.vel[2]);
  if (p.onGround && hs > 0.5) {
    p.bobT += dt * (p.sprint ? 13 : 9) * Math.min(1, hs / 4);
    p.stepAcc += hs * dt; if (p.stepAcc > (p.sprint ? 2.2 : 1.9)) { p.stepAcc = 0; if (!hasPerk('ds')) sfxStep(p.sprint ? 0.1 : 0.06); }
  }
  p.bobAmt = approach(p.bobAmt, p.onGround ? Math.min(1, hs / 4.8) : 0, dt * 6);
  p.landKick = approach(p.landKick, 0, dt * 10);

  // ---------- ADS ----------
  if (wantAds && p.sprint) stopSprint();
  const adsTime = d.ads * (w.att.has('qd') ? (d.cls === 'lmg' ? 0.75 : 0.5) : 1);
  const adsWas = p.ads;
  if (wantAds && p.sprintOutT <= 0) p.ads = Math.min(1, p.ads + dt / adsTime);
  else if (!wantAds) p.ads = Math.max(0, p.ads - dt / (adsTime * 0.7));
  if (a.ads && !p.adsPrev) { p.adsStart = G.time; if (aimAssistOn(a)) aimSnapStart(p); }
  p.adsPrev = a.ads;
  if (!a.ads) p.snap = null;
  if (p.snap) aimSnapUpdate(p, dt, adsWas);
  const opt = optic(w);
  if (opt === 'scope' && adsWas < SCOPE_AT && p.ads >= SCOPE_AT) sfxClick(1200, 0.12, 0.05);

  // ---------- hold breath & sway ----------
  const scoped = isScoped(p), sniperish = d.cls === 'sniper';
  if (scoped && sniperish) p.swayRamp = Math.min(1, p.swayRamp + dt * 2.6); else p.swayRamp = 0;
  p.exhaustT = Math.max(0, p.exhaustT - dt);
  const wantHold = scoped && sniperish && a.sprintHeld && p.exhaustT <= 0 && p.breath > 0;
  if (wantHold && !p.holding) sfxBreath(true);
  if (!wantHold && p.holding) sfxBreath(false);
  p.holding = wantHold;
  if (p.holding) { p.breath -= dt; if (p.breath <= 0) { p.breath = 0; p.exhaustT = 2.2; p.holding = false; sfxBreath(false); } }
  else p.breath = Math.min(4, p.breath + dt * (scoped ? 0.8 : 1.6));
  p.swayMul = approach(p.swayMul, p.holding ? 0.04 : p.exhaustT > 0 ? 2.4 : 1, dt * (p.holding ? 7 : 2.5));
  p.swayT += dt * (p.exhaustT > 0 ? 1.7 : 1);
  let stanceF = 1;
  if (d.stanceSway) stanceF = p.stance === 'crouch' ? 0.6 : p.stance === 'prone' ? 0.3 : 1;
  const amp = (sniperish ? 0.85 : 0.3) * d.sway * (w.att.has('cpu') ? 0.28 : 1) * (opt === 'acog' ? 0.5 : 1) * stanceF * p.swayMul * (sniperish ? (opt === 'acog' ? p.ads * 0.6 : p.swayRamp) : p.ads);
  const st = p.swayT;
  const swayY = amp * (Math.sin(st * 1.05) * 0.9 + Math.sin(st * 2.7 + 1.3) * 0.22);
  const swayP = amp * (Math.sin(st * 2.1) * 0.45 + Math.sin(st * 0.63 + 2) * 0.35);

  // ---------- timers ----------
  w.shotT -= dt; w.boltT = Math.max(0, w.boltT - dt); p.pumpT = Math.max(0, p.pumpT - dt);
  p.swapT = Math.max(0, p.swapT - dt); p.meleeT = Math.max(0, p.meleeT - dt); p.throwT = Math.max(0, p.throwT - dt);
  p.fireBuf = Math.max(0, p.fireBuf - dt);
  if (w.reloadT > 0) {
    const before = w.reloadT; w.reloadT -= dt;
    if (w.shellMode) {
      if (w.reloadT <= 0) { if (w.res > 0 && w.mag < w.magMax) { w.mag++; w.res--; sfxClick(1400, 0.22, 0.05); } if (w.mag < w.magMax && w.res > 0) { w.reloadT = w.reloadTot = d.shell; } else { w.reloadT = 0; w.shellMode = false; if (d.pump) sfxPump(); } }
    } else {
      if (before > w.reloadFillAt && w.reloadT <= w.reloadFillAt) { const need = w.magMax - w.mag, take = Math.min(need, w.res); w.mag += take; w.res -= take; sfxClick(1600, 0.25, 0.05); }
      if (w.reloadT <= 0) { w.reloadT = 0; if (d.bolt) sfxBolt(); }
    }
  }
  // ---------- actions ----------
  const busy = p.swapT > 0 || p.meleeT > 0 || p.mantle;
  let swapReq = a.swapP && p.wpn.length > 1 ? (a.swapTo >= 0 ? a.swapTo : 1 - p.cur) : -1;
  if (swapReq >= p.wpn.length) swapReq = -1;
  const vzOn = scoped && w.att.has('vz');
  if (a.wheel && !vzOn && p.wpn.length > 1) swapReq = 1 - p.cur;
  if (vzOn && (a.wheel || a.zoom)) {
    p.zoomLv = clamp(p.zoomLv + (a.zoom ? (p.zoomLv === 2 ? -2 : 1) : a.wheel < 0 ? 1 : -1), 0, 2); sfxClick(2200, 0.1, 0.03);
  }
  if (swapReq >= 0 && swapReq !== p.cur && p.meleeT <= 0 && !p.mantle) {
    w.reloadT = 0; w.shellMode = false; w.burstLeft = 0; p.cur = swapReq; const nd = curW(p).d;
    p.swapTot = p.swapT = (w.d.swap * 0.35 + nd.swap * 0.5) * (hasPerk('fh') ? 0.6 : 1); p.ads = 0; p.snap = null; sfxClick(900, 0.2, 0.08);
  }
  const W2 = curW(p), D2 = W2.d;
  // reload
  const autoRel = W2.mag === 0 && W2.res > 0 && W2.shotT <= 0 && W2.boltT <= 0 && W2.burstLeft <= 0;
  if ((a.reloadP || autoRel) && W2.reloadT <= 0 && W2.mag < W2.magMax && W2.res > 0 && !busy) {
    if (D2.shell) { W2.shellMode = true; W2.reloadTot = W2.reloadT = (D2.shell + 0.25) * (zmHas('speed') ? 0.5 : 1); }
    else {
      W2.reloadTot = W2.reloadT = (W2.mag === 0 ? D2.reloadEmpty : D2.reload) * (W2.att.has('fm') ? 0.65 : 1) * (zmHas('speed') ? 0.5 : 1);
      W2.reloadFillAt = W2.reloadTot * 0.2;
    }
    sfxClick(700, 0.2, 0.06);
  }
  if ((a.meleeP || (D2.melee && a.fireP)) && !busy) doMelee(p);
  // ---- lethal (frag can be cooked by holding) ----
  const lt = G.mode === 'zombies' ? 'frag' : ACTIVE.lethal;
  const throwTime = hasPerk('fh') ? 0.4 : 0.65;
  if (lt === 'c4' && a.lethalP && G.projs.some(q => q.type === 'c4' && q.owner === p)) { for (const q of G.projs) if (q.type === 'c4' && q.owner === p) detonate(q); sfxBeep(1200, 0.2); }
  else if (lt === 'frag') {
    if (a.lethalP && p.lethals > 0 && !busy && p.throwT <= 0 && !p.cookT) { p.cookT = 0.0001; p.lethals--; stopSprint(); sfxClick(2500, 0.2, 0.04); }
    if (p.cookT) {
      const before = p.cookT; p.cookT += dt;
      if (Math.floor(before) !== Math.floor(p.cookT)) sfxBeep(1400, 0.1);
      if (p.cookT >= 3) { p.cookT = 0; explode(eyePos(p), 6.5, 160, 45, p, XDEF.frag); }
      else if (!a.lethalHeld) { throwItem(p, 'frag', p.cookT); p.cookT = 0; p.throwT = throwTime; sfxSwing(); }
    }
  } else if (a.lethalP && p.lethals > 0 && !busy && p.throwT <= 0 && lt !== 'none') {
    p.lethals--; p.throwT = throwTime; stopSprint(); throwItem(p, lt); sfxSwing();
  }
  if (a.tacP && p.tacticals > 0 && !busy && p.throwT <= 0 && ACTIVE.tactical !== 'none' && G.mode !== 'zombies') {
    p.tacticals--; p.throwT = throwTime; stopSprint(); throwItem(p, ACTIVE.tactical); sfxSwing();
    if (ACTIVE.tactical === 'sensor') G.timers.push({ t: 0.7, fn: () => { const q = G.projs.slice().reverse().find(q => q.type === 'sensor' && q.owner === p); if (q) G.sensors.push({ pos: q.pos.slice(), t: 0, owner: p }); } });
  }
  if (a.streakP >= 0) useStreak(p, a.streakP);
  if (a.useP && G.mode === 'zombies') zmUse(p);
  if (G.mode === 'zombies') { zqHold(p, a.useHeld, dt); if (a.streakP === 0) zqPlaceTrap(p); }

  // ---------- fire (buffered so a click is never lost) ----------
  if (a.fireP) p.fireBuf = 0.16;
  const holdingAuto = D2.auto && a.fire;
  if ((a.fireP || holdingAuto) && p.sprint) stopSprint();
  if ((a.fireP || holdingAuto) && W2.shellMode && W2.mag > 0) { W2.reloadT = 0; W2.shellMode = false; }
  const canFire = !D2.melee && p.proneTrans <= 0 && p.crawl < 0.5 && W2.shotT <= 0 && W2.reloadT <= 0 && !busy && !p.sprint && p.sprintOutT <= 0 && p.throwT <= 0.3 && (!D2.bolt || W2.boltT <= 0) && p.pumpT <= 0;
  if (W2.burstLeft > 0) {
    if (W2.shotT <= 0 && W2.mag > 0 && !busy) { playerShoot(p, W2); W2.burstLeft--; W2.shotT = W2.burstLeft > 0 ? D2.rof : D2.burstDelay; }
    if (W2.mag <= 0) W2.burstLeft = 0;
  } else if ((p.fireBuf > 0 || holdingAuto) && canFire) {
    if (W2.mag > 0) {
      p.fireBuf = 0;
      if (D2.burst) { W2.burstLeft = D2.burst - 1; playerShoot(p, W2); W2.shotT = W2.burstLeft > 0 ? D2.rof : D2.burstDelay; }
      else { playerShoot(p, W2); W2.shotT = D2.rof * (zmHas('dtap') ? 0.75 : 1); }
    } else if (a.fireP) { sfxClick(3000, 0.2, 0.03); p.fireBuf = 0; }
  }

  if (W2.temp && W2.mag <= 0 && W2.shotT <= 0) { p.wpn = p.wpn.filter(x => x !== W2); p.cur = 0; p.swapT = p.swapTot = 0.4; }
  // ---------- recoil / flinch recovery ----------
  p.recoilP = approach(p.recoilP, 0, dt * D2.center * Math.max(1, p.recoilP * 0.6));
  p.recoilY = approach(p.recoilY, 0, dt * D2.center);
  p.flinchP = approach(p.flinchP, 0, dt * 14); p.flinchY = approach(p.flinchY, 0, dt * 14);
  p.boltKick = W2.boltT > 0 && D2.bolt ? Math.sin(clamp(1 - W2.boltT / D2.rof, 0, 1) * Math.PI) : 0;
  const mh = p.maxHp || 100; if (!G.online && G.time - p.lastDmgT > (G.mode === 'zombies' ? 3 : 5) && p.hp < mh) p.hp = Math.min(mh, p.hp + dt * 40 * mh / 100);
  // ---------- camera ----------
  const bob = p.bobAmt * (1 - p.ads * 0.9);
  p.camYaw = p.yaw + (swayY + p.recoilY + p.flinchY) * DEG + Math.sin(p.bobT) * 0.0025 * bob;
  p.camPitch = p.pitch + (swayP + p.recoilP + p.flinchP) * DEG - p.boltKick * (scoped ? 0.9 : 0.4) * DEG + Math.abs(Math.cos(p.bobT)) * 0.004 * bob - p.landKick * DEG * 0.5;
  if (p.shake > 0) { p.camYaw += (Math.random() - 0.5) * p.shake * 0.03; p.camPitch += (Math.random() - 0.5) * p.shake * 0.03; }
  if (p.stunT > 0) { p.camYaw += Math.sin(G.time * 2.3) * 0.02; p.camPitch += Math.sin(G.time * 1.7) * 0.015; }
  p.slideK = approach(p.slideK || 0, p.slideT > 0 ? 1 : 0, dt * 7); p.diveK = approach(p.diveK || 0, p.diving ? 1 : 0, dt * 6);
  p.camPitch += -p.diveK * 7 * DEG + p.slideK * 2 * DEG;
  p.camRoll = -p.slideK * 0.07 + p.diveK * 0.02 + (p.stunT > 0 ? Math.sin(G.time * 1.3) * 0.05 : 0) + Math.sin(p.bobT) * 0.004 * bob + p.boltKick * (scoped ? 0.012 : 0);
  p.fov = curFovTarget(p) + (p.slideK || 0) * 7 + (p.diveK || 0) * 4;
}
function changeStance(p, s) {
  const from = p.stance;
  if (s === from) return true;
  if (!setStance(p, s)) return false;
  p.stanceKick = 1; p.stanceDir = STANCE[s].h < STANCE[from].h ? 1 : -1;
  if (s === 'prone' || from === 'prone') { p.proneTrans = s === 'prone' ? 0.5 : 0.4; sfxCloth(); }
  if (p.sprint && s !== 'stand') { p.sprint = false; p.sprintOutT = curW(p).d.sprintOut * 0.5; }
  return true;
}
const SPRINT_MIN = 0.5;
function stopSprintNow(p, d) { if (p.sprint) { p.sprint = false; p.sprintOutT = d.sprintOut; } }
function startSlide(p, fwd, d) {
  if (p.slideCD > 0 || !p.onGround) { stopSprintNow(p, d); changeStance(p, 'crouch'); return; }
  const hs = Math.hypot(p.vel[0], p.vel[2]);
  p.slideV = hs > 1 ? [p.vel[0] / hs, 0, p.vel[2] / hs] : fwd.slice();
  p.slideSpd = Math.max(hs, BASE_SPEED * 1.45) + 1.7; p.slideDur = p.slideT = 0.85;
  p.sprint = false; p.sprintOutT = 0.12;
  setStance(p, 'crouch'); p.h = 1.05; p.stanceKick = 1; p.stanceDir = 1; sfxSlide();
}
function endSlide(p) { if (!(p.slideT > 0)) return; p.slideT = 0; p.slideCD = 0.45; if (p.stance === 'crouch') p.h = STANCE.crouch.h; }
function startDive(p, fwd, d) {
  if (!p.onGround) return;
  const hs = Math.max(Math.hypot(p.vel[0], p.vel[2]), 6.5);
  p.vel = [fwd[0] * (hs + 1.2), 4.4, fwd[2] * (hs + 1.2)]; p.onGround = false; p.diving = true; p.diveT = 0.9;
  p.sprint = false; p.sprintOutT = 0.1; p.stance = 'prone'; p.h = 0.62; p.stanceKick = 1; p.stanceDir = 1; p.proneTrans = 0; sfxJump(); sfxCloth();
}
function findMantle(p, fwd) {
  const probe = [p.pos[0] + fwd[0] * 0.75, p.pos[1], p.pos[2] + fwd[2] * 0.75];
  let top = -1;
  for (const b of boxesNear(probe[0], probe[2], 1)) {
    if (probe[0] > b.mn[0] - 0.25 && probe[0] < b.mx[0] + 0.25 && probe[2] > b.mn[2] - 0.25 && probe[2] < b.mx[2] + 0.25 && b.mn[1] < p.pos[1] + 1.5 && b.mx[1] > p.pos[1] + 0.3) top = Math.max(top, b.mx[1]);
  }
  const rel = top - p.pos[1];
  if (top < 0 || rel < 0.45 || rel > 1.55) return null;
  for (const dd of [0.75, 1.0, 1.3]) {
    const dst = [p.pos[0] + fwd[0] * dd, top, p.pos[2] + fwd[2] * dd];
    if (spaceFree(dst, HW, 1.8)) return dst;
  }
  return null;
}
function hipSpread(p, w) {
  const d = w.d, moving = Math.hypot(p.vel[0], p.vel[2]) > 1, o = optic(w);
  let s;
  if (d.cls === 'sniper') s = p.ads >= SCOPE_AT ? 0 : d.hip * Math.pow(1 - p.ads / SCOPE_AT, 1.2);
  else s = lerp(d.hip * (w.att.has('laser') ? 0.6 : 1), d.adsSpread, p.ads);
  return s * (moving ? 1.25 : 1) * (p.onGround ? 1 : hasPerk('dex') ? 1.15 : 1.7) * (p.stance === 'crouch' ? 0.85 : p.stance === 'prone' ? 0.7 : 1);
}
function playerShoot(p, w) {
  const d = w.d; w.mag--;
  if (d.bolt) { w.boltT = d.rof; setTimeout(sfxBolt, 120); }
  if (d.pump) { p.pumpT = d.rof; setTimeout(sfxPump, 150); }
  const sup = w.att.has('sup');
  p.muzzleT = G.time; p.lastShotT = G.time; p.firedT = G.time; p.firedSup = sup;
  sfxShot(d.kind, 0, 0, sup);
  const spread = hipSpread(p, w);
  const f = fwdVec(p.camYaw, p.camPitch);
  const qsTime = G.time - p.adsStart, adsAtShot = p.ads;
  if (G.mode === 'zombies') zqShot(eyePos(p), f);
  if (d.special) { zwFire(p, w, f); p.recoilP += d.recoil; return; }
  if (d.proj) {
    const f2 = coneDir(f, spread * DEG), e0 = V.add(eyePos(p), V.mul(f2, 0.6));
    const sp = d.proj === 'plasma' ? 70 : 42;
    const zr = G.zm ? Math.max(1, G.zm.round) : 1;
    G.projs.push({ type: d.proj, pos: e0, start: e0.slice(), vel: V.mul(f2, sp), owner: p, team: p.team, t: 0, dmg: d.proj === 'plasma' ? (w.up ? 2500 : 1100) : d === WPN.m32 ? (300 + 150 * zr) * (w.up ? 2 : 1) : 0, def: d === WPN.m32 ? d : null });
    if (d.proj === 'plasma') sfxPlasma(0);
    p.recoilP += d.recoil; alertBots(p, d, false);
    return;
  }
  const n = d.pellets || 1;
  let anyHit = null, last = null;
  for (let i = 0; i < n; i++) {
    const dir = d.pellets ? coneDir(coneDir(f, spread * DEG), d.pelSpread * (w.att.has('laser') ? 0.85 : 1) * lerp(1, 0.75, p.ads) * DEG) : coneDir(f, spread * DEG);
    const res = fireBullet(p, eyePos(p), dir, d, d.pellets ? 60 : 300, w.att, (w.dmgMul || 1) * (zmHas('dtap') ? 2 : 1));
    if (res.ent) anyHit = res; last = res;
    if (i < 3 || !d.pellets) {
      const mz = V.add(eyePos(p), V.add(V.mul(f, 0.6), [Math.cos(p.yaw) * 0.12 * (1 - p.ads), -0.1 * (1 - p.ads), -Math.sin(p.yaw) * 0.12 * (1 - p.ads)]));
      G.tracers.push({ a: mz, b: res.point, t: 0, life: d.cls === 'sniper' ? 0.12 : 0.05 });
    }
  }
  if (G.online && last) netShot(V.add(eyePos(p), V.mul(f, 0.6)), last.point, d.kind, sup);
  const kick = d.recoil * (w.att.has('grip') ? 0.7 : 1) * (p.stance === 'prone' ? 0.6 : p.stance === 'crouch' ? 0.85 : 1);
  if (d.auto) { p.pitch += kick * 0.45 * DEG; p.recoilP += kick * 0.55; p.yaw += rand(-0.35, 0.35) * kick * DEG; }
  else if (d.burst) { p.recoilP += kick; p.pitch += kick * 0.3 * DEG; }
  else p.recoilP += kick;
  p.recoilY += rand(-0.25, 0.25) * kick;
  if (G.stats) { G.stats.shots++; if (anyHit) G.stats.hits++; if (d.cls === 'sniper') G.stats.lastAds = { qs: qsTime, ads: adsAtShot, scoped: adsAtShot >= SCOPE_AT }; }
  if (anyHit && anyHit.ent.hp <= 0 && d.cls === 'sniper') {
    if (adsAtShot < 0.15) popup('ノースコープ!', '#ffcf5a');
    else if (adsAtShot >= SCOPE_AT && qsTime < d.ads + 0.35) popup('クイックスコープ', '#ffcf5a');
  }
  alertBots(p, d, sup);
}
function coneDir(f, ang) {
  if (ang <= 0) return f;
  const up = Math.abs(f[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const u = V.norm(V.cross(f, up)), v = V.cross(u, f);
  const r = Math.tan(ang) * Math.sqrt(Math.random()), th = Math.random() * Math.PI * 2;
  return V.norm(V.add(f, V.add(V.mul(u, Math.cos(th) * r), V.mul(v, Math.sin(th) * r))));
}
// hitscan with wall penetration. returns {point, ent, zone, dist}
function fireBullet(shooter, o0, dir, d, range, att, mul) {
  let o = o0, travelled = 0, dmgMul = mul || 1, pen = (d.pen || 0) * (att && att.has('fmj') ? 2 : 1);
  for (let layer = 0; layer < 3; layer++) {
    const remaining = range - travelled;
    const wh = rayWorld(o, dir, remaining);
    let best = wh ? wh.t : remaining, ent = null, zone = null;
    const dh = G.drones.length ? rayDrones(shooter, o, dir, best) : null;
    if (dh) { dh.dr.hp = 0; if (shooter.isPlayer) { popup('ドローン撃墜 +50', '#fff'); shooter.score += 50; sfxHit(true); } return { point: V.add(o, V.mul(dir, dh.t)), ent: null, dist: travelled + dh.t }; }
    for (const e of G.ents) {
      if (e === shooter || !e.alive || !isEnemy(shooter, e)) continue;
      const r = e.isPlayer ? rayPlayer(e, o, dir, best) : rayBot(e, o, dir, best);
      if (r && r.t < best) { best = r.t; ent = e; zone = r.zone; }
    }
    const point = V.add(o, V.mul(dir, best)), dist = travelled + best;
    if (ent) {
      const dmg = (ent.isZombie ? zmWeaponDamage(d, zone, dist, att) : wDamage(d, zone, dist, att)) * dmgMul;
      if (shooter.isPlayer && G.stats) G.lastHitInfo = { zone, dmg, dist, t: G.time, kill: ent.hp - dmg <= 0, pen: layer > 0 };
      damageEnt(ent, dmg, shooter, d, zone, dir, dist);
      bloodPuff(point, dir);
      return { point, ent, zone, dist };
    }
    if (!wh) return { point, ent: null, dist };
    impactFX(point, wh.n, wh.box);
    if (wh.box.ground || pen <= 0) return { point, ent: null, dist };
    const exit = rayBoxExit(o, dir, wh.box.mn, wh.box.mx), thick = exit - wh.t;
    if (thick > pen) return { point, ent: null, dist };
    dmgMul *= 1 - (thick / pen) * 0.5;
    o = V.add(o, V.mul(dir, exit + 0.02)); travelled += exit + 0.02;
    impactFX(V.sub(o, V.mul(dir, 0.01)), V.mul(wh.n, -1), wh.box);
  }
  return { point: V.add(o, V.mul(dir, 1)), ent: null, dist: travelled };
}
function rayPlayer(p, o, d, tmax) {
  const mn = [p.pos[0] - HW, p.pos[1], p.pos[2] - HW], mx = [p.pos[0] + HW, p.pos[1] + p.h, p.pos[2] + HW];
  if (p.stance === 'prone') { mn[0] -= 0.5; mn[2] -= 0.5; mx[0] += 0.5; mx[2] += 0.5; }
  const t = rayBox(o, d, mn, mx, tmax); if (t < 0) return null;
  const y = o[1] + d[1] * t - p.pos[1];
  return { t, zone: y > p.h - 0.28 ? 'head' : y > p.h * 0.62 ? 'upper' : y > p.h * 0.45 ? 'lower' : 'uleg' };
}
function damageEnt(e, dmg, src, d, zone, dir, dist) {
  if (!e.alive || G.over) return;
  if (src && src !== e && !isEnemy(src, e)) return;
  if (G.online) { if (src && src !== e && (src.isPlayer || src.netBot) && e.netId) netClaim(e, dmg, src, d, zone, dir); return; } // online: the server decides damage
  if (e.isZombie) { zmOnDamage(e, dmg, src, d, zone); return; }
  if (e.isPlayer && e.invulnT > G.time) return;
  e.hp -= dmg; e.lastDmgT = G.time;
  if (e.isPlayer) {
    const tough = hasPerk('tough') ? 0.25 : 1, sc = isScoped(e) ? 1.6 : 1;
    e.flinchP += rand(1.2, 2.6) * tough * sc; e.flinchY += rand(-1.5, 1.5) * tough * sc;
    if (src) e.dmgDirs.push({ from: src.pos.slice(), t: G.time });
    sfxHurt();
  } else botOnDamaged(e, src);
  if (src && src.isPlayer && e !== src) { src.hitT = G.time; src.hitKill = e.hp <= 0; sfxHit(e.hp <= 0); }
  if (e.hp <= 0) { if (e.isPlayer && G.mode === 'zombies') { zmPlayerDown(e); return; } killEnt(e, src, d, zone, dist); }
}
function killEnt(e, src, d, zone, dist) {
  e.alive = false; e.hp = 0; e.deaths++; e.respawnT = e.isPlayer ? 3.0 : (G.mode === 'range' ? 1.4 : 3.5);
  e.deathT = G.time; e.deathYaw = e.yaw;
  if (e.isPlayer) { e.deathCam = 0; e.killer = src && src !== e ? { name: src.name, wpn: d ? d.name : '' } : null; e.streak = 0; e.streakPts = 0; e.ads = 0; e.cookT = 0; e.wpn = e.wpn.filter(w => !w.temp); e.cur = 0; }
  const wname = d ? d.name : zone === 'fall' ? '落下' : zone === 'melee' ? 'ナイフ' : zone === 'axe' ? '投げ斧' : zone === 'explosive' ? '爆発' : '';
  G.killfeed.push({ k: src && src !== e ? src.name : '', v: e.name, w: wname, hs: zone === 'head', t: G.time, kp: !!(src && src.isPlayer), vp: e.isPlayer });
  if (G.killfeed.length > 6) G.killfeed.shift();
  modeOnKill(e, src, d, zone);
  if (src && src !== e) {
    src.kills++; src.streak = (src.streak || 0) + 1;
    if (!src.isPlayer) botStreak(src);
    let pts = 100;
    if (src.isPlayer) {
      popup('+100', '#ffcf5a');
      if (zone === 'head') { pts += 50; popup('ヘッドショット +50', '#fff'); }
      if (dist > 50 && d && d.cls === 'sniper') { pts += 50; popup(`ロングショット ${dist.toFixed(0)}m +50`, '#fff'); }
      if (zone === 'melee') popup('ナイフキル', '#fff');
      if (zone === 'axe') { popup('投げ斧キル +50', '#fff'); pts += 50; }
      if (G.lastHitInfo && G.lastHitInfo.pen && G.time - G.lastHitInfo.t < 0.1) { popup('壁抜き +25', '#fff'); pts += 25; }
      if (!(d && d.cls === 'streak')) awardStreakPoints(src, pts);
      if (hasPerk('scav')) { for (const w of src.wpn) if (!w.temp) w.res = Math.min(w.res + w.magMax, w.d.res * 1.5); src.lethals = Math.max(src.lethals, lethalMax()); }
      if (d && G.mode === 'ffa') {
        const id = Object.keys(WPN).find(k => WPN[k] === d);
        if (id) { const before = hasGold(id); STATS.wk[id] = wKills(id) + 1; saveJSON('ls_stats', STATS); if (!before && hasGold(id)) popup(`${d.name} ゴールド迷彩 解除!`, '#ffd24a'); }
      }
    }
    src.score += pts;
    if (G.mode === 'ffa' && src.kills >= G.scoreLimit) endMatch();
  }
}
function popup(text, col) { G.popups.push({ text, col, t: G.time }); if (G.popups.length > 5) G.popups.shift(); }
function doMelee(p) {
  p.meleeT = 0.55; p.ads = 0; p.sprint = false; sfxSwing();
  const e = eyePos(p), f = fwdVec(p.yaw, p.pitch);
  let best = null, bd = 2.6;
  for (const b of G.ents) {
    if (!b.alive || b === p || !isEnemy(p, b)) continue;
    const c = [b.pos[0], b.pos[1] + 1.1, b.pos[2]], dv = V.sub(c, e), dist = V.len(dv);
    if (dist < bd && V.dot(V.norm(dv), f) > 0.6 && losClear(e, c)) { best = b; bd = dist; }
  }
  if (best) {
    const dv = V.sub(best.pos, p.pos); p.vel[0] += dv[0] * 4; p.vel[2] += dv[2] * 4;
    setTimeout(() => { if (best.alive && p.alive) damageEnt(best, G.mode === 'zombies' ? zmKnifeDmg() : 135, p, null, 'melee', f, bd); }, 100);
  }
}
// ---------- aim assist (BO2 style: ADS snap + slowdown) ----------
function aimAssistOn(a) { return SET.aa === 'all' || (SET.aa === 'pad' && a.pad); }
function aaTargets(p, maxAng, maxDist) {
  const e = eyePos(p), f = fwdVec(p.camYaw, p.camPitch); let best = null, ba = maxAng;
  for (const b of G.ents) {
    if (b === p || !b.alive || !isEnemy(p, b)) continue;
    const c = [b.pos[0], b.pos[1] + (b.isPlayer ? b.h * 0.7 : 1.25), b.pos[2]], dv = V.sub(c, e), dist = V.len(dv);
    if (dist > maxDist) continue;
    const ang = Math.acos(clamp(V.dot(V.norm(dv), f), -1, 1));
    if (ang < ba && losClear(e, c)) { ba = ang; best = { ent: b, ang, dist }; }
  }
  return best;
}
function aimSlowdown(p) {
  if (!G._aaT || G.time - G._aaT > 0.1) { G._aaT = G.time; G._aaHit = aaTargets(p, 4 * DEG, 90); }
  return G._aaHit ? 0.45 : 1;
}
function aimSnapStart(p) {
  const d = curW(p).d;
  const t = aaTargets(p, (d.cls === 'sniper' ? 10 : 7) * DEG, d.cls === 'sniper' ? 75 : 45);
  p.snap = t ? { ent: t.ent } : null;
}
function aimSnapUpdate(p, dt, adsWas) {
  const t = p.snap.ent;
  if (!t.alive || p.ads >= 1) { if (p.ads >= 1) p.snap = null; return; }
  const c = [t.pos[0], t.pos[1] + (t.isPlayer ? t.h * 0.75 : 1.28), t.pos[2]];
  const [ty, tp] = yawPitchOf(V.norm(V.sub(c, eyePos(p))));
  const k = clamp((p.ads - adsWas) / Math.max(0.0001, 1 - adsWas), 0, 1);
  p.yaw += angDiff(p.yaw, ty) * k; p.pitch += (tp - p.pitch) * k;
}
function alertBots(src, d, sup) {
  const r = sup ? 12 : d.kind === 'sniper' ? 75 : 55;
  for (const b of G.bots) if (b.alive && isEnemy(b, src) && V.dist2(b.pos, src.pos) < r) botHear(b, src);
}
