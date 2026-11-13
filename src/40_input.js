// ============================================================
//  INPUT: keyboard + mouse + gamepad  → per-frame action struct
// ============================================================
const IN = { keys: {}, pressed: {}, mdx: 0, mdy: 0, mb: [false, false, false, false, false], mbP: [false, false, false, false, false], wheel: 0, locked: false, padPrev: [], padActive: false, cHoldT: 0, lastPadT: -10, listen: null };
// ---------- rebindable keyboard / mouse bindings ----------
const BIND_DEF = {
  fwd: ['KeyW', ''], back: ['KeyS', ''], left: ['KeyA', ''], right: ['KeyD', ''],
  fire: ['Mouse0', ''], ads: ['Mouse2', ''], jump: ['Space', ''], sprint: ['ShiftLeft', 'ShiftRight'],
  crouch: ['KeyC', 'ControlLeft'], prone: ['KeyZ', ''], reload: ['KeyR', ''], w1: ['Digit1', ''], w2: ['Digit2', ''], swap: ['', ''],
  melee: ['KeyV', 'KeyE'], lethal: ['KeyG', ''], tactical: ['KeyQ', ''], use: ['KeyF', ''],
  s1: ['Digit4', ''], s2: ['Digit5', ''], s3: ['Digit6', ''], board: ['Tab', ''], cls: ['KeyK', ''],
};
const BIND_LABEL = {
  fwd: '前進', back: '後退', left: '左移動', right: '右移動', fire: '射撃', ads: 'ADS（覗く）', jump: 'ジャンプ・乗り越え', sprint: 'ダッシュ ／ 息止め',
  crouch: 'しゃがみ ／ スライディング', prone: '伏せ ／ 飛び込み', reload: 'リロード', w1: 'メイン武器', w2: 'サブ武器', swap: '武器切替（交互）',
  melee: 'ナイフ', lethal: 'リーサル', tactical: 'タクティカル', use: '使用・購入・修理', s1: 'ストリーク1 ／ トラップ設置', s2: 'ストリーク2', s3: 'ストリーク3', board: 'スコアボード', cls: 'クラス変更',
};
const BIND_GROUPS = [['移動', ['fwd', 'back', 'left', 'right', 'jump', 'sprint', 'crouch', 'prone']], ['戦闘', ['fire', 'ads', 'reload', 'w1', 'w2', 'swap', 'melee', 'lethal', 'tactical']], ['その他', ['use', 's1', 's2', 's3', 'board', 'cls']]];
let BIND = (() => { const s = loadJSON('ls_bind', {}), o = {}; for (const k in BIND_DEF) o[k] = Array.isArray(s[k]) && s[k].length === 2 ? s[k].slice() : BIND_DEF[k].slice(); return o; })();
const saveBinds = () => saveJSON('ls_bind', BIND);
const BOUND = () => { const m = {}; for (const k in BIND) for (const c of BIND[k]) if (c) m[c] = k; return m; };
let BOUND_MAP = BOUND();
function keyName(code) {
  if (!code) return '—';
  const M = { Mouse0: '左クリック', Mouse1: 'ホイールクリック', Mouse2: '右クリック', Mouse3: 'サイドボタン(戻る)', Mouse4: 'サイドボタン(進む)', Space: 'Space', ShiftLeft: '左Shift', ShiftRight: '右Shift', ControlLeft: '左Ctrl', ControlRight: '右Ctrl',
    AltLeft: '左Alt', AltRight: '右Alt', Tab: 'Tab', CapsLock: 'CapsLock', Enter: 'Enter', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', IntlRo: 'ろ', IntlYen: '¥', NonConvert: '無変換', Convert: '変換', KanaMode: 'かな' };
  if (M[code]) return M[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'テンキー' + code.slice(6);
  return code;
}
const K = act => keyName(BIND[act][0] || BIND[act][1]);
// replace hard-coded key hints like "[F]" with the player's current binding
const KEYHINT = { F: 'use', G: 'lethal', Q: 'tactical', R: 'reload', 4: 's1', 5: 's2', 6: 's3' };
const keyify = s => s.replace(/\[(F|G|Q|R|4|5|6)(長押し)?\]/g, (_, k, h) => `[${K(KEYHINT[k])}${h || ''}]`);
function setBind(act, slot, code) {
  let moved = null; const old = BIND[act][slot];
  if (code) for (const k in BIND) for (let i = 0; i < 2; i++) if (BIND[k][i] === code && !(k === act && i === slot)) { BIND[k][i] = k === act ? '' : old; moved = k; }
  BIND[act][slot] = code; BOUND_MAP = BOUND(); saveBinds();
  return moved;
}
function resetBinds() { for (const k in BIND_DEF) BIND[k] = BIND_DEF[k].slice(); BOUND_MAP = BOUND(); saveBinds(); }
const bHeld = act => { for (const c of BIND[act]) if (c && (c.startsWith('Mouse') ? IN.mb[+c[5]] : IN.keys[c])) return true; return false; };
const bPress = act => { for (const c of BIND[act]) if (c && (c.startsWith('Mouse') ? IN.mbP[+c[5]] : IN.pressed[c])) return true; return false; };
addEventListener('keydown', e => {
  if (IN.listen) { e.preventDefault(); e.stopPropagation(); const f = IN.listen; IN.listen = null; f(e.code === 'Escape' ? null : (e.code === 'Backspace' || e.code === 'Delete') ? '' : e.code); return; }
  const typing = !IN.locked && e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA');
  if (!typing && (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || (IN.locked && BOUND_MAP[e.code]))) e.preventDefault();
  if (typing) return;
  if (!IN.keys[e.code]) IN.pressed[e.code] = true;
  IN.keys[e.code] = true; IN.padActive = false;
}, true);
addEventListener('keyup', e => { IN.keys[e.code] = false; });
addEventListener('mousemove', e => { if (IN.locked) { IN.mdx += e.movementX || 0; IN.mdy += e.movementY || 0; IN.padActive = false; } });
addEventListener('mousedown', e => {
  if (IN.listen && e.button <= 4) { e.preventDefault(); e.stopPropagation(); const f = IN.listen; IN.listen = null; f('Mouse' + e.button); return; }
  if (e.button > 4) return;
  if (IN.locked && (e.button === 3 || e.button === 4)) e.preventDefault();
  if (!IN.mb[e.button]) IN.mbP[e.button] = true; IN.mb[e.button] = true; IN.padActive = false;
}, true);
addEventListener('mouseup', e => { if (e.button <= 4) IN.mb[e.button] = false; if (IN.locked && (e.button === 3 || e.button === 4)) e.preventDefault(); });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('wheel', e => { if (IN.locked) { IN.wheel += Math.sign(e.deltaY); } }, { passive: true });
addEventListener('blur', () => { IN.keys = {}; IN.mb = [false, false, false, false, false]; });
document.addEventListener('visibilitychange', () => { if (document.hidden) { IN.keys = {}; IN.mb = [false, false, false, false, false]; } });
// while the pointer is locked a focused field must never swallow game keys
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement) { const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); } });

function readPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) if (p && p.connected && p.buttons.length >= 16) return p;
  return null;
}
const dz = (v, d) => Math.abs(v) < d ? 0 : Math.sign(v) * (Math.abs(v) - d) / (1 - d);
function gatherActions(dt) {
  const H = bHeld, Pr = bPress, w1 = Pr('w1'), w2 = Pr('w2');
  const a = {
    mx: (H('right') ? 1 : 0) - (H('left') ? 1 : 0), my: (H('fwd') ? 1 : 0) - (H('back') ? 1 : 0),
    lookX: 0, lookY: 0, mouseX: IN.mdx, mouseY: IN.mdy,
    fire: H('fire'), fireP: Pr('fire'), ads: H('ads'),
    jumpP: Pr('jump'), cPress: Pr('crouch'), cHeld: H('crouch'), zPress: Pr('prone'), zHeld: H('prone'), sprintP: Pr('sprint'), sprintHeld: H('sprint'),
    reloadP: Pr('reload'), swapP: w1 || w2 || Pr('swap'), classP: Pr('cls'), swapTo: w1 ? 0 : w2 ? 1 : -1,
    meleeP: Pr('melee'), lethalP: Pr('lethal'), lethalHeld: H('lethal'), tacP: Pr('tactical'), useP: Pr('use'), useHeld: H('use'),
    streakP: Pr('s1') ? 0 : Pr('s2') ? 1 : Pr('s3') ? 2 : -1, zoom: 0,
    board: H('board'), pad: false,
  };
  // C: tap = crouch, hold = prone (console style)

  a.wheel = IN.wheel;

  const pad = readPad();
  if (pad) {
    const B = i => pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5);
    const BP = i => B(i) && !IN.padPrev[i];
    const ax = pad.axes;
    const lx = dz(ax[0], 0.18), ly = dz(ax[1], 0.18), rx = dz(ax[2], 0.14), ry = dz(ax[3], 0.14);
    let any = Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > 0.05;
    for (let i = 0; i < 16; i++) if (B(i)) any = true;
    if (any) { IN.padActive = true; IN.lastPadT = performance.now(); }
    if (IN.padActive) {
      a.pad = true;
      if (Math.abs(lx) + Math.abs(ly) > 0) { a.mx = lx; a.my = -ly; }
      const curve = v => Math.sign(v) * Math.pow(Math.abs(v), 1.8);
      a.lookX = curve(rx); a.lookY = curve(ry);
      a.ads = a.ads || B(6); a.fire = a.fire || B(7); a.fireP = a.fireP || BP(7);
      a.jumpP = a.jumpP || BP(0);
      // B: tap crouch, hold prone
      a.cPress = a.cPress || BP(1); a.cHeld = a.cHeld || B(1);
      a.padDown = BP(13);
      a.sprintP = a.sprintP || BP(10); a.sprintHeld = a.sprintHeld || B(10);
      a.meleeP = a.meleeP || BP(11); a.reloadP = a.reloadP || BP(2); a.useP = a.useP || BP(2); a.useHeld = a.useHeld || B(2); a.swapP = a.swapP || BP(3);
      a.lethalP = a.lethalP || BP(5); a.lethalHeld = a.lethalHeld || B(5); a.tacP = a.tacP || BP(4);
      if (BP(14)) a.streakP = 0; if (BP(15)) a.streakP = 1;
      if (BP(12)) a.zoom = 1;
      a.board = a.board || B(8);
      a.pauseP = BP(9);
    }
    IN.padPrev = pad.buttons.map((b, i) => B(i));
  }
  IN.cT = a.cHeld ? (IN.cT || 0) + dt : 0; IN.zT = a.zHeld ? (IN.zT || 0) + dt : 0;
  a.cHoldT = IN.cT; a.zHoldT = IN.zT; a.cRelease = IN.cWas && !a.cHeld; a.zRelease = IN.zWas && !a.zHeld; IN.cWas = a.cHeld; IN.zWas = a.zHeld;
  IN.mdx = 0; IN.mdy = 0; IN.wheel = 0; IN.pressed = {}; IN.mbP = [false, false, false, false, false];
  return a;
}
