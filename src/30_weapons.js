// ============================================================
//  WEAPONS / ATTACHMENTS / PERKS / WILDCARDS / CAMOS / CLASSES (Pick 10)
// ============================================================
const ZONES = ['head', 'neck', 'upper', 'lower', 'arm', 'uleg', 'lleg'];
const ZONE_JP = { head: '頭', neck: '首', upper: '胴上部', lower: '胴下部', arm: '腕', uleg: '太もも', lleg: 'すね' };
const M_FLAT = { head: 1.0, neck: 1.0, upper: 1.0, lower: 1.0, arm: 1.0, uleg: 1.0, lleg: 1.0 };
const mm = o => Object.assign({}, M_FLAT, o);
const CLS_JP = { sniper: 'スナイパー', ar: 'アサルト', smg: 'サブマシンガン', sg: 'ショットガン', lmg: 'LMG', pistol: 'ハンドガン' };
const WPN = {
  // ---------- SNIPERS (BO2準拠の数値) ----------
  vx50: { name: 'DSR 50', cls: 'sniper', kind: 'sniper', desc: 'ボルトアクション。脚以外は一撃。ADS 0.40秒、連射は遅い。',
    dmg: 98, mult: mm({ head: 1.5, neck: 1.1, upper: 1.1, lower: 1.1, arm: 1.1 }), bolt: true, rof: 1.5, mag: 5, res: 30, reload: 3.4, reloadEmpty: 4.5,
    ads: 0.40, sprintOut: 0.30, mob: 0.95, hip: 9.0, zoom: 12.5, sway: 1.0, stanceSway: true, recoil: 4.2, center: 9, swap: 0.75, model: 'bullpup', pen: 1.0,
    stats: { dmg: 98, rng: 95, acc: 80, rof: 5, mob: 40 } },
  bls7: { name: 'M98B', cls: 'sniper', kind: 'sniper', desc: 'ボルトアクション。ADS最速0.35秒・揺れ小。頭と胴上部で一撃。姿勢で揺れは減らない。',
    dmg: 95, mult: mm({ head: 1.5, neck: 1.1, upper: 1.1 }), bolt: true, rof: 1.15, mag: 7, res: 42, reload: 2.9, reloadEmpty: 3.6,
    ads: 0.35, sprintOut: 0.25, mob: 0.96, hip: 8.5, zoom: 12.5, sway: 0.55, stanceSway: false, recoil: 3.6, center: 10, swap: 0.7, model: 'bolt', pen: 0.9,
    stats: { dmg: 88, rng: 85, acc: 82, rof: 10, mob: 50 } },
  as50x: { name: 'AS50', cls: 'sniper', kind: 'sniper', desc: 'セミオート大口径。胴上部から上で一撃、それ以外は2発。',
    dmg: 85, mult: mm({ head: 1.5, neck: 1.2, upper: 1.2 }), rof: 0.32, mag: 5, res: 40, reload: 3.0, reloadEmpty: 3.9,
    ads: 0.40, sprintOut: 0.25, mob: 0.95, hip: 9.0, zoom: 12.5, sway: 1.0, stanceSway: true, recoil: 5.5, center: 8, swap: 0.75, model: 'semi', pen: 1.1,
    stats: { dmg: 80, rng: 90, acc: 70, rof: 30, mob: 40 } },
  dr90: { name: 'SVD', cls: 'sniper', kind: 'sniper', desc: 'セミオートDMR。頭・胴上部で一撃、10連マガジン。揺れ大きめ。',
    dmg: 75, mult: mm({ head: 1.5, neck: 1.4, upper: 1.4 }), rof: 0.30, mag: 10, res: 60, reload: 3.1, reloadEmpty: 3.8,
    ads: 0.40, sprintOut: 0.25, mob: 0.95, hip: 9.0, zoom: 12.5, sway: 1.15, stanceSway: true, recoil: 4.0, center: 9, swap: 0.75, model: 'dmr', pen: 0.9,
    stats: { dmg: 75, rng: 90, acc: 65, rof: 35, mob: 40 } },
  svu: { name: 'SVU-AS', cls: 'sniper', kind: 'sniper', desc: '軽量セミオート。基本2発キルだが連射が速く、ADS 0.35秒・低倍率で中距離向き。',
    dmg: 70, dmgMin: 50, r0: 45, r1: 70, mult: mm({ head: 1.5 }), rof: 0.20, mag: 10, res: 60, reload: 2.6, reloadEmpty: 3.2,
    ads: 0.35, sprintOut: 0.25, mob: 0.96, hip: 7.0, zoom: 18, sway: 0.5, stanceSway: true, recoil: 2.6, center: 12, swap: 0.65, model: 'svu', pen: 0.6,
    stats: { dmg: 62, rng: 70, acc: 75, rof: 45, mob: 50 } },
  // ---------- ASSAULT ----------
  ar94: { name: 'AN-94', cls: 'ar', kind: 'ar', desc: 'フルオートAR。中距離向けの万能型。',
    dmg: 33, dmgMin: 25, r0: 25, r1: 45, mult: mm({ head: 1.4 }), auto: true, rof: 0.08, mag: 30, res: 150, reload: 2.2, reloadEmpty: 2.8,
    ads: 0.25, sprintOut: 0.20, mob: 1.0, hip: 3.6, adsSpread: 0.15, zoom: 52, sway: 0.15, stanceSway: true, recoil: 0.55, center: 4, swap: 0.55, model: 'rifle', pen: 0.35,
    stats: { dmg: 55, rng: 60, acc: 65, rof: 70, mob: 70 } },
  m8: { name: 'M8A1', cls: 'ar', kind: 'ar', desc: '4点バースト。反動が非常に小さく、遠距離でも4発がまとまる。',
    dmg: 33, dmgMin: 25, r0: 30, r1: 50, mult: mm({ head: 1.4 }), burst: 4, burstDelay: 0.24, rof: 0.06, mag: 32, res: 160, reload: 2.3, reloadEmpty: 2.9,
    ads: 0.25, sprintOut: 0.20, mob: 1.0, hip: 3.4, adsSpread: 0.1, zoom: 52, sway: 0.12, stanceSway: true, recoil: 0.3, center: 6, swap: 0.55, model: 'burst', pen: 0.35,
    stats: { dmg: 55, rng: 70, acc: 85, rof: 60, mob: 70 } },
  sw56: { name: 'M27', cls: 'ar', kind: 'ar', desc: '高レートAR。近〜中距離で強いが反動が大きい。',
    dmg: 30, dmgMin: 20, r0: 20, r1: 40, mult: mm({ head: 1.4 }), auto: true, rof: 0.068, mag: 30, res: 150, reload: 2.1, reloadEmpty: 2.6,
    ads: 0.23, sprintOut: 0.20, mob: 1.0, hip: 3.6, adsSpread: 0.2, zoom: 54, sway: 0.15, stanceSway: true, recoil: 0.75, center: 4, swap: 0.5, model: 'rifle2', pen: 0.3,
    stats: { dmg: 50, rng: 50, acc: 55, rof: 82, mob: 72 } },
  // ---------- SMG ----------
  sm7: { name: 'MP7', cls: 'smg', kind: 'smg', desc: '高レートSMG。近距離最強、遠距離は減衰。',
    dmg: 33, dmgMin: 20, r0: 12, r1: 25, mult: mm({ head: 1.3 }), auto: true, rof: 0.066, mag: 40, res: 160, reload: 2.0, reloadEmpty: 2.5,
    ads: 0.20, sprintOut: 0.15, mob: 1.0, hip: 2.6, adsSpread: 0.35, zoom: 56, sway: 0.12, stanceSway: true, recoil: 0.5, center: 5, swap: 0.5, model: 'smg', pen: 0.2,
    stats: { dmg: 45, rng: 30, acc: 60, rof: 85, mob: 90 } },
  msc: { name: 'MSMC', cls: 'smg', kind: 'smg', desc: '超至近距離型。ダメージ高・連射最速、腰撃ちが非常に正確。',
    dmg: 40, dmgMin: 20, r0: 8, r1: 18, mult: mm({ head: 1.2 }), auto: true, rof: 0.062, mag: 30, res: 150, reload: 2.1, reloadEmpty: 2.6,
    ads: 0.20, sprintOut: 0.15, mob: 1.0, hip: 1.8, adsSpread: 0.45, zoom: 58, sway: 0.15, stanceSway: true, recoil: 0.65, center: 5, swap: 0.45, model: 'smgc', pen: 0.15,
    stats: { dmg: 55, rng: 18, acc: 50, rof: 92, mob: 92 } },
  pd50: { name: 'P90', cls: 'smg', kind: 'smg', desc: '50連マガジンのPDW。安定した中近距離性能。',
    dmg: 30, dmgMin: 20, r0: 15, r1: 30, mult: mm({ head: 1.3 }), auto: true, rof: 0.07, mag: 50, res: 200, reload: 2.5, reloadEmpty: 3.0,
    ads: 0.22, sprintOut: 0.15, mob: 0.98, hip: 2.8, adsSpread: 0.25, zoom: 56, sway: 0.12, stanceSway: true, recoil: 0.4, center: 6, swap: 0.5, model: 'pdw', pen: 0.2,
    stats: { dmg: 42, rng: 40, acc: 70, rof: 80, mob: 85 } },
  // ---------- SHOTGUN ----------
  r870: { name: 'R870', cls: 'sg', kind: 'sg', desc: 'ポンプアクション。至近距離なら一撃。リロードは1発ずつ（撃てば中断）。',
    dmg: 26, dmgMin: 6, r0: 6, r1: 16, mult: M_FLAT, pellets: 8, pelSpread: 4.5, pump: true, rof: 0.85, mag: 6, res: 36, shell: 0.55,
    ads: 0.25, sprintOut: 0.20, mob: 1.0, hip: 4.5, adsSpread: 3.2, zoom: 58, sway: 0.1, stanceSway: true, recoil: 4.5, center: 10, swap: 0.6, model: 'shotgun', pen: 0,
    stats: { dmg: 95, rng: 15, acc: 40, rof: 15, mob: 85 } },
  sg12: { name: 'M1216', cls: 'sg', kind: 'sg', desc: 'セミオートショットガン。連射で押し切る。',
    dmg: 20, dmgMin: 5, r0: 5, r1: 13, mult: M_FLAT, pellets: 7, pelSpread: 5, rof: 0.26, mag: 8, res: 40, shell: 0.5,
    ads: 0.25, sprintOut: 0.20, mob: 1.0, hip: 5, adsSpread: 3.8, zoom: 58, sway: 0.1, stanceSway: true, recoil: 3.0, center: 12, swap: 0.6, model: 'autosg', pen: 0,
    stats: { dmg: 70, rng: 12, acc: 35, rof: 45, mob: 85 } },
  // ---------- LMG ----------
  ls60: { name: 'LSAT', cls: 'lmg', kind: 'ar', desc: '100発の軽機関銃。高ダメージで壁抜きも得意だが重い。',
    dmg: 40, dmgMin: 30, r0: 30, r1: 60, mult: mm({ head: 1.4 }), auto: true, rof: 0.075, mag: 100, res: 300, reload: 7.0, reloadEmpty: 7.5,
    ads: 0.40, sprintOut: 0.30, mob: 0.85, hip: 4.2, adsSpread: 0.2, zoom: 50, sway: 0.2, stanceSway: true, recoil: 0.6, center: 4, swap: 0.8, model: 'lmg', pen: 0.6,
    stats: { dmg: 65, rng: 70, acc: 60, rof: 75, mob: 35 } },
  // ---------- PISTOLS ----------
  p9: { name: 'Five-seven', cls: 'pistol', kind: 'pistol', desc: 'セミオート拳銃。持ち替えが速い。',
    dmg: 35, dmgMin: 22, r0: 10, r1: 25, mult: mm({ head: 1.3 }), rof: 0.13, mag: 12, res: 48, reload: 1.6, reloadEmpty: 1.9,
    ads: 0.15, sprintOut: 0.12, mob: 1.0, hip: 2.4, adsSpread: 0.2, zoom: 58, sway: 0.1, stanceSway: true, recoil: 1.4, center: 9, swap: 0.35, model: 'pistol', pen: 0.1,
    stats: { dmg: 40, rng: 25, acc: 55, rof: 40, mob: 100 } },
  b23: { name: '93R', cls: 'pistol', kind: 'pistol', desc: '3点バースト拳銃。近距離なら1バーストでキル。',
    dmg: 35, dmgMin: 20, r0: 10, r1: 22, mult: mm({ head: 1.3 }), burst: 3, burstDelay: 0.22, rof: 0.055, mag: 15, res: 60, reload: 1.8, reloadEmpty: 2.1,
    ads: 0.15, sprintOut: 0.12, mob: 1.0, hip: 2.6, adsSpread: 0.25, zoom: 58, sway: 0.1, stanceSway: true, recoil: 1.0, center: 10, swap: 0.35, model: 'bpistol', pen: 0.1,
    stats: { dmg: 50, rng: 25, acc: 50, rof: 60, mob: 100 } },
  ex9: { name: 'Judge', cls: 'pistol', kind: 'sg', desc: '散弾リボルバー。至近距離の切り札。',
    dmg: 24, dmgMin: 5, r0: 4, r1: 11, mult: M_FLAT, pellets: 5, pelSpread: 4, rof: 0.42, mag: 5, res: 20, shell: 0.45,
    ads: 0.15, sprintOut: 0.12, mob: 1.0, hip: 4, adsSpread: 3.2, zoom: 58, sway: 0.1, stanceSway: true, recoil: 3.5, center: 10, swap: 0.4, model: 'revolver', pen: 0,
    stats: { dmg: 80, rng: 10, acc: 30, rof: 30, mob: 100 } },
};
// special weapons (not in Create-a-Class)
WPN.gl = { name: 'グレネードランチャー', cls: 'launcher', kind: 'sg', desc: '', dmg: 0, mult: M_FLAT, proj: 'gl', rof: 0.45, mag: 6, res: 0, reload: 99, reloadEmpty: 99,
  ads: 0.3, sprintOut: 0.25, mob: 0.95, hip: 1.5, adsSpread: 0.5, zoom: 50, sway: 0.1, stanceSway: true, recoil: 3.5, center: 8, swap: 0.5, model: 'launcher', pen: 0, stats: {} };
WPN.plasma = { name: 'プラズマピストル', cls: 'pistol', kind: 'plasma', desc: '', dmg: 0, mult: M_FLAT, proj: 'plasma', rof: 0.22, mag: 20, res: 160, reload: 2.4, reloadEmpty: 2.8,
  ads: 0.15, sprintOut: 0.12, mob: 1.0, hip: 1.2, adsSpread: 0.3, zoom: 58, sway: 0.1, stanceSway: true, recoil: 1.2, center: 10, swap: 0.35, model: 'plasma', pen: 0, stats: {} };
// ---------- zombie mystery-box exclusives (never in Create-a-Class / wall buys) ----------
WPN.rpd = { name: 'RPD', cls: 'lmg', kind: 'ar', desc: 'ボックス限定。100発ドラムの軽機関銃。', dmg: 42, dmgMin: 32, r0: 30, r1: 60, mult: mm({ head: 1.4 }), auto: true, rof: 0.085, mag: 100, res: 400, reload: 6.5, reloadEmpty: 7.0,
  ads: 0.40, sprintOut: 0.30, mob: 0.85, hip: 4.0, adsSpread: 0.25, zoom: 50, sway: 0.2, stanceSway: true, recoil: 0.7, center: 4, swap: 0.8, model: 'lmg', pen: 0.6, stats: {} };
WPN.ksg = { name: 'KSG', cls: 'sg', kind: 'sg', desc: 'ボックス限定。14発装填のポンプショットガン。', dmg: 26, dmgMin: 6, r0: 7, r1: 18, mult: M_FLAT, pellets: 8, pelSpread: 3.6, pump: true, rof: 0.8, mag: 14, res: 56, shell: 0.5,
  ads: 0.25, sprintOut: 0.20, mob: 0.98, hip: 4.2, adsSpread: 2.6, zoom: 58, sway: 0.1, stanceSway: true, recoil: 4.5, center: 10, swap: 0.6, model: 'shotgun', pen: 0, stats: {} };
WPN.python = { name: 'Python', cls: 'pistol', kind: 'pistol', desc: 'ボックス限定。.357マグナムのリボルバー。', dmg: 70, dmgMin: 45, r0: 12, r1: 30, mult: mm({ head: 1.5 }), rof: 0.3, mag: 6, res: 42, reload: 2.6, reloadEmpty: 2.6,
  ads: 0.18, sprintOut: 0.12, mob: 1.0, hip: 2.8, adsSpread: 0.15, zoom: 56, sway: 0.1, stanceSway: true, recoil: 4.0, center: 9, swap: 0.4, model: 'revolver', pen: 0.4, stats: {} };
WPN.m32 = { name: 'M32', cls: 'launcher', kind: 'sg', desc: 'ボックス限定。6連発グレネードランチャー。', dmg: 0, mult: M_FLAT, proj: 'gl', rof: 0.5, mag: 6, res: 24, reload: 4.2, reloadEmpty: 4.2,
  ads: 0.3, sprintOut: 0.25, mob: 0.92, hip: 1.5, adsSpread: 0.5, zoom: 50, sway: 0.1, stanceSway: true, recoil: 3.5, center: 8, swap: 0.6, model: 'launcher', pen: 0, stats: {} };
WPN.arc = { name: 'アークスロワー', cls: 'wonder', kind: 'plasma', desc: 'ボックス限定の試作兵器。放った電撃がゾンビからゾンビへ連鎖して焼き尽くす。', dmg: 0, mult: M_FLAT, special: 'arc', rof: 0.9, mag: 3, res: 18, reload: 3.0, reloadEmpty: 3.0,
  ads: 0.25, sprintOut: 0.2, mob: 0.95, hip: 1.5, adsSpread: 0.4, zoom: 56, sway: 0.1, stanceSway: true, recoil: 3.0, center: 8, swap: 0.6, model: 'arc', pen: 0, stats: {} };
WPN.grav = { name: 'グラビティキャノン', cls: 'wonder', kind: 'sg', desc: 'ボックス限定の試作兵器。前方の空間ごと押し潰す重力波でゾンビの群れを吹き飛ばす。', dmg: 0, mult: M_FLAT, special: 'grav', rof: 1.0, mag: 2, res: 12, reload: 3.4, reloadEmpty: 3.4,
  ads: 0.3, sprintOut: 0.25, mob: 0.9, hip: 1.5, adsSpread: 0.5, zoom: 56, sway: 0.1, stanceSway: true, recoil: 6.0, center: 6, swap: 0.7, model: 'grav', pen: 0, stats: {} };
const ZBOX_ONLY = ['rpd', 'ksg', 'python', 'm32'], ZWONDER = ['arc', 'grav', 'plasma'];
const PRIMARIES = ['vx50', 'bls7', 'as50x', 'dr90', 'svu', 'ar94', 'm8', 'sw56', 'sm7', 'msc', 'pd50', 'r870', 'sg12', 'ls60'];
const SECONDARIES = ['p9', 'b23', 'ex9'];
const ATT = {
  cpu: { name: '弾道計算機', desc: 'スコープの揺れを大幅に軽減', for: ['sniper'] },
  vz: { name: '可変ズーム', desc: 'スコープ中にホイールで3段階の倍率', for: ['sniper'] },
  acog: { name: 'ACOGサイト', desc: '4倍スコープ。黒いスコープ画面なし・揺れ軽減', for: ['sniper', 'ar', 'smg', 'lmg'] },
  dot: { name: 'リフレックス', desc: 'ドットサイト', for: ['ar', 'smg', 'lmg', 'sg', 'pistol'] },
  qd: { name: 'クイックドロー', desc: 'ADS時間が半分（LMGは25%短縮、スナイパー不可）', for: ['ar', 'smg', 'lmg', 'sg'] },
  grip: { name: 'フォアグリップ', desc: '反動を30%軽減', for: ['ar', 'smg', 'lmg'] },
  laser: { name: 'レーザーサイト', desc: '腰撃ちの拡散を40%軽減', for: ['ar', 'smg', 'sg', 'pistol', 'lmg'] },
  stock: { name: 'ストック', desc: 'ADS中の移動速度アップ', for: ['ar', 'smg', 'sg'] },
  lb: { name: 'ロングバレル', desc: 'ダメージ減衰距離が1.4倍', for: ['ar', 'smg', 'sg', 'pistol'] },
  sup: { name: 'サプレッサー', desc: '発砲がBotに聞こえにくい。威力・射程が少し低下', for: ['sniper', 'ar', 'smg', 'lmg', 'sg', 'pistol'] },
  fmj: { name: 'FMJ', desc: '壁抜き性能が2倍', for: ['sniper', 'ar', 'smg', 'lmg', 'pistol'] },
  fm: { name: 'ファストマグ', desc: 'リロード速度アップ', for: ['sniper', 'ar', 'smg', 'lmg'] },
  ext: { name: '拡張マガジン', desc: '装弾数アップ', for: ['sniper', 'ar', 'smg', 'lmg', 'sg', 'pistol'] },
};
const PERKS = [
  [{ id: 'lw', name: '軽量化', desc: '移動速度+7%・落下ダメージなし' }, { id: 'hl', name: 'ハードライン', desc: 'スコアストリークの必要ポイント-20%' }, { id: 'cb', name: '冷血', desc: '敵Botに発見されにくく、敵ドローンに狙われない' }, { id: 'flak', name: 'フラックジャケット', desc: '爆発ダメージ65%軽減・敵の投てき物の位置がわかる' }],
  [{ id: 'tough', name: 'タフネス', desc: '被弾時の照準ブレ（フリンチ）を軽減' }, { id: 'scav', name: 'スカベンジャー', desc: 'キルで弾薬と投げ斧を補充' }, { id: 'fh', name: 'ファストハンズ', desc: '持ち替え・投てきが速い' }],
  [{ id: 'dex', name: '器用', desc: '乗り越えが速く、空中での拡散が減る' }, { id: 'ec', name: '長距離走', desc: 'ダッシュ持続時間が2倍' }, { id: 'aw', name: '聴覚強化', desc: '敵の足音が遠くから聞こえる' }, { id: 'ds', name: 'デッドサイレンス', desc: '自分の足音が消え、Botに音で気付かれない' }],
];
const PERK_BY_ID = Object.fromEntries(PERKS.flat().map(p => [p.id, p]));
const WILDS = [
  { id: 'gf', name: 'ガンファイター', desc: 'メイン武器のアタッチメント3つ目' },
  { id: 'sgf', name: 'サブガンファイター', desc: 'サブ武器のアタッチメント2つ目' },
  { id: 'ok', name: 'オーバーキル', desc: 'サブ武器の枠にメイン武器を持てる' },
  { id: 'g1', name: 'パーク1欲張り', desc: 'パーク1をもう1つ' },
  { id: 'g2', name: 'パーク2欲張り', desc: 'パーク2をもう1つ' },
  { id: 'g3', name: 'パーク3欲張り', desc: 'パーク3をもう1つ' },
  { id: 'dl', name: 'デンジャークローズ', desc: 'リーサルを2個持てる' },
  { id: 'tm', name: 'タクティシャン', desc: 'タクティカルを2個持てる' },
];
const LETHALS = {
  frag: { name: 'フラグ', desc: '投げて3秒で爆発。G長押しで投げずに時間を調整（クッキング）', n: 1 },
  semtex: { name: 'セムテックス', desc: '当たった場所や敵に張り付き、2.5秒で爆発', n: 1 },
  axe: { name: '投げ斧', desc: '当たれば一撃。山なりに飛ぶ', n: 1 },
  c4: { name: 'C4', desc: '張り付けて、もう一度Gで起爆', n: 1 },
  claymore: { name: 'クレイモア', desc: '足元に設置。前方に敵が入ると爆発', n: 1 },
  none: { name: 'なし', desc: '', n: 0 },
};
const TACTICALS = {
  flash: { name: 'フラッシュ', desc: '閃光で視界を奪う（Botは数秒何もできない）', n: 1 },
  stun: { name: 'スタン', desc: '範囲内の敵の動きと照準を大きく鈍らせる', n: 1 },
  smoke: { name: 'スモーク', desc: '煙幕で視線を遮る。Botは煙越しに見えない', n: 1 },
  sensor: { name: 'センサー', desc: '張り付けた周囲15mの敵をミニマップに表示', n: 1 },
  none: { name: 'なし', desc: '', n: 0 },
};
const STREAKS = [
  { id: 'uav', name: 'UAV', cost: 425, desc: '30秒間、敵をミニマップに表示' },
  { id: 'ammo', name: '補給物資', cost: 450, desc: '弾薬と投てき物を全回復。たまに別のストリークが入っている' },
  { id: 'cuav', name: 'カウンターUAV', cost: 500, desc: '30秒間、敵のUAVを妨害' },
  { id: 'hk', name: 'ハンタードローン', cost: 525, desc: '一番近い敵を自動で追尾して爆破' },
  { id: 'wm', name: 'グレネードランチャー', cost: 650, desc: '6連発の爆発弾ランチャーを一時的に装備' },
  { id: 'strike', name: '空爆', cost: 750, desc: '照準した地点の周囲に5発の爆撃' },
  { id: 'sentry', name: 'セントリーガン', cost: 800, desc: '目の前に設置。60秒間、敵を自動攻撃' },
  { id: 'vsat', name: 'アドバンスドUAV', cost: 1200, desc: '45秒間、敵の位置と向きを常時表示（妨害されない）' },
  { id: 'swarm', name: 'ドローンスウォーム', cost: 1500, desc: '40秒間、ドローンが次々と敵を襲う' },
];
const STREAK_BY_ID = Object.fromEntries(STREAKS.map(s => [s.id, s]));
let STREAK_SEL = loadJSON('ls_streaks', { list: ['uav', 'hk', 'sentry'] });
// zombies: perk drinks
const ZPERKS = {
  jug: { name: 'タフネスソーダ', desc: '体力が大幅アップ', cost: 2500, col: [0.85, 0.15, 0.15] },
  speed: { name: 'クイックロード', desc: 'リロードが倍速', cost: 3000, col: [0.20, 0.80, 0.35] },
  dtap: { name: 'ラピッドファイア', desc: '連射速度アップ・威力2倍', cost: 2000, col: [0.95, 0.70, 0.15] },
  rev: { name: 'セカンドライフ', desc: 'ダウンしても自力で復活（3回まで）', cost: 1500, col: [0.25, 0.55, 0.95] },
};
// gun game ladder (last = knife)
const GUNGAME = ['p9', 'b23', 'ex9', 'r870', 'sg12', 'msc', 'sm7', 'pd50', 'sw56', 'ar94', 'm8', 'ls60', 'svu', 'dr90', 'bls7', 'knife'];
// camos: pat 1=blobs 2=digital 3=tiger 4=gold 5=diamond 6=flame 7=neon 8=carbon
const CAMOS = [
  { id: 'none', name: 'なし' },
  { id: 'wood', name: 'ウッドランド', pat: 1, a: [0.30, 0.34, 0.22], b: [0.38, 0.30, 0.20], c: [0.12, 0.12, 0.10] },
  { id: 'desert', name: 'デザート', pat: 1, a: [0.70, 0.60, 0.42], b: [0.56, 0.45, 0.30], c: [0.80, 0.74, 0.58] },
  { id: 'snowc', name: 'スノー', pat: 1, a: [0.88, 0.90, 0.92], b: [0.62, 0.66, 0.70], c: [0.35, 0.38, 0.42] },
  { id: 'digi', name: 'デジタル', pat: 2, a: [0.36, 0.40, 0.30], b: [0.22, 0.25, 0.18], c: [0.55, 0.52, 0.40] },
  { id: 'urban', name: 'アーバン', pat: 2, a: [0.45, 0.46, 0.48], b: [0.25, 0.26, 0.28], c: [0.70, 0.71, 0.72] },
  { id: 'tiger', name: 'タイガー', pat: 3, a: [0.72, 0.42, 0.10], b: [0.80, 0.52, 0.18], c: [0.08, 0.06, 0.05] },
  { id: 'btiger', name: 'ブルータイガー', pat: 3, a: [0.18, 0.35, 0.75], b: [0.30, 0.50, 0.88], c: [0.04, 0.05, 0.10] },
  { id: 'carbon', name: 'カーボン', pat: 8, a: [0.08, 0.08, 0.09], b: [0.22, 0.22, 0.24], c: [0, 0, 0] },
  { id: 'crimson', name: 'クリムゾン', pat: 2, a: [0.55, 0.06, 0.06], b: [0.30, 0.03, 0.03], c: [0.75, 0.15, 0.12] },
  { id: 'dragon', name: 'ドラゴン', pat: 6, a: [0.25, 0.04, 0.02], b: [0.95, 0.35, 0.05], c: [1.0, 0.85, 0.30] },
  { id: 'cyber', name: 'サイバー', pat: 7, a: [0.05, 0.06, 0.09], b: [0.10, 0.85, 1.0], c: [0, 0, 0] },
  { id: 'gold', name: 'ゴールド', pat: 4, a: [0.95, 0.72, 0.25], b: [0, 0, 0], c: [0, 0, 0], unlock: 'gold' },
  { id: 'diamond', name: 'ダイヤモンド', pat: 5, a: [0.75, 0.85, 0.95], b: [0.35, 0.55, 0.85], c: [0, 0, 0], unlock: 'diamond' },
];
const CAMO_BY_ID = Object.fromEntries(CAMOS.map(c => [c.id, c]));
const GOLD_KILLS = 40;
// ---------- persistent stats (camo unlocks) ----------
let STATS = loadJSON('ls_stats', { wk: {} });
const wKills = id => STATS.wk[id] || 0;
const hasGold = id => wKills(id) >= GOLD_KILLS;
function camoUnlocked(camoId, wid) {
  const c = CAMO_BY_ID[camoId]; if (!c || !c.unlock) return true;
  if (c.unlock === 'gold') return hasGold(wid);
  const cls = WPN[wid].cls; return hasGold(wid) && Object.keys(WPN).filter(k => WPN[k].cls === cls && k !== wid && hasGold(k)).length >= 1;
}
function camoReq(camoId, wid) {
  const c = CAMO_BY_ID[camoId]; if (!c || !c.unlock) return '';
  if (c.unlock === 'gold') return `${WPN[wid].name}で${GOLD_KILLS}キル（${Math.min(wKills(wid), GOLD_KILLS)}/${GOLD_KILLS}）`;
  return `${WPN[wid].name}と同じ種類の別の武器1丁でゴールド取得`;
}
// ---------- classes ----------
const DEFAULT_CLASS = { name: 'カスタム1', primary: 'vx50', att: ['cpu', 'fm'], pcamo: 'none', secondary: 'p9', satt: [], scamo: 'none', lethal: 'axe', tactical: 'none', perks: [['lw'], ['tough'], ['dex']], wild: [] };
const PRESETS = [
  DEFAULT_CLASS,
  { name: 'クイスコ', primary: 'bls7', att: ['fm'], pcamo: 'none', secondary: 'ex9', satt: [], scamo: 'none', lethal: 'axe', tactical: 'none', perks: [['lw'], ['fh'], ['dex']], wild: [] },
  { name: 'アサルト', primary: 'm8', att: ['dot', 'grip'], pcamo: 'none', secondary: 'p9', satt: [], scamo: 'none', lethal: 'frag', tactical: 'stun', perks: [['lw'], ['tough'], ['ec']], wild: [] },
  { name: 'ラッシュ', primary: 'msc', att: ['laser', 'stock'], pcamo: 'none', secondary: 'b23', satt: [], scamo: 'none', lethal: 'semtex', tactical: 'flash', perks: [['lw'], ['fh'], ['ds']], wild: [] },
  { name: 'ヘビー', primary: 'ls60', att: ['fmj', 'qd'], pcamo: 'none', secondary: 'p9', satt: [], scamo: 'none', lethal: 'claymore', tactical: 'smoke', perks: [['flak'], ['scav'], ['aw']], wild: [] },
];
let CLASSES = loadJSON('ls_classes3', { list: PRESETS, cur: 0 });
if (!Array.isArray(CLASSES.list) || CLASSES.list.length !== 5) CLASSES = { list: JSON.parse(JSON.stringify(PRESETS)), cur: 0 };
CLASSES.list = CLASSES.list.map((c, i) => sanitizeClass(c, i));
let CLS = CLASSES.list[CLASSES.cur] || CLASSES.list[0];
function sanitizeClass(c, i) {
  const d = JSON.parse(JSON.stringify(PRESETS[i] || DEFAULT_CLASS));
  c = Object.assign(d, c || {});
  if (!WPN[c.primary]) c.primary = 'vx50';
  if (c.secondary && !WPN[c.secondary]) c.secondary = 'p9';
  if (!Array.isArray(c.perks) || c.perks.length !== 3 || !c.perks.every(Array.isArray)) c.perks = [[], [], []];
  c.perks = c.perks.map(a => a.filter(id => PERK_BY_ID[id]));
  c.wild = (c.wild || []).filter(id => WILDS.some(w => w.id === id));
  c.att = (c.att || []).filter(a => ATT[a] && ATT[a].for.includes(WPN[c.primary].cls));
  c.satt = (c.satt || []).filter(a => c.secondary && ATT[a] && ATT[a].for.includes(WPN[c.secondary].cls)).slice(0, (c.wild || []).includes('sgf') ? 2 : 1);
  c.att = c.att.slice(0, (c.wild || []).includes('gf') ? 3 : 2);
  if (!CAMO_BY_ID[c.pcamo]) c.pcamo = 'none'; if (!CAMO_BY_ID[c.scamo]) c.scamo = 'none';
  if (!LETHALS[c.lethal]) c.lethal = 'none';
  if (!TACTICALS[c.tactical]) c.tactical = 'none';
  return c;
}
function saveClasses() { saveJSON('ls_classes3', CLASSES); }
function classCost(c) {
  return 1 + c.att.length + (c.secondary ? 1 : 0) + c.satt.length + (c.lethal !== 'none' ? 1 : 0) + (c.tactical !== 'none' ? 1 : 0) + c.perks.reduce((s, a) => s + a.length, 0) + c.wild.length;
}
// the class currently in effect for the player (may differ from CLS while editing)
let ACTIVE = CLS;
function hasPerk(id) { return ACTIVE.perks.some(a => a.includes(id)); }
function makeInst(id, att, camo) {
  const d = WPN[id], a = new Set(att || []);
  const mag = d.mag + (a.has('ext') ? (d.cls === 'sg' ? 2 : d.cls === 'pistol' ? Math.ceil(d.mag * 0.4) : Math.round(d.mag * (d.cls === 'sniper' ? 0.4 : d.cls === 'lmg' ? 0.5 : 0.33))) : 0);
  return { id, d, att: a, camo: CAMO_BY_ID[camo] || CAMOS[0], mag, magMax: mag, res: d.res, shotT: 0, reloadT: 0, reloadTot: 0, reloadFillAt: 0, boltT: 0, burstLeft: 0, shellMode: false };
}
function wDamage(d, zone, dist, att) {
  let base = d.dmg;
  if (d.dmgMin != null) {
    const k = (att && att.has('lb') ? 1.4 : 1) * (att && att.has('sup') ? 0.75 : 1), r0 = d.r0 * k, r1 = d.r1 * k;
    base = dist <= r0 ? d.dmg : dist >= r1 ? d.dmgMin : lerp(d.dmg, d.dmgMin, (dist - r0) / (r1 - r0));
  } else if (att && att.has('sup')) base *= 0.92;
  return base * (d.mult[zone] || 1);
}
function optic(w) {
  if (w.att.has('acog')) return 'acog';
  if (w.d.cls === 'sniper') return 'scope';
  if (w.att.has('dot')) return 'dot';
  return 'iron';
}
function loadJSON(k, def) { try { const v = localStorage.getItem(k); return v ? Object.assign(JSON.parse(JSON.stringify(def)), JSON.parse(v)) : JSON.parse(JSON.stringify(def)); } catch (e) { return JSON.parse(JSON.stringify(def)); } }
function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
const SET_DEF = { sens: 5, adsSens: 1.0, padSens: 6, fov: 75, aa: 'pad', vol: 0.7, invertY: false, resScale: 1, autoRes: true, hitInfo: true, fps: false, lowLat: true, desync: false, msaa: true, slideMode: 'hold' };
let SET = loadJSON('ls_set', SET_DEF);
