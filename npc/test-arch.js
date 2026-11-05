'use strict';
// 建築の生成の検証：node npc/test-arch.js <generator.js> <world.bin>
const v8 = require('v8'), fs = require('fs'), path = require('path');
const G = require(path.resolve(process.argv[2])), world = v8.deserialize(fs.readFileSync(process.argv[3]));
const A = require('./arch-gen.js'), P = require('./people-core.js');
const env = world.fauna.env, cc = world.climate.cell, plantFood = (c, m, out) => G.faunaPlantFood(env, cc, c, m, out, 0, 0);
const FA = { faunaHunt: G.faunaHunt, faunaDensity: G.faunaDensity, ANIMAL_SPECIES: G.ANIMAL_SPECIES };
const people = P.peopleGenerate(+(process.argv[4] || 42), { world, plantFood, fauna: G.faunaClone(world.fauna), FA });
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log((c ? '○ ' : '× ') + m); };
const rows = [];
for (const g of people.groups) {
  const e = A.envAt(world, g.homeX, g.homeY), eth = people.ethnicities[g.ethId - 1], tech = 0.2 + 0.6 * ((g.id * 2654435761 >>> 0) % 1000) / 1000;
  const gen = A.genome(+(process.argv[4] || 42), eth.id, eth.id), tr = A.tradition(+(process.argv[4] || 42), gen, e, tech, eth.color), d = A.designBuilding(+(process.argv[4] || 42), tr, 'dwelling', g.id * 131 + 7, 4, 50);
  rows.push({ g, e, tr, d, tech });
}
const count = (f) => { const o = {}; for (const r of rows) { const k = f(r); o[k] = (o[k] || 0) + 1; } return JSON.stringify(o); };
console.log('平面形', count(r => r.d.plan.kind)); console.log('屋根の形', count(r => r.d.roof.kind)); console.log('壁の材料', count(r => r.tr.wallMat)); console.log('屋根の材料', count(r => r.tr.roofMat));
console.log('高床の傾向が高い(>0.5)', rows.filter(r => r.tr.stilts > 0.5).length, '／床を下げる傾向が高い(>0.5)', rows.filter(r => r.tr.sunken > 0.5).length);
// 地域との関係
const by = (cond) => rows.filter(cond); const frac = (a, f) => a.length ? (100 * a.filter(f).length / a.length).toFixed(0) + '%' : '-';
const dry = by(r => r.e.precip < 500), wet = by(r => r.e.precip > 1800), cold = by(r => r.e.tempC < 3), forest = by(r => r.e.wood > 0.6);
console.log(`乾燥地(${dry.length})：土・日干しレンガの壁 ${frac(dry, r => r.tr.wallMat === 'adobe' || r.tr.wallMat === 'mud')}、平屋根 ${frac(dry, r => r.d.roof.kind === 'flat')}`);
console.log(`多雨地(${wet.length})：急な屋根(>35°) ${frac(wet, r => r.d.roof.pitch > 35)}、高床の傾向 ${frac(wet, r => r.tr.stilts > 0.3)}`);
console.log(`寒冷地(${cold.length})：芝土・土の壁 ${frac(cold, r => r.tr.wallMat === 'turf' || r.tr.wallMat === 'mud')}、床を下げる傾向 ${frac(cold, r => r.tr.sunken > 0.3)}`);
console.log(`木材が豊富(${forest.length})：木の壁 ${frac(forest, r => r.tr.wallMat === 'timber')}`);
// 民族（系統）の伝統：同じ民族の違う場所、違う民族の同じ環境
const fam = new Map(); for (const r of rows) { const k = r.g.ethId; if (!fam.has(k)) fam.set(k, []); fam.get(k).push(r); }
console.log('種類の組み合わせ（平面×屋根×壁）の数', new Set(rows.map(r => r.d.plan.kind + r.d.roof.kind + r.tr.wallMat)).size, '／集団', rows.length);
// 同じ環境で、民族が違うと違うか：環境を固定して全民族に建てさせる
const fixedEnv = rows[0].e; const kinds = new Set(); for (const eth of people.ethnicities) { const gen = A.genome(+(process.argv[4] || 42), eth.id, eth.id), tr = A.tradition(+(process.argv[4] || 42), gen, fixedEnv, 0.5, eth.color); kinds.add(A.designBuilding(+(process.argv[4] || 42), tr, 'dwelling', 5, 4, 0).plan.kind + A.designBuilding(+(process.argv[4] || 42), tr, 'dwelling', 5, 4, 0).roof.kind + tr.wallMat + tr.ornament); }
console.log('同じ環境・技術で、民族が違うと違う設計：', kinds.size, '種類（民族', people.ethnicities.length, '）');
// 同じ系統の民族（親子）は似ているか：親と、親から分かれた民族のゲノムの距離
const g1 = A.genome(+(process.argv[4] || 42), 5, 5), g2 = A.genome(+(process.argv[4] || 42), 5, 105), g3 = A.genome(+(process.argv[4] || 42), 9, 9); const dist = (a, b) => a.plan.reduce((s, x, i) => s + Math.abs(x - b.plan[i]), 0) + a.roof.reduce((s, x, i) => s + Math.abs(x - b.roof[i]), 0);
ok(dist(g1, g2) < dist(g1, g3), `同じ系統（親子）の伝統は、他の系統より似ている（距離 ${dist(g1, g2).toFixed(2)} < ${dist(g1, g3).toFixed(2)}）`);
// 寸法・妥当性
let bad = 0, minA = 1e9, maxA = 0; for (const r of rows) for (const role of ['dwelling', 'storehouse', 'workshop', 'hall', 'rack']) for (const m of [1, 4, 8]) { const d = A.designBuilding(+(process.argv[4] || 42), r.tr, role, r.g.id * 31 + m, m, 30); const a = d.plan.kind === 'rect' ? d.plan.w * d.plan.d : Math.PI * d.plan.w * d.plan.w / 4; minA = Math.min(minA, a); maxA = Math.max(maxA, a); if (!(d.plan.w > 1.5 && d.plan.w < 25 && d.plan.d > 1.5 && d.plan.d < 40 && d.wallH > 1.2 && d.wallH < 4 && d.roof.h > 0.1 && d.roof.h < 6 && d.door.w < d.plan.w && d.door.h < d.wallH)) bad++; }
ok(bad === 0, `全ての設計の寸法が妥当（床面積 ${minA.toFixed(0)}〜${maxA.toFixed(0)}㎡、不正 ${bad}件）`);
// 極端な環境（合成）：寒冷地・砂漠・密林・岩山で、期待どおりの建て方になるか（100民族の平均）
{ const base = { fertile: 0.4, forest: 0, grass: 0, desert: 0, tundra: 0, wetland: 0, rugged: 0, elev: 100 };
  const envs = { '寒冷なツンドラ': Object.assign({}, base, { tempC: -6, precip: 450, wood: 0.05, stone: 0.3, clay: 0.2, tundra: 0.85, grass: 0.2 }), '暑い砂漠': Object.assign({}, base, { tempC: 28, precip: 150, wood: 0.03, stone: 0.4, clay: 0.7, desert: 0.9 }), '多雨の密林': Object.assign({}, base, { tempC: 26, precip: 3000, wood: 0.9, stone: 0.1, clay: 0.2, forest: 0.95, wetland: 0.45 }), '岩の多い山地': Object.assign({}, base, { tempC: 6, precip: 800, wood: 0.12, stone: 0.95, clay: 0.1, forest: 0.1, rugged: 0.8 }) };
  const res = {}; for (const [name, e] of Object.entries(envs)) { const walls = {}, roofs = {}, plans = {}; let stilts = 0, sunken = 0, steep = 0, flat = 0; for (const eth of people.ethnicities) { const tr = A.tradition(+(process.argv[4] || 42), A.genome(+(process.argv[4] || 42), eth.id, eth.id), e, 0.5, eth.color), d = A.designBuilding(+(process.argv[4] || 42), tr, 'dwelling', 3, 4, 0); walls[tr.wallMat] = (walls[tr.wallMat] || 0) + 1; roofs[tr.roofMat] = (roofs[tr.roofMat] || 0) + 1; plans[d.plan.kind] = (plans[d.plan.kind] || 0) + 1; if (tr.stilts > 0.3) stilts++; if (tr.sunken > 0.3) sunken++; if (d.roof.pitch > 38) steep++; if (d.roof.kind === 'flat') flat++; } res[name] = { walls, roofs, plans, stilts, sunken, steep, flat }; console.log(name, JSON.stringify(res[name])); }
  const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0][0];
  ok(top(res['寒冷なツンドラ'].walls) === 'turf' || top(res['寒冷なツンドラ'].walls) === 'mud', `寒冷なツンドラ：主な壁は芝土か土（${top(res['寒冷なツンドラ'].walls)}）`); ok(res['寒冷なツンドラ'].sunken > 50, `寒冷なツンドラ：床を下げる家が多い（${res['寒冷なツンドラ'].sunken}/100）`);
  ok(['adobe', 'mud', 'stone'].includes(top(res['暑い砂漠'].walls)) && res['暑い砂漠'].flat > 20, `暑い砂漠：日干しレンガ・土・石の壁（${top(res['暑い砂漠'].walls)}）、平屋根 ${res['暑い砂漠'].flat}/100`);
  ok(top(res['多雨の密林'].walls) === 'timber' && res['多雨の密林'].stilts > 40 && res['多雨の密林'].steep > 60, `多雨の密林：木の壁、高床 ${res['多雨の密林'].stilts}/100、急な屋根 ${res['多雨の密林'].steep}/100`);
  ok(top(res['岩の多い山地'].walls) === 'stone', `岩の多い山地：石の壁（${top(res['岩の多い山地'].walls)}）`); }
// 再現性
const again = A.designBuilding(+(process.argv[4] || 42), rows[3].tr, 'dwelling', rows[3].g.id * 131 + 7, 4, 50); ok(JSON.stringify(again) === JSON.stringify(rows[3].d), '同じ入力なら同じ設計（再現性）');
console.log(fail ? `失敗 ${fail}` : '全て合格'); process.exit(fail ? 1 : 0);
