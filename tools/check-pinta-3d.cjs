// Smoke check of the Pinta 3D objects in a headless browser (the sandbox page embeds three.js).
// Usage: node tools/check-pinta-3d.cjs   (needs playwright; build first with node tools/build-ship-sandbox.mjs)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(), p = await b.newPage(), errs = [];
  p.on('pageerror', (e) => errs.push(String(e.message)));
  await p.goto('file://' + require('path').resolve(__dirname, '../ship-sandbox.html')); await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    const out = {}, T = THREE;
    for (const id of ['pinta-1492', 'pinta-1492-lateen']) {
      __sandbox.spawn(id); const rec = __sandbox.fleet().list().slice(-1)[0], o = __sandbox.objs();
      // objects are created in the frame loop
      out[id] = { id: rec.id };
    }
    return out;
  });
  await p.waitForTimeout(800);
  const m = await p.evaluate(() => {
    const T = THREE, res = {};
    for (const rec of __sandbox.fleet().list()) {
      const o = __sandbox.objs().get(rec.id); const g = o.group; g.rotation.set(0, 0, 0); g.updateMatrixWorld(true);
      const hullBox = new T.Box3().setFromObject(o.hullMesh), all = new T.Box3().setFromObject(g);
      let bad = 0; g.traverse((n) => { const pos = n.geometry?.attributes?.position; if (pos) for (const v of pos.array) if (!Number.isFinite(v)) bad++; });
      let tris = 0, meshes = 0; g.traverse((n) => { if (n.isMesh || n.isLineSegments) { meshes++; const idx = n.geometry.index; tris += idx ? idx.count / 3 : n.geometry.attributes.position.count / (n.isLineSegments ? 2 : 3); } });
      const sz = hullBox.getSize(new T.Vector3()), tot = all.getSize(new T.Vector3());
      res[rec.designId] = { hullLength: +sz.z.toFixed(3), hullBeam: +sz.x.toFixed(3), hullHeight: +sz.y.toFixed(3), totalHeight: +tot.y.toFixed(2), nonFinite: bad, drawObjects: meshes, trianglesOrSegments: Math.round(tris) };
    }
    return res;
  });
  console.log(JSON.stringify(m, null, 1), JSON.stringify(errs));
  await b.close();
})();
