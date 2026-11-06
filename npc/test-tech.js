'use strict';
// 技術の生成の検証：node npc/test-tech.js <generator.js> <world1.bin> <world2.bin> ...   （世界を2つ以上）
// ・同じ世界なら同じ結果（決定性）  ・資源が無ければ技術に届かない  ・世界が違えば文化が違う（世界間の距離）  ・世界の中でも民族ごとに違う
const v8 = require('v8'), fs = require('fs'), path = require('path');
const T = require('./tech.js'), P = require('./people-core.js');
let ok = 0, ng = 0; const t = (name, cond, extra) => { if (cond) ok++; else { ng++; console.log('NG', name, extra == null ? '' : extra); } };

// ---------------------------------------------------------------- 1. 資源が無ければ届かない（小さな作り物の世界）
{
  const mkWorld = (dep, wild, herds, river) => ({
    stats: { width: 100, height: 100 }, type: new Uint8Array(100 * 100).fill(1),
    resources: { deposits: dep, wild, grid: { step: 10, w: 10, h: 10, clay: new Float32Array(100).fill(0.5), stone: new Float32Array(100).fill(0.5), wood: new Float32Array(100).fill(0.6) } },
    climate: { cell: { gridStep: 10, gridW: 10, gridH: 10 } },
    fauna: { species: Object.fromEntries(herds.map(h => [h, { pops: [{ alive: true, cells: [55] }] }])) },
    riverPts: river ? new Float32Array([50, 50, 1]) : new Float32Array(0),
  });
  const cult = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
  const dep = (kind, n) => Array.from({ length: n }, () => ({ kind, x: 50, y: 50, grade: 0.8 }));
  const wild = [{ id: 'wheat', kind: 'plant', use: '穀物', centers: [{ x: 50, y: 50 }] }];
  const run = (w, seed, eth) => T.ethTech(w, seed, { eth, x: 50, y: 50, pop: 800, cult, lang: eth }, { R: [40, 150, 400] });
  // 全員が必ず取り入れるように、取り入れやすさの影響を除いて「届くか（feasible）」だけを見る
  const none = run(mkWorld([], [], [], false), 1, 1);
  t('資源なし：栽培も銅も届かない', !none.feasible.includes('cultivate') && !none.feasible.includes('copper') && !none.feasible.includes('bronze') && !none.feasible.includes('iron'), JSON.stringify(none.feasible));
  const cu = run(mkWorld(dep('copper', 2), wild, ['sheep'], true), 1, 1);
  t('銅だけあれば、銅には届くが青銅には届かない', cu.feasible.includes('copper') && !cu.feasible.includes('bronze'), JSON.stringify(cu.feasible));
  const both = Array.from({ length: 30 }, (_, i) => run(mkWorld([...dep('copper', 2), ...dep('tin', 1)], wild, ['sheep'], true), 1, i + 1));
  t('銅と錫があれば、取り入れた民族の一部が青銅に届く', both.some(b => b.adopted.includes('bronze')) && both.every(b => !b.adopted.includes('bronze') || b.adopted.includes('copper')), String(both.filter(b => b.adopted.includes('bronze')).length));
  t('前提：銅を取り入れなければ青銅は無い', both.every(b => !b.adopted.includes('bronze') || (b.adopted.includes('copper') && b.adopted.includes('pottery'))));
  const ir = Array.from({ length: 30 }, (_, i) => run(mkWorld([...dep('iron', 2), ...dep('coal', 1)], wild, [], false), 1, i + 1));
  t('鉄と石炭があれば鉄・鋼に届く（取り入れは確率）', ir.some(b => b.adopted.includes('iron')) && ir.some(b => b.adopted.includes('steel')) && ir.every(b => !b.adopted.includes('steel') || b.adopted.includes('iron')));
  const nr = run(mkWorld([], wild, [], false), 1, 1); t('川が無いと灌漑・水車に届かない', !nr.feasible.includes('irrigate') && !nr.feasible.includes('waterwheel'));
  const small = T.ethTech(mkWorld([], wild, [], true), 1, { eth: 1, x: 50, y: 50, pop: 40, cult, lang: 1 }, { R: [40, 150, 400] }); t('人口が少ないと首長制・文字・国家に届かない', !small.feasible.includes('chiefdom') && !small.feasible.includes('script') && !small.feasible.includes('state'));
  // 決定性
  const a = JSON.stringify(run(mkWorld(dep('copper', 2), wild, ['sheep'], true), 5, 3)), b = JSON.stringify(run(mkWorld(dep('copper', 2), wild, ['sheep'], true), 5, 3)); t('決定性：同じ入力は同じ結果', a === b);
  const c = JSON.stringify(run(mkWorld(dep('copper', 2), wild, ['sheep'], true), 6, 3)); t('Seed が違えば結果が違う（名前・取り入れ）', a !== c);
  // 名前
  t('名前：同じ民族・ノードは同じ、民族が違えば違う', T.techName(1, 2, 'bronze') === T.techName(1, 2, 'bronze') && T.techName(1, 2, 'bronze') !== T.techName(1, 3, 'bronze') && T.techName(1, 2, 'bronze') !== T.techName(2, 2, 'bronze'));
  // 文化で取り入れやすさが変わる（年長者の尊重が高いと、新しい技術に慎重）
  const adoptRate = (cu8) => { let n = 0; for (let i = 1; i <= 400; i++) if (T.ethTech(mkWorld(dep('copper', 2), wild, [], true), 9, { eth: i, x: 50, y: 50, pop: 800, cult: cu8, lang: i }, { R: [40, 150, 400] }).adopted.includes('copper')) n++; return n / 400; };
  t('年長者の尊重が高いと、銅を取り入れにくい', adoptRate([0.5, 0.5, 1, 0.5, 0.5, 0.5, 0.5, 0.5]) < adoptRate([0.5, 0.5, 0, 0.5, 0.5, 0.5, 0.5, 0.5]));
  t('外婚性が高いと、銅を取り入れやすい', adoptRate([1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]) > adoptRate([0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]));
}

// ---------------------------------------------------------------- 2. 実際の世界で：世界間の距離・世界内の多様さ
if (process.argv.length >= 5) {
  const G = require(path.resolve(process.argv[2])), files = process.argv.slice(3);
  const out = [];
  for (const f of files) {
    const world = v8.deserialize(fs.readFileSync(f)), env = world.fauna.env, cc = world.climate.cell, plantFood = (c, m, o) => G.faunaPlantFood(env, cc, c, m, o, 0, 0);
    const FA = { faunaHunt: G.faunaHunt, faunaDensity: G.faunaDensity, ANIMAL_SPECIES: G.ANIMAL_SPECIES }, fauna = G.faunaClone(world.fauna);
    const people = P.peopleGenerate(42, { world, plantFood, fauna, FA });
    // 民族ごと：いちばん大きい集団の位置・文化。人口は民族の合計
    const byEth = new Map(); for (const g of people.groups) { if (!g.alive) continue; const e = byEth.get(g.ethId) || { pop: 0, best: g }; e.pop += g.pop || 0; if ((g.pop || 0) > (e.best.pop || 0)) e.best = g; byEth.set(g.ethId, e); }
    const byBoost = {};
    for (const boost of [1, 3, 8]) {
      const techs = [], t0 = Date.now();
      for (const [id, e] of byEth) { const g = e.best, c = P.peCampCenter(g); techs.push(T.ethTech(world, 1234, { eth: id, x: c.x, y: c.y, pop: e.pop, cult: g.cult, lang: people.ethnicities[id - 1].langId }, { boost })); }
      byBoost[boost] = { techs, sigs: techs.map(T.signature), ms: Date.now() - t0 };
    }
    const techs = byBoost[1].techs, ms = byBoost[1].ms, sigs = byBoost[1].sigs;
    out.push({ f: path.basename(f), techs, sigs, ms, n: techs.length, byBoost, deposits: world.resources.deposits.length });
  }
  console.log('世界ごとの技術（民族数・民族あたりの計算時間）');
  for (const o of out) {
    const frac = (id) => (o.techs.filter(x => x.adopted.includes(id)).length / o.n * 100).toFixed(0) + '%';
    console.log(` ${o.f}: 民族${o.n} ／ 計算 ${o.ms}ms（${(o.ms / o.n).toFixed(1)}ms/民族） ／ 栽培 ${frac('cultivate')} 牧畜 ${frac('herd')} 灌漑 ${frac('irrigate')} 銅 ${frac('copper')} 青銅 ${frac('bronze')} 鉄 ${frac('iron')} 鋼 ${frac('steel')} 文字 ${frac('script')} 国家 ${frac('state')} 舟 ${frac('dugout')} 外洋船 ${frac('seafaring')} 城塞 ${frac('fort')}`);
    const crops = {}; for (const x of o.techs) { const c = x.variants.cultivate; if (c) crops[c] = (crops[c] || 0) + 1; } console.log('   主な作物：' + Object.entries(crops).map(([k, v]) => k + v).join(' '));
  }
  // 世界内の多様さ（民族同士の署名の違い。0なら全員同じ）
  console.log('世界の中の多様さ（民族の組の平均の違い／全' + T.NODES.length + '項目）');
  for (const o of out) { const d = T.withinDiversity(o.sigs); console.log(' ' + o.f + ': ' + d.toFixed(2)); t('世界の中でも民族ごとに技術が違う（' + o.f + '）', d >= 2, d); }
  // 世界間の距離（Aの民族から見た、Bの最も近い民族との違いの平均。0なら同じ文化がある）。取り入れの段階（boost）ごと
  for (const boost of [1, 3, 8]) {
    const ds = [], within = []; for (let i = 0; i < out.length; i++) { within.push(T.withinDiversity(out[i].byBoost[boost].sigs)); for (let j = 0; j < out.length; j++) if (i !== j) ds.push(T.worldDistance(out[i].byBoost[boost].sigs, out[j].byBoost[boost].sigs)); }
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const nodesAvg = mean(out.flatMap(o => o.byBoost[boost].techs.map(x => x.adopted.length)));
    console.log(`取り入れの段階×${boost}：民族あたりの技術 平均${nodesAvg.toFixed(1)}個／世界内の違い ${mean(within).toFixed(2)}／世界間の距離 平均${mean(ds).toFixed(2)}（最小${Math.min(...ds).toFixed(2)}）`);
    out.forEach(o => { o.dist = o.dist || {}; });
    if (boost === 3) { t('進んだ段階：世界間の距離（最小）が1以上（実測 1.53）', Math.min(...ds) >= 1, Math.min(...ds)); }
    if (boost === 8) { t('さらに進んだ段階：世界間の距離（最小）が1.5以上（実測 1.87）', Math.min(...ds) >= 1.5, Math.min(...ds)); }
    t('世界の中でも民族ごとに違う（段階×' + boost + '）', mean(within) >= 2, mean(within));
  }
}
console.log(ng ? 'FAIL ' + ng + ' / ' + (ok + ng) : 'OK ' + ok + ' 件通過'); process.exit(ng ? 1 : 0);
