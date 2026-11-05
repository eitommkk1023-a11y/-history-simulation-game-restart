/* World of History: 個人の採取と持ち物（縄文の暮らし v1）
 * 純粋なロジックだけを持つ（画面・時計・地形には触れない）。UMD：ブラウザでは WohForage、Node では module.exports。
 * 入れ物：state = { inv:{id:個数}, depl:{ "bx,by": {m, n} }, total:{id:累計} }
 * 乱数は呼び出し側から渡す（rng()→[0,1)）。同じ状況・同じ乱数なら同じ結果。係数は［仮］。
 */
(function (root) {
  'use strict';
  // kg：1個の重さ、kcal：1個の熱量（のちの調理・食事で使う）、raw：そのままでは食べられない（あく抜き・加熱が必要）
  const ITEMS = [
    { id: 'nut',      name: '木の実（ドングリ・クリ）', kg: 0.05, kcal: 60,  raw: true,  group: 'food' },
    { id: 'fruit',    name: '果実',                   kg: 0.08, kcal: 40,  group: 'food' },
    { id: 'bud',      name: '山菜・新芽',              kg: 0.05, kcal: 20,  group: 'food' },
    { id: 'root',     name: '根・球根',                kg: 0.15, kcal: 90,  raw: true,  group: 'food' },
    { id: 'seed',     name: '草の実',                  kg: 0.03, kcal: 35,  group: 'food' },
    { id: 'shell',    name: '貝',                     kg: 0.06, kcal: 25,  raw: true,  group: 'food' },
    { id: 'fish',     name: '魚',                     kg: 0.3,  kcal: 250, raw: true,  group: 'food' },
    { id: 'firewood', name: '薪',                     kg: 1.5,  kcal: 0,   group: 'material' },
    { id: 'stone',    name: '石',                     kg: 1.0,  kcal: 0,   group: 'material' },
    { id: 'fiber',    name: '繊維（草・つる）',         kg: 0.08, kcal: 0,   group: 'material' },
  ];
  const IDX = {}; ITEMS.forEach((it, i) => { IDX[it.id] = i; });
  const CARRY_KG = 25;           // 運べる重さの基本値［仮］
  const SPOT_CAP = 6;            // 1ブロック（約33m四方）・1か月に、豊かさ1の場所で採れる回数の目安［仮］

  function newState() { return { inv: {}, depl: {}, total: {}, seq: 0 }; }
  function weight(st) { let w = 0; for (const id in st.inv) if (IDX[id] != null) w += st.inv[id] * ITEMS[IDX[id]].kg; return w; }
  function count(st, id) { return st.inv[id] || 0; }

  // 場所の状況から、拾えるものの「豊かさ」を求める（0〜）
  // ctx：{ plant:[草,葉,新芽,木の実,果実]（0〜1ほど）, forest, grass（0〜1）, coast, water（真偽）, rock（0〜1）, month }
  function availability(ctx) {
    const p = ctx.plant || [0, 0, 0, 0, 0], f = ctx.forest || 0, g = ctx.grass || 0;
    const a = {
      nut: p[3] * 1.6,
      fruit: p[4] * 1.6,
      bud: p[2] * 1.4 + p[1] * 0.2,
      root: (g * 0.5 + f * 0.2) * Math.min(1, (p[0] + 0.25)) * 0.8,
      seed: p[0] * g * 1.1,
      shell: ctx.coast ? 1.0 : 0,
      fish: ctx.coast ? 0.45 : ctx.water ? 0.7 : 0,
      firewood: f * 1.3 + g * 0.05,
      stone: (ctx.rock || 0) * 1.2,
      fiber: p[0] * 0.5 + f * 0.25 + g * 0.5,
    };
    for (const k in a) a[k] = Math.max(0, a[k]);
    return a;
  }

  function key(bx, by) { return Math.floor(bx) + ',' + Math.floor(by); }
  // 採った分だけ減る。月が変わると戻る
  function spotLeft(st, bx, by, monthIdx) {
    const d = st.depl[key(bx, by)];
    if (!d || d.m !== monthIdx) return 1;
    return Math.max(0, 1 - d.n / SPOT_CAP);
  }
  function spotTake(st, bx, by, monthIdx, amount) {
    const k = key(bx, by), d = st.depl[k];
    if (!d || d.m !== monthIdx) st.depl[k] = { m: monthIdx, n: amount }; else d.n += amount;
  }
  // 古い記録を捨てる（保存を小さく保つ）
  function prune(st, monthIdx) { for (const k in st.depl) if (st.depl[k].m < monthIdx) delete st.depl[k]; }

  // 1回の採取。want を指定すると、その種類だけを探す（なければ、その場で一番多いものから抽選）
  // 返り値：{ ok, id?, n?, why?, items? }
  function gather(st, ctx, bx, by, monthIdx, rng, opt) {
    opt = opt || {};
    const skill = opt.skill == null ? 0.3 : opt.skill, cap = opt.carryKg || CARRY_KG;
    const av = availability(ctx), left = spotLeft(st, bx, by, monthIdx);
    let ids = Object.keys(av).filter(k => av[k] > 0.02 && (!opt.want || k === opt.want));
    if (opt.group) ids = ids.filter(k => ITEMS[IDX[k]].group === opt.group);
    if (!ids.length) return { ok: false, why: opt.want ? 'ここには' + ITEMS[IDX[opt.want]].name + 'が見当たらない' : '何も見つからない' };
    if (left <= 0.01) return { ok: false, why: 'この辺りは採り尽くした（来月また実る）' };
    // 抽選：豊かさに比例
    let tot = 0; for (const k of ids) tot += av[k];
    let r = rng() * tot, pick = ids[ids.length - 1];
    for (const k of ids) { r -= av[k]; if (r <= 0) { pick = k; break; } }
    // 見つかる確率：豊かさ・残り・腕前
    const chance = Math.min(0.97, (0.25 + 0.6 * Math.min(1, av[pick])) * (0.5 + 0.5 * left) * (0.8 + 0.4 * skill));
    if (rng() > chance) return { ok: false, why: '見つけられなかった' };
    const it = ITEMS[IDX[pick]];
    // 数：重い物は少なく、軽い物は多く。豊かさ・残り・腕前で増える
    const base = it.kg >= 1 ? 1 : it.kg >= 0.25 ? 1 + (rng() < 0.3 ? 1 : 0) : 3 + Math.floor(rng() * 4);
    let n = Math.max(1, Math.round(base * (0.6 + 0.4 * Math.min(1.5, av[pick])) * (0.7 + 0.6 * skill) * (0.4 + 0.6 * left)));
    const room = Math.floor((cap - weight(st)) / it.kg + 1e-9);
    if (room <= 0) return { ok: false, why: '持ちきれない（重さ ' + weight(st).toFixed(1) + '/' + cap + 'kg）' };
    if (n > room) n = room;
    st.inv[pick] = (st.inv[pick] || 0) + n;
    st.total[pick] = (st.total[pick] || 0) + n;
    spotTake(st, bx, by, monthIdx, 1);
    return { ok: true, id: pick, n, name: it.name };
  }

  function drop(st, id, n) {
    const have = st.inv[id] || 0, k = Math.min(have, n == null ? have : n);
    if (k <= 0) return 0;
    st.inv[id] = have - k; if (!st.inv[id]) delete st.inv[id];
    return k;
  }
  function list(st) {
    return ITEMS.filter(it => st.inv[it.id]).map(it => ({ id: it.id, name: it.name, n: st.inv[it.id], kg: st.inv[it.id] * it.kg, raw: !!it.raw }));
  }
  function save(st) { return JSON.parse(JSON.stringify(st)); }
  function load(o) {
    const st = newState();
    if (o && typeof o === 'object') {
      st.seq = Number.isFinite(o.seq) ? o.seq >>> 0 : 0;
      for (const id in (o.inv || {})) if (IDX[id] != null && o.inv[id] > 0) st.inv[id] = o.inv[id] | 0;
      for (const id in (o.total || {})) if (IDX[id] != null) st.total[id] = o.total[id] | 0;
      for (const k in (o.depl || {})) { const d = o.depl[k]; if (d && Number.isFinite(d.m) && Number.isFinite(d.n)) st.depl[k] = { m: d.m, n: d.n }; }
    }
    return st;
  }

  // 乱数：世界のSeedと、これまでの採取回数・日付から決まる（保存して読み込んでも同じ並びになる）
  function rngFor(st, seed, day) {
    let a = (seed ^ Math.imul(++st.seq, 2654435761) ^ Math.imul(day | 0, 374761393)) >>> 0;
    return function () { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  const api = { rngFor, ITEMS, IDX, CARRY_KG, SPOT_CAP, newState, weight, count, availability, spotLeft, gather, drop, list, save, load, prune };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WohForage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
