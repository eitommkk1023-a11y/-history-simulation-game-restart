'use strict';
// 人口の層（個人・集計）の昇格・降格の検証：node npc/test-layers.js <generator.js> <world.bin> [年数]
const v8 = require('v8'), fs = require('fs'), path = require('path');
const G = require(path.resolve(process.argv[2])), world = v8.deserialize(fs.readFileSync(process.argv[3])), YEARS = +process.argv[4] || 20;
const P = require('./people-core.js'), SW = require('./small-world.js');
const env = world.fauna.env, cc = world.climate.cell, W = world.stats.width, cellM = 99866.7 / W, plantFood = (c, m, out) => G.faunaPlantFood(env, cc, c, m, out, 0, 0), FA = { faunaHunt: G.faunaHunt, faunaDensity: G.faunaDensity, ANIMAL_SPECIES: G.ANIMAL_SPECIES };
let ok = 0, ng = 0; const t = (name, cond, extra) => { if (cond) { ok++; console.log('○', name, extra == null ? '' : extra); } else { ng++; console.log('×', name, extra == null ? '' : extra); } };
function make(seed) { const ST = SW.stageOf(1), win = SW.pickWindow(world, seed, cellM, ST), small = { win, n: ST.villages, popTotal: ST.popTotal, popMin: ST.popMin, popMax: ST.popMax, minD: ST.minDm / cellM, maxD: ST.maxDm / cellM }; const fauna = G.faunaClone(world.fauna); SW.pruneFauna(fauna, world, win, cellM); return { people: P.peopleGenerate(seed, { world, plantFood, fauna, FA, month: 0, small }), fauna }; }
const monthly = (A, i) => { const month = i % 12; G.faunaMonthly(A.fauna, { month, env, cc }); return P.peopleMonthly(A.people, { month, day: i * 30, world, fauna: A.fauna, FA, plantFood, env, cc, res: world.resources }) || []; };
const total = (people) => P.peopleLayerSummary(people).total, living = (people) => people.groups.filter(g => g.alive).reduce((a, g) => a + g.pop, 0);
// ---- 1. 降格：総人口が変わらない・個人IDと死亡の数は変わらない
{ const A = make(5), pe = A.people, N = pe.npc; for (let i = 0; i < 12; i++) monthly(A, i);   // 1年進めて、月の状態を整える
  const before = living(pe), deaths0 = N.stats.deaths, ids0 = N.n; let moved = 0; for (const g of pe.groups) if (g.alive) moved += P.peopleLayerDemote(pe, g.id, Math.floor(g.pop * 0.6));
  const s = P.peopleLayerSummary(pe); const st = pe.stat; P.peopleSave; // 集計
  // 人口の表を更新するため1か月進める（0か月分の更新だけ）
  t('降格した（集団の約6割）', moved > before * 0.4, `${moved}人／${before}人`);
  t('降格の前後で、個人＋集計の総数が同じ', s.total === before || Math.abs(s.total - before) <= 1, `前 ${before} → 個人 ${s.individuals} ＋ 集計 ${Math.round(s.aggregated)}`);
  t('死亡の数に入らない（死亡 ' + deaths0 + '）', N.stats.deaths === deaths0); t('個人IDの数は変わらない（降格しても消えない）', N.n === ids0);
  t('降格した人は個人IDを持ち、死亡ではなく cause=98（集計へ移った）', (() => { let c = 0; for (let i = 0; i < N.n; i++) if (N.cause[i] === 98) c++; return c === moved; })());
  // 同じ世帯は、まとめて降格される（夫婦の片方だけが集計に移らない）
  t('夫婦が、まとめて降格される（片方だけが集計に移らない）', (() => { let bad = 0; for (let i = 0; i < N.n; i++) { const sp = N.spouse[i]; if (sp === 0xffffffff || N.spouse[sp] !== i) continue; const fa = N.cause[i] === 98, fb = N.cause[sp] === 98; if (fa !== fb) bad++; } return bad === 0; })());
}
// ---- 2. 集計の層のまま20年進める：個人だけの場合と比べる（同じSeed・同じ初期）
function trajectory(seed, demoteShare) { const A = make(seed); for (let i = 0; i < 12; i++) monthly(A, i); if (demoteShare) for (const g of A.people.groups) if (g.alive) P.peopleLayerDemote(A.people, g.id, Math.floor(g.pop * demoteShare)); const out = [living(A.people)]; for (let y = 0; y < YEARS; y++) { for (let m = 0; m < 12; m++) monthly(A, 12 + y * 12 + m); out.push(living(A.people)); } return { out, A }; }
const seeds = [5, 6, 7], ctrl = seeds.map(s => trajectory(s, 0)), lay = seeds.map(s => trajectory(s, 0.6));
console.log('年, 個人だけ（平均）, 6割を集計（平均）'); const avg = (arr, y) => arr.reduce((a, r) => a + r.out[y], 0) / arr.length; for (const y of [0, 5, 10, YEARS]) console.log(y, avg(ctrl, y).toFixed(0), avg(lay, y).toFixed(0), ((avg(lay, y) / avg(ctrl, y) - 1) * 100).toFixed(1) + '%');
for (const y of [5, 10, YEARS]) t(`${y}年後の総人口が、個人だけの場合と近い（±10%以内）`, Math.abs(avg(lay, y) / avg(ctrl, y) - 1) < 0.10, `${avg(ctrl, y).toFixed(0)} / ${avg(lay, y).toFixed(0)}`);
// ---- 3. 保存・読み込み：集計が保存され、読み込んでも同じ
{ const A = lay[0].A, sv = P.peopleSave(A.people), JSONs = JSON.stringify(sv.meta.groups.map(g => g.agg ? g.agg : null)); t('保存に集計が入る（0でない区分だけ）', JSONs.length > 100 && JSONs.length < 400000, `${Math.round(JSONs.length / 1024)}KB`);
  const loaded = P.peopleLoad(JSON.parse(JSON.stringify(sv, (k, v) => ArrayBuffer.isView(v) ? { __ta: v.constructor.name, a: Array.from(v) } : v), (k, x) => x && x.__ta ? new globalThis[x.__ta](x.a) : x)); const a = P.peopleLayerSummary(A.people), b = P.peopleLayerSummary(loaded);
  t('読み込み後も、個人＋集計の数が同じ', Math.abs(a.total - b.total) < 3 && Math.abs(a.aggregated - b.aggregated) < 3, `${Math.round(a.aggregated)} → ${Math.round(b.aggregated)}`); }
// ---- 4. 昇格：集計から新しい個人。総数が保たれ、集計が減る
{ const A = lay[1].A, pe = A.people, g = pe.groups.filter(x => x.alive && x.agg).sort((a, b) => b.agg.total() - a.agg.total())[0], a0 = g.agg.total(), tot0 = P.peopleLayerSummary(pe).total, n0 = pe.npc.n;
  const ids = P.peopleLayerPromote(pe, g.id, 20); t('昇格：20人が新しい個人になる', ids.length === 20 && pe.npc.n === n0 + 20, `${ids.length}人`); t('昇格：集計が20人減る', Math.abs(a0 - g.agg.total() - 20) < 0.01); t('昇格：個人＋集計の総数は同じ', Math.abs(P.peopleLayerSummary(pe).total - tot0) < 1e-6 + 0.0001, `${tot0.toFixed(1)} → ${P.peopleLayerSummary(pe).total.toFixed(1)}`);
  t('昇格した人の年齢・性別が妥当', ids.every(i => { const age = pe.npc.age(i); return age >= 0 && age < 81 && (pe.npc.sex[i] === 0 || pe.npc.sex[i] === 1) && pe.npc.group[i] === g.id; })); }
// ---- 5. 決定性：同じSeedなら、同じ降格・同じ推移
{ const a = trajectory(5, 0.6).out, b = trajectory(5, 0.6).out; t('同じSeedで、同じ推移（決定的）', a.join() === b.join()); }
// ---- 6. 食料：集計の住民も、食べ物の必要量に数える（飢え）
{ const A = make(6), pe = A.people; for (let i = 0; i < 12; i++) monthly(A, i); const g = pe.groups.find(x => x.alive); const need0 = pe.stat.need[g.id]; P.peopleLayerDemote(pe, g.id, Math.floor(g.pop * 0.5)); monthly(A, 12); const need1 = pe.stat.need[g.id];
  t('降格しても、集団の食料の必要量が（ほぼ）変わらない（±15%）', Math.abs(need1 / need0 - 1) < 0.15, `${need0.toFixed(0)} → ${need1.toFixed(0)}`); }
console.log(ng ? `不合格 ${ng}` : `全て合格（${ok}項目）`); process.exit(ng ? 1 : 0);
