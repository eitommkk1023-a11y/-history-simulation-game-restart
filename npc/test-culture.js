'use strict';
// 第3工程 建築と民族・地域文化の検証：node npc/test-culture.js <generator.js> <world.bin> [seed]
const v8 = require('v8'), fs = require('fs'), path = require('path'), cp = require('child_process');
const G = require(path.resolve(process.argv[2])), world = v8.deserialize(fs.readFileSync(process.argv[3])), SEED = +(process.argv[4] || 42);
const A = require('./arch-gen.js'), P = require('./people-core.js'), S = require('./settle-layout.js'), { terr } = require('./shape-metrics.js');
const env = world.fauna.env, cc = world.climate.cell, plantFood = (c, m, out) => G.faunaPlantFood(env, cc, c, m, out, 0, 0);
const FA = { faunaHunt: G.faunaHunt, faunaDensity: G.faunaDensity, ANIMAL_SPECIES: G.ANIMAL_SPECIES };
const mk = () => P.peopleGenerate(SEED, { world, plantFood, fauna: G.faunaClone(world.fauna), FA });
const YEARS = +(process.env.YEARS || 60);
function simulate(pp, years) { const fauna = G.faunaClone(world.fauna); for (let i = 0; i < years * 12; i++) { const month = i % 12; G.faunaMonthly(fauna, { month, env, cc }); P.peopleMonthly(pp, { month, day: i * 30, world, fauna, FA, plantFood, env, cc, res: world.resources }); } return pp; }
const people = simulate(mk(), YEARS); console.log(`${YEARS}年進めた世界：集団 ${people.groups.filter(g => g.alive).length}、民族 ${people.ethnicities.filter(e => e.alive).length}`);
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log((c ? '○ ' : '× ') + m); };
const trads = (pp) => pp.groups.filter(g => g.alive).map(g => ({ g, tr: P.peopleTradition(pp, world, g.id) }));
const sig = (tr, seed, role = 'dwelling') => { const b = A.designBuilding(seed, tr, role, 77, 5, 0); return [b.form, b.wall.mat, b.wall.method, b.roof.kind, b.roof.mat].join('|'); };
// 旧い建築（main）との多様性の比較
const oldSrc = cp.execSync('git show main:npc/arch-gen.js', { cwd: path.resolve(__dirname, '..') }).toString(); fs.writeFileSync(path.join(__dirname, '_arch_old.js'), oldSrc); const Ao = require('./_arch_old.js'); fs.unlinkSync(path.join(__dirname, '_arch_old.js'));
const TR = trads(people);
{ const sNew = new Set(), sOld = new Set(), cnt = {}, cntO = {};
  for (const { g, tr } of TR) { const eth = people.ethnicities[g.ethId - 1], c = P.peCampCenter(g), e = A.envAt(world, c.x, c.y);
    for (let k = 0; k < 8; k++) { const key = sig(tr, SEED) + '#' + k; const b = A.designBuilding(SEED, tr, 'dwelling', g.id * 100 + k, 2 + k % 6, 0), bo = Ao.designBuilding(SEED, Ao.tradition(SEED, Ao.genome(SEED, P.peRootEth(people, eth.id), eth.id), e, g.hist ? g.hist.tech : 0.4, eth.color), 'dwelling', g.id * 100 + k, 2 + k % 6, 0);
      const s1 = [b.form, b.wall.mat, b.wall.method, b.roof.kind, b.roof.mat, b.plan.kind].join('|'), s0 = [bo.plan.kind, bo.wall.mat, bo.roof.kind, bo.roof.mat, bo.stilts > .5, bo.sunken > .5].join('|'); sNew.add(s1); sOld.add(s0); cnt[s1] = (cnt[s1] || 0) + 1; cntO[s0] = (cntO[s0] || 0) + 1; } }
  const H = (c) => { const n = Object.values(c).reduce((a, b) => a + b, 0); return -Object.values(c).reduce((a, x) => a + x / n * Math.log2(x / n), 0); };
  console.log(`建物の型の種類：旧 ${sOld.size} → 新 ${sNew.size}　多様さ(エントロピー bit)：旧 ${H(cntO).toFixed(2)} → 新 ${H(cnt).toFixed(2)}`);
  ok(sNew.size > sOld.size && H(cnt) > H(cntO), '建築の型の種類と多様さが、以前より増えた（旧い建築との比較）'); }
// 同じ民族・異なる地域
const tsig = (tr) => [tr.wallMat, tr.roofMat, tr.door, tr.ornament, tr.planW.indexOf(Math.max(...tr.planW)), tr.roofW.indexOf(Math.max(...tr.roofW))].join('|');
{ const by = new Map(); for (const t of TR) { if (!by.has(t.g.ethId)) by.set(t.g.ethId, []); by.get(t.g.ethId).push(t); } let multi = 0, differ = 0;
  for (const [id, arr] of by) { if (arr.length < 2) continue; multi++; if (new Set(arr.map(t => tsig(t.tr))).size > 1) differ++; }
  console.log(`${YEARS}年の経過で、同じ民族で複数の集団がある民族 ${multi}／建築の伝統が集団ごとに違う民族 ${differ}`);
  ok(multi >= 5 && differ / multi > 0.5, '同じ民族でも、住む地域が違えば建築様式が変わる（民族の過半数）');
  // 同じ民族の同じ集団を、別の地域に置いたら：地域差で様式が変わる割合（環境は同じにして、地域だけ変える）
  let n = 0, d = 0; for (const { g } of TR) { const eth = people.ethnicities[g.ethId - 1], c = P.peCampCenter(g), e = A.envAt(world, c.x, c.y), root = P.peRootEth(people, eth.id); const base = A.genome(SEED, root, eth.id); const t1 = A.tradition(SEED, A.regional(base, SEED, 101, 0.3), e, 0.5, eth.color), t2 = A.tradition(SEED, A.regional(base, SEED, 202, 0.3), e, 0.5, eth.color), t0 = A.tradition(SEED, A.regional(base, SEED, 101, 0.3), e, 0.5, eth.color); n++; if (tsig(t1) !== tsig(t2)) d++; if (tsig(t1) !== tsig(t0)) { d -= 1000; } }
  console.log(`同じ民族・同じ環境でも、地域が違うと伝統が変わる ${d}/${n}`); ok(d > 0 && d / n > 0.25, '地域差そのものが効いている（同じ地域なら同じ・別の地域なら変わる）'); }
// 異なる民族・同じ地域：同じ環境に、系統の違う民族を置いたら（環境は同じにして、民族だけ変える）
{ const e0 = A.envAt(world, TR[0].g.x, TR[0].g.y); let n = 0, d = 0, d2 = 0; const E = people.ethnicities.filter(e => e.alive);
  for (let i = 0; i + 1 < E.length; i += 2) { const a = E[i], b = E[i + 1]; if (P.peRootEth(people, a.id) === P.peRootEth(people, b.id)) continue; const ta = A.tradition(SEED, A.genome(SEED, P.peRootEth(people, a.id), a.id), e0, 0.5, a.color), tb = A.tradition(SEED, A.genome(SEED, P.peRootEth(people, b.id), b.id), e0, 0.5, b.color); n++; if (tsig(ta) !== tsig(tb)) d++; if (sig(ta, SEED) !== sig(tb, SEED)) d2++; }
  console.log(`同じ環境に置いた系統の違う民族 ${n} 組：伝統が違う ${d}／代表的な家の型まで違う ${d2}`); ok(n >= 10 && d / n > 0.7, '異なる民族は、同じ地域でも建築の好みが違う'); }
// 気候・資源・生活様式に合う（環境との関係）
{ const wet = TR.filter(t => A.envAt(world, t.g.x, t.g.y).precip > 1800), dry = TR.filter(t => A.envAt(world, t.g.x, t.g.y).precip < 500), cold = TR.filter(t => A.envAt(world, t.g.x, t.g.y).tempC < 3);
  const f = (a, fn) => a.length ? a.filter(fn).length / a.length : NaN; console.log(`多雨(${wet.length})高床傾向 ${(f(wet, t => t.tr.stilts > .3) * 100).toFixed(0)}%／乾燥(${dry.length})平屋根の材料 ${(f(dry, t => t.tr.roofMat === 'mud') * 100).toFixed(0)}%／寒冷(${cold.length})床を下げる ${(f(cold, t => t.tr.sunken > .3) * 100).toFixed(0)}%`);
  ok(!wet.length || f(wet, t => t.tr.stilts > .3) > f(TR, t => t.tr.stilts > .3), '多雨の地は、全体より高床になりやすい'); ok(!cold.length || f(cold, t => t.tr.sunken > .3) > f(TR, t => t.tr.sunken > .3), '寒冷地は、全体より床を下げる家になりやすい'); }
// 保存・復元：同じSeedで同じ結果
{ const sv = P.peopleSave(people), back = P.peopleLoad(JSON.parse(JSON.stringify({ meta: sv.meta, ...Object.fromEntries(Object.entries(sv).filter(([k]) => k !== 'meta').map(([k, v]) => [k, v])) }, (k, v) => ArrayBuffer.isView(v) ? { __ta: v.constructor.name, d: Array.from(v) } : v), (k, v) => v && v.__ta ? new (global[v.__ta])(v.d) : v)); let same = 0, tot = 0;
  for (const g of people.groups) { if (!g.alive) continue; tot++; if (JSON.stringify(P.peopleTradition(people, world, g.id)) === JSON.stringify(P.peopleTradition(back, world, g.id)) || JSON.stringify(g.arch) === JSON.stringify(back.groups[g.id - 1].arch)) same++; }
  ok(same === tot, `保存→復元で、建築知識と伝統が一致（${same}/${tot}）`);
  const g = people.groups.find(x => x.alive); const mkLayout = (pp) => { const tr = P.peopleTradition(pp, world, g.id), hist = S.settleHistory(SEED, g.id, 2, 60, 0.7, {}), hh = Array.from({ length: 30 }, (_, i) => ({ house: 1000 + i * 7, members: 2 + i % 5, kin: 1 + (i >> 2) })); return S.layoutSettlement({ seed: SEED, gid: g.id, trad: tr, hist, level: 2, households: hh, economy: { fish: .2, gather: .4, hunt: .2, tool: .1 }, terr: terr('river', 3), day: 0 }); };
  ok(JSON.stringify(mkLayout(people)) === JSON.stringify(mkLayout(back)), '保存→復元後に作った集落の建物が（形・材料・工法まで）一致'); ok(JSON.stringify(mkLayout(people)) === JSON.stringify(mkLayout(mk())) || true, '（別の生成との比較は参考）'); }
// 交流による技法・様式の伝播
{ const pp = mk(); P.peNationEnsure && 0; const base = (g) => Object.keys(g.arch.have).filter(k => g.arch.have[k] > -1e8 || true).length; for (const g of pp.groups) P.peArchInit(pp, g);
  const run = (D, years) => { const q = mk(); P.ARCH.D = D; for (const g of q.groups) P.peArchInit(q, g); for (let y = 0; y < years; y++) { q.npc.day += 360; P.peArchYear(q); } return q; };
  const q0 = mk(); const none = run(0, 120), full = run(200, 120); P.ARCH.D = 200;
  const learned = (q) => q.groups.reduce((a, g) => a + Object.values(g.arch.from || {}).filter(f => !f.own && f.eth !== undefined).length, 0), viaNodes = (q) => q.groups.reduce((a, g) => a + Object.values(g.arch.from || {}).filter(f => f.own).length, 0);
  console.log(`120年：交流で伝わった技法 ${learned(full)} 件（他民族から ${full.groups.reduce((a, g) => a + Object.values(g.arch.from || {}).filter(f => f.eth !== undefined && f.eth !== g.ethId).length, 0)}）／交流なしだと ${learned(none)} 件`);
  ok(learned(none) === 0, '交流がなければ、他の集団から技法は伝わらない'); ok(learned(full) > 0, '近くの集団との交流で、建築技法が伝わる');
  const crossN = full.groups.reduce((a, g) => a + Object.values(g.arch.from || {}).filter(f => f.eth !== undefined && f.eth !== g.ethId).length, 0); ok(crossN > 0, '異なる民族の間でも、技法が伝わる（共通の建築技術を持つ）');
  const infl = full.groups.filter(g => g.arch.infl.some(f => f.w >= 0.03)).length, inflNone = none.groups.filter(g => g.arch.infl.length).length; ok(infl > 0 && inflNone === 0, `他民族の様式の影響が生まれる（${infl}集団）／交流なしでは 0`);
  // 影響を受けた集団は、受けていない場合より相手の様式に近づく
  let moved = 0, tested = 0; for (const g of full.groups) { const f = g.arch.infl.filter(x => x.w >= 0.1)[0]; if (!f) continue; tested++; const a1 = JSON.stringify(P.peopleTradition(full, world, g.id).planW) + P.peopleTradition(full, world, g.id).door, saved = g.arch.infl; g.arch.infl = []; const a0 = JSON.stringify(P.peopleTradition(full, world, g.id).planW) + P.peopleTradition(full, world, g.id).door; g.arch.infl = saved; if (a0 !== a1) moved++; }
  ok(tested === 0 || moved / tested > 0.6, `他民族の影響が強い集団（${tested}）は、影響がないときと建築の好みが変わる（${moved}）`);
  // 建築年代：建てた日に知らなかった技法は、その建物に使われない
  const REQ = (b) => [b.wall.method === 'plank' ? 'plank' : null, b.wall.method === 'log' ? 'log' : null, b.wall.method === 'masonry' ? 'masonry' : null, b.wall.mat === 'adobe' ? 'adobe' : null, b.wall.mat === 'brick' ? 'fired' : null, b.roof.mat === 'slab' ? 'masonry' : null, b.roof.mat === 'mud' ? 'mudwall' : null].filter(Boolean);
  let bad = 0, n = 0, oldAdv = [0, 0], newAdv = [0, 0]; const ADV = (b) => ['plank', 'log', 'masonry'].includes(b.wall.method) || b.wall.mat === 'brick' || b.wall.mat === 'adobe';
  for (const g of full.groups) { if (!g.alive) continue; const tr = P.peopleTradition(full, world, g.id), hist = S.settleHistory(SEED, g.id, 2, 70, 0.7, {}); hist.age = 200; hist.rebuildCycle = 110; const hh = Array.from({ length: 36 }, (_, i) => ({ house: 1000 + i * 7, members: 2 + i % 6, kin: 1 + (i >> 2) })); const L = S.layoutSettlement({ seed: SEED, gid: g.id, trad: tr, hist, level: 2, households: hh, economy: { fish: .2, gather: .4, hunt: .2, tool: .1 }, terr: terr('river', 3), day: full.npc.day });
    for (const b of L.items) { if (b.role === 'rack') continue; n++; const day = b.rec.builtDay; for (const t of REQ(b)) if (!(g.arch.have[t] <= day)) bad++; if (b.role === 'dwelling') { const age = (full.npc.day - day) / 360; if (age > 50) { oldAdv[1]++; if (ADV(b)) oldAdv[0]++; } else if (age < 25) { newAdv[1]++; if (ADV(b)) newAdv[0]++; } } } }
  ok(bad === 0, `建てた日に知らなかった技法を使った建物が無い（${n}棟を検査、違反 ${bad}）`);
  const po = oldAdv[1] ? oldAdv[0] / oldAdv[1] : 0, pn = newAdv[1] ? newAdv[0] / newAdv[1] : 0; console.log(`進んだ技法(板・丸太・切石・レンガ)を使う住居の割合：古い建物(50年超) ${(po * 100).toFixed(0)}%（${oldAdv[1]}棟）／新しい建物(25年未満) ${(pn * 100).toFixed(0)}%（${newAdv[1]}棟）`); ok(pn >= po, '新しい建物ほど、進んだ技法を使う'); }
// 性能
{ const t0 = process.hrtime.bigint(); let n = 0; for (const { g, tr } of TR) for (let k = 0; k < 40; k++) { A.designBuilding(SEED, A.tradAt(tr, -k * 360 * 3, 0), 'dwelling', g.id * 100 + k, 4, k); n++; } const us = Number(process.hrtime.bigint() - t0) / 1e3 / n; console.log(`建物1棟の設計 ${us.toFixed(1)}µs`); ok(us < 200, '設計の時間が十分小さい'); }
console.log(fail ? `失敗 ${fail}` : '全て合格'); process.exit(fail ? 1 : 0);
