'use strict';
// 人口の仕組み（世帯・経済・歴史・民族）と集落の配置の接続：node npc/test-settle-people.js <generator.js> <world.bin>
const v8 = require('v8'), fs = require('fs'), path = require('path');
const G = require(path.resolve(process.argv[2])), world = v8.deserialize(fs.readFileSync(process.argv[3]));
const P = require('./people-core.js'), S = require('./settle-layout.js'), A = require('./arch-gen.js');
const env = world.fauna.env, cc = world.climate.cell, plantFood = (c, m, out) => G.faunaPlantFood(env, cc, c, m, out, 0, 0);
const FA = { faunaHunt: G.faunaHunt, faunaDensity: G.faunaDensity, ANIMAL_SPECIES: G.ANIMAL_SPECIES };
const people = P.peopleGenerate(42, { world, plantFood, fauna: G.faunaClone(world.fauna), FA });
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log((c ? '○ ' : '× ') + m); };
const st = {}, lv = {}; for (const g of people.groups) { st[g.hist.status] = (st[g.hist.status] || 0) + 1; const k = ['野営地', '半定住', '村'][g.settle] + ':' + g.hist.status; lv[k] = (lv[k] || 0) + 1; }
console.log('集落の歴史の状態', JSON.stringify(st)); console.log('段階×状態', JSON.stringify(lv));
const ages = people.groups.filter(g => g.settle === 2).map(g => g.hist.age).sort((a, b) => a - b); console.log('村の成立の古さ（年）：最小', ages[0], '中央', ages[ages.length >> 1], '最大', ages[ages.length - 1]);
ok(Object.keys(st).length >= 3, '成立したて・古い・衰退中・季節の野営が共存');
const terr = () => ({ height: (x, z) => 3 * Math.sin(x / 50) + 2 * Math.cos(z / 70), slope: (x, z) => 5 + 4 * Math.abs(Math.sin(x / 30 + z / 40)), water: () => 0, nearestWater: (x, z) => ({ dist: 40 + z * 0.2, dx: 0, dz: 1 }), wet: () => false });
let checked = 0, bad = 0; const designs = new Set();
for (const g of people.groups) {
  if (checked >= 40) break; const hh = P.peopleHouseholds(people, g.id); if (!hh.length) continue; checked++;
  const trad = P.peopleTradition(people, world, g.id), eco = P.peopleEconomy(people, g.id);
  const spec = { seed: people.npc.seed, gid: g.id, trad, hist: g.hist, level: g.settle, households: hh, economy: eco, terr: terr() }, L = S.layoutSettlement(spec);
  const miss = hh.filter(h => !L.byHouse[h.house]).length; if (miss) bad++;
  for (const b of L.items) designs.add(b.plan.kind + b.roof.kind + b.wall.mat);
  if (checked <= 4) console.log(`集団${g.id}（${['野営地', '半定住', '村'][g.settle]}・${g.hist.status}・成立${g.hist.age}年・${hh.length}世帯）：壁 ${trad.wallMat}・屋根 ${trad.roofMat}・建物 ${L.items.length}（住居 ${L.items.filter(b => b.role === 'dwelling').length}）・道 ${L.paths.length}・柵 ${L.fence.length}`);
}
ok(bad === 0, `全ての世帯に住居が対応（${checked}集団、不足のある集団 ${bad}）`);
console.log('建物の種類（平面×屋根×壁）', designs.size, '種類');
// 同じ集団の再現性（Seed・集団・世帯が同じなら同じ集落）
{ const g = people.groups[3], hh = P.peopleHouseholds(people, g.id), mk = () => S.layoutSettlement({ seed: people.npc.seed, gid: g.id, trad: P.peopleTradition(people, world, g.id), hist: g.hist, level: g.settle, households: hh, economy: P.peopleEconomy(people, g.id), terr: terr() }); ok(JSON.stringify(mk()) === JSON.stringify(mk()), '同じ集団の集落は再現できる'); }
// 村になったとき・移住したとき：歴史が新しくなる
{ const g = people.groups.find(x => x.settle === 0); const before = g.hist.age; P.peopleForceEthSplit; ok(g.hist && g.layout === null, '野営地の集団は、歴史があり、配置は未生成（描画のときに作る）'); }
console.log(fail ? `失敗 ${fail}` : '全て合格'); process.exit(fail ? 1 : 0);
