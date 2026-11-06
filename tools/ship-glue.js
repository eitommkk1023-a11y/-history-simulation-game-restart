// Glue between the ship system (const Ship, defined above by the bundle) and the game's native view.
// Additive only: reads globalThis.__chunkPreview / __wohNative / __geo and adds its own meshes and HUD.
// Ship frame: X east, Y north (m) relative to `ref` (playable metres: xM east, yM south).
(() => {
  'use strict';
  const DEG = Math.PI / 180, KEY_PREFIX = 'woh-ships-';
  const EVT = { captain_route_planned: '航路を決めた', captain_no_route: '', captain_tack: '帆の向きを替えた', captain_reef: '帆を絞った', captain_arriving: '目的地に近づいた', captain_arrived: '到着した', captain_replan: '浅瀬を避けて航路を引き直した', captain_cancelled: '航海をやめた', grounded: '座礁した', refloated: '離礁した', anchor_dropped: '錨を下ろした', anchor_raised: '錨を上げた', anchor_dragging: '錨が走っている', anchor_parted: '錨索が切れた' };
  const dbg = {}; let savedShips = null, pendingBoard = null, pendingSince = 0, lastPlaced = null, uiHidden = false, dwell = 0, renderError = null, ladderSig = '', pickMode = false, destMarker = null, routeLine = null, cp, nat, THREE_, S = null, fleet = null, env = null, ref = null, ctl = {}, meshes = new Map(), boarded = null, speedX = 1, lastT = null, saveAcc = 0, trimAcc = 0, lastSeed = null;
  const REASON = { destination_too_shallow: 'そこは浅くて行けない', blocked: '回り込む道がない', search_limit: '遠すぎて航路を決められない' };
  const ui = {};
  const $ = (tag, props = {}, kids = []) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) e.append(k); return e; };

  const boot = setInterval(() => { cp = globalThis.__chunkPreview; nat = globalThis.__wohNative; THREE_ = globalThis.THREE; if (cp && nat?.scene && THREE_ && typeof Ship !== 'undefined') { clearInterval(boot); nat.renderer.localClippingEnabled = true; installSaveBridge(); buildHud(); patchRender(); patchWalker(); requestAnimationFrame(frame); } }, 500);

  // Read-only handles for tests and debugging.
  globalThis.__wohShips = { dbg, get renderError() { return renderError && String(renderError.stack || renderError).slice(0, 400); }, mesh: (id) => meshes.get(id), Ship, get lastSeed() { return lastSeed; }, get fleet() { return fleet; }, get env() { return env; }, get ref() { return ref; }, get boarded() { return boarded; }, spawn: (d) => spawn(d), board: (id) => board(id), disembark: () => disembark() };

  /** The game renders inside its own frame, so ship meshes and the boarded player are placed right before each render. */
  function patchRender() {
    const rd = nat.renderer, orig = rd.render.bind(rd);
    rd.render = function (sc, cam) { try { if (fleet && env && S === cp.state) { if (cp.view.overview) { if (sc === nat.scene) { syncOverview(); if (boarded) updateRoute(boarded); } } else if (sc === gameScene()) preRender(cam); } } catch (e) { renderError = e; /* never break the game's render */ } return orig(sc, cam); };
  }
  /** Just before every render: update the ships, and while aboard put the player on the deck and the orbit camera around the player. */
  function preRender(cam) {
    syncMeshes();
    if (!boarded || !fleet.has(boarded) || !meshes.has(boarded)) return;
    const mk = cp.character, w = deckPoint(meshes.get(boarded)), v = cp.view;
    mk.position.copy(w);
    if (globalThis.__wohFirstPerson) { // first-person view (V key): eye height above the deck, looking along yaw/pitch (same formula as the game)
      const eye = w.clone(); eye.y += 1.58; const cpch = Math.cos(v.pitch);
      cam.position.copy(eye); cam.lookAt(eye.x - cpch * Math.sin(v.yaw), eye.y - Math.sin(v.pitch), eye.z - cpch * Math.cos(v.yaw));
      ceilingFor(meshes.get(boarded), cam); return;
    }
    const r = globalThis.__wohCamDist || 4, target = w.clone(); target.y += 1.2; // the game's own orbit around the player
    cam.position.set(target.x + r * Math.cos(v.pitch) * Math.sin(v.yaw), target.y + r * Math.sin(v.pitch), target.z + r * Math.cos(v.pitch) * Math.cos(v.yaw)); cam.lookAt(target);
    ceilingFor(meshes.get(boarded), cam);
  }
  /** Below deck the upper deck is cut away only while the camera is above it; a camera inside the hull (first person, low orbit) sees the deck as a ceiling. */
  function ceilingFor(m, cam) {
    if (m.cutY == null) return;
    const local = m.group.worldToLocal(cam.position.clone());
    if (local.y < m.cutY) { m.cutPlane.normal.set(0, -1, 0); m.cutPlane.constant = 1e6; }
  }

  function toast(text) { ui.toast.textContent = text; ui.toast.style.opacity = 1; clearTimeout(toast.t); toast.t = setTimeout(() => { ui.toast.style.opacity = 0; }, 3500); }

  /**
   * Ships in the game's own save/load. The game already stores a player block (__wohPlayerSave) and hands it back as
   * __wohNative.pendingPlayer on load, so the fleet travels with it: no edit of the game itself is needed.
   * (Our own localStorage copy stays as a fallback for worlds that were never saved through the game's menu.)
   */
  function installSaveBridge() {
    const orig = typeof window.__wohPlayerSave === 'function' ? window.__wohPlayerSave : null;
    window.__wohPlayerSave = () => {
      const p = orig ? orig() : null;
      if (!p || !fleet || !ref) return p;
      try { return { ...p, ships: { fleet: fleet.serialize(), ref, ctl, boarded, seed: lastSeed } }; } catch (_) { return p; }
    };
    let held = nat.pendingPlayer;
    Object.defineProperty(nat, 'pendingPlayer', { configurable: true, enumerable: true, get: () => held, set: (v) => { held = v; if (v && typeof v === 'object') savedShips = { ships: v.ships ?? null }; } });
  }
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
      let data;
      if (savedShips) { data = savedShips.ships && String(savedShips.ships.seed ?? lastSeed) === lastSeed ? savedShips.ships : null; savedShips = null; } // the game's own save was loaded: its ships (or none) win
      else { const raw = localStorage.getItem(KEY_PREFIX + lastSeed); data = raw && JSON.parse(raw); }
      if (data?.fleet && data.ref) { const r = fleet.restore(data.fleet, { current: Ship.sampleDesigns }); ref = data.ref; ctl = data.ctl ?? {}; pendingBoard = data.boarded ?? null; pendingSince = performance.now(); makeEnv(); toast(`船 ${r.restored} 隻を読み込んだ` + (r.skipped.length ? `（古い船 ${r.skipped.length} 隻は読み込めず外した）` : '')); }
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
  function disposeMesh(m) { m.group.parent?.remove(m.group); m.dispose(); }
  function makeMesh(rec) {
    const dd = Ship.sampleDesigns[rec.designId], isPinta = !!dd.evidence;
    const o = Ship.buildShipObject(THREE_, { hull: dd.hull, vessel: rec.vessel, visual: { ...dd.visual, customRig: isPinta } });
    if (isPinta) Ship.addPintaStructure(THREE_, o, dd, rec.vessel);
    if (rec.crew) Ship.addCrewFigures(THREE_, o, rec.crew);
    o.interior = rec.crew?.interior ?? Ship.createInterior(dd.interior ?? Ship.sampleInteriors[dd.interiorId], { hull: Ship.createHull(dd.hull) });
    Ship.addInterior(THREE_, o, o.interior); Ship.setViewDeck(o, o.weatherDeck);
    if (isPinta) { o.furn = () => Ship.addFurnishings(THREE_, o, Ship.planFurnishings({ design: dd, interior: o.interior, massItems: rec.massItems ?? dd.massItems })); o.furn(); o.loadRef = rec.massItems ?? null; }
    o.pos = o.interior.startPosition();
    gameScene().add(o.group);
    return o;
  }
  function syncMeshes() {
    const T = S.terrain;
    for (const rec of fleet.list()) {
      let m = meshes.get(rec.id);
      if (!m) { try { m = makeMesh(rec); } catch (e) { console.warn('ship display failed, removing', rec.id, e && e.message); fleet.removeShip(rec.id); continue; } meshes.set(rec.id, m); }
      const st = rec.vessel.state, xM = ref.xM + st.X, yM = ref.yM - st.Y;
      try { const q = T.toLocal(xM, yM, 0, S.origin); m.group.position.set(q.x, q.y, q.z); m.group.visible = true; } catch (_) { m.group.visible = false; continue; }
      m.group.rotation.set(0, -st.psi, -st.heelDeg * DEG);
      if (m.furn && m.loadRef !== (rec.massItems ?? null)) { m.loadRef = rec.massItems ?? null; m.furn(); Ship.updateFurnishingsVisibility(m); } // stores follow the real load
      Ship.updateShipObject(m, { leeSign: Math.sign(rec.vessel.apparentWind(env).y) || 1 }); syncFigures(m, rec); if (m.crewFigs?.length) Ship.updateCrewFigures(m, null); if (m.setDetail) m.setDetail(THREE_ && cp.camera.position.distanceTo(m.group.position) > 400 ? 2 : cp.camera.position.distanceTo(m.group.position) > 120 ? 1 : 0);
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
    const id = fleet.addShip({ designId, X: spot.xM - ref.xM, Y: ref.yM - spot.yM, headingDeg: heading, crew: !!Ship.sampleDesigns[designId].evidence });
    fleet.get(id).vessel.state.u = 1.5; // already under way, so the rudder bites
    ctl[id] = { heading, held: 0, auto: true, oar: 0.8 };
    { const dx = spot.xM - mp.xM, dy = spot.yM - mp.yM, km = Math.hypot(dx, dy) / 1000, dir = ['東', '南東', '南', '南西', '西', '北西', '北', '北東'][Math.round(Math.atan2(dy, dx) / (Math.PI / 4) + 8) % 8]; toast(`${id}（${Ship.sampleDesigns[designId].label}）を海に出した：${dir}へ約${km.toFixed(1)}km`); } refreshList(); save();
  }
  function board(id) {
    const rec = fleet.get(id), m = meshes.get(id); if (!m) return;
    boarded = id; lastPlaced = null; if (m.interior) m.pos = m.interior.startPosition(); ui.panel.style.display = 'none'; refreshList(); toast(`${id} に乗った（移動で甲板を歩けます）`);
  }
  /** Step off without moving the player (they were moved by the game). */
  function leaveShip(msg) {
    const mo = meshes.get(boarded); if (mo) Ship.setViewDeck(mo, mo.weatherDeck);
    boarded = null; lastPlaced = null; clearLadders(); refreshList(); if (msg) toast(msg);
  }
  function clearLadders() { ladderSig = ''; ui.ladders?.replaceChildren(); setWater(true); }
  function disembark() {
    if (!boarded) return;
    const mo = meshes.get(boarded); if (mo) Ship.setViewDeck(mo, mo.weatherDeck);
    const rec = fleet.get(boarded), st = rec.vessel.state, xM = ref.xM + st.X, yM = ref.yM - st.Y;
    const land = scan(xM, yM, (e) => e > 1, 6000, 25);
    if (!land) { toast('近くに降りられる陸がない'); return; }
    cp.placeMarker(land.xM, land.yM, true); boarded = null; clearLadders(); refreshList(); toast('陸に降りた');
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
    try { localStorage.setItem(KEY_PREFIX + lastSeed, JSON.stringify({ fleet: fleet.serialize(), ref, ctl, boarded })); } catch (_) { /* storage unavailable */ }
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
    if (pendingBoard) { // the player was aboard when this was saved: step back on if the loaded player stands by the ship
      const m = meshes.get(pendingBoard), mp = cp.markerPoint;
      if (!fleet.has(pendingBoard) || performance.now() - pendingSince > 20000) pendingBoard = null;
      else if (m && mp) { const s = fleet.get(pendingBoard).vessel.state; if (Math.hypot(mp.xM - (ref.xM + s.X), mp.yM - (ref.yM - s.Y)) < 40) { const id = pendingBoard; pendingBoard = null; board(id); } }
    }
    if (boarded && fleet.has(boarded) && cp.view.overview) { const st = fleet.get(boarded).vessel.state; cp.placeMarker(ref.xM + st.X, ref.yM - st.Y, false); }
    if (boarded && fleet.has(boarded) && !cp.view.overview && meshes.has(boarded)) walkOnBoard(dt);
    saveAcc += dt; if (saveAcc > 8) { saveAcc = 0; save(); }
    updateHud();
  }
  const setWater = (on) => { for (const w of [S?.waterMesh, S?.farWaterMesh]) if (w && w.visible !== on) w.visible = on; };
  /** World point (game scene coordinates) of the player's deck position, using the ship's current pose. */
  function deckPoint(m) {
    m.group.updateMatrixWorld(true);
    const { cgX, draft } = m.frame;
    return m.group.localToWorld(new THREE_.Vector3(m.pos.y, m.interior.deckZ(m.pos.deck) - draft + 0.02 + (m.climbZ || 0), cgX - m.pos.x)); // climbZ: eased height offset while climbing a ladder
  }
  /**
   * Walking on the deck. The game's own input (stick, keys, run, crouch) calls __wohDev.step; while aboard, our step applies that
   * movement to the deck position (hull frame; walls, ladders and the hull breadth come from the interior) and returns the
   * resulting world point, so the game's movement code, facing and walking animation all work and deep water does not stop us.
   */
  function boardedStep(input, dt) {
    const rec = fleet.get(boarded), m = meshes.get(boarded), st = rec.vessel.state;
    const ix = Number.isFinite(input.x) ? input.x : 0, iy = Number.isFinite(input.y) ? input.y : 0, yaw = Number.isFinite(input.yaw) ? input.yaw : 0;
    const len = Math.max(1, Math.hypot(ix, iy)), speed = input.crouch ? 0.65 : input.sprint ? 4 : 1.5, step = Math.min(dt, 0.05); // the game's own walking speeds (m/s)
    const east = (ix * Math.cos(yaw) + iy * Math.sin(yaw)) / len * speed * step, south = (-ix * Math.sin(yaw) + iy * Math.cos(yaw)) / len * speed * step;
    const sp = Math.sin(st.psi), cs = Math.cos(st.psi), north = -south;
    m.pos = m.interior.move(m.pos, east * sp + north * cs, east * cs - north * sp); // (forward, starboard) in the hull frame
    // Seamless ladders: walking into a ladder foot climbs it (eased over ~0.9 s); the lock stops an instant climb back down at the other end.
    const near = m.interior.laddersNear(m.pos, 1.0);
    if (m.ladderLock && !near.some((l) => l.id === m.ladderLock)) m.ladderLock = null;
    const foot = near.find((l) => l.dist < 0.45 && l.id !== m.ladderLock);
    if (foot && (ix || iy)) { const z0 = m.interior.deckZ(m.pos.deck); m.pos = m.interior.climb(m.pos, foot.id); m.climbZ = z0 - m.interior.deckZ(m.pos.deck); m.ladderLock = foot.id; ladderSig = ''; }
    const w = deckPoint(m);
    return { xM: w.x + S.origin.xM, yM: w.z + S.origin.yM, elevationM: w.y + S.origin.elevationM, blocked: false };
  }
  function patchWalker() {
    const dev = globalThis.__wohDev ?? (globalThis.__wohDev = { step: () => null, savedPlayer: () => null }), orig = typeof dev.step === 'function' ? dev.step.bind(dev) : null;
    dev.step = (p, input, dt, terrain) => (boarded && fleet?.has(boarded) && meshes.has(boarded) && !cp.view.overview ? boardedStep(input, dt) : orig ? orig(p, input, dt, terrain) : null);
  }
  /** Per frame while aboard: keep the game's chunks and mini-map on the ship, update the cutaway view, crew and stair buttons. */
  function walkOnBoard(dt = 0) {
    const m = meshes.get(boarded), mp0 = cp.markerPoint;
    // The game moved the player somewhere else (explore / teleport / loading): they have left the ship, so do not drag them back.
    if (lastPlaced && mp0 && Math.hypot(mp0.xM - lastPlaced.xM, mp0.yM - lastPlaced.yM) > 8) { leaveShip('移動したので船を降りた'); return; }
    if (m.climbZ) m.climbZ = Math.abs(m.climbZ) < 0.02 ? 0 : m.climbZ * Math.exp(-Math.min(dt, 0.1) / 0.28); // ease the height change after a ladder
    const w = deckPoint(m);
    cp.placeMarker(w.x + S.origin.xM, w.z + S.origin.yM, false);
    lastPlaced = cp.markerPoint ? { xM: cp.markerPoint.xM, yM: cp.markerPoint.yM } : null;
    if (cp.markerPoint) cp.markerPoint.elevationM = w.y + S.origin.elevationM; // the game keeps the marker at this height while the player stands still
    Ship.setViewDeck(m, m.pos.deck, m.interior.roomOf(m.pos.deck, m.pos.x, m.pos.y)?.id ?? null);
    if (m.furn) Ship.updateFurnishingsVisibility(m);
    setWater(!m.cutaway); // below deck the hold floor is under the sea surface: hide the sea (cutaway view) so the hold can be seen
    syncFigures(m, fleet.get(boarded)); if (m.crewFigs?.length) Ship.updateCrewFigures(m, m.pos.deck);
    const near = m.interior.laddersNear(m.pos), sig = near.map((l) => l.id).join(',');
    const foot = near.find((l) => l.dist < 0.7 && l.id !== m.ladderLock); dwell = uiHidden && foot ? dwell + dt : 0; if (dwell > 1) { m.pos = m.interior.climb(m.pos, foot.id); dwell = 0; ladderSig = ''; return; }
    if (sig !== ladderSig) { ladderSig = sig; ui.ladders.replaceChildren(...near.map((l) => $('button', { textContent: l.direction === 'up' ? '上る' : '下りる', className: 'on', onclick: () => { const z0 = m.interior.deckZ(m.pos.deck); m.pos = m.interior.climb(m.pos, l.id); m.climbZ = z0 - m.interior.deckZ(m.pos.deck); m.ladderLock = l.id; ladderSig = ''; } }))); }
  }
  const captainActive = (rec) => !!rec.captain && ['sailing', 'arriving'].includes(rec.captain.mode);
  const posOf = (id) => { const s = fleet.get(id).vessel.state; return { X: s.X, Y: s.Y }; };

  // ---------- HUD ----------
  function buildHud() {
    const css = $('style', { textContent: `
#shipBtn,#shipPanel{position:fixed;z-index:120;left:calc(8px + env(safe-area-inset-left));font:12px/1.35 -apple-system,"Hiragino Sans",sans-serif;color:#e6edf3}
#shipBtn{top:calc(56px + env(safe-area-inset-top));padding:6px 10px;background:#132a40e8;border:1px solid #2e5576;border-radius:8px}
#shipPanel{top:calc(96px + env(safe-area-inset-top));width:min(250px,calc(100vw - 24px));max-height:calc(100vh - 170px);min-height:0;overflow:auto;background:#10202ff2;border:1px solid #2e5576;border-radius:10px;padding:8px;display:none;-webkit-user-select:none;user-select:none}
#shipBar{position:fixed;z-index:120;bottom:calc(8px + env(safe-area-inset-bottom));left:calc(128px + env(safe-area-inset-left));right:calc(226px + env(safe-area-inset-right));display:none;font:12px/1.3 -apple-system,"Hiragino Sans",sans-serif;color:#e6edf3;background:#10202ff2;border:1px solid #2e5576;border-radius:10px;padding:6px;-webkit-user-select:none;user-select:none}
#shipBar .info{font-size:11px;color:#9fc4de;margin-bottom:2px}#shipBar .btns{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
@media (max-width:720px){#shipPanel:not([style*="display: none"]) ~ #shipBar{display:none!important}}
#shipPanel{touch-action:pan-y;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
#shipBar button{padding:3px 7px!important;font-size:11px!important;min-height:27px!important;margin:1px!important}#shipBar .info{font-size:10.5px!important}
#shipPanel button,#shipBar button{background:#25415a;color:#e6edf3;border:1px solid #3b6288;border-radius:7px;padding:6px 9px;font-size:12px;min-height:30px;margin:2px 2px 2px 0}
#shipPanel button.on,#shipBar button.on{background:#4cc2ff;color:#04202e}#shipPanel h4{margin:6px 0 2px;font-size:12px;color:#7fc8f0}
#shipPanel .row{display:flex;align-items:center;gap:6px}#shipPanel input[type=range]{flex:1;min-width:0}
html.shipUiHidden #shipBtn,html.shipUiHidden #shipPanel,html.shipUiHidden #shipBar,html.shipUiHidden #shipLadders,html.shipUiHidden #shipToast{display:none!important}
#shipEye{position:fixed;z-index:122;top:calc(56px + env(safe-area-inset-top));left:calc(88px + env(safe-area-inset-left));padding:6px 9px;background:#132a40b0;color:#e6edf3;border:1px solid #2e5576;border-radius:8px;font-size:13px;opacity:.85}
html.shipUiHidden #shipEye{left:calc(8px + env(safe-area-inset-left));opacity:.45}
#shipLadders{position:fixed;z-index:121;left:calc(150px + env(safe-area-inset-left));bottom:calc(96px + env(safe-area-inset-bottom))}#shipLadders button{background:#4cc2ff;color:#04202e;border:1px solid #3b6288;border-radius:7px;padding:6px 14px;font-size:13px;min-height:34px}
#shipToast{position:fixed;z-index:130;left:50%;top:calc(54px + env(safe-area-inset-top));max-width:min(420px,56vw);text-align:center;transform:translateX(-50%);background:#000c;color:#fff;padding:6px 12px;border-radius:8px;font:13px sans-serif;opacity:0;transition:opacity .3s;pointer-events:none}` });
    ui.btn = $('button', { id: 'shipBtn', textContent: '⛵ 船' });
    ui.eye = $('button', { id: 'shipEye', textContent: '👁', title: '船のUIの表示／非表示', onclick: () => setUiHidden(!uiHidden) });
    ui.panel = $('div', { id: 'shipPanel', className: 'scrollable' });
    ui.toast = $('div', { id: 'shipToast' });
    ui.btn.onclick = () => { ui.panel.style.display = ui.panel.style.display === 'block' ? 'none' : 'block'; refreshList(); };
    ui.spawn = $('div', {}, [$('h4', { textContent: '船を出す（近くの海へ）' }),
      ...Object.entries({ 'pinta-1492': 'ピンタ1492 横帆', 'pinta-1492-lateen': 'ピンタ1492 ラテン', galleon: 'ガレオン', galley: 'ガレー' }).map(([d, n]) => $('button', { textContent: n, onclick: () => spawn(d) }))]);
    ui.list = $('div'); ui.ctrl = $('div', { className: 'btns' }); ui.info = $('div', { className: 'info' });
    ui.ladders = $('div', { id: 'shipLadders' }); ui.bar = $('div', { id: 'shipBar' }, [ui.info, ui.ctrl]);
    ui.bench = $('div', { className: 'info', style: 'margin-top:6px;user-select:text;font-size:11px;color:#9fc4de' }); ui.panel.append(ui.spawn, ui.list, $('button', { textContent: '性能測定(6秒)', onclick: benchmark }), ui.bench);
    document.body.append(css, ui.btn, ui.eye, ui.panel, ui.bar, ui.ladders, ui.toast);
    try { setUiHidden(localStorage.getItem('woh-ship-ui-hidden') === '1'); } catch (_) { /* storage unavailable */ }
    layoutShipUi(); setInterval(layoutShipUi, 400); addEventListener('resize', layoutShipUi);
    let down = null; const cv = nat.renderer.domElement;
    cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; }, true);
    cv.addEventListener('pointerup', (e) => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 && performance.now() - down.t < 500) onMapTap(e); down = null; }, true);
    ['pointerdown', 'pointermove', 'touchstart', 'touchmove', 'touchend', 'mousedown', 'wheel'].forEach((ev) => { for (const el of [ui.panel, ui.btn, ui.eye, ui.bar, ui.ladders]) el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true}); });
  }
  /** Keep the ship UI clear of the game's own HUD (v31 layout): measured from the game's elements, so it follows any screen size. */
  function layoutShipUi() {
    const R = (id) => { const e = document.getElementById(id); if (!e) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return null; const b = e.getBoundingClientRect(); return b.width ? b : null; };
    const hud = ['hudGoal', 'hudTL'].map(R).filter(Boolean), compass = R('hudCompass'), hot = R('hudHot'), joy = R('joystick'), ch = ['sprint', 'jump', 'crouch', 'hudTalk'].map(R).filter(Boolean);
    const left0 = Math.max(8, ...hud.map((b) => b.left)), below = Math.max(0, ...hud.map((b) => b.bottom)) + 6;
    const top = below > 6 ? below : 56, bw = ui.btn.offsetWidth || 52;
    Object.assign(ui.btn.style, { top: top + 'px', left: '8px' }); Object.assign(ui.eye.style, { top: top + 'px', left: uiHidden ? '8px' : (8 + bw + 8) + 'px' });
    const barBottom = hot ? innerHeight - hot.top + 6 : 8, stat = R('hudStatus'), barLeft = Math.max(joy ? joy.right + 8 : 128, stat ? stat.right + 8 : 0), barRight = ch.length ? innerWidth - Math.min(...ch.map((b) => b.left)) + 6 : 226;
    Object.assign(ui.bar.style, { bottom: barBottom + 'px', left: barLeft + 'px', right: barRight + 'px' });
    const barTop = ui.bar.style.display === 'none' ? innerHeight - barBottom : innerHeight - barBottom - (ui.bar.offsetHeight || 0);
    const pTop = (compass ? compass.bottom : 48) + 6, pLeft = Math.max(...hud.map((b) => b.right), 8) + 8;
    Object.assign(ui.panel.style, { top: pTop + 'px', left: pLeft + 'px', maxHeight: Math.max(80, barTop - pTop - 8) + 'px' });
    Object.assign(ui.ladders.style, { left: barLeft + 'px', bottom: (barBottom + (ui.bar.offsetHeight || 60) + 6) + 'px' });
    ui.toast.style.top = ((compass ? compass.bottom : 48) + 6) + 'px';
  }
  /** Performance check for real devices: samples ~6 s of frames in whatever view is current and reports it as text (copyable). */
  function benchmark() {
    if (benchmark.run) return; benchmark.run = true; const ts = [], t0 = performance.now(); ui.bench.textContent = '測定中…（6秒、そのまま動かさずに）';
    const tick = (t) => { ts.push(t); if (t - t0 < 6000) { requestAnimationFrame(tick); return; }
      const d = ts.slice(1).map((v, i) => v - ts[i]).sort((a, b) => a - b), avg = d.reduce((a, b) => a + b, 0) / d.length, p95 = d[Math.floor(d.length * 0.95)], worst = d[d.length - 1], inf = nat.renderer.info.render;
      const m = boarded && meshes.get(boarded), where = boarded ? (m?.cutaway ? '船内(下層)' : '船上(甲板)') + (globalThis.__wohFirstPerson ? '・一人称' : '・三人称') : '船外';
      ui.bench.textContent = `性能(${where}) 平均${(1000 / avg).toFixed(1)}fps／95%点${p95.toFixed(1)}ms／最悪${worst.toFixed(0)}ms／描画${inf.calls}回・三角形${(inf.triangles / 1000).toFixed(0)}k／船${fleet?.list().length ?? 0}隻／画面${innerWidth}x${innerHeight}×${devicePixelRatio}`; benchmark.run = false; };
    requestAnimationFrame(tick);
  }
  /** Hired hands come and go: rebuild the crew figures when the roster size changed. */
  function syncFigures(m, rec) {
    if (!rec?.crew || !m.crewFigs || m.crewFigs.length === rec.crew.members.length) return;
    for (const { f } of m.crewFigs) m.group.remove(f);
    Ship.addCrewFigures(THREE_, m, rec.crew);
  }
  /** Take the villager the player has selected (tap on an NPC) aboard the nearest ship as a hired hand. The villager stays in the game's own village simulation. */
  function hireSelected() {
    const id = globalThis.__wohNpcView?.selected;
    if (id === null || id === undefined) { toast('雇いたい村人を先にタップして選んでください'); return; }
    const me = cp.character.position; let best = null;
    for (const r of fleet.list()) { const m = meshes.get(r.id), rec = fleet.get(r.id); if (!m || !rec.crew) continue; const d = Math.hypot(m.group.position.x - me.x, m.group.position.z - me.z); if (d <= 60 && (!best || d < best.d)) best = { id: r.id, d, rec }; }
    if (!best) { toast('近く(60m以内)に乗員を乗せられる船がありません'); return; }
    const name = (globalThis.__wohPersonName?.(id) || '') || `村人${id}`;
    try { best.rec.crew.hire({ id: `npc:${id}`, name, npcRef: id }); toast(`${name} を ${best.id} の乗員に雇った`); } catch (e) { toast(`${name} は既に乗員です`); }
    refreshList(); save();
  }
  function dismissHand(shipId, personId) { const rec = fleet.get(shipId); if (rec?.crew?.dismiss(personId)) { toast('乗員を降ろした'); refreshList(); save(); } }
  function refreshList() {
    if (!ui.list) return;
    ui.list.replaceChildren($('h4', { textContent: '船' }), ...(fleet?.list() ?? []).map((r) => $('div', { className: 'row' }, [
      $('span', { textContent: `${r.id}（${Ship.sampleDesigns[r.designId]?.label ?? r.designId}）`, style: 'flex:1' }),
      $('button', { textContent: boarded === r.id ? '降りる' : '乗る', className: boarded === r.id ? 'on' : '', onclick: () => (boarded === r.id ? disembark() : board(r.id)) }),
      $('button', { textContent: '消す', onclick: () => removeShip(r.id) })])));
    const crewShips = (fleet?.list() ?? []).filter((r) => fleet.get(r.id).crew);
    if (crewShips.length) ui.list.append($('h4', { textContent: '乗員（村人を雇う）' }), $('button', { textContent: '選択中の村人を雇う', onclick: hireSelected }),
      ...crewShips.flatMap((r) => fleet.get(r.id).crew.members.filter((x) => x.hired).map((x) => $('div', { className: 'row' }, [$('span', { textContent: `${x.name}（${r.id}）`, style: 'flex:1' }), $('button', { textContent: '降ろす', onclick: () => dismissHand(r.id, x.id) })]))));
    ui.ctrl.replaceChildren();
    ui.bar.style.display = boarded && fleet?.has(boarded) ? 'block' : 'none';
    if (!boarded || !fleet?.has(boarded)) return;
    const rec = fleet.get(boarded), c = ctl[boarded], v = rec.vessel;
    const hold = (label, dir) => { const b = $('button', { textContent: label }); const on = (e) => { e.preventDefault(); c.held = dir; }, off = () => { if (c.held === dir) c.held = 0; }; b.addEventListener('pointerdown', on); ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => b.addEventListener(t, off)); return b; };
    ui.ctrl.append(hold('◀左', -1), hold('右▶', 1),
      $('button', { textContent: v.state.anchor ? '錨↑' : '錨↓', onclick: () => { if (v.state.anchor) v.raiseAnchor(); else { const r = v.dropAnchor(env, { anchorKg: 400, rodeM: 60 }); if (r.status !== 'ok') toast('投錨できない：' + r.status); } refreshList(); } }));
    if (v.sails.length) ui.ctrl.append($('button', { textContent: c.auto ? '帆自動' : '帆固定', className: c.auto ? 'on' : '', onclick: () => { c.auto = !c.auto; refreshList(); } }));
    if (v.oars.length) { const r = $('input', { type: 'range', min: -100, max: 100, step: 5, value: Math.round(c.oar * 100) }); r.oninput = () => { c.oar = r.value / 100; }; ui.ctrl.append($('span', { textContent: '櫂' }), r); r.style.cssText = 'width:90px'; }
    const active = captainActive(rec);
    ui.ctrl.append($('button', { textContent: pickMode ? '地図タップ' : '目的地', className: pickMode ? 'on' : '', onclick: () => { pickMode = !pickMode; toast(pickMode ? '「UIを表示」→「世界を俯瞰」で地図を開き、行き先をタップ' : '指定をやめた'); refreshList(); } }),
      $('button', { textContent: '前方3km', onclick: () => { const st = v.state, h = st.psi; setDest(boarded, st.X + Math.sin(h) * 3000, st.Y + Math.cos(h) * 3000); } }));
    if (active) ui.ctrl.append($('button', { textContent: '中止', onclick: () => { fleet.cancelDestination(boarded); updateRoute(null); v.setHeadingTarget(null); ctl[boarded].heading = v.snapshot().headingDeg; refreshList(); } }));
    ui.ctrl.append($('button', { textContent: '降りる', onclick: () => disembark() }), $('button', { textContent: `×${speedX}`, onclick: (e) => { speedX = speedX === 1 ? 4 : speedX === 4 ? 10 : 1; e.target.textContent = `×${speedX}`; } }));
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
