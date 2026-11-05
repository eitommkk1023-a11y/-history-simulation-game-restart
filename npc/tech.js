/* World of History: 技術の生成（試作 v0）——「能力」の組み合わせで、世界ごと・民族ごとに技術を決める
 * 純粋な計算（画面・時計に触れない）。UMD：ブラウザでは WohTech、Node では module.exports。
 * 同じ Seed・同じ世界なら同じ結果（整数ハッシュのみ）。係数は［仮］。
 *
 * 考え方：技術＝「何ができるか」の節（ノード）。ノードが開くかは
 *   ① 世界の資源（鉱床・野生の穀物・動物・川・海・粘土・石・木）がその民族の周りにあるか（feasible）
 *   ② 前提のノードを持っているか
 *   ③ 文化（年長者の尊重・合議性など）と運で、実際に取り入れるか（adopted）
 * で決まる。名前・やり方（バリアント）は、Seed・民族・ノードから生成する（同じ「青銅」でも、世界ごと・民族ごとに違う）。
 */
(function (root) {
  'use strict';
  const H = (...a) => { let h = 2166136261; for (const v of a) { const s = String(v); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); h = Math.imul(h ^ 0x9e37, 16777619); } return h >>> 0; };
  const U = (...a) => H(...a) / 4294967296;

  // 文化の値の並び（people-core の CULT_NAMES と同じ）
  const CULT = { EXOG: 0, MATRI: 1, ELDER: 2, HEREDITY: 3, COUNCIL: 4, PATRI: 5, ADULT: 6, DRIFT: 7 };

  // バリアントの選択肢（やり方）。w は、文化の値（0〜1）から決まる重み
  const V = {
    crop: null,       // 作物は、周りにある野生の穀物から決まる
    herd: null,       // 家畜は、周りにいる動物から決まる
    cast: [['鋳型', c => 1], ['蝋型', c => 0.4 + c[CULT.ELDER]], ['鍛造', c => 0.4 + c[CULT.PATRI]]],
    hull: [['丸木', c => 1], ['樹皮', c => 0.5], ['組み板', c => 0.4 + c[CULT.COUNCIL]]],
    mark: [['縄の結び', c => 0.6 + c[CULT.MATRI]], ['刻み目', c => 1], ['粘土の印', c => 0.5 + c[CULT.COUNCIL]]],
    wheel: [['円盤', c => 1], ['輻', c => 0.5 + c[CULT.EXOG]]],
    fort: [['土塁', c => 1], ['石垣', c => 0.6 + c[CULT.HEREDITY]], ['柵', c => 0.6 + c[CULT.COUNCIL]]],
  };

  // ノード：id・名前の種（日本語の説明）・軸・前提・開く条件 need(profile)・取り入れやすさ adopt(culture)（0〜1）・バリアント種別
  // 資源の近さ：近い(R0以内)＝1、中距離(R1以内・交易で手に入る)＝0.6、遠い(R2以内・技術が伝わってくる)＝0.3、届かない＝0
  const REACH = [1, 0.6, 0.3];
  const rd = (p, kind) => { const t = p.tier[kind]; return t == null || t < 0 ? 0 : REACH[t]; };
  const both = (a, b) => Math.min(a, b);
  const NODES = [
    // 食料
    { id: 'cultivate', ax: 'food', jp: '栽培', req: [], need: p => rd(p, 'grain'), adopt: c => 0.55 + 0.25 * c[CULT.EXOG] - 0.15 * c[CULT.ELDER], v: 'crop' },
    { id: 'irrigate', ax: 'food', jp: '灌漑', req: ['cultivate'], need: p => p.river ? 1 : 0, adopt: c => 0.35 + 0.3 * c[CULT.COUNCIL] },
    { id: 'rotation', ax: 'food', jp: '輪作', req: ['cultivate'], need: p => p.grains.length >= 2 ? 1 : 0, adopt: c => 0.3 + 0.3 * c[CULT.EXOG] },
    { id: 'herd', ax: 'food', jp: '牧畜', req: [], need: p => rd(p, 'herd'), adopt: c => 0.5 + 0.2 * c[CULT.PATRI], v: 'herd' },
    // 素材
    { id: 'pottery', ax: 'material', jp: '土器', req: [], need: p => p.clay > 0.15 ? 1 : 0, adopt: c => 0.9 },
    { id: 'copper', ax: 'material', jp: '銅', req: [], need: p => rd(p, 'copper'), adopt: c => 0.55 + 0.2 * c[CULT.EXOG] - 0.15 * c[CULT.ELDER] },
    { id: 'bronze', ax: 'material', jp: '青銅', req: ['copper', 'pottery'], need: p => rd(p, 'tin'), adopt: c => 0.45 + 0.25 * c[CULT.EXOG] - 0.1 * c[CULT.ELDER], v: 'cast' },
    { id: 'iron', ax: 'material', jp: '鉄', req: ['pottery'], need: p => both(rd(p, 'iron'), Math.max(rd(p, 'coal'), p.wood > 0.45 ? 1 : 0)), adopt: c => 0.4 + 0.25 * c[CULT.EXOG] - 0.1 * c[CULT.ELDER], v: 'cast' },
    { id: 'steel', ax: 'material', jp: '鋼', req: ['iron'], need: p => rd(p, 'coal'), adopt: c => 0.35 + 0.2 * c[CULT.COUNCIL] },
    { id: 'goldwork', ax: 'material', jp: '金銀細工', req: ['pottery'], need: p => Math.max(rd(p, 'gold'), rd(p, 'silver')), adopt: c => 0.5 + 0.3 * c[CULT.HEREDITY] },
    // エネルギー・輸送
    { id: 'waterwheel', ax: 'energy', jp: '水車', req: ['cultivate'], need: p => p.river ? 1 : 0, adopt: c => 0.3 + 0.3 * c[CULT.COUNCIL] },
    { id: 'draft', ax: 'energy', jp: '牽引', req: ['herd'], need: p => p.herds.some(h => h === 'aurochs' || h === 'boar') ? 1 : 0, adopt: c => 0.5 },
    { id: 'dugout', ax: 'transport', jp: '舟', req: [], need: p => (p.river || p.coast) && p.wood > 0.2 ? 1 : 0, adopt: c => 0.7, v: 'hull' },
    { id: 'seafaring', ax: 'transport', jp: '外洋船', req: ['dugout'], need: p => p.coast ? 1 : 0, adopt: c => 0.35 + 0.35 * c[CULT.EXOG] },
    { id: 'cart', ax: 'transport', jp: '車', req: ['draft'], need: p => p.wood > 0.25 ? 1 : 0, adopt: c => 0.45, v: 'wheel' },
    // 記録・組織
    { id: 'tally', ax: 'record', jp: '記録（刻み）', req: [], need: p => p.stone > 0.1 || p.clay > 0.1 ? 1 : 0, adopt: c => 0.7, v: 'mark' },
    { id: 'script', minPop: 250, ax: 'record', jp: '文字', req: ['tally', 'cultivate'], need: p => p.pop >= 250 ? 1 : 0, adopt: c => 0.3 + 0.3 * c[CULT.COUNCIL] + 0.15 * c[CULT.ELDER] },
    { id: 'chiefdom', minPop: 150, ax: 'organize', jp: '首長制', req: [], need: p => p.pop >= 150 ? 1 : 0, adopt: c => 0.6 + 0.2 * c[CULT.HEREDITY] },
    { id: 'state', minPop: 600, ax: 'organize', jp: '国家', req: ['chiefdom', 'cultivate', 'tally'], need: p => p.pop >= 600 ? 1 : 0, adopt: c => 0.3 + 0.3 * c[CULT.HEREDITY] + 0.2 * c[CULT.COUNCIL] },
    // 軍事
    { id: 'bow', ax: 'military', jp: '弓', req: [], need: p => p.wood > 0.15 ? 1 : 0, adopt: c => 0.8 },
    { id: 'metalarms', ax: 'military', jp: '金属武器', req: ['chiefdom'], need: p => 1, adopt: c => 0.6 + 0.2 * c[CULT.PATRI], any: ['bronze', 'iron'] },
    { id: 'fort', ax: 'military', jp: '城塞', req: ['state'], need: p => p.stone > 0.2 || p.wood > 0.4 ? 1 : 0, adopt: c => 0.5 + 0.2 * c[CULT.HEREDITY], v: 'fort' },
  ];
  const NODE_IDX = {}; NODES.forEach((n, i) => { NODE_IDX[n.id] = i; });

  // ---------------------------------------------------------------- 場所の資源の見取り図
  const DOMESTIC = ['aurochs', 'sheep', 'boar'];
  // world.resources.grid の各配列を、拠点の周り（R ブロック）で平均する。0〜1ほど
  function cellMean(world, name, x, y, R) {
    const g = world.resources.grid, arr = g[name]; if (!arr) return 0;
    const st = g.step, w = g.w, h = g.h, cx = Math.floor(x / st), cy = Math.floor(y / st), r = Math.max(1, Math.round(R / st));
    let s = 0, n = 0; for (let j = Math.max(0, cy - r); j <= Math.min(h - 1, cy + r); j++) for (let i = Math.max(0, cx - r); i <= Math.min(w - 1, cx + r); i++) { s += arr[j * w + i]; n++; }
    return n ? s / n : 0;
  }
  // 家畜にできる動物のいる気候格子のセル（重複なし）を、世界ごとに1回だけ集める
  const HERD_CACHE = new WeakMap();
  function herdCells(world) {
    let h = HERD_CACHE.get(world); if (h) return h; h = {}; const gw = world.climate.cell.gridW;
    for (const sid of DOMESTIC) { const S = world.fauna.species[sid]; if (!S) continue; const seen = new Set(), arr = []; for (const p of S.pops) { if (p.alive === false) continue; for (const c of p.cells) if (!seen.has(c)) { seen.add(c); arr.push(c % gw, Math.floor(c / gw)); } } h[sid] = arr; }
    HERD_CACHE.set(world, h); return h;
  }
  // R＝[近い, 中距離, 遠い]（ブロック）。各資源が、どの段階の距離に最初に現れるか（tier：0＝近い、1＝中距離、2＝遠い、-1＝無い）
  const RADII = [40, 150, 400];
  function siteProfile(world, x, y, R, pop) {
    const R3 = Array.isArray(R) ? R : RADII, prof = { pop: pop || 0, tier: {}, grains: [], herds: [], river: false, coast: false, clay: 0, stone: 0, wood: 0 };
    const upd = (kind, d2) => { for (let t = 0; t < 3; t++) if (d2 <= R3[t] * R3[t]) { if (prof.tier[kind] == null || prof.tier[kind] > t) prof.tier[kind] = t; return; } };
    // 鉱床は、鉱山まで出かける・鉱石を交易で手に入れる前提で、手が届く範囲を広めにとる
    const DR = [R3[0] * 1.75, R3[1] * 1.33, R3[2] * 1.12], updD = (kind, d2) => { for (let t = 0; t < 3; t++) if (d2 <= DR[t] * DR[t]) { if (prof.tier[kind] == null || prof.tier[kind] > t) prof.tier[kind] = t; return; } };
    for (const d of world.resources.deposits) { if (d.grade < 0.3) continue; const dx = d.x - x, dy = d.y - y; updD(d.kind, dx * dx + dy * dy); }
    for (const wp of world.resources.wild) { if (wp.kind !== 'plant' || wp.use !== '穀物') continue; for (const c of wp.centers) { const dx = c.x - x, dy = c.y - y, d2 = dx * dx + dy * dy; upd('grain', d2); if (d2 <= R3[1] * R3[1] && !prof.grains.includes(wp.id)) prof.grains.push(wp.id); } }
    // 作れる穀物が近くに無くても、遠くから伝わってきた場合は、いちばん近い穀物を使う
    if (!prof.grains.length) { let best = null, bd = 1e18; for (const wp of world.resources.wild) { if (wp.kind !== 'plant' || wp.use !== '穀物') continue; for (const c of wp.centers) { const dx = c.x - x, dy = c.y - y, d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = wp.id; } } } if (best && bd <= R3[2] * R3[2]) prof.grains.push(best); }
    const cc = world.climate.cell, st = cc.gridStep, gw = cc.gridW, cx = Math.floor(x / st), cy = Math.floor(y / st), HC = herdCells(world);
    for (const sid of DOMESTIC) { const cells = HC[sid]; if (!cells) continue; for (let k = 0; k < cells.length; k += 2) { const dx = (cells[k] - cx) * st, dy = (cells[k + 1] - cy) * st, d2 = dx * dx + dy * dy; upd('herd', d2); if (d2 <= R3[1] * R3[1] && !prof.herds.includes(sid)) prof.herds.push(sid); } }
    if (!prof.herds.length) { let best = null, bd = 1e18; for (const sid of DOMESTIC) { const cells = HC[sid]; if (!cells) continue; for (let k = 0; k < cells.length; k += 2) { const dx = (cells[k] - cx) * st, dy = (cells[k + 1] - cy) * st, d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = sid; } } } if (best && bd <= R3[2] * R3[2]) prof.herds.push(best); }
    const P = world.riverPts, W = world.stats.width, rr = R3[0] * R3[0] * 0.25; if (P) for (let k = 0; k + 2 < P.length; k += 3) { const dx = P[k] - x, dy = P[k + 1] - y; if (dx * dx + dy * dy <= rr) { prof.river = true; break; } }
    for (let a = 0; a < 8 && !prof.coast; a++) for (const f of [0.5, 1]) { const ax = Math.round(x + R3[0] * f * Math.cos(a * Math.PI / 4)), ay = Math.round(y + R3[0] * f * Math.sin(a * Math.PI / 4)); if (ax >= 0 && ay >= 0 && ax < W && ay < world.stats.height && world.type[ay * W + ax] === 0) { prof.coast = true; break; } }
    prof.clay = cellMean(world, 'clay', x, y, R3[0]); prof.stone = cellMean(world, 'stone', x, y, R3[0]); prof.wood = cellMean(world, 'wood', x, y, R3[0]);
    return prof;
  }

  // ---------------------------------------------------------------- 名前（試作：民族と世界から決まる、仮の音の並び）
  const SYL = ['ka', 'ki', 'ku', 'ke', 'ko', 'sa', 'shi', 'su', 'se', 'so', 'ta', 'chi', 'tsu', 'te', 'to', 'na', 'ni', 'nu', 'ne', 'no', 'ha', 'hi', 'fu', 'he', 'ho', 'ma', 'mi', 'mu', 'me', 'mo', 'ya', 'yu', 'yo', 'ra', 'ri', 'ru', 're', 'ro', 'wa', 'n'];
  function techName(seed, ethId, nodeId, lang) { const n = 2 + (H(seed, ethId, nodeId, 'n') % 2); let s = ''; for (let i = 0; i < n; i++) s += SYL[H(seed, lang == null ? ethId : lang, nodeId, i) % SYL.length]; return s; }

  // ---------------------------------------------------------------- 1つの民族（拠点）の技術
  // site：{ eth, x, y, pop, cult:[8値 0〜1], lang? }。R：資源に手が届く範囲（ブロック）。交易で届く範囲は reach 倍
  function ethTech(world, seed, site, opts) {
    opts = opts || {}; const pr = siteProfile(world, site.x, site.y, opts.R || RADII, site.pop), cult = site.cult;
    const feasible = new Set(), adopted = new Set(), variants = {}, names = {};
    for (let pass = 0; pass < 6; pass++) for (const n of NODES) {          // 前提が段階的に開く
      if (adopted.has(n.id)) continue;
      const reqOk = n.req.every(r => adopted.has(r)) && (!n.any || n.any.some(r => adopted.has(r)));
      if (!reqOk) continue;
      const f = n.need(pr); if (!(f > 0)) continue; feasible.add(n.id);
      const p = Math.max(0.01, Math.min(0.98, n.adopt(cult) * f * (opts.boost || 1)));   // boost＝時間がたつほど取り入れが進む（1＝はじめ）
      if (U(seed, site.eth, n.id, 'adopt') < p) {
        adopted.add(n.id);
        names[n.id] = techName(seed, site.eth, n.id, site.lang);
        if (n.v === 'crop') variants[n.id] = pr.grains[H(seed, site.eth, n.id, 'v') % pr.grains.length];
        else if (n.v === 'herd') variants[n.id] = pr.herds[H(seed, site.eth, n.id, 'v') % pr.herds.length];
        else if (n.v && V[n.v]) { const L = V[n.v].map(([id, f]) => [id, Math.max(0.05, f(cult))]); let tot = 0; for (const [, w] of L) tot += w; let r = U(seed, site.eth, n.id, 'v') * tot, pick = L[0][0]; for (const [id, w] of L) { r -= w; if (r <= 0) { pick = id; break; } } variants[n.id] = pick; }
      }
    }
    return { profile: pr, feasible: [...feasible], adopted: [...adopted], variants, names };
  }

  // ---------------------------------------------------------------- 比較の指標：民族の「署名」（取り入れた技術 ＋ そのやり方）
  function signature(t) { const sig = []; for (const n of NODES) { sig.push(t.adopted.includes(n.id) ? 1 + (H(t.variants[n.id] || '', n.id) % 7) : 0); } return sig; }
  function hamming(a, b) { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; }
  // 世界Aの各民族から見た、世界Bの「いちばん近い民族」との違いの平均（0＝同じ文化が現れている）
  function worldDistance(A, B) { let s = 0; for (const a of A) { let m = 1e9; for (const b of B) m = Math.min(m, hamming(a, b)); s += m; } return s / A.length; }
  function withinDiversity(A) { let s = 0, n = 0; for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) { s += hamming(A[i], A[j]); n++; } return n ? s / n : 0; }

  const api = { H, U, RADII, REACH, NODES, NODE_IDX, CULT, siteProfile, ethTech, signature, hamming, worldDistance, withinDiversity, techName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WohTech = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
