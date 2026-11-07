'use strict';
// 建築素材：6系統（木・石・土・植物・動物由来・金属）と、6つの基本加工（切る削る／割る砕く／成形／乾燥／繊維加工／焼成）。
// - 素材は、資源が手に入り、加工方法（建築技法の知識）を知っていれば使える。原料のまま使える素材（丸太・自然石・草など）もある。
// - 部位（基礎・骨組み・壁・屋根・床・開口部）ごとに、素材と加工の品質（粗い／標準／精密）を持つ。耐久は素材×品質×環境×手入れ（settle-layout.js）。
// - 数値は相対値（0〜1）で、仮。実機・バランス検証後に調整する。既存の壁材・屋根材の名前（timber/stone/adobe/mud/turf/reed/brick/hide、thatch/shingle/slab…）は、対応表で新素材に結びつける。
(function (root) {
const FAMILIES = ['wood', 'stone', 'earth', 'plant', 'animal', 'metal'];
const FAMILY_JP = { wood: '木材', stone: '石材', earth: '土・鉱物質', plant: '植物性', animal: '動物由来', metal: '金属' };
const PARTS = ['found', 'frame', 'wall', 'roof', 'floor', 'open'];   // 基礎・骨組み・壁・屋根・床・開口部
const PART_JP = { found: '基礎', frame: '骨組み', wall: '壁', roof: '屋根', floor: '床', open: '開口部' };
// 加工：その加工に必要な建築技法（Arch.TECHS の id）。needs が空なら、道具に頼らず誰でもできる。any：どれか1つで足りる
const PROCESSES = {
  cut: { jp: '切る・削る', needs: [] }, split: { jp: '割る・砕く', needs: [] }, shape: { jp: '成形', needs: [] }, dry: { jp: '乾燥', needs: [] }, fiber: { jp: '繊維加工', needs: [] },
  fire: { jp: '焼成', needs: ['adobe'] },            // 低温の焼成（土器の技術）
  firehi: { jp: '高温焼成', needs: ['fired'] },      // 窯（高温焼成）
  metalwork: { jp: '金属加工', needs: ['plank'] },    // 銅・青銅・鉄のどれか
};
// 素材：fam 系統、res 必要な資源（env のキー。0〜1）、proc 加工（空＝原料のまま）、needs 必要な建築技法、
// rot 腐朽しやすさ・wet 雨と湿りでの傷み・wear 摩耗・fire 燃えやすさ・yr 年あたりの劣化（手入れなし・標準品質・標準環境）
const MATERIALS = {
  log:        { jp: '丸太',       fam: 'wood',   res: 'wood',  proc: [],               needs: [],            rot: 0.5, wet: 0.35, wear: 0.3, fire: 0.6, yr: 0.014 },
  pole:       { jp: '棒材・細い幹', fam: 'wood',   res: 'wood',  proc: [],               needs: [],            rot: 0.6, wet: 0.4,  wear: 0.3, fire: 0.7, yr: 0.035 },
  bark:       { jp: '樹皮',       fam: 'wood',   res: 'wood',  proc: [],               needs: [],            rot: 0.5, wet: 0.5,  wear: 0.2, fire: 0.7, yr: 0.04 },
  splitwood:  { jp: '割り板',     fam: 'wood',   res: 'wood',  proc: ['split'],        needs: [],            rot: 0.5, wet: 0.45, wear: 0.3, fire: 0.6, yr: 0.03 },
  timber:     { jp: '角材・板材', fam: 'wood',   res: 'wood',  proc: ['cut'],          needs: ['plank'],     rot: 0.45, wet: 0.4, wear: 0.3, fire: 0.6, yr: 0.02 },
  fieldstone: { jp: '自然石',     fam: 'stone',  res: 'stone', proc: [],               needs: [],            rot: 0,   wet: 0.05, wear: 0.1, fire: 0,   yr: 0.003 },
  splitstone: { jp: '割石',       fam: 'stone',  res: 'stone', proc: ['split'],        needs: [],            rot: 0,   wet: 0.05, wear: 0.1, fire: 0,   yr: 0.003 },
  dressed:    { jp: '整形石',     fam: 'stone',  res: 'stone', proc: ['cut'],          needs: ['masonry'],   rot: 0,   wet: 0.04, wear: 0.08, fire: 0,  yr: 0.002 },
  slate:      { jp: '石板',       fam: 'stone',  res: 'stone', proc: ['split'],        needs: ['masonry'],   rot: 0,   wet: 0.05, wear: 0.1, fire: 0,   yr: 0.004 },
  clay:       { jp: '粘土',       fam: 'earth',  res: 'clay',  proc: [],               needs: [],            rot: 0,   wet: 0.8,  wear: 0.3, fire: 0,   yr: 0.04 },
  sod:        { jp: '芝土',       fam: 'earth',  res: 'grass', proc: [],               needs: ['turf'],      rot: 0.3, wet: 0.5,  wear: 0.2, fire: 0.05, yr: 0.035 },
  rammed:     { jp: '練り土',     fam: 'earth',  res: 'clay',  proc: ['shape'],        needs: ['mudwall'],   rot: 0,   wet: 0.75, wear: 0.3, fire: 0,   yr: 0.03 },
  mudbrick:   { jp: '日干しレンガ', fam: 'earth', res: 'clay',  proc: ['shape', 'dry'], needs: ['adobe'],     rot: 0,   wet: 0.6,  wear: 0.25, fire: 0,  yr: 0.025 },
  firedbrick: { jp: '焼成レンガ', fam: 'earth',  res: 'clay',  proc: ['shape', 'dry', 'firehi'], needs: ['fired'], rot: 0, wet: 0.15, wear: 0.15, fire: 0, yr: 0.008 },
  plaster:    { jp: '漆喰・塗り材', fam: 'earth', res: 'clay',  proc: ['shape', 'firehi'], needs: ['masonry'], rot: 0,  wet: 0.3,  wear: 0.3, fire: 0,   yr: 0.02 },
  thatch:     { jp: '茅束',       fam: 'plant',  res: 'grass', proc: ['fiber'],        needs: ['thatch'],    rot: 0.7, wet: 0.5,  wear: 0.3, fire: 0.9, yr: 0.05 },
  reed:       { jp: '葦・草',     fam: 'plant',  res: 'grass', proc: [],               needs: [],            rot: 0.7, wet: 0.5,  wear: 0.3, fire: 0.9, yr: 0.06 },
  wattle:     { jp: '編み材',     fam: 'plant',  res: 'wood',  proc: ['fiber'],        needs: ['wattle'],    rot: 0.6, wet: 0.45, wear: 0.3, fire: 0.7, yr: 0.045 },
  hide:       { jp: '獣皮',       fam: 'animal', res: 'animal', proc: [],              needs: ['hide'],      rot: 0.4, wet: 0.3,  wear: 0.5, fire: 0.3, yr: 0.12 },
  felt:       { jp: 'フェルト',   fam: 'animal', res: 'animal', proc: ['fiber', 'dry'], needs: ['hide'],     rot: 0.4, wet: 0.35, wear: 0.4, fire: 0.5, yr: 0.09 },
  fitting:    { jp: '金具',       fam: 'metal',  res: 'stone', proc: ['metalwork'],    needs: ['plank'],     rot: 0,   wet: 0.2,  wear: 0.15, fire: 0,  yr: 0.01 },
};
// 既存の名前（arch-gen.js）→ 新素材の対応表。部位ごとに（壁・屋根は既存の名前と工法から）
const WALL_MAP = { timber: { wattle: 'wattle', log: 'log', plank: 'splitwood' }, stone: { drystone: 'fieldstone', masonry: 'dressed' }, adobe: 'mudbrick', brick: 'firedbrick', mud: 'rammed', turf: 'sod', reed: 'reed', hide: 'hide' };
const ROOF_MAP = { thatch: 'thatch', shingle: 'splitwood', turf: 'sod', mud: 'rammed', slab: 'slate' };
// 暮らし（狩猟・牧畜）から、動物由来の素材の手に入りやすさを環境に足す
function withAnimal(env, economy) { return Object.assign({}, env, { animal: Math.min(1, ((economy && (economy.hunt || 0)) || 0) * 1.2 + ((economy && (economy.herd || 0)) || 0) * 1.5 + (env.grass || 0) * 0.1) }); }
const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
// 素材の名前から素材ID（壁）
function wallMaterial(wall) { const m = WALL_MAP[wall.mat]; if (!m) return 'rammed'; return typeof m === 'string' ? m : (m[wall.method] || Object.values(m)[0]); }
// 素材が今使えるか：資源が手に入り（res が 0.12 以上）、必要な建築技法を知っている（know が null なら全て知っている）
function usable(id, env, know) { const m = MATERIALS[id]; if (!m) return false; if ((env[m.res] || 0) < 0.12) return false; if (m.needs.some(t => know && know[t] === undefined)) return false; if (m.proc.some(p => PROCESSES[p].needs.some(t => know && know[t] === undefined))) return false; return true; }
// 素材を原料から作る工程の一覧（UI用）：原料→加工→素材
function chainOf(id) { const m = MATERIALS[id]; return m ? { material: id, family: m.fam, raw: m.proc.length === 0, steps: m.proc.map(p => PROCESSES[p].jp) } : null; }
// 品質（0粗い・1標準・2精密）：技術と金属の道具（金属加工が使えるか）から。同じ建物内では1つ
function qualityOf(tech, know, u) { const metal = !know || know.plank !== undefined; const s = tech * 0.7 + (metal ? 0.2 : 0) + (u - 0.5) * 0.3; return s > 0.62 ? 2 : s > 0.3 ? 1 : 0; }
// 設計（arch-gen の建物）から、部位ごとの素材を決める。pm：[基礎, 骨組み, 壁, 屋根, 床, 開口部] の素材ID
function partsOf(b, env, know) {
  const wallM = wallMaterial(b.wall), roofM = b.roof.kind === 'flat' && b.roof.mat === 'mud' ? 'rammed' : (ROOF_MAP[b.roof.mat] || 'thatch'), fk = b.found && b.found.kind, woody = (env.wood || 0) > 0.2;
  const tent = b.shelter === 'tent' || b.wall.mat === 'hide';
  let frame = tent ? (woody ? 'pole' : 'reed') : (wallM === 'log' ? 'log' : woody ? (b.wall.method === 'plank' && know && know.plank !== undefined ? 'timber' : 'log') : 'reed');
  if (wallM === 'wattle' || wallM === 'reed') frame = woody ? 'pole' : 'reed';
  const found = fk === 'stilts' ? (woody ? 'log' : 'fieldstone') : fk === 'terrace' || fk === 'platform' ? ((env.stone || 0) > 0.15 ? 'fieldstone' : 'rammed') : fk === 'sunken' ? 'rammed' : ((env.stone || 0) > 0.2 && b.wall.mat === 'stone' ? 'fieldstone' : 'rammed');
  const floor = fk === 'stilts' ? (know && know.plank !== undefined ? 'timber' : 'splitwood') : fk === 'sunken' || tent ? (tent ? 'hide' : 'rammed') : 'rammed';
  const open = tent ? 'hide' : (b.wall.method === 'plank' ? 'splitwood' : wallM === 'hide' ? 'hide' : (know && know.plank !== undefined && (env.stone || 0) > 0.1 && b.role === 'hall' ? 'fitting' : 'wattle'));
  return [found, frame, wallM, roofM, floor, open];
}
// 部位ごとの必要量（系統ごとの単位）：壁は外周×壁高、屋根は面積×勾配、骨組みは外周、基礎は外周、床は面積
function costOf(b, pm) {
  const w = b.plan.w, d = b.plan.kind === 'rect' ? b.plan.d : b.plan.w, per = 2 * (w + d), area = b.plan.kind === 'round' ? Math.PI * w * w / 4 : w * d, cost = {}, add = (id, u) => { const f = MATERIALS[id].fam; cost[f] = (cost[f] || 0) + u; };
  const slope = 1 + Math.min(1.2, (b.roof.h || 0.3) / Math.max(1, Math.min(w, d)) * 1.5);
  add(pm[0], per * 0.25); add(pm[1], per * 0.45 + area * 0.1); add(pm[2], per * (b.wallH || 1.7) * 0.3); add(pm[3], area * slope * 0.35); add(pm[4], area * 0.12); add(pm[5], 0.8);
  for (const k of Object.keys(cost)) cost[k] = Math.round(cost[k] * 10) / 10; return cost;
}
const api = { FAMILIES, FAMILY_JP, PARTS, PART_JP, PROCESSES, MATERIALS, WALL_MAP, ROOF_MAP, wallMaterial, withAnimal, usable, chainOf, qualityOf, partsOf, costOf };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WohMat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
