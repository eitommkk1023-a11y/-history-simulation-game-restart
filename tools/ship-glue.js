// Glue between the ship system (const Ship, defined above by the bundle) and the game's native view.
// Additive only: reads globalThis.__chunkPreview / __wohNative / __geo and adds its own meshes and HUD.
// Ship frame: X east, Y north (m) relative to `ref` (playable metres: xM east, yM south).
(() => {
  'use strict';
  const DEG = Math.PI / 180, KEY_PREFIX = 'woh-ships-';
  const EVT = { captain_route_planned: '航路を決めた', captain_no_route: '', captain_tack: '帆の向きを替えた', captain_reef: '帆を絞った', captain_arriving: '目的地に近づいた', captain_arrived: '到着した', captain_replan: '浅瀬を避けて航路を引き直した', captain_cancelled: '航海をやめた', grounded: '座礁した', refloated: '離礁した', anchor_dropped: '錨を下ろした', anchor_raised: '錨を上げた', anchor_dragging: '錨が走っている', anchor_parted: '錨索が切れた' };
  const dbg = {}; let nearOrig, dbgHideSea = false, simT = 0, visField = null, windField = null, seaState = null, savedShips = null, pendingBoard = null, pendingSince = 0, lastPlaced = null, uiHidden = false, dwell = 0, renderError = null, ladderSig = '', pickMode = false, destMarker = null, routeLine = null, cp, nat, THREE_, S = null, fleet = null, env = null, ref = null, ctl = {}, meshes = new Map(), boarded = null, speedX = 1, lastT = null, saveAcc = 0, trimAcc = 0, lastSeed = null;
  const REASON = { destination_too_shallow: 'そこは浅くて行けない', blocked: '回り込む道がない', search_limit: '遠すぎて航路を決められない' };
  const ui = {};
  const $ = (tag, props = {}, kids = []) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) e.append(k); return e; };

  const boot = setInterval(() => { cp = globalThis.__chunkPreview; nat = globalThis.__wohNative; THREE_ = globalThis.THREE; if (cp && nat?.scene && THREE_ && typeof Ship !== 'undefined') { clearInterval(boot); nat.renderer.localClippingEnabled = true; installSaveBridge(); buildHud(); patchRender(); patchWalker(); requestAnimationFrame(frame); } }, 500);

  // Read-only handles for tests and debugging.
  globalThis.__wohShips = { dbg, streaksObj: () => streaks, windInfo: (X, Y) => windField?.info(X, Y, 0), setSimT: (t) => { simT = t; }, get renderError() { return renderError && String(renderError.stack || renderError).slice(0, 400); }, mesh: (id) => meshes.get(id), Ship, get lastSeed() { return lastSeed; }, get fleet() { return fleet; }, get env() { return env; }, get ref() { return ref; }, get boarded() { return boarded; }, spawn: (d) => spawn(d), board: (id) => board(id), disembark: () => disembark() };

  /** The game renders inside its own frame, so ship meshes and the boarded player are placed right before each render. */
  function patchRender() {
    const rd = nat.renderer, orig = rd.render.bind(rd);
    rd.render = function (sc, cam) { try { if (fleet && env && S === cp.state) { if (cp.view.overview) { if (sc === nat.scene) { syncOverview(); if (boarded) updateRoute(boarded); } } else if (sc === gameScene()) preRender(cam); } } catch (e) { renderError = e; /* never break the game's render */ } return orig(sc, cam); };
  }
  /** Just before every render: update the ships, and while aboard put the player on the deck and the orbit camera around the player. */
  // ---------- wind made visible: foam streaks on the sea, drifting with the wind (more and longer as it freshens) ----------
  const STREAKS = 300, SPAN = 55; let streaks = null, streakT = 0;
  function updateStreaks() {
    const now = performance.now(), dt = Math.min(0.1, (now - (streakT || now)) / 1000); streakT = now;
    let focus = boarded && meshes.get(boarded), rec = boarded && fleet.get(boarded);
    if (!focus) { let best = 300; for (const r of fleet.list()) { const q = meshes.get(r.id); if (!q) continue; const d = q.group.position.distanceTo(cp.camera.position); if (d < best) { best = d; focus = q; rec = fleet.get(r.id); } } }
    if (!focus || !rec || focus.cutaway) { if (streaks) streaks.visible = false; return; }
    if (!streaks) {
      const geo = new THREE_.BufferGeometry(), pos = new Float32Array(STREAKS * 12), idx = [], off = new Float32Array(STREAKS * 2);
      for (let i = 0; i < STREAKS; i++) { off[i * 2] = (Math.random() - 0.5) * SPAN * 2; off[i * 2 + 1] = (Math.random() - 0.5) * SPAN * 2; }
      for (let i = 0; i < STREAKS; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2);
      geo.setAttribute('position', new THREE_.BufferAttribute(pos, 3)); geo.setIndex(idx); geo.userData.off = off;
      streaks = new THREE_.Mesh(geo, new THREE_.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, side: 2 })); streaks.frustumCulled = false; streaks.renderOrder = 5; gameScene().add(streaks);
    }
    const w = windField.info(rec.vessel.state.X, rec.vessel.state.Y, 0), sp = w.speed;
    if (w.beaufort < 2) { streaks.visible = false; return; }
    const dx = w.x / (sp || 1), dz = -w.y / (sp || 1), len = Math.min(8, Math.max(1.5, sp * 0.5)), shown = Math.floor(STREAKS * Math.min(1, (w.beaufort - 1) / 6)), off = streaks.geometry.userData.off, pos = streaks.geometry.attributes.position.array, g = focus.group.position;
    for (let i = 0; i < STREAKS; i++) {
      off[i * 2] += dx * sp * 0.45 * dt; off[i * 2 + 1] += dz * sp * 0.45 * dt;
      if (off[i * 2] > SPAN) off[i * 2] -= SPAN * 2; else if (off[i * 2] < -SPAN) off[i * 2] += SPAN * 2; if (off[i * 2 + 1] > SPAN) off[i * 2 + 1] -= SPAN * 2; else if (off[i * 2 + 1] < -SPAN) off[i * 2 + 1] += SPAN * 2;
      const x = g.x + off[i * 2], z = g.z + off[i * 2 + 1], y = g.y + 0.35, k = i * 12, hw = 0.12 + len * 0.012, px = -dz * hw, pz = dx * hw;
      pos[k] = x - px; pos[k + 1] = y; pos[k + 2] = z - pz; pos[k + 3] = x + px; pos[k + 4] = y; pos[k + 5] = z + pz;
      pos[k + 6] = x + dx * len - px; pos[k + 7] = y; pos[k + 8] = z + dz * len - pz; pos[k + 9] = x + dx * len + px; pos[k + 10] = y; pos[k + 11] = z + dz * len + pz;
    }
    streaks.geometry.setDrawRange(0, shown * 6); streaks.geometry.attributes.position.needsUpdate = true; streaks.visible = shown > 0;
  }
  // ---------- weather seen from the deck: fog distance, sky colour and light follow rain / fog / storm (eased; the game's values are restored ashore) ----------
  let wv = null;
  function applyWeatherView() {
    const sc = gameScene(), fog = sc.fog; if (!fog) return;
    if (!wv) { const lights = []; sc.traverse((o) => { if (o.isLight) lights.push({ o, i: o.intensity }); }); wv = { near: fog.near, far: fog.far, col: fog.color.clone(), bg: sc.background && sc.background.isColor ? sc.background.clone() : null, lights, cur: null, scene: sc }; }
    if (wv.scene !== sc) { wv = null; return; }
    const now = performance.now(), dt = Math.min(0.2, (now - (wv.t || now)) / 1000); wv.t = now;
    let tgt = { far: wv.far, near: wv.near, col: wv.col, dim: 1 };
    if (boarded && fleet?.has(boarded) && !cp.view.overview) {
      const st = fleet.get(boarded).vessel.state, v = visField.info(st.X, st.Y, 0), far = Math.min(wv.far, v.visM), c = new THREE_.Color(v.color[0] / 255, v.color[1] / 255, v.color[2] / 255);
      tgt = { far, near: far < wv.far ? far * 0.1 : wv.near, col: v.dim < 1 || far < wv.far ? c : wv.col, dim: v.dim };
    }
    const r = 1 - Math.exp(-dt / 2.5); // ~2.5 s easing
    if (!wv.cur) wv.cur = { far: wv.far, near: wv.near, col: wv.col.clone(), dim: 1 };
    const cu = wv.cur; cu.far += (tgt.far - cu.far) * r; cu.near += (tgt.near - cu.near) * r; cu.col.lerp(tgt.col, r); cu.dim += (tgt.dim - cu.dim) * r;
    fog.far = cu.far; fog.near = cu.near; fog.color.copy(cu.col); if (sc.background?.isColor) sc.background.copy(cu.col);
    for (const l of wv.lights) l.o.intensity = l.i * cu.dim;
  }
  function preRender(cam) {
    syncMeshes(); try { updateStreaks(); applyWeatherView(); } catch (_) { /* decoration only */ }
    // Depth precision: the game's near plane (0.1 m) wastes depth resolution; on devices with a shallow depth buffer the hull's overlapping shells fight (z-fighting) and show the sea through.
    { const want = boarded && fleet.has(boarded) ? 0.5 : nearOrig; if (nearOrig === undefined) nearOrig = cam.near; if (want !== undefined && Math.abs(cam.near - want) > 1e-6) { cam.near = want; cam.updateProjectionMatrix(); } }
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
      try { return { ...p, ships: { fleet: fleet.serialize(), ref, ctl, boarded, seed: lastSeed, simT } }; } catch (_) { return p; }
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
      if (data?.fleet && data.ref) { const r = fleet.restore(data.fleet, { current: Ship.sampleDesigns }); ref = data.ref; ctl = data.ctl ?? {}; simT = data.simT ?? 0; pendingBoard = data.boarded ?? null; pendingSince = performance.now(); makeEnv(); toast(`船 ${r.restored} 隻を読み込んだ` + (r.skipped.length ? `（古い船 ${r.skipped.length} 隻は読み込めず外した）` : '')); }
    } catch (e) { console.warn('ship restore failed:', e && e.message); fleet = Ship.createFleet(); for (const [id, d] of Object.entries(Ship.sampleDesigns)) fleet.registerDesign(id, d); ref = null; }
    refreshList();
  }
  function makeEnv() {
    const T = S.terrain, mpc = T.metersPerCell ?? 33.3;
    const base = Ship.createWorldEnvironment(S.world, { origin: { x: ref.xM / mpc, y: ref.yM / mpc }, blockM: mpc, dayAt: () => globalThis.__geo?.clock?.day ?? 0 });
    const cache = new Map(), ecache = new Map();
    const elevAt = (X, Y) => { const xM = ref.xM + X, yM = ref.yM - Y, k = Math.round(xM / 20) + ',' + Math.round(yM / 20); let e = ecache.get(k); if (e !== undefined) return e; e = -1; if (xM >= 0 && yM >= 0 && xM <= T.widthM && yM <= T.heightM) { try { e = T.sampleBase(xM, yM).baseElevationM; } catch (_) { e = -1; } } if (ecache.size > 20000) ecache.clear(); ecache.set(k, e); return e; };
    const simCell = (X, Y) => { const sim = globalThis.__geo?.sim; if (!sim?.kind) return null; const bx = (ref.xM + X) / mpc, by = (ref.yM - Y) / mpc, cx = Math.min(sim.w - 1, Math.max(0, Math.floor(bx / sim.step))), cy = Math.min(sim.h - 1, Math.max(0, Math.floor(by / sim.step))), c = cy * sim.w + cx; return { sim, c, kind: sim.kind[c] }; };
    let seedN = 1; for (const ch of String(lastSeed)) seedN = (Math.imul(seedN, 31) + ch.charCodeAt(0)) | 0;
    windField = Ship.createWindField({ baseWind: base.wind, elev: elevAt, seed: seedN, toWorld: (X, Y) => ({ x: ref.xM + X, y: ref.yM - Y }),
      dayAt: () => (globalThis.__geo?.clock?.day ?? 0) + 0.3 + simT / 86400,
      gameWeather: (X, Y) => { // the game's own daily weather (read-only): 0 clear, 1 cloudy, 2 rain, 3 snow, 4 storm
        const g = simCell(X, Y); if (!g) return null; const { sim, c, kind } = g;
        const storm = kind === 4 ? 0.6 + 0.4 * Math.min(1, sim.storm?.[c] ?? 0) : kind === 2 || kind === 3 ? Math.min(0.3, (sim.P[c] ?? 0) / 60 * 0.3) : 0;
        return { storm, rain: kind === 2 || kind === 3 || kind === 4 ? 1 : 0, label: ['晴れ', 'くもり', '雨', '雪', '嵐'][kind] };
      } });
    visField = Ship.createVisibility({ seed: seedN, toWorld: (X, Y) => ({ x: ref.xM + X, y: ref.yM - Y }), dayAt: () => (globalThis.__geo?.clock?.day ?? 0) + 0.3 + simT / 86400,
      windAt: (X, Y, t) => windField.info(X, Y, t),
      weatherAt: (X, Y) => { const g = simCell(X, Y); if (!g) return null; return { P: g.sim.P[g.c] ?? 0, cloud: g.sim.cloud?.[g.c] ?? 0, storm: g.kind === 4 ? 0.6 + 0.4 * Math.min(1, g.sim.storm?.[g.c] ?? 0) : 0 }; } }); // D: a ship-time day cycle (86400 s); the game has no time of day yet
    seaState = Ship.createSeaState({ windField, elev: elevAt, swellSource: (X, Y) => { const k = scanSky(X, Y).storm; return k ? { hs: 2.5 * Math.max(0, 1 - k.km / 100), dirToRad: Math.PI / 2 - k.ang + Math.PI } : null; } });
    env = {
      wind: (X, Y, t) => windField.wind(X, Y, t), sea: (X, Y, t) => seaState.info(X, Y, t), current: base.current, seabed: base.seabed,
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
    const dd = Ship.sampleDesigns[rec.designId], isBellona = dd.kind === 'bellona', isPinta = !!dd.evidence && !isBellona;
    const o = Ship.buildShipObject(THREE_, { hull: dd.hull, vessel: rec.vessel, visual: { ...dd.visual, customRig: isPinta || isBellona } });
    if (isPinta) Ship.addPintaStructure(THREE_, o, dd, rec.vessel);
    if (isBellona) Ship.addBellonaModel(THREE_, o, dd, globalThis.__BELLONA_ASSETS);
    if (rec.crew) Ship.addCrewFigures(THREE_, o, rec.crew);
    o.interior = rec.crew?.interior ?? Ship.createInterior(dd.interior ?? Ship.sampleInteriors[dd.interiorId], { hull: Ship.createHull(dd.hull) });
    if (isBellona) { o.setView(o.interior.startPosition()); } else { Ship.addInterior(THREE_, o, o.interior); Ship.setViewDeck(o, o.weatherDeck); }
    if (isPinta) { o.furn = () => Ship.addFurnishings(THREE_, o, Ship.planFurnishings({ design: dd, interior: o.interior, massItems: rec.massItems ?? dd.massItems })); o.furn(); o.loadRef = rec.massItems ?? null; }
    o.pos = o.interior.startPosition();
    gameScene().add(o.group);
    return o;
  }
  /** Height (scene units) of the water surface the game draws at a scene position; cached for a second per 20 m cell. */
  const wlCache = new Map(); let wlStamp = 0;
  function waterLevelAt(x, z) {
    const now = performance.now(); if (now - wlStamp > 1000) { wlCache.clear(); wlStamp = now; }
    const k = Math.round(x / 20) + ',' + Math.round(z / 20); if (wlCache.has(k)) return wlCache.get(k);
    let r = null;
    for (const w of [S?.waterMesh, S?.farWaterMesh]) {
      const pos = w?.geometry?.attributes?.position; if (!pos || r !== null) continue; const a = pos.array, ox = w.position.x, oy = w.position.y, oz = w.position.z;
      for (let i = 0; i + 17 < a.length; i += 18) { const x0 = a[i] + ox, z0 = a[i + 2] + oz, x1 = a[i + 6] + ox, z1 = a[i + 5] + oz; if (x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && z >= Math.min(z0, z1) && z <= Math.max(z0, z1)) { r = a[i + 1] + oy - 0.005; break; } }
    }
    wlCache.set(k, r); return r;
  }
  function syncMeshes() {
    const T = S.terrain;
    for (const rec of fleet.list()) {
      let m = meshes.get(rec.id);
      if (!m) { try { m = makeMesh(rec); } catch (e) { console.warn('ship display failed, removing', rec.id, e && e.message); fleet.removeShip(rec.id); continue; } meshes.set(rec.id, m); }
      const st = rec.vessel.state, xM = ref.xM + st.X, yM = ref.yM - st.Y;
      try { const q = T.toLocal(xM, yM, 0, S.origin); const wl = waterLevelAt(q.x, q.z); m.waterDelta = wl === null ? null : wl - q.y; m.group.position.set(q.x, wl === null ? q.y : wl, q.z); m.group.visible = true; } catch (_) { m.group.visible = false; continue; } // ride the sea surface the game actually draws
      m.group.rotation.order = 'YXZ'; // yaw, then pitch about the beam axis, then roll about the keel axis
      const sea = seaState.info(st.X, st.Y, 0), wm = Ship.waveMotion(sea, { psi: st.psi, u: st.u, lengthM: m.L ?? 21, beamM: 6.4, rollPeriodS: m.rollPeriodS ?? 5 }, simT);
      m.sea = { ...sea, ...wm }; // for the HUD
      // the game's sea surface is flat, so the visual motion is toned down: a full wave heave would sink the deck below the sea plane
      if (m.maxRoll === undefined) { const h = m.hull, mid = h.sectionAt((h.xMin + h.xMax) / 2), top = mid[mid.length - 1], fb = Math.max(0.3, 0.6 * (top.z - m.frame.draft)); m.maxRoll = Math.asin(Math.min(0.5, Math.max(0.02, (fb - 0.5) / top.b))); m.maxPitch = Math.asin(Math.min(0.3, Math.max(0.01, (fb - 0.5) / (0.5 * m.L)))); }
      // the sea plane is flat: keep the lee rail and the bow/stern above it (the tilt is capped by the freeboard), whatever the waves and the heel do
      const cl = (v, lim) => Math.max(-lim, Math.min(lim, v)), rollV = cl((-st.heelDeg + wm.rollDeg * 0.6) * DEG, m.maxRoll), pitchV = cl(wm.pitchDeg * 0.6 * DEG, m.maxPitch);
      m.group.rotation.set(pitchV, -st.psi, rollV); m.group.position.y += Math.max(-0.12, Math.min(0.25, wm.heaveM * 0.2));
      if (m.furn && m.loadRef !== (rec.massItems ?? null)) { m.loadRef = rec.massItems ?? null; m.furn(); Ship.updateFurnishingsVisibility(m); } // stores follow the real load
      { const aw = rec.vessel.apparentWind(env), sl = rec.vessel.sails, dep = sl.map((x) => x.deployed).join(','); if (m.lastDep !== undefined && m.lastDep !== dep) m.reefUntil = performance.now() + 1500; m.lastDep = dep;
        m.sailsMoving = sl.some((x) => x.targetTrimDeg !== undefined && Math.abs(x.targetTrimDeg - x.trimDeg) > 0.4) || performance.now() < (m.reefUntil || 0); // hands are working the sails
        Ship.updateShipObject(m, { leeSign: Math.sign(aw.y) || 1, aw, time: simT + performance.now() / 1000 }); } syncFigures(m, rec); if (m.crewFigs?.length) Ship.updateCrewFigures(m, null); if (m.setDetail) m.setDetail(THREE_ && cp.camera.position.distanceTo(m.group.position) > 400 ? 2 : cp.camera.position.distanceTo(m.group.position) > 120 ? 1 : 0);
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
    const id = fleet.addShip({ designId, X: spot.xM - ref.xM, Y: ref.yM - spot.yM, headingDeg: heading, crew: Ship.sampleDesigns[designId].evidence ? 'empty' : false });
    if (fleet.get(id).crew) crewVillagers(id, Ship.sampleDesigns[designId].crewSize ?? 5);
    fleet.get(id).vessel.state.u = 1.5; // already under way, so the rudder bites
    ctl[id] = { heading, held: 0, auto: true, oar: 0.8 };
    { const dx = spot.xM - mp.xM, dy = spot.yM - mp.yM, km = Math.hypot(dx, dy) / 1000, dir = ['東', '南東', '南', '南西', '西', '北西', '北', '北東'][Math.round(Math.atan2(dy, dx) / (Math.PI / 4) + 8) % 8]; toast(`${id}（${Ship.sampleDesigns[designId].label}）を海に出した：${dir}へ約${km.toFixed(1)}km`); } refreshList(); save();
  }
  function board(id) {
    const rec = fleet.get(id), m = meshes.get(id); if (!m) return;
    boarded = id; lastPlaced = null; if (m.interior) m.pos = m.interior.startPosition(); document.getElementById('rpgClose')?.click(); document.getElementById('standardMode')?.dispatchEvent(new Event('pointerdown')); /* close the game's menu */ refreshList(); toast(`${id} に乗った（移動で甲板を歩けます）`);
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
    try { localStorage.setItem(KEY_PREFIX + lastSeed, JSON.stringify({ fleet: fleet.serialize(), ref, ctl, boarded, simT })); } catch (_) { /* storage unavailable */ }
  }

  // ---------- frame loop ----------
  function frame(t) {
    requestAnimationFrame(frame);
    const dt = lastT === null ? 0 : Math.min((t - lastT) / 1000, 0.1); lastT = t;
    if (cp.state !== S || !fleet) { if (cp.state) attach(); else return; }
    if (!fleet.list().length || !env || document.hidden) { updateHud(); return; }
    // The game draws the 3D view only when something changed (power saving), so with a still camera the sea, sails and crew froze and FPS read 0.
    // While a ship is boarded or near the camera, ask for a redraw every frame.
    if (cp.state && !cp.view.overview && (boarded || [...meshes.values()].some((m) => m.group.visible && m.group.position.distanceTo(cp.camera.position) < 800))) cp.state.drawDirty = true;
    const mp = cp.markerPoint, focus = boarded ? posOf(boarded) : mp ? { X: mp.xM - ref.xM, Y: ref.yM - mp.yM } : null;
    for (const rec of fleet.list()) {
      const c = ctl[rec.id] ??= { heading: rec.vessel.snapshot().headingDeg, held: 0, auto: true, oar: 0.8 }, v = rec.vessel;
      if (captainActive(rec)) { c.heading = v.snapshot().headingDeg; continue; }
      c.heading = (c.heading + c.held * 25 * dt * speedX + 360) % 360;
      v.setHeadingTarget(c.heading);
      if (v.oars.length) v.setAllOarEffort(c.oar);
    }
    trimAcc += dt; if (trimAcc > 1) { trimAcc = 0; for (const rec of fleet.list()) if (ctl[rec.id]?.auto && !captainActive(rec)) rec.vessel.autoTrim(env); }
    if (dt > 0) { simT += dt * speedX; fleet.step(dt * speedX, env, focus); }
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
    return m.group.localToWorld(new THREE_.Vector3(m.pos.y, (m.interior.heightAt ? m.interior.heightAt(m.pos) : m.interior.deckZ(m.pos.deck)) - draft + 0.02 + (m.climbZ || 0), cgX - m.pos.x)); // climbZ: eased height offset while climbing a ladder
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
    if (m.setView) m.setView(m.pos); else Ship.setViewDeck(m, m.pos.deck, m.interior.roomOf(m.pos.deck, m.pos.x, m.pos.y)?.id ?? null);
    if (m.furn) Ship.updateFurnishingsVisibility(m);
    setWater(!m.cutaway && !dbgHideSea); // below deck the hold floor is under the sea surface: hide the sea (cutaway view) so the hold can be seen
    syncFigures(m, fleet.get(boarded)); if (m.crewFigs?.length) Ship.updateCrewFigures(m, m.pos.deck);
    const near = m.interior.laddersNear(m.pos), sig = near.map((l) => l.id).join(',');
    const foot = near.find((l) => l.dist < 0.7 && l.id !== m.ladderLock); dwell = uiHidden && foot ? dwell + dt : 0; if (dwell > 1) { m.pos = m.interior.climb(m.pos, foot.id); dwell = 0; ladderSig = ''; return; }
    if (sig !== ladderSig) { ladderSig = sig; ui.ladders.replaceChildren(...near.map((l) => $('button', { textContent: l.direction === 'up' ? '上る' : '下りる', className: 'on', onclick: () => { const z0 = m.interior.deckZ(m.pos.deck); m.pos = m.interior.climb(m.pos, l.id); m.climbZ = z0 - m.interior.deckZ(m.pos.deck); m.ladderLock = l.id; ladderSig = ''; } }))); }
  }
  const captainActive = (rec) => !!rec.captain && ['sailing', 'arriving'].includes(rec.captain.mode);
  const posOf = (id) => { const s = fleet.get(id).vessel.state; return { X: s.X, Y: s.Y }; };

  // ---------- HUD ----------
  // ---------- ship UI (v2): lives in the game's developer frame; instruments at the top edge, grouped controls at the bottom edge ----------
  const devOn = () => document.body.classList.contains('woh-dev');
  const SVGNS = 'http://www.w3.org/2000/svg', svg = (tag, attrs = {}, kids = []) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); for (const c of kids) e.append(c); return e; };
  const GAUGES = [['spd', '速度'], ['wind', '風'], ['wave', '波'], ['baro', '気圧'], ['vis', '視程'], ['depth', '水深']];
  function setUiHidden(on) {
    uiHidden = !!on; document.documentElement.classList.toggle('shipUiHidden', uiHidden);
    try { localStorage.setItem('woh-ship-ui-hidden', uiHidden ? '1' : '0'); } catch (_) { /* storage unavailable */ }
    layoutShipUi();
  }
  function buildHud() {
    const css = $('style', { textContent: `
.shipui{font:12px/1.3 system-ui,-apple-system,"Hiragino Sans",sans-serif;color:#fff;-webkit-user-select:none;user-select:none}
body:not(.woh-dev) .shipui,body:not(.woh-ship-on) .shipui.onboard{display:none!important}
.shipcard{background:#12263bee;border:1px solid #7799ae;border-radius:12px;box-shadow:0 2px 10px #0006}
#shipInst{position:fixed;z-index:119;display:none;padding:5px 7px 4px;gap:4px 6px}
body.woh-ship-on #shipInst{display:flex;flex-wrap:wrap;align-items:flex-start}
#shipDial{flex:0 0 auto;width:48px;height:48px}
#shipGauges{flex:1;display:grid;gap:4px 6px;min-width:0}
#shipGauges .g{min-width:0}#shipGauges .v{font-size:14px;font-weight:700;line-height:1.15;white-space:nowrap}#shipGauges .s{font-size:9.5px;color:#9db8cc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#shipStat{flex:1 0 100%;display:flex;flex-wrap:wrap;gap:3px;min-height:0}
#shipStat span{padding:1px 7px;border-radius:9px;font-size:10.5px;background:#2a4a66;white-space:nowrap}
#shipStat .w{background:#7a5a16}#shipStat .d{background:#8a2a2a}
#shipInst.compact #shipGauges{grid-template-columns:1fr!important;gap:1px}
#shipInst.compact .g:nth-child(n+3){display:none}
#shipInst.compact #shipStat span:nth-child(n+2){display:none}
#shipInst.compact #shipDial{width:42px;height:42px}
#shipInst.compact{padding:4px 6px;flex-wrap:wrap}
#shipInst .more{position:absolute;right:6px;top:2px;font-size:10px;color:#9db8cc}
#shipEye{position:fixed;z-index:121;display:none;width:34px;height:30px;padding:0;border-radius:10px;font-size:15px}
body.woh-ship-on #shipEye{display:block}
#shipBar{position:fixed;z-index:119;display:none;padding:5px 6px}
body.woh-ship-on #shipBar{display:block}
#shipTabs{display:flex;gap:4px;margin-bottom:5px}
#shipTabs button{flex:1;min-height:30px;padding:2px 4px}
#shipTabs .out{flex:0 0 auto;background:#5a2a30;border-color:#a56}
#shipBody{display:flex;align-items:center;gap:6px;min-height:38px;flex-wrap:wrap}
.shipbtn{background:#1d3a57;color:#fff;border:1px solid #7799ae88;border-radius:10px;padding:4px 10px;font:inherit;font-size:13px;min-height:36px}
.shipbtn.on{background:#4cc2ff;color:#04202e;border-color:#4cc2ff}.shipbtn.big{min-width:76px;font-size:15px;font-weight:700}
.shipbtn:active{filter:brightness(1.25)}
#shipBody .lab{color:#9db8cc;font-size:11px}
#shipBody input[type=range]{width:96px;flex:1;min-width:60px}.shipsel{background:#1d3a57;color:#fff;border:1px solid #7799ae88;border-radius:10px;padding:4px 6px;font:inherit;font-size:13px;min-height:36px}
#shipLadders{position:fixed;z-index:121}#shipLadders button{background:#4cc2ff;color:#04202e;border:0;border-radius:10px;padding:6px 16px;font-size:14px;font-weight:700;min-height:36px}
#shipToast{position:fixed;z-index:130;left:50%;max-width:min(420px,56vw);text-align:center;transform:translateX(-50%);background:#000c;color:#fff;padding:6px 12px;border-radius:8px;font:13px sans-serif;opacity:0;transition:opacity .3s;pointer-events:none}
html.shipUiHidden #shipInst,html.shipUiHidden #shipBar,html.shipUiHidden #shipLadders,html.shipUiHidden #shipToast{display:none!important}
html.shipUiHidden #shipEye{opacity:.5}
.shipSec{margin-top:8px;border-top:1px solid #7799ae66;padding-top:6px}.shipSec>summary{cursor:pointer;font-weight:700;margin-bottom:4px}
.shipSec .row{display:flex;align-items:center;gap:6px;margin:3px 0;flex-wrap:wrap}.shipSec .sub{color:#9db8cc;font-size:11px}
.shipSec button{margin:2px 4px 2px 0}
.shipSec .card{border:1px solid #7799ae55;border-radius:10px;padding:5px 7px;margin:4px 0;background:#0d1d2e88}
.shipSec .card b{font-size:13px}` });
    // instruments (top strip)
    ui.dial = svg('svg', { id: 'shipDial', viewBox: '0 0 56 56' });
    const card = svg('g', {}), ring = svg('circle', { cx: 28, cy: 28, r: 25, fill: '#0b1826', stroke: '#7799ae', 'stroke-width': 1.5 });
    card.append(ring);
    for (let a = 0; a < 360; a += 30) card.append(svg('line', { x1: 28, y1: 3.5, x2: 28, y2: a % 90 === 0 ? 8.5 : 6.5, stroke: '#9db8cc', 'stroke-width': 1, transform: `rotate(${a} 28 28)` }));
    [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([t, a]) => { const x = 28 + Math.sin(a * DEG) * 16.5, y = 28 - Math.cos(a * DEG) * 16.5 + 3; card.append(svg('text', { x, y, 'text-anchor': 'middle', 'font-size': 8.5, fill: t === 'N' ? '#ff7a6a' : '#cfe0ee', 'font-weight': 700 }, [document.createTextNode(t)])); });
    ui.dialWind = svg('g', {}, [svg('path', { d: 'M28 1.5 L32 8 L24 8 Z', fill: '#ffb347' })]); // where the wind comes from
    ui.dialTgt = svg('g', {}, [svg('rect', { x: 26.5, y: 1.5, width: 3, height: 7, fill: '#4cc2ff' })]); // target heading
    card.append(ui.dialWind, ui.dialTgt); ui.dialCard = card;
    ui.dial.append(card, svg('path', { d: 'M28 10 L32 18 L24 18 Z', fill: '#fff' }));
    ui.dialNum = svg('text', { x: 28, y: 33, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#fff' }, [document.createTextNode('0')]); ui.dial.append(ui.dialNum);
    ui.gauges = $('div', { id: 'shipGauges' }); ui.g = {};
    for (const [id, label] of GAUGES) { const v = $('div', { className: 'v', textContent: '—' }), sub = $('div', { className: 's', textContent: label }); ui.g[id] = v; ui.g[id + 'S'] = sub; sub.dataset.label = label; ui.gauges.append($('div', { className: 'g' }, [v, sub])); }
    ui.stat = $('div', { id: 'shipStat' });
    ui.inst = $('div', { id: 'shipInst', className: 'shipui shipcard onboard compact', title: 'タップで詳細' }, [ui.dial, ui.gauges, ui.stat, $('span', { className: 'more', textContent: '詳細' })]);
    ui.inst.addEventListener('click', () => { ui.inst.classList.toggle('compact'); layoutShipUi(); });
    ui.eye = $('button', { id: 'shipEye', className: 'shipui shipbtn onboard', textContent: '👁', title: '船のUIの表示／非表示', onclick: () => setUiHidden(!uiHidden) });
    // controls (bottom bar)
    ui.tabs = $('div', { id: 'shipTabs' }); ui.ctrl = $('div', { id: 'shipBody' });
    ui.bar = $('div', { id: 'shipBar', className: 'shipui shipcard onboard' }, [ui.tabs, ui.ctrl]);
    ui.ladders = $('div', { id: 'shipLadders', className: 'shipui onboard' }); ui.toast = $('div', { id: 'shipToast', className: 'shipui' });
    document.body.append(css, ui.inst, ui.eye, ui.bar, ui.ladders, ui.toast);
    ui.info = { set textContent(_) { /* legacy text readout replaced by the gauges */ } };
    try { setUiHidden(localStorage.getItem('woh-ship-ui-hidden') === '1'); } catch (_) { /* storage unavailable */ }
    // developer frame: the game's own "開発者" panel hosts the ship system section (dev mode only)
    ui.dev = $('details', { className: 'shipSec shipui', open: true }, [$('summary', { textContent: '⛵ 船システム' })]);
    ui.diag = $('div', { className: 'sub', style: 'user-select:text;margin-top:4px' }); ui.spawn = $('div'); ui.list = $('div'); ui.crewBox = $('div'); ui.bench = $('div', { className: 'sub', style: 'user-select:text;margin-top:4px' });
    ui.dev.append(ui.spawn, ui.list, ui.crewBox, $('div', { className: 'row' }, [$('button', { className: 'shipbtn', textContent: '性能測定(6秒)', onclick: benchmark }), $('button', { className: 'shipbtn', textContent: '👁 船UI 表示/非表示', onclick: () => setUiHidden(!uiHidden) }), $('button', { className: 'shipbtn', textContent: '診断:海面を隠す', onclick: (e) => { dbgHideSea = !dbgHideSea; e.target.classList.toggle('on', dbgHideSea); } }), $('button', { className: 'shipbtn', textContent: '診断:船を先に描く', onclick: (e) => { const on = e.target.classList.toggle('on'); for (const m of meshes.values()) m.group.traverse((o) => { if (o.isMesh) o.renderOrder = on ? -100 : 0; }); } })]), ui.bench, ui.diag);
    // Host: the game's menu gets a "船(開発者)" tab (dev mode only). Older games without that menu: the developer pane.
    const mount = () => {
      if (ui.dev.isConnected) return;
      const screen = document.getElementById('rpgScreen'), nav = screen?.querySelector('.rpg-tabs'), foot = screen?.querySelector('.rpg-footer');
      if (nav && foot) {
        const tabBtn = $('button', { className: 'rpg-tab dev-only', id: 'rpgTab-ship', textContent: '船(開発者)', role: 'tab' }), page = $('section', { className: 'rpg-panel', id: 'rpgPage-ship', hidden: true }, [$('div', { className: 'scrollable', id: 'rpgShip', style: 'padding:8px;overflow:auto;max-height:100%' }, [ui.dev])]);
        page.setAttribute('role', 'tabpanel'); tabBtn.setAttribute('aria-selected', 'false'); tabBtn.tabIndex = -1; nav.append(tabBtn); foot.before(page);
        const closeMine = () => { page.hidden = true; tabBtn.setAttribute('aria-selected', 'false'); };
        tabBtn.onclick = () => { for (const pn of screen.querySelectorAll('.rpg-panel')) pn.hidden = pn !== page; for (const t of nav.querySelectorAll('.rpg-tab')) t.setAttribute('aria-selected', String(t === tabBtn)); refreshList(); };
        nav.addEventListener('click', (e) => { if (e.target.closest('.rpg-tab') && e.target.closest('.rpg-tab') !== tabBtn) closeMine(); }, true);
        new MutationObserver(() => { if (screen.hidden) closeMine(); }).observe(screen, { attributes: true, attributeFilter: ['hidden'] });
        return;
      }
      const dp = document.getElementById('developerPane') ?? document.getElementById('developerPanel'); if (dp) dp.append(ui.dev);
    };
    mount(); setInterval(() => { mount(); { const bm = boarded && meshes.get(boarded); ui.diag.textContent = bm?.diag ? '表示診断: ' + bm.diag() + (() => { try { const gl = nat.renderer.getContext(); return ` 深度${gl.getParameter(gl.DEPTH_BITS)}bit ステンシル${gl.getParameter(gl.STENCIL_BITS)}bit ${nat.renderer.capabilities.isWebGL2 ? 'WebGL2' : 'WebGL1'} 精度${nat.renderer.capabilities.precision} near${cp.camera.near} far${cp.camera.far}`; } catch (_) { return ''; } })() + (() => { const wy = (w) => (w && w.geometry.attributes.position.count ? (w.geometry.attributes.position.getY(0) + w.position.y).toFixed(2) : '—'); return ` 海面y(近/遠)=${wy(S?.waterMesh)}/${wy(S?.farWaterMesh)} 船の喫水線y=${bm.group.position.y.toFixed(2)} 補正=${bm.waterDelta === null || bm.waterDelta === undefined ? '無' : bm.waterDelta.toFixed(2)}m`; })() : ''; } document.body.classList.toggle('woh-ship-on', devOn() && !!boarded && !!fleet?.has(boarded)); if (!devOn() && boarded) disembark(); }, 500);
    ui.spawn.append($('div', { className: 'sub', textContent: '船を出す(近くの海へ)' }), ...Object.entries({ 'pinta-1492': 'ピンタ1492 横帆', 'pinta-1492-lateen': 'ピンタ1492 ラテン', 'bellona-1760': 'ベローナ1760 74門艦', galleon: 'ガレオン', galley: 'ガレー' }).map(([d, n]) => $('button', { className: 'shipbtn', textContent: n, onclick: () => { spawn(d); } })));
    layoutShipUi(); setInterval(layoutShipUi, 400); addEventListener('resize', layoutShipUi);
    let down = null; const cv = nat.renderer.domElement;
    cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; }, true);
    cv.addEventListener('pointerup', (e) => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 && performance.now() - down.t < 500) onMapTap(e); down = null; }, true);
    ['pointerdown', 'pointermove', 'touchstart', 'touchmove', 'touchend', 'mousedown', 'wheel'].forEach((ev) => { for (const el of [ui.inst, ui.eye, ui.bar, ui.ladders]) el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }); });
  }
  /** Keep the ship UI clear of the game's own HUD, measured from the game's elements (works at any screen size). */
  function layoutShipUi() {
    if (!ui.inst) return;
    const R = (id) => { const e = document.getElementById(id); if (!e) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return null; const b = e.getBoundingClientRect(); return b.width ? b : null; };
    const hud = ['hudGoal', 'hudTL'].map(R).filter(Boolean), compass = R('hudCompass'), hot = R('hudHot'), joy = R('joystick'), stat = R('hudStatus'), btns = R('hudBtns');
    const ch = ['sprint', 'jump', 'crouch', 'hudTalk', 'hudMode'].map(R).filter(Boolean), topY = (compass ? compass.bottom : 48) + 5;
    // instruments: a compact card in the free spot under the game's button row, left of the mini-map's zoom buttons (tap for the full card)
    const mz = R('miniZoom'), mm = R('miniMap'), compact = ui.inst.classList.contains('compact');
    const rR = Math.min(mz ? mz.left : 1e9, mm ? mm.left : 1e9, innerWidth - 8) - 6, rTop = (btns ? btns.bottom : topY) + 5, iL0 = Math.max(8, ...hud.map((b) => b.right)) + 10;
    const iW = compact ? Math.max(124, Math.min(190, rR - (btns ? btns.left : rR - 170))) : Math.max(180, Math.min(320, rR - iL0 - 40));
    const iL = Math.max(8, rR - iW);
    ui.gauges.style.gridTemplateColumns = compact ? '1fr' : `repeat(${iW >= 250 ? 3 : 2}, minmax(0, 1fr))`;
    Object.assign(ui.inst.style, { top: rTop + 'px', left: iL + 'px', width: iW + 'px' });
    const hh = ui.inst.offsetHeight || 70;
    Object.assign(ui.eye.style, iL - 38 >= 4 ? { top: rTop + 'px', left: (iL - 38) + 'px' } : { top: (rTop + hh + 4) + 'px', left: iL + 'px' });
    // controls: bottom edge, above the hotbar, between the joystick/status and the action buttons
    const barBottom = hot ? innerHeight - hot.top + 5 : 8, bL = Math.max(joy ? joy.right + 8 : 128, stat ? stat.right + 8 : 0), bR = ch.length ? innerWidth - Math.min(...ch.map((b) => b.left)) + 6 : 226;
    Object.assign(ui.bar.style, { bottom: barBottom + 'px', left: bL + 'px', right: bR + 'px' });
    Object.assign(ui.ladders.style, { left: bL + 'px', bottom: (barBottom + (ui.bar.offsetHeight || 80) + 6) + 'px' });
    Object.assign(ui.toast.style, { top: topY + 'px', left: iL0 + 'px', transform: 'none', maxWidth: Math.max(160, Math.min(300, iL - iL0 - 50)) + 'px', textAlign: 'left' });
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
  /** Alive adults of the player's own ethnicity (the game's people), the player's own group first. */
  function villagerCandidates(n) {
    const pe = globalThis.__geo?.people, V = globalThis.WohNpcView; if (!pe?.npc) return [];
    const P = pe.npc, eth = (i) => P.eth[i] || P.groupEth[P.group[i]], you = pe.player?.id ?? -1, gy = you >= 0 ? P.group[you] : -1, out = [];
    for (let i = 0; i < P.n; i++) { if (P.death[i] !== 0x7fffffff || i === you || eth(i) !== pe.playerEth || P.age(i) < 15 || P.age(i) > 55) continue; out.push({ i, own: P.group[i] === gy ? 0 : 1 }); }
    out.sort((a, b) => a.own - b.own || a.i - b.i);
    return out.slice(0, n).map(({ i }) => {
      const c = V?.viewColor ? V.viewColor(pe, i) : [160, 160, 160]; return { i, look: { cloth: c, skin: [0xf1c9a5, 0xd9a47a, 0xb9825a, 0x8d5b3d][Math.abs(i * 2654435761 | 0) % 4] } };
    });
  }
  function villagerLook(i) { const pe = globalThis.__geo?.people, V = globalThis.WohNpcView; return { cloth: V?.viewColor && pe ? V.viewColor(pe, i) : [160, 160, 160], skin: [0xf1c9a5, 0xd9a47a, 0xb9825a, 0x8d5b3d][Math.abs(i * 2654435761 | 0) % 4] }; }
  /** A new ship starts with n villagers of the player's ethnicity as its crew (replaces the placeholder cylinders). */
  function crewVillagers(shipId, n) {
    const rec = fleet.get(shipId), list = villagerCandidates(n);
    list.forEach(({ i, look }, k) => rec.crew.hire({ id: `npc:${i}`, name: (globalThis.__wohPersonName?.(i) || '') || `村人${i}`, npcRef: i, look }));
    for (let k = list.length; k < n; k++) rec.crew.hire({ id: `hand:${shipId}:${k + 1}`, name: `乗組員${k + 1}`, look: null });
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
    try { best.rec.crew.hire({ id: `npc:${id}`, name, npcRef: id, look: villagerLook(id) }); toast(`${name} を ${best.id} の乗員に雇った`); } catch (e) { toast(`${name} は既に乗員です`); }
    refreshList(); save();
  }
  function dismissHand(shipId, personId) { const rec = fleet.get(shipId); if (rec?.crew?.dismiss(personId)) { toast('乗員を降ろした'); refreshList(); save(); } }
  let shipTab = 'rudder', sailSel = 'all';
  function renderBar() {
    if (!ui.bar) return; ui.ctrl.replaceChildren(); ui.tabs.replaceChildren();
    if (!boarded || !fleet?.has(boarded)) return;
    const rec = fleet.get(boarded), c = ctl[boarded], v = rec.vessel, tab = (k, t) => $('button', { className: 'shipbtn' + (shipTab === k ? ' on' : ''), textContent: t, onclick: () => { shipTab = k; renderBar(); } });
    ui.tabs.append(tab('rudder', '舵'), tab('sail', v.sails.length || v.oars.length ? '帆' : '推進'), tab('anchor', '錨'), tab('nav', '航海'), $('button', { className: 'shipbtn out', textContent: '降りる', onclick: () => disembark() }));
    const hold = (label, dir) => { const b = $('button', { className: 'shipbtn big', textContent: label }); const on = (e) => { e.preventDefault(); c.held = dir; }, off = () => { if (c.held === dir) c.held = 0; }; b.addEventListener('pointerdown', on); ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => b.addEventListener(t, off)); return b; };
    if (shipTab === 'rudder') { ui.tgt = $('b', { textContent: '—' }); ui.ctrl.append(hold('◀ 左', -1), hold('右 ▶', 1), $('span', { className: 'lab' }, [document.createTextNode('目標方位 '), ui.tgt])); }
    else if (shipTab === 'sail') {
      if (v.sails.length) {
        ui.ctrl.append($('button', { className: 'shipbtn' + (c.auto ? ' on' : ''), textContent: '自動', onclick: () => { c.auto = true; renderBar(); } }), $('button', { className: 'shipbtn' + (!c.auto ? ' on' : ''), textContent: '手動', onclick: () => { c.auto = false; renderBar(); } }), c.auto ? $('span', { className: 'lab', textContent: '風に合わせて自動で調整' }) : document.createTextNode(''));
        if (!c.auto) { // manual sail handling: trim angle (which side and how far the yard / boom is braced) and how much sail is set
          const pick = sailSel === 'all' ? v.sails : v.sails.filter((x) => x.id === sailSel), first = pick[0] ?? v.sails[0];
          const sel = $('select', { className: 'shipsel' }, [$('option', { value: 'all', textContent: '全部の帆' }), ...v.sails.map((x, i) => $('option', { value: x.id, textContent: `帆${i + 1}` }))]); sel.value = sailSel; sel.onchange = () => { sailSel = sel.value; renderBar(); };
          const side = (d) => (Math.abs(d) < 1 ? '船首尾線' : `${d > 0 ? '右' : '左'}舷へ${Math.abs(Math.round(d))}°`);
          const angL = $('span', { className: 'lab', textContent: side(first.trimDeg), style: 'min-width:58px;font-size:10.5px' });
          const ang = $('input', { type: 'range', min: -90, max: 90, step: 2.5, value: Math.round(first.trimDeg) });
          ang.oninput = () => { for (const x of pick) { const t = (+ang.value < 0 ? -1 : 1) * Math.min(90, Math.max(x.minTrimDeg, Math.abs(+ang.value))); if (v.state.sailSlewDegS > 0) x.targetTrimDeg = t; else x.trimDeg = t; } angL.textContent = side(+ang.value); };
          const depL = $('span', { className: 'lab', textContent: `${Math.round(first.deployed * 100)}%`, style: 'min-width:34px' });
          const dep = $('input', { type: 'range', min: 0, max: 100, step: 5, value: Math.round(first.deployed * 100) });
          dep.oninput = () => { for (const x of pick) v.setSailDeployed(x.id, +dep.value / 100); depL.textContent = `${dep.value}%`; };
          ui.ctrl.append(sel, $('button', { className: 'shipbtn', textContent: '最適に合わせる', onclick: () => { v.autoTrim(env); renderBar(); } }),
            $('div', { className: 'row2', style: 'display:flex;align-items:center;gap:6px;flex:1 0 100%' }, [$('span', { className: 'lab', textContent: '角度' }), ang, angL, $('span', { className: 'lab', textContent: '展開' }), dep, depL]));
        }
      }
      if (v.oars.length) { const r = $('input', { type: 'range', min: -100, max: 100, step: 5, value: Math.round(c.oar * 100) }); r.oninput = () => { c.oar = r.value / 100; }; ui.ctrl.append($('span', { className: 'lab', textContent: '櫂' }), r); }
      if (!v.sails.length && !v.oars.length) ui.ctrl.append($('span', { className: 'lab', textContent: '帆も櫂もありません' }));
    } else if (shipTab === 'anchor') {
      ui.ctrl.append($('button', { className: 'shipbtn big' + (v.state.anchor ? ' on' : ''), textContent: v.state.anchor ? '錨を上げる' : '錨を下ろす', onclick: () => { if (v.state.anchor) v.raiseAnchor(); else { const r = v.dropAnchor(env, { anchorKg: 400, rodeM: 60 }); if (r.status !== 'ok') toast('投錨できない：' + r.status); } renderBar(); } }), $('span', { className: 'lab', textContent: v.state.anchor ? '錨泊中' : '錨は上がっている' }));
    } else {
      ui.ctrl.append($('button', { className: 'shipbtn' + (pickMode ? ' on' : ''), textContent: pickMode ? '地図をタップ…' : '目的地', onclick: () => { pickMode = !pickMode; toast(pickMode ? '開発者→マップ(世界を俯瞰)を開き、行き先をタップ' : '指定をやめた'); renderBar(); } }),
        $('button', { className: 'shipbtn', textContent: '前方3km', onclick: () => { const st = v.state, h = st.psi; setDest(boarded, st.X + Math.sin(h) * 3000, st.Y + Math.cos(h) * 3000); } }));
      if (captainActive(rec)) ui.ctrl.append($('button', { className: 'shipbtn', textContent: '中止', onclick: () => { fleet.cancelDestination(boarded); updateRoute(null); v.setHeadingTarget(null); ctl[boarded].heading = v.snapshot().headingDeg; renderBar(); } }));
      ui.ctrl.append($('button', { className: 'shipbtn', textContent: `時間 ×${speedX}`, onclick: (e) => { speedX = speedX === 1 ? 4 : speedX === 4 ? 10 : 1; e.target.textContent = `時間 ×${speedX}`; } }));
    }
  }
  function refreshList() {
    if (!ui.list) return;
    const ships = fleet?.list() ?? [];
    ui.list.replaceChildren(...ships.map((r) => $('div', { className: 'card' }, [
      $('div', { className: 'row' }, [$('b', { textContent: r.id }), $('span', { className: 'sub', textContent: Ship.sampleDesigns[r.designId]?.label ?? r.designId })]),
      $('div', { className: 'row' }, [$('button', { className: 'shipbtn' + (boarded === r.id ? ' on' : ''), textContent: boarded === r.id ? '降りる' : '乗る', onclick: () => (boarded === r.id ? disembark() : board(r.id)) }), $('button', { className: 'shipbtn', textContent: '消す', onclick: () => removeShip(r.id) })])])));
    if (!ships.length) ui.list.append($('div', { className: 'sub', textContent: '船はまだありません' }));
    const crewShips = ships.filter((r) => fleet.get(r.id).crew);
    ui.crewBox.replaceChildren(...(crewShips.length ? [$('div', { className: 'sub', textContent: '乗員(同民族の村人5人が最初から乗る)' }), $('button', { className: 'shipbtn', textContent: '選択中の村人を雇う', onclick: hireSelected }),
      ...crewShips.flatMap((r) => fleet.get(r.id).crew.members.filter((x) => x.hired).map((x) => $('div', { className: 'row' }, [$('span', { textContent: `${x.name}(${r.id})`, style: 'flex:1' }), $('button', { className: 'shipbtn', textContent: '降ろす', onclick: () => dismissHand(r.id, x.id) })])))] : []));
    renderBar();
  }
  /** Where the nearest game storm (within 100 km) and calm (within 20 km) are, as seen from here. Cached per 2 km cell and game day. */
  const skyCache = new Map();
  function scanSky(X, Y) {
    const day = globalThis.__geo?.clock?.day ?? 0, key = `${Math.round(X / 2000)},${Math.round(Y / 2000)},${day}`; let r = skyCache.get(key); if (r) return r;
    r = { storm: null, calm: null };
    for (const km of [5, 10, 20, 40, 60, 80, 100]) for (let a = 0; a < 8; a++) {
      const ang = a * Math.PI / 4, q = windField.weather(X + Math.cos(ang) * km * 1000, Y + Math.sin(ang) * km * 1000, 0);
      if (!r.storm && q.storm > 0.25) r.storm = { km, ang };
      if (!r.calm && km <= 20 && q.calm > 0.35) r.calm = { km, ang };
    }
    if (skyCache.size > 600) skyCache.clear(); skyCache.set(key, r); return r;
  }
  const DIR8 = ['東', '北東', '北', '北西', '西', '南西', '南', '南東'], dirName = (ang) => DIR8[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8];
  /** Omens of a storm, by distance (hypothesis D): high cirrus, haze and growing swell, dark sky and falling glass, the storm itself. */
  function omenText(sk, inStorm) {
    const k = sk.storm; if (!k || inStorm) return '';
    const d = dirName(k.ang);
    return k.km <= 10 ? `／嵐が近い(${d}約${k.km}km)` : k.km <= 20 ? `／${d}の空が暗く、気圧が下がる` : k.km <= 40 ? `／${d}の空が白く霞み、うねりが強まる` : k.km <= 60 ? `／${d}に高い筋雲` : `／${d}の遠くに薄い雲の帯`;
  }
  // barometer (hypothesis D): 1013 hPa, lower the closer a storm is; trend over the last ~10 game minutes
  const pHist = []; let pTrend = 0;
  function pressureHpa(X, Y, stormW) { const k = scanSky(X, Y).storm; const near = k ? Math.exp(-k.km / 30) : 0; return 1013 - 24 * Math.max(stormW, near * 0.85); }
  function pressureReading(p) {
    pHist.push({ t: simT, p }); while (pHist.length > 2 && simT - pHist[0].t > 600) pHist.shift();
    const d = p - pHist[0].p; pTrend = simT - pHist[0].t > 30 ? d : 0;
    return { p, arrow: pTrend < -1.2 ? '↓↓' : pTrend < -0.4 ? '↓' : pTrend > 0.4 ? '↑' : '→' };
  }
  function updateHud() {
    if (!ui.inst || !boarded || !fleet?.has(boarded)) return;
    const rec = fleet.get(boarded), v = rec.vessel, s = v.snapshot(), f = v.forces(env), c = ctl[boarded];
    const wi = windField.info(v.state.X, v.state.Y, 0), wf = wi.fromDeg, warrow = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'][Math.round(((wf + 180) % 360) / 45) % 8];
    const sk = scanSky(v.state.X, v.state.Y), vi = visField.info(v.state.X, v.state.Y, 0), sm = meshes.get(boarded)?.sea, pr = pressureReading(pressureHpa(v.state.X, v.state.Y, wi.storm));
    ui.dialCard.setAttribute('transform', `rotate(${(-s.headingDeg).toFixed(1)} 28 28)`); ui.dialWind.setAttribute('transform', `rotate(${wf.toFixed(1)} 28 28)`); ui.dialTgt.setAttribute('transform', `rotate(${(c.heading ?? s.headingDeg).toFixed(1)} 28 28)`);
    ui.dialNum.textContent = String(Math.round(s.headingDeg) % 360);
    if (ui.tgt) ui.tgt.textContent = `${Math.round(c.heading ?? s.headingDeg)}°`;
    const set = (id, v1, v2) => { if (ui.g[id].textContent !== v1) ui.g[id].textContent = v1; const t2 = ui.g[id + 'S'].dataset.label + (v2 ? ' · ' + v2 : ''); if (ui.g[id + 'S'].textContent !== t2) ui.g[id + 'S'].textContent = t2; };
    set('spd', `${(s.speedOverGround * 1.9438).toFixed(1)}kt`, '');
    set('wind', `${warrow}風力${wi.beaufort}`, `${wi.speed.toFixed(1)}m/s`);
    set('wave', sm ? `${sm.hs.toFixed(1)}m` : '—', sm ? `${sm.tp.toFixed(0)}秒${f.waveResistanceFactor > 1.1 ? '・向かい波' : ''}` : '');
    set('baro', `${pr.p.toFixed(0)}hPa`, pr.arrow);
    set('vis', vi.visM >= 10000 ? '良好' : `${(vi.visM / 1000).toFixed(1)}km`, vi.fog > 0.3 ? '霧' : vi.rainMm > 2 ? '雨' : '');
    set('depth', `${f.clearanceM.toFixed(0)}m`, `傾斜${s.heelDeg.toFixed(0)}°`);
    const chips = []; // [text, level] level: '' info, 'w' warning, 'd' danger
    if (wi.storm > 0.5) chips.push([wi.label === '嵐' ? '嵐の中' : '荒天の中', 'd']); else if (wi.storm > 0.3) chips.push(['荒れ模様', 'w']);
    else { const om = omenText(sk, false).replace(/^／/, ''); if (om) chips.push([om, 'w']); }
    if (wi.calm > 0.3) chips.push(['凪', '']); else if (!wi.storm && sk.calm) chips.push([`凪が${dirName(sk.calm.ang)}約${sk.calm.km}km`, '']); if (wi.shelter < 0.8 && wi.storm < 0.3) chips.push(['陸の風下で風が弱い', '']);
    if (s.aground) chips.push(['座礁中', 'd']); else if (f.clearanceM < 3) chips.push(['浅瀬', 'w']);
    if (s.anchored) chips.push([s.anchorDragging ? '走錨中' : '錨泊中', s.anchorDragging ? 'd' : '']);
    const cap = rec.captain, dd = cap?.destination && Math.hypot(cap.destination.X - v.state.X, cap.destination.Y - v.state.Y);
    if (cap && ['sailing', 'arriving'].includes(cap.mode)) chips.push([`航海中 残り${dd > 1000 ? (dd / 1000).toFixed(1) + 'km' : Math.round(dd) + 'm'}（約${Math.round(dd / Math.max(0.8, s.speedOverGround) / 60)}分）${cap.reef < 1 ? '・帆を絞る' : ''}`, '']); else if (cap?.mode === 'arrived') chips.push(['到着', '']);
    const sig = JSON.stringify(chips); if (sig !== ui.statSig) { ui.statSig = sig; ui.stat.replaceChildren(...chips.map(([t, l]) => $('span', { className: l, textContent: t }))); }
  }
})();
