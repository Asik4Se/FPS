// ============================================================
//  ONLINE: rooms / lobby / netplay client (server: server/server.js)
// ============================================================
const ON = { ws: null, id: 0, code: '', lobby: null, status: '', err: '', clock: new NET.Clock(), remotes: new Map(), interp: new Map(),
  pend: new Map(), localBots: new Map(), isHost: false, sendAcc: 0, pingT: 0, endAt: 0, myTeam: null, hpSrv: 100, connecting: false, lastSnapT: 0 };
const WIDS = Object.keys(WPN);
const others = () => G.online && ON.remotes.size ? G.bots.concat([...ON.remotes.values()]) : G.bots;
const nowS = () => performance.now() / 1000;
// server URL: same origin when the page is served by the game server, otherwise the saved URL (e.g. https://xxx.onrender.com)
const ON_SAME = /^https?:$/.test(location.protocol) && !/claude|anthropic|localhost:0/.test(location.host) && location.host !== '';
function onServerURL() {
  if (ON_SAME) return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  const u = (localStorage.getItem('ls_srv') || '').trim(); if (!u) return '';
  return u.replace(/^http/, 'ws').replace(/\/+$/, '') + '/ws';
}
const onName = () => (localStorage.getItem('ls_name') || '').trim() || 'Player';
function netSend(o) { if (ON.ws && ON.ws.readyState === 1) ON.ws.send(JSON.stringify(o)); }
function netConnect(then) {
  if (ON.ws && ON.ws.readyState === 1) { then && then(); return; }
  const url = onServerURL(); if (!url) { ON.err = 'サーバーのURLを入力してください'; buildOnline(); return; }
  ON.connecting = true; ON.err = ''; buildOnline();
  let ws; try { ws = new WebSocket(url); } catch (e) { ON.connecting = false; ON.err = '接続できませんでした'; buildOnline(); return; }
  ws.binaryType = 'arraybuffer'; ON.ws = ws;
  ws.onopen = () => { ON.connecting = false; for (let i = 0; i < 4; i++) setTimeout(() => netSend({ t: 'ping', c: nowS() }), i * 120); then && then(); };
  ws.onclose = () => { ON.ws = null; ON.connecting = false; const wasIn = !!ON.code; ON.code = ''; ON.lobby = null; if (G.online && G.running) { G.online = false; toMenu(); } if (wasIn) ON.err = 'サーバーとの接続が切れました'; buildOnline(); };
  ws.onerror = () => { ON.err = '接続できませんでした（サーバーが起動中なら1分ほど待って再試行）'; };
  ws.onmessage = ev => { if (typeof ev.data === 'string') { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } netMsg(m); } else netSnap(ev.data); };
}
function netLeave() { netSend({ t: 'leave' }); ON.code = ''; ON.lobby = null; G.online = false; buildOnline(); }

// ---------------- messages ----------------
function netMsg(m) {
  switch (m.t) {
    case 'pong': ON.clock.sample(m.c, m.s, nowS()); break;
    case 'joined': ON.id = m.id; ON.code = m.code; ON.err = ''; break;
    case 'error': ON.err = m.msg; buildOnline(); break;
    case 'lobby': {
      ON.lobby = m; const me = m.players.find(p => p.id === ON.id); ON.myTeam = me ? me.team : null;
      if (G.online && G.running && m.state === 'lobby') { G.online = false; toMenu(); showPanel('online'); }
      if ($('p-online') && $('p-online').style.display !== 'none') buildOnline();
      break;
    }
    case 'start': netStart(m); break;
    case 'spawned': { const b = ON.remotes.get(m.id); if (b && !b.alive) { b.alive = true; b.hp = 100; b.pose = null; } break; }
    case 'shot': {
      const b = ON.remotes.get(m.id); if (!b || !G.running) break;
      b.firedT = G.time;
      if (m.o && m.e) G.tracers.push({ a: m.o, b: m.e, t: 0, life: 0.06, bot: 1 });
      const P = G.player, dist = V.dist(b.pos, P.pos), rel = angDiff(P.camYaw, Math.atan2(-(b.pos[0] - P.pos[0]), -(b.pos[2] - P.pos[2])));
      sfxShot(m.k || 'ar', dist, clamp(-Math.sin(rel), -1, 1) * 0.8, !!m.s);
      break;
    }
    case 'dmg': {
      if (!G.online) break;
      const P = G.player;
      if (m.id === ON.id) {
        P.hp = m.hp; ON.hpSrv = m.hp; P.lastDmgT = G.time; const sc = isScoped(P) ? 1.6 : 1, tough = hasPerk('tough') ? 0.25 : 1;
        P.flinchP += rand(1.2, 2.6) * tough * sc; P.flinchY += rand(-1.5, 1.5) * tough * sc; if (m.from) P.dmgDirs.push({ from: m.from, t: G.time }); sfxHurt();
      }
      break;
    }
    case 'kill': netKill(m); break;
    case 'mode': {
      if (!G.online) break;
      G.teamScore = { A: m.ts[ON.myTeam || 'A'] || 0, B: m.ts[ON.myTeam === 'B' ? 'A' : 'B'] || 0 };
      G.flags = m.flags.map(f => ({ name: f.name, pos: f.pos, owner: localTeam(f.owner), cap: f.cap, capTeam: localTeam(f.capTeam) }));
      const old = new Map(G.tags.map(t => [t.id, t]));
      G.tags = m.tags.map(t => ({ id: t.id, pos: t.pos, team: localTeam(t.team), t: old.has(t.id) ? old.get(t.id).t : 0 }));
      break;
    }
    case 'cap': {
      if (!G.online) break;
      const mine = m.team === ON.myTeam; popup(`${m.flag} を${mine ? '確保' : '奪われた'}`, mine ? TEAMC.A : TEAMC.B); sfxUAV();
      if (m.ids.includes(ON.id)) popup('旗確保 +150', '#fff');
      for (const id in (m.sc || {})) { const e = +id === ON.id ? G.player : ON.remotes.get(+id) || ON.localBots.get(+id); if (e) e.score = m.sc[id]; }
      break;
    }
    case 'tag': { const e = m.id === ON.id ? G.player : ON.remotes.get(m.id) || ON.localBots.get(m.id); if (e && m.sc != null) e.score = m.sc; } if (m.id === ON.id) { popup(m.kind === 'confirm' ? 'キル確定 +50' : 'キル阻止 +50', m.kind === 'confirm' ? '#ffcf5a' : '#9fd7ff'); sfxBuy(); } break;
    case 'joinMid': if (G.online && !ON.remotes.has(m.info.id)) netMakeRemote(m.info); popup(`${m.info.name} が参加しました`, '#bbb'); break;
    case 'left': {
      const b = ON.remotes.get(m.id) || ON.localBots.get(m.id);
      if (b) { G.ents = G.ents.filter(e => e !== b); G.bots = G.bots.filter(e => e !== b); ON.remotes.delete(m.id); ON.interp.delete(m.id); ON.localBots.delete(m.id); }
      if (!(b && (b.netBot || b.isBotRemote))) popup(`${m.name} が退出しました`, '#bbb');
      break;
    }
    case 'end': netEnd(m); break;
    case 'chat': popup(`${m.name}: ${m.msg}`, '#9fd7ff'); break;
  }
}
function netSnap(buf) {
  const s = NET.decodeSnapshot(buf); ON.lastSnapT = s.t;
  for (const e of s.ents) {
    if (e.id === ON.id) { ON.hpSrv = e.hp; if (G.online && G.player.alive && e.alive) G.player.hp = e.hp; continue; }
    const lb = ON.localBots.get(e.id); if (lb) { lb.hp = e.hp; continue; }
    let b = ON.remotes.get(e.id);
    if (!b && G.online) { const info = ON.lobby && ON.lobby.players.find(p => p.id === e.id); b = netMakeRemote(info || { id: e.id, name: 'Player' + e.id }); }
    if (b) ON.interp.get(e.id).push(s.t, e, ON.clock.server(nowS()));
  }
}
const localTeam = t => !t ? null : t === ON.myTeam ? 'A' : 'B';
function netMakeRemote(info) {
  const b = makeEnt(info.name, false);
  Object.assign(b, { isRemote: true, netId: info.id, team: localTeam(info.team), skin: BOT_SKINS[info.id % BOT_SKINS.length], stance: 'stand', pose: null, walkT: 0,
    alive: false, deathT: -99, kills: info.kills || 0, deaths: info.deaths || 0, score: info.score || 0, wd: WPN.ar94, ads: 0, prevPos: null, isBotRemote: !!info.bot });
  G.ents.push(b); ON.remotes.set(info.id, b); ON.interp.set(info.id, new NET.Interp());
  return b;
}

// ---------------- match flow ----------------
function netStart(m) {
  ON.myTeam = (m.players.find(p => p.id === ON.id) || {}).team || null;
  G.mode = m.mode; G.map = m.map;
  audioInit(); buildMap(m.map);
  Object.assign(G, { ents: [], bots: [], zombies: [], time: 0, over: false, tracers: [], parts: [], projs: [], killfeed: [], popups: [], uavT: 0, lastHitInfo: null,
    stats: null, menuCam: false, pendingClass: -1, smokes: [], sensors: [], drones: [], sentries: [], timers: [], flags: [], tags: [], teamScore: { A: 0, B: 0 }, cuavT: 0, vsatT: 0, enemyUavT: 0, swarm: null, zm: null, winner: null });
  G.online = true; G.scoreLimit = m.limit; G.diff = m.diff | 0; ON.endAt = m.endAt; ON.remotes.clear(); ON.interp.clear(); ON.pend.clear(); ON.localBots.clear();
  ON.isHost = m.host === ON.id;
  CLS = CLASSES.list[CLASSES.cur];
  const P = newPlayer(); P.name = onName(); P.netId = ON.id; G.player = P; G.ents.push(P);
  const meInfo = m.players.find(p => p.id === ON.id) || {};
  P.team = MODES[G.mode].team ? 'A' : null; P.gg = meInfo.gg || 0; P.kills = meInfo.kills || 0; P.deaths = meInfo.deaths || 0; P.score = meInfo.score || 0;
  let bi = 0;
  for (const info of m.players) {
    if (info.id === ON.id) continue;
    if (info.bot && ON.isHost) { // the host simulates the bots with the normal offline AI
      const b = newBot(bi++); Object.assign(b, { name: info.name, netId: info.id, netBot: true, team: localTeam(info.team), gg: info.gg || 0, kills: info.kills || 0, deaths: info.deaths || 0, score: info.score || 0, nadeT: 1e9 });
      G.bots.push(b); G.ents.push(b); ON.localBots.set(info.id, b);
    } else { const r = netMakeRemote(info); r.gg = info.gg || 0; }
  }
  spawnEnt(P); P.spawnT = G.time;
  for (const b of G.bots) { spawnEnt(b); resetBotAI(b); }
  if (G.mode === 'dom' && ON.isHost) { setupDom(); netSend({ t: 'modeInit', flags: G.flags.map(f => f.pos) }); }
  G.flags = []; G.tags = [];
  G.running = true; G.paused = false;
  popup(`${MAPS[W.id].name} — ${MODES[G.mode].name}（オンライン）`, '#fff');
  $('menu').classList.remove('on'); $('endscr').classList.remove('on'); $('pause').classList.remove('on');
  resume();
}
function netKill(m) {
  if (!G.online) return;
  const P = G.player, ent = id => id === ON.id ? P : ON.remotes.get(id) || ON.localBots.get(id);
  for (const id in m.k) { const e = ent(+id); if (e) [e.kills, e.deaths, e.score] = m.k[id]; }
  if (m.ts) G.teamScore = { A: m.ts[ON.myTeam || 'A'] || 0, B: m.ts[ON.myTeam === 'A' ? 'B' : 'A'] || 0 };
  const killer = ent(m.killer), victim = ent(m.victim), wd = WPN[m.w] || (m.zone === 'melee' ? null : null);
  const wname = m.zone === 'melee' ? 'ナイフ' : wd ? wd.name : '';
  G.killfeed.push({ k: killer ? killer.name : '', v: victim ? victim.name : '', w: wname, hs: m.zone === 'head', t: G.time, kp: m.killer === ON.id, vp: m.victim === ON.id });
  if (G.killfeed.length > 6) G.killfeed.shift();
  if (m.victim === ON.id) {
    P.alive = false; P.hp = 0; P.respawnT = 3; P.deathT = G.time; P.deathYaw = P.yaw; P.deathCam = 0; P.ads = 0; P.cookT = 0;
    P.killer = killer ? { name: killer.name, wpn: wname } : null;
  } else if (victim) { victim.alive = false; victim.hp = 0; victim.deathT = G.time; victim.respawnT = 3.5; }
  // gun game ladder (server decides levels)
  for (const id in (m.gg || {})) {
    const e = ent(+id); if (!e) continue; const lv = m.gg[id], up = lv > (e.gg || 0); e.gg = lv;
    if (e === P) { const n = WPN[ggWeaponId(P)]; popup(up ? `昇格: ${n.name}（${lv + 1}/${GUNGAME.length}）` : '降格…', up ? '#ffcf5a' : '#ff6a5a'); if (up) sfxUAV(); setTimeout(() => { if (G.online && P.alive) ggEquip(P); }, 150); }
    else if (e.netBot) ggEquip(e);
  }
  if (m.killer === ON.id) {
    P.hitT = G.time; P.hitKill = true; sfxHit(true);
    popup(`+${m.pts}`, '#ffcf5a'); if (m.zone === 'head') popup('ヘッドショット', '#fff'); if (m.zone === 'melee') popup('ナイフキル', '#fff');
  }
}
function netEnd(m) {
  if (!G.online) return;
  G.over = true;
  const P = G.player, team = MODES[G.mode].team;
  for (const q of m.players) { const e = q.id === ON.id ? P : ON.remotes.get(q.id) || ON.localBots.get(q.id); if (e) { e.kills = q.kills; e.deaths = q.deaths; e.score = q.score; } }
  setTimeout(() => {
    if (document.exitPointerLock) document.exitPointerLock();
    let title, win;
    if (team) { win = m.winner === ON.myTeam; title = m.winner ? (win ? '勝利' : '敗北') : '引き分け'; }
    else { win = m.winner === ON.id; title = win ? '勝利' : '敗北'; const w = m.players.find(q => q.id === m.winner); if (w && !win) title = `敗北 — 勝者 ${w.name}`; }
    const ts = m.ts || {}, mine = ON.myTeam, other = mine === 'A' ? 'B' : 'A';
    $('endTitle').textContent = title; $('endTitle').style.color = win ? 'var(--acc)' : '#ff6a5a';
    $('endSub').textContent = `${MAPS[W.id].name} ${MODES[G.mode].name}（オンライン）` + (team ? ` — 味方 ${ts[mine] || 0} : 敵 ${ts[other] || 0}` : '');
    const rows = m.players.slice().sort((a, b) => b.score - a.score || b.kills - a.kills);
    $('endtable').innerHTML = `<tr><th>#</th><th>プレイヤー</th><th>スコア</th><th>キル</th><th>デス</th></tr>` + rows.map((q, i) => `<tr class="${q.id === ON.id ? 'me' : ''}"><td>${i + 1}</td><td style="color:${q.team ? TEAMC[q.team === mine ? 'A' : 'B'] : 'inherit'}">${esc(q.name)}</td><td>${q.score}</td><td>${q.kills}</td><td>${q.deaths}</td></tr>`).join('');
    $('bAgain').style.display = 'none'; $('bEndMenu').textContent = 'ロビーに戻る';
    $('endscr').classList.add('on');
  }, 1200);
}
// called from spawnEnt for the local player
function netOnSpawn(e) { netSend({ t: 'spawn', id: e.netBot ? e.netId : 0, pos: e.pos }); }
// online: no lethals / tacticals / scorestreaks / class hot-swap (guns + knife only for now)
function netFilter(a) { a.lethalP = a.lethalHeld = a.tacP = false; a.streakP = -1; }
const ON_MODES = ['ffa', 'tdm', 'dom', 'kc', 'gun'];
// hit claims are aggregated per target per frame (shotgun pellets -> one message)
function netClaim(e, dmg, src, d, zone, dir) {
  if (zone === 'explosive' || zone === 'fall') return; // not supported online yet
  const by = src.netBot ? src.netId : 0, k = by + ':' + e.netId;
  const c = ON.pend.get(k) || { target: e.netId, by, dmg: 0, zone: null, w: d ? WIDS.find(id => WPN[id] === d) || '' : (zone === 'melee' ? 'knife' : ''), o: src.netBot ? botEye(src) : eyePos(src), d: dir ? dir.slice() : [0, 0, -1] };
  c.dmg += dmg; if (zone === 'head' || !c.zone || zone === 'melee') c.zone = zone; ON.pend.set(k, c);
  if (src.isPlayer) { src.hitT = G.time; src.hitKill = false; sfxHit(false); }
}
function netShot(o, e, kind, sup, id) { netSend({ t: 'shot', id: id || 0, o: o.map(v => +v.toFixed(2)), e: e.map(v => +v.toFixed(2)), k: kind, s: sup ? 1 : 0 }); }
const NOACT = { mx: 0, my: 0, lookX: 0, lookY: 0, mouseX: 0, mouseY: 0, fire: false, fireP: false, ads: false, swapTo: -1, streakP: -1 };
// per frame (also while the pause menu is open)
function netTick(dt) {
  if (!G.online || !G.running) return;
  const P = G.player, tl = nowS(), srvNow = ON.clock.server(tl);
  ON.pingT -= dt; if (ON.pingT <= 0) { ON.pingT = 1; netSend({ t: 'ping', c: tl }); }
  G.timeLeft = Math.max(0, ON.endAt - srvNow);
  // flush hit claims (lag compensation: tell the server what time we were looking at)
  for (const c of ON.pend.values()) {
    const it = ON.interp.get(c.target), vt = c.by || !it ? srvNow - 0.02 : srvNow - it.delay; // bots on the host see the latest positions
    netSend({ t: 'hit', target: c.target, by: c.by, dmg: +c.dmg.toFixed(1), zone: c.zone, w: c.w, vt, o: c.o.map(v => +v.toFixed(3)), d: c.d.map(v => +v.toFixed(4)) });
  }
  ON.pend.clear();
  // upload own state every frame (capped at 60/s)
  ON.sendAcc += dt;
  if (ON.sendAcc >= 1 / 31 && ON.ws && ON.ws.readyState === 1) {
    ON.sendAcc = 0;
    const st = P.stance === 'prone' || P.diving ? 'prone' : P.stance === 'crouch' || P.slideT > 0 ? 'crouch' : 'stand';
    ON.ws.send(NET.encodeSnapshot(srvNow, 0, [{ id: ON.id, pos: P.pos, yaw: P.yaw, pitch: P.pitch, stance: st, alive: P.alive, ads: P.ads, sprint: P.sprint, hp: P.hp, wpnIdx: Math.max(0, WIDS.indexOf(curW(P).id)) }]));
    if (ON.isHost && G.bots.length) {
      const bb = NET.encodeSnapshot(srvNow, 0, G.bots.map(b => ({ id: b.netId, pos: b.pos, yaw: b.yaw, pitch: b.pitch || 0, stance: b.stance || 'stand', alive: b.alive, ads: 0, sprint: false, hp: b.hp, wpnIdx: Math.max(0, WIDS.indexOf(Object.keys(WPN).find(k => WPN[k] === b.wd) || 'ar94')) })));
      new DataView(bb).setUint8(0, 4); ON.ws.send(bb);
    }
  }
  // remote players from the interpolation buffers
  for (const [id, b] of ON.remotes) {
    const s = ON.interp.get(id).sample(srvNow, dt); if (!s) continue;
    const prev = b.pos;
    b.pos = NET.smoothRemote(b, s.pos, dt).slice(); b.yaw = s.yaw; b.pitch = s.pitch; b.stance = s.stance; b.ads = s.ads; b.sprint = s.sprint;
    b.h = s.stance === 'prone' ? 0.62 : s.stance === 'crouch' ? 1.3 : 1.8; b.eyeH = b.h - 0.18;
    if (s.alive && !b.alive && G.time - b.deathT > 0.5) { b.alive = true; b.pose = null; }
    const wd = WPN[WIDS[s.wpnIdx]]; if (wd) b.wd = wd;
    if (prev) { const sp = Math.hypot(b.pos[0] - prev[0], b.pos[2] - prev[2]) / Math.max(dt, 1e-3); b.vel = [0, 0, 0]; b.walkT = (b.walkT || 0) + dt * Math.min(sp, 9) * 2.0; }
    rigUpdate(b, dt);
  }
}
// ---------------- lobby UI ----------------
function buildOnline() {
  const el = $('p-online'); if (!el) return;
  const L = ON.lobby, inRoom = !!(ON.code && L), ping = ON.clock.samples.length ? Math.round(ON.clock.rtt * 1000) : null;
  let h = `<h2>オンライン <b>//</b></h2><div class="desc">部屋を作って4文字のコードを友達に教えると、一緒に対戦できます。${ping != null && ON.ws ? `　<span style="color:var(--acc2)">Ping ${ping}ms</span>` : ''}</div>`;
  if (!inRoom) {
    h += `<div class="row"><label>名前</label><input class="num" style="width:200px" id="onName" maxlength="16" value="${esc(onName())}"></div>`;
    if (!ON_SAME) h += `<div class="row"><label>サーバーURL</label><input class="num" style="width:320px" id="onSrv" placeholder="https://xxxx.onrender.com" value="${esc(localStorage.getItem('ls_srv') || '')}"></div>`;
    h += `<div class="row"><button class="go" id="onCreate" style="width:auto;margin:0">部屋を作る</button></div>
      <div class="row"><label>部屋コードで参加</label><input class="num" style="width:110px;text-transform:uppercase;letter-spacing:.2em" id="onCode" maxlength="4" placeholder="ABCD"><button class="ghost" id="onJoin" style="width:auto;margin:0">参加</button></div>`;
    h += `<div class="bnote" style="color:${ON.err ? '#ff8a6a' : 'var(--dim)'}">${ON.connecting ? '接続中…' : esc(ON.err || '')}</div>`;
    h += `<div style="font-size:12px;color:var(--dim);line-height:1.8;margin-top:8px">オンラインではメイン・サブ武器とナイフで戦います（リーサル・タクティカル・ストリークは今後対応）。クラスは「クラス作成」で選んだものを使います。</div>`;
    el.innerHTML = h;
    const saveName = () => { const v = $('onName').value.trim().slice(0, 16); localStorage.setItem('ls_name', v); if (ON.code) netSend({ t: 'name', name: v }); };
    $('onName').onchange = saveName;
    if ($('onSrv')) $('onSrv').onchange = e => localStorage.setItem('ls_srv', e.target.value.trim());
    $('onCreate').onclick = () => { saveName(); if ($('onSrv')) localStorage.setItem('ls_srv', $('onSrv').value.trim()); netConnect(() => netSend({ t: 'create', name: onName() })); };
    $('onJoin').onclick = () => { saveName(); if ($('onSrv')) localStorage.setItem('ls_srv', $('onSrv').value.trim()); const c = $('onCode').value.trim().toUpperCase(); if (c.length !== 4) { ON.err = 'コードは4文字です'; buildOnline(); return; } netConnect(() => netSend({ t: 'join', code: c, name: onName() })); };
    el.querySelectorAll('input').forEach(i => i.onkeydown = e => e.stopPropagation());
    return;
  }
  const host = L.host === ON.id, S = L.settings, team = !!MODES[S.mode].team, edit = host && L.state === 'lobby', dis = edit ? '' : 'disabled';
  const humans = L.players.length, maxBots = Math.max(0, 18 - humans);
  h += `<div class="olob-top"><div class="olob-code">${L.code}</div><div class="olob-meta">部屋コード（友達に教えてください） ／ ${humans}/12人${S.bots ? ` ＋ Bot ${Math.min(S.bots, maxBots)}体` : ''} ${L.state === 'play' ? '／ <b style="color:#ff8a6a">試合中</b>' : ''}</div></div>`;
  const pl = (p, t) => `<div class="olob-p" style="border-left-color:${t ? (t === 'A' ? '#5ab0ff' : '#ff6a5a') : 'var(--line)'}">${p.id === L.host ? '<b class="olob-host">ホスト</b>' : ''}${esc(p.name)}${p.id === ON.id ? '<i>（あなた）</i>' : ''}</div>`;
  let left = '';
  if (team) left = ['A', 'B'].map(t => `<div class="olob-team"><div class="bgrp" style="color:${t === 'A' ? '#5ab0ff' : '#ff6a5a'}">チーム${t === 'A' ? 'アルファ' : 'ブラボー'}</div>${L.players.filter(p => p.team === t).map(p => pl(p, t)).join('') || '<div class="olob-empty">—</div>'}${L.state === 'lobby' && ON.myTeam !== t ? `<button class="ghost olob-sm" data-team="${t}">このチームに移る</button>` : ''}</div>`).join('');
  else left = `<div class="bgrp">プレイヤー</div>` + L.players.map(p => pl(p, null)).join('');
  if (S.bots) left += `<div class="olob-empty" style="margin-top:8px">＋ Bot ${Math.min(S.bots, maxBots)}体（${DIFFS[S.diff].name}）${team ? ' — 人数の少ないチームに自動で入ります' : ''}</div>`;
  const M = MODES[S.mode];
  let right = `<div class="lbl">ゲームモード</div><div class="olob-chips">${ON_MODES.map(k => `<button class="chip${S.mode === k ? ' on' : ''}" data-mode="${k}" ${dis}><b>${MODES[k].name}</b><i>${MODES[k].short}</i></button>`).join('')}</div>
    <div class="olob-desc">${M.desc}</div>
    <div class="lbl">マップ</div><div class="olob-chips">${['yard', 'downtown', 'outpost', 'village', 'depot', 'random'].map(k => `<button class="chip${S.map === k ? ' on' : ''}" data-map="${k}" ${dis}><b>${k === 'random' ? 'ランダム' : MAPS[k].name}</b></button>`).join('')}</div>
    <div class="olob-grid">
      <label>制限時間</label><select id="onTime" ${dis}>${[300, 600, 900, 1200].map(v => `<option value="${v}" ${S.time === v ? 'selected' : ''}>${v / 60}分</option>`).join('')}</select>
      <label>目標${M.unit}</label><select id="onLimit" ${dis || (S.mode === 'gun' ? 'disabled' : '')}>${(S.mode === 'gun' ? [GUNGAME.length] : M.limits).concat(S.mode === 'gun' ? [] : [S.limit]).filter((v, i, a) => a.indexOf(v) === i).map(v => `<option value="${v}" ${S.limit === v ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <label>Botの数</label><select id="onBots" ${dis}>${Array.from({ length: 16 }, (_, i) => i).map(v => `<option value="${v}" ${S.bots === v ? 'selected' : ''}>${v ? v + '体' : 'なし'}</option>`).join('')}</select>
      <label>Botの強さ</label><select id="onDiff" ${dis}>${DIFFS.map((d, i) => `<option value="${i}" ${S.diff === i ? 'selected' : ''}>${d.name}</option>`).join('')}</select>
    </div>
    ${host ? '' : '<div class="olob-desc">ルールはホストが決めます。</div>'}`;
  left += `<div class="lbl" style="margin-top:14px">使用クラス${S.mode === 'gun' ? '（ガンゲームでは使いません）' : ''}</div><div class="olob-cls">${CLASSES.list.map((c, i) => `<button class="olob-c${CLASSES.cur === i ? ' on' : ''}" data-cls="${i}"><b>${esc(c.name)}</b><i>${WPN[c.primary].name}</i></button>`).join('')}</div>`;
  h += `<div class="olob-body"><div class="olob-left">${left}</div><div class="olob-right">${right}</div></div>`;
  h += `<div class="olob-foot">${edit ? `<button class="go" id="onStart">試合開始</button>` : L.state === 'play' ? `<button class="go" id="onJoinGame">試合に参加</button>` : `<span class="olob-wait">ホストの開始を待っています…</span>`}
    <button class="ghost" id="onCac">クラスを編集</button><button class="ghost" id="onLeave">退出</button><span class="olob-err">${esc(ON.err || '')}</span></div>`;
  el.innerHTML = h;
  el.querySelectorAll('[data-team]').forEach(b => b.onclick = () => netSend({ t: 'team', team: b.dataset.team }));
  el.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => netSend({ t: 'settings', mode: b.dataset.mode, limit: b.dataset.mode === 'gun' ? GUNGAME.length : MODES[b.dataset.mode].def }));
  el.querySelectorAll('[data-map]').forEach(b => b.onclick = () => netSend({ t: 'settings', map: b.dataset.map }));
  el.querySelectorAll('[data-cls]').forEach(b => b.onclick = () => { CLASSES.cur = +b.dataset.cls; saveClasses(); buildOnline(); });
  $('onTime').onchange = e => netSend({ t: 'settings', time: +e.target.value });
  $('onLimit').onchange = e => netSend({ t: 'settings', limit: +e.target.value });
  $('onBots').onchange = e => netSend({ t: 'settings', bots: +e.target.value });
  $('onDiff').onchange = e => netSend({ t: 'settings', diff: +e.target.value });
  if ($('onStart')) $('onStart').onclick = () => netSend({ t: 'start' });
  if ($('onJoinGame')) $('onJoinGame').onclick = () => netSend({ t: 'resync' });
  $('onCac').onclick = () => openCAC();
  $('onLeave').onclick = () => netLeave();
}
// refresh ping display in the lobby once a second
setInterval(() => { if (ON.ws && ON.code && $('p-online') && $('p-online').style.display !== 'none' && !G.running) { ON.ws && netSend({ t: 'ping', c: nowS() }); } }, 1000);
