'use strict';
// オフサイド — スタジアムの音(すべて Web Audio API で合成。音声ファイルは使わない)
// 歓声・ため息・どよめき・拍手・指笛・チアホーン(長い一定の音)・応援(太鼓)・笛・キック・ヘディング・ネット・副審の旗(電子音)・花火の音
// 構成は techgymjp/jackal(ジャッカル)の sound.js と同じ
window.Sound = (() => {
  let AC = null, master = null, noiseBuf = null;
  let ambientGain = null, oohGain = null, hornGain = null, bandBus = null;
  let muted = false;
  const VOL = 0.7;
  // 同時に鳴る単発音の上限。超えた分は鳴らさない(音声処理が追いつかず音割れするのを防ぐ)
  const MAX_VOICES = 48;
  let voices = 0;
  const voiceEnd = () => { voices--; };
  try { muted = localStorage.getItem('offside.muted') === '1'; } catch (e) { /* 保存できない環境 */ }
  const rand = (a, b) => a + (b - a) * Math.random();
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  // ユーザー操作のたびに呼ぶ。スマホは touchend / click の中でないと音が解禁されない
  function init() {
    if (AC) {
      if (AC.state !== 'running') { AC.resume(); unlockBlip(); }
      return;
    }
    try {
      // iPhone のマナーモードでも鳴るように(iOS 17 以降)
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (e) { /* 非対応 */ }
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      AC.resume();
      unlockBlip();
      // 音が重なっても割れないよう、最後にコンプレッサー(リミッター代わり)を通す
      master = AC.createGain();
      master.gain.value = muted ? 0 : VOL;
      const comp = AC.createDynamicsCompressor();
      comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 8;
      comp.attack.value = 0.003; comp.release.value = 0.25;
      master.connect(comp).connect(AC.destination);
      noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

      // 球場のざわめき(常時)
      ambientGain = loopNoise([[700, 0.6, 1], [300, 0.7, 0.6]], 0.04);
      // 打球が上がったときの「おおおー」というどよめき(打球に合わせて音量を動かす)
      oohGain = loopNoise([[520, 3, 1], [950, 4, 0.6], [2400, 5, 0.12]], 0);
      // チアホーン(長く鳴り続ける一定の音)。ピンチのときだけ音量を上げる
      hornGain = hornDrone();

      // 応援団用のバス(球場の残響つき)
      bandBus = AC.createGain();
      bandBus.gain.value = 0;
      const rev = AC.createConvolver(), len = AC.sampleRate * 1.2;
      const ir = AC.createBuffer(2, len, AC.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d2 = ir.getChannelData(c);
        for (let i = 0; i < len; i++) d2[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      rev.buffer = ir;
      const wet = AC.createGain();
      wet.gain.value = 0.35;
      bandBus.connect(master);
      bandBus.connect(rev).connect(wet).connect(master);
    } catch (e) { AC = null; }
  }

  // 無音を一瞬鳴らして音声出力を確実に開始させる(古い iOS 対策)
  function unlockBlip() {
    try {
      const buf = AC.createBuffer(1, 1, AC.sampleRate);
      const src = AC.createBufferSource();
      src.buffer = buf;
      src.connect(AC.destination);
      src.start(0);
    } catch (e) { /* 無視 */ }
  }

  function loopNoise(bands, gain) {
    const out = AC.createGain();
    out.gain.value = gain;
    out.connect(master);
    for (const [f, q, g] of bands) {
      const src = AC.createBufferSource();
      src.buffer = noiseBuf; src.loop = true;
      const bp = AC.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const gn = AC.createGain();
      gn.gain.value = g;
      src.connect(bp).connect(gn).connect(out);
      src.start(0, Math.random() * 1.5);
    }
    return out;
  }

  function setMuted(m) {
    muted = m;
    try { localStorage.setItem('offside.muted', m ? '1' : '0'); } catch (e) { /* 保存できない環境 */ }
    if (AC) master.gain.setTargetAtTime(m ? 0 : VOL, AC.currentTime, 0.05);
  }

  function noiseShot({ t = 0, dur = 0.2, type = 'bandpass', f = 1000, f2 = null, q = 1, g = 0.5, attack = 0.002, dest = master }) {
    if (!AC || voices >= MAX_VOICES) return;
    const t0 = AC.currentTime + Math.max(0, t);
    const s = AC.createBufferSource(); s.buffer = noiseBuf;
    const fl = AC.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t0); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    const gn = AC.createGain();
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.exponentialRampToValueAtTime(g, t0 + attack);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(fl).connect(gn).connect(dest);
    voices++; s.onended = voiceEnd;
    s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.05);
  }

  function tone({ t = 0, dur = 0.2, f = 440, f2 = null, type = 'sine', g = 0.3, dest = master }) {
    if (!AC || voices >= MAX_VOICES) return;
    const t0 = AC.currentTime + Math.max(0, t);
    const o = AC.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    const gn = AC.createGain();
    gn.gain.setValueAtTime(g, t0); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    voices++; o.onended = voiceEnd;
    o.connect(gn).connect(dest); o.start(t0); o.stop(t0 + dur + 0.05);
  }

  // ---------- 効果音 ----------
  // ボールを蹴る「ドンッ」(強さ 0〜1)
  function kick(power = 1) {
    noiseShot({ dur: 0.08, type: 'lowpass', f: 1600, g: 0.5 + 0.4 * power, attack: 0.002 });
    tone({ dur: 0.12, f: 190, f2: 70, g: 0.45 + 0.25 * power });
    noiseShot({ dur: 0.05, type: 'highpass', f: 2500, g: 0.12 * power });
  }

  // ヘディングの「ゴツッ」
  function header() {
    noiseShot({ dur: 0.07, type: 'bandpass', f: 900, q: 1.2, g: 0.7 });
    tone({ dur: 0.1, f: 260, f2: 130, g: 0.4 });
  }

  // 選手同士の競り合い
  function bump() {
    noiseShot({ dur: 0.14, type: 'lowpass', f: 600, f2: 150, g: 0.55, attack: 0.004 });
    tone({ dur: 0.16, f: 110, f2: 50, g: 0.35 });
  }

  // 切り替えの風切り音
  function whoosh() { noiseShot({ dur: 0.45, f: 300, f2: 2500, q: 0.8, g: 0.12, attack: 0.2 }); }

  // 芝で弾む音
  function bounce(k = 1) {
    noiseShot({ dur: 0.06, type: 'lowpass', f: 900, g: 0.35 * k });
    tone({ dur: 0.07, f: 200, f2: 100, g: 0.2 * k });
  }

  // キーパーがボールをつかむ音
  function grab() {
    noiseShot({ dur: 0.1, type: 'lowpass', f: 900, g: 0.7 });
    tone({ dur: 0.1, f: 150, f2: 80, g: 0.4 });
  }

  // ネットを揺らす「バサッ」
  function net() {
    noiseShot({ dur: 0.45, type: 'bandpass', f: 1800, f2: 700, q: 0.6, g: 0.4, attack: 0.01 });
    noiseShot({ t: 0.05, dur: 0.3, type: 'highpass', f: 3500, g: 0.12, attack: 0.01 });
  }

  // 副審の旗の電子音「ピピッ」(主審の腕のバンドに知らせる音)
  function beep() {
    tone({ dur: 0.09, f: 1650, type: 'square', g: 0.07 });
    tone({ t: 0.13, dur: 0.12, f: 1650, type: 'square', g: 0.07 });
  }

  // DF がタップされて前に出るときの合図「ザッ」
  function step() {
    noiseShot({ dur: 0.12, type: 'bandpass', f: 1400, f2: 500, q: 0.9, g: 0.25, attack: 0.004 });
    tone({ dur: 0.08, f: 520, f2: 760, type: 'triangle', g: 0.08 });
  }

  // ポスト・バーに当たる「カーン」
  function post() {
    for (const [f, g] of [[1150, 0.22], [1720, 0.14], [2650, 0.08], [3900, 0.05]]) {
      tone({ dur: 1.0, f, g, type: 'sine' });
    }
    noiseShot({ dur: 0.05, type: 'highpass', f: 2000, g: 0.4 });
  }

  // レフリーの笛(短く「ピッ」、長めにすると「ピーッ」)
  function whistle(len = 0.6) {
    if (!AC) return;
    const t0 = AC.currentTime + 0.02;
    const o = AC.createOscillator(); o.type = 'sine'; o.frequency.value = 2900;
    // 笛の中の玉が転がる「トリル」
    const lfo = AC.createOscillator(); lfo.frequency.value = 32;
    const lg = AC.createGain(); lg.gain.value = 120;
    lfo.connect(lg).connect(o.frequency);
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.13, t0 + 0.02);
    g.gain.setTargetAtTime(0.0001, t0 + len, 0.03);
    o.connect(g).connect(master);
    o.start(t0); lfo.start(t0); o.stop(t0 + len + 0.2); lfo.stop(t0 + len + 0.2);
    noiseShot({ t: 0.02, dur: len, type: 'bandpass', f: 2900, q: 4, g: 0.05, attack: 0.02 });
  }

  // 歓声: 帯域の違うノイズのうねり + 拍手 + 指笛
  function cheer(level, dur) {
    if (!AC) return;
    const t0 = AC.currentTime;
    for (const [f, q, g] of [[900, 0.7, 0.5], [1800, 0.9, 0.3], [400, 0.8, 0.35]]) {
      const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const fl = AC.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q;
      const gn = AC.createGain(); gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.exponentialRampToValueAtTime(g * level, t0 + 0.3);
      for (let t = 0.5; t < dur; t += 0.25) gn.gain.setTargetAtTime(g * level * rand(0.65, 1.1), t0 + t, 0.12);
      gn.gain.setTargetAtTime(0.0001, t0 + dur, 0.6);
      s.connect(fl).connect(gn).connect(master); s.start(t0, Math.random()); s.stop(t0 + dur + 3);
    }
    const claps = Math.min(36, Math.floor(dur * 10 * level));
    for (let i = 0; i < claps; i++) noiseShot({ t: rand(0.15, dur + 0.8), dur: 0.035, type: 'highpass', f: rand(1500, 3500), g: rand(0.04, 0.12) * level });
    for (let i = 0; i < Math.round(5 * level); i++) {
      const t = rand(0.2, dur), f = rand(1900, 2800);
      tone({ t, dur: 0.25, f, f2: f * 1.3, g: 0.05 });
      tone({ t: t + 0.3, dur: 0.35, f: f * 1.25, f2: f * 0.9, g: 0.05 });
    }
  }

  // ため息「あー…」: 何人分もの声を母音「あ」のフォルマントに通して下降させる
  function sigh(level = 1) {
    if (!AC) return;
    const t0 = AC.currentTime + 0.05, dur = 1.5;
    const out = AC.createGain(); out.gain.value = 0.55 * level;
    for (const [f, q, g] of [[800, 6, 1], [1200, 7, 0.55], [2600, 8, 0.18]]) {
      const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const fg = AC.createGain(); fg.gain.value = g;
      out.connect(bp).connect(fg).connect(master);
    }
    for (let i = 0; i < 8; i++) {
      const f0 = rand(110, 280), st = t0 + rand(0, 0.12), d = dur * rand(0.8, 1.1);
      const o = AC.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0 * 1.08, st);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.72, st + d);
      const vib = AC.createOscillator(); vib.frequency.value = rand(4, 6.5);
      const vg = AC.createGain(); vg.gain.value = f0 * 0.015;
      vib.connect(vg).connect(o.frequency);
      const g = AC.createGain();
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.06, st + 0.12);
      g.gain.setTargetAtTime(0.045, st + 0.2, 0.3);
      g.gain.setTargetAtTime(0.0001, st + d * 0.6, d * 0.2);
      o.connect(g).connect(out);
      o.start(st); vib.start(st); o.stop(st + d + 0.6); vib.stop(st + d + 0.6);
    }
  }

  // チアホーン: 観客席のあちこちで吹く「ブォーーー」という長い一定の音。
  // 同じ音程のホーンを何本も少しずつずらして重ね、それぞれ息つぎのように音量を揺らす。常に鳴らしておき、音量だけ動かす
  function hornDrone() {
    const out = AC.createGain();
    out.gain.value = 0;
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200; lp.Q.value = 0.8;
    lp.connect(out).connect(master);
    // スマホのスピーカーでも聞こえるよう高め(ラ=440Hz 前後)にする
    const voices = [[440, -12], [440, 9], [440, 3], [880, -7], [880, 11], [660, -4]];
    for (const [f, cents] of voices) {
      const o = AC.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = f; o.detune.value = cents;
      const g = AC.createGain(); g.gain.value = f > 600 ? 0.1 : 0.18;
      const lfo = AC.createOscillator(); lfo.frequency.value = rand(0.15, 0.4);
      const lg = AC.createGain(); lg.gain.value = 0.08;
      lfo.connect(lg).connect(g.gain);
      o.connect(g).connect(lp);
      o.start(); lfo.start();
    }
    return out;
  }

  // 花火の打ち上げと破裂
  function launch(t = 0) {
    tone({ t, dur: 0.8, f: 400, f2: 1500, type: 'sine', g: 0.03 });
    noiseShot({ t, dur: 0.7, type: 'highpass', f: 3000, g: 0.05, attack: 0.1 });
  }
  function boom(t = 0) {
    noiseShot({ t, dur: 1.1, type: 'lowpass', f: 400, f2: 60, g: 0.8, attack: 0.005 });
    tone({ t, dur: 0.6, f: 90, f2: 35, g: 0.45 });
    for (let i = 0; i < 5; i++) noiseShot({ t: t + rand(0.25, 1.3), dur: 0.03, type: 'highpass', f: 5000, g: rand(0.04, 0.12) });
  }

  // ---------- 応援(太鼓と手拍子のリズム。メロディはなし) ----------
  const EIGHTH = 60 / 144 / 2; // 144BPM の8分音符
  // 32 拍のくり返し: 「ドン・ドン・ドン・ドン」、後半に「ドドドン」
  const STEPS = (() => {
    const steps = [];
    for (let i = 0; i < 32; i++) steps.push({ drum: i % 2 === 0, clap: i % 2 === 0 });
    for (const k of [20, 21]) steps[k].drum = true;
    return steps;
  })();
  const band = { on: false, next: 0, i: 0, level: -1 };

  function drum(t0, g) {
    const o = AC.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(95, t0); o.frequency.exponentialRampToValueAtTime(45, t0 + 0.25);
    const gn = AC.createGain(); gn.gain.setValueAtTime(g, t0); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
    o.connect(gn).connect(bandBus); o.start(t0); o.stop(t0 + 0.4);
    noiseShot({ t: t0 - AC.currentTime, dur: 0.08, type: 'lowpass', f: 300, g: g * 0.5, dest: bandBus });
  }
  function clap(t0) {
    for (let k = 0; k < 2; k++) noiseShot({ t: t0 - AC.currentTime + rand(0, 0.03), dur: 0.05, f: rand(1200, 2200), q: 0.8, g: rand(0.08, 0.14), dest: bandBus });
  }
  function bandStart() { if (!AC || band.on) return; band.on = true; band.i = 0; band.next = AC.currentTime + 0.3; band.level = -1; }
  function bandStop() { band.on = false; if (bandBus) bandBus.gain.setTargetAtTime(0, AC.currentTime, 0.3); }

  // ---------- 毎フレーム: 応援の音量とどよめき ----------
  function update(state) {
    if (!AC) return;
    const now = AC.currentTime;
    const playing = state.phase !== 'title' && state.phase !== 'over';
    if (playing) bandStart(); else if (band.on) bandStop();

    // プレー中は応援を絞って、どよめきを主役に
    let level = 1;
    if (state.phase === 'var' || state.phase === 'run' || state.phase === 'attack') level = 0.3;
    if (state.phase === 'result') level = state.lastResult && state.lastResult.ok ? 0.4 : 0.2;
    if (state.paused) level = 0;
    if (band.on && level !== band.level) { band.level = level; bandBus.gain.setTargetAtTime(0.3 * level, now, 0.15); }
    if (band.on) {
      if (band.next < now) band.next = now + 0.05; // タブ復帰時などの遅れを捨てる
      while (band.next < now + 0.3) {
        const st = STEPS[band.i], t = band.next;
        if (st.drum) drum(t, 0.5);
        if (st.clap) clap(t);
        band.next += EIGHTH;
        band.i = (band.i + 1) % STEPS.length;
      }
    }

    // どよめき: ボールが上がってゴール前に近づくほど大きく
    let ooh = 0;
    const b = state.ball;
    if (!state.paused && b) {
      if (state.phase === 'var' || state.phase === 'run' || state.phase === 'attack') {
        const d = Math.hypot(b.x, b.y - 52.5);
        ooh = 0.15 + 0.3 * Math.max(0, 1 - d / 35) + Math.min(0.1, b.z * 0.02);
      } else if (state.phase === 'build') ooh = 0.06 + Math.min(0.1, state.phaseT * 0.03);
    }
    oohGain.gain.setTargetAtTime(ooh, now, 0.12);

    // チアホーン: 助走に入って(キックのゲージをためて)から、ボールがゴール前にある間
    let hornLv = 0;
    if (!state.paused) {
      if (state.phase === 'build') hornLv = 0.5;
      if (state.phase === 'var' || state.phase === 'run' || state.phase === 'attack') hornLv = 0.8;
    }
    hornGain.gain.setTargetAtTime(0.18 * hornLv, now, hornLv > 0 ? 0.35 : 0.2);
    ambientGain.gain.setTargetAtTime(state.paused ? 0.01 : 0.04, now, 0.3);
  }

  for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) {
    window.addEventListener(ev, init, { capture: true, passive: true });
  }

  // アプリが裏に回ったときや広告の表示中は音を止める
  function suspend() { if (AC && AC.state === 'running') AC.suspend(); }
  function resume() { if (AC && AC.state === 'suspended') AC.resume(); }

  return {
    init, update, setMuted, suspend, resume,
    get muted() { return muted; },
    get ready() { return !!AC && AC.state === 'running'; },
    kick, header, bump, whoosh, bounce, grab, net, post, beep, step, whistle, cheer, sigh, launch, boom,
  };
})();
