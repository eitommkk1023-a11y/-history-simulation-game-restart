'use strict';
// 描画に依存しない部分の検証：node npc/test-view.js <generator.js> <world.bin>
const v8 = require('v8'), fs = require('fs'), path = require('path');
const G = require(path.resolve(process.argv[2])), world = v8.deserialize(fs.readFileSync(process.argv[3]));
const P = require('./people-core.js'), V = require('./npc-view.js');
const env = world.fauna.env, cc = world.climate.cell, plantFood = (c, m, out) => G.faunaPlantFood(env, cc, c, m, out, 0, 0);
const FA = { faunaHunt: G.faunaHunt, faunaDensity: G.faunaDensity, ANIMAL_SPECIES: G.ANIMAL_SPECIES };
const people = P.peopleGenerate(42, { world, plantFood, fauna: G.faunaClone(world.fauna), FA }), N = people.npc;
const g = N.group[people.player.id], cand = V.viewCandidates(people, new Set([g]), 400);
console.log('プレイヤーの集団の住民', cand.length, '人');
// 役割の内訳
const roles = {}; for (const i of cand) { const r = V.role(N, i); roles[r] = (roles[r] || 0) + 1; } console.log('役割', JSON.stringify(roles));
// 1日の動き：昼と夜で、野営地の中心から120m以内にいる人
for (const [lab, t] of [['夜(0.05)', 0.05], ['朝(0.24)', 0.24], ['昼(0.5)', 0.5], ['夕(0.76)', 0.76]]) { let within = 0, moving = 0, far = 0; for (const i of cand) { const p = V.viewPosition(N, i, t); if (Math.hypot(p.x, p.z) < 120) within++; else far++; if (p.moving) moving++; } console.log(`${lab}：120m以内 ${within}人、遠く ${far}人、歩いている ${moving}人`); }
// 歩く速さ（m/s）の最大・平均
let maxS = 0, sum = 0, n = 0; for (const i of cand) for (let t = 0; t < 1; t += 0.037) { const p = V.viewPosition(N, i, t); maxS = Math.max(maxS, p.speed); sum += p.speed; n++; } console.log(`移動の速さ：平均 ${(sum / n).toFixed(2)} m/s、最大 ${maxS.toFixed(1)} m/s`);
// 同じ世帯は近くにいるか（夜）
const byH = new Map(); for (const i of cand) { const h = N.house[i]; if (!byH.has(h)) byH.set(h, []); byH.get(h).push(i); } let maxSpread = 0; for (const [h, arr] of byH) if (arr.length > 1) { for (const a of arr) for (const b of arr) { const pa = V.viewPosition(N, a, 0.05), pb = V.viewPosition(N, b, 0.05); maxSpread = Math.max(maxSpread, Math.hypot(pa.x - pb.x, pa.z - pb.z)); } } console.log(`夜、同じ世帯の人どうしの最大の距離 ${maxSpread.toFixed(1)}m`);
// 再現性と説明
console.log('再現性', JSON.stringify(V.viewPosition(N, cand[3], 0.5)) === JSON.stringify(V.viewPosition(N, cand[3], 0.5)));
console.log('説明の例', JSON.stringify(V.viewDescribe(people, people.player.id)), JSON.stringify(V.viewDescribe(people, N.spouse[people.player.id] !== 0xffffffff ? N.spouse[people.player.id] : cand[5])));
const rel = {}; for (const i of cand) { const r = V.relation(people, i); rel[r] = (rel[r] || 0) + 1; } console.log('あなたとの関係', JSON.stringify(rel));
console.log('高さの割合', [0, 2, 5, 10, 15, 30].map(a => a + '歳:' + (a >= 15 ? 1 : 0.45 + 0.55 * Math.max(0, a - 1) / 14).toFixed(2)).join(' '));
