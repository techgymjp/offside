'use strict';
// オフサイドトラップ — 3D 描画(テレビ中継のようにメインスタンドの上から守備ラインを横から見る視点)
// ワールド座標 (x, y, z-up) は three.js の (x, z, -y) に対応させる。
// ピッチは x = ±34(タッチライン)、y = ±52.5(ゴールライン)。守るゴールは y = +52.5(相手は +y に向かって攻めてくる)。
// スタジアム・照明・花火・選手の作りは techgymjp/jackal(ジャッカル)と同じ。
window.Scene3D = (() => {
  const H = 640;
  let W = 960;
  const HX = 34, GL = 52.5;
  const GOAL_W = 3.66, GOAL_H = 2.44, NET_D = 2.0;
  const BALL_R = 0.15; // 見やすさのため実物(0.11)より少し大きい

  let renderer, scene, camera, ready = false;
  let ballMesh, ballShadow, screens = null;
  const ringPool = [], linePool = [];
  const rigs = {};
  const cam = { fx: -1, fy: 0, x: 40, y: 20, h: 18, back: 44, pitch: -0.4, fov: 50, init: false };

  const V = (x, y, z = 0) => new THREE.Vector3(x, z, -y);

  // ---------- テクスチャ ----------
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    return t;
  }

  // 地面の描画範囲
  const GX = 46, GY = 65, GK = 8;

  function groundTexture() {
    const w = GX * 2 * GK, h = GY * 2 * GK;
    return canvasTex(w, h, (g) => {
      const tx = (x) => (x + GX) * GK, ty = (y) => (GY - y) * GK, m = (v) => v * GK;
      g.fillStyle = '#2f7a30';
      g.fillRect(0, 0, w, h);
      // 芝刈り跡(縞)
      const band = GL * 2 / 18;
      for (let i = 0; i < 18; i++) {
        g.fillStyle = i % 2 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
        g.fillRect(tx(-HX - 3), ty(-GL + band * (i + 1)), m(HX * 2 + 6), m(band));
      }
      // 芝のざらつき
      for (let i = 0; i < 110000; i++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,230,0.05)';
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      // ライン
      g.strokeStyle = '#f4f4f0';
      g.lineWidth = 3;
      const line = (x0, y0, x1, y1) => { g.beginPath(); g.moveTo(tx(x0), ty(y0)); g.lineTo(tx(x1), ty(y1)); g.stroke(); };
      const rect = (x0, y0, x1, y1) => { line(x0, y0, x1, y0); line(x1, y0, x1, y1); line(x1, y1, x0, y1); line(x0, y1, x0, y0); };
      const arc = (x, y, r, a0, a1) => { g.beginPath(); g.arc(tx(x), ty(y), m(r), a0, a1); g.stroke(); };
      const dot = (x, y, r) => { g.fillStyle = '#f4f4f0'; g.beginPath(); g.arc(tx(x), ty(y), m(r), 0, Math.PI * 2); g.fill(); };
      rect(-HX, -GL, HX, GL);
      line(-HX, 0, HX, 0);
      arc(0, 0, 9.15, 0, Math.PI * 2);
      dot(0, 0, 0.25);
      for (const s of [-1, 1]) {
        const y = s * GL;
        rect(-20.16, y, 20.16, y - s * 16.5); // ペナルティエリア
        rect(-9.16, y, 9.16, y - s * 5.5);    // ゴールエリア
        dot(0, y - s * 11, 0.22);            // ペナルティマーク
        // ペナルティアーク(エリアの外側だけ)
        const a = Math.acos(5.5 / 9.15);
        if (s > 0) arc(0, y - 11, 9.15, Math.PI / 2 - a, Math.PI / 2 + a);
        else arc(0, y + 11, 9.15, -Math.PI / 2 - a, -Math.PI / 2 + a);
        // コーナーアーク(半径 1m の四分円。キャンバスは y が下向き)
        for (const sx of [-1, 1]) {
          let a = sx > 0 ? Math.PI : 0, b = s > 0 ? Math.PI / 2 : -Math.PI / 2;
          if (Math.abs(a - b) > Math.PI) { if (a < b) a += Math.PI * 2; else b += Math.PI * 2; }
          arc(sx * HX, y, 1, Math.min(a, b), Math.max(a, b));
        }
      }
    });
  }

  function crowdTexture() {
    return canvasTex(512, 512, (g, w, h) => {
      const rows = 16, rh = h / rows;
      const shirts = ['#d32f2f', '#ffffff', '#c62828', '#1a237e', '#fdd835', '#ef5350', '#283593', '#212121', '#ffcdd2', '#90caf9'];
      for (let r = 0; r < rows; r++) {
        g.fillStyle = r % 2 ? '#24324a' : '#2b3b57';
        g.fillRect(0, r * rh, w, rh);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(0, r * rh + rh - 4, w, 4);
        for (let x = 2; x < w; x += 9) {
          if (Math.random() < 0.12) continue;
          const sx = x + (Math.random() - 0.5) * 3;
          g.fillStyle = shirts[(Math.random() * shirts.length) | 0];
          g.fillRect(sx, r * rh + rh * 0.45, 7, rh * 0.45);
          g.fillStyle = Math.random() < 0.8 ? '#e8bf9a' : '#6d4c41';
          g.beginPath(); g.arc(sx + 3.5, r * rh + rh * 0.32, 3, 0, Math.PI * 2); g.fill();
        }
      }
    }, true);
  }

  function skyTexture() {
    return canvasTex(2048, 512, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#060a1f');
      gr.addColorStop(0.35, '#16224f');
      gr.addColorStop(0.48, '#3a3a78');
      gr.addColorStop(0.5, '#7a5a7c');
      gr.addColorStop(0.52, '#1a1a2a');
      gr.addColorStop(1, '#0a0a12');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    });
  }

  function glowTexture() {
    return canvasTex(128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,240,1)');
      gr.addColorStop(0.2, 'rgba(255,250,220,0.8)');
      gr.addColorStop(0.5, 'rgba(255,240,200,0.18)');
      gr.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    });
  }

  // ゴールネットの網目(透過)
  function netTexture() {
    const t = canvasTex(128, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = 'rgba(240,240,240,0.95)';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(w / 2, 0); g.lineTo(w, h / 2); g.lineTo(w / 2, h); g.lineTo(0, h / 2); g.closePath();
      g.stroke();
    }, true);
    return t;
  }

  // ---------- スタジアム ----------
  // 角の丸い長方形の輪(内側の輪郭)。各点に外向きの法線を持たせる
  function roundRect(hx, hy, r) {
    const pts = [];
    const corners = [[hx - r, hy - r, 0], [-(hx - r), hy - r, Math.PI / 2], [-(hx - r), -(hy - r), Math.PI], [hx - r, -(hy - r), Math.PI * 1.5]];
    for (const [cx, cy, a0] of corners) {
      for (let i = 0; i <= 10; i++) {
        const a = a0 + (Math.PI / 2) * i / 10;
        pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) });
      }
    }
    pts.push({ ...pts[0] });
    let acc = 0;
    pts.forEach((p, i) => { if (i) acc += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y); p.s = acc; });
    return pts;
  }

  function strip(ring, fn, uvScale, mat) {
    const pos = [], uv = [], idx = [];
    const cols = fn.steps + 1;
    ring.forEach((p, i) => {
      for (let j = 0; j <= fn.steps; j++) {
        const u = j / fn.steps;
        const [d, hgt] = fn.at(u);
        pos.push(p.x + p.nx * d, hgt, -(p.y + p.ny * d));
        uv.push(p.s / uvScale, u * (fn.v || 1));
      }
      if (i) {
        for (let j = 0; j < fn.steps; j++) {
          const a = (i - 1) * cols + j, b = i * cols + j;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    return mesh;
  }

  function boardTexture() {
    return canvasTex(512, 64, (g, w, h) => {
      const words = ['OFFSIDE', 'FLAG UP!', 'TECH GYM', 'LINE', 'FOOTBALL'];
      const cols = ['#c8102e', '#0d1b4f', '#ffd400', '#0a7d3b', '#202020'];
      for (let i = 0; i < 4; i++) {
        g.fillStyle = cols[i % cols.length];
        g.fillRect(i * 128, 0, 128, h);
        g.fillStyle = i % 4 === 2 ? '#111' : '#fff';
        g.font = 'bold 30px sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(words[i % words.length], i * 128 + 64, h / 2 + 2, 120);
      }
    }, true);
  }

  function buildGoal(sy) {
    const postMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x333333 });
    const y = sy * GL;
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, GOAL_H, 10), postMat);
      post.position.copy(V(sx * GOAL_W, y, GOAL_H / 2));
      scene.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, GOAL_W * 2 + 0.12, 10), postMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.copy(V(0, y, GOAL_H));
    scene.add(bar);
    // 後ろの支柱
    const back = new THREE.MeshLambertMaterial({ color: 0xcfcfcf });
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), back);
      p.position.copy(V(sx * GOAL_W, y + sy * NET_D, 0.7));
      scene.add(p);
    }
    // ネット: 上は奥へ 1m、下は 2m
    const tex = netTexture();
    const mk = (w, h, rx, ry) => {
      const t = tex.clone(); t.needsUpdate = true; t.repeat.set(rx, ry);
      return new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.85 });
    };
    const D2 = NET_D, D1 = 1.0;
    // 背面(斜め)
    const slant = Math.hypot(D2 - D1, GOAL_H);
    const backNet = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W * 2, slant), mk(GOAL_W * 2, slant, GOAL_W * 2 / 0.25, slant / 0.25));
    backNet.position.copy(V(0, y + sy * (D1 + D2) / 2, GOAL_H / 2));
    backNet.rotation.y = sy > 0 ? 0 : Math.PI;
    backNet.rotateX(Math.atan2(D2 - D1, GOAL_H)); // 上が手前(ピッチ側)に来るよう傾ける
    scene.add(backNet);
    // 屋根
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W * 2, D1), mk(GOAL_W * 2, D1, GOAL_W * 2 / 0.25, D1 / 0.25));
    roof.rotation.x = -Math.PI / 2;
    roof.position.copy(V(0, y + sy * D1 / 2, GOAL_H));
    scene.add(roof);
    // 横(台形)
    for (const sx of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.lineTo(D2, 0); shape.lineTo(D1, GOAL_H); shape.lineTo(0, GOAL_H); shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      // UV を m 単位に
      const uvs = geo.attributes.uv;
      for (let i = 0; i < uvs.count; i++) uvs.setXY(i, geo.attributes.position.getX(i) / 0.25, geo.attributes.position.getY(i) / 0.25);
      const side = new THREE.Mesh(geo, mk(1, 1, 1, 1));
      side.position.copy(V(sx * GOAL_W, y, 0));
      side.rotation.y = sy > 0 ? Math.PI / 2 : -Math.PI / 2;
      scene.add(side);
    }
  }

  function buildStadium() {
    // 広告看板(ピッチの周り)
    const boards = roundRect(HX + 6, GL + 6, 3);
    strip(boards, { steps: 1, at: (u) => [0, u * 0.9] }, 16, new THREE.MeshBasicMaterial({ map: boardTexture(), side: THREE.DoubleSide }));

    // 観客席(すり鉢状)
    const ring = roundRect(HX + 10, GL + 10, 12);
    strip(ring, { steps: 10, v: 3, at: (u) => [1 + 30 * u, 1.5 + 22 * u] }, 22,
      new THREE.MeshLambertMaterial({ map: crowdTexture(), side: THREE.DoubleSide, emissive: 0x222838 }));
    strip(ring, { steps: 1, at: (u) => [0.5, u * 1.8] }, 4, new THREE.MeshLambertMaterial({ color: 0x1b2433, side: THREE.DoubleSide }));
    strip(ring, { steps: 1, at: (u) => [31, 23.5 + u * 6] }, 10, new THREE.MeshLambertMaterial({ color: 0x3a4660, side: THREE.DoubleSide }));
    strip(ring, { steps: 1, at: (u) => [31 - u * 18, 29.5 + u * 2] }, 10, new THREE.MeshLambertMaterial({ color: 0x252c3c, side: THREE.DoubleSide }));

    // 屋根の照明(ずらりと並ぶ光)
    for (let i = 0; i < ring.length - 1; i += 2) {
      const p = ring[i];
      const pos = V(p.x + p.nx * 13.5, p.y + p.ny * 13.5, 31.2);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(3, 0.6, 1.2), new THREE.MeshBasicMaterial({ color: 0xfffbe6 }));
      lamp.position.copy(pos);
      scene.add(lamp);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.position.copy(pos);
      sp.scale.set(16, 16, 1);
      scene.add(sp);
    }

    buildGoal(1);
    buildGoal(-1);

    // コーナーフラッグ
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const fp = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      fp.position.copy(V(sx * HX, sy * GL, 0.75));
      scene.add(fp);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.32), new THREE.MeshBasicMaterial({ color: 0xff3d3d, side: THREE.DoubleSide }));
      flag.position.copy(V(sx * HX + 0.23, sy * GL, 1.33));
      scene.add(flag);
    }

    // 両ゴール裏スタンド上の大型ビジョン
    const c = document.createElement('canvas');
    c.width = 512; c.height = 192;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    for (const sy of [-1, 1]) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(32, 12), new THREE.MeshBasicMaterial({ map: tex }));
      mesh.position.copy(V(0, sy * (GL + 50), 34));
      mesh.lookAt(V(0, 0, 20));
      scene.add(mesh);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(34, 14, 1), new THREE.MeshLambertMaterial({ color: 0x20242c }));
      frame.position.copy(V(0, sy * (GL + 50.8), 34));
      frame.lookAt(V(0, 0, 20));
      scene.add(frame);
    }
    screens = { canvas: c, tex, key: '' };
  }

  function updateScreens(state) {
    const key = `${state.phase}|${state.index}|${state.ok}|${state.traps}|${I18N.lang}`;
    if (key === screens.key) return;
    screens.key = key;
    const g = screens.canvas.getContext('2d');
    g.fillStyle = '#05070c'; g.fillRect(0, 0, 512, 192);
    g.fillStyle = '#ffd54f';
    g.font = 'bold 40px sans-serif';
    g.textAlign = 'center';
    g.fillText('OFFSIDE TRAP!', 256, 52);
    g.font = 'bold 34px sans-serif';
    g.fillStyle = '#ffffff';
    g.fillText(I18N.t('hud.play', { n: Math.min(state.index + 1, state.total), t: state.total }), 256, 108, 480);
    g.fillStyle = '#7fe0ff';
    g.font = 'bold 28px sans-serif';
    g.fillText(I18N.t('hud.ok', { n: state.ok }) + '   ' + I18N.t('hud.trap', { n: state.traps }), 256, 160, 480);
    screens.tex.needsUpdate = true;
  }

  // ---------- 人物 ----------
  // サッカーのユニフォーム。背中には背番号、胸にはエンブレム
  function jerseyTexture(c1, c2, num, numColor) {
    return canvasTex(128, 160, (g, w, h) => {
      g.fillStyle = c1; g.fillRect(0, 0, w, h);
      // 両脇のライン
      g.fillStyle = c2; g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h);
      if (num) {
        g.font = 'bold 92px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 6;
        g.strokeStyle = numColor === '#ffffff' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.6)';
        g.strokeText(num, w / 2, h / 2 + 6);
        g.fillStyle = numColor;
        g.fillText(num, w / 2, h / 2 + 6);
      }
    });
  }
  function frontTexture(c1, c2) {
    return canvasTex(128, 160, (g, w, h) => {
      g.fillStyle = c1; g.fillRect(0, 0, w, h);
      g.fillStyle = c2; g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h);
      // 襟
      g.beginPath(); g.moveTo(w / 2 - 22, 0); g.lineTo(w / 2, 22); g.lineTo(w / 2 + 22, 0); g.fillStyle = c2; g.fill();
      // エンブレム
      g.fillStyle = c2; g.beginPath(); g.arc(w * 0.68, h * 0.3, 10, 0, Math.PI * 2); g.fill();
    });
  }

  const TEAM = {
    home: { c1: '#d0102e', c2: '#ffffff', shorts: 0xffffff, socks: 0xd0102e, num: '#ffffff' },
    away: { c1: '#123a8c', c2: '#7fd4ff', shorts: 0x0b1f4f, socks: 0x123a8c, num: '#ffffff' },
    gk: { c1: '#ff9800', c2: '#1b1b1b', shorts: 0x1b1b1b, socks: 0xff9800, num: '#1b1b1b' },
    gk2: { c1: '#2fbf4a', c2: '#0d3b16', shorts: 0x0d3b16, socks: 0x2fbf4a, num: '#0d3b16' },
    ref: { c1: '#1b1b1b', c2: '#ffd400', shorts: 0x111111, socks: 0x111111, num: null },
  };
  const HAIR = [0x231a12, 0x1b1b1b, 0x5a3a1e, 0x2b1d10, 0x8a6b3e, 0x111111];

  // 前方 = ローカル +Z。体は 足元(body) → 腰から上(upper) の2段で曲げられる
  function makePlayer(team, num, hairIdx, gloves, flag) {
    const tm = TEAM[team];
    const plain = new THREE.MeshLambertMaterial({ color: new THREE.Color(tm.c1) });
    const shorts = new THREE.MeshLambertMaterial({ color: tm.shorts });
    const socks = new THREE.MeshLambertMaterial({ color: tm.socks });
    const skin = new THREE.MeshLambertMaterial({ color: hairIdx % 3 === 2 ? 0x9c6b47 : 0xd9a77f });
    const boot = new THREE.MeshLambertMaterial({ color: hairIdx % 2 ? 0x151515 : 0xf2f2f2 });
    const hair = new THREE.MeshLambertMaterial({ color: HAIR[hairIdx % HAIR.length] });
    const glove = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
    const root = new THREE.Group();
    root.rotation.order = 'YXZ';
    const body = new THREE.Group();
    body.rotation.order = 'YXZ';
    root.add(body);

    // 脚(付け根が回転軸)
    const mkLeg = (x) => {
      const leg = new THREE.Group();
      leg.position.set(x, 0.9, 0);
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.3, 0.21), shorts); thigh.position.y = -0.13;
      const knee = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.16, 0.17), skin); knee.position.y = -0.34;
      const sock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.38, 0.18), socks); sock.position.y = -0.6;
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.28), boot); shoe.position.set(0, -0.85, 0.05);
      leg.add(thigh, knee, sock, shoe);
      body.add(leg);
      return leg;
    };
    const legL = mkLeg(0.12), legR = mkLeg(-0.12);

    const upper = new THREE.Group();
    upper.position.set(0, 0.9, 0);
    body.add(upper);
    const front = new THREE.MeshLambertMaterial({ map: frontTexture(tm.c1, tm.c2) });
    const back = tm.num && num ? new THREE.MeshLambertMaterial({ map: jerseyTexture(tm.c1, tm.c2, num, tm.num) }) : plain;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.64, 0.28), [plain, plain, plain, plain, front, back]);
    torso.position.set(0, 0.35, 0);
    upper.add(torso);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.14), skin);
    neck.position.set(0, 0.72, 0);
    upper.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), skin);
    head.position.set(0, 0.87, 0.01);
    upper.add(head);
    const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.137, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hair);
    hairM.position.set(0, 0.89, -0.005);
    upper.add(hairM);

    const mkArm = (x) => {
      const arm = new THREE.Group();
      arm.position.set(x, 0.62, 0);
      const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.24, 0.15), plain); sleeve.position.y = -0.1;
      const fore = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.36, 0.12), gloves ? plain : skin); fore.position.y = -0.38;
      arm.add(sleeve, fore);
      if (gloves) { const gl = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), glove); gl.position.y = -0.6; arm.add(gl); }
      upper.add(arm);
      return arm;
    };
    const armL = mkArm(0.32), armR = mkArm(-0.32);
    // 副審の旗(右手に持つ。赤と黄色のチェック)
    if (flag) {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 6), new THREE.MeshLambertMaterial({ color: 0x333333 }));
      stick.position.set(0, -0.82, 0.04);
      armR.add(stick);
      const tex = canvasTex(64, 48, (g, w, h) => {
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { g.fillStyle = (i + j) % 2 ? '#ffd400' : '#e8102a'; g.fillRect(i * 16, j * 16, 16, 16); }
      });
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.3), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      fl.rotation.y = Math.PI / 2;
      fl.position.set(0, -1.0, 0.25);
      armR.add(fl);
    }
    // 両手の間(キーパーがボールを持つ位置)と、頭の上(スローインでボールを持つ位置)
    const hands = new THREE.Object3D();
    hands.position.set(0, 0.25, 0.35);
    upper.add(hands);
    const overHead = new THREE.Object3D();
    overHead.position.set(0, 1.12, -0.05);
    upper.add(overHead);

    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    scene.add(shadow);
    scene.add(root);
    return { root, body, upper, legL, legR, armL, armR, hands, overHead, shadow };
  }

  // 登場人物(キーは game.js の state.actors と同じ)
  // 自分たち(赤・守備)は d1〜d4(DF)・m1, m2(MF)・gk。相手(青・攻撃)は P(パサー)・R, R2(裏を狙う)・S(サポート)・ogk
  const ROSTER = {
    d1: ['home', '2', 0], d2: ['home', '4', 1], d3: ['home', '5', 2], d4: ['home', '3', 3], m1: ['home', '6', 4], m2: ['home', '8', 5],
    gk: ['gk', '1', 4, true],
    P: ['away', '10', 5], R: ['away', '9', 0], R2: ['away', '11', 2], S: ['away', '7', 1],
    ogk: ['gk2', '1', 3, true], ref: ['ref', null, 1], ar: ['ref', null, 3, false, true],
  };
  function buildPlayers() {
    for (const [k, [team, num, hair, gloves, flag]] of Object.entries(ROSTER)) {
      rigs[k] = makePlayer(team, num, hair, gloves, flag);
      rigs[k].root.scale.setScalar(k === 'gk' || k === 'ogk' ? 1.08 : 1.02);
    }
  }

  function buildBall() {
    // 白地に黒の五角形を散らしたサッカーボール
    const tex = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#f7f7f2'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#151515';
      const pent = (cx, cy, r) => {
        g.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.9;
          if (i) g.lineTo(x, y); else g.moveTo(x, y);
        }
        g.closePath(); g.fill();
      };
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 6; i++) pent(i * w / 6 + (row % 2) * w / 12 + 10, 20 + row * 44, 13);
      }
    });
    const geo = new THREE.SphereGeometry(BALL_R, 20, 14);
    ballMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, emissive: 0x333333 }));
    scene.add(ballMesh);
    ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.26, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
    ballShadow.rotation.x = -Math.PI / 2;
    scene.add(ballShadow);
  }

  // 目印: 足元の輪(色は game.js が決める)と、ピッチを横切るオフサイドライン
  function buildGuides() {
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 2;
      m.visible = false;
      scene.add(m);
      ringPool.push(m);
    }
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, 0.22), new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 3;
      m.visible = false;
      scene.add(m);
      linePool.push(m);
    }
  }

  // ---------- 花火(視線の先のスタンド上空) ----------
  // 途中で新しいジオメトリやシェーダーを作るとカクつくので、最初にまとめて用意して使い回す
  const ROCKET_T = 0.9;
  const FW_COLORS = [0xff5252, 0xffd740, 0x69f0ae, 0x40c4ff, 0xe040fb, 0xffffff, 0xff9100];
  const FW_MAX = 10, FW_N = 260;
  let clock = 0, glowTex = null;
  const pendingFw = [], rocketPool = [], burstPool = [];

  function buildFireworks() {
    for (let i = 0; i < FW_MAX + 2; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff3c0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      sp.scale.set(3, 3, 1);
      sp.visible = false;
      scene.add(sp);
      rocketPool.push({ sp, active: false, x: 0, y: 0, z0: 0, z1: 0, t: 0, big: false });
    }
    for (let i = 0; i < FW_MAX; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FW_N * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(FW_N * 3), 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 4, map: glowTex, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      pts.frustumCulled = false;
      pts.visible = false;
      scene.add(pts);
      const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      flash.scale.set(55, 55, 1);
      flash.visible = false;
      scene.add(flash);
      burstPool.push({ pts, flash, vel: new Float32Array(FW_N * 3), n: 0, t: 0, life: 2.4, active: false });
    }
  }

  function firework(delay, big) { pendingFw.push({ at: clock + delay, big }); }

  function spawnRocket(big) {
    const r = rocketPool.find((q) => !q.active);
    if (!r) return;
    // カメラの向いている方向のスタンドの上に打ち上げる
    const side = (Math.random() - 0.5) * 110;
    const dist = 90 + Math.random() * 30;
    const x = cam.x + cam.fx * dist + cam.fy * side, y = cam.y + cam.fy * dist - cam.fx * side;
    Object.assign(r, { active: true, x, y, z0: 32, z1: (big ? 72 : 60) + Math.random() * 22, t: 0, big });
    r.sp.visible = true;
  }

  const tmpColor1 = new THREE.Color(), tmpColor2 = new THREE.Color();
  function spawnBurst(x, y, z, big) {
    let bu = burstPool.find((q) => !q.active);
    if (!bu) bu = burstPool.reduce((a, q) => (q.t > a.t ? q : a));
    const n = big ? FW_N : 180;
    const pos = bu.pts.geometry.attributes.position.array, col = bu.pts.geometry.attributes.color.array, vel = bu.vel;
    tmpColor1.setHex(FW_COLORS[(Math.random() * FW_COLORS.length) | 0]);
    tmpColor2.setHex(FW_COLORS[(Math.random() * FW_COLORS.length) | 0]);
    const speed = big ? 36 : 28;
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const sv = speed * (0.85 + Math.random() * 0.3);
      vel[i * 3] = r * Math.cos(a) * sv; vel[i * 3 + 1] = u * sv; vel[i * 3 + 2] = r * Math.sin(a) * sv;
      pos[i * 3] = x; pos[i * 3 + 1] = z; pos[i * 3 + 2] = -y;
      const c = i % 3 === 0 ? tmpColor2 : tmpColor1;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    bu.pts.geometry.setDrawRange(0, n);
    bu.pts.geometry.attributes.position.needsUpdate = true;
    bu.pts.geometry.attributes.color.needsUpdate = true;
    bu.pts.material.size = big ? 4.5 : 3.6;
    bu.pts.material.opacity = 1;
    bu.pts.visible = true;
    bu.flash.material.color.copy(tmpColor1);
    bu.flash.material.opacity = 1;
    bu.flash.position.set(x, z, -y);
    bu.flash.visible = true;
    Object.assign(bu, { n, t: 0, active: true });
  }

  function updateFireworks(dt) {
    clock += dt;
    for (let i = pendingFw.length - 1; i >= 0; i--) {
      if (pendingFw[i].at <= clock) { spawnRocket(pendingFw[i].big); pendingFw.splice(i, 1); }
    }
    for (const r of rocketPool) {
      if (!r.active) continue;
      r.t += dt;
      const u = Math.min(1, r.t / ROCKET_T);
      const z = r.z0 + (r.z1 - r.z0) * (1 - (1 - u) * (1 - u));
      r.sp.position.set(r.x + Math.sin(r.t * 20) * 0.3, z, -r.y);
      if (u >= 1) {
        r.active = false; r.sp.visible = false;
        spawnBurst(r.x, r.y, z, r.big);
      }
    }
    const drag = Math.exp(-1.6 * dt), g = 5 * dt;
    for (const bu of burstPool) {
      if (!bu.active) continue;
      bu.t += dt;
      const arr = bu.pts.geometry.attributes.position.array, vel = bu.vel;
      for (let k = 0; k < bu.n * 3; k += 3) {
        vel[k] *= drag; vel[k + 1] = vel[k + 1] * drag - g; vel[k + 2] *= drag;
        arr[k] += vel[k] * dt; arr[k + 1] += vel[k + 1] * dt; arr[k + 2] += vel[k + 2] * dt;
      }
      bu.pts.geometry.attributes.position.needsUpdate = true;
      const fade = 1 - bu.t / bu.life;
      bu.pts.material.opacity = Math.max(0, fade < 0.4 ? fade / 0.4 * (0.6 + 0.4 * Math.random()) : 1);
      bu.flash.material.opacity = Math.max(0, 1 - bu.t * 4);
      if (bu.t >= bu.life) { bu.active = false; bu.pts.visible = false; bu.flash.visible = false; }
    }
  }

  // ---------- 初期化 ----------
  function init(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const touch = window.matchMedia('(pointer: coarse)').matches;
    quality.max = Math.min(dpr, touch ? 1.5 : 2);
    quality.pr = quality.max;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: 'high-performance' });
    renderer.setPixelRatio(quality.pr);
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0d1c);
    scene.fog = new THREE.Fog(0x141a33, 140, 420);
    camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 1200);
    glowTex = glowTexture();

    const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 24, 16), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }));
    scene.add(sky);
    const starPos = [];
    for (let i = 0; i < 500; i++) {
      const az = Math.random() * Math.PI * 2, el = 0.12 + Math.random() * 1.4;
      starPos.push(Math.cos(el) * Math.cos(az) * 700, Math.sin(el) * 700, Math.cos(el) * Math.sin(az) * 700);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 })));

    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a3a20, 1.6));
    const key = new THREE.DirectionalLight(0xfff4e0, 2.2);
    key.position.set(30, 80, 40);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xd0dcff, 0.9);
    fill.position.set(-40, 60, -80);
    scene.add(fill);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(GX * 2, GY * 2), new THREE.MeshLambertMaterial({ map: groundTexture() }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ color: 0x1a1f2a }));
    under.rotation.x = -Math.PI / 2;
    under.position.y = -0.05;
    scene.add(under);

    buildStadium();
    buildPlayers();
    buildBall();
    buildGuides();
    buildFireworks();
    prewarm();
    ready = true;
  }

  // 最初のプレー中に初めて表示する物(目印・花火)のシェーダーを先に準備しておく
  function prewarm() {
    const hidden = [];
    scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    renderer.compile(scene, camera);
    for (const o of hidden) o.visible = false;
  }

  // 重い端末では描画解像度を自動で下げる
  const quality = { max: 1, pr: 1, frames: 0, time: 0, warm: 0, w: 0, h: 0 };
  function adaptQuality(dt) {
    quality.warm += dt;
    if (quality.warm < 3 || quality.pr <= 1) return;
    quality.frames++; quality.time += dt;
    if (quality.time < 2) return;
    const avg = quality.time / quality.frames;
    quality.frames = 0; quality.time = 0;
    if (avg > 1 / 48) {
      quality.pr = Math.max(1, quality.pr - 0.25);
      renderer.setPixelRatio(quality.pr);
      renderer.setSize(quality.w, quality.h, false);
    }
  }

  function resize(cssW, cssH, logicalW) {
    if (!ready) return;
    quality.w = cssW; quality.h = cssH;
    W = logicalW;
    camera.aspect = cssW / cssH;
    camera.updateProjectionMatrix();
    renderer.setSize(cssW, cssH, false);
  }

  // ---------- 毎フレーム ----------
  const ease = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };

  // ワールドの向き (dx, dy) が、向き face の選手から見て左右どちらか(ローカル +x が +1)
  function localSide(face, dx, dy) {
    return Math.sign(dx * -Math.cos(face) + dy * Math.sin(face)) || 1;
  }

  function posePlayer(r, p, time) {
    r.root.visible = r.shadow.visible = p.visible !== false;
    if (!r.root.visible) return;
    r.root.position.set(p.x, 0, -p.y);
    r.root.rotation.y = Math.PI - p.face;
    const speed = Math.hypot(p.vx || 0, p.vy || 0);
    const b = r.body, u = r.upper;
    b.rotation.set(0, 0, 0); b.position.set(0, 0, 0);
    u.rotation.set(0, 0, 0);
    r.armL.rotation.set(0, 0, 0); r.armR.rotation.set(0, 0, 0);
    r.legL.rotation.set(0, 0, 0); r.legR.rotation.set(0, 0, 0);
    let shadowScale = 1;

    switch (p.mode) {
      case 'kick': { // 右足を振り上げて蹴る
        const t = p.t * (p.kickK || 1);
        const swing = t < 0.14 ? 0.9 * ease(t / 0.14) : t < 0.3 ? 0.9 - 2.5 * ease((t - 0.14) / 0.16) : -1.6 + 1.6 * ease((t - 0.3) / 0.4);
        r.legR.rotation.x = swing;
        r.legL.rotation.x = 0.1;
        u.rotation.x = t < 0.3 ? -0.15 : -0.15 * (1 - ease((t - 0.3) / 0.4));
        r.armL.rotation.z = 0.7; r.armR.rotation.z = -0.5;
        r.armL.rotation.x = -0.4 * Math.sign(swing);
        b.position.y = t > 0.14 && t < 0.4 ? 0.05 : 0;
        break;
      }
      case 'head': { // ジャンプしてヘディング
        const T = p.jumpT || 0.55, t = p.t * 0.55 / T, jt = Math.min(1, p.t / T);
        b.position.y = (p.jump || 0.75) * Math.sin(Math.PI * jt);
        u.rotation.x = t < 0.22 ? -0.4 * ease(t / 0.22) : -0.4 + 1.0 * ease((t - 0.22) / 0.12);
        r.armL.rotation.x = -0.9; r.armR.rotation.x = -0.9;
        r.armL.rotation.z = 0.5; r.armR.rotation.z = -0.5;
        r.legL.rotation.x = -0.5 * Math.sin(Math.PI * jt); r.legR.rotation.x = 0.3 * Math.sin(Math.PI * jt);
        shadowScale = 1 - 0.3 * Math.sin(Math.PI * jt);
        break;
      }
      case 'slide': { // スライディング: 後ろに倒れながら足を前に投げ出す
        const k = ease(p.t / 0.15) * (1 - ease((p.t - 0.6) / 0.3));
        b.rotation.x = -1.2 * k;
        b.position.y = 0.12 * k;
        r.legR.rotation.x = -0.35 * k;
        r.legL.rotation.x = 0.9 * k;
        r.armL.rotation.x = -0.6 * k; r.armL.rotation.z = 0.9 * k;
        r.armR.rotation.x = -0.6 * k; r.armR.rotation.z = -0.9 * k;
        u.rotation.x = 0.5 * k;
        shadowScale = 1 + 0.7 * k;
        break;
      }
      case 'dive': { // キーパーが横っ飛び
        const k = ease(p.t / 0.22);
        const side = localSide(p.face, p.diveX || 1, p.diveY || 0);
        b.rotation.z = -side * 1.35 * k;
        b.position.y = Math.max(0, (p.diveZ || 0.5) * Math.sin(Math.min(1, p.t / 0.5) * Math.PI));
        b.position.x = side * 0.3 * k;
        r.armL.rotation.x = -2.9; r.armR.rotation.x = -2.9;
        r.armL.rotation.z = side > 0 ? -0.2 : 0.4; r.armR.rotation.z = side > 0 ? -0.4 : 0.2;
        r.legL.rotation.z = 0.25; r.legR.rotation.z = -0.25;
        shadowScale = 1.6;
        break;
      }
      case 'catch': { // 高いボールを両手でキャッチ
        const jt = Math.min(1, p.t / 0.5);
        b.position.y = 0.45 * Math.sin(Math.PI * jt);
        r.armL.rotation.x = -2.7; r.armR.rotation.x = -2.7;
        r.armL.rotation.z = -0.15; r.armR.rotation.z = 0.15;
        r.legL.rotation.x = -0.6 * Math.sin(Math.PI * jt);
        break;
      }
      case 'hold': { // ボールを胸に抱える
        r.armL.rotation.x = -1.3; r.armR.rotation.x = -1.3;
        r.armL.rotation.z = -0.35; r.armR.rotation.z = 0.35;
        break;
      }
      case 'down': { // 倒れている
        b.rotation.x = -1.45;
        b.position.y = 0.05;
        r.armL.rotation.x = -2.4; r.armR.rotation.x = -2.6;
        shadowScale = 1.8;
        break;
      }
      case 'celebrate': { // 両腕を突き上げて喜ぶ
        r.armL.rotation.x = -3.0; r.armR.rotation.x = -3.0;
        r.armL.rotation.z = -0.35; r.armR.rotation.z = 0.35;
        b.position.y = Math.abs(Math.sin(time * 7 + (p.phase || 0))) * 0.18;
        break;
      }
      case 'sad': { // がっくりうなだれる
        u.rotation.x = 0.55;
        r.armL.rotation.z = 0.08; r.armR.rotation.z = -0.08;
        r.armL.rotation.x = 0.2; r.armR.rotation.x = 0.2;
        break;
      }
      case 'signal': { // 審判がゴールを認めてセンターを指す
        r.armR.rotation.x = -1.6; r.armR.rotation.z = 0.2;
        break;
      }
      case 'flag': { // 副審が旗をまっすぐ上げる(オフサイド)
        const k = ease(p.t / 0.2);
        r.armR.rotation.x = -3.05 * k;
        r.armL.rotation.z = 0.1;
        break;
      }
      case 'appeal': { // 片手を挙げてオフサイドをアピール
        const k = ease(p.t / 0.25);
        r.armR.rotation.x = -2.9 * k; r.armR.rotation.z = -0.15 * k;
        r.armL.rotation.x = -0.4 * k;
        break;
      }
      case 'throw': { // スローイン: 両手で頭の上にボール。投げる前に体を反らし、振り下ろす
        const w = p.windT || 0;
        const back = p.thrown ? -0.5 * (1 - ease(p.t / 0.35)) : -0.55 * ease(w / 0.45);
        u.rotation.x = back + (p.thrown ? 0.35 * Math.sin(Math.min(1, p.t / 0.35) * Math.PI) : 0);
        const arm = p.thrown ? -3.0 + 1.6 * ease(p.t / 0.35) : -3.0;
        r.armL.rotation.x = arm; r.armR.rotation.x = arm;
        r.armL.rotation.z = -0.2; r.armR.rotation.z = 0.2;
        break;
      }
      default: {
        const swing = Math.min(1, speed / 6) * 0.95;
        const ph = time * (6 + speed * 1.25) + (p.phase || 0);
        r.legL.rotation.x = Math.sin(ph) * swing;
        r.legR.rotation.x = -Math.sin(ph) * swing;
        r.armL.rotation.x = -Math.sin(ph) * swing * 0.8;
        r.armR.rotation.x = Math.sin(ph) * swing * 0.8;
        b.rotation.x = Math.min(0.28, speed * 0.03);
        b.position.y = Math.abs(Math.sin(ph)) * 0.05 * swing;
        if (p.crouch) { // キーパー・マーカーの構え
          u.rotation.x = 0.3; b.position.y -= 0.08;
          r.armL.rotation.x -= 0.6; r.armR.rotation.x -= 0.6;
          r.armL.rotation.z = 0.35; r.armR.rotation.z = -0.35;
        }
        if (p.jostle) { // 押し合い: 腕を相手に当てる
          r.armL.rotation.x = -0.9; r.armL.rotation.z = 0.5;
        }
      }
    }
    r.shadow.position.set(p.x, 0.03, -p.y);
    r.shadow.scale.setScalar(shadowScale);
  }

  function placeBall(state) {
    const ball = state.ball;
    ballMesh.visible = !!ball;
    ballShadow.visible = !!ball;
    if (!ball) return;
    const holder = ball.holder && rigs[(state.rigOf && state.rigOf[ball.holder]) || ball.holder];
    if (holder && holder.root.visible) {
      holder.root.updateMatrixWorld(true);
      (ball.overHead ? holder.overHead : holder.hands).getWorldPosition(ballMesh.position);
    } else {
      ballMesh.position.set(ball.x, ball.z, -ball.y); // ball.z はボールの中心の高さ
      ballMesh.rotation.set(ball.spinX || 0, ball.spinY || 0, 0);
    }
    ballShadow.position.set(ballMesh.position.x, 0.04, ballMesh.position.z);
    const h = Math.max(0, ballMesh.position.y);
    ballShadow.scale.setScalar(Math.max(0.45, 1 - h * 0.06));
    ballShadow.material.opacity = Math.max(0.22, 0.55 - h * 0.03);
  }

  function updateGuides(state) {
    const g = state.guide || {};
    const rings = g.rings || [], lines = g.lines || [];
    ringPool.forEach((m, i) => {
      const r = rings[i];
      m.visible = !!r;
      if (!r) return;
      m.position.set(r.x, 0.08 + i * 0.002, -r.y);
      m.material.color.setHex(r.color);
      const pulse = r.pulse ? 1 + 0.12 * Math.sin(state.time * 10) : 1;
      m.scale.setScalar((r.r || 1) * pulse);
      m.material.opacity = r.opacity != null ? r.opacity : 0.85;
    });
    linePool.forEach((m, i) => {
      const l = lines[i];
      m.visible = !!l;
      if (!l) return;
      m.position.set(0, 0.06 + i * 0.003, -l.y);
      m.material.color.setHex(l.color);
      m.material.opacity = l.opacity != null ? l.opacity : 0.9;
      m.scale.y = l.w || 1;
    });
  }

  function render(state, dt) {
    if (!ready) return;
    updateScreens(state);
    // state.rigOf: 選手B を入れ替えたとき、どの人形(背番号)で描くか
    const used = new Set();
    for (const [k, p] of Object.entries(state.actors)) {
      const r = rigs[(state.rigOf && state.rigOf[k]) || k];
      if (!r) continue;
      posePlayer(r, p, state.time);
      used.add(r);
    }
    for (const r of Object.values(rigs)) if (!used.has(r)) r.root.visible = r.shadow.visible = false;
    placeBall(state);
    updateGuides(state);
    updateFireworks(dt);
    adaptQuality(dt);

    // カメラ: 操作中の選手の背中越し。state.view が向きと注視点を決める
    const v = state.view;
    const snap = !cam.init || v.cut;
    cam.init = true;
    const k = snap ? 1 : 1 - Math.exp(-(v.turn || 4.5) * dt);
    cam.fx += (v.fx - cam.fx) * k; cam.fy += (v.fy - cam.fy) * k;
    const fl = Math.hypot(cam.fx, cam.fy) || 1; cam.fx /= fl; cam.fy /= fl;
    const ks = snap ? 1 : 1 - Math.exp(-3 * dt);
    cam.back += ((v.back || 6.5) - cam.back) * ks;
    cam.h += ((v.h || 2.9) - cam.h) * ks;
    const tx = v.x - cam.fx * cam.back, ty = v.y - cam.fy * cam.back;
    const kp = snap ? 1 : 1 - Math.exp(-8 * dt);
    cam.x += (tx - cam.x) * kp; cam.y += (ty - cam.y) * kp;
    const fov = v.fov || 50;
    cam.fov = snap ? fov : cam.fov + (fov - cam.fov) * ks;
    if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
    camera.position.set(cam.x, cam.h, -cam.y);
    const look = 30, pitch = v.pitch != null ? v.pitch : -0.04;
    cam.pitch = snap ? pitch : cam.pitch + (pitch - cam.pitch) * (1 - Math.exp(-2.5 * dt));
    camera.lookAt(cam.x + cam.fx * look, cam.h + Math.tan(cam.pitch) * look, -(cam.y + cam.fy * look));
    renderer.render(scene, camera);
  }

  const tmp = new THREE.Vector3();
  function project(x, y, z) {
    tmp.set(x, z, -y).project(camera);
    return { x: (tmp.x + 1) / 2 * W, y: (1 - tmp.y) / 2 * H, behind: tmp.z > 1 };
  }

  return {
    init, render, resize, project, firework, ROCKET_T, BALL_R,
    get camF() { return { x: cam.fx, y: cam.fy }; },
    get info() { return renderer.info; }, get pixelRatio() { return quality.pr; },
  };
})();
