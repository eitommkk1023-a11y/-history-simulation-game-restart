/**
 * Display of the Bellona (1760) study model (assets/bellona GLB files) on a ship object made by buildShipObject.
 * Three levels of detail (near/mid/far) and the interior model are parsed on demand from base64 strings (the page provides them).
 * Display only. The model's own nodes are driven by the vessel: yards and sails (yard_*, sail_*) by the sail trim, rudder_pivot by the rudder.
 * Cutaway: below the weather decks the sea, rig and everything above the next deck up are hidden (a clipping plane), like the Pinta.
 */
import { BELLONA_MEASURED as M, BELLONA_LAYOUT } from './bellona-data.mjs';

const DEG = Math.PI / 180;
const b64 = (s) => { const bin = atob(s), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a.buffer; };

export function addBellonaModel(T, obj, design, assets) {
  const holder = new T.Group(); holder.position.set(0, M.draftM, -M.sternZ); obj.inner.add(holder); // model Y (waterline = 0) -> inner z-above-keel; model Z -> -x
  obj.rollPeriodS = 9; obj.bellona = true;
  // Water mask: the game's sea is a flat plane that would show through hatches and fill the hold. Stamp the hull's waterline outline into the stencil
  // buffer before the sea is drawn (the glue makes the sea skip stamped pixels), so inside the hull you see the decks, not water.
  { const shape = new T.Shape(); BELLONA_LAYOUT.waterExclusion.forEach((p, i) => (i ? shape.lineTo(p[0], p[1]) : shape.moveTo(p[0], p[1]))); shape.closePath();
    const g = new T.ShapeGeometry(shape); g.rotateX(Math.PI / 2);
    const mat = new T.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, side: 2, stencilWrite: true, stencilRef: 1, stencilFunc: 519, stencilZPass: 7681, stencilFail: 7681, stencilZFail: 7681 });
    const mask = new T.Mesh(g, mat); mask.renderOrder = -200; mask.frustumCulled = false; mask.position.y = -0.02; holder.add(mask); obj.waterMask = mask; }
  const scenes = [null, null, null], loading = [false, false, false], keys = design.sails.map((s) => s.glbKey);
  let interior = null, interiorLoading = false, want = 0, shown = -1;
  const loader = () => new T.GLTFLoader();
  const prep = (scene) => scene.traverse((o) => {
    if (o.name === 'collision_proxies') o.visible = false;
    if (o.isMesh) { o.frustumCulled = false; for (const m of [].concat(o.material)) { m.side = 2; m.userData.bellonaClip = true; m.clippingPlanes = clipOn ? [obj.cutPlane] : null; } }
  });
  // Shader clipping is switched on only while a cutaway is shown: outside it the materials render exactly as in the study's viewer.
  let clipOn = false;
  const setClip = (on) => { if (on === clipOn) return; clipOn = on; for (const sc of [...scenes, interior]) sc?.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) { m.clippingPlanes = on ? [obj.cutPlane] : null; m.needsUpdate = true; } }); };
  const parse = (key, done) => { try { loader().parse(b64(assets[key]), '', (g) => done(g.scene), (e) => console.warn('bellona model', key, e)); } catch (e) { console.warn('bellona model', key, e); } };
  function ensure(l) { if (scenes[l] || loading[l] || !assets) return; loading[l] = true; parse(['lod0', 'lod1', 'lod2'][l], (scene) => { prep(scene); scene.visible = false; holder.add(scene); scenes[l] = scene; loading[l] = false; apply(); }); }
  function apply() {
    let l = want; while (l < 3 && !scenes[l]) l++; if (l >= 3) { l = want; while (l >= 0 && !scenes[l]) l--; }
    if (l >= 0 && scenes[l]) { for (let i = 0; i < 3; i++) if (scenes[i]) scenes[i].visible = i === l; shown = l; obj.hullMesh.visible = false; }
    rigVisible(!obj.cutaway); if (interior) interior.visible = !!obj.cutaway;
  }
  function rigVisible(on) { for (const sc of scenes) if (sc) for (const n of ['rig', 'rigging', 'sails']) { const o = sc.getObjectByName(n); if (o) o.visible = on; } }
  obj.ensureInterior = () => { if (interior || interiorLoading || !assets) return; interiorLoading = true; parse('interior', (scene) => { prep(scene); scene.visible = !!obj.cutaway; holder.add(scene); interior = scene; interiorLoading = false; }); };
  obj.setDetail = (level) => { want = obj.cutaway ? 0 : Math.min(2, Math.max(0, level)); ensure(want); if (want < 2) ensure(2); apply(); };
  ensure(2); ensure(1); // far/mid first: quick to parse, so something shows early
  // Sail and rudder animation (the sail list of the object only carries the vessel's sails, so updateShipObject stays generic).
  const node = new Map(); const get = (sc, name) => { const k = sc.id + name; if (!node.has(k)) node.set(k, sc.getObjectByName(name) ?? null); return node.get(k); };
  obj.sails.length = 0; for (const s of obj.vessel.sails) obj.sails.push({ sail: s, pivot: new T.Group() });
  obj.updaters = obj.updaters ?? [];
  obj.updaters.push(() => {
    const sc = scenes[shown]; if (!sc) return;
    obj.vessel.sails.forEach((s, i) => { const key = keys[i]; for (let k = 0; k < 3; k++) for (const nm of [`yard_${key}_${k}`, `sail_${key}_${k}`]) { const o = get(sc, nm); if (o) o.rotation.y = s.trimDeg * DEG; } });
    const r = get(sc, 'rudder_pivot'); if (r) r.rotation.y = obj.vessel.state.rudderDeg * DEG;
  });
  /** Cutaway for a position {x, y, h, deck}: closed compartment -> clip just under the deck above, hide sea/rig. */
  obj.setView = (pos) => {
    const it = obj.interior, here = it.deckAbove(pos), below = Number.isFinite(here);
    let cut = null;
    if (below) { // the decks are cambered and have sheer, so look for the lowest deck underside around the player and cut under it
      let low = here; for (const dx of [-12, -6, 6, 12]) for (const dy of [-3, 0, 3]) low = Math.min(low, it.deckAbove({ x: pos.x + dx, y: pos.y + dy, h: pos.h }));
      cut = Math.max(low - 0.28, pos.h + 1.9);
    }
    obj.cutaway = below; obj.cutY = cut; setClip(below); if (obj.waterMask) obj.waterMask.visible = !below;
    if (below) { obj.ensureInterior(); want = 0; ensure(0); }
    apply();
  };
  obj.diag = () => `LOD${shown}(読込 ${scenes.map((q, i) => (q ? 'L' + i : '-')).join('')}${interior ? '+内装' : ''}) 断面${obj.cutaway ? 'あり' : 'なし'} 切断面${obj.cutY === null ? '—' : obj.cutY.toFixed(1)}m 船体(簡易)${obj.hullMesh.visible ? '表示' : '非表示'}`;
  const dispose = obj.dispose; obj.dispose = () => { dispose(); for (const sc of [...scenes, interior]) sc?.traverse((o) => { o.geometry?.dispose?.(); for (const m of [].concat(o.material ?? [])) { m.map?.dispose?.(); m.dispose?.(); } }); };
  return obj;
}
