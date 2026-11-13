// ============================================================
//  ZOMBIES: barricades / power / fuses / color code / buildables (original content)
// ============================================================
const ZCOLS = [{ name: '赤', c: [1, 0.2, 0.15], css: '#ff3a2a' }, { name: '緑', c: [0.2, 1, 0.3], css: '#3aff5a' }, { name: '青', c: [0.25, 0.5, 1], css: '#4a8aff' }, { name: '黄', c: [1, 0.85, 0.15], css: '#ffd82a' }];
const ZPART_NAME = { shield: 'バリアシールド', trap: 'テスラトラップ' };
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
function zqInit() {
  const z = G.zm, q = W.zq; if (!q) return;
  z.power = false; z.fuses = 0; z.fuseIn = 0;
  z.fuseList = shuffle(q.fuseSpots.slice()).slice(0, 3).map(p => ({ pos: p, got: false }));
  z.lampCol = shuffle([0, 1, 2, 3]); z.code = shuffle([0, 1, 2, 3]); z.codeIdx = 0; z.codeShown = false; z.codeDone = false; z.rewardTaken = false; z.lampFlash = [0, 0, 0, 0];
  z.parts = {}; for (const k of ['shield', 'trap']) z.parts[k] = q.parts[k].map(alts => ({ pos: pick(alts), got: false }));
  z.built = { shield: false, trap: false }; z.shieldCdRound = 0; z.trapHeld = false; z.trap = null; z.repairPts = 0; z.repT = 0;
  z.env0 = { amb: R.amb.slice(), sunCol: R.sunCol.slice() };
  R.amb = z.env0.amb.map(v => v * 0.85); R.sunCol = z.env0.sunCol.map(v => v * 0.7);
}
const zqPartCount = k => G.zm.parts[k].filter(p => p.got).length;
// ---- prompts (called from zmNear before the buyables) ----
function zqNear(P) {
  const z = G.zm, q = W.zq; if (!q || !z.parts) return null;
  const d2 = (a, r) => (a[0] - P.pos[0]) ** 2 + (a[2] - P.pos[2]) ** 2 < r * r && Math.abs(a[1] - P.pos[1] - 0.5) < 2.2;
  for (const w of W.windows) if (w.boards < 6 && d2(w.inside, 1.5)) return { kind: 'window', w, text: '[F長押し] バリケードを修理' };
  if (d2(q.power, 1.8)) return z.power ? { kind: 'info', text: '電源は入っている' } : { kind: 'power', text: '[F] 電源を入れる' };
  for (const f of z.fuseList) if (!f.got && d2(f.pos, 1.5)) return { kind: 'fuse', f, text: '[F] ヒューズを拾う' };
  for (const k in z.parts) for (const pt of z.parts[k]) if (!pt.got && d2(pt.pos, 1.5)) return { kind: 'part', k, pt, text: `[F] ${ZPART_NAME[k]}の部品を拾う（${zqPartCount(k) + 1}/3）` };
  if (d2(q.gen, 2.0)) {
    if (z.fuseIn >= 3) return { kind: 'info', text: z.power ? '改造台は稼働中' : '電源が入れば改造台が動く' };
    if (z.fuses > 0) return { kind: 'gen', text: `[F] ヒューズを差し込む（${z.fuseIn}/3）` };
    return { kind: 'info', text: `制御盤：ヒューズが足りない（${z.fuseIn}/3）` };
  }
  if (d2(q.terminal, 2.0)) {
    if (!z.power) return { kind: 'info', text: '端末：電源が入っていない' };
    if (z.codeDone) return { kind: 'info', text: '端末：解除済み' };
    return { kind: 'terminal', text: z.codeShown ? '端末：色の順に信号灯を撃て' : '[F] 端末を調べる' };
  }
  if (z.codeDone && !z.rewardTaken && d2(q.pedestal, 1.8)) return { kind: 'reward', text: '[F] プラズマピストル改を受け取る' };
  if (d2(q.bench, 2.0)) {
    for (const k of ['shield', 'trap']) if (!z.built[k] && zqPartCount(k) === 3) return { kind: 'build', k, text: `[F] ${ZPART_NAME[k]}を組み立てる` };
    if (z.built.shield && !P.zshield) return z.round >= z.shieldCdRound ? { kind: 'takeShield', text: '[F] バリアシールドを背負う' } : { kind: 'info', text: 'シールドは次のラウンドで再生成' };
    if (z.built.trap && !z.trapHeld && !z.trap) return { kind: 'takeTrap', text: '[F] テスラトラップを持つ' };
    const need = ['shield', 'trap'].filter(k => !z.built[k]).map(k => `${ZPART_NAME[k]} ${zqPartCount(k)}/3`);
    return { kind: 'info', text: need.length ? `作業台：部品が足りない（${need.join(' / ')}）` : '作業台' };
  }
  if (z.trap && d2(z.trap.pos, 1.8)) {
    if (z.trap.active > 0) return { kind: 'info', text: `テスラトラップ作動中 ${Math.ceil(z.trap.active)}` };
    if (z.trap.cd > 0) return { kind: 'info', text: `テスラトラップ冷却中 ${Math.ceil(z.trap.cd)}` };
    return { kind: 'trapOn', cost: 500, text: '[F] テスラトラップを起動（500）' };
  }
  return null;
}
function zqUse(P, n) {
  const z = G.zm, q = W.zq;
  switch (n.kind) {
    case 'power':
      z.power = true; R.amb = z.env0.amb.map(v => v * 1.7); R.sunCol = z.env0.sunCol.map(v => v * 1.5);
      popup('電源が復旧した — パークが使える', '#9fe0ff'); sfxBoom(3, 0, true); P.shake = 0.4;
      if (z.fuseIn >= 3) popup('改造台が起動した', '#d07aff');
      break;
    case 'fuse': n.f.got = true; z.fuses++; sfxBuy(); popup(`ヒューズを入手（所持 ${z.fuses}）`, '#ffd24a'); break;
    case 'gen':
      z.fuseIn += z.fuses; z.fuses = 0; sfxBeep();
      if (z.fuseIn >= 3) popup(z.power ? '改造台が起動した' : 'ヒューズ完了 — 電源を入れろ', '#d07aff'); else popup(`ヒューズ ${z.fuseIn}/3`, '#ffd24a');
      break;
    case 'part': n.pt.got = true; sfxCloth(); popup(`${ZPART_NAME[n.k]}の部品 ${zqPartCount(n.k)}/3`, '#9fd7ff'); break;
    case 'terminal': if (!z.codeShown) { z.codeShown = true; sfxBeep(); popup('暗号を入手：画面の色の順に信号灯を撃て', '#9fe0ff'); } break;
    case 'reward': {
      z.rewardTaken = true; zmGive(P, 'plasma'); const w = curW(P);
      w.up = true; w.dmgMul = 2; w.magMax = Math.round(w.magMax * 1.5); w.mag = w.magMax; w.res = w.d.res * 2; w.camo = CAMO_BY_ID.cyber;
      popup('プラズマピストル改 を入手', '#d07aff'); sfxUAV(); break;
    }
    case 'build': z.built[n.k] = true; sfxPump(); setTimeout(sfxBuy, 300); popup(`${ZPART_NAME[n.k]} 完成`, '#9fe0ff'); break;
    case 'takeShield': P.zshield = { hp: 12, max: 12 }; sfxCloth(); popup('バリアシールド装備（背後の攻撃を防ぐ）', '#9fd7ff'); break;
    case 'takeTrap': z.trapHeld = true; sfxCloth(); popup('[4] で足元に設置', '#9fd7ff'); break;
    case 'trapOn':
      if (z.points < 500) { sfxDeny(); popup('ポイントが足りない', '#ff6a5a'); return; }
      z.points -= 500; z.trap.active = 25; z.trap.zapT = 0; sfxPlasma(0); break;
  }
}
function zqPlaceTrap(P) {
  const z = G.zm; if (!z || !z.trapHeld) return;
  const f = [-Math.sin(P.yaw), 0, -Math.cos(P.yaw)], pos = [P.pos[0] + f[0] * 1.4, P.pos[1], P.pos[2] + f[2] * 1.4];
  if (!spaceFree(pos, 0.3, 0.6)) { sfxDeny(); popup('ここには置けない', '#ff6a5a'); return; }
  z.trapHeld = false; z.trap = { pos, active: 0, cd: 0, zapT: 0 }; sfxThud(); popup('テスラトラップ設置 — [F]で起動', '#9fd7ff');
}
// ---- color-code lamps (hitscan check from player shots) ----
function zqShot(eye, dir) {
  const z = G.zm, q = W.zq; if (!q || !z || !z.lampCol) return;
  let best = -1, bt = 1e9;
  q.lamps.forEach((l, i) => {
    const oc = V.sub(l.pos, eye), t = V.dot(oc, dir); if (t < 0) return;
    const c = V.add(eye, V.mul(dir, t)); if (V.dist(c, l.pos) > 0.55) return;
    const h = rayWorld(eye, dir, t); if (h && h.t < t - 0.5) return;
    if (t < bt) { bt = t; best = i; }
  });
  if (best < 0) return;
  impactFX(q.lamps[best].pos, V.mul(dir, -1), { c: ZCOLS[z.lampCol[best]].c });
  if (!z.power || !z.codeShown || z.codeDone) return;
  const col = z.lampCol[best];
  if (z.lampFlash[best] > 0) return;
  if (col === z.code[z.codeIdx]) {
    z.codeIdx++; z.lampFlash[best] = 1; sfxBeep();
    if (z.codeIdx >= 4) { z.codeDone = true; popup('暗号解除 — エントランスの台座を調べろ', '#d07aff'); sfxUAV(); }
  } else {
    z.codeIdx = 0; z.lampFlash = [0, 0, 0, 0]; sfxDeny(); popup('暗号が違う…ゾンビが押し寄せる', '#ff3a2a');
    for (let i = 0; i < 4; i++) zmSpawnOne();
  }
}
// ---- windows: zombie arrival / tearing / climbing; player repair ----
function zqPickWindow(P) {
  const ws = W.windows.filter(w => W.zones[w.zone]);
  if (!ws.length) return null;
  const far = ws.filter(w => { const d = Math.hypot(w.outside[0] - P.pos[0], w.outside[2] - P.pos[2]); return d > 5 && d < 48; });
  return pick(far.length ? far : ws);
}
// returns true if the zombie is handled by the window logic this frame
function zqWindowZombie(b, dt, P) {
  const w = b.win; if (!w) return false;
  const z = G.zm;
  if (b.wst === 'climb') {
    b.climbT += dt / 0.9; const t = Math.min(1, b.climbT);
    b.pos[0] = lerp(w.outside[0], w.inside[0], t); b.pos[2] = lerp(w.outside[2], w.inside[2], t); b.pos[1] = Math.sin(t * Math.PI) * 1.0 + (t > 0.3 && t < 0.7 ? 0.2 : 0);
    b.stance = t > 0.25 && t < 0.75 ? 'crouch' : 'stand';
    if (t >= 1) { b.win = null; b.wst = null; b.pos[1] = 0; b.vel = [0, 0, 0]; b.stance = 'stand'; }
    return true;
  }
  // tear
  b.yaw = Math.atan2(w.n[0], w.n[2]);
  const toOut = Math.hypot(w.outside[0] - b.pos[0], w.outside[2] - b.pos[2]);
  if (toOut > 0.25) { const s = Math.min(toOut, b.spd * dt); b.pos[0] += (w.outside[0] - b.pos[0]) / toOut * s; b.pos[2] += (w.outside[2] - b.pos[2]) / toOut * s; b.walkT += dt * b.spd * 2; return true; }
  if (w.boards > 0) {
    // player standing at the window gets swiped through the gaps
    const pd = Math.hypot(P.pos[0] - w.pos[0], P.pos[2] - w.pos[2]);
    b.tearT = (b.tearT ?? 0.8) - dt;
    if (pd < 1.9 && P.alive && b.atkT <= 0) { b.atkT = 1.4; b.swingT = G.time; setTimeout(() => { if (b.alive && Math.hypot(P.pos[0] - w.pos[0], P.pos[2] - w.pos[2]) < 2.0) zmHitPlayer(P, b, 30); }, 380); }
    if (b.tearT <= 0 && w.tearer !== b && w.tearer && w.tearer.alive && w.tearer.win === w) return true;
    if (b.tearT <= 0) { w.tearer = b; w.boards--; b.tearT = Math.max(0.45, 1.3 - z.round * 0.05); b.swingT = G.time; sfxThud(); for (let i = 0; i < 3; i++) G.parts.push({ pos: [w.pos[0] + rand(-0.5, 0.5), 1.2 + rand(0, 0.8), w.pos[2] + rand(-0.5, 0.5)], vel: [w.n[0] * 2 + rand(-1, 1), rand(1, 3), w.n[2] * 2 + rand(-1, 1)], col: [0.45, 0.33, 0.2], t: 0, life: 0.8, s: 0.08 }); }
    return true;
  }
  if (w.climbT < G.time) { w.climbT = G.time + 0.95; b.wst = 'climb'; b.climbT = 0; }
  return true;
}
function zqHold(P, held, dt) {
  const z = G.zm; if (!z || !z.parts) return;
  const n = held && P.alive ? zmNear() : null;
  if (!n || n.kind !== 'window') { z.repT = 0; return; }
  z.repT += dt;
  if (z.repT >= (zmHas('speed') ? 0.3 : 0.55)) {
    z.repT = 0; n.w.boards = Math.min(6, n.w.boards + 1); sfxThud();
    if (z.repairPts < 50 * Math.max(1, z.round)) { z.repairPts += 10; zmAddPoints(10); }
  }
}
function zmHitPlayer(P, b, dmg) {
  if (!P.alive || P.invulnT > G.time) return;
  if (P.zshield) {
    const fwd = [-Math.sin(P.yaw), -Math.cos(P.yaw)], to = [b.pos[0] - P.pos[0], b.pos[2] - P.pos[2]], l = Math.hypot(...to) || 1;
    const behind = (fwd[0] * to[0] + fwd[1] * to[1]) / l < -0.2;
    P.zshield.hp--; dmg = behind ? 0 : dmg * 0.6; sfxThud();
    if (P.zshield.hp <= 0) { P.zshield = null; G.zm.shieldCdRound = G.zm.round + 1; popup('シールドが壊れた', '#ff6a5a'); }
    if (!dmg) return;
  }
  P.hp -= dmg; P.lastDmgT = G.time; P.flinchP += 2; P.dmgDirs.push({ from: b.pos.slice(), t: G.time }); sfxHurt();
  if (P.hp <= 0) zmPlayerDown(P);
}
function zqUpdate(dt) {
  zwUpdateCorpses(dt);
  const z = G.zm; if (!z || !z.parts) return;
  for (let i = 0; i < 4; i++) if (z.lampFlash[i] > 0 && !z.codeDone) z.lampFlash[i] = Math.max(0.3, z.lampFlash[i] - dt);
  const t = z.trap;
  if (t) {
    if (t.active > 0) {
      t.active -= dt; t.zapT -= dt;
      if (t.zapT <= 0) {
        t.zapT = 0.3;
        let n = 0;
        for (const b of G.zombies) {
          if (!b.alive || b.rise < 1 || b.win || n >= 3) continue;
          if (Math.hypot(b.pos[0] - t.pos[0], b.pos[2] - t.pos[2]) > 4.5) continue;
          n++; G.tracers.push({ a: [t.pos[0], t.pos[1] + 0.9, t.pos[2]], b: [b.pos[0], b.pos[1] + 1.1, b.pos[2]], t: 0, life: 0.15, zap: 1 });
          zmOnDamage(b, b.hp + 10, null, null, 'explosive');
        }
        if (n) sfxPlasma(0.5);
      }
      if (t.active <= 0) { t.active = 0; t.cd = 30; }
    } else if (t.cd > 0) t.cd -= dt;
  }
}
// ---- world rendering of quest objects ----
function zqDraw(t) {
  const z = G.zm, q = W.zq; if (!q || !z || !z.parts) return;
  const wood = [0.47, 0.34, 0.2];
  for (const w of W.windows) {
    const alongX = !w.n[0], c = V.add(w.pos, V.mul(w.n, w.th / 2 - 0.06));
    for (let i = 0; i < w.boards; i++) {
      const y = 1.02 + i * 0.22, tilt = (i % 2 ? 0.06 : -0.05);
      box([c[0], y, c[2]], alongX ? [1.8, 0.17, 0.07] : [0.07, 0.17, 1.8], wood.map(v => v * (0.85 + (i % 3) * 0.08)), 0, tilt);
    }
  }
  const bob = Math.sin(t * 3) * 0.08;
  for (const f of z.fuseList) if (!f.got) { box([f.pos[0], f.pos[1] + bob, f.pos[2]], [0.12, 0.34, 0.12], [1, 0.8, 0.2], 0.85, t * 2); box([f.pos[0], f.pos[1] + 0.2 + bob, f.pos[2]], [0.16, 0.06, 0.16], [0.6, 0.6, 0.62], 0.3, t * 2); }
  for (const k in z.parts) for (const pt of z.parts[k]) if (!pt.got) {
    if (k === 'shield') box([pt.pos[0], pt.pos[1] + bob, pt.pos[2]], [0.5, 0.06, 0.38], [0.45, 0.6, 0.8], 0.5, t);
    else { box([pt.pos[0], pt.pos[1] + bob, pt.pos[2]], [0.2, 0.32, 0.2], [0.75, 0.45, 0.2], 0.5, t); box([pt.pos[0], pt.pos[1] + 0.2 + bob, pt.pos[2]], [0.26, 0.05, 0.26], [0.5, 0.8, 1], 0.9, t); }
  }
  // power switch
  const ps = q.power; box([ps[0], ps[1] + 0.2, ps[2] - 0.35], [0.12, 0.5, 0.12], z.power ? [0.2, 1, 0.3] : [1, 0.2, 0.15], 0.8, 0); box([ps[0], ps[1] + (z.power ? 0.45 : -0.05), ps[2] - 0.45], [0.08, 0.08, 0.25], [0.7, 0.7, 0.7]);
  // generator panel fuse lights
  for (let i = 0; i < 3; i++) box([q.gen[0] - 0.35, q.gen[1] + 0.3, q.gen[2] - 0.5 + i * 0.5], [0.05, 0.22, 0.22], i < z.fuseIn ? [1, 0.8, 0.2] : [0.15, 0.13, 0.1], i < z.fuseIn ? 1 : 0);
  // terminal screen with code
  const tm = q.terminal;
  box([tm[0], 1.38, tm[2] - 0.38], [1.2, 0.7, 0.06], z.power ? [0.1, 0.25, 0.3] : [0.05, 0.05, 0.06], z.power ? 0.6 : 0);
  if (z.power && z.codeShown) for (let i = 0; i < 4; i++) box([tm[0] - 0.39 + i * 0.26, 1.38, tm[2] - 0.31], [0.18, 0.18, 0.02], ZCOLS[z.code[i]].c, i < z.codeIdx ? 0.25 : 1);
  // signal lamps
  q.lamps.forEach((l, i) => { const c = ZCOLS[z.lampCol[i]].c, fl = z.lampFlash[i]; box(l.pos, [0.5, 0.5, 0.5], c, !z.power ? 0.08 : fl > 0 ? 0.6 + 0.4 * Math.sin(t * 20) : 0.75); box([l.pos[0], l.pos[1] + 0.33, l.pos[2]], [0.6, 0.1, 0.6], [0.2, 0.2, 0.22]); });
  // pedestal reward
  if (z.codeDone && !z.rewardTaken) { const p = q.pedestal; box([p[0], 1.25 + bob, p[2]], [0.55, 0.16, 0.1], [0.5, 0.3, 0.8], 0.8, t); box([p[0], 2.5, p[2]], [0.1, 3, 0.1], [0.8, 0.5, 1], 0.9, 0, 0.25); }
  // workbench items
  const bn = q.bench;
  box([bn[0] - 0.7, 1.0, bn[2]], [0.15, 0.08, 0.5], [0.3, 0.3, 0.32]); box([bn[0] + 0.3, 1.0, bn[2] + 0.1], [0.4, 0.1, 0.25], [0.6, 0.15, 0.1]);
  if (z.built.shield && !G.player.zshield && z.round >= z.shieldCdRound) box([bn[0] - 0.3, 1.3, bn[2] - 0.35], [0.8, 0.6, 0.06], [0.45, 0.6, 0.8], 0.3);
  if (z.built.trap && !z.trapHeld && !z.trap) { box([bn[0] + 0.7, 1.1, bn[2]], [0.3, 0.2, 0.3], [0.3, 0.3, 0.33]); box([bn[0] + 0.7, 1.35, bn[2]], [0.14, 0.3, 0.14], [0.75, 0.45, 0.2], 0.4); }
  // placed trap
  if (z.trap) {
    const p = z.trap.pos, on = z.trap.active > 0;
    box([p[0], p[1] + 0.1, p[2]], [0.6, 0.2, 0.6], [0.3, 0.3, 0.33]); box([p[0], p[1] + 0.5, p[2]], [0.22, 0.6, 0.22], [0.75, 0.45, 0.2], on ? 0.6 : 0.1);
    box([p[0], p[1] + 0.9, p[2]], [0.34, 0.12, 0.34], on ? [0.5, 0.8, 1] : [0.3, 0.35, 0.4], on ? 0.7 + 0.3 * Math.sin(t * 30) : 0.1, t * 3);
  }
}
// ---- HUD objectives panel ----
function zqHUD(c, p, Wd, H) {
  const z = G.zm; if (!z || !z.parts) return;
  const x = Wd - 30; let y = H - 400;
  const line = (s, col) => { txt(c, keyify(s), x, y, 13, col || '#ddd', 'right', 600); y += 19; };
  line(z.power ? '電源：ON' : '電源：OFF（管制室）', z.power ? '#9fe0ff' : '#ff8a6a');
  line(z.fuseIn >= 3 ? 'ヒューズ：完了' : `ヒューズ：差込 ${z.fuseIn}/3${z.fuses ? `　所持 ${z.fuses}` : ''}`, z.fuseIn >= 3 ? '#d07aff' : '#ffd24a');
  for (const k of ['shield', 'trap']) line(z.built[k] ? `${ZPART_NAME[k]}：完成` : `${ZPART_NAME[k]}：部品 ${zqPartCount(k)}/3`, z.built[k] ? '#9fd7ff' : '#cfcac0');
  if (z.codeShown && !z.codeDone) {
    txt(c, '暗号', x - 4 * 22 - 6, y, 13, '#ddd', 'right', 600);
    for (let i = 0; i < 4; i++) { c.fillStyle = ZCOLS[z.code[i]].css; c.globalAlpha = i < z.codeIdx ? 0.3 : 1; c.fillRect(x - (4 - i) * 22, y - 12, 18, 14); }
    c.globalAlpha = 1; y += 19;
  } else if (z.codeDone) line(z.rewardTaken ? '暗号：解除済み' : '暗号：解除 — 台座へ', '#d07aff');
  if (p.zshield) { line(`シールド ${p.zshield.hp}/${p.zshield.max}`, '#9fd7ff'); c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(x - 120, y - 12, 120, 5); c.fillStyle = '#9fd7ff'; c.fillRect(x - 120, y - 12, 120 * p.zshield.hp / p.zshield.max, 5); y += 8; }
  if (z.trapHeld) line('[4] テスラトラップを設置', '#9fe0ff');
}
// ============================================================
//  ZOMBIES: mystery-box prototype weapons (original designs)
// ============================================================
function zwTargets(eye) { return G.zombies.filter(b => b.alive && b.rise >= 1); }
function zwChest(b) { return [b.pos[0], b.pos[1] + 1.15, b.pos[2]]; }
function zwKill(b, p, d, fling) {
  zmOnDamage(b, b.hp + 1, p, d, 'upper');
  if (fling) b.fling = fling;
  for (let i = 0; i < 5; i++) G.parts.push({ pos: zwChest(b), vel: [rand(-2, 2), rand(0, 3), rand(-2, 2)], life: 0.4, t: 0, size: 0.06, col: d.special === 'arc' ? [0.5, 0.85, 1] : [0.75, 0.5, 1], emis: 1, g: 4 });
}
function zwFire(p, w, f) {
  const d = w.d, eye = eyePos(p), mz = V.add(eye, V.add(V.mul(f, 0.7), [0, -0.06 * (1 - p.ads), 0]));
  if (d.special === 'arc') {
    sfxPlasma(0); sfxBeep(220, 0.15);
    // first target: closest zombie near the aim line
    let first = null, ft = 1e9;
    for (const b of zwTargets()) {
      const c = zwChest(b), oc = V.sub(c, eye), t = V.dot(oc, f); if (t < 0.5 || t > 45) continue;
      const off = V.dist(V.add(eye, V.mul(f, t)), c); if (off > 0.9 + t * 0.03) continue;
      if (!losClear(eye, c)) continue;
      if (t < ft) { ft = t; first = b; }
    }
    if (!first) { const h = rayWorld(eye, f, 45); const end = h ? V.add(eye, V.mul(f, h.t)) : V.add(eye, V.mul(f, 45)); G.tracers.push({ a: mz, b: end, t: 0, life: 0.2, zap: 1 }); if (h) impactFX(end, h.n, { c: [0.5, 0.85, 1] }); return; }
    const hit = new Set([first]); let cur = first, from = mz; const N = w.up ? 10 : 5;
    for (let i = 0; i < N && cur; i++) {
      G.tracers.push({ a: from, b: zwChest(cur), t: 0, life: 0.25, zap: 1 }); G.tracers.push({ a: from, b: V.add(zwChest(cur), [rand(-0.3, 0.3), rand(-0.3, 0.3), rand(-0.3, 0.3)]), t: 0, life: 0.18, zap: 1 });
      zwKill(cur, p, d); from = zwChest(cur);
      let nx = null, nd = w.up ? 11 : 8;
      for (const b of zwTargets()) { if (hit.has(b)) continue; const dd = V.dist(zwChest(b), from); if (dd < nd && losClear(from, zwChest(b))) { nd = dd; nx = b; } }
      if (nx) hit.add(nx); cur = nx;
    }
    return;
  }
  if (d.special === 'grav') {
    sfxBoom(0, 0, true); p.shake = Math.max(p.shake || 0, 0.6);
    const R = w.up ? 22 : 17, max = w.up ? 24 : 14, cand = [];
    for (const b of zwTargets()) {
      const c = zwChest(b), v = V.sub(c, eye), L = V.len(v); if (L > R) continue;
      const cos = V.dot(v, f) / (L || 1);
      if (!(cos > 0.9 || (L < 3.5 && cos > 0.45))) continue;
      if (!losClear(eye, c) && !losClear(eye, V.add(c, [0, 0.5, 0]))) continue;
      cand.push([L, b, v]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    for (const [L, b, v] of cand.slice(0, max)) { const dn = V.norm([v[0], 0, v[2]]), k = rand(13, 19) * (1 - L / (R * 1.6)); zwKill(b, p, d, [dn[0] * k, rand(5, 8), dn[2] * k]); }
    // distortion wave particles
    for (let i = 0; i < 40; i++) { const sp = coneDir(f, 22 * DEG), s = rand(14, 26); G.parts.push({ pos: V.add(mz, V.mul(sp, rand(0, 1))), vel: V.mul(sp, s), life: rand(0.35, 0.6), t: 0, size: rand(0.08, 0.2), col: [0.75, 0.6, 1], emis: 0.8, g: 0 }); }
    for (let i = 0; i < 6; i++) G.parts.push({ pos: V.add(mz, V.mul(f, 0.5 + i * 0.7)), vel: V.mul(f, 18), life: 0.35, t: 0, size: 0.6 + i * 0.25, col: [0.6, 0.5, 0.9], g: 0, smoke: 1 });
  }
}
function zwUpdateCorpses(dt) {
  for (const b of G.zombies) if (!b.alive && b.fling) {
    b.pos[0] += b.fling[0] * dt; b.pos[1] += b.fling[1] * dt; b.pos[2] += b.fling[2] * dt; b.fling[1] -= 22 * dt;
    b.fling[0] *= 1 - dt * 0.6; b.fling[2] *= 1 - dt * 0.6;
    if (b.pos[1] <= 0) { b.pos[1] = 0; b.fling = null; }
  }
}
