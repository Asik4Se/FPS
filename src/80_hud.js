// ============================================================
//  HUD (2D canvas overlay)
// ============================================================
let HC = null;
const curSpread = p => hipSpread(p, curW(p));
function txt(c, s, x, y, size, col, align, font, shadow) {
  c.font = `${font || 600} ${size}px Oswald, "Noto Sans JP", sans-serif`; c.textAlign = align || 'left'; c.textBaseline = 'alphabetic';
  if (shadow !== false) { c.fillStyle = 'rgba(0,0,0,.65)'; c.fillText(s, x + 1.5, y + 1.5); }
  c.fillStyle = col || '#fff'; c.fillText(s, x, y);
}
function fmtTime(t) { t = Math.max(0, Math.ceil(t)); return `${(t / 60) | 0}:${String(t % 60).padStart(2, '0')}`; }
let _nameT = 0, _nameEnt = null;
function drawHUD(dt) {
  const cv = document.getElementById('hud');
  if (!HC) HC = cv.getContext('2d');
  const c = HC, s = R.hudScale, Wd = STAGE_W, H = STAGE_H, cx = Wd / 2, cy = H / 2;
  c.setTransform(s, 0, 0, s, 0, 0); c.clearRect(0, 0, Wd, H);
  if (!G.running) return;
  const p = G.player, w = curW(p), d = w.d, t = G.time;
  if (p.alive) {
    const sn = d.cls === 'sniper', opt = optic(w);
    // ---- scope / ACOG transition darkening ----
    if (opt === 'scope' && p.ads > 0.55 && p.ads < SCOPE_AT) {
      const k = smooth(clamp((p.ads - 0.55) / (SCOPE_AT - 0.55), 0, 1));
      const g = c.createRadialGradient(cx, cy, Math.min(Wd, H) * 0.47 * (1.6 - k * 1.1), cx, cy, Math.max(Wd, H) * (1.1 - k * 0.45));
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.35 + k * 0.65})`);
      c.fillStyle = g; c.fillRect(0, 0, Wd, H);
      c.fillStyle = `rgba(0,0,0,${k * k * 0.85})`; c.fillRect(0, 0, Wd, H);
    }
    if (isScoped(p)) drawScope(c, p, Wd, H);
    if (opt === 'acog' && p.ads > 0.85) drawAcogReticle(c, p, Wd, H, (p.ads - 0.85) / 0.15);
    // ---- crosshair ----
    const showX = !p.sprint && p.ads < 0.4 && p.swapT <= 0 && !p.mantle && p.meleeT <= 0;
    if (showX) {
      const sp = curSpread(p), gap = Math.tan(sp * DEG) / Math.tan(p.fov * DEG / 2) * (H / 2) + 3, a = 1 - p.ads / 0.45;
      c.lineWidth = 2; c.lineCap = 'butt';
      const L = sn ? 10 : 9;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        c.strokeStyle = `rgba(0,0,0,${0.5 * a})`; c.beginPath(); c.moveTo(cx + dx * gap + 1, cy + dy * gap + 1); c.lineTo(cx + dx * (gap + L) + 1, cy + dy * (gap + L) + 1); c.stroke();
        c.strokeStyle = `rgba(255,255,255,${0.9 * a})`; c.beginPath(); c.moveTo(cx + dx * gap, cy + dy * gap); c.lineTo(cx + dx * (gap + L), cy + dy * (gap + L)); c.stroke();
      }
    }
    // red dot for reflex
    if (opt === 'dot' && p.ads > 0.8) { const a = clamp((p.ads - 0.8) / 0.2, 0, 1); c.fillStyle = `rgba(255,40,25,${a})`; c.beginPath(); c.arc(cx, cy, 2.4, 0, 7); c.fill(); c.fillStyle = `rgba(255,60,40,${a * 0.25})`; c.beginPath(); c.arc(cx, cy, 5, 0, 7); c.fill(); }
    // ---- hitmarker ----
    const ht = t - p.hitT;
    if (ht < 0.28) {
      const a = 1 - ht / 0.28; c.lineWidth = 2; c.strokeStyle = `rgba(255,255,255,${a})`;
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { c.beginPath(); c.moveTo(cx + dx * 6, cy + dy * 6); c.lineTo(cx + dx * 14, cy + dy * 14); c.stroke(); }
    }
    // ---- enemy name under crosshair ----
    _nameT -= dt;
    if (_nameT <= 0) { _nameT = 0.08; _nameEnt = null; const o = eyePos(p), f = fwdVec(p.camYaw, p.camPitch), wh = rayWorld(o, f, 160); let best = wh ? wh.t : 160; for (const b of G.bots) { if (!b.alive) continue; const r = rayBot(b, o, f, best); if (r) { best = r.t; _nameEnt = b; } } }
    if (_nameEnt && _nameEnt.alive) txt(c, _nameEnt.name, cx, isScoped(p) ? cy + 60 : p.ads > 0.5 ? cy - 34 : cy + 42, 14, '#ff4a3a', 'center', 600);
    // ---- interaction hints ----
    if (w.mag === 0 && w.res > 0 && w.reloadT <= 0) txt(c, `[${K('reload')}] リロード`, cx, cy + 80, 15, '#fff', 'center');
    else if (w.mag <= Math.ceil(w.magMax * 0.25) && w.reloadT <= 0 && !d.bolt && w.mag > 0) txt(c, '弾薬残りわずか', cx, cy + 80, 14, '#ffcf5a', 'center');
    if (w.mag === 0 && w.res === 0) txt(c, '弾切れ', cx, cy + 80, 15, '#ff5a4a', 'center');
    if (isScoped(p) && p.exhaustT > 0) txt(c, '息切れ', cx, cy + 100, 13, 'rgba(255,255,255,.6)', 'center', 400);
  }
  // ---- damage direction indicators ----
  p.dmgDirs = p.dmgDirs.filter(q => t - q.t < 1.6);
  for (const q of p.dmgDirs) {
    const rel = angDiff(p.camYaw, Math.atan2(-(q.from[0] - p.pos[0]), -(q.from[2] - p.pos[2])));
    const th = -rel, a = 1 - (t - q.t) / 1.6, Rr = Math.min(Wd, H) * 0.2;
    c.strokeStyle = `rgba(220,30,20,${a * 0.9})`; c.lineWidth = 10;
    c.beginPath(); c.arc(cx, cy, Rr, th - Math.PI / 2 - 0.22, th - Math.PI / 2 + 0.22); c.stroke();
  }
  // ---- low health ----
  if (p.alive && p.hp < 100) {
    const k = (1 - p.hp / 100);
    const g = c.createRadialGradient(cx, cy, Math.min(Wd, H) * 0.25, cx, cy, Math.max(Wd, H) * 0.7);
    g.addColorStop(0, 'rgba(120,0,0,0)'); g.addColorStop(1, `rgba(140,0,0,${k * (0.7 + 0.15 * Math.sin(t * 6))})`);
    c.fillStyle = g; c.fillRect(0, 0, Wd, H);
  }
  drawMinimap(c, p);
  // ---- score / timer (bottom-left) ----
  const bl = H - 26;
  drawModeHUD(c, p, Wd, H, bl);
  // ---- killfeed ----
  let ky = H - 120;
  for (let i = G.killfeed.length - 1; i >= 0; i--) {
    const k = G.killfeed[i], age = t - k.t; if (age > 6) continue;
    const a = clamp(6 - age, 0, 1);
    c.globalAlpha = a;
    c.font = '600 13px Oswald, "Noto Sans JP", sans-serif';
    let x = 24;
    const seg = (s, col) => { c.fillStyle = 'rgba(0,0,0,.6)'; c.fillText(s, x + 1, ky + 1); c.fillStyle = col; c.fillText(s, x, ky); x += c.measureText(s).width + 6; };
    c.textAlign = 'left';
    if (k.k) seg(k.k, k.kp ? '#ffcf5a' : '#e8e2d6');
    seg(`[${k.w}${k.hs ? ' ◎' : ''}]`, '#9a978f');
    seg(k.v, k.vp ? '#ffcf5a' : '#ff6a5a');
    c.globalAlpha = 1; ky -= 18;
  }
  // ---- ammo (bottom-right) ----
  const br = Wd - 28;
  if (p.alive) {
    txt(c, d.name + (w.shellMode ? '  装填中' : ''), br, H - 78, 14, '#cfcac0', 'right', 600);
    c.font = '700 40px Oswald, sans-serif'; const rw = String(w.res).length * 11 + 14;
    txt(c, String(w.mag), br - rw - 6, H - 30, 40, w.mag === 0 ? '#ff5a4a' : '#fff', 'right', 700);
    txt(c, String(w.res), br, H - 32, 18, '#cfcac0', 'right', 600);
    // magazine pips
    const pipW = Math.max(1, Math.min(8, 180 / w.magMax - 2));
    for (let i = 0; i < w.magMax; i++) { c.fillStyle = i < w.mag ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.18)'; c.fillRect(br - (i + 1) * (pipW + 2), H - 22, pipW, 6); }
    let ey = H - 98;
    if (w.att.size) { txt(c, [...w.att].map(k => ATT[k].name).join(' / '), br, ey, 10, '#8a877f', 'right', 400); ey -= 18; }
    const lt = G.mode === 'zombies' ? 'frag' : ACTIVE.lethal, tt = ACTIVE.tactical;
    if (lt !== 'none' && G.mode !== 'gun' && !G.online) { txt(c, `${LETHALS[lt].name} ×${p.lethals}  [${K('lethal')}]`, br, ey, 12, p.lethals ? '#e8e2d6' : '#666', 'right', 400); ey -= 16; }
    if (tt !== 'none' && G.mode !== 'gun' && G.mode !== 'zombies' && !G.online) { txt(c, `${TACTICALS[tt].name} ×${p.tacticals}  [${K('tactical')}]`, br, ey, 12, p.tacticals ? '#e8e2d6' : '#666', 'right', 400); ey -= 16; }
    if (!['zombies', 'gun', 'range'].includes(G.mode) && !G.online) drawStreakBar(c, p, br, ey - 6);
    if (w.reloadT > 0) { const k = 1 - w.reloadT / w.reloadTot; c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(cx - 60, cy + 54, 120, 4); c.fillStyle = '#fff'; c.fillRect(cx - 60, cy + 54, 120 * k, 4); }
  }
  // ---- grenade indicators ----
  if (p.alive) for (const pr of G.projs) {
    if (!['frag', 'semtex', 'gl', 'c4'].includes(pr.type) || (pr.owner === p && pr.type === 'c4')) continue;
    const d = V.dist(pr.pos, p.pos); if (d > (hasPerk('flak') ? 14 : 8)) continue;
    const rel = angDiff(p.camYaw, Math.atan2(-(pr.pos[0] - p.pos[0]), -(pr.pos[2] - p.pos[2]))), th = -rel - Math.PI / 2, R0 = 70;
    const gx = cx + Math.cos(th) * R0, gy = cy + Math.sin(th) * R0;
    c.fillStyle = 'rgba(0,0,0,.5)'; c.beginPath(); c.arc(gx, gy, 13, 0, 7); c.fill();
    c.fillStyle = Math.sin(t * 16) > 0 ? '#ff4a3a' : '#ffcf5a'; c.beginPath(); c.arc(gx, gy + 2, 6, 0, 7); c.fill(); c.fillRect(gx - 2, gy - 8, 4, 5);
    c.beginPath(); c.moveTo(cx + Math.cos(th) * (R0 + 18), cy + Math.sin(th) * (R0 + 18)); c.lineTo(cx + Math.cos(th + 0.12) * (R0 + 10), cy + Math.sin(th + 0.12) * (R0 + 10)); c.lineTo(cx + Math.cos(th - 0.12) * (R0 + 10), cy + Math.sin(th - 0.12) * (R0 + 10)); c.fill();
  }
  if (p.cookT) txt(c, `クッキング ${(3 - p.cookT).toFixed(1)}`, cx, cy + 74, 14, p.cookT > 2 ? '#ff4a3a' : '#ffcf5a', 'center');
  // friendly names
  if (isTeamMode() && R.VP) for (const b of G.bots) {
    if (!b.alive || b.team !== p.team) continue;
    const sp = project([b.pos[0], b.pos[1] + 2.05, b.pos[2]]); if (!sp) continue;
    const dd = V.dist(b.pos, p.pos); if (dd > 70) continue;
    txt(c, b.name, sp[0], sp[1], 11, TEAMC.A, 'center', 600);
  }
  // objective markers
  if (G.mode === 'dom' && R.VP) for (const f of G.flags) { const sp = project([f.pos[0], 3.6, f.pos[2]]); if (!sp) continue; const col = f.owner ? (f.owner === p.team ? TEAMC.A : TEAMC.B) : '#ddd'; c.strokeStyle = col; c.lineWidth = 2; c.strokeRect(sp[0] - 11, sp[1] - 11, 22, 22); txt(c, f.name, sp[0], sp[1] + 6, 15, col, 'center', 700); txt(c, `${V.dist(f.pos, p.pos) | 0}m`, sp[0], sp[1] + 24, 10, '#ccc', 'center', 400); }
  if (G.mode === 'kc' && R.VP) for (const tg of G.tags) { if (V.dist(tg.pos, p.pos) > 40) continue; const sp = project([tg.pos[0], tg.pos[1] + 0.5, tg.pos[2]]); if (!sp) continue; c.fillStyle = tg.team === p.team ? TEAMC.A : '#ffcf5a'; c.beginPath(); c.moveTo(sp[0], sp[1] - 7); c.lineTo(sp[0] + 6, sp[1]); c.lineTo(sp[0], sp[1] + 7); c.lineTo(sp[0] - 6, sp[1]); c.fill(); }
  if (G.mode === 'zombies' && R.VP && G.zm) for (const pw of G.zm.pows) { const sp = project([pw.pos[0], pw.pos[1] + 0.6, pw.pos[2]]); if (sp && V.dist(pw.pos, p.pos) < 25) txt(c, ZPOW[pw.type].name, sp[0], sp[1], 12, '#ffd24a', 'center', 700); }
  // flash / stun overlays
  if (p.flashT > 0) { const k = clamp(p.flashT / Math.max(0.5, p.flashMax || 1) * 1.6, 0, 1); c.fillStyle = `rgba(255,255,255,${k})`; c.fillRect(0, 0, Wd, H); }
  if (p.stunT > 0) { c.fillStyle = `rgba(120,140,170,${Math.min(0.35, p.stunT * 0.12)})`; c.fillRect(0, 0, Wd, H); }
  if (G.enemyUavT > 0 && G.cuavT <= 0) txt(c, '敵のUAVが上空にいる', cx, 34, 14, '#ff6a5a', 'center', 600);
  // ---- popups ----
  let py = cy + 120;
  for (let i = G.popups.length - 1; i >= 0; i--) {
    const q = G.popups[i], age = t - q.t; if (age > 2) continue;
    c.globalAlpha = clamp((2 - age) * 2, 0, 1);
    const sz = age < 0.12 ? 22 - age * 40 : 17;
    txt(c, keyify(q.text), cx, py, sz, q.col, 'center', 700); py += 22; c.globalAlpha = 1;
  }
  // ---- death ----
  if (!p.alive && !G.over) {
    c.fillStyle = `rgba(60,0,0,${0.35 * p.deathCam})`; c.fillRect(0, 0, Wd, H);
    txt(c, '倒された', cx, cy - 40, 36, '#fff', 'center', 700);
    if (p.killer) txt(c, `${p.killer.name}${p.killer.wpn ? '  (' + p.killer.wpn + ')' : ''}`, cx, cy - 8, 18, '#ff6a5a', 'center');
    txt(c, `リスポーンまで ${Math.max(0, p.respawnT).toFixed(1)}`, cx, cy + 24, 14, '#cfcac0', 'center', 400);
  }
  // ---- range stats ----
  if (G.mode === 'range' && G.stats) drawRangePanel(c, Wd);
  if (SET.fps) txt(c, `${G.fps | 0} FPS`, Wd - 16, 20, 12, '#9a978f', 'right', 400);
}
function drawScope(c, p, Wd, H) {
  const cx = Wd / 2, cy = H / 2, r = Math.min(Wd, H) * 0.46;
  // parallax: scope ring lags slightly with movement / bolt
  const hv = Math.hypot(p.vel[0], p.vel[2]);
  const ox = Math.sin(p.bobT) * 6 * Math.min(1, hv / 3), oy = Math.abs(Math.cos(p.bobT)) * 5 * Math.min(1, hv / 3) + p.boltKick * 22;
  const sx = cx + ox, sy = cy + oy;
  c.fillStyle = '#000';
  c.beginPath(); c.rect(0, 0, Wd, H); c.arc(sx, sy, r, 0, Math.PI * 2, true); c.fill();
  // lens edge shading
  const g = c.createRadialGradient(sx, sy, r * 0.78, sx, sy, r);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.85, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,.95)');
  c.fillStyle = g; c.beginPath(); c.arc(sx, sy, r, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(30,50,70,.06)'; c.beginPath(); c.arc(sx, sy, r, 0, Math.PI * 2); c.fill();
  // reticle (fixed at screen center = point of impact)
  c.strokeStyle = 'rgba(0,0,0,.92)'; c.fillStyle = 'rgba(0,0,0,.92)';
  c.lineWidth = 1.3;
  c.beginPath(); c.moveTo(sx - r, cy); c.lineTo(sx + r, cy); c.moveTo(cx, sy - r); c.lineTo(cx, sy + r); c.stroke();
  const post = 6, inner = r * 0.36;
  c.fillRect(sx - r, cy - post / 2, r - inner, post); c.fillRect(cx + inner, cy - post / 2, sx + r - cx - inner, post);
  c.fillRect(cx - post / 2, cy + inner, post, sy + r - cy - inner);
  // small mil ticks
  for (let i = 1; i <= 4; i++) { const k = inner * i / 5; c.fillRect(cx + k - 0.6, cy - 4, 1.2, 8); c.fillRect(cx - k - 0.6, cy - 4, 1.2, 8); c.fillRect(cx - 4, cy + k - 0.6, 8, 1.2); }
  // zoom level
  const w = curW(p);
  if (w.att.has('vz')) txt(c, ['×3', '×5', '×10'][p.zoomLv], sx + r * 0.62, sy + r * 0.75, 13, 'rgba(255,255,255,.55)', 'center', 400, false);
  // breath vignette when holding
  if (p.holding) { c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(0, 0, Wd, H); }
}
function drawAcogReticle(c, p, Wd, H, a) {
  const cx = Wd / 2, cy = H / 2;
  c.globalAlpha = clamp(a, 0, 1);
  c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 4; c.beginPath(); c.moveTo(cx - 10, cy + 10); c.lineTo(cx, cy); c.lineTo(cx + 10, cy + 10); c.stroke();
  c.strokeStyle = '#ff9a1a'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(cx - 10, cy + 10); c.lineTo(cx, cy); c.lineTo(cx + 10, cy + 10); c.stroke();
  c.strokeStyle = 'rgba(20,20,20,.75)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(cx, cy + 15); c.lineTo(cx, cy + 70); c.stroke();
  for (let i = 1; i <= 3; i++) { c.beginPath(); c.moveTo(cx - 4, cy + 15 + i * 16); c.lineTo(cx + 4, cy + 15 + i * 16); c.stroke(); }
  c.globalAlpha = 1;
}
function drawAcog(c, p, Wd, H) {
  const cx = Wd / 2, cy = H / 2, r = Math.min(Wd, H) * 0.34;
  const hv = Math.hypot(p.vel[0], p.vel[2]);
  const sx = cx + Math.sin(p.bobT) * 5 * Math.min(1, hv / 3), sy = cy + Math.abs(Math.cos(p.bobT)) * 4 * Math.min(1, hv / 3) + p.boltKick * 18;
  c.fillStyle = 'rgba(12,12,13,.96)'; c.beginPath(); c.rect(0, 0, Wd, H); c.arc(sx, sy, r, 0, Math.PI * 2, true); c.fill();
  const g = c.createRadialGradient(sx, sy, r * 0.7, sx, sy, r);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.85)');
  c.fillStyle = g; c.beginPath(); c.arc(sx, sy, r, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(60,45,10,.07)'; c.beginPath(); c.arc(sx, sy, r, 0, Math.PI * 2); c.fill();
  // chevron reticle (illuminated)
  c.strokeStyle = '#ff9a1a'; c.lineWidth = 2.2; c.lineJoin = 'miter';
  c.beginPath(); c.moveTo(cx - 9, cy + 9); c.lineTo(cx, cy); c.lineTo(cx + 9, cy + 9); c.stroke();
  c.strokeStyle = 'rgba(0,0,0,.85)'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(cx, cy + 14); c.lineTo(cx, sy + r); c.stroke();
  for (let i = 1; i <= 3; i++) { c.beginPath(); c.moveTo(cx - 5, cy + 14 + i * 22); c.lineTo(cx + 5, cy + 14 + i * 22); c.stroke(); }
}
function drawMinimap(c, p) {
  const S = 180, x0 = 20, y0 = 20, cx = x0 + S / 2, cy = y0 + S / 2, pxPerM = S / 2 / 42, k = pxPerM / W.mapScale;
  c.save();
  c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(x0 - 3, y0 - 3, S + 6, S + 6);
  c.beginPath(); c.rect(x0, y0, S, S); c.clip();
  c.translate(cx, cy); c.rotate(p.camYaw); c.scale(k, k);
  c.translate(-(p.pos[0] - W.minX) * W.mapScale, -(p.pos[2] - W.minZ) * W.mapScale);
  c.globalAlpha = 0.85; c.drawImage(W.mapCanvas, 0, 0); c.globalAlpha = 1;
  // allies / enemies
  const uav = G.uavT > 0 || G.vsatT > 0, ms = W.mapScale;
  const dotAt = (x, z, col, r) => { c.fillStyle = col; c.beginPath(); c.arc((x - W.minX) * ms, (z - W.minZ) * ms, r / k, 0, 7); c.fill(); };
  for (const b of G.bots) {
    if (!b.alive) continue;
    if (b.team && b.team === p.team) { dotAt(b.pos[0], b.pos[2], TEAMC.A, 3.2); continue; }
    const fired = G.time - b.firedT < 1.6 && !b.firedSup, sensed = G.sensors.some(sn => sn.owner === p && V.dist(sn.pos, b.pos) < 15);
    const show = uav || fired || sensed || G.mode === 'range';
    if (!show) continue;
    const a = uav || sensed ? 1 : fired ? 1 - (G.time - b.firedT) / 1.6 : 0.8;
    dotAt(b.pos[0], b.pos[2], `rgba(235,50,40,${a})`, 3.2);
    if (G.vsatT > 0) { c.strokeStyle = 'rgba(235,50,40,.9)'; c.lineWidth = 1.5 / k; const x = (b.pos[0] - W.minX) * ms, z = (b.pos[2] - W.minZ) * ms; c.beginPath(); c.moveTo(x, z); c.lineTo(x - Math.sin(b.yaw) * 8 / k, z - Math.cos(b.yaw) * 8 / k); c.stroke(); }
  }
  if (G.mode === 'zombies') for (const b of G.zombies) if (b.alive && V.dist(b.pos, p.pos) < 14) dotAt(b.pos[0], b.pos[2], 'rgba(235,50,40,.8)', 2.6);
  for (const f of G.flags) { const col = f.owner ? (f.owner === p.team ? TEAMC.A : TEAMC.B) : '#ddd'; c.fillStyle = col; c.font = `700 ${14 / k}px Oswald`; c.textAlign = 'center'; c.save(); c.translate((f.pos[0] - W.minX) * ms, (f.pos[2] - W.minZ) * ms); c.rotate(-p.camYaw); c.fillText(f.name, 0, 5 / k); c.restore(); }
  for (const s2 of G.sentries) dotAt(s2.pos[0], s2.pos[2], s2.owner === p ? '#9fd7ff' : 'rgba(235,50,40,.9)', 2.4);
  for (const dr of G.drones) dotAt(dr.pos[0], dr.pos[2], isEnemy(p, dr.owner) ? '#ff8a3a' : '#9fd7ff', 2.2);
  c.restore();
  // player arrow + view cone
  c.fillStyle = 'rgba(255,255,255,.08)'; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, S * 0.6, -Math.PI / 2 - p.fov * DEG / 2, -Math.PI / 2 + p.fov * DEG / 2); c.fill();
  c.fillStyle = '#ffcf5a'; c.beginPath(); c.moveTo(cx, cy - 7); c.lineTo(cx + 5, cy + 5); c.lineTo(cx, cy + 2); c.lineTo(cx - 5, cy + 5); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.15)'; c.lineWidth = 1; c.strokeRect(x0, y0, S, S);
  let ly = y0 + S + 16;
  for (const [k2, n] of [['uavT', 'UAV'], ['vsatT', 'アドバンスドUAV'], ['cuavT', 'カウンターUAV']]) if (G[k2] > 0) { txt(c, `${n} ${Math.ceil(G[k2])}`, x0 + 4, ly, 12, '#9fd7ff', 'left', 600); ly += 16; }
}
function drawRangePanel(c, Wd) {
  const s = G.stats, x = Wd - 290, y = 20;
  c.fillStyle = 'rgba(10,12,15,.72)'; c.fillRect(x, y, 270, 176);
  txt(c, '射撃場データ', x + 14, y + 24, 15, '#f2a516', 'left', 700, false);
  const acc = s.shots ? (s.hits / s.shots * 100).toFixed(0) : '-';
  const lines = [`キル ${G.player.kills}   命中率 ${acc}% (${s.hits}/${s.shots})`];
  const h = G.lastHitInfo;
  if (h) lines.push(`最後の命中: ${ZONE_JP[h.zone] || h.zone} ${h.dmg.toFixed(1)}ダメ / ${h.dist.toFixed(0)}m${h.pen ? ' 壁抜き' : ''}  ${h.kill ? '→ キル' : '→ 生存'}`);
  const la = s.lastAds;
  if (la) {
    lines.push(la.scoped ? `発砲: スコープ表示後 (ADS開始から ${(la.qs * 1000).toFixed(0)}ms)` : `発砲: スコープ前 (ADS ${(la.ads * 100).toFixed(0)}%) → 腰撃ち拡散`);
  }
  const w = curW(G.player).d;
  if (w.cls === 'sniper') lines.push(`${w.name}: ADS ${Math.round(w.ads * 1000)}ms / 解除→射撃 ${Math.round(w.sprintOut * 1000)}ms`);
  lines.push('Shift長押し(スコープ中)で息止め');
  let ly = y + 50;
  for (const l of lines) { txt(c, l, x + 14, ly, 12, '#e8e2d6', 'left', 400, false); ly += 22; }
}
// ---------- scoreboard (DOM) ----------
function renderBoard(el) {
  const rows = G.ents.slice().sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  el.innerHTML = `<div class="f-oswald" style="font-size:18px;margin-bottom:8px">${G.mode === 'range' ? '射撃場' : MODES[G.mode].name + ' — ' + G.scoreLimit + 'キル' + (G.online ? '（オンライン）' : '')} <span style="float:right;color:var(--acc)">${fmtTime(G.timeLeft)}</span></div>
  <table><tr><th>#</th><th>プレイヤー</th><th>スコア</th><th>キル</th><th>デス</th><th>K/D</th></tr>${rows.map((e, i) => `<tr class="${e.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td>${esc(e.name)}</td><td>${e.score}</td><td>${e.kills}</td><td>${e.deaths}</td><td>${(e.kills / Math.max(1, e.deaths)).toFixed(2)}</td></tr>`).join('')}</table>`;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function project(p) {
  const m = R.VP; if (!m) return null;
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  if (w < 0.1) return null;
  const sx = (x / w * 0.5 + 0.5) * STAGE_W, sy = (1 - (y / w * 0.5 + 0.5)) * STAGE_H;
  if (sx < -50 || sy < -50 || sx > STAGE_W + 50 || sy > STAGE_H + 50) return null;
  return [sx, sy];
}
function drawStreakBar(c, p, br, y) {
  STREAK_SEL.list.forEach((id, i) => {
    const s = STREAK_BY_ID[id], cost = streakCost(id), have = p.earned[i] > 0, prog = p.awarded[i] ? 1 : Math.min(1, p.streakPts / cost);
    const yy = y - (2 - i) * 18;
    c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(br - 150, yy - 11, 150, 14);
    c.fillStyle = have ? 'rgba(120,200,255,.55)' : 'rgba(255,255,255,.18)'; c.fillRect(br - 150, yy - 11, 150 * (have ? 1 : prog), 14);
    txt(c, `[${K(["s1", "s2", "s3"][i])}] ${s.name}${p.earned[i] > 1 ? ' ×' + p.earned[i] : ''}`, br - 146, yy, 11, have ? '#fff' : '#bbb', 'left', 600, false);
    txt(c, have ? '使用可能' : `${Math.min(p.streakPts, cost)}/${cost}`, br - 4, yy, 10, have ? '#cfefff' : '#999', 'right', 400, false);
  });
}
function drawModeHUD(c, p, Wd, H, bl) {
  const barW = 200;
  const bar = (y, label, val, max, col) => {
    c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(24, y - 14, barW, 18);
    c.fillStyle = col; c.fillRect(24, y - 14, barW * clamp(val / Math.max(1, max), 0, 1), 18);
    txt(c, String(val), 24 + barW + 8, y + 1, 18, '#fff');
    txt(c, label, 30, y, 12, '#111', 'left', 700, false);
  };
  const M = MODES[G.mode];
  if (G.mode === 'zombies') { drawZombieHUD(c, p, Wd, H); return; }
  if (G.mode === 'range') { txt(c, '射撃場 — ' + MAPS[W.id].name, 24, bl, 20, '#f2a516'); return; }
  txt(c, `${fmtTime(G.timeLeft)}  ${M.name}`, 24, bl - 52, 18, '#fff');
  if (isTeamMode()) {
    bar(bl - 24, '味方', G.teamScore.A, G.scoreLimit, TEAMC.A); bar(bl, '敵', G.teamScore.B, G.scoreLimit, TEAMC.B);
    if (G.mode === 'dom') {
      const x0 = Wd / 2 - 75;
      G.flags.forEach((f, i) => {
        const x = x0 + i * 55, col = f.owner ? (f.owner === p.team ? TEAMC.A : TEAMC.B) : '#bbb';
        c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(x, 50, 40, 34); c.strokeStyle = col; c.lineWidth = 2; c.strokeRect(x, 50, 40, 34);
        txt(c, f.name, x + 20, 74, 18, col, 'center', 700);
        if (f.cap > 0 && f.capTeam) { c.fillStyle = f.capTeam === p.team ? TEAMC.A : TEAMC.B; c.fillRect(x, 86, 40 * f.cap, 4); }
      });
      const here = G.flags.find(f => V.dist2(f.pos, p.pos) < 4.5);
      if (here && here.capTeam) txt(c, here.capTeam === p.team ? `${here.name} を確保中…` : `${here.name} を奪われている！`, Wd / 2, H / 2 + 150, 15, here.capTeam === p.team ? TEAMC.A : TEAMC.B, 'center', 700);
    }
    return;
  }
  if (G.mode === 'gun') {
    const lvl = (p.gg || 0) + 1, sorted = G.ents.slice().sort((a, b) => (b.gg || 0) - (a.gg || 0)), leader = sorted[0] === p ? sorted[1] : sorted[0];
    bar(bl - 24, 'あなた', lvl, GUNGAME.length, '#f2a516'); if (leader) bar(bl, leader.name, (leader.gg || 0) + 1, GUNGAME.length, '#c9c4b8');
    const nx = GUNGAME[Math.min(GUNGAME.length - 1, (p.gg || 0) + 1)];
    txt(c, `次: ${WPN[nx].name}`, 24, bl - 76, 13, '#cfcac0', 'left', 400);
    return;
  }
  const sorted = G.ents.slice().sort((a, b) => b.kills - a.kills), leader = sorted[0] === p ? sorted[1] : sorted[0];
  bar(bl - 24, 'あなた', p.kills, G.scoreLimit, '#f2a516'); if (leader) bar(bl, leader.name, leader.kills, G.scoreLimit, '#c9c4b8');
}
function drawZombieHUD(c, p, Wd, H) {
  const z = G.zm; if (!z) return;
  // round number (big, red)
  txt(c, String(Math.max(1, z.round)), 34, H - 30, 64, z.betweenT > 0 && z.round > 0 ? `rgba(255,${(120 + 100 * Math.sin(G.time * 4)) | 0},90,1)` : '#c41e12', 'left', 700);
  txt(c, 'ROUND', 36, H - 96, 12, '#a33', 'left', 600);
  // points
  txt(c, String(z.points), Wd - 30, H - 140, 26, '#f6e27a', 'right', 700);
  z.floats.forEach(f => { const age = G.time - f.t; if (age < 1) txt(c, `+${f.v}`, Wd - 30 - age * 40, H - 166 - age * 30, 14, `rgba(246,226,122,${1 - age})`, 'right', 700); });
  // perks owned
  let px = Wd - 30;
  for (const id of z.perks) { const pk = ZPERKS[id]; c.fillStyle = `rgb(${pk.col.map(v => v * 255 | 0).join(',')})`; c.fillRect(px - 22, H - 200, 22, 22); txt(c, pk.name[0], px - 11, H - 184, 13, '#111', 'center', 700, false); px -= 28; }
  // timers
  let ty = 60;
  if (z.insta > 0) { txt(c, `一撃必殺 ${Math.ceil(z.insta)}`, Wd / 2, ty, 15, '#ff5a4a', 'center', 700); ty += 20; }
  if (z.dbl > 0) { txt(c, `ダブルポイント ${Math.ceil(z.dbl)}`, Wd / 2, ty, 15, '#ffd24a', 'center', 700); ty += 20; }
  zqHUD(c, p, Wd, H);
  if (z.prompt) txt(c, keyify(z.prompt), Wd / 2, H / 2 + 130, 16, '#fff', 'center', 600);
  if (z.roll && !z.roll.done) txt(c, '…', Wd / 2, H / 2 + 150, 16, '#fff', 'center', 600);
  const left = z.toSpawn + G.zombies.filter(b => b.alive).length;
  if (z.round > 0 && z.betweenT <= 0) txt(c, `残り ${left}`, 36, H - 112, 12, '#bbb', 'left', 400);
  else if (z.betweenT > 0) txt(c, `次のラウンドまで ${Math.ceil(z.betweenT)}`, 36, H - 112, 12, '#bbb', 'left', 400);
}
