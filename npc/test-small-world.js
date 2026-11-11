'use strict';
// 小規模統合ワールドの検証：node npc/test-small-world.js <generator.js> <world.bin> [年数] [人のSeed...]
const v8 = require('v8'), fs = require('fs'), path = require('path');
const G = require(path.resolve(process.argv[2])), world = v8.deserialize(fs.readFileSync(process.argv[3])), YEARS = +(process.argv[4] || 30), SEEDS = process.argv.length > 5 ? process.argv.slice(5).map(Number) : [42, 7, 1];
const P = require('./people-core.js'), SW = require('./small-world.js');
const env = world.fauna.env, cc = world.climate.cell, W = world.stats.width, cellM = 99866.7 / W, plantFood = (c, m, out) => G.faunaPlantFood(env, cc, c, m, out, 0, 0), FA = { faunaHunt: G.faunaHunt, faunaDensity: G.faunaDensity, ANIMAL_SPECIES: G.ANIMAL_SPECIES };
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log((c ? '○ ' : '× ') + m); };
const km = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) * cellM / 1000;
function make(seed) { const win = SW.pickWindow(world, seed, cellM), small = Object.assign({ win, n: SW.SMALL.villages, popTotal: SW.SMALL.popTotal, minD: SW.SMALL.minDm / cellM, maxD: SW.SMALL.maxDm / cellM }); const fauna = G.faunaClone(world.fauna); const pr = process.env.NOPRUNE ? null : SW.pruneFauna(fauna, world, win, cellM); const people = P.peopleGenerate(seed, { world, plantFood, fauna, FA, small }); return { win, people, fauna, pr }; }
const sig = (p) => JSON.stringify(p.groups.map(g => [g.x, g.y, g.ethId, Math.round(g.pop), g.site && g.site.kind]));
for (const seed of SEEDS) {
  console.log(`\n== 人のSeed ${seed}`);
  const A = make(seed), win = A.win; ok(win && win.x1 - win.x0 === Math.round(20000 / cellM), `20km四方の窓（${win.x1 - win.x0}セル×${win.y1 - win.y0}セル）、陸地 ${(win.land * 100).toFixed(0)}%、川の点 ${win.rivers}`);
  const gs = A.people.groups; ok(gs.length === 4, `初期の村は4`); const pop = gs.reduce((a, g) => a + g.pop, 0), np = A.people.npc.livingCount(); ok(np >= 170 && np <= 240, `初期人口 ${np}人（目標 約200）`);
  ok(gs.every(g => g.settle === 2 && g.alive), '4つとも定住の村'); ok(new Set(gs.map(g => g.ethId)).size === 4, '4つの民族');
  ok(gs.every(g => g.x >= win.x0 && g.x < win.x1 && g.y >= win.y0 && g.y < win.y1), '全ての村が窓の中');
  const d = []; for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) d.push(km(gs[i], gs[j])); const nn = gs.map(a => Math.min(...gs.filter(b => b !== a).map(b => km(a, b)))); console.log('   村どうしの距離(km)', d.map(x => x.toFixed(1)).join(', '));
  ok(nn.every(x => x >= 2.5 && x <= 10.5), `最も近い村までの距離が 3〜10km（${nn.map(x => x.toFixed(1)).join(', ')}）`);
  ok(sig(make(seed).people) === sig(A.people), '同じSeedで、窓・村・民族・人口が同じ（再現性）');
  // 長期の安定
  const ev = {}, t0 = process.hrtime.bigint(), series = []; let day = 0;
  for (let i = 0; i < YEARS * 12; i++) { const month = i % 12; G.faunaMonthly(A.fauna, { month, env, cc }); const e = P.peopleMonthly(A.people, { month, day: i * 30, world, fauna: A.fauna, FA, plantFood, env, cc, res: world.resources }) || []; for (const x of e) ev[x.type] = (ev[x.type] || 0) + 1; if ((i + 1) % 120 === 0) series.push(Math.round(A.people.groups.reduce((a, g) => a + (g.alive ? g.pop : 0), 0))); }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6; const alive = A.people.groups.filter(g => g.alive);
  console.log(`   ${YEARS}年：人口の推移(10年ごと) ${series.join(' → ')}　集団 ${alive.length}　${(ms / YEARS / 12).toFixed(1)}ms/月`); console.log('   出来事', JSON.stringify(ev));
  ok(alive.length >= 3 && (series.length ? series[series.length - 1] : Math.round(A.people.groups.reduce((a, g) => a + (g.alive ? g.pop : 0), 0))) > 60, `${YEARS}年後も集落が続く（集団 ${alive.length}、人口 ${series.length ? series[series.length - 1] : '-'}）`);
  ok(alive.every(g => g.homeX >= win.x0 - 60 && g.homeX < win.x1 + 60 && g.homeY >= win.y0 - 60 && g.homeY < win.y1 + 60), '窓の外へ出ていない');
  ok(!Object.keys(ev).some(k => /war|battle|raid|attack/i.test(k)), '戦争・襲撃は、強制していない（起きていない）');
  ok(Object.keys(ev).includes('migrate') === false || ev.migrate <= 6, `移住は強制していない（自然に起きた ${ev.migrate || 0}件）`);
  ok(ms / YEARS / 12 < 30, '1か月の計算が軽い（30ms未満）');
}
console.log(fail ? `失敗 ${fail}` : '全て合格'); process.exit(fail ? 1 : 0);
