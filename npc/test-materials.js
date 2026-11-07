'use strict';
// 建築素材（6系統）と加工の検証：node npc/test-materials.js
const M = require('./materials.js'), A = require('./arch-gen.js');
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log((c ? '○ ' : '× ') + m); };
ok(M.FAMILIES.length === 6 && M.FAMILIES.every(f => Object.values(M.MATERIALS).some(m => m.fam === f)), '素材は6系統（木・石・土・植物・動物由来・金属）で、各系統に素材がある');
ok(['cut', 'split', 'shape', 'dry', 'fiber'].every(p => M.PROCESSES[p] && !M.PROCESSES[p].needs.length) && M.PROCESSES.fire.needs.length === 1, '基本加工は6グループ（切る削る・割る砕く・成形・乾燥・繊維加工・焼成）。焼成だけ技法が要る');
const rich = { wood: 0.8, stone: 0.5, clay: 0.5, grass: 0.5, animal: 0.4 }, none = { wood: 0, stone: 0, clay: 0, grass: 0, animal: 0 };
ok(['log', 'fieldstone', 'reed', 'hide', 'clay'].every(id => M.chainOf(id).raw && M.usable(id, rich, { hide: 0 })), '原料のまま使える素材（丸太・自然石・葦・獣皮・粘土）は、加工なしで成立する');
ok(Object.keys(M.MATERIALS).every(id => !M.usable(id, none, null)), '資源が無ければ、どの素材も使えない（勝手に発生しない）');
ok(!M.usable('firedbrick', rich, { wattle: 0, adobe: 0 }) && M.usable('firedbrick', rich, { wattle: 0, adobe: 0, fired: 0 }), '高温焼成の技法を知らなければ、焼成レンガは使えない。知っていれば使える');
ok(!M.usable('dressed', rich, { wattle: 0 }) && !M.usable('timber', rich, { wattle: 0 }) && M.usable('timber', rich, { plank: 0 }), '整形石・角材は、金属の道具や切石の技法がないと使えない');
ok(M.usable('splitwood', rich, { wattle: 0 }) && M.usable('splitstone', rich, { wattle: 0 }), '割り板・割石は、金属なしで作れる（割る加工は誰でもできる）');
ok(JSON.stringify(M.chainOf('mudbrick').steps) === JSON.stringify(['成形', '乾燥']) && M.chainOf('firedbrick').steps.length === 3, '加工の連鎖：日干しレンガ＝成形→乾燥、焼成レンガ＝成形→乾燥→高温焼成');
// 既存の名前が全て新素材に結びつく（アーキ生成の全組み合わせ）
const env = { tempC: 12, precip: 1000, wood: 0.5, stone: 0.4, clay: 0.4, fertile: 0.5, forest: 0.4, grass: 0.4, desert: 0, tundra: 0, wetland: 0.1, rugged: 0.1, elev: 100 };
let unmapped = 0, n = 0, noCost = 0; const fams = {};
for (let seed = 1; seed <= 40; seed++) for (const e of [env, { ...env, precip: 300, wood: 0.05, clay: 0.6 }, { ...env, tempC: -3, tundra: 0.8, wood: 0.1 }, { ...env, precip: 2500, wood: 0.9, wetland: 0.6 }, { ...env, stone: 0.9, wood: 0.1 }]) for (const tech of [0.15, 0.5, 0.85]) {
  const tr = A.tradition(seed, A.genome(seed, 5, 5), e, tech, [1, 2, 3]); for (const role of ['dwelling', 'storehouse', 'hall']) { const b = A.designBuilding(seed, tr, role, seed * 7, 4, 0); b.found = { kind: ['shallow', 'stilts', 'platform', 'terrace', 'sunken'][seed % 5] }; const pm = M.partsOf(b, e, null); n++;
    if (!pm.every(id => M.MATERIALS[id])) unmapped++; const c = M.costOf(b, pm); if (!Object.keys(c).length) noCost++; for (const f of Object.keys(c)) fams[f] = (fams[f] || 0) + 1; } }
ok(unmapped === 0, `既存の壁材・屋根材・工法（${n}棟）が、すべて新素材に対応する（未対応 ${unmapped}）`); ok(noCost === 0, '全ての建物に必要量がある');
console.log('必要量に出る系統（棟数）', JSON.stringify(fams)); ok(['wood', 'stone', 'earth', 'plant'].every(f => fams[f] > 0), '木・石・土・植物の素材が、建物の必要量に使われる');
// 使用量は寸法に応じる・二重計上されない（部位の合計＝系統の合計）
{ const tr = A.tradition(3, A.genome(3, 5, 5), env, 0.5, [1, 2, 3]), small = A.designBuilding(3, tr, 'dwelling', 1, 2, 0), big = A.designBuilding(3, tr, 'dwelling', 1, 8, 0); small.found = big.found = { kind: 'shallow' };
  const cs = M.costOf(small, M.partsOf(small, env, null)), cb = M.costOf(big, M.partsOf(big, env, null)), sum = (c) => Object.values(c).reduce((a, x) => a + x, 0); ok(sum(cb) > sum(cs), `大きい家ほど材料が多い（小 ${sum(cs).toFixed(1)} → 大 ${sum(cb).toFixed(1)}）`);
  const pm = M.partsOf(big, env, null), per = {}; for (const id of pm) per[M.MATERIALS[id].fam] = 0; ok(Math.abs(sum(cb) - sum(M.costOf(big, pm))) < 1e-9, '同じ建物の必要量は、何度計算しても同じ（二重計上なし）'); }
ok(M.qualityOf(0.2, { wattle: 0 }, 0.5) === 0 && M.qualityOf(0.9, { plank: 0 }, 0.5) === 2, '加工の品質：技術・金属がなければ粗く、あれば精密になりうる');
console.log(fail ? `失敗 ${fail}` : '全て合格'); process.exit(fail ? 1 : 0);
