/**
 * Display of the Bellona (1760) study model (assets/bellona GLB files) on a ship object made by buildShipObject.
 * Three levels of detail (near/mid/far) and the interior model are parsed on demand from base64 strings (the page provides them).
 * Display only. The model's own nodes are driven by the vessel: yards and sails (yard_*, sail_*) by the sail trim, rudder_pivot by the rudder.
 * Cutaway: below the weather decks the sea, rig and everything above the next deck up are hidden (a clipping plane), like the Pinta.
 */
import { BELLONA_MEASURED as M } from './bellona-data.mjs';

const DEG = Math.PI / 180;
const b64 = (s) => { const bin = atob(s), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a.buffer; };

export function addBellonaModel(T, obj, design, assets) {
  const holder = new T.Group(); holder.position.set(0, M.draftM, -M.sternZ); obj.inner.add(holder); // model Y (waterline = 0) -> inner z-above-keel; model Z -> -x
  obj.rollPeriodS = 9; obj.bellona = true;
  const scenes = [null, null, null], loading = [false, false, false], keys = design.sails.map((s) => s.glbKey);
  let interior = null, interiorLoading = false, want = 0, shown = -1;
  const loader = () => new T.GLTFLoader();
  const prep = (scene) => scene.traverse((o) => {
    if (o.name === 'collision_proxies') o.visible = false;
    if (o.isMesh) { o.frustumCulled = false; for (const m of [].concat(o.material)) { m.clippingPlanes = [obj.cutPlane]; m.clipShadows = false; } }
  });
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
    obj.cutaway = below; obj.cutY = cut;
    if (below) { obj.ensureInterior(); want = 0; ensure(0); }
    apply();
  };
  const dispose = obj.dispose; obj.dispose = () => { dispose(); for (const sc of [...scenes, interior]) sc?.traverse((o) => { o.geometry?.dispose?.(); for (const m of [].concat(o.material ?? [])) { m.map?.dispose?.(); m.dispose?.(); } }); };
  return obj;
}
