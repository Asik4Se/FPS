// ============================================================
//  WORLD: maps / collision / raycast / nav
// ============================================================
const W = { boxes: [], spawns: [], minX: -62, maxX: 62, minZ: -47, maxZ: 47, grid: null, gw: 0, gh: 0, mapCanvas: null, id: 'yard' };
const COL = {
  ground: [0.62, 0.57, 0.48], concrete: [0.66, 0.65, 0.62], dark: [0.38, 0.38, 0.37], wall: [0.74, 0.71, 0.64],
  wall2: [0.58, 0.55, 0.50], roof: [0.42, 0.42, 0.44], trim: [0.30, 0.31, 0.33], wood: [0.52, 0.39, 0.25],
  crate: [0.56, 0.45, 0.28], sand: [0.66, 0.60, 0.44], metal: [0.45, 0.48, 0.50], snow: [0.90, 0.92, 0.95],
  cRed: [0.55, 0.20, 0.15], cBlue: [0.18, 0.32, 0.50], cGreen: [0.24, 0.40, 0.27], cOrange: [0.78, 0.45, 0.16], cGrey: [0.50, 0.52, 0.53], cYel: [0.75, 0.62, 0.20],
  asphalt: [0.30, 0.30, 0.32], adobe1: [0.80, 0.68, 0.50], adobe2: [0.74, 0.60, 0.44], adobe3: [0.86, 0.77, 0.61],
};
let CUR_STAIR_COL = null;
function B(x0, y0, z0, x1, y1, z1, col, opt) {
  const b = { mn: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], mx: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], c: col, tex: 1 };
  if (opt) Object.assign(b, opt);
  W.boxes.push(b); return b;
}
function Bc(x, z, w, d, h, col, y0, opt) { return B(x - w / 2, y0 || 0, z - d / 2, x + w / 2, (y0 || 0) + h, z + d / 2, col, opt); }
function flat(x0, z0, x1, z1, col) { return B(x0, -0.98, z0, x1, 0.01, z1, col, { flat: 1 }); }

function wallSeg(axis, fixed, u0, u1, y0, y1, th, col, openings) {
  const ops = (openings || []).slice().sort((p, q) => p.a - q.a);
  const mk = (ua, ub, ya, yb) => {
    if (ub - ua < 0.01 || yb - ya < 0.01) return;
    if (axis === 'x') B(ua, ya, fixed - th / 2, ub, yb, fixed + th / 2, col);
    else B(fixed - th / 2, ya, ua, fixed + th / 2, yb, ub, col);
  };
  let u = u0;
  for (const o of ops) {
    const a = u0 + o.a, b = u0 + o.b;
    if (a < u - 0.01 || b > u1 + 0.01) continue;
    mk(u, a, y0, y1); mk(a, b, y0, y0 + o.y0); mk(a, b, y0 + o.y1, y1); u = b;
  }
  mk(u, u1, y0, y1);
}
const DOOR = (a, w) => ({ a, b: a + (w || 1.4), y0: 0, y1: 2.3 });
const WIN = (a, w, y0, y1) => ({ a, b: a + (w || 1.6), y0: y0 || 1.0, y1: y1 || 2.2 });

function building(x0, z0, x1, z1, opts) {
  const fh = 3.2, th = 0.3, floors = opts.floors || 2, col = opts.col || COL.wall;
  for (let f = 0; f < floors; f++) {
    const y0 = f * fh, y1 = y0 + fh, w = opts.walls || {};
    const g = (k) => (w[k] && w[k][f]) || [];
    wallSeg('x', z0, x0, x1, y0, y1, th, col, g('n'));
    wallSeg('x', z1, x0, x1, y0, y1, th, col, g('s'));
    wallSeg('z', x0, z0 + th / 2, z1 - th / 2, y0, y1, th, col, g('w'));
    wallSeg('z', x1, z0 + th / 2, z1 - th / 2, y0, y1, th, col, g('e'));
    const sy = y1, hole = opts.stairs && f < floors - 1 ? opts.stairs.hole : null;
    if (hole) {
      const [hx0, hz0, hx1, hz1] = hole;
      B(x0, sy - 0.25, z0, x1, sy, hz0, COL.concrete); B(x0, sy - 0.25, hz1, x1, sy, z1, COL.concrete);
      B(x0, sy - 0.25, hz0, hx0, sy, hz1, COL.concrete); B(hx1, sy - 0.25, hz0, x1, sy, hz1, COL.concrete);
    } else B(x0 - 0.2, sy - 0.25, z0 - 0.2, x1 + 0.2, sy + 0.05, z1 + 0.2, opts.roofCol || COL.roof);
  }
  if (opts.stairs) stairs(...opts.stairs.run, 0, fh);
  const ry = floors * fh, tc = opts.trimCol || COL.trim;
  B(x0 - .2, ry, z0 - .2, x1 + .2, ry + .5, z0 + .1, tc); B(x0 - .2, ry, z1 - .1, x1 + .2, ry + .5, z1 + .2, tc);
}
function stairs(x, z, dir, wd, y0, y1, col) {
  const n = Math.ceil((y1 - y0) / 0.3), rise = (y1 - y0) / n, run = 0.42, c = col || CUR_STAIR_COL || COL.concrete;
  for (let i = 0; i < n; i++) {
    const top = y0 + rise * (i + 1), a = i * run, b = (i + 1) * run;
    if (dir === '+x') B(x + a, y0, z, x + b, top, z + wd, c);
    if (dir === '-x') B(x - b, y0, z, x - a, top, z + wd, c);
    if (dir === '+z') B(x, y0, z + a, x + wd, top, z + b, c);
    if (dir === '-z') B(x, y0, z - b, x + wd, top, z - a, c);
  }
  return n * run;
}
// generic house: auto doors/windows, optional interior stairs (2F) or exterior roof stairs (1F)
function house(x0, z0, x1, z1, o) {
  o = o || {};
  const floors = o.floors || 1, doors = o.doors || 'ns', L = { n: x1 - x0, s: x1 - x0, w: z1 - z0 - 0.3, e: z1 - z0 - 0.3 };
  const hasSt = floors > 1 && x1 - x0 >= 7.5;
  const walls = {};
  for (const sd of ['n', 's', 'e', 'w']) {
    const len = L[sd], f0 = [], f1 = [];
    if (doors.includes(sd)) {
      let u = len / 2 - 0.7;
      if (sd === 'n' && hasSt) u = Math.max(u, 5.6);
      if (u + 1.4 < len - 0.3) f0.push(DOOR(u));
    }
    if (o.win !== false && len > 6) {
      for (const u of [1.0, len - 2.6]) {
        if (sd === 'n' && hasSt && u < 5.5) continue;
        if (!f0.some(op => u < op.b + 0.2 && u + 1.6 > op.a - 0.2)) f0.push(WIN(u, 1.6));
      }
    }
    const cnt = Math.max(1, Math.floor(len / 4.5));
    for (let k = 0; k < cnt; k++) { const u = (k + 0.5) * len / cnt - 0.9; if (u > 0.3 && u + 1.8 < len - 0.3) f1.push(WIN(u, 1.8)); }
    walls[sd] = [f0, f1];
  }
  const st = hasSt ? { run: [x0 + 0.35, z0 + 0.25, '+x', 1.5], hole: [x0 + 0.25, z0 + 0.15, x0 + 0.35 + 4.62 + 0.05, z0 + 0.25 + 1.5 + 0.2] } : null;
  building(x0, z0, x1, z1, { floors, col: o.col, walls, stairs: st, roofCol: o.roofCol, trimCol: o.trimCol });
  if (o.roofStairs === 'e') stairs(x1 + 0.15, z0 + 0.3, '+z', 1.3, 0, floors * 3.2, o.stairCol);
  if (o.roofStairs === 'w') stairs(x0 - 1.45, z0 + 0.3, '+z', 1.3, 0, floors * 3.2, o.stairCol);
  if (o.roofStairs === 'n') stairs(x0 + 0.3, z0 - 1.45, '+x', 1.3, 0, floors * 3.2, o.stairCol);
  if (o.roofStairs === 's') stairs(x0 + 0.3, z1 + 0.15, '+x', 1.3, 0, floors * 3.2, o.stairCol);
}
function container(x, z, rotZ, col, y0, snowCap) {
  const L = 6.1, Wd = 2.45, H = 2.6;
  const b = rotZ ? Bc(x, z, Wd, L, H, col, y0) : Bc(x, z, L, Wd, H, col, y0);
  b.ribs = rotZ ? 'z' : 'x';
  if (snowCap) rotZ ? Bc(x, z, Wd, L, 0.08, COL.snow, (y0 || 0) + H) : Bc(x, z, L, Wd, 0.08, COL.snow, (y0 || 0) + H);
  return b;
}
// sniper tower with two flights of stairs. side: +1 = stairs on the -x side going +x, -1 mirrored
function tower(tx, tz, side, col) {
  const ty = 6, s = side || 1, mc = col || COL.metal;
  for (const [ox, oz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) Bc(tx + ox, tz + oz, 0.4, 0.4, ty, mc);
  B(tx - 2.6, ty - 0.3, tz - 2.6, tx + 2.6, ty, tz + 2.6, mc);
  B(tx - 2.6, ty, tz - 2.6, tx + 2.6, ty + 1.0, tz - 2.4, COL.trim); B(tx - 2.6, ty, tz + 2.4, tx + 2.6, ty + 1.0, tz + 2.6, COL.trim);
  if (s > 0) B(tx + 2.4, ty, tz - 2.4, tx + 2.6, ty + 1.0, tz + 2.4, COL.trim); else B(tx - 2.6, ty, tz - 2.4, tx - 2.4, ty + 1.0, tz + 2.4, COL.trim);
  B(tx - 2.8, ty + 2.6, tz - 2.8, tx + 2.8, ty + 2.8, tz + 2.8, COL.roof);
  for (const [ox, oz] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) Bc(tx + ox, tz + oz, 0.15, 0.15, 2.6, COL.trim, ty);
  if (s > 0) { stairs(tx - 14.2, tz - 1.6, '+x', 1.4, 0, 3.0); B(tx - 10.0, 0, tz - 1.6, tx - 6.8, 3.0, tz - 0.2, COL.concrete); stairs(tx - 6.8, tz - 1.6, '+x', 1.4, 3.0, 6.0); }
  else { stairs(tx + 14.2, tz - 1.6, '-x', 1.4, 0, 3.0); B(tx + 6.8, 0, tz - 1.6, tx + 10.0, 3.0, tz - 0.2, COL.concrete); stairs(tx + 6.8, tz - 1.6, '-x', 1.4, 3.0, 6.0); }
}
function car(x, z, rotZ, col) {
  const L = 4.4, Wd = 1.9;
  if (rotZ) { Bc(x, z, Wd, L, 0.95, col, 0.25); Bc(x, z + 0.2, Wd - 0.15, L * 0.5, 0.6, col.map(v => v * 0.8), 1.2); Bc(x, z, Wd + 0.05, L - 0.4, 0.25, [0.1, 0.1, 0.1]); }
  else { Bc(x, z, L, Wd, 0.95, col, 0.25); Bc(x - 0.2, z, L * 0.5, Wd - 0.15, 0.6, col.map(v => v * 0.8), 1.2); Bc(x, z, L - 0.4, Wd + 0.05, 0.25, [0.1, 0.1, 0.1]); }
}
function mound(x, z, w, d, col, levels) {
  const n = levels || 3;
  for (let i = 0; i < n; i++) { const k = 1 - i / n * 0.75; Bc(x, z, w * k, d * k, 0.42, col, i * 0.42); }
}
function pine(x, z) {
  Bc(x, z, 0.35, 0.35, 2, COL.wood);
  for (let i = 0; i < 4; i++) { const s = 3.2 - i * 0.7; Bc(x, z, s, s, 1.1, [0.20, 0.32, 0.24], 1.6 + i * 1.0); Bc(x, z, s * 0.9, s * 0.9, 0.12, COL.snow, 2.7 + i * 1.0); }
}
function palm(x, z) {
  Bc(x, z, 0.35, 0.35, 6.5, [0.50, 0.40, 0.28]);
  const g = [0.32, 0.48, 0.22];
  Bc(x, z, 4.4, 0.6, 0.15, g, 6.4); Bc(x, z, 0.6, 4.4, 0.15, g, 6.4); Bc(x, z, 2.6, 2.6, 0.2, g.map(v => v * 0.85), 6.5);
}
function stall(x, z, rotZ, col) {
  const w = rotZ ? 2.4 : 3.6, d = rotZ ? 3.6 : 2.4;
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) Bc(x + ox * (w / 2 - 0.1), z + oz * (d / 2 - 0.1), 0.12, 0.12, 2.5, COL.wood);
  Bc(x, z, w + 0.4, d + 0.4, 0.06, col, 2.5);
  Bc(x, z, rotZ ? 0.9 : w - 0.4, rotZ ? d - 0.4 : 0.9, 0.95, COL.wood);
}
function perimeter(h, col) {
  const { minX: x0, maxX: x1, minZ: z0, maxZ: z1 } = W;
  B(x0, 0, z0, x1, h, z0 + 2, col); B(x0, 0, z1 - 2, x1, h, z1, col);
  B(x0, 0, z0 + 2, x0 + 2, h, z1 - 2, col); B(x1 - 2, 0, z0 + 2, x1, h, z1 - 2, col);
}
function lamp(x, z, h) { Bc(x, z, 0.25, 0.25, h || 9, COL.trim); Bc(x, z + 0.5, 0.6, 1.2, 0.25, [0.9, 0.9, 0.8], h || 9, { emis: 0.6 }); }

// ---------------- MAP DEFINITIONS ----------------
const MAPS = {
  yard: {
    name: 'ヤード', desc: 'コンテナ置き場。中央は中距離、北側に100m超の狙撃レーンと南東の見張り塔。',
    bounds: [-62, 62, -47, 47],
    env: { skyTop: [0.36, 0.55, 0.80], fog: [0.62, 0.66, 0.70], sun: [0.45, 0.85, 0.3], sunCol: [0.80, 0.76, 0.69], amb: [0.62, 0.62, 0.62], fogNear: 45, fogFar: 300, ground: [0.62, 0.57, 0.48] },
    build() {
      perimeter(7, COL.wall2);
      flat(-58, 28, 58, 40, [0.36, 0.36, 0.37]); flat(-8, -44, 8, 28, [0.40, 0.40, 0.40]);
      building(-52, -22, -34, -4, {
        col: COL.wall, walls: {
          e: [[DOOR(3), WIN(8, 2), DOOR(13.5)], [WIN(2, 2), WIN(7.5, 2.5), WIN(13, 2)]], n: [[DOOR(8)], [WIN(5, 2), WIN(11, 2)]],
          s: [[DOOR(5), WIN(11, 2)], [WIN(4, 2.5), WIN(11, 2.5)]], w: [[], [WIN(8, 2)]],
        }, stairs: { run: [-51.6, -20.8, '+x', 1.6], hole: [-51.7, -21.7, -46.95, -19.0] },
      });
      B(-43.2, 0, -22, -42.8, 2.4, -14, COL.wall2);
      building(34, 4, 52, 22, {
        col: [0.70, 0.66, 0.58], walls: {
          w: [[DOOR(3), WIN(8, 2), DOOR(13.5)], [WIN(2, 2), WIN(7.5, 2.5), WIN(13, 2)]], s: [[DOOR(8)], [WIN(5, 2), WIN(11, 2)]],
          n: [[DOOR(5), WIN(11, 2)], [WIN(4, 2.5), WIN(11, 2.5)]], e: [[], [WIN(8, 2)]],
        }, stairs: { run: [51.6, 19.2, '-x', 1.6], hole: [46.95, 19.0, 51.7, 21.7] },
      });
      B(42.8, 0, 14, 43.2, 2.4, 22, COL.wall2);
      container(-14, -6, 0, COL.cRed); container(-14, -6, 0, COL.cBlue, 2.6);
      container(-6, 6, 1, COL.cGreen); container(4, -10, 0, COL.cOrange); container(10.5, -10, 0, COL.cGrey);
      container(14, 4, 1, COL.cBlue); container(14, 4, 1, COL.cRed, 2.6); container(-2, 16, 0, COL.cYel);
      container(-22, 12, 1, COL.cGrey); container(22, -18, 1, COL.cGreen); container(-24, -28, 0, COL.cBlue); container(-17.5, -28, 0, COL.cOrange);
      container(26, 26, 0, COL.cRed); container(-30, 22, 0, COL.cGreen);
      stairs(-20.83, -7.2, '+x', 1.4, 0, 2.6);
      const crate = (x, z, s, y) => Bc(x, z, s || 1.2, s || 1.2, s || 1.2, COL.crate, y || 0);
      crate(0, 0); crate(1.3, 0.3); crate(0.6, 0, 1, 1.2); crate(-8, -18); crate(-6.8, -18.2, 1); crate(8, 12); crate(20, -4); crate(21.2, -4, 1);
      crate(-28, 0); crate(-28, 1.3, 1); crate(30, -8); crate(-10, 24, 1.4); crate(6, 24);
      const barrier = (x, z, rz) => rz ? Bc(x, z, 0.6, 3, 0.95, COL.concrete) : Bc(x, z, 3, 0.6, 0.95, COL.concrete);
      for (const [x, z, r] of [[-48, 33, 0], [-36, 36, 1], [-24, 32, 0], [-12, 37, 0], [0, 33, 1], [12, 36, 0], [24, 32, 0], [36, 37, 1], [48, 33, 0]]) barrier(x, z, r);
      barrier(-4, -24, 0); barrier(6, -30, 0); barrier(-30, -10, 1); barrier(30, 0, 1); barrier(-20, 30, 0); barrier(18, 18, 1);
      Bc(-2, -36, 4, 0.8, 1.0, COL.sand); Bc(-4.4, -34.6, 0.8, 2.8, 1.0, COL.sand); Bc(40, -6, 0.8, 4, 1.0, COL.sand);
      tower(44, -34, 1);
      building(-44, -24, -36, -18, { floors: 1, col: [0.60, 0.50, 0.40], walls: { n: [[DOOR(3)]], e: [[WIN(2, 2.2)]], s: [[DOOR(4)]] } });
      building(22, 24, 30, 30, { floors: 1, col: [0.62, 0.63, 0.60], walls: { s: [[DOOR(3)]], w: [[WIN(2, 2)]], n: [[WIN(4, 2.5, 1.0, 2.2)]] } });
      stairs(30.2, 24, '+z', 1.2, 0, 3.2);
      for (const [x, z] of [[-30, 40], [0, 40], [30, 40], [-55, 0], [55, -20], [0, -42]]) lamp(x, z);
      for (const [x, z] of [[-52, 38], [-46, 38]]) { Bc(x, z, 3.2, 3.2, 4, [0.78, 0.78, 0.76]); Bc(x, z, 2.4, 3.6, 4.2, [0.72, 0.72, 0.70]); Bc(x, z, 3.6, 2.4, 4.2, [0.72, 0.72, 0.70]); }
    },
  },
  downtown: {
    name: 'ダウンタウン', desc: '夕暮れの市街地。大通りと路地、建物の2階と非常階段から屋上へ。',
    bounds: [-54, 54, -44, 44],
    env: { skyTop: [0.28, 0.32, 0.52], fog: [0.86, 0.60, 0.44], sun: [-0.75, 0.38, 0.3], sunCol: [1.0, 0.68, 0.42], amb: [0.50, 0.48, 0.58], fogNear: 40, fogFar: 230, ground: [0.56, 0.55, 0.53] },
    build() {
      perimeter(10, [0.42, 0.38, 0.36]);
      const asp = COL.asphalt;
      flat(-7, -42, 7, 42, asp); flat(-52, -6, 52, 6, asp);
      for (let z = -40; z < 40; z += 6) if (Math.abs(z) > 7) flat(-0.15, z, 0.15, z + 3, [0.85, 0.80, 0.55]);
      for (let x = -50; x < 50; x += 6) if (Math.abs(x) > 8) flat(x, -0.15, x + 3, 0.15, [0.85, 0.80, 0.55]);
      const C1 = [0.66, 0.52, 0.44], C2 = [0.58, 0.58, 0.62], C3 = [0.72, 0.66, 0.55], C4 = [0.50, 0.44, 0.40];
      // NW
      house(-48, -38, -30, -22, { floors: 2, doors: 'se', col: C1 });
      house(-26, -38, -12, -26, { floors: 1, doors: 'sw', col: C3, roofStairs: 'e' });
      house(-48, -18, -36, -10, { floors: 1, doors: 'ne', col: C2 });
      // NE
      house(12, -38, 26, -24, { floors: 2, doors: 'sw', col: C2 });
      stairs(26.15, -37.7, '+z', 1.4, 0, 6.4, COL.metal);
      house(32, -38, 48, -20, { floors: 2, doors: 'wn', col: C4 });
      house(14, -20, 26, -10, { floors: 1, doors: 'ws', col: C3 });
      // SW
      house(-48, 10, -32, 26, { floors: 2, doors: 'ne', col: C3 });
      house(-28, 12, -12, 24, { floors: 1, doors: 'ens', col: C1, roofStairs: 'w' });
      house(-46, 30, -30, 38, { floors: 1, doors: 'n', col: C2 });
      // SE
      house(12, 10, 30, 22, { floors: 2, doors: 'wn', col: C1 });
      house(34, 10, 48, 30, { floors: 1, doors: 'wn', col: C2, roofStairs: 'w' });
      house(12, 28, 28, 38, { floors: 1, doors: 'n', col: C4 });
      // street props
      Bc(0, 0, 4, 4, 0.6, COL.concrete); Bc(0, 0, 1, 1, 1.8, COL.concrete); Bc(0, 0, 3.4, 3.4, 0.05, [0.3, 0.45, 0.55], 0.6);
      car(-3.5, -24, 1, [0.55, 0.12, 0.10]); car(3.5, -14, 1, [0.20, 0.25, 0.35]); car(-16, -2.5, 0, [0.80, 0.78, 0.72]);
      car(20, 3, 0, [0.15, 0.15, 0.16]); car(3.5, 20, 1, [0.70, 0.55, 0.12]); car(-3.5, 33, 1, [0.25, 0.35, 0.25]);
      Bc(34, -2.6, 11, 2.6, 3.0, [0.75, 0.62, 0.20], 0.2); Bc(34, -2.6, 11.2, 2.7, 0.2, [0.15, 0.15, 0.15]);
      for (const [x, z] of [[-29, -20], [9.5, -30], [-9.5, 28], [30, -14], [-31, 4 + 24]]) Bc(x, z, 1.8, 1.0, 1.3, [0.18, 0.36, 0.22]);
      for (const [x, z, r] of [[-10, -12, 0], [10, 12, 0], [-22, 8, 1], [22, -8, 1], [-40, -2, 0], [42, 3, 0]]) r ? Bc(x, z, 0.6, 3, 0.95, COL.concrete) : Bc(x, z, 3, 0.6, 0.95, COL.concrete);
      for (const [x, z] of [[-8, -20], [8, -32], [-8, 20], [8, 34], [-30, -7.5], [30, 7.5]]) lamp(x, z, 7);
      Bc(-9.5, -36, 0.15, 3.5, 2.4, [0.3, 0.3, 0.32]); Bc(-9.0, -36, 1.2, 3.6, 0.1, [0.3, 0.3, 0.32], 2.4);
      for (const [x, z] of [[-26, -8.5], [44, -8.5], [-44, 8.5]]) Bc(x, z, 1.2, 1.2, 1.2, COL.crate);
    },
  },
  outpost: {
    name: 'スノーベース', desc: '雪の前哨基地。中央の滑走路は長射程、2本の見張り塔と格納庫。',
    bounds: [-62, 62, -48, 48],
    env: { skyTop: [0.58, 0.64, 0.74], fog: [0.80, 0.83, 0.87], sun: [0.3, 0.55, -0.5], sunCol: [0.70, 0.74, 0.82], amb: [0.64, 0.68, 0.74], fogNear: 30, fogFar: 200, ground: [0.80, 0.83, 0.87] },
    build() {
      perimeter(6, [0.55, 0.57, 0.60]);
      flat(-58, -6, 58, 6, [0.42, 0.44, 0.47]);
      for (let x = -54; x < 54; x += 8) flat(x, -0.2, x + 4, 0.2, [0.9, 0.9, 0.85]);
      const G = [0.48, 0.54, 0.44], Gr = [0.62, 0.64, 0.66];
      house(-42, -38, -18, -28, { floors: 1, doors: 'nsew', col: G, roofCol: COL.snow });
      house(18, -38, 42, -28, { floors: 1, doors: 'nsew', col: G, roofCol: COL.snow, roofStairs: 'e' });
      // hangar (open south)
      const hx0 = -9, hx1 = 9, hz0 = -42, hz1 = -20, hh = 7;
      B(hx0, 0, hz0, hx1, hh, hz0 + 0.3, Gr);
      wallSeg('z', hx0, hz0, hz1, 0, hh, 0.3, Gr, [DOOR(9, 1.6)]); wallSeg('z', hx1, hz0, hz1, 0, hh, 0.3, Gr, [DOOR(9, 1.6)]);
      wallSeg('x', hz1, hx0, hx1, 0, hh, 0.3, Gr, [{ a: 3, b: 15, y0: 0, y1: 5 }]);
      B(hx0 - 0.3, hh, hz0 - 0.3, hx1 + 0.3, hh + 0.3, hz1 + 0.3, COL.snow);
      Bc(-3, -31, 3, 6, 1.8, [0.35, 0.37, 0.33]); Bc(-3, -31, 9, 1.6, 0.4, [0.35, 0.37, 0.33], 1.4); Bc(4, -36, 1.2, 1.2, 1.2, COL.crate); Bc(5.2, -35.8, 1.2, 1.2, 1.2, COL.crate);
      // command building
      house(-12, 18, 8, 32, { floors: 2, doors: 'nsew', col: [0.66, 0.66, 0.62], roofCol: COL.snow });
      // radar
      Bc(30, 26, 8, 8, 1.5, Gr); Bc(30, 26, 6, 6, 1.5, [0.85, 0.86, 0.88], 1.5); Bc(30, 26, 4, 4, 1.2, [0.85, 0.86, 0.88], 3); Bc(30, 26, 0.3, 0.3, 4, COL.trim, 4.2);
      stairs(23.9, 22.5, '+x', 1.2, 0, 1.5);
      tower(-44, 32, 1); tower(42, -16, -1);
      // mounds & cover
      for (const [x, z, w, d] of [[-30, -12, 7, 5], [24, 14, 8, 6], [-28, 14, 6, 6], [50, -36, 6, 4], [-50, -12, 6, 7], [0, 40, 9, 5], [52, 30, 6, 6]]) mound(x, z, w, d, COL.snow);
      for (const [x, z, r] of [[-16, 9, 0], [12, -9, 0], [-36, 0, 1], [40, 0, 1], [0, -14, 0], [-4, 12, 0]]) r ? Bc(x, z, 0.8, 4, 1.0, [0.78, 0.76, 0.70]) : Bc(x, z, 4, 0.8, 1.0, [0.78, 0.76, 0.70]);
      container(-22, -20, 0, COL.cRed, 0, true); container(20, -18, 1, COL.cBlue, 0, true); container(-48, 20, 1, COL.cGreen, 0, true); container(46, 38, 0, COL.cOrange, 0, true);
      for (const [x, z] of [[-54, -38], [-38, -44 + 0], [54, -44 + 4], [56, 10], [-56, 4], [20, 42], [-24, 42], [44, 22]]) pine(x, z);
      for (const [x, z] of [[52, 18 + 20], [-14, -12]]) { Bc(x, z, 3, 3, 3.2, [0.78, 0.30, 0.20]); Bc(x, z, 2.2, 3.4, 3.4, [0.74, 0.28, 0.18]); }
      for (let x = -48; x <= 48; x += 16) lamp(x, -8, 5);
    },
  },
  village: {
    name: 'デザートビレッジ', desc: '砂漠の村。中央市場の撃ち合い、屋根へ登る階段、東の丘から村を見下ろせる。',
    bounds: [-52, 52, -52, 52],
    env: { skyTop: [0.40, 0.62, 0.90], fog: [0.90, 0.82, 0.68], sun: [0.4, 0.88, 0.25], sunCol: [0.95, 0.86, 0.70], amb: [0.66, 0.60, 0.54], fogNear: 50, fogFar: 260, ground: [0.80, 0.68, 0.48] },
    build() {
      perimeter(5, COL.adobe2);
      const A = [COL.adobe1, COL.adobe2, COL.adobe3], roof = [0.70, 0.58, 0.42];
      // market
      stall(-6, -6, 0, [0.70, 0.20, 0.18]); stall(6, -6, 0, [0.20, 0.40, 0.62]); stall(-6, 6, 0, [0.82, 0.62, 0.20]); stall(6, 6, 0, [0.30, 0.55, 0.30]);
      for (const [ox, oz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) Bc(ox * 0.9, oz * 0.9, ox ? 0.3 : 2.1, oz ? 0.3 : 2.1, 0.8, COL.adobe2);
      // houses (1F with roof stairs)
      const H = [
        [-40, -42, -28, -32, 'ns', 'e'], [-22, -44, -12, -34, 'sn', 'w'], [-4, -44, 8, -34, 'se', 'e'], [14, -42, 26, -30, 'sw', 'n'], [32, -44, 44, -34, 'nw', 'e'],
        [-44, -24, -32, -14, 'es', 's'], [-24, -26, -14, -16, 'wsn', 'e'], [16, -24, 26, -16, 'ws', 'e'], [32, -26, 44, -14, 'nw', 's'],
        [-44, 12, -34, 22, 'en', 'n'], [-26, 14, -14, 24, 'nw', 'e'], [14, 14, 24, 26, 'ne', 'w'],
        [-40, 32, -28, 42, 'en', 'e'], [-20, 32, -8, 44, 'ns', 'w'], [0, 34, 12, 44, 'nw', 'e'],
      ];
      H.forEach(([x0, z0, x1, z1, dr, rs], i) => house(x0, z0, x1, z1, { floors: 1, doors: dr, col: A[i % 3], roofCol: roof, trimCol: A[(i + 1) % 3].map(v => v * 0.9), roofStairs: rs, stairCol: COL.adobe2 }));
      house(-44, -8, -30, 6, { floors: 2, doors: 'ens', col: COL.adobe3, roofCol: roof, trimCol: COL.adobe2 });
      house(28, 28, 44, 44, { floors: 2, doors: 'nw', col: COL.adobe1, roofCol: roof, trimCol: COL.adobe2 });
      // compound walls
      const wl = (x0, z0, x1, z1) => B(x0, 0, z0, x1, 2.4, z1, COL.adobe2);
      wl(-28, -12, -12, -11.6); wl(12, -12, 26, -11.6); wl(-28, 11.6, -18, 12); wl(18, 11.6, 26, 12); wl(-12.4, 26, -12, 32);
      // east hill
      for (let i = 0; i < 5; i++) { const k = 1 - i * 0.18; Bc(40, 4, 16 * k, 20 * k, 0.42, [0.74, 0.62, 0.44], i * 0.42); }
      Bc(40, 4, 3, 0.6, 1.0, COL.sand, 2.1); Bc(38.2, 5.5, 0.6, 2.4, 1.0, COL.sand, 2.1);
      // props
      for (const [x, z] of [[-14, -6], [14, 6], [-30, 26], [22, -6], [0, -24], [0, 26], [-48, -48 + 4], [46, -48]]) palm(x, z);
      for (const [x, z] of [[-10, 14], [10, -14], [-18, -2], [18, 2], [28, -8], [-30, 9]]) { Bc(x, z, 0.7, 0.7, 1.0, [0.40, 0.30, 0.20]); Bc(x + 0.8, z, 0.7, 0.7, 1.0, [0.45, 0.33, 0.22]); }
      for (const [x, z, r] of [[-2, -18, 0], [2, 18, 1], [26, 0, 1], [-24, 0, 1]]) { r ? Bc(x, z, 1.6, 2.6, 1.0, COL.wood) : Bc(x, z, 2.6, 1.6, 1.0, COL.wood); }
    },
  },
  depot: {
    name: 'デポ', desc: '小さな物流デポ。左右対称の小型マップで、どこにいても撃ち合いになる短期決戦向き。',
    bounds: [-32, 32, -24, 24],
    env: { skyTop: [0.50, 0.60, 0.74], fog: [0.76, 0.78, 0.80], sun: [0.3, 0.7, 0.4], sunCol: [0.78, 0.76, 0.72], amb: [0.62, 0.63, 0.66], fogNear: 30, fogFar: 160, ground: [0.50, 0.50, 0.50] },
    build() {
      perimeter(6, [0.55, 0.52, 0.48]);
      const Y = [0.85, 0.70, 0.15];
      flat(-29, -2, 29, 2, [0.42, 0.42, 0.43]);
      for (let x = -27; x < 27; x += 3) flat(x, -12.15, x + 1.5, -11.85, Y), flat(x, 11.85, x + 1.5, 12.15, Y);
      house(-28, -7, -18, 7, { floors: 2, doors: 'ens', col: [0.72, 0.58, 0.40] });
      house(18, -7, 28, 7, { floors: 2, doors: 'wns', col: [0.42, 0.55, 0.66] });
      // loading dock in the middle (raised)
      B(-6, 0, -3.5, 6, 1.2, 3.5, COL.concrete);
      stairs(-9.36, -1.2, '+x', 2.4, 0, 1.2); stairs(9.36, -1.2, '-x', 2.4, 0, 1.2);
      Bc(-2.5, 1.5, 1.2, 1.2, 1.0, COL.crate, 1.2); Bc(2.2, -1.6, 1.2, 1.2, 1.0, COL.crate, 1.2); Bc(2.2, -1.6, 1.0, 1.0, 0.9, COL.crate, 2.2);
      Bc(0, 0, 0.3, 6, 1.0, Y, 1.2);
      // north lane: trailer + container
      Bc(-6, -16, 12, 2.6, 0.9, [0.2, 0.2, 0.2], 0.1); Bc(-6, -16, 12, 2.6, 2.9, [0.80, 0.80, 0.78], 1.0);
      container(10, -17, 0, COL.cBlue); container(-22, -17, 0, COL.cRed);
      Bc(4, -12.5, 3, 0.6, 1.0, COL.concrete); Bc(-15, -13, 0.6, 3, 1.0, COL.concrete);
      // south lane: shed + pallets
      house(-4, 13, 4, 19, { floors: 1, doors: 'ew', col: [0.60, 0.62, 0.58] });
      for (const [x, z] of [[-12, 14], [-13.3, 14], [12, 15], [13.2, 15.6], [-22, 17], [22, 17]]) Bc(x, z, 1.2, 1.2, 1.1, COL.crate);
      for (const [x, z] of [[-9, 20], [9, 20], [-14, 9], [14, -9], [-14, -9], [14, 9]]) { Bc(x, z, 0.65, 0.65, 1.0, [0.25, 0.40, 0.55]); Bc(x + 0.7, z, 0.65, 0.65, 1.0, [0.25, 0.40, 0.55]); }
      Bc(-10, 7, 3, 0.6, 1.0, COL.concrete); Bc(10, -7, 3, 0.6, 1.0, COL.concrete);
      for (const [x, z] of [[-30, -22], [30, 22], [0, -22], [0, 22]]) lamp(x === 0 ? x : x * 0.97, z * 0.95, 6);
    },
  },
  lab: {
    name: 'ラボ', desc: 'ゾンビ専用。廃研究施設。窓のバリケードを守り、電源・ヒューズ・暗号・部品集めで施設を蘇らせろ。', zm: true,
    bounds: [-48, 48, -42, 42],
    env: { skyTop: [0.04, 0.05, 0.09], fog: [0.10, 0.10, 0.13], sun: [0.3, 0.8, 0.2], sunCol: [0.36, 0.40, 0.55], amb: [0.30, 0.30, 0.36], fogNear: 8, fogFar: 75, ground: [0.32, 0.31, 0.29] },
    build() { buildLab(); },
  },
};
function applyEnv(e) {
  R.fogCol = e.fog; R.skyTop = e.skyTop; R.sun = V.norm(e.sun); R.sunCol = e.sunCol; R.amb = e.amb; R.fogNear = e.fogNear; R.fogFar = e.fogFar;
}
function buildMap(id) {
  const M = MAPS[id] || MAPS.yard; W.id = MAPS[id] ? id : 'yard';
  W.boxes = []; CUR_STAIR_COL = null;
  [W.minX, W.maxX, W.minZ, W.maxZ] = M.bounds;
  B(W.minX - 20, -1, W.minZ - 20, W.maxX + 20, 0, W.maxZ + 20, M.env.ground, { ground: 1 });
  W.doors = []; W.buys = []; W.boxLocs = []; W.zoneSpawn = null; W.windows = []; W.zq = null; W.bossDoor = null;
  M.build();
  applyEnv(M.env);
  buildNav();
  W.spawns = M.zm ? [[0, 0, 0]] : autoSpawns(24);
  buildMinimap();
  if (R.gl) { buildWorldMesh(); buildSky(); }
}

// ---------- collision ----------
function aabbOverlap(mn, mx, b) { return mn[0] < b.mx[0] && mx[0] > b.mn[0] && mn[1] < b.mx[1] && mx[1] > b.mn[1] && mn[2] < b.mx[2] && mx[2] > b.mn[2]; }
function boxesNear(x, z, r) {
  const out = [], s = W.bk.s, i0 = Math.floor((x - r - W.minX) / s), i1 = Math.floor((x + r - W.minX) / s), j0 = Math.floor((z - r - W.minZ) / s), j1 = Math.floor((z + r - W.minZ) / s);
  const stamp = ++W.bk.stamp;
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const cell = W.bk.cells[i * 1000 + j]; if (!cell) continue;
    for (const b of cell) if (b._st !== stamp) { b._st = stamp; out.push(b); }
  }
  return out;
}
function buildBuckets() {
  const s = 4; W.bk = { s, cells: {}, stamp: 0 };
  for (const b of W.boxes) {
    if (b.ground || b.flat) continue;
    const i0 = Math.floor((b.mn[0] - W.minX) / s), i1 = Math.floor((b.mx[0] - W.minX) / s), j0 = Math.floor((b.mn[2] - W.minZ) / s), j1 = Math.floor((b.mx[2] - W.minZ) / s);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) (W.bk.cells[i * 1000 + j] ||= []).push(b);
  }
}
function moveEntity(e, dx, dy, dz, hw, h, stepH) {
  const p = e.pos; let ground = false, hitWall = false;
  const near = boxesNear(p[0] + dx / 2, p[2] + dz / 2, hw + Math.abs(dx) + Math.abs(dz) + 1);
  for (const ax of [0, 2]) {
    const d = ax === 0 ? dx : dz; if (!d) continue;
    p[ax] += d;
    for (const b of near) {
      const mn = [p[0] - hw, p[1] + 0.001, p[2] - hw], mx = [p[0] + hw, p[1] + h, p[2] + hw];
      if (!aabbOverlap(mn, mx, b)) continue;
      const up = b.mx[1] - p[1];
      if (stepH && up > 0 && up <= stepH) {
        const mn2 = [mn[0], b.mx[1] + 0.001, mn[2]], mx2 = [mx[0], b.mx[1] + h, mx[2]];
        let free = true; for (const b2 of near) if (b2 !== b && aabbOverlap(mn2, mx2, b2)) { free = false; break; }
        if (free) { p[1] = b.mx[1]; e.stepped = (e.stepped || 0) + up; continue; }
      }
      p[ax] = d > 0 ? b.mn[ax] - hw - 0.0005 : b.mx[ax] + hw + 0.0005; hitWall = true;
    }
  }
  p[1] += dy;
  if (p[1] < 0) { p[1] = 0; ground = true; }
  for (const b of near) {
    const mn = [p[0] - hw, p[1], p[2] - hw], mx = [p[0] + hw, p[1] + h, p[2] + hw];
    if (!aabbOverlap(mn, mx, b)) continue;
    if (dy <= 0 && p[1] - dy >= b.mx[1] - 0.05) { p[1] = b.mx[1]; ground = true; }
    else if (dy > 0) { p[1] = b.mn[1] - h - 0.001; e.vel && (e.vel[1] = 0); }
    else if (b.mx[1] - p[1] < 0.5) { p[1] = b.mx[1]; ground = true; }
  }
  // keep inside map
  p[0] = clamp(p[0], W.minX + 2.4, W.maxX - 2.4); p[2] = clamp(p[2], W.minZ + 2.4, W.maxZ - 2.4);
  return { ground, hitWall };
}
function spaceFree(p, hw, h) {
  const mn = [p[0] - hw, p[1] + 0.01, p[2] - hw], mx = [p[0] + hw, p[1] + h, p[2] + hw];
  for (const b of boxesNear(p[0], p[2], hw + 1)) if (aabbOverlap(mn, mx, b)) return false;
  return true;
}
// ---------- raycast ----------
function rayBox(o, d, mn, mx, tmax) {
  let t0 = 0, t1 = tmax, nAx = -1;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < mn[a] || o[a] > mx[a]) return -1; continue; }
    const inv = 1 / d[a]; let ta = (mn[a] - o[a]) * inv, tb = (mx[a] - o[a]) * inv;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) { t0 = ta; nAx = a; }
    if (tb < t1) t1 = tb;
    if (t0 > t1) return -1;
  }
  R._nAx = nAx; R._t1 = t1;
  return t0;
}
function rayBoxExit(o, d, mn, mx) {
  let t1 = 1e9;
  for (let a = 0; a < 3; a++) { if (Math.abs(d[a]) < 1e-9) continue; const inv = 1 / d[a]; t1 = Math.min(t1, Math.max((mn[a] - o[a]) * inv, (mx[a] - o[a]) * inv)); }
  return t1;
}
// Amanatides-Woo DDA over bucket grid
function rayWorld(o, d, tmax) {
  let best = tmax, hit = null, nAx = 1;
  if (d[1] < 0) { const t = -o[1] / d[1]; if (t > 0 && t < best) { best = t; hit = W.boxes[0]; nAx = 1; } }
  const s = W.bk.s, stamp = ++W.bk.stamp;
  let ci = Math.floor((o[0] - W.minX) / s), cj = Math.floor((o[2] - W.minZ) / s);
  const si = d[0] > 0 ? 1 : -1, sj = d[2] > 0 ? 1 : -1;
  const tdi = Math.abs(d[0]) > 1e-9 ? s / Math.abs(d[0]) : 1e9, tdj = Math.abs(d[2]) > 1e-9 ? s / Math.abs(d[2]) : 1e9;
  let tmi = Math.abs(d[0]) > 1e-9 ? ((d[0] > 0 ? (ci + 1) * s + W.minX - o[0] : o[0] - (ci * s + W.minX)) / Math.abs(d[0])) : 1e9;
  let tmj = Math.abs(d[2]) > 1e-9 ? ((d[2] > 0 ? (cj + 1) * s + W.minZ - o[2] : o[2] - (cj * s + W.minZ)) / Math.abs(d[2])) : 1e9;
  let tc = 0;
  for (let it = 0; it < 200; it++) {
    const cell = W.bk.cells[ci * 1000 + cj];
    if (cell) for (const b of cell) {
      if (b._st === stamp) continue; b._st = stamp;
      if (b.noRay) continue;
      const tt = rayBox(o, d, b.mn, b.mx, best);
      if (tt >= 0 && tt < best) { best = tt; hit = b; nAx = R._nAx; }
    }
    if (tmi < tmj) { tc = tmi; tmi += tdi; ci += si; } else { tc = tmj; tmj += tdj; cj += sj; }
    if (tc > best || tc > tmax) break;
  }
  if (!hit) return null;
  const ax = nAx < 0 ? 1 : nAx, n = [0, 0, 0]; n[ax] = -Math.sign(d[ax]) || 1;
  return { t: best, box: hit, n };
}
function losClear(a, b) {
  const d = V.sub(b, a), L = V.len(d); if (L < 0.01) return true;
  const h = rayWorld(a, V.mul(d, 1 / L), L);
  return !h || h.t >= L - 0.05;
}
// ---------- navigation ----------
function buildNav() {
  buildBuckets();
  const gw = W.maxX - W.minX, gh = W.maxZ - W.minZ;
  W.gw = gw; W.gh = gh; W.grid = new Uint8Array(gw * gh);
  for (let i = 0; i < gw; i++) for (let j = 0; j < gh; j++) {
    const x0 = W.minX + i + 0.15, z0 = W.minZ + j + 0.15, x1 = x0 + 0.7, z1 = z0 + 0.7;
    let blocked = 0;
    for (const b of boxesNear(x0 + 0.35, z0 + 0.35, 1)) {
      if (b.mn[1] < 1.75 && b.mx[1] > 0.25 && x0 < b.mx[0] && x1 > b.mn[0] && z0 < b.mx[2] && z1 > b.mn[2]) { blocked = 1; break; }
    }
    W.grid[i * gh + j] = blocked;
  }
}
const navCell = (x, z) => [clamp(Math.floor(x - W.minX), 0, W.gw - 1), clamp(Math.floor(z - W.minZ), 0, W.gh - 1)];
const navFree = (i, j) => i >= 0 && j >= 0 && i < W.gw && j < W.gh && !W.grid[i * W.gh + j];
function autoSpawns(n) {
  const gw = W.gw, gh = W.gh, comp = new Int32Array(gw * gh).fill(-1);
  let bestC = -1, bestSize = 0, cid = 0;
  for (let k = 0; k < gw * gh; k++) {
    if (W.grid[k] || comp[k] >= 0) continue;
    const q = [k]; comp[k] = cid; let size = 0;
    while (q.length) { const c = q.pop(); size++; const i = (c / gh) | 0, j = c % gh; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = i + di, nj = j + dj; if (navFree(ni, nj) && comp[ni * gh + nj] < 0) { comp[ni * gh + nj] = cid; q.push(ni * gh + nj); } } }
    if (size > bestSize) { bestSize = size; bestC = cid; } cid++;
  }
  const cands = [];
  for (let i = 3; i < gw - 3; i++) for (let j = 3; j < gh - 3; j++) {
    const k = i * gh + j; if (comp[k] !== bestC) continue;
    let ok = true; for (let di = -1; di <= 1 && ok; di++) for (let dj = -1; dj <= 1; dj++) if (!navFree(i + di, j + dj)) { ok = false; break; }
    if (ok) cands.push([W.minX + i + 0.5, 0, W.minZ + j + 0.5]);
  }
  const out = [], md = cands.map(() => 1e9);
  let cur = cands[(cands.length / 2) | 0];
  for (let s = 0; s < n && cur; s++) {
    out.push(cur); let bi = -1, bd = -1;
    for (let c = 0; c < cands.length; c++) { const d = V.dist2(cands[c], cur); if (d < md[c]) md[c] = d; if (md[c] > bd) { bd = md[c]; bi = c; } }
    cur = cands[bi];
  }
  return out;
}
function nearestFree(i, j) {
  if (navFree(i, j)) return [i, j];
  for (let r = 1; r < 6; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) if (navFree(i + di, j + dj)) return [i + di, j + dj];
  return null;
}
function findPath(from, to) {
  const s = nearestFree(...navCell(from[0], from[2])), g = nearestFree(...navCell(to[0], to[2]));
  if (!s || !g) return null;
  const gh = W.gh, N = W.gw * gh, key = (i, j) => i * gh + j;
  const gs = new Float32Array(N).fill(1e9), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const heap = [], push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const sk = key(...s), gk = key(...g); gs[sk] = 0; push(sk, 0);
  let iter = 0;
  while (heap.length && iter++ < 14000) {
    const [, k] = pop(); if (closed[k]) continue; closed[k] = 1;
    if (k === gk) break;
    const i = (k / gh) | 0, j = k % gh;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue; const ni = i + di, nj = j + dj;
      if (!navFree(ni, nj)) continue;
      if (di && dj && (!navFree(i + di, j) || !navFree(i, j + dj))) continue;
      const nk = key(ni, nj), c = gs[k] + (di && dj ? 1.414 : 1);
      if (c < gs[nk]) { gs[nk] = c; came[nk] = k; push(nk, c + Math.hypot(ni - g[0], nj - g[1])); }
    }
  }
  if (came[gk] < 0 && gk !== sk) return null;
  const path = []; let k = gk;
  while (k >= 0 && k !== sk) { path.push([W.minX + ((k / gh) | 0) + 0.5, 0, W.minZ + (k % gh) + 0.5]); k = came[k]; }
  path.reverse();
  const out = []; let a = [from[0], 0, from[2]], idx = 0;
  while (idx < path.length) {
    let far = idx;
    for (let t = Math.min(path.length - 1, idx + 40); t > idx; t--) if (walkClear(a, path[t])) { far = t; break; }
    out.push(path[far]); a = path[far]; idx = far + 1;
  }
  return out;
}
// straight walk check with body clearance (checks the bot's footprint, not just the centre line)
function walkClear(a, b) {
  const L = V.dist2(a, b), n = Math.max(1, Math.ceil(L / 0.3));
  for (let k = 1; k <= n; k++) {
    const t = k / n, x = lerp(a[0], b[0], t), z = lerp(a[2], b[2], t);
    for (const [ox, oz] of [[0, 0], [0.33, 0.33], [-0.33, 0.33], [0.33, -0.33], [-0.33, -0.33]]) { const [i, j] = navCell(x + ox, z + oz); if (!navFree(i, j)) return false; }
  }
  return true;
}
// is there a wall right in front (not a small step)?
function blockedAhead(pos, dx, dz, dist) {
  const x = pos[0] + dx * dist, z = pos[2] + dz * dist;
  const mn = [x - 0.22, pos[1] + 0.47, z - 0.22], mx = [x + 0.22, pos[1] + 1.7, z + 0.22];
  for (const b of boxesNear(x, z, 1)) if (aabbOverlap(mn, mx, b)) return true;
  return false;
}
// ---------- minimap ----------
function buildMinimap() {
  const sc = 4, c = document.createElement('canvas'); c.width = (W.maxX - W.minX) * sc; c.height = (W.maxZ - W.minZ) * sc;
  const x = c.getContext('2d'); const g = MAPS[W.id].env.ground;
  x.fillStyle = `rgb(${g.map(v => (v * 70) | 0).join(',')})`; x.fillRect(0, 0, c.width, c.height);
  const sorted = W.boxes.filter(b => !b.ground && !b.invis).sort((a, b) => a.mx[1] - b.mx[1]);
  for (const b of sorted) {
    if (b.flat) x.fillStyle = 'rgba(30,30,30,.35)';
    else { const v = clamp(70 + b.mx[1] * 18, 70, 210) | 0; x.fillStyle = `rgb(${v},${v},${v - 6})`; }
    x.fillRect((b.mn[0] - W.minX) * sc, (b.mn[2] - W.minZ) * sc, (b.mx[0] - b.mn[0]) * sc, (b.mx[2] - b.mn[2]) * sc);
  }
  W.mapCanvas = c; W.mapScale = sc;
}
function buildWorldMesh() {
  const arr = [];
  for (const b of W.boxes) {
    if (b.invis) continue;
    if (b.ground) { boxVerts(arr, b.mn, b.mx, b.c, 0); continue; }
    boxVerts(arr, b.mn, b.mx, b.c, 0.06, b.mn[1] <= 0.001);
    if (b.ribs) {
      const ax = b.ribs === 'x' ? 0 : 2, o = 2 - ax; const L = b.mx[ax] - b.mn[ax];
      for (let u = 0.4; u < L - 0.2; u += 0.55) for (const side of [0, 1]) {
        const mn = b.mn.slice(), mx = b.mx.slice();
        mn[ax] = b.mn[ax] + u; mx[ax] = mn[ax] + 0.12; mn[1] = b.mn[1] + 0.12; mx[1] = b.mx[1] - 0.12;
        if (side) { mn[o] = b.mx[o]; mx[o] = b.mx[o] + 0.04; } else { mx[o] = b.mn[o]; mn[o] = b.mn[o] - 0.04; }
        boxVerts(arr, mn, mx, b.c.map(v => v * 0.85), 0, true);
      }
    }
  }
  if (R.world) R.gl.deleteBuffer(R.world.buf);
  R.world = makeMesh(arr);
}

// ---------------- ZOMBIE MAP (zones / doors / buyables) ----------------
// zones: A start(center) B north C east D south E west F north-east G south-west
function zoneAt(x, z) {
  const c = x < -14 ? 0 : x > 14 ? 2 : 1, r = z < -11 ? 0 : z > 11 ? 2 : 1;
  return [['X', 'B', 'F'], ['E', 'A', 'C'], ['G', 'D', 'Y']][r][c];
}
const ZONE_NAME = { A: 'エントランス', B: '研究棟', C: '倉庫', D: '中庭', E: '地下通路', F: '発電所', G: '管制室' };
function buildLab() {
  const WC = [0.42, 0.40, 0.37], WH = 4.5, T = 0.5, PH = 6;
  W.doors = []; W.buys = []; W.zoneSpawn = {}; W.zones = { A: true }; W.windows = []; W.zq = {};
  // ---- perimeter with boarded windows ----
  const winDefs = { n: [[-34, 'X'], [-20, 'X'], [-6, 'B'], [6, 'B'], [27, 'F']], s: [[-7, 'D'], [3, 'D'], [-27, 'G']], e: [[-5, 'C'], [5, 'C'], [-22, 'F']], w: [[-29, 'X'], [-17, 'X'], [-5, 'E'], [5, 'E'], [22, 'G']] };
  const WIN_OPEN = (c, u0) => ({ a: c - u0 - 0.8, b: c - u0 + 0.8, y0: 0.9, y1: 2.3 });
  wallSeg('x', -35, -42, 42, 0, PH, 2, WC, winDefs.n.map(([x]) => WIN_OPEN(x, -42)));
  wallSeg('x', 35, -42, 42, 0, PH, 2, WC, winDefs.s.map(([x]) => WIN_OPEN(x, -42)));
  wallSeg('z', 41, -34, 34, 0, PH, 2, WC, winDefs.e.map(([z]) => WIN_OPEN(z, -34)));
  wallSeg('z', -41, -34, 34, 0, PH, 2, WC, winDefs.w.map(([z]) => WIN_OPEN(z, -34)));
  const addWin = (x, z, nx, nz, zone, th) => {
    th = th || 2;
    const inside = [x + nx * (th / 2 + 0.6), 0, z + nz * (th / 2 + 0.6)], outside = [x - nx * (th / 2 + 0.9), 0, z - nz * (th / 2 + 0.9)];
    const col = nx ? B(x - th / 2, 0.9, z - 0.8, x + th / 2, 2.3, z + 0.8, WC, { invis: 1, noRay: 1 }) : B(x - 0.8, 0.9, z - th / 2, x + 0.8, 2.3, z + th / 2, WC, { invis: 1, noRay: 1 });
    const vent = zone === 'X'; // vault breaches: no barricade, zombies climb straight in
    W.windows.push({ pos: [x, 1.6, z], n: [nx, 0, nz], th, inside, outside, boards: vent ? 0 : 6, vent, zone, behind: null, col, climbT: 0, swipeT: 0 });
  };
  for (const [x, zn] of winDefs.n) addWin(x, -35, 0, 1, zn);
  for (const [x, zn] of winDefs.s) addWin(x, 35, 0, -1, zn);
  for (const [z, zn] of winDefs.e) addWin(41, z, -1, 0, zn);
  for (const [z, zn] of winDefs.w) addWin(-41, z, 1, 0, zn);
  // ---- interior walls: debris doors + barricade windows of the entrance hall ----
  const DOOR_OP = c => ({ a: c - 1.6, b: c + 1.6, y0: 0, y1: 3.0 });
  const door = (x0, z0, x1, z1, z1n, z2n, cost) => {
    const boxes = [B(x0, 0, z0, x1, 2.6, z1, [0.40, 0.30, 0.20]), B(x0 + 0.2, 2.6, z0, x1 - 0.4, 3.0, z1, [0.35, 0.33, 0.30])];
    W.doors.push({ cost, zones: [z1n, z2n], boxes, pos: [(x0 + x1) / 2, 1.2, (z0 + z1) / 2], open: false });
  };
  const IW = [ // axis, fixed, doors[[c, zoneA, zoneB, cost]], window [c, nx, nz]
    ['z', -14, [[0, 'A', 'E', 1000], [22, 'D', 'G', 1250]], [6, 1, 0]],
    ['z', 14, [[0, 'A', 'C', 750], [-22, 'B', 'F', 1250]], [-6, -1, 0]],
    ['x', -11, [[0, 'A', 'B', 750], [27, 'C', 'F', 1000]], [-8, 0, 1]],
    ['x', 11, [[0, 'A', 'D', 1000], [-27, 'E', 'G', 1000]], [8, 0, -1]],
  ];
  for (const [ax, f, doors, win] of IW) {
    const u0 = ax === 'z' ? -34 : -40, u1 = -u0;
    const ops = doors.map(d => { const o = DOOR_OP(d[0]); return { a: o.a - u0, b: o.b - u0, y0: 0, y1: 3.0 }; });
    ops.push({ a: win[0] - 0.8 - u0, b: win[0] + 0.8 - u0, y0: 0.9, y1: 2.3 });
    if (ax === 'z' && f === -14) ops.push({ a: -22 - 1.8 - u0, b: -22 + 1.8 - u0, y0: 0, y1: 3.4 }); // sealed vault door to the boss arena
    ops.sort((p, q) => p.a - q.a);
    wallSeg(ax, f, u0, u1, 0, WH, T, WC, ops);
    for (const [c, a1, b1, cost] of doors) {
      if (ax === 'z') door(f - 0.45, c - 1.6, f + 0.45, c + 1.6, a1, b1, cost);
      else door(c - 1.6, f - 0.45, c + 1.6, f + 0.45, a1, b1, cost);
    }
    if (ax === 'z') addWin(f, win[0], win[1], 0, 'A', T); else addWin(win[0], f, 0, win[2], 'A', T);
    W.windows[W.windows.length - 1].behind = doors[0][2]; // zombies stand in this (still closed) zone before breaking in
  }
  // closed corner blocks (collapsed wings)
  Bc(27, 22.5, 26, 23, 4.0, [0.30, 0.29, 0.27]);
  // ---- X: containment vault (boss arena), behind the sealed door ----
  const vd = [0.16, 0.17, 0.2];
  W.bossDoor = { pos: [-14, 1.5, -22], open: false, boxes: [B(-14.5, 0, -23.8, -13.5, 3.4, -20.2, vd), B(-14.7, 3.4, -24.2, -13.3, 3.7, -19.8, [0.3, 0.3, 0.34])] };
  for (const [x, z] of [[-34, -29], [-20, -29], [-34, -16], [-20, -16]]) { Bc(x, z, 1.4, 1.4, 5.5, [0.26, 0.27, 0.3]); Bc(x, z, 1.8, 1.8, 0.4, [0.2, 0.2, 0.23]); }
  Bc(-27, -22.5, 7, 7, 0.25, [0.18, 0.18, 0.21]); // containment dais
  for (const [x, z] of [[-31, -22.5], [-23, -22.5]]) Bc(x, z, 0.5, 4, 0.9, [0.3, 0.3, 0.33]);
  W.zq_arena = { center: [-27, 0.25, -22.5], spawns: [[-38, -32], [-16.5, -32], [-38, -13.5], [-16.5, -13.5], [-27, -32.5], [-38.5, -22]], min: [-40, -34], max: [-14.5, -11.5] };
  for (const [x, z] of [[-30, -12.5], [-20, -12.5], [20, 12.5], [32, 12.5]]) Bc(x, z, 2.2, 1.2, 1.0, [0.36, 0.34, 0.31]);
  const metal = [0.50, 0.52, 0.55], dark = [0.22, 0.23, 0.25], wood = [0.45, 0.33, 0.20];
  // ---- A: entrance hall ----
  Bc(-4, 3, 1.2, 1.2, 1.1, COL.crate); Bc(4, -3, 1.2, 1.2, 1.1, COL.crate);
  Bc(-8.5, 8.5, 2.5, 0.8, 1.0, wood); Bc(8.5, -8.5, 0.8, 2.5, 1.0, wood);
  Bc(7, 5, 2.4, 1.0, 0.95, [0.42, 0.40, 0.36]); // workbench
  Bc(-6, -5, 1.0, 1.0, 0.9, [0.3, 0.3, 0.34]);    // reward pedestal
  // ---- B: research wing ----
  for (const [x, z] of [[-6, -24], [6, -24], [-6, -18], [6, -18]]) Bc(x, z, 2.6, 1.0, 0.95, [0.55, 0.57, 0.6]);
  Bc(-13.2, -18, 0.8, 5, 2.4, dark); Bc(13.2, -14.5, 0.8, 3.5, 2.4, dark);
  Bc(0, -30, 2.2, 2.2, 2.2, [0.25, 0.42, 0.38]); Bc(0, -30, 2.4, 2.4, 0.25, metal, 2.2);
  Bc(-9, -30, 3, 1.2, 2.0, metal); Bc(9, -29.5, 1.2, 3, 2.2, metal);
  // ---- C: warehouse ----
  Bc(20, 8, 1.4, 1.4, 1.4, COL.crate); Bc(20, 8, 1.2, 1.2, 1.2, COL.crate, 1.4); Bc(21.5, 8.2, 1.2, 1.2, 1.2, COL.crate);
  Bc(30, -8, 1.4, 1.4, 1.4, COL.crate); Bc(31.5, -8, 1.2, 1.2, 1.2, COL.crate);
  Bc(27, 0, 6, 2.4, 2.6, COL.cBlue); Bc(33, 9, 1.0, 1.8, 1.4, [0.8, 0.6, 0.1]); Bc(18, -6, 1.0, 3.0, 2.4, dark);
  // ---- D: courtyard ----
  car(-2, 27, 0, [0.30, 0.32, 0.30]); Bc(-6, 18, 3, 3, 0.6, COL.concrete); Bc(-6, 18, 0.8, 0.8, 1.6, COL.concrete);
  for (const [x, z] of [[10, 16], [-11, 30], [11, 24]]) { Bc(x, z, 0.4, 0.4, 2.4, COL.wood); Bc(x, z, 2.0, 2.0, 1.6, [0.18, 0.28, 0.18], 2.2); }
  Bc(4, 20, 2.6, 0.6, 0.9, wood);
  // ---- E: tunnels (maze) ----
  B(-27.25, 0, -11, -26.75, 3.2, -4, WC); B(-21.25, 0, 4, -20.75, 3.2, 11, WC); B(-38, 0, -0.25, -30, 3.2, 0.25, WC);
  for (const [x, z] of [[-17, -8], [-34, 7], [-24, 2]]) Bc(x, z, 1.0, 1.0, 1.0, [0.35, 0.32, 0.28]);
  // ---- F: power plant ----
  Bc(22, -28, 3.4, 2.4, 2.4, [0.35, 0.40, 0.36]); Bc(34, -27, 3.4, 2.4, 2.4, [0.35, 0.40, 0.36]);
  Bc(22, -28, 0.4, 0.4, 4.2, metal, 0); Bc(34, -27, 0.4, 0.4, 4.2, metal, 0); B(16, 3.4, -28.3, 40, 3.7, -27.7, metal);
  Bc(39.5, -14, 0.6, 1.6, 1.8, dark); // generator control panel (fuses)
  // ---- G: control room ----
  for (const [x, z] of [[-32, 16], [-24, 16], [-32, 22], [-24, 22]]) { Bc(x, z, 3.0, 1.0, 0.9, [0.30, 0.31, 0.34]); }
  Bc(-36, 14, 2.4, 1.0, 0.95, [0.25, 0.26, 0.3]); // code terminal desk
  Bc(-20, 33.2, 1.2, 0.6, 1.8, dark);              // power switch box
  // lights
  for (const [x, z] of [[-9, -9], [9, 9], [0, -33], [38, 0], [-38, 0], [0, 33], [32, -30], [-32, 30], [-9, 9], [9, -9]]) lamp(x, z, 4);
  // ---- spawns: windows + floor vents in the entrance hall ----
  W.zoneSpawn = {};
  // ---- buyables ----
  const wb = (wid, cost, x, z, nx, nz) => W.buys.push({ type: 'wall', wid, cost, pos: [x, 1.5, z], n: [nx, 0, nz] });
  wb('r870', 500, 4, 10.7, 0, -1); wb('sm7', 1000, -4, -10.7, 0, 1);
  wb('ar94', 1200, -13.7, -28, 1, 0); wb('m8', 1400, 39.7, -8, -1, 0); wb('pd50', 1100, -39.7, -9, 1, 0);
  wb('sg12', 1500, -10, 33.7, 0, -1); wb('ls60', 2500, 32, -33.7, 0, 1); wb('sw56', 1300, -37.7, 33.7, 0, -1);
  const pk = (perk, x, z, rot) => W.buys.push({ type: 'perk', perk, pos: [x, 0, z], rot });
  pk('jug', 12, -32.8, 0); pk('speed', 36, 9, 0); pk('dtap', -30, 32.8, 0); pk('rev', -38.5, 9, 1);
  W.boxLocs = [{ pos: [-10, 0, -15.5], zone: 'B' }, { pos: [24, 0, -6], zone: 'C' }, { pos: [30, 0, -18], zone: 'F' }, { pos: [-30, 0, 27], zone: 'G' }];
  W.buys.push({ type: 'pap', pos: [8, 0, 32.3] });
  for (const [x, z] of [[-10.5, -24], [-33, -6], [-36, 26]]) Bc(x, z, 0.9, 0.9, 0.7, [0.24, 0.24, 0.28]);
  for (const [x, z] of [[36, -3], [-8, 23], [30, -23], [-18, 16]]) Bc(x, z, 0.5, 0.5, 1.1, [0.35, 0.36, 0.38]);
  for (const [x, z] of [[-9.5, -2], [6, 26], [26, -14], [-22, 26]]) { Bc(x, z, 1.2, 0.7, 0.8, [0.22, 0.30, 0.20]); W.buys.push({ type: 'ammo', pos: [x, 0, z] }); }
  for (const b of W.buys) {
    if (b.type === 'perk') { const c = ZPERKS[b.perk].col; b.body = Bc(b.pos[0], b.pos[2], b.rot ? 0.9 : 1.2, b.rot ? 1.2 : 0.9, 2.2, c.map(v => v * 0.55)); }
    if (b.type === 'pap') b.body = Bc(b.pos[0], b.pos[2], 2.2, 1.4, 1.6, [0.25, 0.22, 0.30]);
  }
  // ---- quest objects ----
  W.zq = {
    arena: W.zq_arena,
    stones: [{ pos: [-10.5, 0, -24], zone: 'B' }, { pos: [-33, 0, -6], zone: 'E' }, { pos: [-36, 0, 26], zone: 'G' }],
    valves: [{ pos: [36, 0, -3], zone: 'C' }, { pos: [-8, 0, 23], zone: 'D' }, { pos: [30, 0, -23], zone: 'F' }, { pos: [-18, 0, 16], zone: 'G' }],
    power: [-20, 1.4, 32.8], gen: [39.5, 1.2, -14], terminal: [-36, 1.2, 14], bench: [7, 1.0, 5], pedestal: [-6, 1.0, -5],
    lamps: [{ pos: [5, 3.6, -33.6], zone: 'B' }, { pos: [39.6, 3.6, 6], zone: 'C' }, { pos: [-5, 3.6, 33.6], zone: 'D' }, { pos: [-39.6, 3.6, -6], zone: 'E' }],
    fuseSpots: [[-12, 0.5, -12.6], [38, 0.5, -9.5], [12, 0.5, 13], [-38, 0.5, -9.5], [16.5, 0.5, -33], [-16.5, 0.5, 13]],
    parts: {
      shield: [[[10, 0.5, -13.5], [26, 0.5, 9.5]], [[-24, 0.5, -9], [-12, 0.5, 27]], [[24, 0.5, -32.5], [-38, 0.5, 31]]],
      trap: [[[-8, 0.5, -32.5], [38, 0.5, -2]], [[12, 0.5, 30], [-38, 0.5, -2]], [[38, 0.5, -32.5], [-19, 0.5, 27]]],
    },
  };
}
function openDoor(d) {
  d.open = true;
  W.boxes = W.boxes.filter(b => !d.boxes.includes(b));
  for (const z of d.zones) W.zones[z] = true;
  buildNav(); buildMinimap(); buildWorldMesh();
}
