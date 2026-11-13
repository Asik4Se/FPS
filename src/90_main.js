// ============================================================
//  MAIN: loop / fx / match flow / menus
// ============================================================
const $ = id => document.getElementById(id);
window.addEventListener('error', e => { const el = $('err'); el.style.display = 'block'; el.textContent = 'Error: ' + (e.message || e) + (e.filename ? ` @${e.lineno}` : ''); });

function impactFX(pt, n, box) {
  const col = box && box.c ? box.c : [0.6, 0.55, 0.5];
  for (let i = 0; i < 6; i++) G.parts.push({ pos: V.add(pt, V.mul(n, 0.03)), vel: V.add(V.mul(n, rand(1, 3)), [rand(-1.5, 1.5), rand(0, 2.5), rand(-1.5, 1.5)]), life: rand(0.3, 0.7), t: 0, size: rand(0.03, 0.07), col: col.map(v => v * rand(0.8, 1.15)), g: 9 });
  G.parts.push({ pos: V.add(pt, V.mul(n, 0.01)), vel: [0, 0, 0], life: 0.06, t: 0, size: 0.08, col: [1, 0.9, 0.6], emis: 1, g: 0 });
}
function bloodPuff(pt, dir) {
  for (let i = 0; i < 7; i++) G.parts.push({ pos: pt.slice(), vel: V.add(V.mul(dir, rand(0.5, 2.5)), [rand(-1, 1), rand(-0.5, 1.5), rand(-1, 1)]), life: rand(0.25, 0.55), t: 0, size: rand(0.04, 0.09), col: [0.55, 0.04, 0.03], g: 8 });
}
function updateFX(dt) {
  for (const t of G.tracers) t.t += dt;
  G.tracers = G.tracers.filter(t => t.t < t.life);
  for (const q of G.parts) { q.t += dt; q.vel[1] -= q.g * dt; q.pos = V.add(q.pos, V.mul(q.vel, dt)); if (q.pos[1] < 0.02) { q.pos[1] = 0.02; q.vel = [q.vel[0] * 0.5, 0, q.vel[2] * 0.5]; } }
  G.parts = G.parts.filter(q => q.t < q.life);
  if (G.parts.length > 700) G.parts.splice(0, G.parts.length - 700);
  updateProjectiles(dt);
}

// ---------- match flow ----------
function startGame() {
  audioInit();
  saveClasses(); saveJSON('ls_streaks', STREAK_SEL);
  const zm = G.mode === 'zombies';
  let mapId = zm ? 'lab' : G.map === 'random' ? pick(Object.keys(MAPS).filter(k => !MAPS[k].zm)) : G.map;
  if (!zm && MAPS[mapId].zm) mapId = 'yard';
  buildMap(mapId);
  const range = G.mode === 'range';
  Object.assign(G, { ents: [], bots: [], zombies: [], time: 0, over: false, tracers: [], parts: [], projs: [], killfeed: [], popups: [], uavT: 0, lastHitInfo: null,
    stats: range ? { shots: 0, hits: 0, lastAds: null } : null, menuCam: false, pendingClass: -1, smokes: [], sensors: [], drones: [], sentries: [], timers: [],
    flags: [], tags: [], teamScore: { A: 0, B: 0 }, cuavT: 0, vsatT: 0, enemyUavT: 0, swarm: null, zm: null, winner: null });
  G.timeLeft = range || zm ? 0 : G.timeLimit;
  G.scoreLimit = G.limits[G.mode] || MODES[G.mode].def;
  if (G.mode === 'gun') G.scoreLimit = GUNGAME.length;
  CLS = CLASSES.list[CLASSES.cur];
  if (zm) zmStart();
  const p = newPlayer(); G.player = p; G.ents.push(p);
  const n = range ? 6 : zm ? 0 : G.botCount;
  for (let i = 0; i < n; i++) { const b = newBot(i); G.bots.push(b); G.ents.push(b); }
  setupTeams();
  for (const e of G.ents) { spawnEnt(e); if (!e.isPlayer) resetBotAI(e); }
  if (zm) { p.pos = [0, 0, 0]; p.yaw = 0; }
  if (G.mode === 'dom') setupDom();
  if (range) for (const b of G.bots) b.name = '標的';
  G.running = true;
  popup(MAPS[W.id].name + ' — ' + MODES[G.mode].name, '#fff');
  $('menu').classList.remove('on'); $('endscr').classList.remove('on');
  resume();
}
function releaseFocus() { const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); IN.keys = {}; IN.pressed = {}; }
function resume() {
  $('pause').classList.remove('on'); G.paused = false; audioInit(); releaseFocus();
  lockPointer();
}
function lockPointer() {
  const cv = $('gl');
  if (IN.fallback) { IN.locked = true; return; }
  try { const r = cv.requestPointerLock({ unadjustedMovement: true }); if (r && r.catch) r.catch(() => { try { const r2 = cv.requestPointerLock(); if (r2 && r2.catch) r2.catch(() => { IN.fallback = true; IN.locked = true; }); } catch (e) { IN.fallback = true; IN.locked = true; } }); }
  catch (e) { IN.fallback = true; IN.locked = true; }
}
document.addEventListener('pointerlockchange', () => {
  IN.locked = document.pointerLockElement === $('gl') || IN.fallback;
  if (!IN.locked && G.running && !G.over && !G.paused && !IN.padActive) pauseGame();
});
document.addEventListener('pointerlockerror', () => { IN.fallback = true; IN.locked = true; });
function pauseGame() { if (!G.running || G.over) return; G.paused = true; buildPause(); $('pause').classList.add('on'); }
function endMatch(winnerEnt) {
  if (G.over) return; G.over = true;
  setTimeout(() => {
    if (document.exitPointerLock) document.exitPointerLock();
    const P = G.player, M = MODES[G.mode];
    let title, sub, win;
    if (G.mode === 'zombies') {
      const z = G.zm; title = z.cleared ? 'クリア！' : 'ゲームオーバー'; win = !!z.cleared;
      sub = z.cleared ? `${BOSS_NAME}を討伐（ラウンド${z.bossRound}で突入） ／ ${z.kills}キル ／ 迷彩「ネメシス」解除済み`
        : `ラボ — ラウンド ${z.round} まで生存 ／ ${z.kills}キル（ヘッドショット${z.heads}） ／ ${z.points}ポイント`;
      $('endtable').innerHTML = '';
    } else {
      if (isTeamMode()) { const w = modeWinner(); win = w === P.team; title = w ? (win ? '勝利' : '敗北') : '引き分け'; sub = `${MAPS[W.id].name} ${M.name} — 味方 ${G.teamScore.A} : 敵 ${G.teamScore.B}`; }
      else {
        const key = G.mode === 'gun' ? (e => (e.gg || 0) * 1000 + e.kills) : (e => e.kills * 1000 - e.deaths);
        const rows = G.ents.filter(e => !e.isZombie).sort((a, b) => key(b) - key(a)); const rank = rows.indexOf(winnerEnt || rows[0]) >= 0 ? rows.indexOf(P) + 1 : 1;
        win = (winnerEnt ? winnerEnt === P : rank === 1); title = win ? '勝利' : '敗北'; sub = `${MAPS[W.id].name} ${M.name} — ${rank}位 / ${rows.length}人 — ${P.kills}キル ${P.deaths}デス`;
      }
      const rows = G.ents.filter(e => !e.isZombie).slice().sort((a, b) => (b.team === P.team) - (a.team === P.team) || b.score - a.score);
      $('endtable').innerHTML = `<tr><th>#</th><th>プレイヤー</th><th>スコア</th><th>キル</th><th>デス</th></tr>` + rows.map((e, i) => `<tr class="${e.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td style="color:${e.team ? TEAMC[e.team === P.team ? 'A' : 'B'] : 'inherit'}">${esc(e.name)}</td><td>${e.score}</td><td>${e.kills}</td><td>${e.deaths}</td></tr>`).join('');
    }
    $('endTitle').textContent = title; $('endTitle').style.color = win ? 'var(--acc)' : '#ff6a5a';
    $('endSub').textContent = sub;
    $('endscr').classList.add('on');
  }, G.mode === 'zombies' ? 2500 : 1600);
}
function toMenu() {
  G.running = false; G.paused = true; G.over = false; G.bots = []; G.ents = [];
  if (document.exitPointerLock) document.exitPointerLock();
  $('pause').classList.remove('on'); $('endscr').classList.remove('on'); $('menu').classList.add('on');
  setupMenuCam(); showPanel('play');
}
function setupMenuCam() { const p = newPlayer(); const sp = W.spawns[0] || [0, 0, 0]; p.pos = [sp[0], 4.5, sp[2]]; p.eyeH = 1.6; G.player = p; G.menuCam = true; G.tracers = []; G.parts = []; G.projs = []; }

// ---------- main loop ----------
let last = performance.now(), fpsAcc = 0, fpsN = 0, boardT = 0;
const SYNC_PX = new Uint8Array(4);
function frame(now) {
  const dt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000)); last = now;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) {
    G.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
    // dynamic resolution: only react to SUSTAINED low fps (a single hitch must not trigger a costly canvas reallocation)
    if (SET.autoRes && G.running && !G.paused) {
      G._lowN = G.fps < 50 ? (G._lowN || 0) + 1 : 0;
      G._goodN = G.fps > 58 ? (G._goodN || 0) + 1 : 0;
      const since = now - (G._dynT || 0);
      if (G._lowN >= 3 && R.dyn > 0.5 && since > 2000) { R.dyn = Math.max(0.5, R.dyn - 0.1); G._lowN = 0; G._dynT = now; }
      else if (G._goodN >= 8 && R.dyn < 1 && since > 4000) { R.dyn = Math.min(1, R.dyn + 0.1); G._goodN = 0; G._dynT = now; }
    }
  }
  resize($('gl'), $('hud'));
  // low-latency: wait for the previous frame to finish on the GPU (max 1 frame in flight), then sample input as late as possible.
  // If the driver ever blocks here for long (which would freeze input handling), back off automatically for a while.
  if (SET.lowLat && G.running && !G.paused && R.gl && !document.hidden && now > (G._syncOffUntil || 0)) {
    const t0 = performance.now();
    R.gl.readPixels(0, 0, 1, 1, R.gl.RGBA, R.gl.UNSIGNED_BYTE, SYNC_PX);
    const blocked = performance.now() - t0;
    G._syncSlow = blocked > 10 ? (G._syncSlow || 0) + 1 : Math.max(0, (G._syncSlow || 0) - 0.05);
    if (blocked > 40 || G._syncSlow >= 3) { G._syncOffUntil = now + 5000; G._syncSlow = 0; }
  }
  const a = gatherActions(dt);
  _sndBudget = 0;
  if (a.pauseP && G.running && !G.over) { if (G.paused) resume(); else pauseGame(); }
  if (G.online) netFilter(a);
  if (G.running && !G.paused) {
    G.time += dt;
    if (!G.online && !['range', 'zombies'].includes(G.mode) && !G.over) { G.timeLeft -= dt; if (G.timeLeft <= 0) { G.timeLeft = 0; endMatch(); } }
    if (!G.over) {
      updatePlayer(G.player, a, dt);
      if (G.mode === 'range') for (const w of G.player.wpn) w.res = 999;
      for (const b of G.bots) updateBot(b, dt);
      if (!G.online) updateMode(dt);
      if (G.mode === 'zombies') updateZombies(dt);
    }
    updateStreaks(dt);
    updateFX(dt);
  } else if (G.running && G.online) { // online keeps running behind the pause menu
    G.time += dt; if (!G.over) { updatePlayer(G.player, Object.assign({}, NOACT), dt); for (const b of G.bots) updateBot(b, dt); } updateFX(dt);
  } else if (G.menuCam) {
    const p = G.player; p.camYaw = now * 0.00004 + 2.6; p.camPitch = -0.12; p.camRoll = 0; p.fov = 70;
  }
  if (G.online) netTick(dt);
  renderFrame();
  drawHUD(dt);
  // scoreboard
  const bd = $('board');
  const showBoard = G.running && !G.paused && (a.board || (G.over));
  bd.style.display = showBoard && !$('endscr').classList.contains('on') ? 'block' : 'none';
  if (showBoard) { boardT -= dt; if (boardT <= 0) { boardT = 0.25; renderBoard(bd); } }
  requestAnimationFrame(frame);
}
// patch renderFrame for menu cam (no viewmodel)
const _renderFrame = renderFrame;
renderFrame = function () {
  if (G.menuCam) { const p = G.player; const keep = p.alive; _renderFrameMenu(); return; }
  _renderFrame();
};
function _renderFrameMenu() {
  const p = G.player, w0 = p.wpn; p.ads = 0;
  // render world without viewmodel by temporarily marking dead with deathCam 0
  p.alive = false; p.deathCam = 0; p.eyeH = 1.6;
  const f = SET.fov; SET.fov = 70; _renderFrame(); SET.fov = f; p.alive = true;
}

// ============================================================
//  MENUS
// ============================================================
G.timeLimit = 600; G.limits = {};
let EDIT = CLASSES.cur;
function showPanel(id) {
  document.querySelectorAll('.mbtn').forEach(b => b.classList.toggle('sel', b.dataset.p === id));
  for (const k of ['play', 'online', 'cac', 'opt', 'help']) $('p-' + k).style.display = k === id ? 'block' : 'none';
  if (id === 'cac') { openCAC(); return; }
  ({ play: buildPlay, online: buildOnline, opt: () => buildOpt(), help: buildHelp })[id]();
}
document.querySelectorAll('.mbtn').forEach(b => b.addEventListener('click', () => { audioInit(); sfxClick(1500, 0.15, 0.03); if (b.dataset.p === 'cac') openCAC(); else showPanel(b.dataset.p); }));
const chip = (on, title, sub, attrs, dis) => `<button class="chip${on ? ' on' : ''}${dis ? ' dis' : ''}" ${attrs || ''}><b>${title}</b>${sub ? `<i>${sub}</i>` : ''}</button>`;
function classSummary(c) {
  const d = WPN[c.primary];
  return `<b>${esc(c.name)}</b>：${d.name}${c.att.length ? '（' + c.att.map(a => ATT[a].name).join('・') + '）' : ''} ／ ${c.secondary ? WPN[c.secondary].name : 'サブなし'} ／ ${LETHALS[c.lethal].name} ／ ${c.perks.flat().map(id => PERK_BY_ID[id].name).join('・') || 'パークなし'}${c.wild.length ? ' ／ ' + c.wild.map(id => WILDS.find(x => x.id === id).name).join('・') : ''}`;
}
function camoSwatch(c) {
  if (!c.pat) return 'background:#2a2f37';
  const f = v => `rgb(${v.map(x => Math.min(255, x * 255 | 0)).join(',')})`;
  if (c.pat === 4) return `background:linear-gradient(135deg,${f(c.a)},#fff3c0 45%,${f(c.a.map(v => v * 0.6))})`;
  if (c.pat === 5) return `background:linear-gradient(135deg,${f(c.a)},${f(c.b)} 30%,#fff 50%,${f(c.b)} 70%,${f(c.a)})`;
  if (c.pat === 3) return `background:repeating-linear-gradient(60deg,${f(c.a)} 0 6px,${f(c.c)} 6px 9px,${f(c.b)} 9px 14px)`;
  if (c.pat === 2 || c.pat === 8) return `background:conic-gradient(${f(c.a)} 0 25%,${f(c.b)} 0 50%,${f(c.a)} 0 75%,${f(c.b)} 0) 0 0/8px 8px`;
  if (c.pat === 6) return `background:radial-gradient(circle at 30% 70%,${f(c.c)},${f(c.b)} 30%,${f(c.a)} 70%)`;
  if (c.pat === 7) return `background:repeating-linear-gradient(90deg,${f(c.a)} 0 6px,${f(c.b)} 6px 7px)`;
  return `background:radial-gradient(circle at 30% 30%,${f(c.b)} 0 25%,transparent 26%),radial-gradient(circle at 70% 60%,${f(c.c)} 0 20%,transparent 21%),${f(c.a)}`;
}
function buildPlay() {
  const el = $('p-play'), M = MODES[G.mode], zm = G.mode === 'zombies', range = G.mode === 'range';
  const lim = G.limits[G.mode] || M.def;
  el.innerHTML = `<h2>プレイ <b>//</b></h2><div class="desc" style="margin-bottom:10px">クリックでマウスをロック、Escで一時停止（クラス変更もここから）。ゲームパッド対応。</div>
  <div class="lbl">モード</div><div class="tiles" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">${Object.entries(MODES).map(([k, m]) => `<button class="tile${G.mode === k ? ' on' : ''}" data-mode="${k}"><b>${m.name}</b><i>${m.short}</i></button>`).join('')}</div>
  <div style="font-size:12px;color:var(--dim);margin:-4px 0 8px">${M.desc}</div>
  ${zm ? `<div class="lbl">マップ</div><div style="font-size:13px;margin:4px 0 10px">ラボ — ${MAPS.lab.desc}</div>` : `<div class="lbl">マップ</div><div class="tiles">${Object.entries(MAPS).filter(([, m]) => !m.zm).map(([k, m]) => `<button class="tile${G.map === k ? ' on' : ''}" data-map="${k}" title="${m.desc}"><b>${m.name}</b><i>${m.desc.split('。')[0]}</i></button>`).join('')}<button class="tile${G.map === 'random' ? ' on' : ''}" data-map="random"><b>ランダム</b><i>毎試合抽選</i></button></div>`}
  ${zm || range ? '' : `<div class="row" style="margin:4px 0"><label style="width:90px">Botの強さ</label>${DIFFS.map((d, i) => `<button class="tile${G.diff === i ? ' on' : ''}" data-diff="${i}" style="min-height:0;padding:5px 12px"><b>${d.name}</b></button>`).join('')}</div>
  <div class="row" style="margin:4px 0"><label style="width:90px">Botの数</label><input type="range" min="1" max="11" value="${G.botCount}" id="botN"><span class="val" id="botNv">${G.botCount}</span>${M.team ? '<span style="font-size:11px;color:var(--dim)">（半分が味方）</span>' : ''}</div>
  <div class="row" style="margin:4px 0"><label style="width:90px">勝利条件</label><select id="lim">${M.limits.map(v => `<option value="${v}" ${v === lim ? 'selected' : ''}>${v}${M.unit}</option>`).join('')}</select>
   <label style="width:auto">制限時間</label><select id="tl">${[5, 10, 15].map(v => `<option value="${v * 60}" ${v * 60 === G.timeLimit ? 'selected' : ''}>${v}分</option>`).join('')}</select></div>`}
  ${zm || G.mode === 'gun' ? '' : `<div class="lbl">使用クラス</div><div class="tiles">${CLASSES.list.map((c, i) => `<button class="tile${CLASSES.cur === i ? ' on' : ''}" data-cls="${i}"><b>${esc(c.name)}</b><i>${WPN[c.primary].name}</i></button>`).join('')}</div>
  <div style="font-size:12px;line-height:1.7;color:#cfcac0">${classSummary(CLASSES.list[CLASSES.cur])}<br>ストリーク: ${STREAK_SEL.list.map(id => STREAK_BY_ID[id].name).join(' / ')}</div>`}
  ${zm ? '<div style="font-size:12px;line-height:1.8;color:#cfcac0">ゾンビでは拳銃とナイフ、フラグ2個でスタート。<b>F</b>でドア・壁の武器・パーク缶・ランダムボックスを購入。窓のバリケードは<b>F長押し</b>で修理（+10）。<br>管制室で電源を入れるとパークが使える。ヒューズ3個を発電所の制御盤へ → 改造台起動。端末の暗号の順に信号灯を撃つと報酬。部品3つで作業台からシールド／トラップ（<b>4</b>で設置）を作れる。</div>' : ''}
  ${G.mode === 'gun' ? '<div style="font-size:12px;line-height:1.8;color:#cfcac0">全員が同じ武器順で進む。クラス・パーク・ストリークは使われません（軽量化・器用は全員に付与）。</div>' : ''}
  <button class="go" id="bStart">出撃</button>${zm || G.mode === 'gun' ? '' : '<button class="ghost" id="bToCac">クラスを編集</button>'}`;
  el.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { G.mode = b.dataset.mode; buildPlay(); });
  el.querySelectorAll('[data-map]').forEach(b => b.onclick = () => { G.map = b.dataset.map; if (G.map !== 'random' && G.map !== W.id) { buildMap(G.map); setupMenuCam(); } buildPlay(); });
  el.querySelectorAll('[data-diff]').forEach(b => b.onclick = () => { G.diff = +b.dataset.diff; buildPlay(); });
  el.querySelectorAll('[data-cls]').forEach(b => b.onclick = () => { CLASSES.cur = +b.dataset.cls; CLS = CLASSES.list[CLASSES.cur]; saveClasses(); buildPlay(); });
  const bn = $('botN'); if (bn) bn.oninput = () => { G.botCount = +bn.value; $('botNv').textContent = bn.value; };
  const lm = $('lim'); if (lm) lm.onchange = () => G.limits[G.mode] = +lm.value;
  const tl = $('tl'); if (tl) tl.onchange = () => G.timeLimit = +tl.value;
  $('bStart').onclick = startGame; const tc = $('bToCac'); if (tc) tc.onclick = () => openCAC();
}
function statBars(st) {
  const L = { dmg: 'ダメージ', rng: '射程', acc: '精度', rof: '連射', mob: '機動性' };
  return Object.keys(L).map(k => `<div class="statbar"><span style="width:60px">${L[k]}</span><div><i style="width:${st[k]}%"></i></div></div>`).join('');
}
// ============================================================
//  CREATE-A-CLASS  (slot list on the left, picker + details on the right)
// ============================================================
const CS = { slot: 'primary', cat: 'sniper', hover: null };
function openCAC() { $('menu').classList.remove('on'); EDIT = CLASSES.cur; CS.slot = 'primary'; CS.cat = WPN[CLASSES.list[EDIT].primary].cls; CS.hover = null; $('cac').classList.add('on'); buildCAC(); }
function closeCAC(toPlay) { $('cac').classList.remove('on'); $('menu').classList.add('on'); saveClasses(); saveJSON('ls_streaks', STREAK_SEL); showPanel(ON.code ? 'online' : 'play'); }
function buildCAC() {
  const c = CLASSES.list[EDIT], cost = classCost(c), hasW = id => c.wild.includes(id);
  const maxP = hasW('gf') ? 3 : 2, maxS = hasW('sgf') ? 2 : 1;
  const pd = WPN[c.primary], sd = c.secondary ? WPN[c.secondary] : null;
  const can = n => cost + n <= 10;
  const chips = (list, max, slot) => { let h = ''; for (let i = 0; i < max; i++) h += list[i] ? `<span class="${CS.slot === slot ? 'on' : ''}" data-slot="${slot}">${ATT[list[i]].name}</span>` : `<span class="empty" data-slot="${slot}">＋ アタッチメント</span>`; return h; };
  const camoChip = (key, slot) => `<span data-slot="${slot}" class="${CS.slot === slot ? 'on' : ''}" style="display:inline-flex;align-items:center;gap:5px"><i class="sw" style="display:inline-block;width:16px;height:10px;margin:0;${camoSwatch(CAMO_BY_ID[c[key]])}"></i>${CAMO_BY_ID[c[key]].name}</span>`;
  const row = (slot, label, title, sub, extra, empty) => `<div class="slot${CS.slot === slot ? ' on' : ''}${empty ? ' empty' : ''}" data-slot="${slot}"><div class="k">${label}</div><div class="v"><b>${title}</b>${sub ? `<i>${sub}</i>` : ''}${extra ? `<div class="sub">${extra}</div>` : ''}</div></div>`;
  const perkNames = i => c.perks[i].map(id => PERK_BY_ID[id].name).join(' ＋ ');
  const slots = [
    row('primary', 'メイン武器', pd.name, CLS_JP[pd.cls], chips(c.att, maxP, 'patt') + camoChip('pcamo', 'pcamo')),
    row('secondary', 'サブ武器', sd ? sd.name : 'なし', sd ? CLS_JP[sd.cls] : '', sd ? chips(c.satt, maxS, 'satt') + camoChip('scamo', 'scamo') : '', !sd),
    row('lethal', 'リーサル', LETHALS[c.lethal].name, hasW('dl') ? '×2' : '', '', c.lethal === 'none'),
    row('tactical', 'タクティカル', TACTICALS[c.tactical].name, hasW('tm') ? '×2' : '', '', c.tactical === 'none'),
    row('perk0', 'パーク1', perkNames(0) || 'なし', '', '', !c.perks[0].length),
    row('perk1', 'パーク2', perkNames(1) || 'なし', '', '', !c.perks[1].length),
    row('perk2', 'パーク3', perkNames(2) || 'なし', '', '', !c.perks[2].length),
    row('wild', 'ワイルド<br>カード', c.wild.map(id => WILDS.find(w => w.id === id).name).join(' / ') || 'なし', `${c.wild.length}/3`, '', !c.wild.length),
    `<div style="height:8px"></div>`,
    row('streak', 'スコア<br>ストリーク', STREAK_SEL.list.map(id => STREAK_BY_ID[id].name).join(' / '), '全クラス共通'),
  ].join('');
  // ----- picker content -----
  let title = '', hint = '', cats = '', items = [];
  const it = (key, name, sub, on, dis, why, detail, swatch) => items.push({ key, name, sub, on, dis, why, detail, swatch });
  const wDetail = (d, id) => `<h4>${d.name}</h4><div class="tag">${CLS_JP[d.cls]}</div><div>${d.desc}</div><div style="margin-top:10px">${statBars(d.stats)}</div>
    <div class="kv"><span>ADS</span><span>${Math.round(d.ads * 1000)}ms</span><span>ダッシュ解除</span><span>${Math.round(d.sprintOut * 1000)}ms</span><span>装弾数</span><span>${d.mag}${d.pellets ? `（散弾${d.pellets}粒）` : ''}${d.burst ? `（${d.burst}点バースト）` : ''}</span><span>移動速度</span><span>${Math.round(d.mob * 100)}%</span><span>キル数</span><span>${wKills(id)}${hasGold(id) ? '（ゴールド獲得）' : ` / ゴールドまで${GOLD_KILLS}`}</span></div>`;
  const s0 = CS.slot;
  if (s0 === 'primary') {
    title = 'メイン武器'; hint = '1ポイント';
    cats = ['sniper', 'ar', 'smg', 'sg', 'lmg'];
    if (!cats.includes(CS.cat)) CS.cat = pd.cls;
    for (const id of PRIMARIES.filter(id => WPN[id].cls === CS.cat)) it(id, WPN[id].name, hasGold(id) ? '★' : '', c.primary === id, false, '', wDetail(WPN[id], id));
  } else if (s0 === 'secondary') {
    title = 'サブ武器'; hint = hasW('ok') ? 'オーバーキル: メイン武器も選べる' : '1ポイント';
    const pool = (hasW('ok') ? PRIMARIES.filter(id => id !== c.primary) : []).concat(SECONDARIES);
    it('', 'なし', '', !c.secondary, false, '', '<h4>サブなし</h4>1ポイント節約できます。');
    for (const id of pool) it(id, WPN[id].name, CLS_JP[WPN[id].cls], c.secondary === id, !c.secondary && !can(1), 'ポイント不足', wDetail(WPN[id], id));
  } else if (s0 === 'patt' || s0 === 'satt') {
    const prim = s0 === 'patt', d = prim ? pd : sd, list = prim ? c.att : c.satt, max = prim ? maxP : maxS;
    title = `${d.name} のアタッチメント`; hint = `${list.length}/${max}（1つ1ポイント、クリックで付け外し）${prim && !hasW('gf') ? ' 3つ目はワイルドカード「ガンファイター」' : ''}${!prim && !hasW('sgf') ? ' 2つ目は「サブガンファイター」' : ''}`;
    for (const k of Object.keys(ATT).filter(k => ATT[k].for.includes(d.cls))) { const on = list.includes(k); it(k, ATT[k].name, on ? '装着中' : '', on, !on && (!can(1) || list.length >= max), list.length >= max ? '枠がいっぱい' : 'ポイント不足', `<h4>${ATT[k].name}</h4><div>${ATT[k].desc}</div>`); }
  } else if (s0 === 'pcamo' || s0 === 'scamo') {
    const prim = s0 === 'pcamo', wid = prim ? c.primary : c.secondary;
    title = `${WPN[wid].name} の迷彩`; hint = 'ポイント不要';
    for (const cm of CAMOS) { const ok = camoUnlocked(cm.id, wid); it(cm.id, cm.name, ok ? '' : '🔒', c[s0] === cm.id, !ok, camoReq(cm.id, wid), `<h4>${cm.name}</h4><div style="height:60px;margin:10px 0;${camoSwatch(cm)}"></div>${ok ? '' : '解除条件: ' + camoReq(cm.id, wid)}`, cm); }
  } else if (s0 === 'lethal' || s0 === 'tactical') {
    const L = s0 === 'lethal' ? LETHALS : TACTICALS; title = s0 === 'lethal' ? 'リーサル（Gキー）' : 'タクティカル（Qキー）'; hint = '1ポイント';
    for (const [k, l] of Object.entries(L)) it(k, l.name, '', c[s0] === k, c[s0] === 'none' && k !== 'none' && !can(1), 'ポイント不足', `<h4>${l.name}</h4><div>${l.desc || 'なし'}</div>`);
  } else if (s0.startsWith('perk')) {
    const i = +s0[4], max = hasW('g' + (i + 1)) ? 2 : 1;
    title = `パーク${i + 1}`; hint = `${c.perks[i].length}/${max}（1つ1ポイント、クリックで付け外し）${max < 2 ? ` 2つ目は「パーク${i + 1}欲張り」` : ''}`;
    for (const pk of PERKS[i]) { const on = c.perks[i].includes(pk.id); it(pk.id, pk.name, on ? '装備中' : '', on, !on && (!can(1) || c.perks[i].length >= max), c.perks[i].length >= max ? '枠がいっぱい' : 'ポイント不足', `<h4>${pk.name}</h4><div>${pk.desc}</div>`); }
  } else if (s0 === 'wild') {
    title = 'ワイルドカード'; hint = `${c.wild.length}/3（1つ1ポイント）`;
    for (const w of WILDS) { const on = c.wild.includes(w.id); it(w.id, w.name, on ? '使用中' : '', on, !on && (!can(1) || c.wild.length >= 3), c.wild.length >= 3 ? '3枚まで' : 'ポイント不足', `<h4>${w.name}</h4><div>${w.desc}</div>`); }
  } else if (s0 === 'streak') {
    title = 'スコアストリーク'; hint = `${STREAK_SEL.list.length}/3（4・5・6キーで使用、全クラス共通）`;
    for (const st of STREAKS) { const on = STREAK_SEL.list.includes(st.id); it(st.id, st.name, `${st.cost}`, on, !on && STREAK_SEL.list.length >= 3, '3つまで', `<h4>${st.name}</h4><div class="tag">${st.cost} ポイント</div><div>${st.desc}</div>`); }
  }
  const sel = items.find(x => x.on) || items[0];
  const det = CS.hover && items.find(x => x.key === CS.hover) || sel;
  const catNames = { sniper: 'スナイパー', ar: 'アサルト', smg: 'SMG', sg: 'ショットガン', lmg: 'LMG' };
  $('cac').innerHTML = `
  <div class="hd"><h2>クラス作成 <b>//</b></h2>
    <div class="ctabs">${CLASSES.list.map((k, i) => `<button class="${EDIT === i ? 'on' : ''}" data-edit="${i}">${esc(k.name)}</button>`).join('')}</div>
    <div class="pick10">ピック10 <div class="pips">${Array.from({ length: 10 }, (_, i) => `<i class="${i < cost ? 'u' : ''}"></i>`).join('')}</div><span style="color:${cost > 10 ? '#ff6a5a' : 'var(--acc)'}">${cost}/10</span></div>
  </div>
  <div class="bd">
    <div class="slots">${slots}</div>
    <div class="picker">
      <div class="ph"><h3>${title}</h3><span>${hint}</span></div>
      <div class="pcats">${Array.isArray(cats) ? cats.map(k => `<button class="${CS.cat === k ? 'on' : ''}" data-cat="${k}">${catNames[k]}</button>`).join('') : ''}</div>
      <div class="pbody">
        <div class="plist">${items.map(x => `<button class="pitem${x.on ? ' on' : ''}${x.dis ? ' dis' : ''}" data-item="${x.key}">${x.swatch ? `<span class="sw" style="${camoSwatch(x.swatch)}"></span>` : ''}<b>${x.name}</b><i>${x.sub || ''}</i></button>`).join('')}</div>
        <div class="pdetail">${det ? det.detail + (det.dis && det.why ? `<div class="warn">選べません：${det.why}</div>` : '') : ''}</div>
      </div>
    </div>
  </div>
  <div class="cacft"><input id="cname" value="${esc(c.name)}" maxlength="12" style="background:#15181d;color:#fff;border:1px solid var(--line);padding:9px 12px;font-size:14px;width:170px">
    <button class="go" id="cacOk">決定</button><button class="ghost" id="cacReset">このクラスを初期化</button><button class="ghost" id="cacBack">戻る</button>
    <span class="hint">左の枠をクリックして選択 ／ 小さい枠（アタッチメント・迷彩）も直接クリックできます</span></div>`;
  const root = $('cac');
  const re = () => { CLASSES.list[EDIT] = sanitizeClass(CLASSES.list[EDIT], EDIT); saveClasses(); buildCAC(); };
  root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { EDIT = +b.dataset.edit; CS.hover = null; buildCAC(); });
  root.querySelectorAll('[data-slot]').forEach(b => b.onclick = e => { e.stopPropagation(); CS.slot = b.dataset.slot; CS.hover = null; if (CS.slot === 'primary') CS.cat = WPN[c.primary].cls; if ((CS.slot === 'satt' || CS.slot === 'scamo') && !c.secondary) CS.slot = 'secondary'; buildCAC(); });
  root.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { CS.cat = b.dataset.cat; CS.hover = null; buildCAC(); });
  root.querySelectorAll('[data-item]').forEach(b => {
    b.onmouseenter = () => { CS.hover = b.dataset.item; const x = items.find(y => y.key === CS.hover); root.querySelector('.pdetail').innerHTML = x.detail + (x.dis && x.why ? `<div class="warn">選べません：${x.why}</div>` : ''); };
    b.onclick = () => {
      const k = b.dataset.item, x = items.find(y => y.key === k); if (!x || (x.dis && !x.on)) { sfxDeny(); return; }
      sfxClick(1500, 0.15, 0.03);
      if (s0 === 'primary') { c.primary = k; if (c.secondary === k) c.secondary = 'p9'; if (!camoUnlocked(c.pcamo, k)) c.pcamo = 'none'; c.att = c.att.filter(a => ATT[a].for.includes(WPN[k].cls)); }
      else if (s0 === 'secondary') { c.secondary = k || null; c.satt = []; if (c.secondary && !camoUnlocked(c.scamo, c.secondary)) c.scamo = 'none'; }
      else if (s0 === 'patt') c.att = c.att.includes(k) ? c.att.filter(a => a !== k) : c.att.concat(k);
      else if (s0 === 'satt') c.satt = c.satt.includes(k) ? c.satt.filter(a => a !== k) : c.satt.concat(k);
      else if (s0 === 'pcamo' || s0 === 'scamo') c[s0] = k;
      else if (s0 === 'lethal' || s0 === 'tactical') c[s0] = k;
      else if (s0.startsWith('perk')) { const i = +s0[4]; c.perks[i] = c.perks[i].includes(k) ? c.perks[i].filter(x => x !== k) : c.perks[i].concat(k); }
      else if (s0 === 'wild') {
        if (c.wild.includes(k)) {
          c.wild = c.wild.filter(x => x !== k);
          if (k === 'gf') c.att = c.att.slice(0, 2);
          if (k === 'sgf') c.satt = c.satt.slice(0, 1);
          if (k === 'ok' && c.secondary && !SECONDARIES.includes(c.secondary)) { c.secondary = 'p9'; c.satt = []; }
          if (/^g[123]$/.test(k)) { const i = +k[1] - 1; c.perks[i] = c.perks[i].slice(0, 1); }
        } else c.wild.push(k);
      } else if (s0 === 'streak') {
        const L = STREAK_SEL.list;
        if (L.includes(k)) { if (L.length > 1) STREAK_SEL.list = L.filter(x => x !== k); } else L.push(k);
        STREAK_SEL.list.sort((a, b) => STREAK_BY_ID[a].cost - STREAK_BY_ID[b].cost); saveJSON('ls_streaks', STREAK_SEL);
      }
      CS.hover = null; re();
    };
  });
  $('cname').onchange = e => { c.name = e.target.value.trim() || `カスタム${EDIT + 1}`; re(); };
  $('cacOk').onclick = () => { CLASSES.cur = EDIT; CLS = c; closeCAC(); };
  $('cacBack').onclick = () => closeCAC();
  $('cacReset').onclick = () => { CLASSES.list[EDIT] = JSON.parse(JSON.stringify(PRESETS[EDIT])); re(); };
}
// satt limit respects secondary gunfighter
const _sanitize0 = sanitizeClass;
function buildOpt(target) {
  const el = target || $('p-opt');
  const NUMLIM = { sens: [0.05, 50, 0.01], adsSens: [0.1, 3, 0.01], padSens: [1, 20, 0.5], fov: [65, 120, 1] };
  const sl = (k, label, min, max, step, fmt) => `<div class="row"><label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}" value="${SET[k]}" data-k="${k}">${NUMLIM[k] ? `<input type="number" class="num" min="${NUMLIM[k][0]}" max="${NUMLIM[k][1]}" step="${NUMLIM[k][2]}" value="${SET[k]}" data-n="${k}">` : `<span class="val" id="v_${k}">${fmt ? fmt(SET[k]) : SET[k]}</span>`}</div>`;
  el.innerHTML = `<h2>設定 <b>//</b></h2><div class="desc">変更は自動保存されます。</div>
  ${sl('sens', 'マウス感度', 0.5, 20, 0.05)}${sl('adsSens', 'ADS感度倍率', 0.3, 2, 0.05)}${sl('padSens', 'パッド感度', 1, 14, 1)}
  ${sl('fov', '視野角 (FOV)', 65, 120, 1)}${sl('vol', '音量', 0, 1, 0.05, v => Math.round(v * 100))}${sl('resScale', '描画解像度', 0.5, 1, 0.05, v => Math.round(v * 100) + '%')}
  <div class="row"><label>自動解像度（60fps維持）</label><input type="checkbox" id="autoRes" ${SET.autoRes ? 'checked' : ''}></div>
  <div class="row"><label>エイムアシスト</label><select id="aa"><option value="pad">パッドのみ（推奨）</option><option value="all">マウスでも有効</option><option value="off">オフ</option></select></div>
  <div class="row"><label>スライディング／飛び込み</label><select id="slideMode"><option value="hold">長押しで出す</option><option value="tap">押した瞬間に出す</option></select><span style="font-size:12px;color:var(--dim)">ダッシュを0.5秒以上続けているときだけ発動。それ以外は普通にしゃがみ／伏せ</span></div>
  <div class="row"><label>上下反転</label><input type="checkbox" id="inv" ${SET.invertY ? 'checked' : ''}></div>
  <div class="row"><label>FPS表示</label><input type="checkbox" id="fpsx" ${SET.fps ? 'checked' : ''}></div>
  <div class="sec" style="text-align:left">入力遅延</div>
  <div class="row"><label>低遅延モード（推奨）</label><input type="checkbox" id="lowLat" ${SET.lowLat ? 'checked' : ''}><span style="font-size:12px;color:var(--dim)">GPUが先の描画を溜め込まないようにして、マウス入力から画面までの遅れを減らす</span></div>
  <div class="row"><label>超低遅延描画 ※</label><input type="checkbox" id="desync" ${SET.desync ? 'checked' : ''}><span style="font-size:12px;color:var(--dim)">垂直同期を待たずに描画（Chrome系）。さらに速くなるが画面のズレ（ティアリング）が出ることがある</span></div>
  <div class="row"><label>アンチエイリアス ※</label><input type="checkbox" id="msaa" ${SET.msaa !== false ? 'checked' : ''}><span style="font-size:12px;color:var(--dim)">オフにするとGPU負荷が下がり、重い環境では遅延も減る</span></div>
  <div style="font-size:12px;color:var(--dim)">※ はページの再読み込み後に反映されます。</div>
  <div class="sec" style="text-align:left">キー割り当て</div>
  <div class="bnote" id="bnote">ボタンをクリック → 割り当てたいキーかマウスボタンを押す（Esc：取り消し ／ Backspace：解除）。左右2つまで登録できます。</div>
  <div class="binds" id="binds"></div>
  <button class="ghost" id="bBindReset" style="width:auto;display:inline-block;padding:7px 18px;margin-top:8px">初期設定に戻す</button>
  ${target ? '<button class="go" id="bOptBack">戻る</button>' : ''}`;
  buildBinds(el);
  el.querySelector('#aa').value = SET.aa;
  el.querySelector('#slideMode').value = SET.slideMode === 'tap' ? 'tap' : 'hold';
  el.querySelector('#slideMode').onchange = e => { SET.slideMode = e.target.value; saveJSON('ls_set', SET); buildHelp(); };
  el.querySelectorAll('input[type=range]').forEach(r => r.oninput = () => {
    const k = r.dataset.k; SET[k] = +r.value;
    const v = el.querySelector('#v_' + k); if (v) v.textContent = k === 'vol' ? Math.round(SET.vol * 100) : k === 'resScale' ? Math.round(SET.resScale * 100) + '%' : r.value;
    const n = el.querySelector(`[data-n="${k}"]`); if (n) n.value = r.value;
    if (AU.master) AU.master.gain.value = SET.vol; saveJSON('ls_set', SET);
  });
  el.querySelectorAll('input.num').forEach(n => {
    const k = n.dataset.n, [mn, mx] = NUMLIM[k];
    const apply = commit => { const v = parseFloat(n.value); if (!isFinite(v)) { if (commit) n.value = SET[k]; return; } const c = clamp(v, mn, mx); SET[k] = Math.round(c * 1000) / 1000; const r = el.querySelector(`input[type=range][data-k="${k}"]`); if (r) r.value = SET[k]; if (commit) n.value = SET[k]; saveJSON('ls_set', SET); };
    n.oninput = () => apply(false); n.onchange = () => apply(true);
    n.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') n.blur(); };
  });
  el.querySelector('#aa').onchange = e => { SET.aa = e.target.value; saveJSON('ls_set', SET); };
  el.querySelector('#inv').onchange = e => { SET.invertY = e.target.checked; saveJSON('ls_set', SET); };
  el.querySelector('#fpsx').onchange = e => { SET.fps = e.target.checked; saveJSON('ls_set', SET); };
  for (const id of ['lowLat', 'desync', 'msaa']) el.querySelector('#' + id).onchange = e => { SET[id] = e.target.checked; saveJSON('ls_set', SET); };
  el.querySelector('#autoRes').onchange = e => { SET.autoRes = e.target.checked; R.dyn = 1; saveJSON('ls_set', SET); };
}
function buildBinds(el) {
  const box = el.querySelector('#binds'), note = el.querySelector('#bnote');
  const draw = () => {
    box.innerHTML = BIND_GROUPS.map(([g, acts]) => `<div class="bgrp">${g}</div>` + acts.map(k => `<div class="brow"><span title="${BIND_LABEL[k]}">${BIND_LABEL[k]}</span>${[0, 1].map(i => `<button class="bkey${BIND[k][i] ? '' : ' empty'}" data-a="${k}" data-i="${i}">${keyName(BIND[k][i])}</button>`).join('')}</div>`).join('')).join('');
    box.querySelectorAll('.bkey').forEach(b => b.onclick = ev => {
      ev.stopPropagation();
      box.querySelectorAll('.bkey.wait').forEach(x => x.classList.remove('wait'));
      b.classList.add('wait'); b.textContent = '入力待ち…';
      setTimeout(() => {
        IN.listen = code => {
          if (code === null) { note.textContent = '取り消しました。'; draw(); return; }
          if (code === 'Escape') { draw(); return; }
          const moved = setBind(b.dataset.a, +b.dataset.i, code);
          note.textContent = code ? `${BIND_LABEL[b.dataset.a]} に ${keyName(code)} を割り当てました。` + (moved && moved !== b.dataset.a ? `（「${BIND_LABEL[moved]}」は ${BIND[moved].filter(Boolean).map(keyName).join(' / ') || '未割り当て'} になりました）` : '') : `${BIND_LABEL[b.dataset.a]} の割り当てを解除しました。`;
          draw(); buildHelp();
        };
      }, 0);
    });
  };
  draw();
  el.querySelector('#bBindReset').onclick = () => { IN.listen = null; resetBinds(); note.textContent = '初期設定に戻しました。'; draw(); buildHelp(); };
}
function buildHelp() {
  $('p-help').innerHTML = `<h2>操作方法 <b>//</b></h2>
  <div style="display:flex;gap:40px;flex-wrap:wrap">
  <table class="keys"><tr><td colspan=2 style="color:var(--acc)">キーボード / マウス</td></tr>
  ${(() => { const kk = a => BIND[a].filter(Boolean).map(keyName).join(' / ') || '—'; return `<tr><td>${kk('fwd')} ${kk('left')} ${kk('back')} ${kk('right')}</td><td>移動</td></tr><tr><td>マウス</td><td>視点</td></tr><tr><td>${kk('ads')}</td><td>ADS（覗く）</td></tr><tr><td>${kk('fire')}</td><td>射撃</td></tr>
  <tr><td>${kk('sprint')}</td><td>ダッシュ（押しっぱなしでもOK） ／ スコープ中は息止め</td></tr><tr><td>${kk('jump')}</td><td>ジャンプ・乗り越え</td></tr>
  <tr><td>${kk('crouch')}</td><td>しゃがみ（押し続けると伏せ）／ ダッシュ0.5秒以上で${SET.slideMode === 'tap' ? '押すと' : '長押しで'}スライディング</td></tr><tr><td>${kk('prone')}</td><td>伏せ ／ ダッシュ0.5秒以上で${SET.slideMode === 'tap' ? '押すと' : '長押しで'}飛び込み</td></tr>
  <tr><td>${kk('reload')}</td><td>リロード</td></tr><tr><td>${kk('w1')} / ${kk('w2')} / ホイール</td><td>武器切替</td></tr><tr><td>${kk('use')}</td><td>購入・使用・修理（ゾンビ）</td></tr><tr><td>ホイール（スコープ中）</td><td>倍率切替（可変ズーム装着時）</td></tr>
  <tr><td>${kk('melee')}</td><td>ナイフ</td></tr><tr><td>${kk('lethal')}</td><td>リーサル（長押しでクッキング、C4は再押しで起爆）</td></tr><tr><td>${kk('tactical')}</td><td>タクティカル</td></tr><tr><td>${kk('s1')} / ${kk('s2')} / ${kk('s3')}</td><td>スコアストリーク</td></tr><tr><td>${kk('board')}</td><td>スコアボード</td></tr><tr><td>Esc</td><td>一時停止・クラス変更</td></tr>`; })()}
  <tr><td colspan=2 style="color:var(--dim);font-size:12px">キーは「設定 → キー割り当て」で変更できます</td></tr></table>
  <table class="keys"><tr><td colspan=2 style="color:var(--acc)">ゲームパッド</td></tr>
  <tr><td>左スティック</td><td>移動</td></tr><tr><td>右スティック</td><td>視点</td></tr><tr><td>LT / RT</td><td>ADS / 射撃</td></tr>
  <tr><td>L3</td><td>ダッシュ ／ 息止め</td></tr><tr><td>R3</td><td>ナイフ</td></tr><tr><td>A</td><td>ジャンプ（スライディング中はキャンセルジャンプ）</td></tr><tr><td>B</td><td>しゃがみ（押し続けると伏せ）／ ダッシュ0.5秒以上でスライディング</td></tr><tr><td>十字↓（ダッシュ0.5秒以上）</td><td>飛び込み</td></tr>
  <tr><td>X</td><td>リロード / 購入</td></tr><tr><td>Y</td><td>武器切替</td></tr><tr><td>RB / LB</td><td>リーサル / タクティカル</td></tr><tr><td>十字← → ↓</td><td>ストリーク1/2/3（↓はダッシュ中以外）</td></tr><tr><td>十字↑</td><td>倍率切替</td></tr><tr><td>Start / Back</td><td>一時停止 / スコア</td></tr></table>
  </div>`;
}
function buildPause() {
  const box = $('pause').querySelector('.box');
  box.innerHTML = `<h2>一時停止</h2><div style="color:var(--dim);font-size:13px;margin-bottom:8px">${MAPS[W.id].name}</div>
    <button class="go" id="bResume">再開</button>
    ${G.mode === 'zombies' || G.mode === 'gun' || G.online ? '<div style="display:none">' : '<div>'}<div class="sec" style="text-align:left">クラス変更（次のリスポーンで反映）</div>
    <div class="chips" style="justify-content:center">${CLASSES.list.map((c, i) => chip((G.pendingClass >= 0 ? G.pendingClass : CLASSES.cur) === i, esc(c.name), WPN[c.primary].name, `data-pc="${i}" style="min-width:90px"`)).join('')}</div></div>
    <button class="ghost" id="bPauseOpt">設定</button><button class="ghost" id="bQuit">${G.online ? '試合から抜ける（退出）' : 'メニューに戻る'}</button>`;
  $('bResume').onclick = resume; $('bQuit').onclick = () => { if (G.online) { netLeave(); toMenu(); showPanel('online'); } else toMenu(); }; $('bPauseOpt').onclick = pauseOpt;
  box.querySelectorAll('[data-pc]').forEach(b => b.onclick = () => { const i = +b.dataset.pc; G.pendingClass = i === CLASSES.cur ? -1 : i; if (!G.player.alive && G.pendingClass >= 0) { } buildPause(); });
}
function pauseOpt() {
  const box = $('pause').querySelector('.box');
  const div = document.createElement('div'); div.className = 'panel'; div.style.textAlign = 'left'; box.innerHTML = ''; box.appendChild(div); buildOpt(div);
  div.querySelector('#bOptBack').onclick = buildPause;
}
$('bAgain').onclick = startGame;
$('bEndMenu').onclick = () => { const wasOnline = G.online; G.online = false; $('bAgain').style.display = ''; $('bEndMenu').textContent = 'メニューに戻る'; toMenu(); if (wasOnline || ON.code) showPanel('online'); };
$('gl').addEventListener('click', () => { if (G.running && !G.paused && !IN.locked) lockPointer(); });

// ---------- boot ----------
function boot() {
  try {
    glInit($('gl'));
  } catch (e) {
    document.body.innerHTML = `<div style="padding:40px;font-family:sans-serif;color:#fff">WebGLを初期化できませんでした。ハードウェアアクセラレーションを有効にしたブラウザで開いてください。<br><small>${esc(e.message)}</small></div>`;
    return;
  }
  buildMap(G.map = 'yard');
  setupMenuCam();
  showPanel('play');
  requestAnimationFrame(frame);
}
boot();
