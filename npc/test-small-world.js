'use strict';
// 小規模統合ワールドの検証：node npc/test-small-world.js <generator.js> <world.bin> [年数] [人のSeed...]
const v8 = require('v8'), fs = require('fs'), path = require('path');
const G = require(path.resolve(process.argv[2])), world = v8.deserialize(fs.readFileSync(process.argv[3])), YEARS = +(process.argv[4] || 30), SEEDS = process.argv.length > 5 ? process.argv.slice(5).map(Number) : [42, 7, 1];
const P = require('./people-core.js'), SW = require('./small-world.js'), ST = SW.stageOf(+(process.env.STAGE || 1)), NV = ST.villages;
const env = world.fauna.env, cc = world.climate.cell, W = world.stats.width, cellM = 99866.7 / W, plantFood = (c, m, out) => G.faunaPlantFood(env, cc, c, m, out, 0, 0), FA = { faunaHunt: G.faunaHunt, faunaDensity: G.faunaDensity, ANIMAL_SPECIES: G.ANIMAL_SPECIES };
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log((c ? '○ ' : '× ') + m); };
const km = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) * cellM / 1000;
function make(seed) { const win = SW.pickWindow(world, seed, cellM, ST), small = Object.assign({ win, n: ST.villages, popTotal: ST.popTotal, popMin: ST.popMin, popMax: ST.popMax, minD: ST.minDm / cellM, maxD: ST.maxDm / cellM }); const fauna = G.faunaClone(world.fauna); const pr = process.env.NOPRUNE ? null : SW.pruneFauna(fauna, world, win, cellM); const people = P.peopleGenerate(seed, { world, plantFood, fauna, FA, small }); return { win, people, fauna, pr }; }
const sig = (p) => JSON.stringify(p.groups.map(g => [g.x, g.y, g.ethId, Math.round(g.pop), g.site && g.site.kind]));
for (const seed of SEEDS) {
  console.log(`\n== 人のSeed ${seed}`);
  const A = make(seed), win = A.win; ok(win && win.x1 - win.x0 === Math.round(ST.sizeM / cellM), `${ST.sizeM/1000}km四方の窓（${win.x1 - win.x0}セル×${win.y1 - win.y0}セル）、陸地 ${(win.land * 100).toFixed(0)}%、川の点 ${win.rivers}`);
  const gs = A.people.groups; ok(gs.length === NV, `初期の村は${NV}`); const pop = gs.reduce((a, g) => a + g.pop, 0), np = A.people.npc.livingCount(); ok(np >= NV * ST.popMin * 0.9 && np <= NV * ST.popMax * 1.1, `初期人口 ${np}人（村ごとに${ST.popMin}〜${ST.popMax}人）`);
  ok(gs.every(g => g.settle === 2 && g.alive), '全て定住の村'); ok(new Set(gs.map(g => g.ethId)).size >= Math.min(NV, 4), '複数の民族');
  ok(gs.every(g => g.x >= win.x0 && g.x < win.x1 && g.y >= win.y0 && g.y < win.y1), '全ての村が窓の中');
  const d = []; for (let i = 0; i < NV; i++) for (let j = i + 1; j < NV; j++) d.push(km(gs[i], gs[j])); const nn = gs.map(a => Math.min(...gs.filter(b => b !== a).map(b => km(a, b)))); console.log('   初期の村の人数', gs.map(g => Math.round(g.pop)).join(', ')); console.log('   村どうしの距離(km)', d.map(x => x.toFixed(1)).join(', '));
  ok(nn.every(x => x >= ST.minDm/1000*0.8 && x <= ST.maxDm/1000*1.05), `最も近い村までの距離が ${ST.minDm/1000}〜${ST.maxDm/1000}km（${nn.map(x => x.toFixed(1)).join(', ')}）`);
  ok(sig(make(seed).people) === sig(A.people), '同じSeedで、窓・村・民族・人口が同じ（再現性）');
  // 長期の安定
  const ev = {}, t0 = process.hrtime.bigint(), series = []; let day = 0;
  for (let i = 0; i < YEARS * 12; i++) { const month = i % 12; G.faunaMonthly(A.fauna, { month, env, cc }); const e = P.peopleMonthly(A.people, { month, day: i * 30, world, fauna: A.fauna, FA, plantFood, env, cc, res: world.resources }) || []; for (const x of e) ev[x.type] = (ev[x.type] || 0) + 1; if ((i + 1) % 120 === 0) series.push(Math.round(A.people.groups.reduce((a, g) => a + (g.alive ? g.pop : 0), 0))); }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6; const alive = A.people.groups.filter(g => g.alive);
  console.log(`   ${YEARS}年：人口の推移(10年ごと) ${series.join(' → ')}　集団 ${alive.length}　${(ms / YEARS / 12).toFixed(1)}ms/月`); console.log('   出来事', JSON.stringify(ev));
  ok(alive.length >= 3 && (series.length ? series[series.length - 1] : Math.round(A.people.groups.reduce((a, g) => a + (g.alive ? g.pop : 0), 0))) > 60, `${YEARS}年後も集落が続く（集団 ${alive.length}、人口 ${series.length ? series[series.length - 1] : '-'}）`);
  ok(alive.every(g => g.homeX >= win.x0 - 60 && g.homeX < win.x1 + 60 && g.homeY >= win.y0 - 60 && g.homeY < win.y1 + 60), '窓の外へ出ていない');
  ok(!Object.keys(ev).some(k => /war|battle|raid|attack/i.test(k)), '戦争・襲撃は、強制していない（起きていない）');
  ok(Object.keys(ev).includes('migrate') === false || ev.migrate <= Math.max(6, np / 40), `移住は強制していない（自然に起きた ${ev.migrate || 0}件）`);
  ok(ms / YEARS / 12 < 60, '1か月の計算が軽い（60ms未満。1年/秒は83ms未満）');
}

// ---- 整合性（人口・食料・死亡・血縁・世界履歴）と、同じSeedでの結果の再現
{ const NONE = 0xffffffff, ALIVE = 0x7fffffff, runOnce = (seed, years) => { const A = make(seed); const n0 = A.people.npc.livingCount(); for (let i = 0; i < years * 12; i++) { const month = i % 12; G.faunaMonthly(A.fauna, { month, env, cc }); P.peopleMonthly(A.people, { month, day: i * 30, world, fauna: A.fauna, FA, plantFood, env, cc, res: world.resources }); } return { A, n0 }; };
  const { A, n0 } = runOnce(5, 40), pe = A.people, N = pe.npc, st = N.stats, live = N.livingCount();
  console.log(`\n== 整合性（40年）：開始 ${n0}人 → ${live}人、出生 ${st.births}、死亡 ${st.deaths}`);
  ok(live === n0 + st.births - st.deaths, `人口＝開始＋出生−死亡（${n0}＋${st.births}−${st.deaths}＝${n0 + st.births - st.deaths}／実際 ${live}）`);
  const gp = pe.groups.reduce((a, g) => a + (g.alive ? g.pop : 0), 0); ok(Math.abs(gp - live) <= pe.groups.length, `集団の人口の合計（${Math.round(gp)}）が住民の数（${live}）と一致`);
  let badRef = 0, badSpouse = 0, deadInGroup = 0, badGroup = 0; for (let i = 0; i < N.n; i++) { if (N.mother[i] !== NONE && N.mother[i] >= N.n) badRef++; if (N.father[i] !== NONE && N.father[i] >= N.n) badRef++; const sp = N.spouse[i]; if (sp !== NONE && N.death[i] === ALIVE && N.death[sp] === ALIVE && N.spouse[sp] !== i) badSpouse++; if (N.death[i] === ALIVE && (N.group[i] < 1 || N.group[i] > pe.groups.length || !pe.groups[N.group[i] - 1].alive)) badGroup++; }
  ok(badRef === 0 && badSpouse === 0 && badGroup === 0, `血縁・配偶者・所属の参照が壊れていない（親の不正 ${badRef}・配偶者の不一致 ${badSpouse}・所属の不正 ${badGroup}）`);
  ok(pe.groups.every(g => g.food >= 0 && g.fed >= 0 && g.fed <= 1.0001), '食料の蓄え・充足が範囲内（蓄え≥0、充足0〜1）');
  const L = pe.statLog; ok(L && Math.abs(L.pop[L.pop.length - 1] - gp) <= pe.groups.length * 1.5 + 5 && L.days[L.days.length - 1] > 360 * 39, `統計の記録の最新（${L.pop[L.pop.length - 1]}）が実際（${Math.round(gp)}）と一致、記録 ${L.days.length}件`);
  const deadByCause = N.stats.deaths; ok(pe.groups.reduce((a, g) => a + g.died.natural + g.died.starvation + g.died.cold + g.died.disease, 0) <= deadByCause + 5, '死因の集計が死亡数と矛盾しない');
  // 同じSeedで、同じ結果（40年後の全住民の検査値・全集団の状態）
  const B = runOnce(5, 40).A.people, dig = (q) => JSON.stringify([q.npc.checksum(), q.groups.map(g => [g.id, g.alive, Math.round(g.pop * 1000), Math.round(g.food), Math.round(g.fed * 1e6), g.settle, g.x, g.y])]);
  ok(dig(pe) === dig(B), '同じSeedで同じ条件なら、40年後の全住民・全集団の状態が完全に一致（再現性）'); }
console.log(fail ? `失敗 ${fail}` : '全て合格'); process.exit(fail ? 1 : 0);
