// ============================================================
//  NET: low-latency multiplayer foundation (isomorphic: usable by the browser client and a Node server)
//  Design (for a WebSocket server on Render):
//   - Client simulates its own player immediately (prediction); look is applied every frame, never waits for the server.
//   - Inputs are sent as tiny binary packets (~24 bytes) every tick with a sequence number.
//   - Server is authoritative but "favor the shooter": the shot carries the client's render time, the server rewinds
//     the target to that time (lag compensation) and validates the hit with the same hit-boxes the client saw.
//   - Remote players are drawn from an interpolation buffer whose delay adapts to the measured send interval + jitter
//     (instead of a fixed 100 ms), so they are as fresh as the connection allows.
//   - Corrections from the server are blended in over a few frames (no snapping), only when the error is large.
//   - Clock offset / RTT come from ping samples filtered by minimum RTT (robust against spikes).
// ============================================================
const NET = (() => {
  const TICK = 1 / 60, SEND_HZ = 60;
  // ---------- binary codec ----------
  const BTN = ['fire', 'ads', 'jumpP', 'cHeld', 'zHeld', 'sprintHeld', 'reloadP', 'meleeP', 'lethalHeld', 'tacP', 'useHeld', 'swapP'];
  function encodeInput(seq, t, a, yaw, pitch) {
    const b = new ArrayBuffer(24), v = new DataView(b);
    let bits = 0; BTN.forEach((k, i) => { if (a[k]) bits |= 1 << i; });
    v.setUint8(0, 1); v.setUint32(1, seq, true); v.setFloat32(5, t, true); v.setUint16(9, bits, true);
    v.setInt8(11, Math.round(clamp(a.mx || 0, -1, 1) * 127)); v.setInt8(12, Math.round(clamp(a.my || 0, -1, 1) * 127));
    v.setFloat32(13, yaw, true); v.setFloat32(17, pitch, true); v.setInt8(21, a.swapTo == null ? -1 : a.swapTo); v.setInt8(22, a.streakP == null ? -1 : a.streakP);
    return b;
  }
  function decodeInput(b) {
    const v = new DataView(b), bits = v.getUint16(9, true), a = {};
    BTN.forEach((k, i) => a[k] = !!(bits & (1 << i)));
    a.mx = v.getInt8(11) / 127; a.my = v.getInt8(12) / 127; a.swapTo = v.getInt8(21); a.streakP = v.getInt8(22);
    return { seq: v.getUint32(1, true), t: v.getFloat32(5, true), a, yaw: v.getFloat32(13, true), pitch: v.getFloat32(17, true) };
  }
  // snapshot: header(type u8, serverTime f32, ackSeq u32, count u8) + per entity 15 bytes (positions in cm, angles quantized)
  const STANCE = ['stand', 'crouch', 'prone'];
  function encodeSnapshot(t, ackSeq, ents) {
    const b = new ArrayBuffer(10 + ents.length * 15), v = new DataView(b);
    v.setUint8(0, 2); v.setFloat32(1, t, true); v.setUint32(5, ackSeq, true); v.setUint8(9, ents.length);
    ents.forEach((e, i) => {
      const o = 10 + i * 15;
      v.setUint8(o, e.id); v.setInt16(o + 1, Math.round(e.pos[0] * 100), true); v.setInt16(o + 3, Math.round(e.pos[1] * 100), true); v.setInt16(o + 5, Math.round(e.pos[2] * 100), true);
      v.setUint16(o + 7, Math.round(((e.yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * 65535), true);
      v.setInt16(o + 9, Math.round(e.pitch / (Math.PI / 2) * 32767), true);
      v.setUint8(o + 11, Math.max(0, STANCE.indexOf(e.stance)) | (e.alive ? 4 : 0) | (e.ads > 0.5 ? 8 : 0) | (e.sprint ? 16 : 0));
      v.setUint8(o + 12, clamp(Math.round(e.hp), 0, 255)); v.setUint16(o + 13, e.wpnIdx || 0, true);
    });
    return b;
  }
  function decodeSnapshot(b) {
    const v = new DataView(b), n = v.getUint8(9), ents = [];
    for (let i = 0; i < n; i++) {
      const o = 10 + i * 15, f = v.getUint8(o + 11);
      ents.push({ id: v.getUint8(o), pos: [v.getInt16(o + 1, true) / 100, v.getInt16(o + 3, true) / 100, v.getInt16(o + 5, true) / 100],
        yaw: v.getUint16(o + 7, true) / 65535 * 2 * Math.PI, pitch: v.getInt16(o + 9, true) / 32767 * Math.PI / 2,
        stance: STANCE[f & 3], alive: !!(f & 4), ads: f & 8 ? 1 : 0, sprint: !!(f & 16), hp: v.getUint8(o + 12), wpnIdx: v.getUint16(o + 13, true) });
    }
    return { t: v.getFloat32(1, true), ack: v.getUint32(5, true), ents };
  }
  // ---------- clock sync (min-RTT filter) ----------
  class Clock {
    constructor() { this.samples = []; this.offset = 0; this.rtt = 0.1; }
    sample(sent, serverT, recv) { // seconds, local clock for sent/recv
      const rtt = recv - sent; this.samples.push({ rtt, off: serverT + rtt / 2 - recv });
      if (this.samples.length > 12) this.samples.shift();
      const best = this.samples.slice().sort((a, b) => a.rtt - b.rtt).slice(0, 4);
      this.offset = best.reduce((s, x) => s + x.off, 0) / best.length; this.rtt = best[0].rtt;
    }
    server(local) { return local + this.offset; }
  }
  // ---------- adaptive interpolation buffer for remote entities ----------
  class Interp {
    constructor() { this.buf = []; this.gaps = []; this.lastT = null; this.delay = 2 / SEND_HZ; }
    push(t, s) {
      if (this.lastT != null) { this.gaps.push(t - this.lastT); if (this.gaps.length > 30) this.gaps.shift(); }
      this.lastT = t; this.buf.push({ t, s }); if (this.buf.length > 40) this.buf.shift();
      if (this.gaps.length > 4) { // delay = mean gap + 2 * jitter, clamped (lower = fresher)
        const m = this.gaps.reduce((a, b) => a + b, 0) / this.gaps.length, j = Math.sqrt(this.gaps.reduce((a, g) => a + (g - m) ** 2, 0) / this.gaps.length);
        this.delay = clamp(m + 2 * j, 1 / SEND_HZ, 0.15);
      }
    }
    sample(now) {
      const t = now - this.delay, B = this.buf; if (!B.length) return null;
      if (t <= B[0].t) return B[0].s;
      for (let i = B.length - 1; i > 0; i--) if (B[i - 1].t <= t) {
        const a = B[i - 1], b = B[i];
        if (t > b.t) return extrap(b, B[i - 1], t); // tiny extrapolation if the next packet is late
        const k = (t - a.t) / (b.t - a.t || 1);
        return { ...b.s, pos: [lerp(a.s.pos[0], b.s.pos[0], k), lerp(a.s.pos[1], b.s.pos[1], k), lerp(a.s.pos[2], b.s.pos[2], k)], yaw: a.s.yaw + angDiff(a.s.yaw, b.s.yaw) * k, pitch: lerp(a.s.pitch, b.s.pitch, k) };
      }
      return B[B.length - 1].s;
    }
  }
  function extrap(b, a, t) {
    const dt = Math.min(t - b.t, 0.1), span = b.t - a.t || 1;
    return { ...b.s, pos: b.s.pos.map((p, i) => p + (b.s.pos[i] - a.s.pos[i]) / span * dt) };
  }
  // ---------- client prediction: input/state history + smooth correction ----------
  class Predict {
    constructor() { this.hist = []; this.seq = 0; this.err = [0, 0, 0]; }
    record(pos) { this.seq++; this.hist.push({ seq: this.seq, pos: pos.slice() }); if (this.hist.length > 240) this.hist.shift(); return this.seq; }
    reconcile(ackSeq, serverPos) { // compare what we predicted at ackSeq with the server; queue the difference
      const h = this.hist.find(x => x.seq === ackSeq); if (!h) return 0;
      const d = [serverPos[0] - h.pos[0], serverPos[1] - h.pos[1], serverPos[2] - h.pos[2]], m = Math.hypot(...d);
      this.hist = this.hist.filter(x => x.seq > ackSeq);
      if (m > 0.08) this.err = d; // small differences are ignored (no jitter)
      if (m > 3) return 2; // teleport-size: snap
      return m > 0.08 ? 1 : 0;
    }
    apply(pos, dt) { // blend 1/ (~6 frames) of the remaining error per frame
      const k = Math.min(1, dt * 10); for (let i = 0; i < 3; i++) { const s = this.err[i] * k; pos[i] += s; this.err[i] -= s; }
    }
  }
  // ---------- lag compensation (server side, also used locally to self-test) ----------
  class History {
    constructor(len = 1.0) { this.len = len; this.map = new Map(); }
    record(t, ents) {
      for (const e of ents) {
        let h = this.map.get(e); if (!h) this.map.set(e, h = []);
        h.push({ t, pos: e.pos.slice(), yaw: e.yaw, stance: e.stance, h: e.h }); while (h.length && t - h[0].t > this.len) h.shift();
      }
    }
    at(e, t) { // state of e at time t (interpolated)
      const h = this.map.get(e); if (!h || !h.length) return null;
      if (t <= h[0].t) return h[0]; if (t >= h[h.length - 1].t) return h[h.length - 1];
      for (let i = h.length - 1; i > 0; i--) if (h[i - 1].t <= t) { const a = h[i - 1], b = h[i], k = (t - a.t) / (b.t - a.t || 1); return { ...b, pos: [lerp(a.pos[0], b.pos[0], k), lerp(a.pos[1], b.pos[1], k), lerp(a.pos[2], b.pos[2], k)] }; }
      return h[0];
    }
    // run fn with every entity moved back to time t, then restore
    rewind(t, ents, fn) {
      const saved = ents.map(e => [e, e.pos.slice(), e.yaw, e.stance]);
      for (const e of ents) { const s = this.at(e, t); if (s) { e.pos = s.pos.slice(); e.stance = s.stance; e._rigT = null; } } // _rigT: drop cached hit-boxes
      try { return fn(); } finally { for (const [e, p, y, st] of saved) { e.pos = p; e.yaw = y; e.stance = st; e._rigT = null; } }
    }
  }
  return { TICK, SEND_HZ, encodeInput, decodeInput, encodeSnapshot, decodeSnapshot, Clock, Interp, Predict, History,
    // recommended server settings (see README note in chat): Singapore region, paid instance (no spin-down), ws with perMessageDeflate:false
    SERVER_OPTS: { perMessageDeflate: false, maxPayload: 4096 } };
})();
if (typeof module !== 'undefined') module.exports = NET;
