// ============================================================
//  FPS online server (zero dependencies: Node >= 18)
//  - serves public/index.html
//  - WebSocket rooms (host creates a room, friends join with a 4-letter code)
//  - 60 Hz binary snapshots, client-predicted movement, server-validated lag-compensated hits
// ============================================================
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 10000;
const PUB = path.join(__dirname, '..', 'public');
const TICK_HZ = 60, MAX_REWIND = 0.35, MAX_PLAYERS = 12, MINLIMIT = +process.env.MINLIMIT || 5;
const T0 = process.hrtime.bigint();
const now = () => Number(process.hrtime.bigint() - T0) / 1e9; // seconds (server clock)
let MAXHIT = {};
try { MAXHIT = JSON.parse(fs.readFileSync(path.join(__dirname, 'maxhit.json'), 'utf8')); } catch (e) { }

// ---------------- static files ----------------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  let f = path.normalize(path.join(PUB, url === '/' ? 'index.html' : url));
  if (!f.startsWith(PUB)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

// ---------------- minimal WebSocket (RFC 6455) ----------------
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
server.on('upgrade', (req, socket) => {
  if ((req.url || '').split('?')[0] !== '/ws' || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const key = req.headers['sec-websocket-key']; if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true); // no Nagle batching: send every packet immediately
  socket.setKeepAlive(true, 15000);
  const c = new Conn(socket); onConnect(c);
});
class Conn {
  constructor(sock) {
    this.sock = sock; this.buf = Buffer.alloc(0); this.open = true; this.frags = null;
    sock.on('data', d => this.onData(d));
    sock.on('close', () => this.close());
    sock.on('error', () => this.close());
  }
  onData(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    while (this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1], fin = b0 & 0x80, op = b0 & 0x0f, masked = b1 & 0x80;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (len > 65536) { this.close(); return; }
      const mOff = off, dOff = off + (masked ? 4 : 0);
      if (this.buf.length < dOff + len) return;
      let payload = Buffer.from(this.buf.subarray(dOff, dOff + len));
      if (masked) for (let i = 0; i < len; i++) payload[i] ^= this.buf[mOff + (i & 3)];
      this.buf = this.buf.subarray(dOff + len);
      if (op === 8) { this.close(); return; }
      if (op === 9) { this.frame(10, payload); continue; }
      if (op === 10) continue;
      if (op === 0) { if (!this.frags) continue; this.frags.parts.push(payload); if (fin) { const p = Buffer.concat(this.frags.parts), o = this.frags.op; this.frags = null; this.emit(o, p); } continue; }
      if (!fin) { this.frags = { op, parts: [payload] }; continue; }
      this.emit(op, payload);
    }
  }
  emit(op, p) { try { if (op === 1) this.onText && this.onText(p.toString('utf8')); else if (op === 2) this.onBin && this.onBin(p); } catch (e) { console.error(e); } }
  frame(op, data) {
    if (!this.open) return;
    const len = data.length; let h;
    if (len < 126) { h = Buffer.alloc(2); h[1] = len; }
    else if (len < 65536) { h = Buffer.alloc(4); h[1] = 126; h.writeUInt16BE(len, 2); }
    else { h = Buffer.alloc(10); h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); }
    h[0] = 0x80 | op;
    this.sock.write(Buffer.concat([h, data]));
  }
  send(obj) { this.frame(1, Buffer.from(JSON.stringify(obj))); }
  sendBin(buf) { this.frame(2, buf); }
  close() { if (!this.open) return; this.open = false; try { this.sock.end(); this.sock.destroy(); } catch (e) { } this.onClose && this.onClose(); }
}

// ---------------- rooms ----------------
const rooms = new Map();
const MAPS = ['yard', 'downtown', 'outpost', 'village', 'depot'];
const MODES = { ffa: { team: false }, tdm: { team: true }, dom: { team: true }, kc: { team: true }, gun: { team: false } };
const BOT_NAMES = ['Viper', 'Ghost', 'Reaper', 'Hawk', 'Nomad', 'Raven', 'Sable', 'Wolf', 'Jackal', 'Cobra', 'Falcon', 'Mamba', 'Titan', 'Onyx', 'Blaze'];
const MAX_ENTS = 18;
const code4 = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s; do { s = ''; for (let i = 0; i < 4; i++) s += A[(Math.random() * A.length) | 0]; } while (rooms.has(s)); return s; };
const DBG = process.env.DEBUG ? (...a) => console.log(...a) : () => { };
const clean = (s, n) => String(s || '').replace(/[<>&"\u0000-\u001f]/g, '').trim().slice(0, n);
const ents = r => [...r.players.values(), ...r.bots.values()];
const getEnt = (r, id) => r.players.get(id) || r.bots.get(id);
const teamMode = r => MODES[r.settings.mode].team;

function onConnect(c) {
  c.p = null; c.room = null;
  c.onText = txt => { let m; try { m = JSON.parse(txt); } catch (e) { return; } handle(c, m); };
  c.onBin = buf => onState(c, buf);
  c.onClose = () => leave(c);
}
function lobbyMsg(r) {
  return { t: 'lobby', code: r.code, host: r.host, state: r.state, settings: r.settings,
    players: [...r.players.values()].map(p => ({ id: p.id, name: p.name, team: p.team, kills: p.kills, deaths: p.deaths })) };
}
function bcast(r, obj, except) { const s = Buffer.from(JSON.stringify(obj)); for (const p of r.players.values()) if (p.c !== except) p.c.frame(1, s); }
function mkEnt(id, name, bot) {
  return { id, name, bot: !!bot, c: null, team: null, hp: 100, alive: false, kills: 0, deaths: 0, score: 0, gg: 0,
    pos: [0, 0, 0], yaw: 0, pitch: 0, flags: 0, wpn: 0, hist: [], lastDmgT: -99, shots: 0, shotWin: 0 };
}
function newPlayer(c, r, name) {
  let id = 1; while (r.players.has(id)) id++;
  const p = mkEnt(id, clean(name, 16) || 'Player' + id, false); p.c = c;
  r.players.set(id, p); c.p = p; c.room = r;
  if (teamMode(r)) p.team = smallerTeam(r, p);
  return p;
}
function smallerTeam(r, self) { const n = t => ents(r).filter(q => q !== self && q.team === t).length; return n('A') <= n('B') ? 'A' : 'B'; }
function handle(c, m) {
  const r = c.room, p = c.p;
  switch (m.t) {
    case 'ping': c.send({ t: 'pong', c: m.c, s: now() }); return;
    case 'create': {
      if (r) leave(c);
      const room = { code: code4(), host: 0, players: new Map(), bots: new Map(), state: 'lobby', settings: { mode: 'ffa', map: 'yard', time: 600, limit: 30, bots: 0, diff: 1 },
        endAt: 0, tickT: null, teamScore: { A: 0, B: 0 }, flags: [], tags: [], tagId: 1, domT: 0, modeT: 0, modeDirty: false };
      rooms.set(room.code, room);
      const me = newPlayer(c, room, m.name); room.host = me.id;
      c.send({ t: 'joined', id: me.id, code: room.code }); bcast(room, lobbyMsg(room));
      return;
    }
    case 'join': {
      if (r) leave(c);
      const room = rooms.get(String(m.code || '').toUpperCase());
      if (!room) { c.send({ t: 'error', msg: '部屋が見つかりません' }); return; }
      if (room.players.size >= MAX_PLAYERS) { c.send({ t: 'error', msg: '部屋が満員です' }); return; }
      if (room.state === 'play' && room.bots.size) { const b = [...room.bots.values()].pop(); room.bots.delete(b.id); bcast(room, { t: 'left', id: b.id, name: b.name }); } // a bot makes room for the new player
      const me = newPlayer(c, room, m.name);
      c.send({ t: 'joined', id: me.id, code: room.code });
      if (room.state === 'play') { bcast(room, { t: 'joinMid', info: entInfo(me) }, c); c.send(startMsg(room)); c.send(modeMsg(room)); }
      bcast(room, lobbyMsg(room));
      return;
    }
  }
  if (!r || !p) return;
  const isHost = p.id === r.host;
  switch (m.t) {
    case 'leave': leave(c); return;
    case 'settings': {
      if (!isHost || r.state !== 'lobby') return;
      const s = r.settings;
      if (MODES[m.mode]) s.mode = m.mode;
      if (MAPS.includes(m.map) || m.map === 'random') s.map = m.map;
      if (m.time >= 120 && m.time <= 1800) s.time = m.time | 0;
      if (m.limit >= MINLIMIT && m.limit <= 300) s.limit = m.limit | 0;
      if (m.bots >= 0 && m.bots <= 15) s.bots = m.bots | 0;
      if (m.diff >= 0 && m.diff <= 3) s.diff = m.diff | 0;
      for (const q of r.players.values()) q.team = teamMode(r) ? q.team : null;
      if (teamMode(r)) for (const q of r.players.values()) if (!q.team) q.team = smallerTeam(r, q);
      bcast(r, lobbyMsg(r)); return;
    }
    case 'team': { if (!teamMode(r) || r.state !== 'lobby') return; if (m.team === 'A' || m.team === 'B') p.team = m.team; bcast(r, lobbyMsg(r)); return; }
    case 'name': { p.name = clean(m.name, 16) || p.name; bcast(r, lobbyMsg(r)); return; }
    case 'start': {
      if (!isHost || r.state !== 'lobby') return;
      const S = r.settings;
      r.state = 'play'; r.teamScore = { A: 0, B: 0 }; r.flags = []; r.tags = []; r.domT = 0; r.modeT = 0;
      r.playMap = S.map === 'random' ? MAPS[(Math.random() * MAPS.length) | 0] : S.map;
      r.endAt = now() + S.time;
      for (const q of r.players.values()) Object.assign(q, { kills: 0, deaths: 0, score: 0, gg: 0, hp: 100, alive: false, hist: [] });
      r.bots.clear();
      const nb = Math.max(0, Math.min(S.bots, MAX_ENTS - r.players.size));
      for (let i = 0; i < nb; i++) { const b = mkEnt(100 + i, BOT_NAMES[i % BOT_NAMES.length], true); r.bots.set(b.id, b); if (teamMode(r)) b.team = smallerTeam(r, b); }
      bcast(r, startMsg(r));
      if (!r.tickT) r.tickT = setInterval(() => tick(r), 1000 / TICK_HZ);
      return;
    }
    case 'modeInit': { // host sends map-derived objective positions (domination flags)
      if (!isHost || r.state !== 'play' || r.settings.mode !== 'dom' || r.flags.length || !Array.isArray(m.flags)) return;
      r.flags = m.flags.slice(0, 3).map((pos, i) => ({ name: 'ABC'[i], pos: pos.map(Number), owner: i === 0 ? 'A' : i === 2 ? 'B' : null, cap: 0, capTeam: null }));
      bcast(r, modeMsg(r)); return;
    }
    case 'spawn': {
      if (r.state !== 'play') return;
      const e = m.id ? (isHost ? r.bots.get(m.id | 0) : null) : p; if (!e) return;
      e.alive = true; e.hp = 100; e.lastDmgT = -99; e.hist = []; if (Array.isArray(m.pos)) e.pos = m.pos.map(Number);
      bcast(r, { t: 'spawned', id: e.id }); return;
    }
    case 'shot': { // cosmetic relay (tracer + sound)
      if (r.state !== 'play') return;
      const e = m.id ? (isHost ? r.bots.get(m.id | 0) : null) : p; if (!e || !e.alive) return;
      bcast(r, { t: 'shot', id: e.id, o: m.o, e: m.e, k: m.k, s: m.s ? 1 : 0 }, c); return;
    }
    case 'hit': onHit(r, p, m, isHost); return;
    case 'chat': { const txt = clean(m.msg, 80); if (txt) bcast(r, { t: 'chat', id: p.id, name: p.name, msg: txt }); return; }
    case 'resync': { if (r.state === 'play') { c.send(startMsg(r)); c.send(modeMsg(r)); } return; }
  }
}
const entInfo = q => ({ id: q.id, name: q.name, team: q.team, bot: q.bot, kills: q.kills, deaths: q.deaths, score: q.score, gg: q.gg, alive: q.alive });
function startMsg(r) {
  return { t: 'start', map: r.playMap, mode: r.settings.mode, limit: r.settings.limit, diff: r.settings.diff, host: r.host, endAt: r.endAt, now: now(), players: ents(r).map(entInfo) };
}
function modeMsg(r) {
  return { t: 'mode', ts: r.teamScore, flags: r.flags.map(f => ({ name: f.name, pos: f.pos, owner: f.owner, cap: +f.cap.toFixed(3), capTeam: f.capTeam })), tags: r.tags.map(g => ({ id: g.id, pos: g.pos, team: g.team })) };
}
function leave(c) {
  const r = c.room, p = c.p; if (!r || !p) return;
  r.players.delete(p.id); c.room = null; c.p = null;
  if (!r.players.size) { if (r.tickT) clearInterval(r.tickT); rooms.delete(r.code); return; }
  bcast(r, { t: 'left', id: p.id, name: p.name });
  if (r.host === p.id) {
    r.host = [...r.players.values()][0].id;
    // bots were simulated by the old host: remove them
    for (const b of r.bots.values()) bcast(r, { t: 'left', id: b.id, name: b.name });
    r.bots.clear();
  }
  bcast(r, lobbyMsg(r));
}

// ---------------- state upload (binary, NET.encodeSnapshot layout) ----------------
// type 2: own player (1 entity); type 4: host uploads its bots (n entities)
function onState(c, b) {
  const r = c.room, p = c.p; if (!r || !p || r.state !== 'play' || b.length < 25 || (b[0] !== 2 && b[0] !== 4)) return;
  const n = Math.min(b[9], 20), t = now();
  for (let i = 0; i < n && 10 + i * 15 + 15 <= b.length; i++) {
    const o = 10 + i * 15;
    const e = b[0] === 2 ? p : (p.id === r.host ? r.bots.get(b[o]) : null); if (!e) continue;
    const pos = [b.readInt16LE(o + 1) / 100, b.readInt16LE(o + 3) / 100, b.readInt16LE(o + 5) / 100];
    if (e.hist.length) { const l = e.hist[e.hist.length - 1], dt = Math.max(0.016, t - l.t), d = Math.hypot(pos[0] - l.pos[0], pos[2] - l.pos[2]); if (d > 3 + dt * 14 && dt < 0.5) continue; }
    e.pos = pos; e.yaw = b.readUInt16LE(o + 7); e.pitch = b.readInt16LE(o + 9); e.flags = b[o + 11]; e.wpn = b.readUInt16LE(o + 13);
    e.hist.push({ t, pos, stance: e.flags & 3 }); while (e.hist.length && t - e.hist[0].t > 1) e.hist.shift();
  }
}
function tick(r) {
  if (r.state !== 'play') { if (r.tickT) { clearInterval(r.tickT); r.tickT = null; } return; }
  const t = now(), es = ents(r), dt = 1 / TICK_HZ;
  for (const e of es) if (e.alive && e.hp < 100 && t - e.lastDmgT > 5) e.hp = Math.min(100, e.hp + 40 * dt);
  modeTick(r, dt);
  if (r.state !== 'play') return;
  const b = Buffer.alloc(10 + es.length * 15);
  b[0] = 2; b.writeFloatLE(t, 1); b.writeUInt32LE(0, 5); b[9] = es.length;
  es.forEach((e, i) => {
    const o = 10 + i * 15;
    b[o] = e.id; b.writeInt16LE(clampI(Math.round(e.pos[0] * 100)), o + 1); b.writeInt16LE(clampI(Math.round(e.pos[1] * 100)), o + 3); b.writeInt16LE(clampI(Math.round(e.pos[2] * 100)), o + 5);
    b.writeUInt16LE(e.yaw & 0xffff, o + 7); b.writeInt16LE(clampI(e.pitch), o + 9); b[o + 11] = (e.flags & ~4) | (e.alive ? 4 : 0); b[o + 12] = Math.max(0, Math.min(255, Math.round(e.hp))); b.writeUInt16LE(e.wpn & 0xffff, o + 13);
  });
  for (const p of r.players.values()) p.c.frame(2, b);
  if (t >= r.endAt) endMatch(r);
}
const clampI = v => Math.max(-32768, Math.min(32767, v | 0));
const hdist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

// ---------------- objective modes (same rules as offline) ----------------
function modeTick(r, dt) {
  const mode = r.settings.mode, es = ents(r).filter(e => e.alive && e.team);
  if (mode === 'dom' && r.flags.length) {
    for (const f of r.flags) {
      const near = { A: 0, B: 0 };
      for (const e of es) if (hdist(e.pos, f.pos) < 4.5 && Math.abs(e.pos[1] - f.pos[1]) < 3) near[e.team]++;
      const teams = ['A', 'B'].filter(k => near[k] > 0);
      if (teams.length === 1 && teams[0] !== f.owner) {
        const k = teams[0];
        if (f.capTeam !== k) { f.capTeam = k; f.cap = 0; }
        f.cap += dt / (f.owner ? 10 : 6) * Math.min(1 + (near[k] - 1) * 0.5, 2);
        if (f.cap >= 1) {
          f.owner = k; f.cap = 0; f.capTeam = null;
          const who = es.filter(e => e.team === k && hdist(e.pos, f.pos) < 4.5);
          for (const e of who) e.score += 150;
          bcast(r, { t: 'cap', flag: f.name, team: k, ids: who.map(e => e.id), sc: Object.fromEntries(who.map(e => [e.id, e.score])) });
        }
        r.modeDirty = true;
      } else if (teams.length === 0 && f.cap > 0) { f.cap = Math.max(0, f.cap - dt * 0.15); r.modeDirty = true; }
    }
    r.domT += dt;
    if (r.domT >= 3) { r.domT = 0; for (const f of r.flags) if (f.owner) r.teamScore[f.owner]++; r.modeDirty = true; checkTeamLimit(r); }
  }
  if (mode === 'kc' && r.tags.length) {
    for (const g of r.tags) {
      g.t += dt;
      if (g.t > 30) { g.dead = true; continue; }
      for (const e of es) {
        if (hdist(e.pos, g.pos) > 1.4 || Math.abs(e.pos[1] - g.pos[1]) > 1.6) continue;
        g.dead = true; e.score += 50;
        if (e.team !== g.team) r.teamScore[e.team]++;
        bcast(r, { t: 'tag', id: e.id, kind: e.team !== g.team ? 'confirm' : 'deny', sc: e.score });
        break;
      }
    }
    if (r.tags.some(g => g.dead)) { r.tags = r.tags.filter(g => !g.dead); r.modeDirty = true; checkTeamLimit(r); }
  }
  r.modeT -= dt;
  if (r.modeDirty && r.modeT <= 0) { r.modeT = 0.1; r.modeDirty = false; bcast(r, modeMsg(r)); }
}
function checkTeamLimit(r) { if (r.state === 'play' && (r.teamScore.A >= r.settings.limit || r.teamScore.B >= r.settings.limit)) endMatch(r); }

// ---------------- hits (lag compensated, favor-the-shooter with sanity checks) ----------------
const STANCE_H = [1.85, 1.3, 0.75];
function posAt(p, t) {
  const h = p.hist; if (!h.length) return { pos: p.pos, stance: p.flags & 3 };
  if (t <= h[0].t) return h[0]; if (t >= h[h.length - 1].t) return h[h.length - 1];
  for (let i = h.length - 1; i > 0; i--) if (h[i - 1].t <= t) { const a = h[i - 1], b = h[i], k = (t - a.t) / (b.t - a.t || 1); return { pos: a.pos.map((v, j) => v + (b.pos[j] - v) * k), stance: b.stance }; }
  return h[0];
}
function rayHitsBody(o, d, s) { // ray vs vertical cylinder around the target, generous tolerance for interpolation error
  const prone = s.stance === 2, R = prone ? 1.15 : 0.85, y0 = s.pos[1] - 0.1, y1 = s.pos[1] + STANCE_H[s.stance] + 0.2;
  const dl = Math.hypot(d[0], d[1], d[2]) || 1, dx = d[0] / dl, dy = d[1] / dl, dz = d[2] / dl;
  const t = Math.max(0, (s.pos[0] - o[0]) * dx + (s.pos[2] - o[2]) * dz) / Math.max(1e-6, dx * dx + dz * dz);
  const px = o[0] + dx * t, py = o[1] + dy * t, pz = o[2] + dz * t;
  return Math.hypot(px - s.pos[0], pz - s.pos[2]) <= R && py >= y0 - 0.6 && py <= y1 + 0.6 && t < 700;
}
function onHit(r, sender, m, isHost) {
  if (r.state !== 'play') return;
  const p = m.by ? (isHost ? r.bots.get(m.by | 0) : null) : sender; // bots' shots are reported by the host
  if (!p || !p.alive) return;
  const tg = getEnt(r, m.target | 0), t = now();
  if (!tg || tg === p || !tg.alive) return;
  if (teamMode(r) && tg.team === p.team) return;
  if (t - p.shotWin > 1) { p.shotWin = t; p.shots = 0; } if (++p.shots > 30) return; // ~30 claims/s max
  const vt = Math.max(t - MAX_REWIND, Math.min(t, Number(m.vt) || t));
  const s = posAt(tg, vt);
  let dmg = Math.max(0, Number(m.dmg) || 0);
  if (m.zone === 'melee') {
    if (hdist(s.pos, p.pos) > 3.2) return;
    dmg = Math.min(dmg, 150);
  } else {
    const o = Array.isArray(m.o) ? m.o.map(Number) : null, d = Array.isArray(m.d) ? m.d.map(Number) : null;
    if (!o || !d || o.some(isNaN) || d.some(isNaN)) return;
    if (hdist(o, p.pos) > 2.5 || o[1] < p.pos[1] - 0.5 || o[1] > p.pos[1] + 2.5) { DBG('reject origin', o, p.pos); return; }
    if (!rayHitsBody(o, d, s)) { DBG('reject ray', o, d, s); return; }
    dmg = Math.min(dmg, MAXHIT[m.w] || 250);
  }
  if (!(dmg > 0)) return;
  tg.hp -= dmg; tg.lastDmgT = t;
  bcast(r, { t: 'dmg', id: tg.id, by: p.id, dmg: Math.round(dmg), hp: Math.max(0, Math.round(tg.hp)), from: p.pos });
  if (tg.hp <= 0) kill(r, p, tg, m, s.pos);
}
function kill(r, p, tg, m, vpos) {
  const mode = r.settings.mode;
  tg.alive = false; tg.hp = 0; tg.deaths++; p.kills++;
  let pts = 100; if (m.zone === 'head') pts += 50; p.score += pts;
  if (mode === 'tdm' && p.team) r.teamScore[p.team]++;
  if (mode === 'kc' && tg.team) { r.tags.push({ id: r.tagId++, pos: [vpos[0], vpos[1] + 0.6, vpos[2]], team: tg.team, t: 0 }); r.modeDirty = true; }
  const gg = {};
  let gunWin = false;
  if (mode === 'gun') {
    if (m.zone === 'melee' && tg.gg > 0) { tg.gg--; gg[tg.id] = tg.gg; }
    p.gg++; if (p.gg >= r.settings.limit) { p.gg = r.settings.limit - 1; gunWin = true; } gg[p.id] = p.gg;
  }
  bcast(r, { t: 'kill', killer: p.id, victim: tg.id, w: m.w, zone: m.zone, pts, ts: r.teamScore, gg,
    k: { [p.id]: [p.kills, p.deaths, p.score], [tg.id]: [tg.kills, tg.deaths, tg.score] } });
  if (mode === 'kc') bcast(r, modeMsg(r));
  if (gunWin) { endMatch(r, p.id); return; }
  if (mode === 'ffa' && p.kills >= r.settings.limit) endMatch(r);
  if (mode === 'tdm') checkTeamLimit(r);
}
function endMatch(r, forced) {
  if (r.state !== 'play') return;
  r.state = 'end';
  const es = ents(r);
  let winner = null;
  if (teamMode(r)) winner = r.teamScore.A === r.teamScore.B ? null : r.teamScore.A > r.teamScore.B ? 'A' : 'B';
  else if (forced) winner = forced;
  else { const key = r.settings.mode === 'gun' ? (e => e.gg * 1000 + e.kills) : (e => e.kills * 1000 - e.deaths); const best = es.slice().sort((a, b) => key(b) - key(a))[0]; winner = best ? best.id : null; }
  bcast(r, { t: 'end', winner, ts: r.teamScore, players: es.map(entInfo) });
  setTimeout(() => { if (r.state === 'end') { r.state = 'lobby'; r.bots.clear(); bcast(r, lobbyMsg(r)); } }, 12000);
}

server.listen(PORT, () => console.log(`FPS server on :${PORT}`));
