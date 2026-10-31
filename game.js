'use strict';
// オフサイドトラップ — ラインを上げろ!パスの瞬間に、相手を置き去りにせよ
// 座標系: ピッチの中心が原点、x がタッチライン方向、y がゴール方向、z が高さ。単位はメートル。
// 自分たち(赤)は y = +52.5 のゴールを守る守備側。相手(青)は +y に向かって攻めてくる。相手陣内 = y > 0 の側。
// 1 プレーの流れ:
//   1. 相手がドリブルで攻めてくる(スローイン・ゴールキック・フリーキックのこともある)
//   2. パスが出る瞬間に、ラインから遅れている DF をタップすると、その DF が自動で前に出てラインを上げる
//   3. パス(ボールを蹴った瞬間)に、受け手がボールと「後ろから2人目の相手(GK も数える)」より前で、相手陣内にいればオフサイド
//      受け手がボールに触った(プレーに関わった)ところで副審が旗を上げる
//   4. オンサイドなら走り合い。DF が先に触ればクリア、受け手が先なら失点
// 質感と操作感は techgymjp/corner-kick(コーナーキック)と同じ作り。
(() => {
  // ---------- 定数 ----------
  const H = 640;
  let W = 960; // 画面の横幅に合わせて変わる(高さ 640 基準の論理座標)
  const HX = 34, GL = 52.5;
  const GOAL_W = 3.66, GOAL_H = 2.44;  // ゴールの幅の半分・高さ
  const PEN_X = 20.16, PEN_D = 16.5;   // ペナルティエリア
  const TOTAL = 10;
  const G = 9.8, R = 0.15;             // 重力・ボールの半径(表示に合わせて少し大きめ)
  const LEVEL = 0.1;                   // これより差が小さければ「同じ高さ」(オンサイド)

  // 走り: 相手の受け手のスプリント、DF・GK の追いかけ、タップした DF のライン上げ
  const RUN_V = 8.6, RUN_ACC = 14;
  const HOME_V = 7.6, HOME_ACC = 14, HOME_REACT = 0.32, TURN_T = 0.3; // 裏へのボールは振り返るぶん遅れる
  const GK_V = 6.6, GK_REACT = 0.4;
  const STEP_V = 7.0, STEP_ACC = 16, STEP_PAST = 1.5; // ラインより STEP_PAST だけ前まで出る
  const VAR_T = 1.3, VAR_K = 0.22;     // パスの瞬間のスローモーション(実時間・倍率)
  // 「◯プレー目」と場面の表示は READY_SHOW 秒で消え(最後の READY_FADE 秒でフェード)、少し間をおいて READY_T 秒に笛が鳴ってプレーが始まる
  const READY_SHOW = 2.3, READY_FADE = 0.5, READY_T = 3.1;
  const EXTRA_PEN = 300;               // オフサイドを取る場面で、上げる必要のない DF を 1 人上げるごとの減点
  const NO_NAV_K = 1.5;               // ナビなしで守ったときの得点の倍率
  const HUD_K = 1.4;                   // スマホの左上の成績の拡大率
  const DT = 1 / 120;
  const DEFS = ['d1', 'd2', 'd3', 'd4'];                 // 左から(画面の上=奥から)1〜4 キー
  const HOME = ['d1', 'd2', 'd3', 'd4', 'm1', 'm2', 'gk'];
  const NUM = { d1: '2', d2: '4', d3: '5', d4: '3', m1: '6', m2: '8', P: '10', R: '9', R2: '11', S: '7' }; // scene3d.js の ROSTER と同じ
  // 場面の種類。試合ごとにこの中からランダムに 10 プレーを選ぶ(同じ場面は 2 回まで・続けては出ない)
  const KINDS = ['through', 'long', 'throw', 'through2', 'two', 'cutback', 'gkout', 'ownhalf', 'goalkick', 'fk', 'corner', 'offfield', 'gkthrow'];
  const AERIAL = { goalkick: 3.1, cross: 1.5, chip: 0 }; // 受け手の頭へ送る浮き球(マークの DF と競り合う)。0 は距離から決める
  const t = (k, v) => I18N.t(k, v);
  // Android アプリ(Capacitor)で動いているか。Web 版では Capacitor がないので何もしない
  const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const plugin = (name) => (NATIVE && window.Capacitor.Plugins ? window.Capacitor.Plugins[name] : null);

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // ---------- 乱数 ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let rng = mulberry32(Date.now());
  const rand = (a, b) => a + (b - a) * rng();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };

  // ---------- 保存 ----------
  function loadBest() {
    try { return JSON.parse(localStorage.getItem('offside.best')) || null; } catch (e) { return null; }
  }
  function saveBest(b) {
    try { localStorage.setItem('offside.best', JSON.stringify(b)); } catch (e) { /* 保存できない環境 */ }
  }
  function loadNav() {
    try { return localStorage.getItem('offside.nav') !== '0'; } catch (e) { return true; }
  }
  function toggleNav() {
    state.nav = !state.nav;
    try { localStorage.setItem('offside.nav', state.nav ? '1' : '0'); } catch (e) { /* 保存できない環境 */ }
  }

  // ---------- サウンド(sound.js) ----------
  function audio() { Sound.init(); }

  // ---------- 入力 ----------
  // DF の頭の上のバッジをタップ(1〜4 キー)すると、その DF がラインを上げる
  const keys = new Set();
  const pressed = { start: false, next: false };
  const MUTE = { x: 596, y: 36, r: 20 };
  const NAVBTN = { x: 660, y: 36, w: 76, h: 30 };
  // 「マーク」ボタン(オフサイドにならない場面で、狙われている選手に体を寄せる)
  const MARKBTN = { x: 860, y: 450, r: 50 };
  const pointers = new Map();
  let bot = null; // テスト用: (state) => 'd1' など、上げる DF のキー(または 'mark')を返す関数

  window.addEventListener('keydown', (e) => {
    audio();
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (!keys.has(k)) {
      if (k >= '1' && k <= '4') tapDef(DEFS[+k - 1]);
      if (k === ' ' || k === 'k') doMark();
      if (k === ' ' || k === 'Enter') { pressed.start = true; pressed.next = true; }
      if (k === 'p' || k === 'Escape') togglePause();
      if (k === 'm') Sound.setMuted(!Sound.muted);
      if (k === 'n') toggleNav();
    }
    keys.add(k);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  });
  window.addEventListener('blur', () => keys.clear());

  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }

  // 一番近いバッジ(または選手の体)。スマホは指が太いので少し広めに反応させる
  function hitBadge(p) {
    let best = null, bd = Infinity;
    for (const bg of state.badges || []) {
      const d1 = Math.hypot(p.x - bg.x, p.y - bg.y) - bg.r;
      // 選手の体(足元から頭まで)も押せる
      const dx = Math.abs(p.x - bg.hx), dy = p.y < bg.hy ? bg.hy - p.y : p.y > bg.fy ? p.y - bg.fy : 0;
      const d2 = Math.hypot(Math.max(0, dx - 14), dy);
      const d = Math.min(d1, d2);
      if (d < bd) { bd = d; best = bg.k; }
    }
    return bd <= (isTouch ? 22 : 10) ? best : null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    audio();
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const p = canvasPos(e);
    pointers.set(e.pointerId, true);
    if (Math.hypot(p.x - MUTE.x, p.y - MUTE.y) <= MUTE.r + 8) { Sound.setMuted(!Sound.muted); return; }
    if (Math.abs(p.x - NAVBTN.x) <= NAVBTN.w / 2 + 6 && Math.abs(p.y - NAVBTN.y) <= NAVBTN.h / 2 + 8) { toggleNav(); return; }
    if (state.phase === 'title' || state.phase === 'over') {
      if (state.phase !== 'over' || state.overT > 1.0) pressed.start = true;
      return;
    }
    if (state.paused) return; // ポーズ中は「再開」ボタンで戻る
    if (state.phase === 'result') { pressed.next = true; return; }
    if (state.phase === 'var' && (state.badges || []).length) { const k = hitBadge(p); if (k) tapDef(k); return; }
    if (markShown() && Math.hypot(p.x - MARKBTN.x, p.y - MARKBTN.y) <= MARKBTN.r + (isTouch ? 16 : 6)) { doMark(); return; }
    const k = hitBadge(p);
    if (k) tapDef(k);
  });
  function releasePointer(e) { pointers.delete(e.pointerId); }
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);

  // ---------- ゲーム状態 ----------
  const state = {
    phase: 'title', // title | ready | build | var | run | attack | result | over
    paused: false,
    index: 0, total: TOTAL, order: KINDS.slice(),
    ok: 0, traps: 0, score: 0, streak: 0, bestStreak: 0,
    phaseT: 0, overT: 0, buildT: 0,
    play: null, actors: {}, ball: null,
    view: { x: 0, y: 20, fx: -1, fy: 0 },
    guide: null, badges: [],
    popups: [],
    msg: null,
    judge: null,
    lastResult: null,
    best: loadBest(),
    nav: loadNav(),
    time: 0,
    newRecord: false,
  };

  function actor(x, y, face, extra) {
    return Object.assign({ x, y, vx: 0, vy: 0, face, mode: 'run', t: 0, phase: rng() * 6 }, extra || {});
  }

  function newGame(seed) {
    state.seed = (seed != null ? seed : (Date.now() ^ (Math.random() * 1e9))) >>> 0;
    state.order = makeOrder(state.seed);
    Object.assign(state, {
      phase: 'ready', paused: false, index: 0, ok: 0, traps: 0, score: 0,
      streak: 0, bestStreak: 0, phaseT: 0, overT: 0, popups: [], lastResult: null, newRecord: false, navUsed: false, redoUsed: 0, markTipDone: false,
    });
    startPlay();
  }

  // 10 プレーの場面の順番
  function makeOrder(seed) {
    const r = mulberry32(seed ^ 0x9e3779b9);
    const count = {}, order = [];
    while (order.length < TOTAL) {
      const k = KINDS[(r() * KINDS.length) | 0];
      if ((count[k] || 0) >= 2 || k === order[order.length - 1]) continue;
      count[k] = (count[k] || 0) + 1;
      order.push(k);
    }
    return order;
  }

  // ---------- プレーの準備 ----------
  // 場面ごとに、守備ライン(lineY)・遅れている DF(laggers)・相手の動き・パスの種類を決める
  function genPlay(i) {
    const lv = i / (TOTAL - 1);
    const kind = api.forceKind || state.order[i % state.order.length];
    const m = rng() < 0.5 ? -1 : 1; // 左右反転
    const p = {
      kind, lv, m,
      lag: 0.6 - 0.25 * lv,          // 受け手がラインの動きに反応するまでの遅れ
      retreatV: 4.4 + 1.2 * lv,      // 受け手がオンサイドに戻る速さ
      windup: 0.42 - 0.12 * lv,      // パスの振りかぶり(見てから反応できる時間)
      noOff: null,                   // オフサイドにならない場面: 'throw' | 'goalkick' | 'behind' | 'ownHalf'
      kicker: 'P', passType: 'through', receiver: 'R', decoy: null,
      laggers: [], depth: {}, pos: {}, Tp: 3, extra: [], gap: null,
    };
    // DF 4 人の並び: 幅も左右の位置も毎回変わる
    const width = rand(30, 40), cx = rand(-4, 4);
    const lanes = [-0.5, -1 / 6, 1 / 6, 0.5].map((f) => cx + f * width + rand(-1.5, 1.5));
    const pick = (n) => (rng() * n) | 0;
    const at = (k, x, y, extra) => { p.pos[k] = Object.assign({ x, y }, extra || {}); };
    const line = (lineY) => { p.lineY = lineY; DEFS.forEach((k, j) => at(k, lanes[j], lineY + rand(-0.25, 0.25))); };
    const lag = (j, d) => { const k = DEFS[j]; p.laggers.push(k); p.pos[k].y = p.lineY + d; };
    const gkAt = (x, y) => at('gk', x, y);
    gkAt(rand(-1, 1), Math.max(GL - 9, 0));
    at('ogk', rand(-2, 2), -GL + 1.5, { idle: true });

    if (kind === 'through' || kind === 'through2' || kind === 'two') {
      line(rand(23, 30));
      const li = pick(4);
      const side = li === 0 ? 1 : li === 3 ? -1 : m; // もう一人の遅れている DF の側
      if (kind === 'through2') {
        const d0 = 2.9 - 0.6 * lv;
        lag(li, d0); lag(li + side, d0 - 0.3);
      } else lag(li, kind === 'two' ? 3.0 : 3.4 - 1.0 * lv);
      const rx = lanes[li] + side * rand(0.5, 2);
      at('R', rx, p.lineY - rand(4, 7), { hold: 0.45, laneX: rx * 0.85 });
      const away = lanes[li] > 0 ? -1 : 1; // R から離れた側
      if (kind === 'two') {
        // おとり: 最初からオフサイドポジションでうろうろしている(プレーに関わらなければ反則ではない)
        at('R2', clamp(lanes[li] + away * rand(9, 16), -HX + 4, HX - 4), p.lineY + 3.0 + rand(1.6, 2.4), { loiter: true }); // 遅れている DF よりも奥
        p.decoy = 'R2';
      } else {
        const r2x = clamp(lanes[li] + away * rand(14, 24), -HX + 4, HX - 4);
        at('R2', r2x, p.lineY - rand(3, 6), { hold: 1.6, laneX: r2x });
      }
      const x0 = lanes[li] * rand(0, 0.5) + rand(-5, 5);
      at('P', x0, p.lineY - rand(22, 28), { to: { x: x0 + rand(-4, 4), y: p.lineY - rand(12, 16) } });
      at('S', x0 - m * 9, p.lineY - 27, { trail: { x: -m * 9, y: -2 } });
      at('m1', x0 + m * 0.8, p.lineY - 22.5, { press: { x: m * 0.8, y: 2.4 } });
      at('m2', x0 + m * 7, p.lineY - 8);
      p.Tp = rand(2.7, 3.4);
    } else if (kind === 'long') {
      line(rand(11, 19));
      const li = pick(4);
      lag(li, 3.0 - 0.6 * lv);
      const rx = lanes[li] + rand(-1.5, 1.5);
      at('R', rx, p.lineY - 6, { hold: 0.45, laneX: rx * 0.8 });
      const oj = (li + 2) % 4;
      at('R2', lanes[oj], p.lineY - 4, { hold: 1.4, laneX: lanes[oj] * 0.9 });
      const x0 = rand(-12, 12), y0 = rand(-22, -12);
      at('P', x0, y0, { to: { x: x0 + rand(-3, 3), y: y0 + rand(2, 5) } });
      at('S', x0 + 7, -21, { trail: { x: 7, y: -3 } });
      at('m1', x0 - 0.8, -15.5, { press: { x: -0.8, y: 2.6 } });
      at('m2', lanes[(li + 1) % 4] * 0.5, p.lineY - 9);
      p.passType = 'long';
      p.Tp = rand(2.5, 3.0);
    } else if (kind === 'throw') {
      // 奥のタッチラインからのスローイン。受け手はラインの裏にいて、マークの DF がゴール側についている
      line(rand(26, 35));
      const rx = -HX + rand(8, 12), ry = p.lineY + rand(2.8, 4);
      at('R', rx, ry, { stay: true });
      p.pos.d1.x = rx + 0.5; p.pos.d1.y = ry + 1.5;
      p.pos.d1.follow = { k: 'R', x: 0.5, y: 1.5 };
      p.laggers.push('d1');
      const ty = p.lineY - rand(5, 9);
      at('P', -HX - 0.35, ty, { thrower: true });
      at('R2', rand(-12, -4), p.lineY - rand(2, 4), { idle: true });
      at('S', -HX + rand(3, 6), ty - rand(1.5, 3.5), { idle: true });
      at('m1', -HX + rand(5.5, 8), ty - rand(0, 1.5));
      at('m2', rand(-2, 2), p.lineY - 6);
      p.noOff = 'throw'; p.passType = 'throw'; p.hands = true;
      p.windup = 0.45;
      p.Tp = rand(2.0, 2.5);
    } else if (kind === 'cutback') {
      // 奥のサイドを突破され、ゴールライン近くからマイナスのパス(カットバック)
      line(rand(35, 38));
      const px = rand(-27, -22), py = rand(24, 30);
      at('P', px, py, { to: { x: rand(-21, -17), y: GL - rand(3.5, 6) } });
      p.pos.d1.x = px + 1.0; p.pos.d1.y = py - 5.5; p.pos.d1.follow = { k: 'P', x: 1.0, y: -5.5, v: 7 };
      const r0x = rand(-6, 2), r0y = rand(28, 32);
      at('R', r0x, r0y, { to: { x: rand(-7, 0), y: GL - rand(7.5, 10) } });
      p.pos.d2.x = r0x - 2.0; p.pos.d2.y = r0y - 0.6; p.pos.d2.follow = { k: 'R', x: -2.0, y: -0.6, v: 8 };
      p.laggers.push('d2');
      p.pos.d3.y = p.lineY + rand(0.5, 2); p.pos.d4.y = p.lineY + rand(0.5, 2);
      const r2x = rand(3, 9);
      at('R2', r2x, rand(30, 35), { to: { x: r2x - rand(0, 3), y: GL - rand(10, 13) } });
      const sx = rand(-15, -9);
      at('S', sx, py - rand(1, 4), { to: { x: sx, y: rand(35, 39) } });
      at('m1', px + 10, py - 3, { press: { x: 4, y: -9 } });
      at('m2', rand(-2, 6), rand(24, 28));
      gkAt(rand(-2.5, -0.5), GL - rand(1, 2));
      p.noOff = 'behind'; p.passType = 'cutback';
      p.Tp = rand(3.1, 3.6);
    } else if (kind === 'gkout') {
      // キーパーが前に出ていて、その後ろに DF が 1 人残っている。後ろから2人目はキーパー
      line(rand(25, 30));
      const ci = rng() < 0.5 ? 3 : 0;
      const gd = rand(3.3, 4.2);
      lag(ci, gd + rand(2, 2.6));
      gkAt(rand(-3, 3), p.lineY + gd);
      const rx = -Math.sign(lanes[ci]) * rand(9, 12);
      at('R', rx, p.lineY - 3, { hold: 0.45, laneX: rx });
      at('R2', -lanes[ci] * 0.9, p.lineY - 3, { idle: true });
      const x0 = rand(-6, 6);
      at('P', x0, p.lineY - rand(22, 28), { to: { x: x0 + rand(-4, 4), y: p.lineY - rand(12, 16) } });
      at('S', x0 + m * 9, p.lineY - 27, { trail: { x: m * 9, y: -2 } });
      at('m1', x0 - m * 0.8, p.lineY - 22.5, { press: { x: -m * 0.8, y: 2.4 } });
      at('m2', x0 - m * 7, p.lineY - 8);
      p.Tp = rand(2.8, 3.2);
    } else if (kind === 'ownhalf') {
      // ハーフウェーラインの近くまでラインを上げている。受け手は自陣から走り出す
      line(rand(1.5, 5));
      const ci = pick(4);
      lag(ci, rand(6, 8));
      const rx = lanes[ci] + rand(-0.5, 0.5);
      at('R', rx, -5, { ownHalf: true, laneX: rx });
      const oj = (ci + 2) % 4;
      at('R2', lanes[oj], p.lineY - 6, { hold: 1.0, laneX: lanes[oj] });
      const x0 = rand(-10, 10), y0 = rand(-30, -22);
      at('P', x0, y0, { to: { x: x0 + rand(-3, 3), y: y0 + rand(3, 5) } });
      at('S', x0 - 7, -29, { trail: { x: -7, y: -2 } });
      at('m1', x0 + 0.8, -24.5, { press: { x: 0.8, y: 2.6 } });
      at('m2', lanes[oj] * 0.5, -9);
      gkAt(0, GL - 10);
      p.noOff = 'ownHalf'; p.passType = 'long';
      p.Tp = rand(2.6, 3.0);
    } else if (kind === 'goalkick') {
      // 相手キーパーのゴールキック。受け手はラインの裏で待ち、マークの DF がゴール側で競る
      line(rand(12, 19));
      const li = pick(4);
      const rx = lanes[li] * rand(0.6, 0.95), ry = p.lineY + rand(3, 4.2);
      at('R', rx, ry, { stay: 'still' });
      const dk = DEFS[li];
      p.pos[dk].x = rx + 0.3; p.pos[dk].y = ry + 0.72; p.pos[dk].follow = { k: 'R', x: 0.3, y: 0.72 };
      p.laggers.push(dk);
      at('ogk', rand(-3, 3), -GL + 5.5, { gkick: true });
      at('P', rand(-10, 10), -12, { idle: true });
      at('S', rand(-10, 10), -5, { idle: true });
      at('R2', -rx, p.lineY - 2, { idle: true });
      at('m1', rand(-12, -3), p.lineY - 10);
      at('m2', rand(3, 12), p.lineY - 9);
      gkAt(0, GL - 8);
      p.noOff = 'goalkick'; p.passType = 'goalkick'; p.kicker = 'ogk';
      p.windup = 0.5;
      p.Tp = rand(1.9, 2.3);
    } else if (kind === 'corner') {
      // 奥のコーナーからのコーナーキック。受け手はラインの裏で待ち、マークの DF がゴール側で競る
      line(GL - rand(11, 13));
      DEFS.forEach((k) => { p.pos[k].x *= 0.45; });
      const li = pick(4);
      const rx = rand(-5, 5), ry = GL - rand(7, 9.5);
      at('R', rx, ry, { stay: 'still' });
      const dk = DEFS[li];
      p.pos[dk].x = rx + 0.3; p.pos[dk].y = ry + 0.72; p.pos[dk].follow = { k: 'R', x: 0.3, y: 0.72 };
      p.laggers.push(dk);
      at('P', -HX + 0.4, GL - 0.4, { corner: true });
      at('S', -HX + rand(4, 6), GL - rand(2, 4), { idle: true });
      at('R2', rand(-8, 8), GL - rand(4.5, 6), { idle: true });
      at('m1', rand(-12, -2), GL - rand(16, 19));
      at('m2', rand(2, 12), GL - rand(16, 19));
      gkAt(rand(-1, 1), GL - 1);
      p.noOff = 'corner'; p.passType = 'cross';
      p.windup = 0.5;
      p.Tp = rand(2.0, 2.5);
    } else if (kind === 'offfield') {
      // 倒れた DF がゴールラインの外にいる。その DF はゴールライン上にいるとみなすので、後ろから2人目は GK
      line(rand(24, 30));
      const oi = pick(4), mi = (oi + 1 + pick(3)) % 4;
      const ok = DEFS[oi];
      p.pos[ok].x = rand(-8, 8); p.pos[ok].y = GL + 1.6; p.pos[ok].off = true;
      const rx = lanes[mi] * rand(0.6, 0.95), ry = p.lineY + rand(3, 4.2);
      at('R', rx, ry, { stay: 'still' });
      const dk = DEFS[mi];
      p.pos[dk].x = rx + 0.3; p.pos[dk].y = ry + 0.72; p.pos[dk].follow = { k: 'R', x: 0.3, y: 0.72 };
      p.laggers.push(dk);
      const x0 = rand(-8, 8);
      at('P', x0, p.lineY - rand(22, 28), { to: { x: x0 + rand(-4, 4), y: p.lineY - rand(13, 16) } });
      at('R2', clamp(-rx + rand(-4, 4), -HX + 4, HX - 4), p.lineY - rand(3, 5), { idle: true });
      at('S', x0 + m * 9, p.lineY - 27, { trail: { x: m * 9, y: -2 } });
      at('m1', x0 - m * 0.8, p.lineY - 24, { press: { x: -m * 0.8, y: 2.4 } });
      at('m2', x0 - m * 7, p.lineY - 8);
      p.noOff = 'offField'; p.passType = 'chip';
      p.Tp = rand(2.7, 3.3);
    } else if (kind === 'gkthrow') {
      // 相手キーパーが手で遠くへ投げる。スローインとちがってオフサイドがある
      line(rand(1.5, 5));
      const li = pick(4);
      lag(li, 3.0 - 0.6 * lv);
      const rx = lanes[li] + rand(-1.5, 1.5);
      at('R', rx, p.lineY - 6, { hold: 0.45, laneX: rx * 0.8 });
      const oj = (li + 2) % 4;
      at('R2', lanes[oj], p.lineY - 4, { hold: 1.4, laneX: lanes[oj] * 0.9 });
      at('ogk', rand(-6, 6), -GL + rand(13, 16), { hands: true });
      at('P', rand(-12, 12), -20, { idle: true });
      at('S', rand(-12, 12), -12, { idle: true });
      at('m1', rand(-14, -4), p.lineY - rand(9, 13));
      at('m2', rand(4, 14), p.lineY - rand(9, 13));
      p.kicker = 'ogk'; p.passType = 'long'; p.hands = true;
      p.windup = 0.45;
      p.Tp = rand(2.2, 2.8);
    } else { // fk
      // 間接フリーキック。遅れている DF が 2 人。2 人とも上げないとオフサイドにならない
      line(rand(31, 36));
      const li = pick(3), lj = li + 1, first = rng() < 0.5; // 隣り合う 2 人が遅れている
      const d0 = 2.4 - 0.4 * lv;
      lag(first ? li : lj, d0); lag(first ? lj : li, d0 - 0.25);
      const ri = first ? li : lj, oi = first ? lj : li;
      const rx = lanes[ri] + rand(-1, 1);
      at('R', rx, p.lineY - rand(3, 5), { hold: 0.45, laneX: rx * 0.8 });
      const r2x = lanes[oi] + Math.sign(lanes[oi] - lanes[ri]) * 2;
      at('R2', r2x, p.lineY - rand(3, 5), { hold: 1.0, laneX: r2x });
      const x0 = rand(-12, 12), y0 = p.lineY - rand(18, 25);
      at('P', x0, y0, { fk: true });
      at('S', x0 + 1.5, y0 - 0.6, { idle: true });
      at('m1', x0 - 0.4, y0 + 9.15, { idle: true });
      at('m2', x0 + 0.4, y0 + 9.15, { idle: true });
      gkAt(0, GL - 4);
      p.passType = 'fk';
      p.windup = 0.5;
      p.Tp = rand(2.2, 2.7);
    }
    if (p.pos.gk.y === GL - 9 && kind !== 'gkout') p.pos.gk.y = clamp(p.lineY + 14, GL - 9, GL - 2.5);
    return p;
  }

  function startPlay() {
    // 1 プレーごとの乱数はゲームの種から作る(リワード広告のやり直しで同じプレーを再現するため)
    rng = mulberry32((state.seed || 1) + state.index * 7919);
    // やり直し(リワード広告)のときに戻す成績
    state.playStart = { ok: state.ok, traps: state.traps, score: state.score, streak: state.streak, bestStreak: state.bestStreak };
    const p = genPlay(state.index);
    state.play = p;
    state.phase = 'ready';
    state.phaseT = 0;
    state.buildT = 0;
    state.guide = null;
    state.msg = null;
    state.judge = null;
    state.lHist = [];
    state.released = false;
    state.taps = [];
    state.result = null;
    state.shot = false; state.clearedBy = null; state.goalHow = null; state.mark = null;
    // このゲームで最初の「マーク」の場面(オフサイドにならない場面)だけ、ボタンの説明を出す
    p.markTip = !!p.noOff && !state.markTipDone;
    if (p.markTip) state.markTipDone = true;
    const a = {};
    for (const [k, q] of Object.entries(p.pos)) {
      const home = HOME.includes(k);
      a[k] = actor(q.x, q.y, home ? Math.PI : 0, { cfg: q, home: { x: q.x, y: q.y } });
    }
    a.ref = actor(12, p.lineY - 12, -Math.PI / 2);
    a.ar = actor(-HX - 1.1, p.lineY, Math.PI / 2);
    state.actors = a;
    const kk = a[p.kicker];
    for (const k of DEFS) if (a[k].cfg.off) { a[k].off = true; a[k].mode = 'down'; a[k].face = rng() * 6; }
    if (p.hands) {
      // スローイン・キーパーのスロー: 両手で頭の上にボールを持つ
      kk.mode = 'throw'; kk.windT = 0; kk.thrown = false;
      kk.face = p.passType === 'throw' ? Math.atan2(1, 0.25) : Math.atan2(a.R.x - kk.x, a.R.y - kk.y);
      state.ball = { holder: p.kicker, overHead: true, x: kk.x, y: kk.y, z: 2.2, vx: 0, vy: 0, vz: 0, still: true, spinX: 0, spinY: 0 };
    } else {
      if (kk.cfg.to) kk.face = Math.atan2(kk.cfg.to.x - kk.x, kk.cfg.to.y - kk.y);
      if (p.passType === 'fk' || p.passType in AERIAL && !kk.cfg.to) kk.face = Math.atan2(a.R.x - kk.x, a.R.y - kk.y);
      state.ball = { holder: null, x: kk.x + Math.sin(kk.face) * 0.6, y: kk.y + Math.cos(kk.face) * 0.6, z: R, vx: 0, vy: 0, vz: 0, still: true, spinX: 0, spinY: 0 };
    }
  }

  // ---------- 選手の動き ----------
  function setMode(p, m) { p.mode = m; p.t = 0; }

  function steer(p, tvx, tvy, acc, dt) {
    const dvx = tvx - p.vx, dvy = tvy - p.vy;
    const dv = Math.hypot(dvx, dvy), maxd = acc * dt;
    if (dv <= maxd) { p.vx = tvx; p.vy = tvy; } else { p.vx += dvx / dv * maxd; p.vy += dvy / dv * maxd; }
  }
  function moveTo(p, x, y, speed, dt, acc = 18, brake = 3) {
    const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
    const s = Math.min(speed, d * brake);
    steer(p, d > 0.01 ? dx / d * s : 0, d > 0.01 ? dy / d * s : 0, acc, dt);
  }
  function integrate(p, dt, faceVel = true) {
    p.t += dt;
    p.x = clamp(p.x + p.vx * dt, -HX - 2, HX + 2);
    p.y = clamp(p.y + p.vy * dt, -GL - 1, GL + 1.5);
    if (faceVel && Math.hypot(p.vx, p.vy) > 0.6) p.face = Math.atan2(p.vx, p.vy);
  }
  function faceTo(p, x, y) { p.face = Math.atan2(x - p.x, y - p.y); }
  function stopAnim(p, dt, k = 7) {
    const e = Math.exp(-k * dt);
    p.vx *= e; p.vy *= e;
    integrate(p, dt, false);
  }

  // ---------- ボール ----------
  function stepBall(b, dt, sound) {
    b.vz -= G * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (b.z < R) {
      b.z = R;
      if (b.vz < -1.2) {
        b.vz = -b.vz * 0.5;
        b.vx *= 0.8; b.vy *= 0.8;
        b.bounces = (b.bounces || 0) + 1;
        if (sound) Sound.bounce(Math.min(1, b.vz / 4));
      } else {
        b.vz = 0;
        const sp = Math.hypot(b.vx, b.vy);
        const ns = Math.max(0, sp - 3.5 * dt);
        if (sp > 0) { b.vx *= ns / sp; b.vy *= ns / sp; }
        b.bounces = Math.max(1, b.bounces || 0);
      }
    }
  }

  // ボールのこの先の位置(弾んで転がるところまで)
  function predictBall(b, maxT = 3, st = 0.05) {
    const q = { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, bounces: b.bounces };
    const pts = [];
    for (let tt = 0; tt <= maxT; tt += st) {
      pts.push({ t: tt, x: q.x, y: q.y, z: q.z });
      for (let k = 0; k < 4; k++) stepBall(q, st / 4, false);
    }
    return pts;
  }

  // ゴールラインを越えたか(ゴール・枠外)
  function checkGoalLine(prevY) {
    const b = state.ball;
    if (b.holder || b.inNet || !(prevY < GL && b.y >= GL)) return null;
    if (Math.abs(b.x) < GOAL_W - R && b.z < GOAL_H - R) { b.inNet = true; return 'goal'; }
    return 'out';
  }
  // ネットの中: 奥の網で止まる
  function netBall(b) {
    if (!b.inNet) return;
    const back = GL + 2.0 - (b.z / GOAL_H) * 1.0;
    if (b.y > back) {
      b.y = back;
      if (b.vy > 3) Sound.net();
      b.vy = -b.vy * 0.12; b.vx *= 0.4; b.vz *= 0.5;
    }
    if (Math.abs(b.x) > GOAL_W - R) { b.x = Math.sign(b.x) * (GOAL_W - R); b.vx = -b.vx * 0.2; }
    if (b.z > GOAL_H - R) { b.z = GOAL_H - R; b.vz = -Math.abs(b.vz) * 0.2; }
    if (b.y < GL + R) { b.y = GL + R; b.vy = Math.abs(b.vy) * 0.2; }
  }

  // ---------- オフサイドの判定 ----------
  // 後ろから2人目の守備側の選手(GK も数える)。ゴールラインに近い順に並べた 2 番目
  function secondLast() {
    const a = state.actors;
    // 許可なくピッチの外に出た守備側の選手は、ゴールライン上にいるとみなす
    const list = HOME.map((k) => ({ k, y: a[k].off ? GL : a[k].y })).sort((p, q) => q.y - p.y);
    return list[1];
  }

  // その選手がいまオフサイドポジションにいるか
  function inOffsidePos(k) {
    const q = state.actors[k];
    return q.y > 0 && q.y > state.ball.y && q.y - secondLast().y >= LEVEL;
  }

  // ボールが蹴られた瞬間に判定する
  function judge() {
    const p = state.play, a = state.actors, r = a[p.receiver], b = state.ball;
    const sl = secondLast();
    const gap = r.y - sl.y;
    const inOpp = r.y > 0;            // 相手陣内(ハーフウェーラインの上は含まない)
    const ahead = r.y > b.y;          // ボールより前
    const level = Math.abs(gap) < LEVEL;
    const offPos = inOpp && ahead && gap >= LEVEL;
    const exempt = p.noOff === 'throw' || p.noOff === 'goalkick' || p.noOff === 'corner'; // スローイン・ゴールキック・コーナーキックからはオフサイドなし
    let decoyOff = false;
    if (p.decoy) { const d = a[p.decoy]; decoyOff = d.y > 0 && d.y > b.y && d.y - sl.y >= LEVEL; }
    return { recvY: r.y, ballY: b.y, sl, gap, inOpp, ahead, level, offPos, exempt, offence: offPos && !exempt, decoyOff, relT: state.buildT };
  }

  // 少し前の時点のオフサイドライン(受け手はラインの動きを少し遅れて見て、オンサイドの位置を保とうとする)
  function lineAt(tt) {
    const h = state.lHist;
    for (let i = h.length - 1; i >= 0; i--) if (h[i].t <= tt) return h[i].y;
    return h.length ? h[0].y : secondLast().y;
  }

  // ---------- タップ: DF がラインを上げる ----------
  function tapDef(k) {
    const p = state.play;
    if ((state.phase !== 'build' && state.phase !== 'var') || state.paused || !k) return;
    const d = state.actors[k];
    if (!d || d.step || d.off) return;
    // パスのあと(スローモーション中)に押しても、判定はもう終わっている
    const tt = state.phase === 'build' ? state.buildT : state.buildT + state.runT + 0.001;
    d.step = { t: tt, y: Math.min(d.y, p.lineY) - STEP_PAST, done: null };
    d.follow = null;
    state.taps.push({ k, t: tt });
    Sound.step();
    // オフサイドを取る場面で、遅れていない DF を上げた: 減点し、そのスペースへ中盤の選手(7番)が走り込む
    if (!p.noOff && !p.laggers.includes(k) && state.phase === 'build') {
      p.extra.push(k);
      if (!p.gap) p.gap = { k, x: d.x };
    }
  }

  // ---------- 「マーク」: 狙われている選手に体を寄せる ----------
  // オフサイドにならない場面では、これでマークの DF が競り合いに勝つ。押さないとボールばかり見てマークが甘くなる。
  // オフサイドを取る場面では、裏へ走る受け手には追いつけない(ラインを上げるのが正解)
  const markShown = () => state.phase === 'build' || state.phase === 'ready';
  function doMark() {
    if (state.phase !== 'build' || state.paused || state.mark) return;
    state.mark = { t: state.buildT };
    Sound.bump();
  }

  // ---------- パスまで(ビルドアップ) ----------
  function updateBuild(dt) {
    const p = state.play, a = state.actors, b = state.ball;
    const kk = a[p.kicker];
    state.buildT += dt;
    if (bot) { const k = bot(state); if (k === 'mark') doMark(); else if (k) tapDef(k); }
    state.lHist.push({ t: state.buildT, y: secondLast().y });
    if (state.lHist.length > 400) state.lHist.shift();

    // 蹴る人(パサー・スローワー・キッカー)
    if (kk.mode === 'kick') {
      stopAnim(kk, dt, 8);
      if (kk.t >= p.windup) release();
    } else if (kk.mode === 'throw') {
      kk.vx = kk.vy = 0; integrate(kk, dt, false);
      if (state.buildT >= p.Tp) { kk.windT += dt; if (kk.windT >= p.windup) release(); }
    } else {
      const to = kk.cfg.to;
      if (to) {
        const remain = Math.max(0.3, p.Tp - state.buildT);
        const d = Math.hypot(to.x - kk.x, to.y - kk.y);
        moveTo(kk, to.x, to.y, clamp(d / remain, 0, 8), dt, 10);
        integrate(kk, dt);
      } else stopAnim(kk, dt);
      if (state.buildT >= p.Tp) {
        setMode(kk, 'kick'); kk.kickK = 0.17 / p.windup;
        faceTo(kk, a[p.receiver].x, a[p.receiver].y);
      }
    }
    // ドリブル中のボールは足元
    if (!b.holder) {
      b.x = kk.x + Math.sin(kk.face) * 0.6; b.y = kk.y + Math.cos(kk.face) * 0.6; b.z = R;
      b.spinX += Math.hypot(kk.vx, kk.vy) * dt * 5;
    }

    // 相手の他の選手
    for (const k of ['P', 'R', 'R2', 'S', 'ogk']) {
      if (k === p.kicker) continue;
      const q = a[k], c = q.cfg;
      if (k === 'S' && p.gap) {
        // 余計に上げた DF が空けたスペースへ、ラインの手前(オンサイド)から走り込む
        moveTo(q, p.gap.x, Math.min(p.lineY - 3, state.ball.y + 6), 8, dt, 12); integrate(q, dt);
      } else if (c.hold != null) holdLine(q, c.hold, dt);
      else if (c.ownHalf) { moveTo(q, c.laneX, -0.9, 5, dt, 10); integrate(q, dt, false); q.face = 0; }
      else if (c.to) {
        const remain = Math.max(0.3, p.Tp - 0.5 - state.buildT);
        const d = Math.hypot(c.to.x - q.x, c.to.y - q.y);
        moveTo(q, c.to.x, c.to.y, clamp(d / remain, 0, 7.5), dt, 10); integrate(q, dt);
        if (d < 0.5) faceTo(q, b.x, b.y);
      } else if (c.trail) { moveTo(q, kk.x + c.trail.x, kk.y + c.trail.y, 6, dt, 10); integrate(q, dt); }
      else if (c.loiter) {
        moveTo(q, q.home.x + Math.sin(state.time * 0.7 + q.phase) * 1.5, q.home.y + Math.cos(state.time * 0.5 + q.phase) * 0.5, 1.5, dt, 6);
        integrate(q, dt, false); faceTo(q, b.x, b.y);
      } else {
        moveTo(q, q.home.x + Math.sin(state.time * 0.8 + q.phase) * 0.6, q.home.y, 1.5, dt, 6);
        integrate(q, dt, false); faceTo(q, b.x, b.y);
      }
    }
    if (a.ogk.cfg.gkick) faceTo(a.ogk, a.R.x, a.R.y);

    // 自分たち(赤)
    for (const k of HOME) {
      const d = a[k], c = d.cfg;
      if (k === 'gk') {
        moveTo(d, d.home.x + clamp(b.x * 0.05, -1.5, 1.5), d.home.y, 3, dt, 8); integrate(d, dt, false);
        faceTo(d, b.x, b.y); d.crouch = true;
        continue;
      }
      if (d.off) { d.vx = d.vy = 0; integrate(d, dt, false); continue; } // ピッチの外で倒れている
      if (d.step) { doStep(d, dt); continue; }
      if (c.follow || d.follow !== undefined && d.follow) {
        const f = d.follow || c.follow, q = a[f.k];
        let tx = q.x + f.x, ty = q.y + f.y;
        if (loose(k)) {
          // ボールばかり見てマークが甘くなり、受け手から横へ離れる(ボールの通り道からも外れる)
          const v = norm(b.x - q.x, b.y - q.y), sg = q.x > 0 ? -1 : 1;
          tx = q.x - v.y * sg * 2.2; ty = q.y + v.x * sg * 2.2 + 0.4;
        }
        moveTo(d, tx, ty, f.v || 6.5, dt, 14); integrate(d, dt, false);
      } else if (c.press) {
        moveTo(d, kk.x + c.press.x, kk.y + c.press.y, 6.5, dt, 12); integrate(d, dt, false); d.crouch = true;
      } else {
        // ラインを保ちながら、ボールのほうへ少しずつずれる
        moveTo(d, d.home.x + clamp(b.x * 0.12, -3, 3) + Math.sin(state.time * 0.9 + d.phase) * 0.3, d.home.y, 2.5, dt, 8);
        integrate(d, dt, false);
      }
      faceTo(d, b.x, b.y);
    }
    if (state.phase === 'build') state.actors.R.lastHoldY = state.actors.R.y;
  }

  // オフサイドにならない場面で「マーク」を押していない、マーク役の DF
  function loose(k) {
    const p = state.play;
    return !!p.noOff && p.laggers.includes(k) && !state.mark;
  }

  // 受け手: 少し前のラインを見て、そのすぐ手前(オンサイド)に立つ。ラインが上がれば下がる
  function holdLine(q, margin, dt) {
    const p = state.play;
    let ty = lineAt(state.buildT - p.lag) - margin;
    if (state.buildT >= p.Tp + p.windup - 0.15) ty += 3; // パスに合わせて走り出す
    const vy = clamp((ty - q.y) * 3, -p.retreatV, 6.0);
    const vx = clamp(((q.cfg.laneX != null ? q.cfg.laneX : q.x) - q.x) * 1.2, -3, 3);
    steer(q, vx, vy, 12, dt);
    integrate(q, dt, false);
    q.face = vy < -1 ? Math.PI : Math.atan2(state.ball.x - q.x, Math.max(1, state.ball.y - q.y) * 0.3 + 6);
  }

  // タップした DF: ラインの少し前まで駆け上がる
  function doStep(d, dt) {
    const s = d.step;
    if (!s.done && d.y > s.y + 0.05) {
      steer(d, 0, -STEP_V, STEP_ACC, dt);
      integrate(d, dt, false);
      d.face = Math.PI;
      d.crouch = false;
      if (d.y <= s.y + 0.05) s.done = state.buildT + (state.runT || 0);
    } else {
      if (!s.done) s.done = state.buildT + (state.runT || 0);
      stopAnim(d, dt, 6);
    }
  }

  // ---------- パス ----------
  function release() {
    const p = state.play, a = state.actors, b = state.ball, kk = a[p.kicker];
    state.released = true;
    // 余計に上げた DF がいれば、パサーはそのスペースに走り込んだオンサイドの 7 番を選ぶことがある(1 人なら半分、2 人以上なら必ず)
    if (p.gap && p.kicker === 'P' && !p.hands && !inOffsidePos('S') && rng() < (p.extra.length >= 2 ? 1 : 0.5)) {
      p.exploited = p.receiver; p.receiver = 'S';
    }
    const r = a[p.receiver];
    state.judge = judge();
    // 受け手の走る先へ
    const lead = (T) => Math.max(2, RUN_V * T - RUN_V * RUN_V / (2 * RUN_ACC));
    let tx, ty, T, z0 = b.z, zt = R;
    if (p.hands) {
      // 頭の上から投げる(判定はボールが手から離れた地点)
      z0 = 2.25;
      b.holder = null; b.overHead = false;
      b.x = kk.x + Math.sin(kk.face) * 0.3; b.y = kk.y + Math.cos(kk.face) * 0.3; b.z = z0;
      kk.thrown = true; kk.t = 0;
    }
    if (p.passType === 'throw') {
      tx = r.x + 0.4; ty = r.y + 1.5; T = 0.95; zt = 1.8; // 受け手の頭を越えて、マークの DF の頭へ
    } else if (p.passType in AERIAL) {
      // 受け手の頭のすぐ後ろ(マークの DF がいなければ受け手の頭)
      tx = r.x + 0.3; ty = r.y + 0.75; zt = 1.9;
      T = AERIAL[p.passType] || clamp(Math.hypot(tx - b.x, ty - b.y) / 15, 1.1, 1.9);
    } else if (p.passType === 'cutback') {
      tx = r.x + 0.3; ty = r.y + 0.5;
      T = Math.hypot(tx - b.x, ty - b.y) / 18;
    } else {
      // 一番近い DF から離れる向きに、斜めに裏へ走る
      let nd = null;
      for (const k of DEFS) if (!nd || Math.abs(a[k].y - r.y) + Math.abs(a[k].x - r.x) < Math.abs(nd.y - r.y) + Math.abs(nd.x - r.x)) nd = a[k];
      const away = Math.sign(r.x - nd.x) || (r.x > 0 ? -1 : 1);
      const side = p.passType === 'through' ? 0.3 : p.noOff ? 0 : 0.1;
      const dir = norm(Math.abs(r.x) > HX - 8 ? -Math.sign(r.x) * side : away * side, 1);
      T = p.passType === 'long' ? (p.noOff === 'ownHalf' ? 3.0 : 2.2) : p.passType === 'fk' ? 1.25 : 1.1;
      if (p.passType === 'fk') zt = 1.5;
      for (let k = 0; k < 3; k++) {
        const L = lead(T);
        tx = r.x + dir.x * L; ty = r.y + dir.y * L;
        if (p.passType === 'through') T = clamp(Math.hypot(tx - b.x, ty - b.y) / 17, 0.8, 1.6);
      }
      ty = Math.min(ty, GL - 7); tx = clamp(tx, -HX + 3, HX - 3);
    }
    b.vx = (tx - b.x) / T; b.vy = (ty - b.y) / T; b.vz = (zt - z0 + 0.5 * G * T * T) / T;
    b.still = false; b.bounces = 0;
    if (!p.hands) { kk.t = 0.17; kk.kickK = 1; Sound.kick(p.passType === 'cutback' ? 0.7 : 1); } else Sound.bump();
    state.pass = { x: tx, y: ty, T };
    r.recvGo = { x: tx, y: ty };
    state.phase = 'var';
    state.phaseT = 0;
    state.varReal = 0;
    state.runT = 0;
    Sound.whoosh();
  }

  // ---------- パスのあと(走り合い・旗) ----------
  // DF・GK は、自分が間に合うボールの通り道の一番手前の点へ走る
  function interceptPoint(q, path, speed, reachZ) {
    for (const s of path) {
      if (s.z > reachZ) continue;
      const d = Math.hypot(s.x - q.x, s.y - q.y) - 0.6;
      if (d <= speed * s.t * 0.85) return s;
    }
    const s = path[path.length - 1];
    return s;
  }

  function updateRun(dt) {
    const p = state.play, a = state.actors, b = state.ball, J = state.judge;
    state.runT += dt;
    const rt = state.runT;
    const path = predictBall(b, 3, 0.05);
    const r = a[p.receiver];

    // 受け手
    if (state.phase !== 'result') {
      let gx = r.recvGo.x, gy = r.recvGo.y;
      if (b.bounces > 0 || rt > state.pass.T - 0.25) { gx = b.x + b.vx * 0.12; gy = b.y + b.vy * 0.12; }
      // 待っている受け手(スローイン・ゴールキック)は、マークの DF と押し合いながらボールを待つ
      if (r.cfg.stay === 'still' || (r.cfg.stay && rt < state.pass.T - 0.6)) { gx = r.x; gy = r.y; }
      const v = r.cfg.stay ? 3.5 : RUN_V;
      moveTo(r, gx, gy, v, dt, RUN_ACC); integrate(r, dt);
    } else stopAnim(r, dt, 4);
    // 他の相手は前へ流れる
    for (const k of ['P', 'R2', 'S']) {
      if (k === p.receiver) continue;
      const q = a[k];
      if (state.phase === 'result') { stopAnim(q, dt, 4); continue; }
      moveTo(q, q.x + (b.x - q.x) * 0.05, q.y + 3, 3.5, dt, 8); integrate(q, dt);
    }
    stopAnim(a.ogk, dt, 4);

    // 自分たち
    for (const k of HOME) {
      if (state.actors[k].off) continue; // ピッチの外で倒れている
      const d = a[k];
      if (state.phase === 'result') { stopAnim(d, dt, 5); continue; }
      if (k === 'gk') {
        const inBox = Math.abs(state.pass.x) < PEN_X - 4 && state.pass.y > GL - 12;
        if (inBox && rt > GK_REACT && !J.offence) {
          const s = interceptPoint(d, path, GK_V, 2.5);
          moveTo(d, s.x, s.y, GK_V, dt, 12); integrate(d, dt, false);
        } else stopAnim(d, dt, 6);
        faceTo(d, b.x, b.y); d.crouch = true;
        continue;
      }
      if (J.offence) { stopAnim(d, dt, 5); faceTo(d, b.x, b.y); continue; } // オフサイド: 追わずに旗を待つ
      if (d.step) {
        // ラインを上げた DF は止まって手を挙げ、オフサイドをアピールする(オンサイドなら置き去り)
        if (!d.step.done && rt < HOME_REACT) { doStep(d, dt); continue; }
        if (d.mode !== 'appeal') setMode(d, 'appeal');
        stopAnim(d, dt, 6); faceTo(d, b.x, b.y);
        continue;
      }
      if (d.react == null) d.react = HOME_REACT + (state.pass.y > d.y + 2 ? TURN_T : 0) + (loose(k) ? Math.max(0.8, state.pass.T - 0.4) : 0); // マークが甘いと、ボールが落ちてくる直前まで気づかない
      // スローイン・ゴールキックの競り合いはマークの DF だけ。ほかはラインを保ってこぼれ球に備える
      const contest = !a[p.receiver].cfg.stay || (d.cfg.follow && d.cfg.follow.k === p.receiver);
      if (rt < d.react || !contest) { stopAnim(d, dt, 6); faceTo(d, b.x, b.y); continue; }
      const guard = p.noOff && p.laggers.includes(k) && !loose(k); // 体を寄せた DF はジャンプして頭で競る
      const s = interceptPoint(d, path, HOME_V, guard ? 2.6 : 1.9);
      moveTo(d, s.x, s.y, HOME_V, dt, HOME_ACC, 8); integrate(d, dt);
    }
    separate(r);

    // 審判・副審
    updateOfficials(dt);

    // ボール
    const prevY = b.y;
    stepBall(b, dt, true);
    b.spinX += Math.hypot(b.vx, b.vy, b.vz) * dt * 5;
    netBall(b);
    if (state.phase === 'result') return;
    if (checkGoalLine(prevY) || Math.abs(b.x) > HX + 0.5 || b.y < -GL) { state.clearedBy = 'out'; resolve('clear'); return; }

    // 誰が先にボールに触るか
    let best = null, bd = Infinity;
    const cand = (k, reach, zmax) => {
      const q = a[k], d = Math.hypot(b.x - q.x, b.y - q.y);
      if (d < reach && b.z < zmax && d < bd) { bd = d; best = k; }
    };
    if (rt > 0.12) cand(p.receiver, 0.85, 2.0);
    for (const k of [...DEFS, 'gk']) {
      if (state.actors[k].off) continue; // ピッチの外で倒れている
      const d = a[k];
      if (k === 'gk') {
        if (rt > GK_REACT && !J.offence && b.y > GL - PEN_D && Math.abs(b.x) < PEN_X) cand(k, 0.95, 2.6);
        continue;
      }
      if (d.react == null || rt < d.react || d.step || J.offence) continue;
      // オフサイドにならない場面でカバーに残った DF は、体を入れて競り合いに勝つ
      if (p.noOff && p.laggers.includes(k) && !loose(k) && Math.hypot(b.x - d.x, b.y - d.y) < 1.6 && b.z < 2.6) { best = k; bd = -1; continue; }
      cand(k, b.z < 0.6 ? 0.95 : 0.75, 2.0);
    }
    // オフサイドポジションの受け手がボールに向かってプレーしようとした(関与した)ら旗
    if (J.offence && !best && (Math.hypot(b.x - r.x, b.y - r.y) < 2.2 || rt > state.pass.T + 0.4)) best = p.receiver;
    if (best === p.receiver) {
      if (J.offence) resolve('offside');
      else { state.phase = 'attack'; state.phaseT = 0; b.vx = r.vx; b.vy = r.vy; b.vz = 0; b.z = R; Sound.kick(0.4); }
    } else if (best === 'gk') {
      b.holder = 'gk'; b.vx = b.vy = b.vz = 0;
      setMode(a.gk, b.z > 1.3 ? 'catch' : 'hold');
      Sound.grab();
      resolve('catch');
    } else if (best) {
      clearBall(a[best]);
      state.clearedBy = best;
      resolve('clear');
    }
    if (state.phase === 'run' && rt > 6) { state.clearedBy = 'timeout'; resolve('clear'); }
  }

  // 受け手と DF が重ならないように押し合う
  function separate(r) {
    for (const k of HOME) {
      if (state.actors[k].off) continue; // ピッチの外で倒れている
      const d = state.actors[k];
      const dx = d.x - r.x, dy = d.y - r.y, dd = Math.hypot(dx, dy);
      if (dd > 0.01 && dd < 0.7) {
        const push = (0.7 - dd) / 2;
        d.x += dx / dd * push; d.y += dy / dd * push;
        r.x -= dx / dd * push; r.y -= dy / dd * push;
      }
    }
  }

  function clearBall(d) {
    const b = state.ball;
    const out = norm(Math.sign(b.x || 1) * 0.8 + (rng() - 0.5) * 0.4, -1);
    b.vx = out.x * 18; b.vy = out.y * 18; b.vz = b.z > 1.3 ? 6 : 8;
    if (b.z > 1.3) { Sound.header(); setMode(d, 'head'); d.jump = 0.3; d.jumpT = 0.55; }
    else { Sound.kick(0.8); setMode(d, 'kick'); }
  }

  // 抜け出した受け手がゴールへ運んでシュート
  function updateAttack(dt) {
    const p = state.play, a = state.actors, b = state.ball, r = a[p.receiver], gk = a.gk;
    state.runT += dt;
    if (!state.shot) {
      const tx = clamp(r.x * 0.5, -8, 8), ty = GL - 11;
      moveTo(r, tx, ty, 8.2, dt, RUN_ACC); integrate(r, dt);
      b.x = r.x + Math.sin(r.face) * 0.7; b.y = r.y + Math.cos(r.face) * 0.7; b.z = R;
      b.spinX += 8.2 * dt * 5;
      if (r.y >= GL - 13.5 || state.phaseT > 2.4) shoot();
    } else stopAnim(r, dt, 3);
    // キーパーはシュートコースを狭めに出る
    if (gk.mode !== 'dive') {
      const g = norm(b.x, b.y - GL);
      moveTo(gk, g.x * 3, GL + g.y * 3, 4, dt, 10); integrate(gk, dt, false); faceTo(gk, b.x, b.y); gk.crouch = true;
    } else if (gk.t < 0.55) integrate(gk, dt, false); else stopAnim(gk, dt, 6);
    for (const k of HOME) {
      if (state.actors[k].off) continue; // ピッチの外で倒れている
      if (k === 'gk') continue;
      const d = a[k];
      if (d.step) { stopAnim(d, dt, 6); continue; }
      moveTo(d, r.x, r.y - 1, HOME_V, dt, HOME_ACC); integrate(d, dt);
    }
    for (const k of ['P', 'R2', 'S']) { const q = a[k]; moveTo(q, q.x, q.y + 3, 4, dt, 8); integrate(q, dt); }
    updateOfficials(dt);
    if (state.shot) {
      const prevY = b.y;
      for (let i = 0; i < 3; i++) { stepBall(b, dt / 3, true); netBall(b); }
      const res = checkGoalLine(prevY);
      if (res === 'goal' || b.inNet) { state.goalHow = 'net'; resolve('goal'); }
      else if (res === 'out' || state.phaseT > 4) { state.goalHow = res || 'timeout'; resolve('goal'); }
    }
  }

  function shoot() {
    const a = state.actors, b = state.ball, r = a[state.play.receiver], gk = a.gk;
    state.shot = true;
    const side = gk.x > 0 ? -1 : 1;
    const cx = side * (GOAL_W - 0.7), cz = rand(0.4, 1.3);
    const dist = Math.hypot(cx - b.x, GL - b.y), T = dist / 24;
    b.vx = (cx - b.x) / T; b.vy = (GL - b.y) / T; b.vz = (cz - b.z + 0.5 * G * T * T) / T;
    setMode(r, 'kick');
    Sound.kick(1);
    setMode(gk, 'dive');
    gk.vx = side * 2.6; gk.vy = 0; gk.diveX = side; gk.diveY = 0; gk.diveZ = 0.5;
    gk.face = Math.PI;
  }

  // 審判: ボールの後ろ斜めからついていく。副審: 奥のタッチラインで後ろから2人目の守備者の高さを保つ
  function updateOfficials(dt) {
    const a = state.actors, b = state.ball, ar = a.ar, ref = a.ref;
    if (ar.mode !== 'flag') {
      const ly = state.released ? Math.max(state.judge.sl.y, b.y) : secondLast().y;
      moveTo(ar, -HX - 1.1, clamp(ly, -GL, GL), 7.5, dt, 14); integrate(ar, dt, false);
      ar.face = Math.PI / 2;
    } else stopAnim(ar, dt);
    if (ref.mode === 'run') {
      moveTo(ref, clamp(b.x * 0.3 + 10, -HX + 3, HX - 3), clamp(b.y - 10, -GL + 5, GL - 8), 6, dt, 8);
      integrate(ref, dt);
      if (Math.hypot(ref.vx, ref.vy) < 0.6) faceTo(ref, b.x, b.y);
    } else stopAnim(ref, dt);
  }

  // ---------- 結果 ----------
  function who(k) {
    if (k === 'gk') return t('who.gk');
    return t('who.num', { n: NUM[k] });
  }
  // 上げる必要があった DF(遅れていた DF)
  function needList() {
    return state.play.laggers.map(who).join(t('who.join'));
  }
  function fmtGap(g) {
    g = Math.abs(g);
    return g < 1 ? Math.round(g * 100) + 'cm' : g.toFixed(1) + 'm';
  }

  function resolve(kind) {
    if (state.phase === 'result') return;
    const p = state.play, a = state.actors, J = state.judge;
    const ok = kind !== 'goal';
    const lines = explain(kind);
    let pts = 0, big = false;
    if (ok) {
      state.ok++;
      state.streak++;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      const sb = Math.min(state.streak - 1, 5) * 100;
      if (kind === 'offside') {
        state.traps++;
        // タイミング: ラインを上げ終わるタップがパスの直前ほど高得点
        const taps = state.taps.filter((q) => q.t <= J.relT);
        const lastTap = taps.length ? Math.max(...taps.map((q) => q.t)) : J.relT - 2;
        const dtTap = J.relT - lastTap;
        const bonus = Math.round(clamp(1 - Math.max(0, dtTap - 0.35) / 1.0, 0, 1) * 300);
        big = dtTap <= 0.7;
        // 上げる必要のない DF を上げたぶんは減点
        const pen = p.extra.length * EXTRA_PEN;
        pts = Math.max(100, 1000 + bonus + sb - pen);
        popup(t('res.offside'), '#ffe14d', 64);
        if (pen) popup(t('res.extra', { c: p.extra.length, p: pen }), '#ff8a65', 26, 0.25);
        if (big) popup(t('res.just'), '#7dffb0', 30, 0.2);
        a.ar.mode = 'flag'; a.ar.t = 0;
        Sound.beep();
        setTimeout(() => Sound.whistle(0.5), 350);
        setMode(a.ref, 'appeal'); // 間接フリーキックの合図(片手を挙げる)
        for (const k of DEFS) if (a[k].step) setMode(a[k], 'appeal');
        const r = a[p.receiver]; r.vx *= 0.2; r.vy *= 0.2; setMode(r, 'sad');
        const b = state.ball; b.vx *= 0.15; b.vy *= 0.15; b.vz = 0; b.z = R;
      } else {
        pts = (p.noOff && state.mark && !state.taps.length ? 1000 : 600) + sb; // 「マーク」で守ったらオフサイドと同じ 1000 点
        popup(t(kind === 'catch' ? 'res.catch' : 'res.clear'), '#ffe14d', 56);
        if (p.noOff && state.mark && !state.taps.length) { popup(t('res.read'), '#7dffb0', 30, 0.2); big = true; }
        Sound.whistle(0.3);
      }
      // ナビを使わずに守ったら 1.5 倍(そのプレーのビルドアップ中に一度でもナビが ON なら付かない)
      if (!p.navSeen) { pts = Math.round(pts * NO_NAV_K); popup(t('res.noNav', { k: NO_NAV_K }), '#ffcc80', 24, 0.3); }
      state.score += pts;
      popup('+' + pts, '#9fe8ff', 26, 0.4);
      Sound.cheer(big ? 1.5 : 1.2, big ? 4.5 : 3.5);
      const milestone = state.streak % 3 === 0;
      let n = kind === 'offside' ? (big ? 6 : 4) : 3;
      if (milestone) { n += 4; popup(t('streak', { n: state.streak }), '#ff8a65', 32, 0.55); }
      fireworks(n, big);
    } else {
      state.streak = 0;
      popup(t('res.goal'), '#ff6b6b', 56, 0, 2.6);
      Sound.sigh(1.2);
      setMode(a[p.receiver], 'celebrate');
      for (const k of DEFS) if (!a[k].off) setMode(a[k], 'sad');
      setTimeout(() => Sound.whistle(0.3), 300);
    }
    state.lastResult = { ok, kind, lines };
    if (!ok) offerRedo();
    state.msg = null;
    state.phase = 'result';
    state.phaseT = 0;
  }

  // 解説(結果画面の下に出す 1〜2 行)
  function explain(kind) {
    const p = state.play, a = state.actors, J = state.judge;
    const n = NUM[p.receiver];
    const d = J ? who(J.sl.k) : '';
    const out = [];
    const tapped = (k) => !!a[k].step;
    if (kind === 'offside') {
      out.push(t('why.offside', { n, d, g: fmtGap(J.gap) }));
      if (p.extra.length) { out.push(t('why.extra', { need: needList(), c: p.extra.length, p: p.extra.length * EXTRA_PEN })); return out; }
      out.push(t(({ fk: 'why.fk', long: 'why.long', gkout: 'why.gkCounted', gkthrow: 'why.gkthrow' })[p.kind] || 'why.flag'));
      return out;
    }
    if (p.noOff) {
      out.push(t('why.' + p.noOff, { n }));
      if (kind === 'goal' && state.taps.length) out.push(t('why.markNg'));
      else if (kind === 'goal') out.push(t('why.loose'));
      else if (state.mark && !state.taps.length) out.push(t('why.markOk'));
      else out.push(t('why.cleared'));
      return out;
    }
    if (kind !== 'goal') { out.push(t('why.cleared')); return out; }
    if (state.mark && !state.taps.length) { out.push(t('why.markUseless', { n })); return out; }
    if (p.exploited) {
      // 余計に上げた DF の裏を 7 番に突かれた(9 番はオフサイドポジションでも、関わっていないので反則ではない)
      out.push(t('why.exploit', { d: who(p.gap.k), n, need: needList() }));
      out.push(t('why.passive', { n: NUM[p.exploited] }));
      return out;
    }
    if (J.level) out.push(t('why.level'));
    else if (J.sl.k === 'gk') {
      const cover = p.laggers.find((k) => !tapped(k)) || p.laggers[0];
      out.push(t('why.stayedGk', { d: who(cover) }));
    } else if (tapped(J.sl.k)) {
      out.push(t(a[J.sl.k].step.t > J.relT ? 'why.afterPass' : 'why.late'));
    } else if (p.laggers.some((k) => tapped(k) && a[k].step.t > J.relT)) {
      out.push(t('why.afterPass'));
    } else if (p.laggers.includes(J.sl.k) || !state.taps.length) {
      out.push(t('why.stayed', { n, d }));
    } else {
      out.push(t('why.early', { n }));
    }
    if (p.decoy && J.decoyOff) out.push(t('why.passive', { n: NUM[p.decoy] }));
    return out;
  }

  function fireworks(n, big, gap = 0.28) {
    for (let i = 0; i < n; i++) {
      const tt = 0.1 + i * gap + Math.random() * 0.15;
      Scene3D.firework(tt, big);
      Sound.launch(tt);
      Sound.boom(tt + Scene3D.ROCKET_T);
    }
  }

  function popup(text, color, size, delay = 0, life = 1.8) {
    state.popups.push({ text, color, size, t: -delay, life, idx: state.popups.length });
  }

  // 結果が出たあとの選手(喜ぶ・うなだれる・止まる)
  function updateResult(dt) {
    const a = state.actors, b = state.ball, res = state.lastResult;
    for (const [k, q] of Object.entries(a)) {
      if (k === 'ar' || k === 'ref') continue;
      if (q.mode === 'head' && q.t > 0.6) setMode(q, 'run');
      if (q.mode === 'kick' && q.t > 0.6) setMode(q, 'run');
      if (q.mode === 'dive') { if (q.t < 0.55) integrate(q, dt, false); else stopAnim(q, dt, 6); continue; }
      stopAnim(q, dt, 4);
    }
    if (res && res.kind === 'catch' && a.gk.mode === 'catch' && a.gk.t > 0.5) setMode(a.gk, 'hold');
    updateOfficials(dt);
    if (!b.holder) {
      const prevY = b.y;
      stepBall(b, dt, false); netBall(b);
      checkGoalLine(prevY);
    }
  }

  // スマホは横画面で遊ぶ。縦向きの間は案内を出して一時停止する
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const portraitMQ = window.matchMedia('(orientation: portrait)');
  const isPortrait = () => isTouch && portraitMQ.matches;

  // スタートのタップで全画面+横向き固定を試す(Android Chrome など。iPhone は非対応なので何もしない)
  function goLandscape() {
    if (!isTouch) return;
    const el = document.documentElement;
    const lock = () => {
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    };
    try {
      if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(lock, () => {});
      else lock();
    } catch (e) { /* 非対応 */ }
  }
  canvas.addEventListener('pointerup', () => { if (state.phase === 'title' || state.phase === 'over') goLandscape(); });

  function togglePause() {
    if (state.phase === 'title' || state.phase === 'over') return;
    if (state.paused) resumeFromPause(); else state.paused = true;
  }

  // ---------- 更新 ----------
  function update(dt) {
    state.time += dt;
    if (state.phase === 'title') {
      if (pressed.start && rulesEl.hidden && howtoEl.hidden) { pressed.start = false; retry(); } // プレイする前に全画面広告
      pressed.start = false;
      return;
    }
    if (state.phase === 'over') {
      state.overT += dt;
      if (pressed.start && state.overT > 1.0) { pressed.start = false; retry(); }
      pressed.start = false;
      return;
    }
    pressed.start = false;
    if (isPortrait()) { if (!state.paused) state.paused = true; return; }
    if (state.paused) { pressed.next = false; return; }
    updateRedo(dt);
    if (state.nav && state.phase === 'build') { state.navUsed = true; state.play.navSeen = true; }

    // パスの瞬間はスローモーション(判定のラインを見せる)
    let sdt = dt;
    if (state.phase === 'var') {
      state.varReal += dt;
      sdt = dt * VAR_K;
      if (state.varReal >= VAR_T) { state.phase = 'run'; state.phaseT = 0; }
    }
    state.phaseT += sdt;

    if (state.phase === 'ready') {
      updateBuildIdle(dt);
      if (state.phaseT >= READY_T) { // 場面の表示が消えきってから始める
        state.phase = 'build';
        state.phaseT = 0;
        state.msg = { key: isTouch ? 'msg.build' : 'msg.build.key', t: 0 };
        Sound.whistle(0.35);
      }
    } else if (state.phase === 'build') {
      updateBuild(dt);
      updateOfficials(dt);
    } else if (state.phase === 'var' || state.phase === 'run') {
      updateRun(sdt);
    } else if (state.phase === 'attack') {
      updateAttack(sdt);
    } else if (state.phase === 'result') {
      updateResult(dt);
    }
    if (state.msg) state.msg.t += dt;

    updateGuide();
    updateView();

    for (const pp of state.popups) pp.t += dt;
    state.popups = state.popups.filter((pp) => pp.t < pp.life);

    if (state.phase === 'result') {
      const minT = 1.2, maxT = state.lastResult.ok ? 5.5 : 6;
      const waitRedo = redo.active || redo.pending > 0; // 「広告を見てやり直す」を出している間は進めない
      if (!waitRedo && ((pressed.next && state.phaseT >= minT) || state.phaseT >= maxT || (bot && state.phaseT >= 2))) {
        state.index++;
        if (state.index >= TOTAL) gameOver();
        else startPlay();
      }
    }
    pressed.next = false;
  }

  // 「◯プレー目」の表示中: 選手はその場で軽く動くだけ
  function updateBuildIdle(dt) {
    for (const q of Object.values(state.actors)) { q.vx = q.vy = 0; integrate(q, dt, false); }
    const a = state.actors;
    a.ar.y = secondLast().y;
  }

  // ナビ: オフサイドライン(赤)・ラインを決めている DF(黄色の輪)・パスの合図(オレンジの輪)
  function updateGuide() {
    const p = state.play, a = state.actors, J = state.judge;
    const g = { rings: [], lines: [] };
    state.guide = g;
    state.passCue = false;
    if (!p) return;
    // ナビは答えではなく手がかり: 今のオフサイドライン(後ろから2人目の守備者)だけを引く。どの DF か・どうするかは自分で判断する
    if ((state.phase === 'build' || state.phase === 'ready') && state.nav) {
      const sl = secondLast();
      g.lines.push({ y: sl.y, color: 0xff4040, opacity: 0.7 });
    }
    if (state.phase === 'build' && state.nav) {
      const kk = a[p.kicker];
      const relAt = p.Tp + p.windup;
      // キーパーの後ろの DF は遠くから上がるので、合図を早めに出す
      if (state.buildT >= relAt - (p.kind === 'gkout' ? 1.5 : 1.0)) {
        state.passCue = true;
        g.rings.push({ x: kk.x, y: kk.y, color: 0xff9a3c, pulse: true, r: 1.3 });
      }
    }
    if (state.mark && p.noOff && (state.phase === 'build' || state.phase === 'var')) for (const k of p.laggers) if (!a[k].step) g.rings.push({ x: a[k].x, y: a[k].y, color: 0x7fe3ff, r: 0.9, opacity: 0.8 });
    for (const k of DEFS) if (a[k].step && (state.phase === 'build' || state.phase === 'var')) g.rings.push({ x: a[k].x, y: a[k].y, color: 0xffe14d, r: 0.8, opacity: 0.6 });
    // パスの瞬間とそのあと: 判定に使った 2 本の線(赤 = 後ろから2人目の守備者、青 = 受け手)
    if (J && !J.exempt && (state.phase === 'var' || state.phase === 'run' || state.phase === 'attack' || state.phase === 'result')) {
      g.lines.push({ y: J.sl.y, color: 0xff3b3b, w: 1.4 });
      g.lines.push({ y: J.recvY, color: J.offence ? 0xffe14d : 0x40c4ff, w: 1.4 });
    }
  }

  // カメラ: テレビ中継のようにメインスタンドの上から、守備ラインを横から見る(画面の右が守るゴール)
  function updateView() {
    const p = state.play, a = state.actors, b = state.ball, J = state.judge;
    let cy, back = 38, h = 21, pitch = -0.52, turn = 4, fov = 50;
    if (state.phase === 'build' || state.phase === 'ready') {
      const kk = a[p.kicker];
      const lo = Math.min(kk.y, p.lineY), hi = Math.max(kk.y, p.lineY + 6);
      const span = hi - lo;
      cy = (lo + hi) / 2;
      // 離れた場面は少し引いて、それ以上は画角を広げる(引きすぎるとカメラがスタンドの屋根に入って画面が暗くなる)
      const extra = Math.max(0, span - 30);
      back += Math.min(extra * 0.7, 10);
      h += Math.min(extra * 0.28, 4);
      fov = clamp(50 + Math.max(0, extra - 14) * 0.45, 50, 66);
    } else if (state.phase === 'var') {
      // 判定の瞬間は、副審のようにラインの真横へ
      cy = (J.sl.y + J.recvY) / 2;
      back = 36; h = 23; pitch = -0.6; // 客席を画面に残して、上に判定を出せるようにする
    } else {
      cy = b.y;
      if (state.phase === 'result' && J && state.lastResult && state.lastResult.kind === 'offside') cy = (J.sl.y + J.recvY) / 2;
    }
    cy = clamp(cy, -GL + 18, GL - 14);
    // 奥のタッチライン沿いの場面(スローイン・サイド突破)は、カメラを奥へ寄せる
    const vx = p && (p.kind === 'throw' || p.kind === 'cutback' || p.kind === 'corner') && state.phase !== 'attack' ? -11 : 0;
    // スマホは画面が小さいので、プレーに関わる選手とボールが収まるところまでズームする
    if (isTouch && p && state.phase !== 'title') {
      // スタンドの中段(屋根より下)まで下がって望遠で撮る: 奥の選手も大きく映り、手前との大きさの差も小さい
      back = 52 - vx * 0.3; h = 25;
      const f = zoomFrame(framePoints(), vx + back, h);
      if (f) { cy = f.y; pitch = f.pitch; fov = f.fov; }
    }
    state.view = { x: vx, y: cy, fx: -1, fy: 0, back, h, pitch, turn, fov, cut: !!state.viewCut };
    state.viewCut = false;
  }

  // ズームで画面に入れる点(選手は頭の上のバッジのぶん高めに)
  function framePoints() {
    const p = state.play, a = state.actors, b = state.ball, J = state.judge;
    const pts = [];
    const add = (q, z = 2.0) => { if (q) { pts.push({ x: q.x, y: q.y, z: 0 }, { x: q.x, y: q.y, z }); } };
    const ball = () => pts.push({ x: b.x, y: b.y, z: b.z });
    if (state.phase === 'build' || state.phase === 'ready') {
      for (const k of DEFS) if (!a[k].off) add(a[k], 2.8);
      add(a[p.kicker]); add(a[p.receiver]); ball();
    } else if (state.phase === 'var') {
      add(a[J.sl.k]); add(a[p.receiver]);
      for (const k of DEFS) if (!a[k].off) add(a[k]);
    } else if (state.phase === 'result' && J && state.lastResult && state.lastResult.kind === 'offside') {
      add(a[J.sl.k]); add(a[p.receiver]); add(a.ar, 2.6);
    } else {
      add(a[p.receiver]); ball();
      if (b.y > GL - 25) { add(a.gk); pts.push({ x: -GOAL_W, y: GL, z: GOAL_H }, { x: GOAL_W, y: GL, z: 0 }); }
    }
    return pts;
  }

  // 点が全部入る、いちばん狭い画角(ズーム)とカメラの向き。上の成績と下の案内に隠れないよう余白をとる
  function zoomFrame(pts, camX, h) {
    if (!pts.length) return null;
    const ys = pts.map((q) => q.y);
    const cy = clamp((Math.min(...ys) + Math.max(...ys)) / 2, -GL + 18, GL - 14);
    let elMin = Infinity, elMax = -Infinity, tanH = 0;
    for (const q of pts) {
      const dist = Math.max(4, camX - q.x);
      const el = Math.atan2(q.z - h, Math.hypot(dist, q.y - cy));
      elMin = Math.min(elMin, el); elMax = Math.max(elMax, el);
      tanH = Math.max(tanH, Math.abs(q.y - cy) / dist);
    }
    const USE = 0.66;                         // 画面の縦のうち、選手を映す割合(上下は成績・案内・ボタン)
    const vfovV = (elMax - elMin) / USE;
    const vfovH = 2 * Math.atan(tanH * 1.12 / (W / H));
    const fov = clamp(Math.max(vfovV, vfovH) * 180 / Math.PI, 26, 66);
    // 上の成績のほうが下の案内より大きいので、選手は少し下寄りに映す
    const pitch = (elMin + elMax) / 2 + fov * Math.PI / 180 * 0.04;
    return { y: cy, pitch, fov };
  }

  function gameOver() {
    state.phase = 'over';
    state.overT = 0;
    state.popups = [];
    const best = state.best;
    if (!best || state.ok > best.ok || (state.ok === best.ok && state.score > best.score)) {
      state.best = { ok: state.ok, score: state.score };
      state.newRecord = true;
      saveBest(state.best);
    }
    const perfect = state.ok === TOTAL;
    Sound.whistle(0.5);
    setTimeout(() => Sound.whistle(0.5), 600);
    setTimeout(() => Sound.whistle(1.2), 1200);
    Sound.cheer(perfect ? 1.6 : 0.9, perfect ? 6 : 3);
    if (perfect) fireworks(16, true, 0.35); else if (state.ok >= 7) fireworks(6, false, 0.4);
  }

  // ---------- 描画(2D オーバーレイ) ----------
  // ミニマップ(ピッチ全体を上から。画面と同じく右が守るゴール、上が奥のタッチライン)
  function drawMinimap() {
    const mw = 180, mh = 117, mx = W - mw - 12, my = 12;
    const tx = (y) => mx + (y + GL) / (GL * 2) * mw, ty = (x) => my + (x + HX) / (HX * 2) * mh;
    ctx.save();
    ctx.fillStyle = '#3c8a3f';
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1;
    ctx.strokeRect(mx, my, mw, mh);
    ctx.beginPath(); ctx.moveTo(tx(0), my); ctx.lineTo(tx(0), my + mh); ctx.stroke();
    ctx.beginPath(); ctx.arc(tx(0), ty(0), 9.15 / (GL * 2) * mw, 0, Math.PI * 2); ctx.stroke();
    for (const s of [-1, 1]) {
      const x0 = tx(s * GL), x1 = tx(s * (GL - PEN_D));
      ctx.strokeRect(Math.min(x0, x1), ty(-PEN_X), Math.abs(x1 - x0), ty(PEN_X) - ty(-PEN_X));
    }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(tx(GL) - 1, ty(-GOAL_W)); ctx.lineTo(tx(GL) - 1, ty(GOAL_W)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx(-GL) + 1, ty(-GOAL_W)); ctx.lineTo(tx(-GL) + 1, ty(GOAL_W)); ctx.stroke();
    const g = state.guide;
    if (g) {
      for (const l of g.lines) {
        ctx.strokeStyle = '#' + l.color.toString(16).padStart(6, '0'); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(tx(l.y), my); ctx.lineTo(tx(l.y), my + mh); ctx.stroke();
      }
    }
    const a = state.actors;
    for (const [k, p] of Object.entries(a)) {
      const col = k === 'ref' ? '#222' : k === 'ar' ? '#ffd400' : k === 'gk' ? '#ff9800' : k === 'ogk' ? '#2fbf4a' : HOME.includes(k) ? '#ff5a5a' : '#4f7cff';
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(tx(p.y), ty(p.x), 2.6, 0, Math.PI * 2); ctx.fill();
      if (DEFS.includes(k) && p.step) { ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    const b = state.ball;
    if (b) {
      const h = b.holder && a[b.holder];
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(tx(h ? h.y : b.y), ty(h ? h.x : b.x), 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawHUD() {
    // スマホは画面が小さいので、左上の成績をまとめて大きくする
    ctx.save();
    if (isTouch) ctx.scale(HUD_K, HUD_K);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(12, 12, 290, 92);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(t('hud.play', { n: Math.min(state.index + 1, TOTAL), t: TOTAL }), 24, 40, 270);
    ctx.font = 'bold 16px sans-serif';
    let hx = 24;
    for (const [key, n, col] of [['hud.ok', state.ok, '#ffe14d'], ['hud.trap', state.traps, '#9fe8ff'], ['hud.streak', state.streak, '#ff8a65']]) {
      const label = t(key, { n });
      ctx.fillStyle = col;
      ctx.fillText(label, hx, 64);
      hx += Math.max(70, ctx.measureText(label).width + 12);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`SCORE ${state.score}`, 24, 88);

    ctx.fillStyle = 'rgba(208,16,46,0.88)';
    ctx.fillRect(312, 12, 130, 34);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(t('hud.me'), 320, 35, 116);
    ctx.restore();
  }

  // DF の頭の上のバッジ(タップすると前に出る)。重ならないよう縦にずらす
  function layoutBadges() {
    const a = state.actors, r = isTouch ? 34 : 26;
    const list = [];
    for (const k of DEFS) {
      const d = a[k];
      if (d.off) continue;
      const head = Scene3D.project(d.x, d.y, 1.95), foot = Scene3D.project(d.x, d.y, 0);
      if (head.behind) continue;
      list.push({ k, x: head.x, y: head.y - r - 14, hx: head.x, hy: head.y, fy: foot.y, r });
    }
    list.sort((p, q) => p.y - q.y);
    for (let i = 1; i < list.length; i++) {
      for (let j = 0; j < i; j++) {
        const p = list[j], q = list[i];
        if (Math.abs(p.x - q.x) < r * 2 + 4 && q.y - p.y < r * 2 + 4) q.y = p.y + r * 2 + 4;
      }
    }
    // 下の案内の帯に重ならないように
    for (const q of list) { q.x = clamp(q.x, r + 4, W - r - 4); q.y = clamp(q.y, r + 4, H - (isTouch ? 116 : 96) - r); }
    // 「マーク」ボタンに重なるバッジは左へずらす
    for (const q of list) if (Math.hypot(q.x - MARKBTN.x, q.y - MARKBTN.y) < r + MARKBTN.r + 6) q.x = MARKBTN.x - MARKBTN.r - r - 8;
    state.badges = list;
  }

  function drawBadges() {
    // スローモーション中は VAR の表示と重なるので出さない(押す場所だけ残す。パスのあとに押しても遅い)
    if (state.phase === 'var' && state.varReal < 0.5) return;
    const show = state.phase === 'build' || state.phase === 'ready';
    if (!show) { state.badges = []; return; }
    layoutBadges();
    const p = state.play, a = state.actors;
    const dim = state.phase === 'ready';
    ctx.save();
    for (const bg of state.badges) {
      const d = a[bg.k], up = !!d.step;
      ctx.globalAlpha = dim ? 0.45 : 0.95;
      // 頭への細い線
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bg.x, bg.y + bg.r); ctx.lineTo(bg.hx, bg.hy - 2); ctx.stroke();
      ctx.fillStyle = up ? 'rgba(255,225,77,0.95)' : 'rgba(150,10,30,0.82)';
      ctx.beginPath(); ctx.arc(bg.x, bg.y, bg.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = up ? '#222' : '#fff';
      ctx.textAlign = 'center';
      const fk = bg.r / 30;
      ctx.font = `900 ${Math.round(24 * fk)}px sans-serif`;
      ctx.fillText(NUM[bg.k], bg.x, bg.y + 3 * fk);
      ctx.font = `bold ${Math.round(10 * fk)}px sans-serif`;
      const marking = !up && state.mark && p.noOff && p.laggers.includes(bg.k);
      const sub = up ? t('badge.going') : marking ? t('badge.mark') : (isTouch ? '▲' + t('badge.up') : `[${DEFS.indexOf(bg.k) + 1}] ▲`);
      if (marking) ctx.fillStyle = '#7fe3ff';
      ctx.fillText(sub, bg.x, bg.y + 17 * fk, bg.r * 1.8);
    }
    ctx.restore();
  }

  // 「マーク」ボタン(コーナーキックのボタンと同じ作り)
  function drawMarkButton() {
    if (!markShown()) return;
    const p = state.play, b = MARKBTN, on = !!state.mark;
    ctx.save();
    ctx.globalAlpha = state.phase === 'ready' ? 0.4 : 0.9;
    ctx.fillStyle = on ? 'rgba(127,227,255,0.92)' : 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2.5; ctx.stroke();
    const fk = b.r / 50;
    // 盾のアイコン
    ctx.save();
    ctx.translate(b.x, b.y - 18 * fk); ctx.scale(fk, fk);
    ctx.fillStyle = on ? '#063040' : '#7fe3ff';
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(11, -7); ctx.lineTo(9, 5); ctx.lineTo(0, 12); ctx.lineTo(-9, 5); ctx.lineTo(-11, -7); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = on ? '#063040' : '#fff';
    ctx.textAlign = 'center';
    ctx.font = `900 ${Math.round(19 * fk)}px sans-serif`;
    ctx.fillText(t('btn.mark'), b.x, b.y + 12 * fk, b.r * 1.7);
    ctx.font = `bold ${Math.round(10 * fk)}px sans-serif`;
    ctx.fillText(isTouch ? t('btn.markSub') : t('btn.markSub') + ' [Space]', b.x, b.y + 28 * fk, b.r * 1.8);
    ctx.restore();
    if (p.markTip && !on && state.phase === 'build' && !state.released) drawMarkTip();
  }

  // 最初の「マーク」の場面: ボタンの横に吹き出しで役目を説明し、ボタンのまわりを光らせる
  function drawMarkTip() {
    const b = MARKBTN, fs = isTouch ? 24 : 16, lh = Math.round(fs * 1.35);
    const lines = [t('tip.mark1'), t(isTouch ? 'tip.mark2' : 'tip.mark2.key'), t('tip.mark3')];
    ctx.save();
    const pulse = 0.5 + 0.5 * Math.sin(state.time * 6);
    ctx.strokeStyle = `rgba(255,225,77,${0.5 + 0.5 * pulse})`; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 8 + pulse * 6, 0, Math.PI * 2); ctx.stroke();
    ctx.font = `bold ${fs}px sans-serif`;
    const w = Math.min(W * 0.62, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 36);
    // 長い行は折り返す(1 行目は見出し)
    const rows = [];
    lines.forEach((l, i) => wrapText(l, w - 36).forEach((r) => rows.push({ r, head: i === 0 })));
    const h = rows.length * lh + 22;
    const x = b.x - b.r - 26 - w, y = clamp(b.y - h / 2, 70, H - h - 120);
    ctx.fillStyle = 'rgba(255,248,214,0.97)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 12); else ctx.rect(x, y, w, h);
    ctx.fill();
    // ボタンを指す三角
    ctx.beginPath(); ctx.moveTo(x + w, b.y - 12); ctx.lineTo(x + w + 18, b.y); ctx.lineTo(x + w, b.y + 12); ctx.closePath(); ctx.fill();
    ctx.textAlign = 'left';
    rows.forEach((q, i) => {
      ctx.fillStyle = q.head ? '#7a3d00' : '#1b2440';
      ctx.font = `${q.head ? 900 : 'bold'} ${fs}px sans-serif`;
      ctx.fillText(q.r, x + 18, y + 14 + fs + i * lh, w - 30);
    });
    ctx.restore();
  }

  // パスの瞬間: 判定の結果と 2 本の線のラベル
  function drawVar() {
    const J = state.judge, p = state.play;
    if (!J || !(state.phase === 'var' || state.phase === 'run' || state.phase === 'attack' || (state.phase === 'result' && state.phaseT < 1.2))) return;
    ctx.save();
    // プレーの邪魔にならないよう、画面の下に出す(線のラベルはその上)
    const vh = isTouch ? 64 : 54, ft = isTouch ? 16 : 12, fm = isTouch ? 30 : 24; // スマホは大きく
    const y0 = H - vh - 14;
    let text, col;
    if (J.exempt) { text = t('call.' + p.kind) + ' → ' + t('var.exempt'); col = '#9fe8ff'; }
    else if (J.level) { text = t('var.level'); col = '#9fe8ff'; }
    else if (J.offPos) { text = t('var.off', { g: fmtGap(J.gap) }); col = '#ffe14d'; }
    else { text = t('var.on', { g: fmtGap(J.gap) }); col = '#7fd4ff'; }
    if (!J.exempt && J.offPos === false && !J.level && J.gap >= LEVEL) {
      // 後ろから2人目より前でも、自陣・ボールより後ろならオフサイドポジションではない
      text = t('var.exempt'); col = '#9fe8ff';
    }
    ctx.font = `900 ${fm}px sans-serif`;
    const w = Math.min(W - 40, Math.max(ctx.measureText(text).width, 200) + 48);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(W / 2 - w / 2, y0, w, vh);
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(W / 2 - w / 2, y0, w, vh);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ddd';
    ctx.font = `bold ${ft}px sans-serif`;
    ctx.fillText('VAR · ' + t('var.title'), W / 2, y0 + ft + 4);
    ctx.fillStyle = col;
    ctx.font = `900 ${fm}px sans-serif`;
    ctx.fillText(text, W / 2, y0 + vh - 10, w - 20);
    // 線のラベル(奥のタッチラインのあたり)
    if (!J.exempt) {
      // 手前のタッチラインのあたりに、線の左右に分けて出す
      const lab = (y, label, c, right, row) => {
        const s = Scene3D.project(HX - 6, y, 0);
        if (s.behind) return;
        const fs = isTouch ? 22 : 14, lh = fs + 8;
        ctx.font = `bold ${fs}px sans-serif`;
        const tw = ctx.measureText(label).width + 14;
        const x = clamp(right ? s.x + 6 : s.x - 6 - tw, 6, W - tw - 6), yy = clamp(s.y - 40 - row * (lh + 4), 90, y0 - 10 - lh - row * (lh + 4));
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(x, yy, tw, lh);
        ctx.fillStyle = c;
        ctx.textAlign = 'left';
        ctx.fillText(label, x + 7, yy + fs + 1);
      };
      const defLeft = J.sl.y <= J.recvY;
      lab(J.sl.y, t('lbl.def', { d: who(J.sl.k) }), '#ff8080', !defLeft, 0);
      lab(J.recvY, t('lbl.atk', { n: NUM[p.receiver] }), J.offence ? '#ffe14d' : '#7fd4ff', defLeft, 1);
    }
    ctx.restore();
  }

  // 結果の解説
  function drawExplain() {
    const res = state.lastResult;
    if (state.phase !== 'result' || !res || state.phaseT < 0.5) return;
    const a = Math.min(1, (state.phaseT - 0.5) / 0.3);
    ctx.save();
    ctx.globalAlpha = a;
    // スマホは画面が小さいので、文字を大きく・枠を広くする
    const fs = isTouch ? 30 : 18, lh = Math.round(fs * 1.4);
    ctx.font = `bold ${fs}px sans-serif`;
    const bw = Math.min(W - 40, isTouch ? 1240 : 880), maxw = bw - 48;
    const rows = [];
    for (const l of res.lines) rows.push(...wrapText(l, maxw));
    const sk = isTouch ? 18 : 13;
    const bh = 20 + rows.length * lh + sk + 14;
    const by = H - bh - 12;
    ctx.fillStyle = 'rgba(6,12,28,0.88)';
    ctx.fillRect(W / 2 - bw / 2, by, bw, bh);
    ctx.fillStyle = res.ok ? '#ffe14d' : '#ff6b6b';
    ctx.fillRect(W / 2 - bw / 2, by, 6, bh);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    rows.forEach((r, i) => ctx.fillText(r, W / 2 - bw / 2 + 26, by + 14 + fs + i * lh));
    if (state.phaseT > 1.2 && Math.floor(state.time * 2) % 2 === 0) {
      ctx.textAlign = 'right';
      ctx.font = `bold ${sk}px sans-serif`;
      ctx.fillStyle = '#ffcc80';
      ctx.fillText(t(isTouch ? 'skip' : 'skip.key'), W / 2 + bw / 2 - 14, by + bh - 9);
    }
    ctx.restore();
  }

  // 折り返し(英語は単語ごと、日本語は文字ごと)
  function wrapText(text, maxw) {
    const words = /\s/.test(text) && I18N.lang === 'en' ? text.split(/(\s+)/) : Array.from(text);
    const rows = [];
    let cur = '';
    for (const w of words) {
      if (ctx.measureText(cur + w).width > maxw && cur.trim()) { rows.push(cur.trim()); cur = w.trimStart(); }
      else cur += w;
    }
    if (cur.trim()) rows.push(cur.trim());
    return rows;
  }

  function drawPopups() {
    ctx.textAlign = 'center';
    let line = 0;
    for (const p of state.popups) {
      if (p.t < 0) continue;
      const a = Math.min(1, (p.life - p.t) / 0.4);
      const sc = 1 + Math.max(0, 0.25 - p.t) * 1.5;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(W / 2, (isTouch ? 250 : 230) + line * 54 - p.t * 14);
      ctx.scale(sc, sc);
      ctx.font = `900 ${p.size}px sans-serif`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(p.text, 0, 0, W - 60);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0, W - 60);
      ctx.restore();
      line++;
    }
  }

  function drawMessage() {
    const m = state.msg;
    if (!m || state.phase !== 'build') return;
    const p = state.play;
    const lines = [t(m.key)];
    if (state.nav) {
      lines.push(t('nav.check')); // どの場面でも同じチェックリスト
    }
    ctx.save();
    // スマホは文字を大きく
    const f0 = isTouch ? 26 : 18, f1 = isTouch ? 22 : 15, bh = isTouch ? 40 : 30;
    lines.forEach((text, i) => {
      ctx.font = `bold ${i ? f1 : f0}px sans-serif`;
      const w = Math.min(W - 40, ctx.measureText(text).width + 30);
      const y = H - 18 - (lines.length - i) * (bh + 4);
      ctx.fillStyle = i ? 'rgba(120,60,0,0.78)' : 'rgba(0,0,0,0.58)';
      ctx.fillRect(W / 2 - w / 2, y, w, bh);
      ctx.fillStyle = i ? '#ffe0b2' : '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(text, W / 2, y + bh / 2 + (i ? f1 : f0) * 0.36, w - 16);
    });
    if (state.passCue) {
      const kk = state.actors[p.kicker];
      const s = Scene3D.project(kk.x, kk.y, 2.4);
      if (!s.behind && Math.floor(state.time * 8) % 2 === 0) {
        ctx.font = `900 ${isTouch ? 28 : 20}px sans-serif`;
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText(t('nav.pass'), s.x, s.y - 12);
        ctx.fillStyle = '#ff9a3c';
        ctx.fillText(t('nav.pass'), s.x, s.y - 12);
      }
    }
    ctx.restore();
  }

  // 場面の大きな掛け声(「スローイン」「ロングボール」など)
  function drawCall() {
    const p = state.play;
    if (!p || state.paused) return;
    let a = 0, k = 1;
    if (state.phase === 'ready') {
      a = Math.min(1, state.phaseT / 0.2, (READY_SHOW - state.phaseT) / READY_FADE);
      k = 1 + Math.max(0, 0.2 - state.phaseT) * 2.5 + Math.max(0, state.phaseT - (READY_SHOW - READY_FADE)) * 0.4;
    }
    if (a <= 0) return;
    const text = t('call.' + p.kind);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(W / 2, 315);
    ctx.scale(k, k);
    ctx.font = '900 86px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(text, 0, 0, W - 80);
    ctx.fillStyle = '#ffe14d';
    ctx.fillText(text, 0, 0, W - 80);
    ctx.restore();
  }

  function centerText(text, y, size, color = '#fff', weight = 'bold') {
    ctx.font = `${weight} ${size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(text, W / 2, y, W - 40);
    ctx.fillStyle = color;
    ctx.fillText(text, W / 2, y, W - 40);
  }

  function drawTitle() {
    ctx.fillStyle = 'rgba(8,14,20,0.6)';
    ctx.fillRect(0, 0, W, H);
    // 操作説明は別のページ(下の「操作説明」ボタン)。トップは大きな文字だけにする
    centerText(t('title.name'), 168, 104, '#ffe14d', '900');
    centerText(t('title.sub'), 236, 32);
    if (state.best) centerText(t('title.best', { c: state.best.ok, t: TOTAL, s: state.best.score }), 300, 26, '#9fe8ff');
    if (Math.floor(state.time * 2) % 2 === 0) centerText(t(isTouch ? 'title.start.touch' : 'title.start.key'), 380, 42, '#ffffff', '900');
    centerText(t('title.sound'), 430, 18, '#cfd8dc', 'normal');
  }

  function rankOf(c) {
    if (c >= 10) return [t('rank.5'), '#ffe14d'];
    if (c >= 8) return [t('rank.4'), '#ffd54f'];
    if (c >= 6) return [t('rank.3'), '#9fe8ff'];
    if (c >= 4) return [t('rank.2'), '#b9f6ca'];
    if (c >= 2) return [t('rank.1'), '#e0e0e0'];
    return [t('rank.0'), '#bdbdbd'];
  }

  function drawOver() {
    ctx.fillStyle = 'rgba(8,14,20,0.68)';
    ctx.fillRect(0, 0, W, H);
    // 下の方(y 約 300〜500)は HTML のシェア・もう一度ボタンなので上に詰める
    centerText(t('over.title'), 104, 30, '#ffffff', '900');
    centerText(t('over.goals', { c: state.ok, t: TOTAL }), 146, 40, state.ok === TOTAL ? '#ffe14d' : '#9fe8ff', '900');
    if (state.ok === TOTAL) centerText(t('over.perfect'), 174, 18, '#ffe14d');
    const [rank, col] = rankOf(state.ok);
    centerText(t('over.rank', { r: rank }), 202, 22, col);
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#e6e6e6';
    ctx.textAlign = 'center';
    ctx.fillText(t('over.line1', { s: state.score, h: state.traps, m: state.bestStreak, nav: navLabel() }), W / 2, 228, W - 40);
    if (state.newRecord) centerText(t('over.new'), 260, 20, '#ff8a65');
    else if (state.best) centerText(t('over.best', { c: state.best.ok, s: state.best.score }), 260, 17, '#9fe8ff');
  }

  // ---------- シェア(結果画面) ----------
  // 対応端末では成績画像つきで共有シートを開き、だめなら X・LINE・コピーで共有する
  const SHARE_URL = 'https://techgym.jp/column/claude-code-game-offside/'; // 紹介記事
  const shareEl = document.getElementById('share');
  const $id = (id) => document.getElementById(id);
  const navLabel = () => t(state.navUsed ? 'nav.on' : 'nav.off') + (state.redoUsed ? t(state.redoUsed === 1 ? 'nav.redo1' : 'nav.redo', { n: state.redoUsed }) : '');
  const withUrl = (text) => (SHARE_URL ? text + '\n' + SHARE_URL : text);

  function shareText() {
    const [rank] = rankOf(state.ok);
    return t('share.text', {
      c: state.ok, t: TOTAL, p: state.ok === TOTAL ? t('share.perfect') : '', r: rank,
      s: state.score, nav: navLabel(), h: state.traps, m: state.bestStreak,
    });
  }

  function prepareShare() {
    const text = shareText();
    $id('shareX').href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + (SHARE_URL ? '&url=' + encodeURIComponent(SHARE_URL) : '');
    $id('shareLine').href = 'https://line.me/R/share?text=' + encodeURIComponent(withUrl(text));
    $id('shareMsg').textContent = t(NATIVE ? 'share.msg.native' : navigator.share ? 'share.msg.image' : 'share.msg.links');
    $id('retryBtn').textContent = t('over.retryBtn') + (isTouch ? '' : ' (SPACE)');
  }

  // 成績カード画像(1200x630)
  function makeShareImage() {
    const c = document.createElement('canvas');
    c.width = 1200; c.height = 630;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, 630);
    bg.addColorStop(0, '#060a1f'); bg.addColorStop(0.6, '#1d2b5c'); bg.addColorStop(1, '#2d6a2c');
    g.fillStyle = bg; g.fillRect(0, 0, 1200, 630);
    for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.5})`; g.fillRect(Math.random() * 1200, Math.random() * 300, 2, 2); }
    for (const [x, y, col] of [[150, 140, '#ff5252'], [1060, 120, '#ffd740'], [990, 320, '#40c4ff'], [210, 380, '#e040fb']]) {
      g.strokeStyle = col; g.lineWidth = 3;
      for (let k = 0; k < 24; k++) {
        const a = k / 24 * Math.PI * 2;
        g.beginPath(); g.moveTo(x + Math.cos(a) * 20, y + Math.sin(a) * 20); g.lineTo(x + Math.cos(a) * 80, y + Math.sin(a) * 80); g.stroke();
      }
    }
    g.fillStyle = '#3a8a36'; g.fillRect(0, 560, 1200, 70);
    // 副審の旗
    g.fillStyle = '#333'; g.fillRect(1080, 430, 6, 130);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { g.fillStyle = (i + j) % 2 ? '#ffd400' : '#e8102a'; g.fillRect(1086 + i * 18, 430 + j * 18, 18, 18); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const font = (w, sz) => `${w} ${sz}px "Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif`;
    g.fillStyle = '#9fd8ff'; g.font = font(800, 36); g.fillText(t('card.head', { nav: navLabel() }), 600, 70);
    const gold = g.createLinearGradient(0, 120, 0, 280);
    gold.addColorStop(0, '#fff6c4'); gold.addColorStop(0.5, '#ffd000'); gold.addColorStop(1, '#ff8a00');
    g.fillStyle = gold; g.font = font(900, 120); g.fillText(t('card.goals', { c: state.ok, t: TOTAL }), 600, 200, 1100);
    const [rank] = rankOf(state.ok);
    g.fillStyle = '#ff9d3c'; g.font = font(900, 52); g.fillText(t('card.rank', { r: rank }), 600, 330, 1100);
    g.fillStyle = '#ffffff'; g.font = font(800, 40);
    g.fillText(t('card.line1', { s: state.score, h: state.traps, m: state.bestStreak }), 600, 430, 1000);
    g.fillStyle = '#eef6e8'; g.font = font(700, 28); g.fillText(t('card.tags'), 600, 595);
    return new Promise((res) => c.toBlob(res, 'image/png'));
  }

  async function shareResult() {
    const text = shareText();
    // アプリでは Android の共有メニューを出す
    const nativeShare = plugin('Share');
    if (nativeShare) {
      try { await nativeShare.share({ title: t('share.title'), text: withUrl(text), dialogTitle: t('share.dialog') }); } catch (e) { /* キャンセル */ }
      return;
    }
    if (navigator.share) {
      try {
        const blob = await makeShareImage();
        const file = blob && new File([blob], 'offside-trap-result.png', { type: 'image/png' });
        const data = { title: t('share.title'), text: withUrl(text) };
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) data.files = [file];
        await navigator.share(data);
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return; // 共有シートを閉じただけ
      }
    }
    copyResult();
  }

  async function copyResult() {
    const text = withUrl(shareText());
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { /* 非対応 */ }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta);
        ta.select(); ok = document.execCommand('copy'); ta.remove();
      } catch (e) { /* 非対応 */ }
    }
    $id('shareMsg').textContent = t(ok ? 'share.copied' : 'share.copyFail');
  }

  $id('shareBtn').addEventListener('click', () => { audio(); shareResult(); });
  $id('shareCopy').addEventListener('click', copyResult);
  // シェア欄の操作でゲームが再スタートしないようにする
  for (const ev of ['pointerdown', 'pointerup', 'keydown']) shareEl.addEventListener(ev, (e) => e.stopPropagation());

  function updateShareVisibility() {
    const show = state.phase === 'over' && state.overT > 0.6;
    if (show !== !shareEl.hidden) {
      shareEl.hidden = !show;
      if (show) prepareShare();
    }
  }

  function draw() {
    ctx.setTransform(overlayScale, 0, 0, overlayScale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (state.phase !== 'title') {
      drawBadges();
      drawMarkButton();
      if (state.phase !== 'over') { drawMinimap(); drawHUD(); } // 結果画面では隠す(上のボタンや見出しと重なるため)
      drawMessage();
      drawVar();
      drawPopups();
      drawExplain();
      if (state.phase === 'ready' && !state.paused) {
        ctx.save();
        ctx.globalAlpha = clamp((READY_SHOW - state.phaseT) / READY_FADE, 0, 1);
        centerText(t('ready.play', { n: state.index + 1 }), 215, 34, '#ffffff', '900');
        centerText(t('ready.sub'), 405, 22, '#ffcc80');
        ctx.restore();
      }
      drawCall();
      if (state.paused && !isPortrait()) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
        centerText('PAUSE', H * 0.3, 56);
        if (!isTouch) centerText(t('pause.resume'), H * 0.3 + 40, 18);
      }
    } else state.badges = [];
    if (state.phase === 'title') drawTitle();
    if (state.phase === 'over') drawOver();
    updateShareVisibility();
    updateLangVisibility();
    updatePauseMenu();
    updateBanner();
    drawMute();
    drawNavButton();
  }

  function drawNavButton() {
    const { x, y, w, h } = NAVBTN;
    ctx.save();
    ctx.fillStyle = state.nav ? 'rgba(255,225,77,0.9)' : 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2); else ctx.rect(x - w / 2, y - h / 2, w, h);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = state.nav ? '#222' : '#fff';
    ctx.font = `bold ${Math.round(h * 0.43)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(t('nav.btn', { s: state.nav ? 'ON' : 'OFF' }), x, y + h * 0.16);
    ctx.restore();
  }

  function drawMute() {
    ctx.save();
    const k = MUTE.r / 20;
    ctx.translate(MUTE.x, MUTE.y);
    ctx.scale(k, k);
    const x = 0, y = 0, r = 20;
    if (!Sound.muted && !Sound.ready && state.phase !== 'title' && state.phase !== 'over' && state.phase !== 'var' && state.phase !== 'run' && state.phase !== 'attack') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x - 84, y + 26, 168, 24);
      ctx.fillStyle = '#ffe14d';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t('sound.tap'), x, y + 43);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(x - 9, y - 4); ctx.lineTo(x - 4, y - 4); ctx.lineTo(x + 2, y - 10);
    ctx.lineTo(x + 2, y + 10); ctx.lineTo(x - 4, y + 4); ctx.lineTo(x - 9, y + 4);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    if (Sound.muted) {
      ctx.beginPath(); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x + 12, y + 5); ctx.moveTo(x + 12, y - 5); ctx.lineTo(x + 5, y + 5); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(x + 3, y, 6, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 3, y, 11, -0.9, 0.9); ctx.stroke();
    }
    ctx.restore();
  }

  // 裏に回ったら一時停止して音を止める(広告の表示中は広告側が音を止めている)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (state.phase !== 'title' && state.phase !== 'over') state.paused = true;
      Sound.suspend();
    } else if (!Ads.showing) {
      Sound.resume();
    }
  });

  // ---------- 全画面広告(Android アプリのみ) ----------
  // 「もう一度」(次のゲームへ)・「タイトルへ」・ポーズ画面からの「再開」のたびに毎回出す
  let adBusy = false;
  async function withInterstitial(next) {
    if (adBusy) return;
    if (Ads.available) {
      adBusy = true;
      pauseEl.hidden = true;
      await Ads.showInterstitial(3000);
      adBusy = false;
    }
    next();
  }
  function retry() { withInterstitial(() => { closeRedo(); newGame(); }); }
  function goTitle() {
    withInterstitial(() => {
      closeRedo();
      Object.assign(state, { phase: 'title', paused: false, popups: [], msg: null });
      titleScene();
    });
  }
  function resumeFromPause() { withInterstitial(() => { if (state.paused) state.paused = false; }); }

  // 結果画面の「もう一度」「タイトルへ」ボタン
  $id('retryBtn').addEventListener('click', () => { audio(); if (state.phase === 'over') retry(); });
  $id('titleBtn').addEventListener('click', () => { audio(); if (state.phase === 'over') goTitle(); });

  // ポーズ画面のボタン(再開 / タイトルへ)
  const pauseEl = $id('pauseMenu');
  for (const ev of ['pointerdown', 'pointerup']) pauseEl.addEventListener(ev, (e) => e.stopPropagation());
  $id('pauseResume').addEventListener('click', () => { audio(); if (state.paused) resumeFromPause(); });
  $id('pauseTitle').addEventListener('click', () => { audio(); if (state.paused) goTitle(); });
  function updatePauseMenu() {
    const show = state.paused && !adBusy && !isPortrait() && state.phase !== 'title' && state.phase !== 'over';
    if (show === pauseEl.hidden) pauseEl.hidden = !show;
  }

  // Android の戻るボタン: プレイ中はポーズ(ポーズ中なら再開)、タイトル・結果画面ではアプリを閉じる
  if (plugin('App')) {
    plugin('App').addListener('backButton', () => {
      if (!rulesEl.hidden || !howtoEl.hidden) closePage();
      else if (state.phase === 'title' || state.phase === 'over') plugin('App').exitApp();
      else if (state.paused) resumeFromPause();
      else state.paused = true;
    });
  }

  // ---------- リワード広告のチート: 失点したプレーをやり直す(アプリのみ・1 ゲーム 5 回まで) ----------
  // 失点したら「広告を見てこのプレーをやり直す」を出す。見終わると、そのプレーの成績を取り消して同じプレー(同じ配置)をもう一度。
  // 失点の様子と解説を見届けられるよう、少し待ってから出す
  const REDO_DELAY = 2.6;
  const REDO_WAIT = 6;
  const REDO_MAX = 5;
  const redo = { active: false, busy: false, t: 0, pending: 0 };
  const redoEl = $id('redo');
  for (const ev of ['pointerdown', 'pointerup']) redoEl.addEventListener(ev, (e) => e.stopPropagation());
  function offerRedo() {
    if (!Ads.canReward || state.redoUsed >= REDO_MAX) return;
    redo.pending = REDO_DELAY;
  }
  function showRedo() {
    Object.assign(redo, { active: true, busy: false, t: REDO_WAIT, pending: 0 });
    $id('redoWatch').disabled = false;
    $id('redoWatch').textContent = t('redo.watch');
    $id('redoNote').textContent = t('redo.note', { n: REDO_MAX - state.redoUsed, max: REDO_MAX });
    redoEl.hidden = false;
  }
  function closeRedo() {
    redo.active = false;
    redo.pending = 0;
    redoEl.hidden = true;
  }
  function updateRedo(dt) {
    if (redo.pending > 0) {
      redo.pending -= dt;
      if (redo.pending <= 0) showRedo();
      return;
    }
    if (!redo.active || redo.busy) return;
    redo.t -= dt;
    $id('redoNext').textContent = t('redo.next', { s: Math.max(0, Math.ceil(redo.t)) });
    if (redo.t <= 0) closeRedo();
  }
  $id('redoNext').addEventListener('click', closeRedo);
  $id('redoWatch').addEventListener('click', async () => {
    if (!redo.active || redo.busy) return;
    redo.busy = true;
    $id('redoWatch').disabled = true;
    $id('redoWatch').textContent = t('redo.loading');
    const result = await Ads.showRewarded();
    if (!redo.active) return;
    if (result === 'unavailable') {
      $id('redoNote').textContent = t('redo.fail');
      setTimeout(closeRedo, 2000);
      return;
    }
    closeRedo();
    if (result !== 'rewarded') return;
    // 失点したプレーの成績を取り消して、同じプレーをもう一度
    Object.assign(state, state.playStart);
    state.redoUsed++;
    state.popups = [];
    startPlay();
  });

  // ---------- バナー広告: タイトル画面(操作説明・ルールのページを含む)・ポーズ画面・結果画面だけ(プレイ中は操作ボタンと重なるので出さない) ----------
  function updateBanner() {
    const paused = state.paused && state.phase !== 'title' && state.phase !== 'over';
    Ads.setBanner((state.phase === 'title' || state.phase === 'over' || paused || !howtoEl.hidden) && !isPortrait()); // 操作説明のページにも出す
  }

  // タイトル画面の下に、バージョン(アプリ版)・プライバシーポリシー・広告の設定(EU など)と「オフサイドのルール」
  const legalEl = $id('legal');
  const menuEl = $id('titleMenu'), rulesEl = $id('rules'), howtoEl = $id('howto');
  for (const el of [legalEl, menuEl, rulesEl, howtoEl]) for (const ev of ['pointerdown', 'pointerup', 'keydown']) el.addEventListener(ev, (e) => e.stopPropagation());
  $id('rulesBtn').addEventListener('click', () => { audio(); rulesEl.hidden = false; });
  $id('storeBtn').hidden = NATIVE; // ブラウザ版だけ、Google Play のアプリへのリンクを出す
  // 操作説明のページ(スマホとキーボードで文が違う)
  function fillHowto() {
    $id('howtoList').innerHTML = [1, 2, 3, 4, 5, 6].map((i) => `<li>${t(`help.${isTouch ? 'touch' : 'key'}.${i}`)}</li>`).join('');
  }
  fillHowto();
  I18N.onChange(fillHowto);
  $id('howtoBtn').addEventListener('click', () => { audio(); howtoEl.hidden = false; });
  // ページを閉じてタイトルに戻るときと、ページからプレイするときは全画面広告
  function closePage() { withInterstitial(() => { rulesEl.hidden = true; howtoEl.hidden = true; }); }
  function playFromPage() { withInterstitial(() => { rulesEl.hidden = true; howtoEl.hidden = true; closeRedo(); newGame(); }); }
  $id('howtoBack').addEventListener('click', () => { audio(); closePage(); });
  $id('howtoPlay').addEventListener('click', () => { audio(); playFromPage(); });
  $id('rulesPlay').addEventListener('click', () => { audio(); playFromPage(); });
  if (window.APP_VERSION && window.APP_VERSION !== 'dev') $id('buildInfo').textContent = window.APP_VERSION;
  Ads.initDone.then(() => { if (Ads.privacyOptionsRequired) $id('adPrivacy').hidden = false; });
  $id('adPrivacyLink').addEventListener('click', (e) => { e.preventDefault(); Ads.showPrivacyOptions(); });
  $id('rulesClose').addEventListener('click', () => { audio(); closePage(); });

  // タイトル画面の言語切り替え
  const langEl = document.getElementById('langSel');
  document.querySelectorAll('[data-lang]').forEach((el) => el.addEventListener('click', () => I18N.setLang(el.dataset.lang)));
  for (const ev of ['pointerdown', 'pointerup']) langEl.addEventListener(ev, (e) => e.stopPropagation());
  I18N.onChange(() => { if (!shareEl.hidden) prepareShare(); });
  I18N.apply();
  function updateLangVisibility() {
    const show = state.phase === 'title';
    if (show === langEl.hidden) { langEl.hidden = !show; legalEl.hidden = !show; menuEl.hidden = !show; }
    if (!show) { rulesEl.hidden = true; howtoEl.hidden = true; }
  }

  // タイトル画面の背景: ランダムな場面の並びを見せておく
  function titleScene() {
    state.index = 0;
    state.order = makeOrder((Date.now() ^ (Math.random() * 1e9)) >>> 0); // 背景の場面も毎回ちがう
    startPlay();
    state.phase = 'title';
    state.view = { x: 0, y: 12, fx: -1, fy: 0, back: 38, h: 21, pitch: -0.52, fov: 50, cut: true };
  }

  // ---------- メインループ ----------
  let overlayScale = 1;
  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2);
    W = Math.round(H * r.width / r.height);
    if (isTouch) {
      Object.assign(MUTE, { y: 42, r: 27 });
      Object.assign(NAVBTN, { y: 42, w: 104, h: 42 });
      MUTE.x = W / 2 + 40;
      NAVBTN.x = MUTE.x + 92;
      Object.assign(MARKBTN, { x: W - 120, y: H - 215, r: 64 });
    } else {
      MUTE.x = W / 2 + 90;
      NAVBTN.x = MUTE.x + 64;
      Object.assign(MARKBTN, { x: W - 90, y: H - 190, r: 50 });
    }
    overlayScale = (r.height / H) * dpr;
    canvas.width = Math.round(W * overlayScale);
    canvas.height = Math.round(H * overlayScale);
    Scene3D.resize(r.width, r.height, W);
  }

  // テスト・デバッグ用フック
  const api = window.Offside = {
    hold: false, forceKind: null,
    state, newGame, update, DT, TOTAL, KINDS, makeOrder,
    setBot(fn) { bot = fn; },
    tap: tapDef, mark: doMark, secondLast, judge,
    startAt(i, seed) { newGame(seed); state.index = i; state.markTipDone = false; startPlay(); },
  };

  Scene3D.init(document.getElementById('view'));
  window.addEventListener('resize', resize);
  resize();
  titleScene();

  let last = performance.now(), acc = 0;
  function frame(now) {
    const frameDt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    acc += frameDt;
    if (api.hold) acc = 0; // テスト用: シミュレーションを止めて描画だけ行う
    while (acc >= DT) { update(DT); acc -= DT; }
    Scene3D.render(state, frameDt);
    Sound.update(state);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
