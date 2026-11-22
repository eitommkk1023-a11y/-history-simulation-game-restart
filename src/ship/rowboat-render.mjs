/**
 * Small rowing boat details (level D): gunwale rail, three thwarts, two oars that stroke while rowed, a steering oar at the stern.
 * Display only. The oars follow the vessel's oar effort: no effort = shipped (held out, still); effort > 0 = rowing; < 0 = backing water.
 */
const DEG = Math.PI / 180;
export function addRowboatDetails(T, obj, vessel) {
  const { inner, hull } = obj, wood = (c) => new T.MeshStandardMaterial({ color: c, roughness: 0.95 }), P3 = (x, y, z) => new T.Vector3(y, z, -x);
  const half = (x, z) => { const sec = hull.sectionAt(Math.min(hull.xMax - 1e-6, Math.max(hull.xMin + 1e-6, x))); for (let i = 1; i < sec.length; i++) if (z <= sec[i].z) return sec[i - 1].b + (sec[i].b - sec[i - 1].b) * (z - sec[i - 1].z) / (sec[i].z - sec[i - 1].z || 1); return sec[sec.length - 1].b; };
  const rail = (side) => { const pts = []; for (let x = 0.2; x <= 4.5; x += 0.25) pts.push(P3(x, side * (half(x, 0.62) + 0.01), 0.64)); const t = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 24, 0.025, 5, false), wood(0x5a432a)); return t; };
  inner.add(rail(1), rail(-1));
  for (const x of [1.2, 2.1, 3.0]) { const b = half(x, 0.4), th = new T.Mesh(new T.BoxGeometry(2 * b, 0.04, 0.26), wood(0x8a6a3f)); th.position.copy(P3(x, 0, 0.4)); inner.add(th); }
  // stern sheets and a stem post
  const post = new T.Mesh(new T.CylinderGeometry(0.03, 0.04, 0.5, 6), wood(0x4d3a22)); post.position.copy(P3(4.55, 0, 0.8)); post.rotation.x = -0.25; inner.add(post);
  // oars: shaft + blade, pivoting at the oarlock on each gunwale
  obj.oarMeshes = [];
  for (const side of [-1, 1]) {
    const pivot = new T.Group(), y = side * (half(2.1, 0.52) + 0.04); pivot.position.copy(P3(2.1, y, 0.56));
    const shaft = new T.Mesh(new T.CylinderGeometry(0.022, 0.028, 2.3, 6), wood(0xb08850)); shaft.rotation.z = Math.PI / 2; shaft.position.x = side * 0.5; pivot.add(shaft);
    const blade = new T.Mesh(new T.BoxGeometry(0.62, 0.012, 0.14), wood(0xb08850)); blade.position.x = side * 1.55; pivot.add(blade);
    const handle = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.12, 6), wood(0x4d3a22)); handle.rotation.z = Math.PI / 2; handle.position.x = -side * 0.55; pivot.add(handle);
    inner.add(pivot); obj.oarMeshes.push({ pivot, side });
  }
  let phase = 0, last = null;
  obj.updaters = obj.updaters ?? [];
  obj.updaters.push((hint = {}) => {
    const t = hint.time ?? performance.now() / 1000, dt = last === null ? 0 : Math.min(0.2, Math.max(0, t - last)); last = t;
    const e = vessel.oars.length ? vessel.oars.reduce((a, o) => a + o.effort, 0) / vessel.oars.length : 0;
    phase += dt * (1.2 + 1.6 * Math.abs(e)) * (e !== 0 ? 1 : 0);
    for (const { pivot, side } of obj.oarMeshes) {
      if (e === 0) { pivot.rotation.set(0, 0, 0.12 * side); continue; } // shipped: held out and level
      const s = Math.sin(phase) * (e > 0 ? 1 : -1), lift = Math.max(0, Math.cos(phase)) * 0.45; // forward-and-back sweep (yaw) with the blade lifted on the recovery
      pivot.rotation.set(0, side * s * 32 * DEG * Math.min(1, 0.5 + Math.abs(e)), -side * lift);
    }
  });
  obj.setDetail = () => {};
  return obj;
}
