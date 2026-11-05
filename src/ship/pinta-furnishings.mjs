/**
 * Stowage and deck gear of the Pinta 1492 (all level D, see PINTA_1492_PARAMS.furnishings): casks and food sacks in the hold
 * follow the ship's real mass items (their count is mass / unit mass, so loading or unloading changes what is seen), plus rope, a spare
 * sail and repair boards in the fore locker, rope coils at the mast feet and one anchor on deck.
 * planFurnishings() is pure (testable); addFurnishings() builds the Three.js objects. Hull frame: x stern -> bow, y starboard +, z up.
 */
import { PINTA_1492_PARAMS as G } from './pinta-1492-params.mjs';

const sumKg = (items, re) => items.filter((m) => re.test(m.id)).reduce((a, m) => a + m.massKg, 0);

export function planFurnishings({ design, interior, massItems = design.massItems }) {
  const F = G.furnishings, caskKg = G.mass.waterBarrelKg.value, aisle = F.aisleHalfWidth.value.valueOf ? F.aisleHalfWidth.value : 0.8;
  const casks = Math.round(sumKg(massItems, /water[-_]barrel/) / caskKg), sacks = Math.round(sumKg(massItems, /provision/) / F.foodSackKg.value);
  const holdZ = interior.deckZ('hold'), room = (id) => interior.rooms.find((r) => r.id === id);
  const out = { casks: [], sacks: [], coils: [], sailRolls: [], planks: [], anchors: [], wanted: { casks, sacks }, evidence: 'D' };
  const sideSlots = (r, tiers) => { // slots along both walls of a store, outside the aisle, inside the hull
    const slots = [];
    for (let tier = 0; tier < tiers; tier++) for (let x = r.x0 + 0.55; x <= r.x1 - 0.4; x += 0.62) for (const side of [-1, 1]) {
      let y = null; for (const yo of [1.7, 1.5, 1.3, 1.1, 0.95]) if (yo >= aisle && interior.walkable('hold', x, side * yo)) { y = side * yo; break; }
      if (y !== null) slots.push({ x, y, z: holdZ + tier * 0.9, tier });
    }
    return slots;
  };
  const caskSlots = [...sideSlots(room('hold-aft'), 2), ...sideSlots(room('hold'), 2).filter((s) => s.x < room('hold').x0 + 3.5)];
  out.casks = caskSlots.slice(0, casks);
  const sackSlots = []; const aft = room('hold-aft');
  for (let tier = 0; tier < 4; tier++) for (let x = aft.x0 + 0.45; x <= aft.x0 + 2.0; x += 0.5) for (let y = -1.2; y <= 1.21; y += 0.5) if (interior.walkable('hold', x, y) && Math.abs(y) < aisle + 0.5) sackSlots.push({ x, y, z: holdZ + 0.13 + tier * 0.22, tier });
  out.sacks = sackSlots.slice(0, sacks);
  const fore = room('hold-fore'), L = F.forelocker.value;
  const sideY = (x, side, prefs = [0.9, 0.75, 0.6, 0.45]) => { for (const yo of prefs) if (interior.walkable('hold', x, side * yo)) return side * yo; return null; }; // the fore locker narrows toward the bow
  for (let i = 0; i < L.ropeCoils; i++) { const x = fore.x0 + 0.6 + (i >> 1) * 0.75, y = sideY(x, i % 2 ? 1 : -1); if (y !== null) out.coils.push({ x, y, z: holdZ + 0.1, deck: 'hold' }); }
  for (let i = 0; i < L.spareSailRolls; i++) { const x = fore.x0 + 1.3, y = sideY(x, -1, [0.9, 0.7, 0.5]); if (y !== null) out.sailRolls.push({ x, y, z: holdZ + 0.3, length: 1.2, deck: 'hold' }); }
  for (let i = 0; i < L.repairPlanks; i++) { const x = fore.x0 + 1.3, y = sideY(x, 1, [0.9, 0.7, 0.5]); if (y !== null) out.planks.push({ x, y, z: holdZ + 0.03 + i * 0.05, length: 1.4, deck: 'hold' }); }
  const mainRoom = interior.rooms.find((r) => r.id === 'main'), qRoom = interior.rooms.find((r) => r.id === 'quarter');
  for (const s of design.sails) { // a coil at the foot of each mast, on the deck level that has floor there
    const x = s.x + 0.7, onQ = x < qRoom.x1; out.coils.push({ x, y: -0.9, z: interior.deckZ(onQ ? 'quarter' : 'main') + 0.1, deck: onQ ? 'quarter' : 'main' });
  }
  for (let i = 0; i < F.deck.value.anchors; i++) out.anchors.push({ x: mainRoom.x1 - 0.4, y: 1.25, z: interior.deckZ('main'), deck: 'main' });
  return out;
}

const hullToInner = (x, y, z) => [y, z, -x]; // inner-group coordinates of a hull-frame point (see pinta-render)

/** Build (or rebuild) the 3D items. Hold items live in the hold deck group (cutaway view); deck items in the structure group. */
export function addFurnishings(T, obj, plan) {
  obj.furnishings?.parent?.remove(obj.furnishings); obj.furnishings?.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  const hold = new T.Group(), deck = new T.Group(), { cgX, draft } = obj.frame, m4 = new T.Matrix4(), q = new T.Quaternion();
  const toGroup = (p) => [p.y, p.z - draft, cgX - p.x]; // same mapping as placePlayer: the deck groups sit directly under obj.group
  const inst = (geo, mat, list, scale = [1, 1, 1], lift = 0) => {
    const im = new T.InstancedMesh(geo, mat, Math.max(1, list.length)); im.count = list.length;
    list.forEach((p, i) => { const [x, y, z] = toGroup(p); m4.compose(new T.Vector3(x, y + lift, z), q, new T.Vector3(...scale)); im.setMatrixAt(i, m4); });
    im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; return im;
  };
  const wood = new T.MeshStandardMaterial({ color: 0x7a5a32, roughness: 0.95 }), dark = new T.MeshStandardMaterial({ color: 0x3f2d18, roughness: 1 }), cloth = new T.MeshStandardMaterial({ color: 0xcdbd96, roughness: 1 }), rope = new T.MeshStandardMaterial({ color: 0x9c8455, roughness: 1 });
  hold.add(inst(new T.CylinderGeometry(0.27, 0.27, 0.86, 10), wood, plan.casks, [1, 1, 1], 0.43));
  hold.add(inst(new T.CylinderGeometry(0.285, 0.285, 0.07, 10), dark, plan.casks, [1, 1, 1], 0.22)); // lower hoop
  hold.add(inst(new T.CylinderGeometry(0.285, 0.285, 0.07, 10), dark, plan.casks, [1, 1, 1], 0.66)); // upper hoop
  hold.add(inst(new T.SphereGeometry(0.26, 8, 6), cloth, plan.sacks, [1, 0.5, 0.75], 0.12));
  for (const c of plan.coils.filter((c) => c.deck === 'hold')) { const t = new T.Mesh(new T.TorusGeometry(0.28, 0.09, 6, 12), rope); t.rotation.x = Math.PI / 2; t.position.set(...toGroup(c)); hold.add(t); }
  for (const s of plan.sailRolls) { const r = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, s.length, 10), cloth); r.rotation.x = Math.PI / 2; r.position.set(...toGroup(s)); hold.add(r); }
  for (const p of plan.planks) { const b = new T.Mesh(new T.BoxGeometry(0.22, 0.045, p.length), wood); b.position.set(...toGroup(p)); hold.add(b); }
  for (const c of plan.coils.filter((c) => c.deck !== 'hold')) { const t = new T.Mesh(new T.TorusGeometry(0.3, 0.09, 6, 12), rope); t.rotation.x = Math.PI / 2; t.position.set(...toGroup(c)); deck.add(t); }
  for (const a of plan.anchors) { // one simple anchor lying on the deck: shank, stock and two arms
    const g = new T.Group(), iron = new T.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 0.8, metalness: 0.4 });
    const shank = new T.Mesh(new T.BoxGeometry(0.1, 0.1, 1.5), iron), stock = new T.Mesh(new T.BoxGeometry(0.8, 0.07, 0.07), iron); stock.position.set(0, 0.04, -0.6);
    const armL = new T.Mesh(new T.BoxGeometry(0.55, 0.07, 0.09), iron), armR = armL.clone(); armL.position.set(-0.25, 0, 0.7); armR.position.set(0.25, 0, 0.7); armL.rotation.y = -0.5; armR.rotation.y = 0.5;
    g.add(shank, stock, armL, armR); g.position.set(...toGroup({ ...a, z: a.z + 0.12 })); g.rotation.y = 0.25; deck.add(g);
  }
  // deck items go with the structure (hidden in the cutaway); hold items go with the hold deck group
  const holdGroup = obj.interiorGroups?.get('hold'), mainGroup = obj.interiorGroups?.get('main');
  const holder = new T.Group(); holder.add(hold); obj.group.add(holder); // visibility follows the hold deck group (see updateFurnishingsVisibility)
  deck.userData.deck = true; holder.add(deck);
  obj.furnishings = holder; obj.furnishingsHold = hold; obj.furnishingsDeck = deck;
  hold.visible = !!holdGroup?.visible; deck.visible = !obj.cutaway;
  return plan;
}
/** Call after setViewDeck: hold stowage only shows in the hold; deck gear only outside the cutaway. */
export function updateFurnishingsVisibility(obj) {
  if (!obj.furnishings) return; obj.furnishingsHold.visible = !!obj.interiorGroups.get('hold')?.visible; obj.furnishingsDeck.visible = !obj.cutaway;
}
