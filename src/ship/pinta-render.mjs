/**
 * Three.js structure, rig and rudder for the 1492 Pinta (research_compact_1690 profile). Display only.
 * Separated as in the spec: hull skin (from buildShipObject), structure (deck, quarterdeck, bulwark, keel, stem, sternpost,
 * rudder, hatch), spars and rigging (masts, yards, standing and running rigging) and sail cloth. All shapes are level D:
 * the original ship has no surviving plans. No insignia on sails, no flag, no guns (armament unresolved).
 * Hull-frame coordinates (x stern -> bow, y starboard +, z up from the keel underside) map to the ship object's inner group as
 * (x, y, z)_hull -> (y, z, -x) in Three.js.
 */
import { PINTA_1492_PARAMS as G } from './pinta-1492-params.mjs';
import { LOA, DECK_Z, keelZ } from './pinta-design.mjs';

const DEG = Math.PI / 180;
const P3 = (T, x, y, z) => new T.Vector3(y, z, -x);
const mat = (T, color, o = {}) => new T.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, ...o });

/** Half-breadth of the hull at (x, z) from its stations. */
const halfAt = (hull, x, z) => { const sec = hull.sectionAt(Math.min(hull.xMax - 1e-6, Math.max(hull.xMin + 1e-6, x))); if (z <= sec[0].z) return sec[0].b; for (let i = 1; i < sec.length; i++) if (z <= sec[i].z) return sec[i - 1].b + (sec[i].b - sec[i - 1].b) * (z - sec[i - 1].z) / (sec[i].z - sec[i - 1].z); return sec[sec.length - 1].b; };

function tube(T, pts, r, color) {
  const curve = new T.CatmullRomCurve3(pts), g = new T.TubeGeometry(curve, Math.max(8, pts.length * 6), r, 6, false);
  return new T.Mesh(g, mat(T, color));
}
function ribbon(T, left, right, color, double = true) { // strip between two polylines (same point count)
  const pos = [], idx = []; left.forEach((l, i) => { pos.push(l.x, l.y, l.z, right[i].x, right[i].y, right[i].z); if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } });
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(pos), 3)); g.setIndex(idx); g.computeVertexNormals();
  return new T.Mesh(g, mat(T, color, { side: double ? T.DoubleSide : T.FrontSide }));
}
function lines(T, segs, color) { // segs: array of [Vector3, Vector3]
  const a = new Float32Array(segs.length * 6); segs.forEach(([p, q], i) => a.set([p.x, p.y, p.z, q.x, q.y, q.z], i * 6));
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(a, 3)); return new T.LineSegments(g, new T.LineBasicMaterial({ color }));
}

export function addPintaStructure(T, obj, design, vessel) {
  const { inner, hull } = obj, W = G.hull.bulwarkHeight.value, qLen = LOA * G.quarterdeck.lengthU.value, qz = DECK_Z + G.quarterdeck.rise.value;
  const plank = G.hull.plankWidth.value, xs = Array.from({ length: 49 }, (_, i) => 0.05 + (LOA - 0.1) * i / 48);
  const structure = new T.Group(), seams = new T.Group(), rigging = new T.Group(); inner.add(structure, seams, rigging);
  obj.detail = { structure, seams, rigging };

  // Hull planking seams (carvel: flush planks, so only dark seam lines). Level D plank width.
  const segs = [];
  for (let z = plank; z < DECK_Z - 1e-3; z += plank) for (const side of [1, -1]) {
    let prev = null;
    for (const x of xs) {
      if (z <= keelZ(x) + 0.02) { prev = null; continue; }
      const p = P3(T, x, side * (halfAt(hull, x, z) + 0.004), z);
      if (prev) segs.push([prev, p]); prev = p;
    }
  }
  seams.add(lines(T, segs, 0x35260f));

  // Keel, stem, sternpost.
  const kp = []; for (let x = 0.45; x <= 16.2; x += 0.9) kp.push(P3(T, x, 0, keelZ(x) - 0.02)); kp.push(P3(T, 16.2, 0, keelZ(16.2) - 0.02));
  structure.add(tube(T, kp, 0.11, 0x4d3a22));
  structure.add(tube(T, [P3(T, 16.2, 0, 1.56), P3(T, 16.55, 0, 2.15), P3(T, 16.9, 0, 2.85), P3(T, 16.95, 0, DECK_Z + W + 0.1)], 0.1, 0x4d3a22));
  structure.add(tube(T, [P3(T, 0.45, 0, 1.56), P3(T, 0.2, 0, 2.3), P3(T, 0.12, 0, DECK_Z + W)], 0.1, 0x4d3a22));

  // Bulwark: a low waist rail on both sides, following the deck outline; it closes at the stem.
  for (const side of [1, -1]) {
    const lo = [], hi = [];
    for (const x of xs) { const b = halfAt(hull, x, DECK_Z) + 0.01; lo.push(P3(T, x, side * b, DECK_Z)); hi.push(P3(T, x, side * b, DECK_Z + W * (x < qLen ? 0.6 : 1))); }
    structure.add(ribbon(T, lo, hi, 0x6a5232));
  }
  // Transom (aft closure above the deck) is part of the hull mesh end cap; add a short top rail across it.
  // Quarterdeck: raised after deck with a floor slab, a fascia, four posts and a low rail. Level D size.
  {
    const shape = new T.Shape(), xq = []; for (let x = 0.02; x <= qLen; x += 0.35) xq.push(x); xq.push(qLen);
    shape.moveTo(-halfAt(hull, xq[0], DECK_Z) + 0.03, xq[0]); for (const x of xq) shape.lineTo(halfAt(hull, x, DECK_Z) - 0.03, x); for (const x of [...xq].reverse()) shape.lineTo(-halfAt(hull, x, DECK_Z) + 0.03, x);
    const g = new T.ShapeGeometry(shape); g.rotateX(Math.PI / 2); // (y, x) -> floor plane; flip so x maps to -z of the inner frame
    const slab = new T.Mesh(g, mat(T, 0x8a6a3f, { side: T.DoubleSide })); slab.scale.set(1, 1, -1); slab.position.y = qz; structure.add(slab);
    const lo = [], hi = []; for (const side of [1]) for (const x of xq) { const b = halfAt(hull, x, DECK_Z) - 0.03; lo.push(P3(T, x, b, qz)); hi.push(P3(T, x, b, qz + 0.55)); }
    structure.add(ribbon(T, lo, hi, 0x6a5232)); const lo2 = lo.map((p) => new T.Vector3(-p.x, p.y, p.z)), hi2 = hi.map((p) => new T.Vector3(-p.x, p.y, p.z)); structure.add(ribbon(T, lo2, hi2, 0x6a5232));
    const fL = [], fH = []; for (const side of [1, -1]) { fL.length = 0; fH.length = 0; for (const x of xq) { const b = halfAt(hull, x, DECK_Z) - 0.03; fL.push(P3(T, x, side * b, DECK_Z)); fH.push(P3(T, x, side * b, qz)); } structure.add(ribbon(T, [...fL], [...fH], 0x7a5e38)); }
    for (const [x, y] of [[0.6, 1.1], [0.6, -1.1], [qLen - 0.25, 1.4], [qLen - 0.25, -1.4]]) { const post = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, qz - DECK_Z, 6), mat(T, 0x5a432a)); post.position.copy(P3(T, x, y, (DECK_Z + qz) / 2)); structure.add(post); }
  }
  // Hatch to the hold: low coaming and a dark opening (the ladder is part of the interior layout).
  {
    const h = G.interior.hatch.value, x0 = h.u0 * LOA, x1 = h.u1 * LOA, w = h.width / 2, c = 0.22;
    const hole = new T.Mesh(new T.PlaneGeometry(h.width, x1 - x0), new T.MeshBasicMaterial({ color: 0x0d0904 })); hole.rotation.x = -Math.PI / 2; hole.position.copy(P3(T, (x0 + x1) / 2, 0, DECK_Z + 0.01)); structure.add(hole);
    for (const [cx, cy, sx, sy] of [[(x0 + x1) / 2, w, x1 - x0, 0.07], [(x0 + x1) / 2, -w, x1 - x0, 0.07], [x0, 0, 0.07, h.width], [x1, 0, 0.07, h.width]]) { const b = new T.Mesh(new T.BoxGeometry(sy, c, sx), mat(T, 0x5a432a)); b.position.copy(P3(T, cx, cy, DECK_Z + c / 2)); structure.add(b); }
  }
  // Deck plank seams (lengthwise).
  { const ds = []; for (let y = -2.3; y <= 2.31; y += 0.22) { let prev = null; for (const x of xs) { if (Math.abs(y) > halfAt(hull, x, DECK_Z) - 0.05 || x < qLen) { prev = null; continue; } const p = P3(T, x, y, DECK_Z + 0.006); if (prev) ds.push([prev, p]); prev = p; } } seams.add(lines(T, ds, 0x4a3820)); }

  // Rudder: sternpost-hung blade with a tiller on the quarterdeck. Positive rudder angle turns the bow to starboard.
  {
    const rd = G.rudder, hinge = rd.hingeX.value, g = new T.Group(); g.position.copy(P3(T, hinge, 0, 0));
    const blade = new T.Mesh(new T.BoxGeometry(0.1, rd.bladeDepth.value, rd.bladeWidth.value), mat(T, 0x5a432a)); blade.position.set(0, 1.58 - rd.bladeDepth.value / 2 + 0.9, rd.bladeWidth.value / 2 - 0.05); g.add(blade);
    const stock = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, qz + 0.4, 6), mat(T, 0x5a432a)); stock.position.set(0, (qz + 0.4) / 2, 0); g.add(stock);
    const tiller = new T.Mesh(new T.BoxGeometry(0.07, 0.07, rd.tillerLength.value), mat(T, 0x4d3a22)); tiller.position.set(0, qz + 0.45, -rd.tillerLength.value / 2); g.add(tiller);
    structure.add(g); obj.rudder = g;
  }

  // Masts, yards, sails, rigging. Sail cloth: unbleached linen; no insignia.
  const cloth = new T.MeshStandardMaterial({ color: 0xe3d8bb, side: T.DoubleSide, roughness: 1 });
  const rigSegs = [], sailBySail = new Map(); obj.sails.length = 0;
  for (const s of vessel.sails) {
    const H = s.mastHeight, base = P3(T, s.x, 0, 0.55), top = DECK_Z + H;
    const mast = new T.Mesh(new T.CylinderGeometry(0.1, 0.2, top - 0.55, 8), mat(T, 0x5a432a)); mast.position.copy(P3(T, s.x, 0, (top + 0.55) / 2)); inner.add(mast); obj.masts.push(mast);
    const pivot = new T.Group(); obj.masts.push(pivot); // masts list is hidden in cutaway view
    let leftEnd, rightEnd;
    if (s.shape === 'square') {
      const yardZ = DECK_Z + H * 0.82, w = s.yard * 0.92, h = s.areaM2 / w;
      pivot.position.copy(P3(T, s.x, 0, yardZ));
      const yard = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, s.yard, 6), mat(T, 0x5a432a)); yard.rotation.x = Math.PI / 2; pivot.add(yard);
      const sg = new T.PlaneGeometry(w, h, 8, 5); sg.rotateY(Math.PI / 2); sg.translate(0, -h / 2 - 0.05, 0);
      const pos = sg.attributes.position; for (let i = 0; i < pos.count; i++) { const zz = pos.getZ(i) / (w / 2), yy = (pos.getY(i) + 0.05) / h; pos.setX(i, 0.35 * (1 - zz * zz) * (-yy) * 0.6); } sg.computeVertexNormals();
      const sail = new T.Mesh(sg, cloth); pivot.add(sail); obj.sails.push({ sail: s, pivot });
      leftEnd = new T.Vector3(0, 0, s.yard / 2); rightEnd = new T.Vector3(0, 0, -s.yard / 2);
    } else { // lateen: long yard slanting up and aft, triangular sail; scaled to the parameter area
      const tack = new T.Vector3(0, 0, 0), head = new T.Vector3(0, 1, 1.9), clew = new T.Vector3(0, 0, 2.2);
      const geoArea = 0.5 * Math.abs((head.y - tack.y) * (clew.z - tack.z) - (head.z - tack.z) * (clew.y - tack.y)), k = Math.sqrt(s.areaM2 / geoArea), len = Math.hypot(head.y - tack.y, head.z - tack.z) * k;
      const f = s.yard / len; // keep the research-style yard length: stretch the triangle so the yard is `yard` long, then rescale the area back
      const sx = Math.min(1.3, Math.max(0.7, f));
      const A = new T.Vector3(0, 0, -0.33 * k * 2.9 * sx), B = new T.Vector3(0, 3.2 * k * 0.72 * sx, 1.9 * k * 1.2 * sx), C = new T.Vector3(0, 0, 2.2 * k * 1.2 * sx);
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array([A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z]), 3)); g.setIndex([0, 1, 2]); g.computeVertexNormals();
      pivot.position.copy(P3(T, s.x, 0, DECK_Z + 1.0));
      pivot.add(new T.Mesh(g, cloth));
      const yardLen = A.distanceTo(B), yard = new T.Mesh(new T.CylinderGeometry(0.06, 0.05, yardLen, 6), mat(T, 0x5a432a));
      yard.position.copy(A.clone().add(B).multiplyScalar(0.5)); yard.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), B.clone().sub(A).normalize()); pivot.add(yard);
      obj.sails.push({ sail: s, pivot }); leftEnd = B; rightEnd = A;
    }
    inner.add(pivot);
    // Standing rigging (level D): shrouds from the masthead to the hull side, stays fore and aft. Running rigging: halyard and braces/sheets.
    const mh = P3(T, s.x, 0, top - 0.2), b = halfAt(hull, s.x, DECK_Z);
    for (const dx of [-0.5, 0, 0.5]) for (const side of [1, -1]) rigSegs.push([mh, P3(T, s.x + dx, side * (b + 0.05), DECK_Z + 0.35)]);
    rigSegs.push([mh, P3(T, Math.min(LOA - 0.3, s.x + 2.8 + H * 0.5), 0, DECK_Z + W)], [mh, P3(T, Math.max(0.3, s.x - 3.0 - H * 0.3), 0, DECK_Z + W)]);
    obj.rigDynamic ??= []; obj.rigDynamic.push({ pivot, a: leftEnd, b: rightEnd, deckL: P3(T, s.x - 2.2, -(b + 0.02), DECK_Z + 0.4), deckR: P3(T, s.x - 2.2, b + 0.02, DECK_Z + 0.4) });
  }
  rigging.add(lines(T, rigSegs, 0x2b2118));
  // Dynamic running rigging (braces/sheets) from the yard ends or sail corners to the deck: rebuilt each frame from the pivots' angles.
  const dyn = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0x2b2118 })); dyn.geometry.setAttribute('position', new T.BufferAttribute(new Float32Array(obj.rigDynamic.length * 12), 3)); dyn.frustumCulled = false; rigging.add(dyn);
  obj.updaters = obj.updaters ?? [];
  obj.updaters.push((hint = {}) => {
    const a = dyn.geometry.attributes.position.array; let o = 0; const tmp = new T.Vector3();
    for (const r of obj.rigDynamic) { for (const [end, deck] of [[r.a, r.deckL], [r.b, r.deckR]]) { tmp.copy(end).applyEuler(r.pivot.rotation).multiply(r.pivot.scale).add(r.pivot.position); a[o++] = tmp.x; a[o++] = tmp.y; a[o++] = tmp.z; a[o++] = deck.x; a[o++] = deck.y; a[o++] = deck.z; } }
    dyn.geometry.attributes.position.needsUpdate = true;
    if (obj.rudder) obj.rudder.rotation.y = vessel.state.rudderDeg * DEG;
    const lee = hint.leeSign ?? 1; for (const { pivot } of obj.sails) pivot.scale.x = lee; // sail bellies toward the lee side
  });
  // Scale references: a barrel by the hatch (the person figure is added by the host page).
  { const barrel = new T.Mesh(new T.CylinderGeometry(0.28, 0.28, 0.9, 12), mat(T, 0x7a5a32)); barrel.position.copy(P3(T, 9.6, -1.1, DECK_Z + 0.45)); structure.add(barrel); }
  obj.setDetail = (level) => { structure.visible = level <= 1 && !obj.cutaway; seams.visible = level === 0 && !obj.cutaway; rigging.visible = level <= 1 && !obj.cutaway; }; // LOD: 0 near, 1 medium, 2 far silhouette
}
