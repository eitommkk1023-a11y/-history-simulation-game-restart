/**
 * Three.js display objects for ships, shared by the sandbox page and the game glue.
 * THREE is passed in (r128-compatible), so this module has no import of it. Display only: physics never reads these.
 * Mesh axes: x = starboard, y = up, z = -forward (bow toward -z); the group origin is the waterline at the centre of gravity.
 * Place a ship with group.position and group.rotation.set(0, -heading, -heel) (order YXZ), then call updateShipObject().
 */
import { createHull } from './hull-geometry.mjs';
import { buildHullMesh } from './hull-mesh.mjs';

export function buildShipObject(T, { hull: hullSpec, vessel }) {
  const hull = createHull(hullSpec), mesh = buildHullMesh(hull);
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(mesh.positions, 3)); g.setAttribute('normal', new T.BufferAttribute(mesh.normals, 3)); g.setIndex(new T.BufferAttribute(mesh.indices, 1));
  const hullMesh = new T.Mesh(g, new T.MeshStandardMaterial({ color: 0x8a6a3f, roughness: 0.9, metalness: 0 }));
  const inner = new T.Group(); inner.add(hullMesh);
  const L = hull.xMax - hull.xMin, p = vessel.params, mid = hull.sectionAt((hull.xMin + hull.xMax) / 2), top = mid[mid.length - 1].z;
  const offZ = p.cgX - hull.xMin; // the group origin sits at the CG
  inner.position.set(0, -p.draftM, offZ);
  const sails = [], masts = [];
  for (const s of vessel.sails) {
    const mastH = Math.max(8, s.zCe * 1.5), zMast = -(s.x - hull.xMin);
    const mast = new T.Mesh(new T.CylinderGeometry(0.25, 0.35, mastH, 6), new T.MeshStandardMaterial({ color: 0x5a432a }));
    mast.position.set(0, top + mastH / 2, zMast); inner.add(mast); masts.push(mast);
    const side = Math.sqrt(s.areaM2), pivot = new T.Group(); pivot.position.set(0, top + mastH * 0.35, zMast);
    const sailGeo = new T.PlaneGeometry(side * 1.0, side * 0.9); sailGeo.rotateY(Math.PI / 2); sailGeo.translate(0, 0, side * 0.5);
    pivot.add(new T.Mesh(sailGeo, new T.MeshStandardMaterial({ color: 0xf1ead8, side: T.DoubleSide, roughness: 1 })));
    inner.add(pivot); sails.push({ sail: s, pivot });
  }
  const group = new T.Group(); group.rotation.order = 'YXZ'; group.add(inner); group.frustumCulled = false;
  // Walkable deck rectangle in group coordinates (the waterline origin is at the CG), kept inside the rails.
  const halfBeam = mid[mid.length - 1].b * 0.8;
  const deck = { y: top - p.draftM + 0.1, halfBeam, zMin: -(L - offZ) + 0.12 * L, zMax: offZ - 0.12 * L };
  const frame = { cgX: p.cgX, draft: p.draftM };
  return { group, sails, masts, hullMesh, frame, deckY: deck.y, deck, L, interiorGroups: new Map(), dispose() { group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); } };
}

/** Sail angles and reefing follow the vessel (call every frame). Position and rotation are set by the caller. */
export function updateShipObject(obj) {
  const DEG = Math.PI / 180;
  for (const { sail, pivot } of obj.sails) { pivot.rotation.y = sail.trimDeg * DEG; pivot.scale.set(1, Math.max(0.05, sail.deployed), 1); }
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
    if (deck.id !== weatherDeck) {
      for (const r of interior.floorRects(deck.id)) {
        const m = new T.Mesh(new T.BoxGeometry(r.y1 - r.y0, 0.12, r.x1 - r.x0), new T.MeshLambertMaterial({ color: USE_COLOR[r.use] ?? 0x7a6038 }));
        g.add(place(m, r.x0, r.x1, r.y0, r.y1, deck.z - 0.12, 0.12));
      }
      for (const w of interior.wallRects(deck.id)) {
        const m = new T.Mesh(new T.BoxGeometry(w.y1 - w.y0, wallHeight, w.x1 - w.x0), new T.MeshLambertMaterial({ color: 0x5f4a2e, transparent: true, opacity: 0.92 }));
        g.add(place(m, w.x0, w.x1, w.y0, w.y1, deck.z, wallHeight));
      }
    }
    obj.group.add(g); obj.interiorGroups.set(deck.id, g);
  }
  obj.interior = interior; obj.weatherDeck = weatherDeck;
}

/** Cutaway: show only `deckId`'s interior; below the weather deck the hull turns see-through. */
export function setViewDeck(obj, deckId) {
  for (const [id, g] of obj.interiorGroups) g.visible = id === deckId;
  const below = deckId !== obj.weatherDeck && obj.interiorGroups.size > 1;
  for (const { pivot } of obj.sails) pivot.visible = !below; // sails and masts would block the cutaway view
  for (const m of obj.masts) m.visible = !below;
  const m = obj.hullMesh.material; if (m.transparent !== below) { m.transparent = below; m.opacity = below ? 0.22 : 1; m.depthWrite = !below; m.needsUpdate = true; }
}

/** Put the player figure at an interior position {x, y, deck} (hull frame). */
export function placePlayer(obj, pos) {
  const { cgX, draft } = obj.frame; obj.player.position.set(pos.y, obj.interior.deckZ(pos.deck) - draft + 0.02, cgX - pos.x);
}
