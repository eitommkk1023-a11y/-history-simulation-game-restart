/* World of History: 国の層（試作 v0）——民族を「集計の数字」で表し、1年ずつ進める。技術が、発明と伝わり（拡散）で広がる
 * 純粋な計算（画面・時計に触れない）。UMD：ブラウザでは WohNation、Node では module.exports。
 * 同じ Seed・同じ世界なら同じ結果（整数ハッシュのみ）。係数は［仮］。
 *
 * 個人ごとの計算（約9,000人で1年≒1秒）とは別に、民族ごとの集計（人口・技術・位置・文化）だけで毎年進める。
 * 1年の計算は、民族の数 × 近くの民族の数 × 技術の数（22）にほぼ比例する。
 */
(function (root) {
  'use strict';
  const T = typeof require !== 'undefined' ? require('./tech.js') : root.WohTech;
  const NODES = T.NODES, NN = NODES.length, IDX = T.NODE_IDX, CULT = T.CULT;
  // 速い整数ハッシュ（文字列を使わない）→ 0〜1
  const hm = (a, b, c, d) => { let h = (a ^ 0x9e3779b9) | 0; h = Math.imul(h ^ b, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h ^ c, 0xc2b2ae35); h ^= h >>> 16; h = Math.imul(h ^ d, 0x27d4eb2f); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
  // 前提の深さ（節の難しさ）：前提が深いほど、自然には生まれにくい
  const DEPTH = new Array(NN).fill(0);
  (function () { const d = (i) => { if (DEPTH[i]) return DEPTH[i]; const n = NODES[i]; let m = 0; for (const r of n.req) m = Math.max(m, d(IDX[r])); if (n.any) for (const r of n.any) m = Math.max(m, d(IDX[r]) - 1); return (DEPTH[i] = m + 1); }; for (let i = 0; i < NN; i++) d(i); })();
  const MIN_POP = NODES.map(n => n.minPop || 0);
  // 人口を支える力への技術の効き（掛け算）
  const CAP_MULT = { cultivate: 3.0, herd: 1.4, irrigate: 1.4, rotation: 1.3, iron: 1.1, steel: 1.05, state: 1.3, waterwheel: 1.1 };
  const K = { INVENT: 0.0004, DIFFUSE: 0.006, CONTACT_R: 450, NEIGH: 8, GROW: 0.012 };

  // ---------------------------------------------------------------- 作る
  // eths：[{ id, x, y, pop, cult:[8値] }]。world は、資源の近さ・肥沃さを見るために使う。opts.capacity：後から増える民族のための余裕（分裂・融合で増える）
  function create(world, seed, eths, opts) {
    opts = opts || {}; const n = eths.length, cap = Math.max(n, opts.capacity || n);
    const S = { seed: seed | 0, year: 0, n, cap, eths: eths.slice(), world, idx: new Map(),
      pop: new Float64Array(cap), cap0: new Float64Array(cap), capMult: new Float64Array(cap).fill(1),
      has: new Uint8Array(cap * NN), since: new Int32Array(cap * NN).fill(-1), from: new Int32Array(cap * NN).fill(-1),   // 取り入れた年・どの民族から伝わったか（-1＝自分で発明）
      variant: new Int16Array(cap * NN).fill(-1), loan: new Uint8Array(cap * NN),
      needF: new Float32Array(cap * NN), diffF: new Float32Array(cap * NN), open: new Float32Array(cap * NN), coast: new Uint8Array(cap),
      nbr: new Int32Array(cap * K.NEIGH).fill(-1), nbrD: new Float32Array(cap * K.NEIGH), cult: eths.map(e => e.cult), fert: new Float32Array(cap),
      firstYear: new Int32Array(NN).fill(-1), firstEth: new Int32Array(NN).fill(-1), log: [] };
    for (let i = 0; i < n; i++) { S.idx.set(eths[i].id, i); initRow(S, i, eths[i]); }
    // 近くの民族（近い順に最大 NEIGH 個）
    const cell = K.CONTACT_R, gx = new Map(), key = (x, y) => x * 100003 + y;
    for (let i = 0; i < n; i++) { const kx = Math.floor(eths[i].x / cell), ky = Math.floor(eths[i].y / cell), k = key(kx, ky); (gx.get(k) || gx.set(k, []).get(k)).push(i); }
    for (let i = 0; i < n; i++) {
      const kx = Math.floor(eths[i].x / cell), ky = Math.floor(eths[i].y / cell), cand = [];
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const L = gx.get(key(kx + a, ky + b)); if (!L) continue; for (const j of L) if (j !== i) { const dx = eths[j].x - eths[i].x, dy = eths[j].y - eths[i].y, d = Math.sqrt(dx * dx + dy * dy); if (d <= K.CONTACT_R) cand.push([d, j]); } }
      cand.sort((p, q) => p[0] - q[0]); for (let m = 0; m < Math.min(K.NEIGH, cand.length); m++) { S.nbr[i * K.NEIGH + m] = cand[m][1]; S.nbrD[i * K.NEIGH + m] = cand[m][0]; }
    }
    // はじまりの技術：どの民族も、はじめから持っている（前提が無く、必要な資源が近くにある物。時代の「出発点」）。農耕・牧畜・銅・首長制は、「発明される」ことで時代が動くので、はじめには持たない
    const NOT_AT_START = { cultivate: 1, herd: 1, copper: 1, chiefdom: 1 };
    if (opts.start !== false) for (let i = 0; i < n; i++) for (let k = 0; k < NN; k++) {
      if (DEPTH[k] !== 1 || NOT_AT_START[NODES[k].id] || S.needF[i * NN + k] < 1) continue;
      if (hm(S.seed, i, k, 7) < 0.9) adopt(S, i, k, -1, 0, -1);
    }
    // 開始時代：農耕が始まり、採集・狩猟・牧畜が併存している頃。栽培・牧畜は、始まった場所（必要な資源の近さ）と文化の開きしだいで、一部の民族だけが持つ
    if (opts.start !== false && opts.era !== 'none') for (let i = 0; i < n; i++) {
      const kc = IDX.cultivate, kh = IDX.herd;
      if (hm(S.seed, i, kc, 8) < S.needF[i * NN + kc] * S.open[i * NN + kc] * (opts.farmStart == null ? 1.6 : opts.farmStart)) adopt(S, i, kc, -1, 0, -1);
      if (hm(S.seed, i, kh, 8) < S.needF[i * NN + kh] * S.open[i * NN + kh] * (opts.herdStart == null ? 0.7 : opts.herdStart)) adopt(S, i, kh, -1, 0, -1);
    }
    return S;
  }
  // 1つの民族の、場所ごとの値（必要な資源の近さ・文化の開き・肥沃さ・人口の上限）
  function initRow(S, i, e) {
    const world = S.world, fert = world && world.resources && world.resources.grid ? world.resources.grid.fertility : null, g = world && world.resources && world.resources.grid;
    const pr = T.siteProfile(world, e.x, e.y, T.RADII, 1e9); S.coast[i] = pr.coast ? 1 : 0;
    let fv = 0.4; if (fert && g) { const st = g.step, w = g.w, cx = Math.floor(e.x / st), cy = Math.floor(e.y / st); let s = 0, c = 0; for (let j = Math.max(0, cy - 2); j <= Math.min(g.h - 1, cy + 2); j++) for (let ii = Math.max(0, cx - 2); ii <= Math.min(w - 1, cx + 2); ii++) { s += fert[j * w + ii]; c++; } fv = c ? s / c : 0.4; }
    S.fert[i] = fv; S.cult[i] = e.cult;
    for (let k = 0; k < NN; k++) {
      const f = NODES[k].need(pr); S.needF[i * NN + k] = f > 0 ? f : 0; S.open[i * NN + k] = Math.max(0, Math.min(1, NODES[k].adopt(e.cult)));
      S.diffF[i * NN + k] = S.needF[i * NN + k];
      // 作物・家畜は、伝わってくれば野生の群生地から遠くても育てられる（その土地の肥沃さ・草地しだい）
      if (NODES[k].id === 'cultivate') S.diffF[i * NN + k] = Math.max(0.1, Math.min(1, 0.15 + 1.6 * fv));
      if (NODES[k].id === 'herd') S.diffF[i * NN + k] = 0.8;
    }
    S.pop[i] = Math.max(10, e.pop || 10);
    S.cap0[i] = Math.max(S.pop[i] * 1.5, 120 + 900 * fv);
  }
  // 新しい民族（分裂・融合）：親の民族の技術・やり方を受け継ぐ。近くの民族は、場所から求める
  function spawn(S, e, parentId) {
    if (S.idx.has(e.id)) return S.idx.get(e.id);
    if (S.n >= S.cap) grow(S, Math.max(16, S.cap));
    const i = S.n++, p = S.idx.has(parentId) ? S.idx.get(parentId) : -1; S.eths[i] = e; S.idx.set(e.id, i); initRow(S, i, e);
    if (p >= 0) for (let k = 0; k < NN; k++) { const o = i * NN + k, q = p * NN + k; if (S.has[q]) { S.has[o] = 1; S.since[o] = S.since[q]; S.from[o] = p; S.variant[o] = S.variant[q]; S.loan[o] = S.loan[q]; } }
    if (p >= 0) S.capMult[i] = S.capMult[p];
    const cand = []; for (let j = 0; j < S.n; j++) if (j !== i) { const dx = S.eths[j].x - e.x, dy = S.eths[j].y - e.y, d = Math.sqrt(dx * dx + dy * dy); if (d <= K.CONTACT_R) cand.push([d, j]); }
    cand.sort((a, b) => a[0] - b[0]); for (let m = 0; m < Math.min(K.NEIGH, cand.length); m++) { S.nbr[i * K.NEIGH + m] = cand[m][1]; S.nbrD[i * K.NEIGH + m] = cand[m][0]; }
    return i;
  }
  function grow(S, extra) {
    const nc = S.cap + extra;
    for (const [k, per] of [['pop', 1], ['cap0', 1], ['capMult', 1], ['has', NN], ['since', NN], ['from', NN], ['variant', NN], ['loan', NN], ['needF', NN], ['diffF', NN], ['open', NN], ['coast', 1], ['nbr', K.NEIGH], ['nbrD', K.NEIGH], ['fert', 1]]) {
      const A = S[k], B = new A.constructor(nc * per); if (k === 'since' || k === 'from' || k === 'variant' || k === 'nbr') B.fill(-1); if (k === 'capMult') B.fill(1); B.set(A); S[k] = B;
    }
    S.cap = nc;
  }
  // 保存：動く部分だけ（場所から決まる値は読み込み時に作り直す）
  function save(S) {
    const n = S.n, cut = (A, per) => Array.from(A.subarray(0, n * per));
    return { seed: S.seed, year: S.year, n, eths: S.eths.slice(0, n).map(e => ({ id: e.id, x: e.x, y: e.y, pop: e.pop, cult: e.cult })), has: cut(S.has, NN), since: cut(S.since, NN), from: cut(S.from, NN), variant: cut(S.variant, NN), loan: cut(S.loan, NN), capMult: cut(S.capMult, 1), firstYear: Array.from(S.firstYear), firstEth: Array.from(S.firstEth), log: S.log.slice(-200) };
  }
  function load(world, sv) {
    const S = create(world, sv.seed, sv.eths, { start: false, capacity: Math.max(sv.n * 2, sv.n + 16) }), n = sv.n;
    S.year = sv.year; S.has.set(sv.has); S.since.set(sv.since); S.from.set(sv.from); S.variant.set(sv.variant); S.loan.set(sv.loan); S.capMult.set(sv.capMult);
    S.firstYear.set(sv.firstYear); S.firstEth.set(sv.firstEth); S.log = sv.log.slice(); return S;
  }
  function adoptNode(S, ethId, node, year) { const i = S.idx.get(ethId), k = IDX[node]; if (i === undefined || k === undefined || S.has[i * NN + k]) return false; adopt(S, i, k, -1, year == null ? S.year : year, -1); return true; }
  // 民族 id が、節 node を持っているか
  function hasNode(S, ethId, node) { const i = S.idx.get(ethId); return i !== undefined && !!S.has[i * NN + IDX[node]]; }
  function sinceNode(S, ethId, node) { const i = S.idx.get(ethId); return i === undefined ? -1 : S.since[i * NN + IDX[node]]; }

  function adopt(S, i, k, from, year, variantFrom) {
    const e = S.eths[i], n = NODES[k], o = i * NN + k;
    S.has[o] = 1; S.since[o] = year; S.from[o] = from;
    // やり方：伝わった場合は、元の民族と同じやり方を受け継ぐことが多い（作風の伝播）。自分で発明したら、この民族のやり方
    let v = -1; const vc = n.v;
    if (from >= 0 && S.variant[from * NN + k] >= 0 && hm(S.seed, i, k, year + 91) < 0.7) v = S.variant[from * NN + k];
    else v = Math.floor(hm(S.seed, e.id, k, 55) * 6);
    S.variant[o] = vc ? v : -1;
    S.loan[o] = from >= 0 && hm(S.seed, i, k, year + 17) < 0.5 ? 1 : 0;   // 名前も借りる（借用語）
    const m = CAP_MULT[n.id]; if (m) S.capMult[i] *= m;
    if (S.firstYear[k] < 0) { S.firstYear[k] = year; S.firstEth[k] = i; S.log.push({ year, node: n.id, eth: i, from }); }
  }

  // ---------------------------------------------------------------- 1年進める
  function step(S) {
    const year = ++S.year, n = S.n, seed = S.seed, NB = K.NEIGH;
    for (let i = 0; i < n; i++) {
      // 人口：ロジスティック（技術で上限が上がる）
      const cap = S.cap0[i] * S.capMult[i], p = S.pop[i]; S.pop[i] = Math.max(10, p + K.GROW * p * (1 - p / cap));
      const pop = S.pop[i], base = i * NN;
      for (let k = 0; k < NN; k++) {
        const o = base + k; if (S.has[o]) continue;
        const nd = NODES[k]; if (pop < MIN_POP[k]) continue;
        // 前提
        let ok = true; for (let r = 0; r < nd.req.length; r++) if (!S.has[base + IDX[nd.req[r]]]) { ok = false; break; }
        if (ok && nd.any) { ok = false; for (let r = 0; r < nd.any.length; r++) if (S.has[base + IDX[nd.any[r]]]) { ok = true; break; } }
        if (!ok) continue;
        const f = S.needF[o], fd = S.diffF[o]; if (f <= 0 && fd <= 0) continue;
        const open = S.open[o];
        // ① 自分で発明：資源が近いほど(f)、人口が多く、文化が開いているほど。前提が深いほど難しい
        if (f > 0 && hm(seed, year, i, k) < K.INVENT * f * open * Math.sqrt(pop / 100) / Math.pow(DEPTH[k], 1.5)) { adopt(S, i, k, -1, year, -1); continue; }
        // ② 近くの民族から伝わる：接触が近いほど、文化が開いているほど、必要な資源に手が届くほど
        let miss = 1, src = -1, best = 0;
        for (let m = 0; m < NB; m++) {
          const j = S.nbr[i * NB + m]; if (j < 0) break; if (!S.has[j * NN + k]) continue;
          const c = 1 - S.nbrD[i * NB + m] / K.CONTACT_R, pj = K.DIFFUSE * c * (0.3 + open) * fd * (1 + S.cult[i][CULT.EXOG]);
          miss *= 1 - pj; if (pj > best) { best = pj; src = j; }
        }
        if (src >= 0 && hm(seed, year, i, k + 1000) < 1 - miss) adopt(S, i, k, src, year, 0);
      }
    }
    return S;
  }
  function run(S, years) { for (let y = 0; y < years; y++) step(S); return S; }

  // ---------------------------------------------------------------- 見る
  function fractions(S) { const out = {}; for (let k = 0; k < NN; k++) { let c = 0; for (let i = 0; i < S.n; i++) c += S.has[i * NN + k]; out[NODES[k].id] = c / S.n; } return out; }
  function techCount(S, i) { let c = 0; for (let k = 0; k < NN; k++) c += S.has[i * NN + k]; return c; }
  // 署名（比較用）：取り入れた節と、そのやり方
  function signature(S, i) { const sig = []; for (let k = 0; k < NN; k++) sig.push(S.has[i * NN + k] ? 1 + (S.variant[i * NN + k] >= 0 ? S.variant[i * NN + k] % 7 : 0) : 0); return sig; }
  // 検証用：同じ世界の状態を、文字列に（決定性の確認）
  function digest(S) { let h = 2166136261; for (let i = 0; i < S.has.length; i++) h = Math.imul(h ^ (S.has[i] + (S.since[i] + 2) * 3 + (S.variant[i] + 2) * 7919), 16777619); for (let i = 0; i < S.n; i++) h = Math.imul(h ^ Math.round(S.pop[i]), 16777619); return h >>> 0; }
  function pearson(xs, ys) { const n = xs.length; if (n < 3) return NaN; let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; } mx /= n; my /= n; let sxy = 0, sx = 0, sy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sx += (xs[i] - mx) ** 2; sy += (ys[i] - my) ** 2; } return sx && sy ? sxy / Math.sqrt(sx * sy) : NaN; }
  // 広がりの波：伝わって取り入れた民族ごとに、いちばん近い発明者（自分で発明した民族）からの距離と、その発明者より何年遅れたかの相関
  function waveCorrelation(S, node) {
    const k = IDX[node], inv = []; for (let i = 0; i < S.n; i++) if (S.has[i * NN + k] && S.from[i * NN + k] < 0) inv.push(i);
    const xs = [], ys = []; if (!inv.length) return NaN;
    for (let j = 0; j < S.n; j++) { const o = j * NN + k; if (!S.has[o] || S.from[o] < 0) continue; let bi = -1, bd = 1e18; for (const i of inv) { const dx = S.eths[i].x - S.eths[j].x, dy = S.eths[i].y - S.eths[j].y, d = dx * dx + dy * dy; if (d < bd && S.since[i * NN + k] <= S.since[o]) { bd = d; bi = i; } } if (bi >= 0) { xs.push(Math.sqrt(bd)); ys.push(S.since[o] - S.since[bi * NN + k]); } }
    return pearson(xs, ys);
  }
  function origins(S, node) { const k = IDX[node]; let c = 0, a = 0; for (let i = 0; i < S.n; i++) if (S.has[i * NN + k]) { a++; if (S.from[i * NN + k] < 0) c++; } return { inventors: c, adopters: a }; }

  const api = { adoptNode, spawn, save, load, hasNode, sinceNode, origins, K, DEPTH, create, step, run, fractions, techCount, signature, digest, waveCorrelation, pearson, hm, NN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WohNation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
