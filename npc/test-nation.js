'use strict';
// 国の層（技術の拡散）の検証：node npc/test-nation.js <generator.js> <world1.bin> <world2.bin> ...
const v8 = require('v8'), fs = require('fs'), path = require('path');
const T = require('./tech.js'), N = require('./nation.js'), P = require('./people-core.js');
let ok = 0, ng = 0; const t = (name, cond, extra) => { if (cond) ok++; else { ng++; console.log('NG', name, extra == null ? '' : extra); } };
const YEARS = 3000, SNAP = [0, 250, 500, 1000, 2000, 3000];
if (process.argv.length < 4) { console.log('使い方: node npc/test-nation.js <generator.js> <world.bin> ...'); process.exit(0); }
const G = require(path.resolve(process.argv[2])), files = process.argv.slice(3);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const worlds = [];
for (const f of files) {
  const world = v8.deserialize(fs.readFileSync(f)), env = world.fauna.env, cc = world.climate.cell, plantFood = (c, m, o) => G.faunaPlantFood(env, cc, c, m, o, 0, 0);
  const FA = { faunaHunt: G.faunaHunt, faunaDensity: G.faunaDensity, ANIMAL_SPECIES: G.ANIMAL_SPECIES }, fauna = G.faunaClone(world.fauna);
  const people = P.peopleGenerate(42, { world, plantFood, fauna, FA });
  const byEth = new Map(); for (const g of people.groups) { if (!g.alive) continue; const e = byEth.get(g.ethId) || { pop: 0, best: g }; e.pop += g.pop || 0; if ((g.pop || 0) > (e.best.pop || 0)) e.best = g; byEth.set(g.ethId, e); }
  const eths = []; for (const [id, e] of byEth) { const c = P.peCampCenter(e.best); eths.push({ id, x: c.x, y: c.y, pop: e.pop, cult: e.best.cult, lang: people.ethnicities[id - 1].langId }); }
  worlds.push({ name: path.basename(f), world, eths });
}
console.log('世界ごとの、技術の広がり（民族の割合）');
const results = [];
for (const W of worlds) {
  const S = N.create(W.world, 1234, W.eths), snaps = {}; let ms = 0;
  snaps[0] = N.fractions(S);
  for (let y = 1; y <= YEARS; y++) { const t0 = process.hrtime.bigint(); N.step(S); ms += Number(process.hrtime.bigint() - t0) / 1e6; if (SNAP.includes(y)) snaps[y] = N.fractions(S); }
  results.push({ W, S, snaps, msPerYear: ms / YEARS });
  const pct = (y, id) => (snaps[y][id] * 100).toFixed(0).padStart(3) + '%';
  console.log(` ${W.name}（民族${S.n}・${YEARS}年・1年あたり ${(ms / YEARS).toFixed(2)}ms）`);
  console.log('   年     栽培   牧畜   銅    青銅   鉄    灌漑  文字  国家  外洋船');
  for (const y of SNAP) console.log('   ' + String(y).padStart(4) + '  ' + ['cultivate', 'herd', 'copper', 'bronze', 'iron', 'irrigate', 'script', 'state', 'seafaring'].map(id => pct(y, id)).join('  '));
  const firsts = ['cultivate', 'herd', 'copper', 'bronze', 'iron'].map(id => { const k = T.NODE_IDX[id], f = S.firstEth[k]; return f < 0 ? id + '＝なし' : id + '＝' + S.firstYear[k] + '年(' + Math.round(S.eths[f].x) + ',' + Math.round(S.eths[f].y) + ')'; });
  console.log('   最初の発明：' + firsts.join(' ／ '));
  const corr = ['cultivate', 'herd', 'iron'].map(id => { const c = N.waveCorrelation(S, id), og = N.origins(S, id); return id + ' 相関' + (isNaN(c) ? '-' : c.toFixed(2)) + '（発明' + og.inventors + '・伝わり' + (og.adopters - og.inventors) + '）'; });
  console.log('   広がりの波（最も近い発明者からの距離と、遅れた年の相関）：' + corr.join(' ／ '));
  const nt = []; for (let i = 0; i < S.n; i++) nt.push(N.techCount(S, i)); nt.sort((a, b) => a - b);
  console.log('   民族あたりの技術：最小' + nt[0] + ' 中央' + nt[nt.length >> 1] + ' 最大' + nt[nt.length - 1]);
}
// 検証
for (const r of results) {
  const S = r.S;
  // 前提の順序：取り入れた節の前提は、同じ民族が先に（同じ年か前に）持っている
  let badReq = 0; for (let i = 0; i < S.n; i++) for (let k = 0; k < N.NN; k++) if (S.has[i * N.NN + k]) for (const q of T.NODES[k].req) { const o = i * N.NN + T.NODE_IDX[q]; if (!S.has[o] || S.since[o] > S.since[i * N.NN + k]) badReq++; }
  t('前提の順序が守られる（' + r.W.name + '）', badReq === 0, badReq);
  t('人口は上限を超えない', Array.from(S.pop).every((p, i) => p <= S.cap[i] * S.capMult[i] * 1.001 + 1));
  t('1年あたりの計算：民族100で5ms以下（' + r.W.name + '）', r.msPerYear <= 5, r.msPerYear);
  const c = N.waveCorrelation(S, 'cultivate'), og = N.origins(S, 'cultivate');
  if (og.adopters - og.inventors >= 10) t('農耕は、最も近い発明者から離れるほど遅れて広がる（相関0.1以上）（' + r.W.name + '）', c >= 0.1, c);
  // 世界の違い：最初の農耕の場所と年
}
// 決定性
{ const W = worlds[0], a = N.run(N.create(W.world, 99, W.eths), 800), b = N.run(N.create(W.world, 99, W.eths), 800), c = N.run(N.create(W.world, 100, W.eths), 800); t('決定性：同じSeedは同じ結果', N.digest(a) === N.digest(b)); t('Seedが違えば結果が違う', N.digest(a) !== N.digest(c)); }
// 世界ごとに違う：最初の農耕・鉄の場所と年
{ const sig = results.map(r => ['cultivate', 'iron'].map(id => { const k = T.NODE_IDX[id]; return r.S.firstYear[k] + '@' + r.S.firstEth[k]; }).join('/')); console.log('世界ごとの最初の発明（年@民族）：' + sig.join(' | ')); t('世界ごとに、最初の農耕と鉄の場所・年が違う', new Set(sig).size === sig.length, sig.join(' ')); }
// 世界間の違い（拡散後）：各民族の署名の、別の世界の最も近い民族との違い（静的な試作の同じ指標）
{ const mat = []; for (let i = 0; i < results.length; i++) for (let j = 0; j < results.length; j++) if (i !== j) { let s = 0; for (let a = 0; a < results[i].S.n; a++) { let m = 1e9; const sa = N.signature(results[i].S, a); for (let b = 0; b < results[j].S.n; b++) m = Math.min(m, T.hamming(sa, N.signature(results[j].S, b))); s += m; } mat.push(s / results[i].S.n); }
  const mn = Math.min(...mat); console.log('世界間の距離（3000年後）：平均' + mean(mat).toFixed(2) + '／最小' + mn.toFixed(2)); t('3000年後の世界間の距離（最小）が1以上', mn >= 1, mn); }
// 規模：民族数を増やしたときの1年の計算（合成：世界の中のランダムな位置）
{ const W = worlds[0]; const rnd = (i, k) => N.hm(7, i, k, 3); const sizes = [300, 1000, 3000]; console.log('規模を増やしたときの1年あたりの計算（合成の民族・500年の平均）');
  for (const nEth of sizes) { const eths = []; for (let i = 0; i < nEth; i++) eths.push({ id: i + 1, x: 50 + rnd(i, 1) * (W.world.stats.width - 100), y: 50 + rnd(i, 2) * (W.world.stats.height - 100), pop: 40 + rnd(i, 3) * 200, cult: Array.from({ length: 8 }, (_, d) => rnd(i, 10 + d)), lang: i });
    const t0 = Date.now(), S = N.create(W.world, 5, eths), tc = Date.now() - t0; const t1 = process.hrtime.bigint(); N.run(S, 500); const ms = Number(process.hrtime.bigint() - t1) / 1e6 / 500;
    console.log(`  民族${nEth}: 作る ${tc}ms ／ 1年あたり ${ms.toFixed(2)}ms`); if (nEth === 1000) t('民族1000でも1年あたり50ms以下', ms <= 50, ms); if (nEth === 3000) t('民族3000でも1年あたり100ms以下', ms <= 100, ms); } }
console.log(ng ? 'FAIL ' + ng + ' / ' + (ok + ng) : 'OK ' + ok + ' 件通過'); process.exit(ng ? 1 : 0);
