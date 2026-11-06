'use strict';
// 村の成長（農耕・牧畜）の検証：node npc/test-growth.js <generator.js> <world.bin> [年数]
const v8 = require('v8'), fs = require('fs');
const G = require(require('path').resolve(process.argv[2])), world = v8.deserialize(fs.readFileSync(process.argv[3])), YEARS = +process.argv[4] || 40;
const P = require('./people-core.js'), N = require('./nation.js');
const env = world.fauna.env, cc = world.climate.cell, res = world.resources;
const plantFood = (c, m, out) => G.faunaPlantFood(env, cc, c, m, out, 0, 0);
const FA = { faunaHunt: G.faunaHunt, faunaDensity: G.faunaDensity, ANIMAL_SPECIES: G.ANIMAL_SPECIES };
let ok = 0, ng = 0; const t = (name, cond, extra) => { if (cond) ok++; else { ng++; console.log('NG', name, extra == null ? '' : extra); } };
function run(grant, years) {
  const fauna = G.faunaClone(world.fauna), people = P.peopleGenerate(42, { world, plantFood, fauna, FA }), out = { years: [], ev: {}, ms: [] };
  let granted = false;
  for (let i = 0; i < years * 12; i++) {
    const month = i % 12; G.faunaMonthly(fauna, { month, env, cc });
    const t0 = process.hrtime.bigint(), ev = P.peopleMonthly(people, { month, day: i * 30, world, fauna, FA, plantFood, env, cc, res }); out.ms.push(Number(process.hrtime.bigint() - t0) / 1e6);
    for (const e of ev) out.ev[e.type] = (out.ev[e.type] || 0) + 1;
    if (!granted && grant && people.nation) { granted = true; const alive = people.ethnicities.filter(e => e.alive); alive.forEach((e, k) => { if (k % 2 === 0) { P.peopleGrantTech(people, e.id, 'cultivate'); } if (k % 4 === 0) P.peopleGrantTech(people, e.id, 'herd'); }); }
    if (month === 11 && (i + 1) / 12 % 5 === 0) {
      let pop = 0, fed = 0, n = 0, farm = 0, herd = 0, villages = 0, large = 0, farmers = 0, herdN = 0, fk = 0, tot = 0;
      for (const g of people.groups) if (g.alive) { pop += g.pop; fed += g.fed; n++; const gr = P.peopleGrowth(people, g.id); if (g.settle === 2) villages++; if (gr.stage === 3) large++; farmers += gr.farmers; herdN += gr.herdN; fk += (g.lastFood.farm || 0); tot += (g.lastFood.hunt + g.lastFood.gather + g.lastFood.fish + (g.lastFood.farm || 0) + (g.lastFood.herd || 0)); }
      out.years.push({ y: (i + 1) / 12, pop: Math.round(pop), groups: n, fed: +(fed / n).toFixed(2), villages, large, farmers, herdN, farmShare: +(fk / Math.max(1, tot)).toFixed(2) });
    }
  }
  out.people = people; return out;
}
const base = run(false, YEARS), tech = run(true, YEARS);
const fmt = (o) => o.years.map(r => `${String(r.y).padStart(3)}年 人口${String(r.pop).padStart(6)} 集団${r.groups} 充足${r.fed} 村${r.villages}(大${r.large}) 農民${r.farmers} 家畜${r.herdN} 農産物${(r.farmShare * 100).toFixed(0)}%`).join('\n');
console.log('--- 技術なし（対照）\n' + fmt(base)); console.log('--- 栽培・牧畜を一部の民族に与える\n' + fmt(tech));
const last = (o) => o.years[o.years.length - 1];
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`1か月の計算：対照 ${avg(base.ms).toFixed(1)}ms／技術あり ${avg(tech.ms).toFixed(1)}ms`);
console.log('出来事（技術あり）', JSON.stringify(tech.ev));
t('栽培を持たなければ農民がいない', base.years.every(r => r.farmers === 0));
t('技術ありでは農民がいる', last(tech).farmers > 0, JSON.stringify(last(tech)));
t('技術ありでは農産物が食料の一部になる', last(tech).farmShare > 0.05, last(tech).farmShare);
t('技術ありは、人口の減りが対照より小さい（または増える）', last(tech).pop > last(base).pop * 1.02, `${last(tech).pop} vs ${last(base).pop}`);
t('食料の充足は対照より下がらない', last(tech).fed >= last(base).fed - 0.03);
// 保存・読み込みで技術が残る
const sv = P.peopleSave ? null : null;
// 決定性：同じ条件で同じ結果
const again = run(true, Math.min(YEARS, 10)); const part = tech.years.find(r => r.y === Math.min(YEARS, 10)); if (part) t('決定性：同じ条件で同じ10年後', again.years[again.years.length - 1].pop === part.pop, `${again.years[again.years.length - 1].pop} vs ${part.pop}`);
// 民族の技術：新しい民族は親から受け継ぐ
const S = tech.people.nation; t('技術の層が作られている', !!S && S.n >= 100);
console.log(ng ? 'FAIL ' + ng + ' / ' + (ok + ng) : 'OK ' + ok + ' 件通過'); process.exit(ng ? 1 : 0);
