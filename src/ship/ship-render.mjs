/**
 * Three.js display objects for ships, shared by the sandbox page and the game glue.
 * THREE is passed in (r128-compatible), so this module has no import of it. Display only: physics never reads these.
 * Mesh axes: x = starboard, y = up, z = -forward (bow toward -z); the group origin is the waterline at the centre of gravity.
 * Place a ship with group.position and group.rotation.set(0, -heading, -heel) (order YXZ), then call updateShipObject().
 */
import { createHull } from './hull-geometry.mjs';
import { buildHullMesh } from './hull-mesh.mjs';

export function buildShipObject(T, { hull: hullSpec, vessel, visual = {} }) {
  const hull = createHull(hullSpec), mesh = buildHullMesh(hull);
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(mesh.positions, 3)); g.setAttribute('normal', new T.BufferAttribute(mesh.normals, 3)); g.setIndex(new T.BufferAttribute(mesh.indices, 1));
  const cutPlane = new T.Plane(new T.Vector3(0, -1, 0), 1e6); // keeps what is below it; moved into place for the cutaway view
  const hullMesh = new T.Mesh(g, new T.MeshStandardMaterial({ color: 0x8a6a3f, roughness: 0.9, metalness: 0, clippingPlanes: [cutPlane] }));
  const inner = new T.Group(); inner.add(hullMesh);
  const L = hull.xMax - hull.xMin, p = vessel.params, mid = hull.sectionAt((hull.xMin + hull.xMax) / 2), top = mid[mid.length - 1].z;
  const offZ = p.cgX - hull.xMin; // the group origin sits at the CG
  inner.position.set(0, -p.draftM, offZ);
  const sails = [], masts = [];
  for (const s of visual.customRig ? [] : vessel.sails) { // a design with its own rig builder (e.g. the Pinta) skips the generic one
    const mastH = Math.max(8, s.zCe * 1.5), zMast = -(s.x - hull.xMin);
    const mast = new T.Mesh(new T.CylinderGeometry(0.25, 0.35, mastH, 6), new T.MeshStandardMaterial({ color: 0x5a432a }));
    mast.position.set(0, top + mastH / 2, zMast); inner.add(mast); masts.push(mast);
    const side = Math.sqrt(s.areaM2), pivot = new T.Group(); pivot.position.set(0, top + mastH * 0.35, zMast);
    let sailGeo, mat = { color: 0xf1ead8, side: T.DoubleSide, roughness: 1 };
    if (s.shape === 'square') { sailGeo = new T.PlaneGeometry(side * 1.25, side * 0.8); sailGeo.rotateY(Math.PI / 2); } // centred on the mast, yard athwartships at trim 90
    else if (s.shape === 'lateen') { // triangle: tack at the mast foot, head up and aft along the yard
      const c = side * 1.7, h = side * 1.7 * 0.5 * 0.7; sailGeo = new T.BufferGeometry();
      sailGeo.setAttribute('position', new T.BufferAttribute(new Float32Array([0, 0, 0, 0, h, c * 0.15, 0, 0, c]), 3)); sailGeo.setIndex([0, 1, 2]); sailGeo.computeVertexNormals();
    } else { sailGeo = new T.PlaneGeometry(side * 1.0, side * 0.9); sailGeo.rotateY(Math.PI / 2); sailGeo.translate(0, 0, side * 0.5); }
    if (s.cross && typeof document !== 'undefined') mat.map = crossTexture(T);
    pivot.add(new T.Mesh(sailGeo, new T.MeshStandardMaterial(mat)));
    inner.add(pivot); sails.push({ sail: s, pivot });
  }
  if (visual.bowsprit) { // a spar angled up over the bow
    const bs = new T.Mesh(new T.CylinderGeometry(0.12, 0.2, 6, 6), new T.MeshStandardMaterial({ color: 0x5a432a }));
    bs.rotation.x = -Math.PI / 2 + 0.4; bs.position.set(0, top + 0.5, -L - 1.4); inner.add(bs); masts.push(bs);
  }
  if (visual.flag && vessel.sails.length) { // pennant at the head of the tallest mast
    const s0 = vessel.sails.reduce((a, b) => (b.zCe > a.zCe ? b : a)), mastH = Math.max(8, s0.zCe * 1.5);
    const f = new T.Mesh(new T.PlaneGeometry(1.8, 1.0), new T.MeshStandardMaterial({ color: 0xb3262e, side: T.DoubleSide })); f.rotation.y = Math.PI / 2; f.position.set(0, top + mastH + 0.6, -(s0.x - hull.xMin) + 0.9); inner.add(f); masts.push(f);
  }
  const group = new T.Group(); group.rotation.order = 'YXZ'; group.add(inner); group.frustumCulled = false;
  // Walkable deck rectangle in group coordinates (the waterline origin is at the CG), kept inside the rails.
  const halfBeam = mid[mid.length - 1].b * 0.8;
  const deck = { y: top - p.draftM + 0.1, halfBeam, zMin: -(L - offZ) + 0.12 * L, zMax: offZ - 0.12 * L };
  const frame = { cgX: p.cgX, draft: p.draftM };
  return { group, inner, hull, vessel, cutPlane, cutY: null, cutaway: false, sails, masts, hullMesh, frame, deckY: deck.y, deck, L, interiorGroups: new Map(), dispose() { group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); } };
}

/** Red cross on white cloth (cross of the Order of Christ, flared arms), drawn once and shared. */
let crossTex = null;
function crossTexture(T) {
  if (crossTex) return crossTex;
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#f1ead8'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#b3262e';
  const arm = (dx, dy) => { g.save(); g.translate(128, 128); g.rotate(Math.atan2(dy, dx)); g.beginPath(); g.moveTo(10, -9); g.lineTo(62, -9); g.lineTo(88, -34); g.lineTo(88, 34); g.lineTo(62, 9); g.lineTo(10, 9); g.closePath(); g.fill(); g.restore(); };
  arm(1, 0); arm(-1, 0); arm(0, 1); arm(0, -1); g.beginPath(); g.arc(128, 128, 14, 0, 7); g.fill();
  crossTex = new T.CanvasTexture(c); return crossTex;
}

/** Sail angles and reefing follow the vessel (call every frame). Position and rotation are set by the caller. */
export function updateShipObject(obj, hint = {}) {
  const DEG = Math.PI / 180;
  for (const { sail, pivot } of obj.sails) { pivot.rotation.y = sail.trimDeg * DEG; pivot.scale.set(1, Math.max(0.05, sail.deployed), 1); }
  if (obj.cutY !== null) { // cut the hull above head height, along the ship's own up direction (it rolls with the ship)
    const g = obj.group; g.updateMatrixWorld(true);
    const up = new obj.cutPlane.normal.constructor(0, 1, 0).transformDirection(g.matrixWorld), pt = new obj.cutPlane.normal.constructor(0, obj.cutY, 0).applyMatrix4(g.matrixWorld);
    obj.cutPlane.setFromNormalAndCoplanarPoint(up.negate(), pt);
  } else { obj.cutPlane.normal.set(0, -1, 0); obj.cutPlane.constant = 1e6; }
  for (const f of obj.updaters ?? []) f(hint);
}

const USE_COLOR = { cabin: 0x9b7b4f, crew: 0x7a6038, cargo: 0x6a5a40, store: 0x806a48, deck: 0x8a6a3f };

/**
 * Add floors and walls for an interior (see interior.mjs) to a ship object. Each deck is its own group so that only
 * the deck the player is on is shown (a cutaway view). The weather deck is the hull's own top, so it gets no floor.
 */
export function addInterior(T, obj, interior, { weatherDeck = 'weather', wallHeight = 2.3 } = {}) {
  const { cgX, draft } = obj.frame;
  const place = (mesh, x0, x1, y0, y1, z, h) => { mesh.position.set((y0 + y1) / 2, z - draft + h / 2, cgX - (x0 + x1) / 2); return mesh; };
  for (const deck of interior.decks) {
    const g = new T.Group(); g.visible = false;
    {
      for (const r of interior.floorRects(deck.id)) {
        if (r.floor === false) continue; // e.g. the main deck, which is the hull's own top

        const m = new T.Mesh(new T.BoxGeometry(r.y1 - r.y0, 0.12, r.x1 - r.x0), new T.MeshLambertMaterial({ color: USE_COLOR[r.use] ?? 0x7a6038 }));
        g.add(place(m, r.x0, r.x1, r.y0, r.y1, deck.z - 0.12, 0.12));
      }
      for (const w of interior.wallRects(deck.id)) {
        const h = w.h ?? wallHeight, m = new T.Mesh(new T.BoxGeometry(w.y1 - w.y0, h, w.x1 - w.x0), new T.MeshLambertMaterial({ color: 0x5f4a2e, transparent: true, opacity: 0.92 }));
        g.add(place(m, w.x0, w.x1, w.y0, w.y1, deck.z, h));
      }
    }
    obj.group.add(g); obj.interiorGroups.set(deck.id, g);
  }
  obj.interior = interior; obj.weatherDeck = interior.decks.find((d) => d.exterior)?.id ?? weatherDeck;
}

/** Cutaway: exterior decks stay visible; below decks show only the deck you are on and the hull turns see-through. A room may hide decks above it (`hideDecks`). */
export function setViewDeck(obj, deckId, roomId = null) {
  const decks = obj.interior.decks, here = decks.find((d) => d.id === deckId), below = !here?.exterior;
  const room = roomId && obj.interior.rooms.find((r) => r.id === roomId), hidden = new Set(room?.hideDecks ?? []);
  for (const d of decks) obj.interiorGroups.get(d.id).visible = (d.exterior ? !below : d.id === deckId) && !hidden.has(d.id);
  for (const { pivot } of obj.sails) pivot.visible = !below; // sails and masts would block the cutaway view
  for (const m of obj.masts) m.visible = !below;
  obj.cutaway = below;
  if (obj.detail) { obj.detail.structure.visible = !below; obj.detail.rigging.visible = !below; obj.detail.seams.visible = !below; }
  // Below deck: the hull stays solid; everything above head height is cut away so you look into an open-topped hull (inner sides show).
  const m = obj.hullMesh.material; m.transparent = false; m.opacity = 1; m.depthWrite = true; m.side = below ? 2 : 0; // 2 = DoubleSide
  // cut just under the next deck above, so that deck's cap (the hull top) is removed and you look down into the hull
  const z0 = obj.interior.deckZ(deckId), above = decks.map((d) => d.z).filter((z) => z > z0 + 1e-6);
  obj.cutY = below ? (above.length ? Math.min(...above) - 0.03 : z0 + 2.0) - obj.frame.draft : null;
}

/** Put the player figure at an interior position {x, y, deck} (hull frame). */
export function placePlayer(obj, pos) {
  const { cgX, draft } = obj.frame; obj.player.position.set(pos.y, obj.interior.deckZ(pos.deck) - draft + 0.02, cgX - pos.x);
}

const ROLE_COLOR = { captain: 0xb3262e, maestre: 0x2d5fa8, piloto: 0x2a8a5a, seaman: 0xc9b27a };
/** One simple 1:1 figure per crew member, children of the ship group (they roll and pitch with the ship). */
export function addCrewFigures(T, obj, crew) {
  obj.crewFigs = [];
  for (const m of crew.members) {
    const f = new T.Group(), body = new T.Mesh(new T.CylinderGeometry(0.26, 0.26, 1.15, 8), new T.MeshLambertMaterial({ color: ROLE_COLOR[m.role] ?? 0xc9b27a })), head = new T.Mesh(new T.SphereGeometry(0.22, 10, 8), new T.MeshLambertMaterial({ color: 0xe8c79a }));
    body.position.y = 0.58; head.position.y = 1.42; f.add(body, head); obj.group.add(f); obj.crewFigs.push({ m, f });
  }
  obj.crewInterior = crew.interior;
}
/** Place the figures; below-deck figures show only while the player is on that deck. */
export function updateCrewFigures(obj, playerDeck = null) {
  const it = obj.crewInterior; if (!it) return; const { cgX, draft } = obj.frame;
  for (const { m, f } of obj.crewFigs) {
    f.position.set(m.pos.y, it.deckZ(m.pos.deck) - draft + 0.02, cgX - m.pos.x);
    f.visible = !!it.decks.find((d) => d.id === m.pos.deck)?.exterior || playerDeck === m.pos.deck;
  }
}
