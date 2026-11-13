// ============================================================
//  GAME MODES: FFA / TDM / Domination / Kill Confirmed / Gun Game (+ range, zombies)
// ============================================================
WPN.knife = { name: 'ナイフ', cls: 'knife', kind: 'pistol', desc: '', melee: true, dmg: 135, mult: M_FLAT, rof: 0.6, mag: 0, res: 0, reload: 1, reloadEmpty: 1,
  ads: 0.2, sprintOut: 0.05, mob: 1.07, hip: 0, adsSpread: 0, zoom: 65, sway: 0, stanceSway: false, recoil: 0, center: 10, swap: 0.25, model: 'knife', pen: 0, stats: {} };
const MODES = {
  ffa: { name: 'フリーフォーオール', short: 'FFA', desc: '全員が敵の個人戦。指定キル数で勝利。', team: false, limits: [15, 20, 30, 40], def: 30, unit: 'キル' },
  tdm: { name: 'チームデスマッチ', short: 'TDM', desc: '味方Botと組んで4対4前後のチーム戦。キル数で勝利。', team: true, limits: [30, 50, 75, 100], def: 50, unit: 'キル' },
  dom: { name: 'ドミネーション', short: 'DOM', desc: 'A・B・Cの旗を奪い合う。確保している旗の数だけポイントが入る。', team: true, limits: [75, 100, 150, 200], def: 100, unit: 'ポイント' },
  kc: { name: 'キルコンファーム', short: 'KC', desc: '倒した敵が落とすタグを回収して初めて得点。味方のタグを拾うと阻止。', team: true, limits: [25, 40, 65], def: 40, unit: 'タグ' },
  gun: { name: 'ガンゲーム', short: 'GUN', desc: 'キルするたびに武器が変わる。最後のナイフでキルしたら勝利。ナイフで倒されると1段階降格。', team: false, limits: [16], def: 16, unit: '段階' },
  range: { name: '射撃場', short: 'RANGE', desc: '撃ってこない標的でクイックスコープ練習。', team: false, limits: [0], def: 0, unit: '' },
  zombies: { name: 'ゾンビ', short: 'ZOMBIES', desc: '押し寄せるゾンビをラウンド制で生き延びる。ポイントで武器・ドア・パークを買う。', team: false, limits: [0], def: 0, unit: '' },
};
const TEAMC = { A: '#4aa3ff', B: '#ff5a4a' };
const TEAMC3 = { A: [0.29, 0.64, 1.0], B: [1.0, 0.35, 0.29] };
const isTeamMode = () => !!(MODES[G.mode] && MODES[G.mode].team);
function setupTeams() {
  if (!isTeamMode()) { for (const e of G.ents) e.team = null; return; }
  const P = G.player; P.team = 'A';
  G.bots.forEach((b, i) => { b.team = i < Math.floor(G.bots.length / 2) ? 'A' : 'B'; });
  G.teamScore = { A: 0, B: 0 };
}
// ---------- spawn helpers ----------
function teamSideSpawns(team) {
  const ax = (W.maxX - W.minX) >= (W.maxZ - W.minZ) ? 0 : 2;
  const s = W.spawns.slice().sort((a, b) => a[ax] - b[ax]);
  const half = Math.ceil(s.length / 2);
  return team === 'A' ? s.slice(0, half) : s.slice(s.length - half);
}
// ---------- domination ----------
function setupDom() {
  const ax = (W.maxX - W.minX) >= (W.maxZ - W.minZ) ? 0 : 2;
  const cx = (W.minX + W.maxX) / 2, cz = (W.minZ + W.maxZ) / 2, ext = ax === 0 ? (W.maxX - W.minX) : (W.maxZ - W.minZ);
  const pts = [-0.36, 0, 0.36].map(k => { const p = [cx, 0, cz]; p[ax] += k * ext; return p; });
  G.flags = pts.map((p, i) => {
    const c = nearestFree(...navCell(p[0], p[2])) || navCell(p[0], p[2]);
    return { name: 'ABC'[i], pos: [W.minX + c[0] + 0.5, 0, W.minZ + c[1] + 0.5], owner: i === 0 ? 'A' : i === 2 ? 'B' : null, cap: 0, capTeam: null };
  });
  G.domTick = 0;
}
function updateDom(dt) {
  for (const f of G.flags) {
    const near = { A: 0, B: 0 };
    for (const e of G.ents) if (e.alive && e.team && V.dist2(e.pos, f.pos) < 4.5 && Math.abs(e.pos[1] - f.pos[1]) < 3) near[e.team]++;
    const teams = ['A', 'B'].filter(t => near[t] > 0);
    if (teams.length === 1 && teams[0] !== f.owner) {
      const t = teams[0];
      if (f.capTeam !== t) { f.capTeam = t; f.cap = 0; }
      f.cap += dt / (f.owner ? 10 : 6) * Math.min(1 + (near[t] - 1) * 0.5, 2);
      if (f.cap >= 1) {
        f.owner = t; f.cap = 0; f.capTeam = null;
        const mine = t === G.player.team;
        popup(`${f.name} を${mine ? '確保' : '奪われた'}`, mine ? TEAMC.A : TEAMC.B); sfxUAV();
        for (const e of G.ents) if (e.alive && e.team === t && V.dist2(e.pos, f.pos) < 4.5) { e.score += 150; if (e.isPlayer) { popup('旗確保 +150', '#fff'); awardStreakPoints(e, 150); } }
      }
    } else if (teams.length === 0) f.cap = Math.max(0, f.cap - dt * 0.15);
  }
  G.domTick += dt;
  if (G.domTick >= 3) {
    G.domTick = 0;
    for (const f of G.flags) if (f.owner) G.teamScore[f.owner]++;
    checkTeamLimit();
  }
}
// ---------- kill confirmed ----------
function updateKC(dt) {
  for (const tg of G.tags) {
    tg.t += dt;
    for (const e of G.ents) {
      if (!e.alive || !e.team || V.dist2(e.pos, tg.pos) > 1.4 || Math.abs(e.pos[1] - tg.pos[1]) > 1.6) continue;
      tg.dead = true;
      if (e.team !== tg.team) { G.teamScore[e.team]++; e.score += 50; if (e.isPlayer) { popup('キル確定 +50', '#ffcf5a'); awardStreakPoints(e, 50); sfxBuy(); } }
      else { e.score += 50; if (e.isPlayer) { popup('キル阻止 +50', '#9fd7ff'); awardStreakPoints(e, 50); sfxBuy(); } }
      break;
    }
  }
  G.tags = G.tags.filter(t => !t.dead);
  checkTeamLimit();
}
function checkTeamLimit() { if (G.over || !G.teamScore) return; if (G.teamScore.A >= G.scoreLimit || G.teamScore.B >= G.scoreLimit) endMatch(); }
// ---------- gun game ----------
function ggWeaponId(e) { return GUNGAME[Math.min(e.gg || 0, GUNGAME.length - 1)]; }
function ggEquip(e) {
  const id = ggWeaponId(e);
  if (e.isPlayer) { e.wpn = [makeInst(id, [])]; e.cur = 0; e.swapT = e.swapTot = 0.35; e.ads = 0; e.lethals = 0; e.tacticals = 0; }
  else { e.wd = WPN[id]; e.wt = id === 'knife' ? 'knife' : ({ sniper: 'sniper', ar: 'ar', smg: 'smg', sg: 'sg', lmg: 'lmg', pistol: 'smg' })[WPN[id].cls]; e.bw = BOT_W[e.wt]; }
}
// ---------- hooks ----------
function modeOnKill(victim, killer, d, zone) {
  if (G.mode === 'tdm' && killer && killer !== victim && killer.team && killer.team !== victim.team) { G.teamScore[killer.team]++; checkTeamLimit(); }
  if (G.mode === 'kc' && victim.team) G.tags.push({ pos: [victim.pos[0], victim.pos[1] + 0.6, victim.pos[2]], team: victim.team, t: 0 });
  if (G.mode === 'gun') {
    if (zone === 'melee' && victim.gg > 0) { victim.gg--; if (victim.isPlayer) popup('降格…', '#ff6a5a'); else if (killer && killer.isPlayer) popup(`${victim.name} を降格させた`, '#ffcf5a'); if (!victim.isPlayer) ggEquip(victim); }
    if (killer && killer !== victim) {
      killer.gg = (killer.gg || 0) + 1;
      if (killer.gg >= GUNGAME.length) { killer.gg = GUNGAME.length - 1; endMatch(killer); return; }
      if (killer.isPlayer) { const n = WPN[ggWeaponId(killer)]; popup(`昇格: ${n.name}（${killer.gg + 1}/${GUNGAME.length}）`, '#ffcf5a'); sfxUAV(); setTimeout(() => { if (G.player === killer) ggEquip(killer); }, 150); }
      else ggEquip(killer);
    }
  }
}
function updateMode(dt) {
  if (G.mode === 'dom') updateDom(dt);
  if (G.mode === 'kc') updateKC(dt);
}
// bots: objective goal when idle
function botObjective(b) {
  if (G.mode === 'dom' && G.flags) {
    const mine = G.flags.filter(f => f.owner === b.team), notMine = G.flags.filter(f => f.owner !== b.team);
    let f;
    if (notMine.length && (Math.random() < 0.75 || !mine.length)) f = notMine.slice().sort((x, y) => V.dist2(x.pos, b.pos) - V.dist2(y.pos, b.pos))[Math.random() < 0.7 ? 0 : Math.min(1, notMine.length - 1)];
    else f = pick(mine);
    return [f.pos[0] + rand(-2, 2), 0, f.pos[2] + rand(-2, 2)];
  }
  if (G.mode === 'kc' && G.tags.length) {
    let best = null, bd = 30; for (const t of G.tags) { const d = V.dist2(t.pos, b.pos); if (d < bd) { bd = d; best = t; } }
    if (best) return [best.pos[0], 0, best.pos[2]];
  }
  if (G.enemyUavT > 0 && G.cuavT <= 0 && isEnemy(b, G.player) && G.player.alive && Math.random() < 0.6) return G.player.pos.slice();
  return null;
}
function modeWinner() {
  if (isTeamMode()) return G.teamScore.A === G.teamScore.B ? null : G.teamScore.A > G.teamScore.B ? 'A' : 'B';
  return null;
}
