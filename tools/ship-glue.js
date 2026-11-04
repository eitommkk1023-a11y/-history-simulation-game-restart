// Glue between the ship system (const Ship, defined above by the bundle) and the game's native view.
// Additive only: reads globalThis.__chunkPreview / __wohNative / __geo and adds its own meshes and HUD.
// Ship frame: X east, Y north (m) relative to `ref` (playable metres: xM east, yM south).
(() => {
  'use strict';
  const DEG = Math.PI / 180, KEY_PREFIX = 'woh-ships-';
  const EVT = { grounded: '座礁した', refloated: '離礁した', anchor_dropped: '錨を下ろした', anchor_raised: '錨を上げた', anchor_dragging: '錨が走っている', anchor_parted: '錨索が切れた' };
  let cp, nat, THREE_, S = null, fleet = null, env = null, ref = null, ctl = {}, meshes = new Map(), boarded = null, speedX = 1, lastT = null, saveAcc = 0, trimAcc = 0, lastSeed = null;
  const ui = {};
  const $ = (tag, props = {}, kids = []) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) e.append(k); return e; };

  const boot = setInterval(() => { cp = globalThis.__chunkPreview; nat = globalThis.__wohNative; THREE_ = globalThis.THREE; if (cp && nat?.scene && THREE_ && typeof Ship !== 'undefined') { clearInterval(boot); buildHud(); patchRender(); requestAnimationFrame(frame); } }, 500);

  // Read-only handles for tests and debugging.
  globalThis.__wohShips = { get fleet() { return fleet; }, get env() { return env; }, get ref() { return ref; }, get boarded() { return boarded; }, spawn: (d) => spawn(d), board: (id) => board(id), disembark: () => disembark() };

  /** The game renders inside its own frame, so ship meshes and the boarded player are placed right before each render. */
  function patchRender() {
    const rd = nat.renderer, orig = rd.render.bind(rd);
    rd.render = function (sc, cam) { try { if (fleet && env && S === cp.state) preRender(); } catch (_) { /* never break the game's render */ } return orig(sc, cam); };
  }
  function preRender() {
    syncMeshes();
    if (boarded && fleet.has(boarded) && meshes.has(boarded)) {
      const st = fleet.get(boarded).vessel.state, q = S.terrain.toLocal(ref.xM + st.X, ref.yM - st.Y, 0, S.origin);
      cp.character.position.set(q.x, q.y + meshes.get(boarded).deckY, q.z);
      nat.updateCamera?.();
    }
  }

  function toast(text) { ui.toast.textContent = text; ui.toast.style.opacity = 1; clearTimeout(toast.t); toast.t = setTimeout(() => { ui.toast.style.opacity = 0; }, 3500); }

  // ---------- world / environment ----------
  function attach() {
    S = cp.state; fleet = null; env = null; ref = null; ctl = {}; boarded = null;
    for (const m of meshes.values()) disposeMesh(m);
    meshes.clear();
    lastSeed = String(globalThis.__geo?.seed ?? '');
    fleet = Ship.createFleet({ nearRadiusM: 1500, farRadiusM: 20000 });
    for (const [id, d] of Object.entries(Ship.sampleDesigns)) fleet.registerDesign(id, d);
    try {
      const raw = localStorage.getItem(KEY_PREFIX + lastSeed), data = raw && JSON.parse(raw);
      if (data?.fleet && data.ref) { fleet.restore(data.fleet); ref = data.ref; ctl = data.ctl ?? {}; makeEnv(); toast(`船 ${fleet.list().length} 隻を読み込んだ`); }
    } catch (e) { fleet = Ship.createFleet(); for (const [id, d] of Object.entries(Ship.sampleDesigns)) fleet.registerDesign(id, d); ref = null; }
    refreshList();
  }
  function makeEnv() {
    const T = S.terrain, mpc = T.metersPerCell ?? 33.3;
    const base = Ship.createWorldEnvironment(S.world, { origin: { x: ref.xM / mpc, y: ref.yM / mpc }, blockM: mpc, dayAt: () => globalThis.__geo?.clock?.day ?? 0 });
    const cache = new Map();
    env = {
      wind: base.wind, current: base.current, seabed: base.seabed,
      depth(X, Y) {
        const xM = ref.xM + X, yM = ref.yM - Y, k = Math.round(xM / 3) + ',' + Math.round(yM / 3);
        if (cache.has(k)) return cache.get(k);
        let d = 0;
        if (xM >= 0 && yM >= 0 && xM <= T.widthM && yM <= T.heightM) { try { const e = T.sampleBase(xM, yM).baseElevationM; d = e < 0 ? -e : 0; } catch (_) { d = 0; } }
        if (cache.size > 4000) cache.clear();
        cache.set(k, d); return d;
      },
    };
  }
  const elevAt = (xM, yM) => { try { return S.terrain.sampleBase(xM, yM).baseElevationM; } catch (_) { return null; } };
  /** Ring search around (xM, yM): spacing grows with the radius so far searches stay cheap. */
  function scan(xM, yM, pred, maxR, step) {
    const T = S.terrain;
    for (let r = 0; r <= maxR; r += Math.max(step, r / 10)) {
      const sp = Math.max(step, r / 10);
      for (let a = 0, n = Math.max(1, Math.round(2 * Math.PI * r / sp)); a < n; a++) {
        const th = a / n * 2 * Math.PI, x = xM + r * Math.cos(th), y = yM + r * Math.sin(th);
        if (x < 5 || y < 5 || x > T.widthM - 5 || y > T.heightM - 5) continue;
        const e = elevAt(x, y); if (e !== null && pred(e)) return { xM: x, yM: y };
      }
    }
    return null;
  }

  // ---------- ship meshes ----------
  function disposeMesh(m) { nat.scene.remove(m.group); m.group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); }
  function makeMesh(rec) {
    const d = Ship.sampleDesigns[rec.designId] ?? null, hull = Ship.createHull(d.hull), mesh = Ship.buildHullMesh(hull);
    const g = new THREE_.BufferGeometry();
    g.setAttribute('position', new THREE_.BufferAttribute(mesh.positions, 3)); g.setAttribute('normal', new THREE_.BufferAttribute(mesh.normals, 3)); g.setIndex(new THREE_.BufferAttribute(mesh.indices, 1));
    const hullMesh = new THREE_.Mesh(g, new THREE_.MeshStandardMaterial({ color: 0x8a6a3f, roughness: 0.9, metalness: 0 }));
    const inner = new THREE_.Group(); inner.add(hullMesh);
    const L = hull.xMax - hull.xMin, p = rec.vessel.params, top = hull.sectionAt((hull.xMin + hull.xMax) / 2).slice(-1)[0].z;
    inner.position.set(0, -p.draftM, p.cgX - hull.xMin);
    const sails = [];
    for (const s of rec.vessel.sails) {
      const mastH = Math.max(8, s.zCe * 1.5), zMast = -(s.x - hull.xMin);
      const mast = new THREE_.Mesh(new THREE_.CylinderGeometry(0.25, 0.35, mastH, 6), new THREE_.MeshStandardMaterial({ color: 0x5a432a }));
      mast.position.set(0, top + mastH / 2, zMast); inner.add(mast);
      const side = Math.sqrt(s.areaM2), pivot = new THREE_.Group(); pivot.position.set(0, top + mastH * 0.35, zMast);
      const sailGeo = new THREE_.PlaneGeometry(side * 1.0, side * 0.9); sailGeo.rotateY(Math.PI / 2); sailGeo.translate(0, 0, side * 0.5);
      const sail = new THREE_.Mesh(sailGeo, new THREE_.MeshStandardMaterial({ color: 0xf1ead8, side: THREE_.DoubleSide, roughness: 1 }));
      pivot.add(sail); inner.add(pivot); sails.push({ sail: s, pivot });
    }
    const group = new THREE_.Group(); group.rotation.order = 'YXZ'; group.add(inner); group.frustumCulled = false;
    nat.scene.add(group);
    return { group, sails, deckY: top - p.draftM + 0.1, L };
  }
  function syncMeshes() {
    const T = S.terrain;
    for (const rec of fleet.list()) {
      let m = meshes.get(rec.id);
      if (!m) { m = makeMesh(rec); meshes.set(rec.id, m); }
      const st = rec.vessel.state, xM = ref.xM + st.X, yM = ref.yM - st.Y;
      try { const q = T.toLocal(xM, yM, 0, S.origin); m.group.position.set(q.x, q.y, q.z); m.group.visible = true; } catch (_) { m.group.visible = false; continue; }
      m.group.rotation.set(0, -st.psi, -st.heelDeg * DEG);
      for (const { sail, pivot } of m.sails) { pivot.rotation.y = sail.trimDeg * DEG; pivot.scale.set(1, Math.max(0.05, sail.deployed), 1); }
    }
    for (const id of [...meshes.keys()]) if (!fleet.has(id)) { disposeMesh(meshes.get(id)); meshes.delete(id); }
  }

  // ---------- actions ----------
  function spawn(designId) {
    const mp = cp.markerPoint; if (!mp) { toast('先にプレイヤーを置いてください'); return; }
    const spot = scan(mp.xM, mp.yM, (e) => e < -7, 30000, 50);
    if (!spot) { toast('近くに十分深い海がない'); return; }
    if (!ref) { ref = { xM: spot.xM, yM: spot.yM }; makeEnv(); }
    const id = fleet.addShip({ designId, X: spot.xM - ref.xM, Y: ref.yM - spot.yM, headingDeg: 0 });
    ctl[id] = { heading: 0, held: 0, auto: true, oar: 0.8 };
    toast(`${id}（${designId}）を海に出した`); refreshList(); save();
  }
  function board(id) {
    const rec = fleet.get(id), m = meshes.get(id); if (!m) return;
    boarded = id; refreshList(); toast(`${id} に乗った`);
  }
  function disembark() {
    if (!boarded) return;
    const rec = fleet.get(boarded), st = rec.vessel.state, xM = ref.xM + st.X, yM = ref.yM - st.Y;
    const land = scan(xM, yM, (e) => e > 1, 6000, 25);
    if (!land) { toast('近くに降りられる陸がない'); return; }
    cp.placeMarker(land.xM, land.yM, true); boarded = null; refreshList(); toast('陸に降りた');
  }
  function removeShip(id) { fleet.removeShip(id); delete ctl[id]; if (boarded === id) boarded = null; refreshList(); save(); }

  function save() {
    if (!fleet || !ref) return;
    try { localStorage.setItem(KEY_PREFIX + lastSeed, JSON.stringify({ fleet: fleet.serialize(), ref, ctl })); } catch (_) { /* storage unavailable */ }
  }

  // ---------- frame loop ----------
  function frame(t) {
    requestAnimationFrame(frame);
    const dt = lastT === null ? 0 : Math.min((t - lastT) / 1000, 0.1); lastT = t;
    if (cp.state !== S || !fleet) { if (cp.state) attach(); else return; }
    if (!fleet.list().length || !env || document.hidden) { updateHud(); return; }
    const mp = cp.markerPoint, focus = boarded ? posOf(boarded) : mp ? { X: mp.xM - ref.xM, Y: ref.yM - mp.yM } : null;
    for (const rec of fleet.list()) {
      const c = ctl[rec.id] ??= { heading: rec.vessel.snapshot().headingDeg, held: 0, auto: true, oar: 0.8 }, v = rec.vessel;
      c.heading = (c.heading + c.held * 25 * dt * speedX + 360) % 360;
      v.steerTowards(c.heading);
      if (v.oars.length) v.setAllOarEffort(c.oar);
    }
    trimAcc += dt; if (trimAcc > 1) { trimAcc = 0; for (const rec of fleet.list()) if (ctl[rec.id]?.auto) rec.vessel.autoTrim(env); }
    if (dt > 0) fleet.step(dt * speedX, env, focus);
    for (const e of fleet.takeEvents()) if (EVT[e.type]) toast(`${e.shipId}：${EVT[e.type]}`);
    if (boarded && fleet.has(boarded)) { const st = fleet.get(boarded).vessel.state; cp.placeMarker(ref.xM + st.X, ref.yM - st.Y, false); }
    saveAcc += dt; if (saveAcc > 8) { saveAcc = 0; save(); }
    updateHud();
  }
  const posOf = (id) => { const s = fleet.get(id).vessel.state; return { X: s.X, Y: s.Y }; };

  // ---------- HUD ----------
  function buildHud() {
    const css = $('style', { textContent: `
#shipBtn,#shipPanel{position:fixed;z-index:120;left:calc(8px + env(safe-area-inset-left));font:12px/1.35 -apple-system,"Hiragino Sans",sans-serif;color:#e6edf3}
#shipBtn{top:calc(56px + env(safe-area-inset-top));padding:6px 10px;background:#132a40e8;border:1px solid #2e5576;border-radius:8px}
#shipPanel{top:calc(96px + env(safe-area-inset-top));width:min(300px,calc(100vw - 24px));max-height:calc(100vh - 150px);overflow:auto;background:#10202ff2;border:1px solid #2e5576;border-radius:10px;padding:8px;display:none;-webkit-user-select:none;user-select:none}
#shipPanel button{background:#25415a;color:#e6edf3;border:1px solid #3b6288;border-radius:7px;padding:6px 9px;font-size:12px;min-height:30px;margin:2px 2px 2px 0}
#shipPanel button.on{background:#4cc2ff;color:#04202e}#shipPanel h4{margin:6px 0 2px;font-size:12px;color:#7fc8f0}
#shipPanel .row{display:flex;align-items:center;gap:6px}#shipPanel input[type=range]{flex:1;min-width:0}
#shipToast{position:fixed;z-index:130;left:50%;bottom:calc(90px + env(safe-area-inset-bottom));transform:translateX(-50%);background:#000c;color:#fff;padding:6px 12px;border-radius:8px;font:13px sans-serif;opacity:0;transition:opacity .3s;pointer-events:none}` });
    ui.btn = $('button', { id: 'shipBtn', textContent: '⛵ 船' });
    ui.panel = $('div', { id: 'shipPanel' });
    ui.toast = $('div', { id: 'shipToast' });
    ui.btn.onclick = () => { ui.panel.style.display = ui.panel.style.display === 'block' ? 'none' : 'block'; };
    ui.spawn = $('div', {}, [$('h4', { textContent: '船を出す（近くの海へ）' }),
      ...Object.keys(Ship.sampleDesigns).map((d) => $('button', { textContent: d === 'galleon' ? 'ガレオン' : 'ガレー', onclick: () => spawn(d) }))]);
    ui.list = $('div'); ui.ctrl = $('div'); ui.info = $('div', { style: 'margin-top:4px;color:#9fc4de' });
    ui.panel.append(ui.spawn, ui.list, ui.ctrl, ui.info);
    document.body.append(css, ui.btn, ui.panel, ui.toast);
    ['pointerdown', 'touchstart', 'mousedown', 'wheel'].forEach((ev) => { ui.panel.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }); ui.btn.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }); });
  }
  function refreshList() {
    if (!ui.list) return;
    ui.list.replaceChildren($('h4', { textContent: '船' }), ...(fleet?.list() ?? []).map((r) => $('div', { className: 'row' }, [
      $('span', { textContent: `${r.id}（${r.designId === 'galley' ? 'ガレー' : 'ガレオン'}）`, style: 'flex:1' }),
      $('button', { textContent: boarded === r.id ? '降りる' : '乗る', className: boarded === r.id ? 'on' : '', onclick: () => (boarded === r.id ? disembark() : board(r.id)) }),
      $('button', { textContent: '消す', onclick: () => removeShip(r.id) })])));
    ui.ctrl.replaceChildren();
    if (!boarded || !fleet?.has(boarded)) return;
    const rec = fleet.get(boarded), c = ctl[boarded], v = rec.vessel;
    const hold = (label, dir) => { const b = $('button', { textContent: label }); const on = (e) => { e.preventDefault(); c.held = dir; }, off = () => { if (c.held === dir) c.held = 0; }; b.addEventListener('pointerdown', on); ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => b.addEventListener(t, off)); return b; };
    ui.ctrl.append($('h4', { textContent: `操縦：${boarded}` }), hold('◀ 左へ', -1), hold('右へ ▶', 1),
      $('button', { textContent: v.state.anchor ? '錨を上げる' : '錨を下ろす', onclick: () => { if (v.state.anchor) v.raiseAnchor(); else { const r = v.dropAnchor(env, { anchorKg: 400, rodeM: 60 }); if (r.status !== 'ok') toast('投錨できない：' + r.status); } refreshList(); } }));
    if (v.sails.length) ui.ctrl.append($('button', { textContent: c.auto ? '帆：自動' : '帆：固定', className: c.auto ? 'on' : '', onclick: () => { c.auto = !c.auto; refreshList(); } }));
    if (v.oars.length) { const r = $('input', { type: 'range', min: -100, max: 100, step: 5, value: Math.round(c.oar * 100) }); r.oninput = () => { c.oar = r.value / 100; }; ui.ctrl.append($('div', { className: 'row' }, [$('span', { textContent: '櫂' }), r])); }
    ui.ctrl.append($('button', { textContent: `倍速 ×${speedX}`, onclick: (e) => { speedX = speedX === 1 ? 4 : speedX === 4 ? 10 : 1; e.target.textContent = `倍速 ×${speedX}`; } }));
  }
  function updateHud() {
    if (!ui.info || ui.panel.style.display !== 'block') return;
    if (!boarded || !fleet?.has(boarded)) { ui.info.textContent = ''; return; }
    const v = fleet.get(boarded).vessel, s = v.snapshot(), f = v.forces(env), c = ctl[boarded];
    const w = env.wind(v.state.X, v.state.Y, 0), wf = (Math.atan2(-w.x, -w.y) / DEG + 360) % 360;
    ui.info.textContent = `速度 ${(s.speedOverGround * 1.9438).toFixed(1)} kt／方位 ${s.headingDeg.toFixed(0)}°（目標 ${c.heading.toFixed(0)}°）／風 ${Math.hypot(w.x, w.y).toFixed(1)} m/s・${wf.toFixed(0)}°から／傾斜 ${s.heelDeg.toFixed(1)}°／水深余裕 ${f.clearanceM.toFixed(1)} m${s.aground ? '／座礁中' : ''}${s.anchored ? (s.anchorDragging ? '／走錨中' : '／錨泊中') : ''}`;
  }
})();
