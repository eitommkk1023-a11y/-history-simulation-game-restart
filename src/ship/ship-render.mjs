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
  const sails = [];
  for (const s of vessel.sails) {
    const mastH = Math.max(8, s.zCe * 1.5), zMast = -(s.x - hull.xMin);
    const mast = new T.Mesh(new T.CylinderGeometry(0.25, 0.35, mastH, 6), new T.MeshStandardMaterial({ color: 0x5a432a }));
    mast.position.set(0, top + mastH / 2, zMast); inner.add(mast);
    const side = Math.sqrt(s.areaM2), pivot = new T.Group(); pivot.position.set(0, top + mastH * 0.35, zMast);
    const sailGeo = new T.PlaneGeometry(side * 1.0, side * 0.9); sailGeo.rotateY(Math.PI / 2); sailGeo.translate(0, 0, side * 0.5);
    pivot.add(new T.Mesh(sailGeo, new T.MeshStandardMaterial({ color: 0xf1ead8, side: T.DoubleSide, roughness: 1 })));
    inner.add(pivot); sails.push({ sail: s, pivot });
  }
  const group = new T.Group(); group.rotation.order = 'YXZ'; group.add(inner); group.frustumCulled = false;
  // Walkable deck rectangle in group coordinates (the waterline origin is at the CG), kept inside the rails.
  const halfBeam = mid[mid.length - 1].b * 0.8;
  const deck = { y: top - p.draftM + 0.1, halfBeam, zMin: -(L - offZ) + 0.12 * L, zMax: offZ - 0.12 * L };
  return { group, sails, deckY: deck.y, deck, L, dispose() { group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); } };
}

/** Sail angles and reefing follow the vessel (call every frame). Position and rotation are set by the caller. */
export function updateShipObject(obj) {
  const DEG = Math.PI / 180;
  for (const { sail, pivot } of obj.sails) { pivot.rotation.y = sail.trimDeg * DEG; pivot.scale.set(1, Math.max(0.05, sail.deployed), 1); }
}
