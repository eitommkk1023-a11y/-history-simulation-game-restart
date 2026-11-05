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
    // 加工したもの（水さらし・焼いた）：そのまま食べられる
    { id: 'nutL',     name: '水さらしした木の実',       kg: 0.05, kcal: 65,  group: 'food' },
    { id: 'nutC',     name: '焼いた木の実',            kg: 0.05, kcal: 80,  group: 'food' },
    { id: 'rootC',    name: '焼いた根',                kg: 0.14, kcal: 120, group: 'food' },
    { id: 'seedC',    name: '炒った草の実',            kg: 0.03, kcal: 45,  group: 'food' },
    { id: 'shellC',   name: '焼き貝',                  kg: 0.06, kcal: 35,  group: 'food' },
    { id: 'fishC',    name: '焼き魚',                  kg: 0.25, kcal: 280, group: 'food' },
  ];
  const IDX = {}; ITEMS.forEach((it, i) => { IDX[it.id] = i; });
  const CARRY_KG = 25;           // 運べる重さの基本値［仮］
  const SPOT_CAP = 6;            // 1ブロック（約33m四方）・1か月に、豊かさ1の場所で採れる回数の目安［仮］

  // 体と暮らしの状態：kcal＝おなかの蓄え、t＝最後に時間を反映した日、sickUntil＝体調不良が続く日、fire＝焚き火、soak＝水にさらした木の実
  const KCAL_MAX = 3000, KCAL_DAY = 2000, KCAL_START = 2200;
  function newState() { return { inv: {}, depl: {}, total: {}, seq: 0, kcal: KCAL_START, t: 0, sickUntil: 0, fire: null, soak: null }; }
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
    const chance = Math.min(0.97, (0.25 + 0.6 * Math.min(1, av[pick])) * (0.5 + 0.5 * left) * (0.8 + 0.4 * skill) * (opt.vigor == null ? 1 : opt.vigor));
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

  // ---------------------------------------------------------------- 食べる・火・調理
  // 時間：day は日数（ゲームの時計）。時計が進んだ分だけおなかが減る
  function tick(st, day) {
    if (day < st.t) { st.t = day; return; }           // 時計が戻った（別の記録を読み込んだ等）
    const d = day - st.t; if (d > 0) { st.kcal = Math.max(0, st.kcal - d * KCAL_DAY); st.t = day; }
  }
  function hunger(st) {
    const k = st.kcal;
    return k > 1800 ? { id: 'full', name: '満腹', vigor: 1 } : k > 900 ? { id: 'ok', name: '普通', vigor: 1 } : k > 250 ? { id: 'hungry', name: '空腹', vigor: 0.85 } : { id: 'starving', name: '飢え', vigor: 0.6 };
  }
  function sick(st, day) { return day < st.sickUntil; }
  // 採取に効く元気さ（空腹・体調不良で下がる）
  function vigor(st, day) { return hunger(st).vigor * (sick(st, day) ? 0.75 : 1); }

  // 生で食べたときの扱い：kcal の割合、体調を崩す確率。木の実（ドングリ）は渋くてそのままでは食べられない
  const RAW = { nut: null, root: { f: 0.5, bad: 0.3 }, shell: { f: 0.6, bad: 0.4 }, fish: { f: 0.6, bad: 0.4 } };
  const EAT_FULL = 3000;
  // 食べる：1個ずつ。返り値 { ok, why?, kcal?, sick? }
  function eat(st, id, rng, day) {
    const it = ITEMS[IDX[id]]; if (!it || it.group !== 'food') return { ok: false, why: '食べ物ではない' };
    if (!(st.inv[id] > 0)) return { ok: false, why: '持っていない' };
    if (st.kcal >= EAT_FULL - 1) return { ok: false, why: 'もう食べられない（満腹）' };
    let f = 1, bad = 0;
    if (it.raw) { const r = RAW[id]; if (!r) return { ok: false, why: it.name + 'は渋くてそのままでは食べられない（水にさらして焼く）' }; f = r.f; bad = r.bad; }
    const gain = it.kcal * f;
    st.kcal = Math.min(EAT_FULL, st.kcal + gain);
    drop(st, id, 1);
    let ill = false;
    if (bad && rng() < bad) { st.sickUntil = Math.max(st.sickUntil, day + 2); ill = true; }
    return { ok: true, name: it.name, kcal: Math.round(gain), sick: ill };
  }

  // 焚き火：薪2と繊維1（火口）を使う。失敗すると繊維だけ失う
  const FIRE_WOOD = 2, WOOD_DAYS = 0.75, FIRE_RANGE = 2;
  function fireActive(st, bx, by, day) { const f = st.fire; return !!f && day < f.until && Math.abs(f.bx - bx) <= FIRE_RANGE && Math.abs(f.by - by) <= FIRE_RANGE; }
  function fireLeft(st, day) { return st.fire && day < st.fire.until ? st.fire.until - day : 0; }
  function makeFire(st, bx, by, day, skill, rng, wet) {
    if (st.fire && day < st.fire.until && Math.abs(st.fire.bx - bx) <= FIRE_RANGE && Math.abs(st.fire.by - by) <= FIRE_RANGE) return { ok: false, why: 'ここにはもう火がある' };
    if ((st.inv.firewood || 0) < FIRE_WOOD) return { ok: false, why: '薪が足りない（薪' + FIRE_WOOD + '本）' };
    if (!(st.inv.fiber > 0)) return { ok: false, why: '火口になる繊維がない' };
    drop(st, 'fiber', 1);
    const p = Math.max(0.2, 0.6 + 0.3 * (skill == null ? 0.3 : skill) - (wet ? 0.25 : 0));
    if (rng() > p) return { ok: false, why: '火がつかなかった（繊維を1つ失った）' + (wet ? '。水辺は湿っている。少し離れてみよう' : '') };
    drop(st, 'firewood', FIRE_WOOD);
    st.fire = { bx: Math.floor(bx), by: Math.floor(by), until: day + FIRE_WOOD * WOOD_DAYS };
    return { ok: true, days: FIRE_WOOD * WOOD_DAYS };
  }
  function stoke(st, bx, by, day) {
    if (!fireActive(st, bx, by, day)) return { ok: false, why: '近くに火がない' };
    if (!(st.inv.firewood > 0)) return { ok: false, why: '薪がない' };
    drop(st, 'firewood', 1); st.fire.until += WOOD_DAYS; return { ok: true, days: fireLeft(st, day) };
  }

  // 焼く：火のそばで、持っている物を一度にまとめて焼く
  const ROAST = { fish: 'fishC', shell: 'shellC', root: 'rootC', seed: 'seedC', nutL: 'nutC' };
  function roast(st, bx, by, day) {
    if (!fireActive(st, bx, by, day)) return { ok: false, why: '火のそばでしか焼けない' };
    const made = {}; let n = 0;
    for (const raw in ROAST) { const c = st.inv[raw] || 0; if (c > 0) { const k = Math.min(c, 30 - n); if (k <= 0) break; drop(st, raw, k); st.inv[ROAST[raw]] = (st.inv[ROAST[raw]] || 0) + k; made[ROAST[raw]] = k; n += k; } }
    if (!n) return { ok: false, why: '焼ける物がない（魚・貝・根・草の実・水さらしした木の実）' };
    // 焼くには火の勢いを少し使う
    st.fire.until = Math.max(day, st.fire.until - 0.1 - n * 0.01);
    return { ok: true, made, n };
  }

  // 水さらし：川や湖のそばで木の実を水にさらす（2日）。同じ場所に戻って受け取る
  const SOAK_DAYS = 2, SOAK_MAX = 60;
  function soakStart(st, bx, by, day, freshWater) {
    if (!freshWater) return { ok: false, why: '真水（川や湖）のそばでしか、水にさらせない' };
    if (st.soak) return { ok: false, why: 'すでに水にさらしている（' + (day >= st.soak.ready ? '受け取れる' : 'あと' + Math.ceil(st.soak.ready - day) + '日') + '）' };
    const c = st.inv.nut || 0; if (c <= 0) return { ok: false, why: '木の実を持っていない' };
    const k = Math.min(c, SOAK_MAX); drop(st, 'nut', k);
    st.soak = { bx: Math.floor(bx), by: Math.floor(by), n: k, ready: day + SOAK_DAYS };
    return { ok: true, n: k, ready: st.soak.ready };
  }
  function soakCollect(st, bx, by, day) {
    const k = st.soak; if (!k) return { ok: false, why: '水にさらしている物がない' };
    if (Math.abs(k.bx - bx) > FIRE_RANGE || Math.abs(k.by - by) > FIRE_RANGE) return { ok: false, why: '水にさらした場所に戻らないと受け取れない（' + k.bx + ', ' + k.by + ' 付近）' };
    if (day < k.ready) return { ok: false, why: 'まだ早い（あと' + Math.ceil(k.ready - day) + '日）' };
    const room = Math.floor((CARRY_KG - weight(st)) / ITEMS[IDX.nutL].kg + 1e-9), n = Math.min(k.n, Math.max(0, room));
    if (n <= 0) return { ok: false, why: '持ちきれない' };
    st.inv.nutL = (st.inv.nutL || 0) + n; st.total.nutL = (st.total.nutL || 0) + n; k.n -= n; if (k.n <= 0) st.soak = null;
    return { ok: true, n };
  }

  function save(st) { return JSON.parse(JSON.stringify(st)); }
  function load(o) {
    const st = newState();
    if (o && typeof o === 'object') {
      st.seq = Number.isFinite(o.seq) ? o.seq >>> 0 : 0;
      if (Number.isFinite(o.kcal)) st.kcal = Math.max(0, Math.min(KCAL_MAX, o.kcal));
      if (Number.isFinite(o.t)) st.t = o.t; if (Number.isFinite(o.sickUntil)) st.sickUntil = o.sickUntil;
      const f = o.fire; if (f && Number.isFinite(f.bx) && Number.isFinite(f.by) && Number.isFinite(f.until)) st.fire = { bx: f.bx, by: f.by, until: f.until };
      const k = o.soak; if (k && Number.isFinite(k.bx) && Number.isFinite(k.by) && Number.isFinite(k.n) && Number.isFinite(k.ready) && k.n > 0) st.soak = { bx: k.bx, by: k.by, n: k.n | 0, ready: k.ready };
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

  const api = { tick, hunger, sick, vigor, eat, makeFire, stoke, fireActive, fireLeft, roast, soakStart, soakCollect, KCAL_MAX, KCAL_DAY, RAW, ROAST, rngFor, ITEMS, IDX, CARRY_KG, SPOT_CAP, newState, weight, count, availability, spotLeft, gather, drop, list, save, load, prune };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WohForage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
