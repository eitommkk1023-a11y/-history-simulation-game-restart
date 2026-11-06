'use strict';
// 技術ページの集計の検証：node npc/test-techview.js <generator.js> <world.bin>
const v8 = require('v8'), fs = require('fs');
const G = require(require('path').resolve(process.argv[2])), world = v8.deserialize(fs.readFileSync(process.argv[3]));
const P = require('./people-core.js'), N = require('./nation.js'), Npc = require('./npc-core.js');
const env = world.fauna.env, cc = world.climate.cell, res = world.resources;
const plantFood = (c, m, out) => G.faunaPlantFood(env, cc, c, m, out, 0, 0);
const FA = { faunaHunt: G.faunaHunt, faunaDensity: G.faunaDensity, ANIMAL_SPECIES: G.ANIMAL_SPECIES };
let ok = 0, ng = 0; const t = (name, cond, extra) => { if (cond) ok++; else { ng++; console.log('NG', name, extra == null ? '' : extra); } };
const fauna = G.faunaClone(world.fauna), people = P.peopleGenerate(42, { world, plantFood, fauna, FA }), Pn = people.npc;
for (let i = 0; i < 24; i++) { G.faunaMonthly(fauna, { month: i % 12, env, cc }); P.peopleMonthly(people, { month: i % 12, day: i * 30, world, fauna, FA, plantFood, env, cc, res }); }
const alive = people.groups.filter(g => g.alive && g.pop >= 30).sort((a, b) => b.pop - a.pop), A = alive[0], B = alive[1];
for (const e of people.ethnicities.filter(x => x.alive)) { P.peopleGrantTech(people, e.id, 'cultivate'); P.peopleGrantTech(people, e.id, 'herd'); P.peopleGrantTech(people, e.id, 'pottery'); }
const sA = P.peopleTechSummary(people, A.id);
t('集計ができる', sA && sA.count > 0 && sA.techs.length > 0, sA && sA.count);
// 人数の重複なし：保有者は人物ごとに1回だけ
t('保有者に重複がない', sA.techs.every(x => new Set(x.holders.map(h => h.id)).size === x.holders.length));
t('熟練者は知っている人の部分集合（人数が逆転しない）', sA.techs.every(x => x.practiced <= x.knowers));
// 元データと一致：保有者の技能値は P.skills と同じ
t('人物ごとの技能値が元データと一致', sA.techs.every(x => { const si = P.TECH_SKILL[x.id]; return x.holders.every(h => h.skill === Pn.skills[h.id * Npc.NSKILL + si]); }));
t('熟練者は基準（30）以上で、並びは高い順', sA.techs.every(x => x.holders.every((h, k) => h.skill >= sA.min && (k === 0 || x.holders[k - 1].skill >= h.skill))));
t('最高水準が保有者の先頭と一致', sA.techs.every(x => x.top === (x.holders[0] ? x.holders[0].skill : 0)));
t('分類は既存の技術定義（ax）から', sA.techs.every(x => P.TECH_AX[x.ax] === x.cat));
t('技能と結びつかない技術は、熟練を数えない', sA.techs.filter(x => P.TECH_SKILL[x.id] === undefined).every(x => x.practiced === 0 && x.skillName === null));
// 生存者・所属：死亡すると消える／所属を変えると移る
const m0 = sA.members[0].id, before = sA.count;
Pn._die(m0, 1); const sA2 = P.peopleTechSummary(people, A.id);
t('死亡した人は集計から外れる', sA2.count === before - 1 && !sA2.members.some(m => m.id === m0) && sA2.techs.every(x => !x.holders.some(h => h.id === m0)));
const mv = sA2.members.find(m => m.age >= 14), nB = P.peopleTechSummary(people, B.id).count;
Pn.moveToGroup(mv.id, B.id);
const sA3 = P.peopleTechSummary(people, A.id), sB3 = P.peopleTechSummary(people, B.id);
t('所属を変えた人は、元の村から外れ、新しい村に入る', !sA3.members.some(m => m.id === mv.id) && sB3.members.some(m => m.id === mv.id) && sB3.count === nB + 1);
t('村を切り替えても、人物が混ざらない', sA3.members.every(m => Pn.group[m.id] === A.id) && sB3.members.every(m => Pn.group[m.id] === B.id));
// 技術の習得が反映される：新しい技術を与えると、知っている人が出る
const E0 = people.ethnicities.find(e => e.alive && sB3.members.some(m => m.eth === e.id)); P.peopleGrantTech(people, E0.id, 'dugout');
t('技術の習得が反映される', P.peopleTechSummary(people, B.id).techs.some(x => x.id === 'dugout' && x.knowers > 0));
// 保有者が1人の技術の判定
const solo = sB3.techs.filter(x => x.solo); t('「保有者が1人」の判定が、熟練者1人と一致', sB3.techs.every(x => x.solo === (x.practiced === 1 && x.skillName !== null)), solo.length);
t('結果が毎回同じ（読み取りだけで状態を変えない）', JSON.stringify(P.peopleTechSummary(people, A.id).techs) === JSON.stringify(P.peopleTechSummary(people, A.id).techs));
const t0 = Date.now(); for (let i = 0; i < 20; i++) P.peopleTechSummary(people, A.id); console.log(`集計 ${((Date.now() - t0) / 20).toFixed(2)}ms（${sA.count}人・${sA.techs.length}技術）`);
console.log(ng ? 'FAIL ' + ng + ' / ' + (ok + ng) : 'OK ' + ok + ' 件通過'); process.exit(ng ? 1 : 0);
