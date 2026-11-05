// Glue between the ship system (const Ship, defined above by the bundle) and the game's native view.
// Additive only: reads globalThis.__chunkPreview / __wohNative / __geo and adds its own meshes and HUD.
// Ship frame: X east, Y north (m) relative to `ref` (playable metres: xM east, yM south).
(() => {
  'use strict';
  const DEG = Math.PI / 180, KEY_PREFIX = 'woh-ships-';
  const EVT = { captain_route_planned: '航路を決めた', captain_no_route: '', captain_tack: '帆の向きを替えた', captain_reef: '帆を絞った', captain_arriving: '目的地に近づいた', captain_arrived: '到着した', captain_replan: '浅瀬を避けて航路を引き直した', captain_cancelled: '航海をやめた', grounded: '座礁した', refloated: '離礁した', anchor_dropped: '錨を下ろした', anchor_raised: '錨を上げた', anchor_dragging: '錨が走っている', anchor_parted: '錨索が切れた' };
  let pickMode = false, destMarker = null, routeLine = null, cp, nat, THREE_, S = null, fleet = null, env = null, ref = null, ctl = {}, meshes = new Map(), boarded = null, speedX = 1, lastT = null, saveAcc = 0, trimAcc = 0, lastSeed = null;
  const REASON = { destination_too_shallow: 'そこは浅くて行けない', blocked: '回り込む道がない', search_limit: '遠すぎて航路を決められない' };
  const ui = {};
  const $ = (tag, props = {}, kids = []) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) e.append(k); return e; };

  const boot = setInterval(() => { cp = globalThis.__chunkPreview; nat = globalThis.__wohNative; THREE_ = globalThis.THREE; if (cp && nat?.scene && THREE_ && typeof Ship !== 'undefined') { clearInterval(boot); buildHud(); patchRender(); requestAnimationFrame(frame); } }, 500);

  // Read-only handles for tests and debugging.
  globalThis.__wohShips = { Ship, get lastSeed() { return lastSeed; }, get fleet() { return fleet; }, get env() { return env; }, get ref() { return ref; }, get boarded() { return boarded; }, spawn: (d) => spawn(d), board: (id) => board(id), disembark: () => disembark() };

  /** The game renders inside its own frame, so ship meshes and the boarded player are placed right before each render. */
  function patchRender() {
    const rd = nat.renderer, orig = rd.render.bind(rd);
    rd.render = function (sc, cam) { try { if (fleet && env && S === cp.state) { if (cp.view.overview) { if (sc === nat.scene) { syncOverview(); if (boarded) updateRoute(boarded); } } else if (sc === gameScene()) preRender(cam); } } catch (_) { /* never break the game's render */ } return orig(sc, cam); };
  }
  function preRender() { syncMeshes(); }

  function toast(text) { ui.toast.textContent = text; ui.toast.style.opacity = 1; clearTimeout(toast.t); toast.t = setTimeout(() => { ui.toast.style.opacity = 0; }, 3500); }

  // ---------- world / environment ----------
  function attach() {
    S = cp.state; fleet = null; env = null; ref = null; ctl = {}; boarded = null;
    for (const m of meshes.values()) disposeMesh(m);
    meshes.clear();
    for (const m of overviewMarkers.values()) { nat.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    overviewMarkers.clear();
    lastSeed = String(globalThis.__geo?.seed ?? '');
    fleet = Ship.createFleet({ nearRadiusM: 1500, farRadiusM: 20000 });
    for (const [id, d] of Object.entries(Ship.sampleDesigns)) fleet.registerDesign(id, d);
    try {
      const raw = localStorage.getItem(KEY_PREFIX + lastSeed), data = raw && JSON.parse(raw);
      if (data?.fleet && data.ref) { fleet.restore(data.fleet); ref = data.ref; ctl = data.ctl ?? {}; makeEnv(); toast(`船 ${fleet.list().length} 隻を読み込んだ`); }
    } catch (e) { console.warn('ship restore failed:', e && e.message); fleet = Ship.createFleet(); for (const [id, d] of Object.entries(Ship.sampleDesigns)) fleet.registerDesign(id, d); ref = null; }
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
        const e = elevAt(x, y); if (e !== null && pred(e, x, y)) return { xM: x, yM: y };
      }
    }
    return null;
  }

  /** Heading (deg, clockwise from north) with the longest run of open water, so a new ship faces the sea. */
  function openWaterHeading(xM, yM) {
    const T = S.terrain; let best = 0, bestD = -1;
    for (let h = 0; h < 360; h += 15) {
      const sx = Math.sin(h * DEG), sy = -Math.cos(h * DEG); // xM east, yM south
      let d = 0;
      for (; d < 3000; d += 40) {
        const x = xM + sx * d, y = yM + sy * d;
        if (x < 5 || y < 5 || x > T.widthM - 5 || y > T.heightM - 5) break;
        const e = elevAt(x, y); if (e === null || e > -6) break;
      }
      if (d > bestD) { bestD = d; best = h; }
    }
    return best;
  }

  // ---------- ship meshes ----------
  const gameScene = () => cp.character?.parent ?? nat.scene; // the native view has its own scene (the one the player marker lives in)
  function disposeMesh(m) { m.group.parent?.remove(m.group); m.group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); }
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
    gameScene().add(group);
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

  const overviewMarkers = new Map(), WB = 3000;
  function syncOverview() {
    const mpc = S.terrain.metersPerCell ?? 33.3, k = WB / (WB - 1);
    for (const rec of fleet.list()) {
      let m = overviewMarkers.get(rec.id);
      if (!m) {
        const geo = new THREE_.ConeGeometry(34, 100, 3); geo.rotateX(-Math.PI / 2);
        const mesh = new THREE_.Mesh(geo, new THREE_.MeshBasicMaterial({ color: boarded === rec.id ? 0x4cc2ff : 0xff6b4a, depthTest: false }));
        mesh.renderOrder = 101; mesh.rotation.order = 'YXZ'; nat.scene.add(mesh); m = mesh; overviewMarkers.set(rec.id, m);
      }
      const st = rec.vessel.state, bx = (ref.xM + st.X) / mpc, by = (ref.yM - st.Y) / mpc;
      m.position.set(bx * k - WB / 2, 25, by * k - WB / 2);
      m.rotation.y = -st.psi; m.material.color.setHex(boarded === rec.id ? 0x4cc2ff : 0xff6b4a); m.visible = true;
    }
    for (const id of [...overviewMarkers.keys()]) if (!fleet.has(id)) { const m = overviewMarkers.get(id); nat.scene.remove(m); m.geometry.dispose(); m.material.dispose(); overviewMarkers.delete(id); }
  }

  // ---------- actions ----------
  function spawn(designId) {
    const mp = cp.markerPoint; if (!mp) { toast('先にプレイヤーを置いてください'); return; }
    const spot = scan(mp.xM, mp.yM, (e, x, y) => e < -12 && [[60, 0], [-60, 0], [0, 60], [0, -60]].every(([dx, dy]) => (elevAt(x + dx, y + dy) ?? 0) < -10), 30000, 50);
    if (!spot) { toast('近くに十分深い海がない'); return; }
    if (!ref) { ref = { xM: spot.xM, yM: spot.yM }; makeEnv(); }
    const heading = openWaterHeading(spot.xM, spot.yM);
    const id = fleet.addShip({ designId, X: spot.xM - ref.xM, Y: ref.yM - spot.yM, headingDeg: heading });
    fleet.get(id).vessel.state.u = 1.5; // already under way, so the rudder bites
    ctl[id] = { heading, held: 0, auto: true, oar: 0.8 };
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
  function setDest(id, X, Y) {
    const r = fleet.setDestination(id, env, { X, Y });
    if (r.status !== 'ok') { toast('船長：' + (REASON[r.reason] ?? '行けない')); return false; }
    updateRoute(id); refreshList(); save(); return true;
  }
  function updateRoute(id) {
    const rec = id && fleet.has(id) ? fleet.get(id) : null, mpc = S.terrain.metersPerCell ?? 33.3, k = WB / (WB - 1);
    if (routeLine) { nat.scene.remove(routeLine); routeLine.geometry.dispose(); routeLine.material.dispose(); routeLine = null; }
    if (destMarker) { nat.scene.remove(destMarker); destMarker.geometry.dispose(); destMarker.material.dispose(); destMarker = null; }
    if (!rec?.captain?.destination || !['sailing', 'arriving'].includes(rec.captain.mode)) return;
    const toMap = (X, Y) => new THREE_.Vector3(((ref.xM + X) / mpc) * k - WB / 2, 22, ((ref.yM - Y) / mpc) * k - WB / 2);
    const pts = [toMap(rec.vessel.state.X, rec.vessel.state.Y), ...rec.captain.waypoints.slice(rec.captain.waypointIndex).map((w) => toMap(w.X, w.Y))];
    routeLine = new THREE_.Line(new THREE_.BufferGeometry().setFromPoints(pts), new THREE_.LineBasicMaterial({ color: 0xffe14a, depthTest: false })); routeLine.renderOrder = 102; nat.scene.add(routeLine);
    destMarker = new THREE_.Mesh(new THREE_.SphereGeometry(26, 10, 8), new THREE_.MeshBasicMaterial({ color: 0xffe14a, depthTest: false })); destMarker.renderOrder = 102;
    destMarker.position.copy(toMap(rec.captain.destination.X, rec.captain.destination.Y)); nat.scene.add(destMarker);
  }
  /** Overview tap -> destination: intersect the camera ray with the sea plane of the map scene. */
  function onMapTap(e) {
    if (!pickMode || !boarded || !cp.view.overview || !fleet?.has(boarded)) return;
    const el = nat.renderer.domElement, r = el.getBoundingClientRect(), cam = cp.camera;
    const ndc = new THREE_.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE_.Raycaster(); ray.setFromCamera(ndc, cam);
    const hit = new THREE_.Vector3(); if (!ray.ray.intersectPlane(new THREE_.Plane(new THREE_.Vector3(0, 1, 0), 0), hit)) return;
    const mpc = S.terrain.metersPerCell ?? 33.3, k = WB / (WB - 1), xM = ((hit.x + WB / 2) / k) * mpc, yM = ((hit.z + WB / 2) / k) * mpc;
    pickMode = false; setDest(boarded, xM - ref.xM, ref.yM - yM); toast('目的地を決めた'); refreshList();
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
      if (captainActive(rec)) { c.heading = v.snapshot().headingDeg; continue; }
      c.heading = (c.heading + c.held * 25 * dt * speedX + 360) % 360;
      v.setHeadingTarget(c.heading);
      if (v.oars.length) v.setAllOarEffort(c.oar);
    }
    trimAcc += dt; if (trimAcc > 1) { trimAcc = 0; for (const rec of fleet.list()) if (ctl[rec.id]?.auto && !captainActive(rec)) rec.vessel.autoTrim(env); }
    if (dt > 0) fleet.step(dt * speedX, env, focus);
    for (const e of fleet.takeEvents()) { if (e.type === 'captain_no_route') toast('船長：' + (REASON[e.reason] ?? '行けない')); else if (EVT[e.type]) toast(`${e.shipId}：${EVT[e.type]}`); }
    syncMeshes();
    if (boarded && fleet.has(boarded) && cp.view.overview) { const st = fleet.get(boarded).vessel.state; cp.placeMarker(ref.xM + st.X, ref.yM - st.Y, false); }
    if (boarded && fleet.has(boarded) && !cp.view.overview && meshes.has(boarded)) {
      // Put the player marker on the deck and move the orbit camera by the same amount, so the camera follows the ship rigidly.
      const st = fleet.get(boarded).vessel.state, xM = ref.xM + st.X, yM = ref.yM - st.Y, mk = cp.character, cam = cp.camera, o = mk.position.clone();
      cp.placeMarker(xM, yM, false);
      if (cp.markerPoint) {
        const q = S.terrain.toLocal(xM, yM, 0, S.origin), deck = meshes.get(boarded).deckY, ny = q.y + deck;
        cp.markerPoint.elevationM = deck; // the game keeps the marker at this height while the player stands still
        mk.position.set(q.x, ny, q.z);
        cam.position.x += q.x - o.x; cam.position.y += ny - o.y; cam.position.z += q.z - o.z;
      }
    }
    saveAcc += dt; if (saveAcc > 8) { saveAcc = 0; save(); }
    updateHud();
  }
  const captainActive = (rec) => !!rec.captain && ['sailing', 'arriving'].includes(rec.captain.mode);
  const posOf = (id) => { const s = fleet.get(id).vessel.state; return { X: s.X, Y: s.Y }; };

  // ---------- HUD ----------
  function buildHud() {
    const css = $('style', { textContent: `
#shipBtn,#shipPanel{position:fixed;z-index:120;left:calc(8px + env(safe-area-inset-left));font:12px/1.35 -apple-system,"Hiragino Sans",sans-serif;color:#e6edf3}
#shipBtn{top:calc(56px + env(safe-area-inset-top));padding:6px 10px;background:#132a40e8;border:1px solid #2e5576;border-radius:8px}
#shipPanel{top:calc(96px + env(safe-area-inset-top));width:min(300px,calc(100vw - 24px));max-height:calc(100vh - 260px);min-height:0;overflow:auto;background:#10202ff2;border:1px solid #2e5576;border-radius:10px;padding:8px;display:none;-webkit-user-select:none;user-select:none}
#shipBar{position:fixed;z-index:120;bottom:calc(8px + env(safe-area-inset-bottom));left:calc(150px + env(safe-area-inset-left));right:calc(240px + env(safe-area-inset-right));display:none;font:12px/1.3 -apple-system,"Hiragino Sans",sans-serif;color:#e6edf3;background:#10202ff2;border:1px solid #2e5576;border-radius:10px;padding:6px;-webkit-user-select:none;user-select:none}
#shipBar .info{font-size:11px;color:#9fc4de;margin-bottom:2px}#shipBar .btns{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
@media (max-width:720px){#shipBar{left:calc(8px + env(safe-area-inset-left));right:calc(8px + env(safe-area-inset-right));bottom:calc(150px + env(safe-area-inset-bottom))}}
#shipPanel{touch-action:pan-y;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
#shipPanel button,#shipBar button{background:#25415a;color:#e6edf3;border:1px solid #3b6288;border-radius:7px;padding:6px 9px;font-size:12px;min-height:30px;margin:2px 2px 2px 0}
#shipPanel button.on,#shipBar button.on{background:#4cc2ff;color:#04202e}#shipPanel h4{margin:6px 0 2px;font-size:12px;color:#7fc8f0}
#shipPanel .row{display:flex;align-items:center;gap:6px}#shipPanel input[type=range]{flex:1;min-width:0}
#shipToast{position:fixed;z-index:130;left:50%;bottom:calc(158px + env(safe-area-inset-bottom));transform:translateX(-50%);background:#000c;color:#fff;padding:6px 12px;border-radius:8px;font:13px sans-serif;opacity:0;transition:opacity .3s;pointer-events:none}` });
    ui.btn = $('button', { id: 'shipBtn', textContent: '⛵ 船' });
    ui.panel = $('div', { id: 'shipPanel', className: 'scrollable' });
    ui.toast = $('div', { id: 'shipToast' });
    ui.btn.onclick = () => { ui.panel.style.display = ui.panel.style.display === 'block' ? 'none' : 'block'; };
    ui.spawn = $('div', {}, [$('h4', { textContent: '船を出す（近くの海へ）' }),
      ...Object.keys(Ship.sampleDesigns).map((d) => $('button', { textContent: d === 'galleon' ? 'ガレオン' : 'ガレー', onclick: () => spawn(d) }))]);
    ui.list = $('div'); ui.ctrl = $('div', { className: 'btns' }); ui.info = $('div', { className: 'info' });
    ui.bar = $('div', { id: 'shipBar' }, [ui.info, ui.ctrl]);
    ui.panel.append(ui.spawn, ui.list);
    document.body.append(css, ui.btn, ui.panel, ui.bar, ui.toast);
    let down = null; const cv = nat.renderer.domElement;
    cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; }, true);
    cv.addEventListener('pointerup', (e) => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 && performance.now() - down.t < 500) onMapTap(e); down = null; }, true);
    ['pointerdown', 'pointermove', 'touchstart', 'touchmove', 'touchend', 'mousedown', 'wheel'].forEach((ev) => { for (const el of [ui.panel, ui.btn, ui.bar]) el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true}); });
  }
  function refreshList() {
    if (!ui.list) return;
    ui.list.replaceChildren($('h4', { textContent: '船' }), ...(fleet?.list() ?? []).map((r) => $('div', { className: 'row' }, [
      $('span', { textContent: `${r.id}（${r.designId === 'galley' ? 'ガレー' : 'ガレオン'}）`, style: 'flex:1' }),
      $('button', { textContent: boarded === r.id ? '降りる' : '乗る', className: boarded === r.id ? 'on' : '', onclick: () => (boarded === r.id ? disembark() : board(r.id)) }),
      $('button', { textContent: '消す', onclick: () => removeShip(r.id) })])));
    ui.ctrl.replaceChildren();
    ui.bar.style.display = boarded && fleet?.has(boarded) ? 'block' : 'none';
    if (!boarded || !fleet?.has(boarded)) return;
    const rec = fleet.get(boarded), c = ctl[boarded], v = rec.vessel;
    const hold = (label, dir) => { const b = $('button', { textContent: label }); const on = (e) => { e.preventDefault(); c.held = dir; }, off = () => { if (c.held === dir) c.held = 0; }; b.addEventListener('pointerdown', on); ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => b.addEventListener(t, off)); return b; };
    ui.ctrl.append(hold('◀ 左へ', -1), hold('右へ ▶', 1),
      $('button', { textContent: v.state.anchor ? '錨を上げる' : '錨を下ろす', onclick: () => { if (v.state.anchor) v.raiseAnchor(); else { const r = v.dropAnchor(env, { anchorKg: 400, rodeM: 60 }); if (r.status !== 'ok') toast('投錨できない：' + r.status); } refreshList(); } }));
    if (v.sails.length) ui.ctrl.append($('button', { textContent: c.auto ? '帆：自動' : '帆：固定', className: c.auto ? 'on' : '', onclick: () => { c.auto = !c.auto; refreshList(); } }));
    if (v.oars.length) { const r = $('input', { type: 'range', min: -100, max: 100, step: 5, value: Math.round(c.oar * 100) }); r.oninput = () => { c.oar = r.value / 100; }; ui.ctrl.append($('span', { textContent: '櫂' }), r); r.style.cssText = 'width:90px'; }
    const active = captainActive(rec);
    ui.ctrl.append($('button', { textContent: pickMode ? '地図をタップ…' : '目的地（俯瞰で指定）', className: pickMode ? 'on' : '', onclick: () => { pickMode = !pickMode; toast(pickMode ? '「UIを表示」→「世界を俯瞰」で地図を開き、行き先をタップ' : '指定をやめた'); refreshList(); } }),
      $('button', { textContent: '前方3km', onclick: () => { const st = v.state, h = st.psi; setDest(boarded, st.X + Math.sin(h) * 3000, st.Y + Math.cos(h) * 3000); } }));
    if (active) ui.ctrl.append($('button', { textContent: '航海をやめる', onclick: () => { fleet.cancelDestination(boarded); updateRoute(null); v.setHeadingTarget(null); ctl[boarded].heading = v.snapshot().headingDeg; refreshList(); } }));
    ui.ctrl.append($('button', { textContent: '降りる', onclick: () => disembark() }), $('button', { textContent: `倍速 ×${speedX}`, onclick: (e) => { speedX = speedX === 1 ? 4 : speedX === 4 ? 10 : 1; e.target.textContent = `倍速 ×${speedX}`; } }));
  }
  function updateHud() {
    if (!ui.info) return;
    if (!boarded || !fleet?.has(boarded)) { ui.info.textContent = ''; return; }
    const v = fleet.get(boarded).vessel, s = v.snapshot(), f = v.forces(env), c = ctl[boarded];
    const w = env.wind(v.state.X, v.state.Y, 0), wf = (Math.atan2(-w.x, -w.y) / DEG + 360) % 360;
    const cap = fleet.get(boarded).captain, dd = cap?.destination && Math.hypot(cap.destination.X - v.state.X, cap.destination.Y - v.state.Y), eta = dd ? Math.round(dd / Math.max(0.8, s.speedOverGround) / 60) : 0;
    const capTxt = cap && ['sailing', 'arriving'].includes(cap.mode) ? `／航海中 残り${dd > 1000 ? (dd / 1000).toFixed(1) + 'km' : Math.round(dd) + 'm'}（約${eta}分）${cap.reef < 1 ? '／帆を絞っている' : ''}` : cap?.mode === 'arrived' ? '／到着' : '';
    ui.info.textContent = `速度 ${(s.speedOverGround * 1.9438).toFixed(1)} kt／方位 ${s.headingDeg.toFixed(0)}°（目標 ${c.heading.toFixed(0)}°）／風 ${Math.hypot(w.x, w.y).toFixed(1)} m/s・${wf.toFixed(0)}°から／傾斜 ${s.heelDeg.toFixed(1)}°／水深余裕 ${f.clearanceM.toFixed(1)} m${s.aground ? '／座礁中' : ''}${s.anchored ? (s.anchorDragging ? '／走錨中' : '／錨泊中') : ''}${capTxt}`;
  }
})();
