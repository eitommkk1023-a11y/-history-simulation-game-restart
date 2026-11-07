'use strict';
// 集落の立地の検証：node npc/test-sites.js <generator.js> <world1.bin> [<world2.bin> ...]
// 川だけの場合（SITE_RIVER_ONLY）と、川・海岸・湖畔・湧水の場合を、同じ世界・同じ乱数で比べる。なぜその場所になったか（内訳）も確かめる
const v8 = require('v8'), fs = require('fs');
const G = require(require('path').resolve(process.argv[2])), files = process.argv.slice(3);
const P = require('./people-core.js');
let ok = 0, ng = 0; const t = (name, cond, extra) => { if (cond) ok++; else { ng++; console.log('NG', name, extra == null ? '' : extra); } };
const YEARS = +(process.env.YEARS || 20);
function gen(world, seed, riverOnly) {
  const env = world.fauna.env, cc = world.climate.cell, plantFood = (c, m, out) => G.faunaPlantFood(env, cc, c, m, out, 0, 0);
  const FA = { faunaHunt: G.faunaHunt, faunaDensity: G.faunaDensity, ANIMAL_SPECIES: G.ANIMAL_SPECIES };
  // 川だけの試験：定数を一時的に切り替える（立地の候補は世界ごとに1回だけ作るので、キャッシュも作り直す）
  P.PE.SITE_RIVER_ONLY = !!riverOnly; P.resetSiteCache && P.resetSiteCache();
  const fauna = G.faunaClone(world.fauna), people = P.peopleGenerate(seed, { world, plantFood, fauna, FA });
  return { people, fauna, FA, plantFood, env, cc, res: world.resources };
}
function run(R, world, years) {
  const { people, fauna, FA, plantFood, env, cc, res } = R;
  for (let i = 0; i < years * 12; i++) { const month = i % 12; G.faunaMonthly(fauna, { month, env, cc }); P.peopleMonthly(people, { month, day: i * 30, world, fauna, FA, plantFood, env, cc, res }); }
  const alive = people.groups.filter(g => g.alive); let pop = 0, fed = 0, kinds = {}, village = 0; for (const g of alive) { pop += g.pop; fed += g.fed; if (g.site) kinds[g.site.kind] = (kinds[g.site.kind] || 0) + 1; if (g.settle === 2) village++; }
  return { pop: Math.round(pop), fed: +(fed / alive.length).toFixed(3), groups: alive.length, kinds, village };
}
for (const f of files) {
  const world = v8.deserialize(fs.readFileSync(f)); console.log('\n== ' + require('path').basename(f));
  for (const seed of [42, 7]) {
    const A = gen(world, seed, true), B = gen(world, seed, false);
    const kindsOf = (people) => { const o = {}; for (const g of people.groups) o[g.site ? g.site.kind : '?'] = (o[g.site ? g.site.kind : '?'] || 0) + 1; return o; };
    const kA = kindsOf(A.people), kB = kindsOf(B.people);
    console.log(`seed ${seed}：川のみ ${JSON.stringify(kA)} → 複数の候補 ${JSON.stringify(kB)}`);
    t('川のみでは、すべて川沿い', Object.keys(kA).every(k => k === 'river'), JSON.stringify(kA));
    t('複数の候補では、川以外も選ばれる', Object.keys(kB).some(k => k !== 'river'), JSON.stringify(kB));
    // すべての集団：陸地・水の上でない・内訳が記録されている・点数が内訳の積と一致
    const S = P.peSites ? null : null; let bad = 0, badScore = 0, noWater = 0; const W = world.stats.width;
    for (const g of B.people.groups) { const i = Math.round(g.y) * W + Math.round(g.x); if (!world.type[i] || world.water[i]) bad++; const s = g.site; if (!s || !s.parts) { badScore++; continue; } if (s.parts.water < 0.5) noWater++; }
    t('すべての集団が、陸の乾いた所にある', bad === 0, bad + '集団'); t('すべての集団に立地の内訳がある', badScore === 0, badScore + '集団'); t('飲み水に不便な場所（水の点数0.5未満）が選ばれない', noWater === 0, noWater + '集団');
    // 点数の再計算が一致（内訳から、なぜその点数かを説明できる）
    let mism = 0; for (const g of B.people.groups.slice(0, 20)) { const s = g.site; const p = s.parts, calc = p.food * p.water * p.terrain * (1 + 0.35 * p.resource + p.transport) * p.flood * p.tech; if (Math.abs(calc - s.score) / Math.max(1, s.score) > 0.03) mism++; }
    t('点数が内訳の積で説明できる（誤差3%以内）', mism === 0, mism + '件');
    // 決定性
    const B2 = gen(world, seed, false); t('同じSeedで、同じ立地になる', JSON.stringify(B2.people.groups.map(g => [g.x, g.y, g.site.kind])) === JSON.stringify(B.people.groups.map(g => [g.x, g.y, g.site.kind])));
    // 時間経過：人口・食料の充足が、川のみと同程度（悪化しない）
    const a = run(A, world, YEARS), b = run(B, world, YEARS);
    console.log(`  ${YEARS}年後：川のみ 人口${a.pop} 充足${a.fed} 村${a.village}／複数 人口${b.pop} 充足${b.fed} 村${b.village} 立地${JSON.stringify(b.kinds)}`);
    t('複数の候補でも、人口が極端に減らない（川のみの85%以上）', b.pop >= a.pop * 0.85, a.pop + ' vs ' + b.pop); t('食料の充足が大きく下がらない（-0.05以内）', b.fed >= a.fed - 0.05, a.fed + ' vs ' + b.fed);
    // 農耕を持つと、川沿いの肥えた谷も村になれる（野生の食料だけでなく、農地の価値も定住に使う）
    { const C = gen(world, seed, false); for (const e of C.people.ethnicities) P.peopleGrantTech(C.people, e.id, 'cultivate'); const c = run(C, world, YEARS); const riv = C.people.groups.filter(g => g.alive && g.site && g.site.kind === 'river'), rv = riv.filter(g => g.settle === 2).length;
      console.log(`  栽培を与えて${YEARS}年：川沿い ${riv.length}集団のうち村 ${rv}、全体の村 ${c.village}`); t('栽培があれば、川沿いの集団にも村ができる', rv >= 1, rv + '/' + riv.length); }
  }
}
console.log(ng ? 'FAIL ' + ng + ' / ' + (ok + ng) : 'OK ' + ok + ' 件通過'); process.exit(ng ? 1 : 0);
