/* World of History: 個人の採取と持ち物（縄文の暮らし v1）
 * 純粋なロジックだけを持つ（画面・時計・地形には触れない）。UMD：ブラウザでは WohForage、Node では module.exports。
 * 入れ物：state = { inv:{id:個数}, depl:{ "bx,by": {m, n} }, total:{id:累計} }
 * 乱数は呼び出し側から渡す（rng()→[0,1)）。同じ状況・同じ乱数なら同じ結果。係数は［仮］。
 */
(function (root) {
  'use strict';
  // bulk：かさ（採れる数・1枠に積める数の目安。重さは使わない）、kcal：1個の熱量（のちの調理・食事で使う）、raw：そのままでは食べられない（あく抜き・加熱が必要）
  const ITEMS = [
    { id: 'nut',      name: '木の実（ドングリ・クリ）', bulk: 0.05, kcal: 60,  raw: true,  group: 'food' },
    { id: 'fruit',    name: '果実',                   bulk: 0.08, kcal: 40,  group: 'food' },
    { id: 'bud',      name: '山菜・新芽',              bulk: 0.05, kcal: 20,  group: 'food' },
    { id: 'root',     name: '根・球根',                bulk: 0.15, kcal: 90,  raw: true,  group: 'food' },
    { id: 'seed',     name: '草の実',                  bulk: 0.03, kcal: 35,  group: 'food' },
    { id: 'shell',    name: '貝',                     bulk: 0.06, kcal: 25,  raw: true,  group: 'food' },
    { id: 'fish',     name: '魚',                     bulk: 0.3,  kcal: 250, raw: true,  group: 'food' },
    { id: 'firewood', name: '薪',                     bulk: 1.5,  kcal: 0,   group: 'material' },
    { id: 'stone',    name: '石',                     bulk: 1.0,  kcal: 0,   group: 'material' },
    { id: 'fiber',    name: '繊維（草・つる）',         bulk: 0.08, kcal: 0,   group: 'material' },
    { id: 'clay',     name: '粘土',                   bulk: 0.5,  kcal: 0,   group: 'material' },
    { id: 'rope',     name: '縄',                     bulk: 0.1,  kcal: 0,   group: 'material' },
    // 道具（使うほど傷み、やがて壊れる）
    { id: 'knife',    name: '石のナイフ',              bulk: 0.3,  kcal: 0,   group: 'tool' },
    { id: 'axe',      name: '石斧',                   bulk: 1.2,  kcal: 0,   group: 'tool' },
    { id: 'net',      name: '魚網',                   bulk: 0.8,  kcal: 0,   group: 'tool' },
    { id: 'pot',      name: '土器',                   bulk: 2.0,  kcal: 0,   group: 'tool' },
    // 加工したもの（水さらし・焼いた・煮た）：そのまま食べられる
    { id: 'nutL',     name: '水さらしした木の実',       bulk: 0.05, kcal: 65,  group: 'food' },
    { id: 'nutC',     name: '焼いた木の実',            bulk: 0.05, kcal: 80,  group: 'food' },
    { id: 'rootC',    name: '焼いた根',                bulk: 0.14, kcal: 120, group: 'food' },
    { id: 'seedC',    name: '炒った草の実',            bulk: 0.03, kcal: 45,  group: 'food' },
    { id: 'shellC',   name: '焼き貝',                  bulk: 0.06, kcal: 35,  group: 'food' },
    { id: 'fishC',    name: '焼き魚',                  bulk: 0.25, kcal: 280, group: 'food' },
    { id: 'stew',     name: '煮物',                    bulk: 0.4,  kcal: 260, group: 'food' },
  ];
  const IDX = {}; ITEMS.forEach((it, i) => { IDX[it.id] = i; });
  // 持ち物の上限は「枠」の数（重さは使わない）。1つの枠に積める数は、かさで決まる［仮］
  const SLOTS = 20;
  function stackOf(it) { return it.group === 'tool' ? 3 : it.bulk >= 1 ? 10 : it.bulk >= 0.25 ? 20 : 40; }
  function slotsOf(inv, except) { let n = 0; for (const id in inv) if (id !== except && IDX[id] != null && inv[id] > 0) n += Math.ceil(inv[id] / stackOf(ITEMS[IDX[id]])); return n; }
  function slotsUsed(st, except) { return slotsOf(st.inv, except); }
  // その品物を、あと何個持てるか
  function roomFor(st, id, slots) {
    const it = ITEMS[IDX[id]], st1 = stackOf(it), free = (slots || SLOTS) - slotsUsed(st, id);
    return Math.max(0, free * st1 - (st.inv[id] || 0));
  }
  const FULL_MSG = '持ち物がいっぱいで持てない';
  const SPOT_CAP = 6;            // 1ブロック（約33m四方）・1か月に、豊かさ1の場所で採れる回数の目安［仮］

  // 体と暮らしの状態：kcal＝おなかの蓄え、t＝最後に時間を反映した日、sickUntil＝体調不良が続く日、fire＝焚き火、soak＝水にさらした木の実
  const KCAL_MAX = 3000, KCAL_DAY = 2000, KCAL_START = 2200;
  function newState() { return { inv: {}, depl: {}, total: {}, wear: {}, home: null, store: {}, n: {}, hp: 100, sp: 100, water: 80, exhausted: false, standing: 0, given: 0, rationAt: -99, lessons: {}, talkDay: {}, seq: 0, kcal: KCAL_START, t: 0, sickUntil: 0, fire: null, soak: null }; }
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
      clay: ctx.water ? 0.9 : ctx.coast ? 0.25 : 0,
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
    const skill = opt.skill == null ? 0.3 : opt.skill, slots = opt.slots || SLOTS;
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
    const has = (id) => (st.inv[id] || 0) > 0;
    const netBoost = pick === 'fish' && has('net') ? 1.6 : 1;
    const chance = Math.min(0.97, (0.25 + 0.6 * Math.min(1, av[pick])) * (0.5 + 0.5 * left) * (0.8 + 0.4 * skill) * (opt.vigor == null ? 1 : opt.vigor) * netBoost);
    if (rng() > chance) return { ok: false, why: '見つけられなかった' };
    const it = ITEMS[IDX[pick]];
    // 数：重い物は少なく、軽い物は多く。豊かさ・残り・腕前で増える
    const base = it.bulk >= 1 ? 1 : it.bulk >= 0.25 ? 1 + (rng() < 0.3 ? 1 : 0) : 3 + Math.floor(rng() * 4);
    let n = Math.max(1, Math.round(base * (0.6 + 0.4 * Math.min(1.5, av[pick])) * (0.7 + 0.6 * skill) * (0.4 + 0.6 * left)));
    // 道具の効き目：斧→薪が2倍、網→魚が2倍、ナイフ→根・繊維・貝・新芽が3割増
    let used = null;
    if (pick === 'firewood' && has('axe')) { n *= 2; used = 'axe'; }
    else if (pick === 'fish' && has('net')) { n *= 2; used = 'net'; }
    else if ((pick === 'root' || pick === 'fiber' || pick === 'shell' || pick === 'bud') && has('knife')) { n = Math.ceil(n * 1.3); used = 'knife'; }
    const room = roomFor(st, pick, slots);
    if (room <= 0) return { ok: false, why: FULL_MSG + '（' + slotsUsed(st) + '/' + slots + '枠）' };
    if (n > room) n = room;
    st.inv[pick] = (st.inv[pick] || 0) + n;
    st.total[pick] = (st.total[pick] || 0) + n;
    spotTake(st, bx, by, monthIdx, 1);
    const broke = used ? wearTool(st, used) : null;
    return { ok: true, id: pick, n, name: it.name, broke };
  }

  function drop(st, id, n) {
    const have = st.inv[id] || 0, k = Math.min(have, n == null ? have : n);
    if (k <= 0) return 0;
    st.inv[id] = have - k; if (!st.inv[id]) delete st.inv[id];
    return k;
  }
  function list(st) {
    return ITEMS.filter(it => st.inv[it.id]).map(it => ({ id: it.id, name: it.name, n: st.inv[it.id], bulk: st.inv[it.id] * it.bulk, raw: !!it.raw }));
  }

  // ---------------------------------------------------------------- 体力・スタミナ・水分
  function rest(st, hp) { st.hp = Math.min(HP_MAX, (st.hp == null ? 100 : st.hp) + hp); st.sp = staminaCap(st); st.exhausted = false; }
  // スタミナの上限：体力が低い・喉が渇いている・飢えていると下がる
  function staminaCap(st) {
    const hp = st.hp == null ? 100 : st.hp, wt = st.water == null ? 80 : st.water;
    return Math.max(10, SP_MAX * (0.55 + 0.45 * hp / HP_MAX) * (wt < 15 ? 0.6 : 1) * (st.kcal < 250 ? 0.6 : 1));
  }
  // 実時間で動く：ダッシュ中は減り、休むと戻る。尽きたら、25まで戻るまでダッシュできない
  const SP_DASH = 6, SP_REST = 7, SP_WALK = 2, SP_RECOVER = 25;
  function staminaStep(st, dt, mv) {
    mv = mv || {}; if (st.sp == null) st.sp = SP_MAX;
    const cap = staminaCap(st), dash = !!(mv.sprinting && mv.moving && !st.exhausted);
    if (dash) { st.sp -= SP_DASH * dt; st.water = Math.max(0, (st.water == null ? 80 : st.water) - 0.25 * dt); }
    else st.sp += (mv.moving ? SP_WALK : SP_REST) * dt;
    if (st.sp > cap) st.sp = cap;
    if (st.sp <= 0) { st.sp = 0; st.exhausted = true; } else if (st.exhausted && st.sp >= SP_RECOVER) st.exhausted = false;
    return { lockSprint: !!st.exhausted || (st.hp != null && st.hp <= 10), lockJump: st.sp < JUMP_COST };
  }
  const JUMP_COST = 8;
  function jumpCost(st) { st.sp = Math.max(0, (st.sp == null ? SP_MAX : st.sp) - JUMP_COST); if (st.sp <= 0) st.exhausted = true; }
  // 水を飲む：川や湖のそば（真水）で。海の水は飲めない
  function drink(st, freshWater) {
    if (!freshWater) return { ok: false, why: '飲める水がない（川や湖のそばで。海の水は飲めない）' };
    const w = st.water == null ? 80 : st.water; if (w >= 98) return { ok: false, why: 'いまは喉が渇いていない' };
    st.water = Math.min(WATER_MAX, w + 45); bump(st, 'drink'); return { ok: true, gain: Math.round(st.water - w) };
  }
  function vitalsInfo(st) {
    const hp = st.hp == null ? 100 : st.hp, sp = st.sp == null ? 100 : st.sp, wt = st.water == null ? 80 : st.water;
    return { hp, sp, water: wt, food: 100 * st.kcal / KCAL_MAX, spCap: staminaCap(st), exhausted: !!st.exhausted, dying: hp <= 10, thirsty: wt < 25 };
  }

  // ---------------------------------------------------------------- 食べる・火・調理
  const HP_MAX = 100, SP_MAX = 100, WATER_MAX = 100, WATER_DAY = 30;
  // 周りの様子（気温・屋根や火のそばか）。画面側が毎回設定する（保存しない）
  function setEnv(st, e) { st.env = e && Number.isFinite(e.temp) ? { temp: e.temp, sheltered: !!e.sheltered } : null; }
  // 時間：day は日数（ゲームの時計）。時計が進んだ分だけおなかが減る
  function tick(st, day) {
    if (day < st.t) { st.t = day; return; }           // 時計が戻った（別の記録を読み込んだ等）
    const d = day - st.t;
    if (d > 0) {
      st.kcal = Math.max(0, st.kcal - d * KCAL_DAY); st.standing = Math.max(0, (st.standing || 0) - d * 0.04); st.t = day;
      st.water = Math.max(0, (st.water == null ? 80 : st.water) - d * WATER_DAY);
      // 体力：飢え・渇き・病気・寒さで減り、満たされていれば少しずつ戻る
      const env = st.env || {}, cold = env.temp != null && env.temp < 0 && !env.sheltered ? Math.min(8, -env.temp * 0.4) : 0;
      const loss = (st.water <= 0 ? 12 : 0) + (st.kcal <= 0 ? 8 : 0) + (day < st.sickUntil ? 3 : 0) + cold;
      const regen = loss === 0 && st.kcal > 900 && st.water > 30 ? 5 : 0;
      st.hp = Math.max(1, Math.min(HP_MAX, (st.hp == null ? 100 : st.hp) + (regen - loss) * Math.min(d, 30)));
    }
  }
  function hunger(st) {
    const k = st.kcal;
    return k > 1800 ? { id: 'full', name: '満腹', vigor: 1 } : k > 900 ? { id: 'ok', name: '普通', vigor: 1 } : k > 250 ? { id: 'hungry', name: '空腹', vigor: 0.85 } : { id: 'starving', name: '飢え', vigor: 0.6 };
  }
  function sick(st, day) { return day < st.sickUntil; }
  // 採取に効く元気さ（空腹・体調不良で下がる）
  function vigor(st, day) { const hp = st.hp == null ? 100 : st.hp, wt = st.water == null ? 80 : st.water; return hunger(st).vigor * (sick(st, day) ? 0.75 : 1) * (hp < 10 ? 0.5 : hp < 30 ? 0.7 : 1) * (wt < 15 ? 0.85 : 1); }

  // 生で食べたときの扱い：kcal の割合、体調を崩す確率。木の実（ドングリ）は渋くてそのままでは食べられない
  const RAW = { nut: null, root: { f: 0.5, bad: 0.3 }, shell: { f: 0.6, bad: 0.4 }, fish: { f: 0.6, bad: 0.4 } };
  const EAT_FULL = 3000;
  const WATER_GAIN = { fruit: 8, bud: 4, shell: 2, stew: 18, shellC: 2 };      // 食べ物からとれる水分
  // 食べる：1個ずつ。返り値 { ok, why?, kcal?, sick? }
  function eat(st, id, rng, day) {
    const it = ITEMS[IDX[id]]; if (!it || it.group !== 'food') return { ok: false, why: '食べ物ではない' };
    if (!(st.inv[id] > 0)) return { ok: false, why: '持っていない' };
    if (st.kcal >= EAT_FULL - 1) return { ok: false, why: 'もう食べられない（満腹）' };
    let f = 1, bad = 0;
    if (it.raw) { const r = RAW[id]; if (!r) return { ok: false, why: it.name + 'は渋くてそのままでは食べられない（水にさらして焼く）' }; f = r.f; bad = r.bad; }
    const gain = it.kcal * f;
    st.kcal = Math.min(EAT_FULL, st.kcal + gain);
    drop(st, id, 1); if (WATER_GAIN[id]) st.water = Math.min(WATER_MAX, (st.water == null ? 80 : st.water) + WATER_GAIN[id]);
    if (!it.raw && id !== 'fruit' && id !== 'bud' && id !== 'seed') bump(st, 'cooked');
    let ill = false;
    if (bad && rng() < bad) { st.sickUntil = Math.max(st.sickUntil, day + 2); ill = true; }
    return { ok: true, name: it.name, kcal: Math.round(gain), sick: ill };
  }

  // 焚き火：薪2と繊維1（火口）を使う。失敗すると繊維だけ失う
  const FIRE_WOOD = 2, WOOD_DAYS = 0.75, FIRE_RANGE = 2;
  function ownFireActive(st, bx, by, day) { const f = st.fire; return !!f && day < f.until && Math.abs(f.bx - bx) <= FIRE_RANGE && Math.abs(f.by - by) <= FIRE_RANGE; }
  // 集団の野営地の中心にある、みんなの炉（保存しない。画面側が今の野営地に合わせて毎回設定する）
  const COMMONS_RANGE = 1;
  function setCommons(st, c) { st.commons = c && Number.isFinite(c.bx) && Number.isFinite(c.by) ? { bx: Math.floor(c.bx), by: Math.floor(c.by) } : null; }
  function atCommons(st, bx, by) { const c = st.commons; return !!c && Math.abs(c.bx - Math.floor(bx)) <= COMMONS_RANGE && Math.abs(c.by - Math.floor(by)) <= COMMONS_RANGE; }
  function fireActive(st, bx, by, day) { return ownFireActive(st, bx, by, day) || atCommons(st, bx, by); }
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
    bump(st, 'fire');
    return { ok: true, days: FIRE_WOOD * WOOD_DAYS };
  }
  function stoke(st, bx, by, day) {
    if (!fireActive(st, bx, by, day)) return { ok: false, why: '近くに火がない' };
    if (!(st.inv.firewood > 0)) return { ok: false, why: '薪がない' };
    if (!ownFireActive(st, bx, by, day)) { drop(st, 'firewood', 1); gainStanding(st, 1.5); bump(st, 'give'); return { ok: true, commons: true }; }   // みんなの炉に薪をくべる
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
    if (ownFireActive(st, bx, by, day)) st.fire.until = Math.max(day, st.fire.until - 0.1 - n * 0.01); else bump(st, 'commonCook');
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
    const n = Math.min(k.n, roomFor(st, 'nutL'));
    if (n <= 0) return { ok: false, why: FULL_MSG };
    st.inv.nutL = (st.inv.nutL || 0) + n; st.total.nutL = (st.total.nutL || 0) + n; k.n -= n; if (k.n <= 0) st.soak = null;
    return { ok: true, n };
  }

  // ---------------------------------------------------------------- 道具づくり・土器・煮る
  const LIFE = { knife: 40, axe: 40, net: 30, pot: 25 };      // 使える回数［仮］
  function wearTool(st, id) {
    st.wear = st.wear || {}; st.wear[id] = (st.wear[id] || 0) + 1;
    if (st.wear[id] >= LIFE[id]) { st.wear[id] = 0; drop(st, id, 1); return ITEMS[IDX[id]].name; }
    return null;
  }
  // 作り方：need＝材料、lose＝失敗したときに失う材料、fire＝火が要る、p＝成功率の基本（腕前で上がる）
  const RECIPES = {
    rope:  { need: { fiber: 3 }, lose: { fiber: 1 }, p: 0.85, out: 1 },
    knife: { need: { stone: 1 }, lose: { stone: 1 }, p: 0.75, out: 1 },
    axe:   { need: { stone: 2, firewood: 1, rope: 1 }, lose: { rope: 1 }, p: 0.65, out: 1 },
    net:   { need: { rope: 3 }, lose: { rope: 1 }, p: 0.6, out: 1 },
    pot:   { need: { clay: 4, firewood: 2 }, lose: { clay: 2 }, p: 0.5, out: 1, fire: true },
  };
  function canCraft(st, id) { const r = RECIPES[id]; if (!r) return false; for (const k in r.need) if ((st.inv[k] || 0) < r.need[k]) return false; return true; }
  function craft(st, id, skill, rng, bx, by, day) {
    const r = RECIPES[id]; if (!r) return { ok: false, why: '作れない' };
    const name = ITEMS[IDX[id]].name;
    for (const k in r.need) if ((st.inv[k] || 0) < r.need[k]) return { ok: false, why: name + 'の材料が足りない（' + needText(r) + '）' };
    if (r.fire && !fireActive(st, bx, by, day)) return { ok: false, why: '土器は火のそばで焼いて作る' };
    // 材料を使ったあとに、できた物が入らないなら作らない
    const after = { inv: { ...st.inv } }; for (const k in r.need) { after.inv[k] -= r.need[k]; if (!after.inv[k]) delete after.inv[k]; }
    after.inv[id] = (after.inv[id] || 0) + r.out;
    if (slotsUsed(after) > SLOTS) return { ok: false, why: FULL_MSG + '（' + slotsUsed(st) + '/' + SLOTS + '枠）' };
    const p = Math.min(0.95, r.p + 0.3 * (skill == null ? 0.3 : skill));
    if (rng() > p) { for (const k in r.lose) drop(st, k, r.lose[k]); return { ok: false, why: name + 'づくりに失敗した（' + lostText(r) + 'を失った）' }; }
    for (const k in r.need) drop(st, k, r.need[k]);
    st.inv[id] = (st.inv[id] || 0) + r.out; st.total[id] = (st.total[id] || 0) + r.out;
    if (r.fire && ownFireActive(st, bx, by, day)) st.fire.until = Math.max(day, st.fire.until - 0.3); else if (r.fire) bump(st, 'commonCook');   // 焼成で火を使う
    return { ok: true, name };
  }
  function needText(r) { return Object.keys(r.need).map(k => ITEMS[IDX[k]].name + '×' + r.need[k]).join('・'); }
  function lostText(r) { return Object.keys(r.lose).map(k => ITEMS[IDX[k]].name + '×' + r.lose[k]).join('・'); }

  // 煮る：土器・火・真水のそばで、素朴な食材4つを煮物1つに（1回に最大4つ。土器は使うほど傷む）
  const STEW_IN = ['nut', 'nutL', 'shell', 'root', 'bud', 'seed', 'fruit'], STEW_N = 4, STEW_MAX = 4;
  function boil(st, bx, by, day, freshWater) {
    if (!(st.inv.pot > 0)) return { ok: false, why: '土器がない' };
    if (!fireActive(st, bx, by, day)) return { ok: false, why: '火のそばでしか煮られない' };
    if (!freshWater) return { ok: false, why: '水（川や湖）のそばでしか煮られない' };
    let total = 0; for (const k of STEW_IN) total += st.inv[k] || 0;
    if (total < STEW_N) return { ok: false, why: '食材が足りない（' + STEW_N + '個で煮物1つ。木の実・貝・根・新芽・草の実・果実）' };
    const batches = Math.min(STEW_MAX, Math.floor(total / STEW_N)); let need = batches * STEW_N;
    for (const k of STEW_IN) { const t = Math.min(need, st.inv[k] || 0); if (t) { drop(st, k, t); need -= t; } if (!need) break; }
    st.inv.stew = (st.inv.stew || 0) + batches; st.total.stew = (st.total.stew || 0) + batches;
    if (ownFireActive(st, bx, by, day)) st.fire.until = Math.max(day, st.fire.until - 0.15); else bump(st, 'commonCook');
    const broke = wearTool(st, 'pot');
    return { ok: true, n: batches, broke };
  }

  // ---------------------------------------------------------------- 住まい（竪穴住居）・貯蔵・睡眠
  const HOME_NEED = { firewood: 10, fiber: 12, rope: 2, clay: 4 }, HOME_DAYS = 3, HOME_REACH = 3, STORE_SLOTS = 30;
  function homeStatus(st, day) { const h = st.home; return !h ? 'none' : day >= h.ready ? 'built' : 'building'; }
  function nearHome(st, bx, by, r) { const h = st.home; return !!h && Math.abs(h.bx - Math.floor(bx)) <= (r == null ? HOME_REACH : r) && Math.abs(h.by - Math.floor(by)) <= (r == null ? HOME_REACH : r); }
  function homeNeedText() { return Object.keys(HOME_NEED).map(k => ITEMS[IDX[k]].name + '×' + HOME_NEED[k]).join('・'); }
  // 建てる：材料を使い、3日かけて建つ。1人1軒。水辺・海辺には建てない（okSite は呼び出し側が判定）
  function buildHome(st, bx, by, day, xM, yM, okSite) {
    if (st.home) return { ok: false, why: homeStatus(st, day) === 'built' ? 'すでに家がある（建て直すなら先に壊す）' : 'いま建築中（あと' + Math.ceil(st.home.ready - day) + '日）' };
    if (!okSite) return { ok: false, why: '水辺・海辺には建てられない（少し内陸へ）' };
    for (const k in HOME_NEED) if ((st.inv[k] || 0) < HOME_NEED[k]) return { ok: false, why: '家の材料が足りない（' + homeNeedText() + '）' };
    for (const k in HOME_NEED) drop(st, k, HOME_NEED[k]);
    st.home = { bx: Math.floor(bx), by: Math.floor(by), xM: Number.isFinite(xM) ? xM : null, yM: Number.isFinite(yM) ? yM : null, ready: day + HOME_DAYS };
    bump(st, 'home');
    return { ok: true, ready: st.home.ready };
  }
  // 壊す：貯蔵庫が空のときだけ（中身を失わないため）。材料は戻らない
  function demolishHome(st) {
    if (!st.home) return { ok: false, why: '家がない' };
    if (slotsOf(st.store) > 0) return { ok: false, why: '貯蔵庫に物が残っている。先に取り出す' };
    st.home = null; return { ok: true };
  }
  function storeRoom(st, id) { const it = ITEMS[IDX[id]], free = STORE_SLOTS - slotsOf(st.store, id); return Math.max(0, free * stackOf(it) - (st.store[id] || 0)); }
  function storePut(st, id, n, bx, by, day) {
    if (homeStatus(st, day) !== 'built' || !nearHome(st, bx, by)) return { ok: false, why: '家のそばでしか預けられない' };
    const have = st.inv[id] || 0; if (have <= 0) return { ok: false, why: '持っていない' };
    const k = Math.min(n == null ? have : n, have, storeRoom(st, id)); if (k <= 0) return { ok: false, why: '貯蔵庫がいっぱい（' + slotsOf(st.store) + '/' + STORE_SLOTS + '枠）' };
    drop(st, id, k); st.store[id] = (st.store[id] || 0) + k; return { ok: true, n: k };
  }
  function storeTake(st, id, n, bx, by, day) {
    if (homeStatus(st, day) !== 'built' || !nearHome(st, bx, by)) return { ok: false, why: '家のそばでしか取り出せない' };
    const have = st.store[id] || 0; if (have <= 0) return { ok: false, why: '貯蔵庫にない' };
    const k = Math.min(n == null ? have : n, have, roomFor(st, id)); if (k <= 0) return { ok: false, why: FULL_MSG };
    st.store[id] = have - k; if (!st.store[id]) delete st.store[id]; st.inv[id] = (st.inv[id] || 0) + k; return { ok: true, n: k };
  }
  function storeList(st) { return ITEMS.filter(it => st.store[it.id]).map(it => ({ id: it.id, name: it.name, n: st.store[it.id] })); }
  // 眠る：家で眠ると体調不良が治る。家が無くても、焚き火のそばなら野宿できる（体調は戻らない）。1日進める処理は呼び出し側
  function sleep(st, bx, by, day) {
    if (homeStatus(st, day) === 'built' && nearHome(st, bx, by)) { st.sickUntil = Math.min(st.sickUntil, day); bump(st, 'sleepHome'); rest(st, 25); return { ok: true, home: true }; }
    if (fireActive(st, bx, by, day)) { rest(st, 10); return { ok: true, home: false }; }
    return { ok: false, why: '眠れる場所がない（家のそば、または焚き火のそばで）' };
  }

  // ---------------------------------------------------------------- 暮らしの目標（入門の手順。画面の目標欄に出す）
  function bump(st, k) { st.n = st.n || {}; st.n[k] = (st.n[k] || 0) + 1; }
  const FOOD_RAW = ['nut', 'fruit', 'bud', 'root', 'seed', 'shell', 'fish'];
  const GOALS = [
    { id: 'food',   text: '食べ物を集める',            need: 5,  have: st => FOOD_RAW.reduce((a, k) => a + (st.total[k] || 0), 0) },
    { id: 'drink',  text: '川や湖の水を飲む',           need: 1,  have: st => (st.n || {}).drink || 0 },
    { id: 'wood',   text: '薪を集める',                need: 10, have: st => st.total.firewood || 0 },
    { id: 'fire',   text: '火を起こす',                need: 1,  have: st => (st.n || {}).fire || 0 },
    { id: 'cook',   text: '焼いた物・煮た物を食べる',   need: 1,  have: st => (st.n || {}).cooked || 0 },
    { id: 'rope',   text: '縄を作る',                  need: 1,  have: st => st.total.rope || 0 },
    { id: 'clay',   text: '粘土を集める',              need: 4,  have: st => st.total.clay || 0 },
    { id: 'pot',    text: '土器を作る',                need: 1,  have: st => st.total.pot || 0 },
    { id: 'acorn',  text: '木の実を水にさらして受け取る', need: 1, have: st => st.total.nutL || 0 },
    { id: 'stew',   text: '煮物を作る',                need: 1,  have: st => st.total.stew || 0 },
    { id: 'home',   text: '家を建てる',                need: 1,  have: st => (st.n || {}).home || 0 },
    { id: 'sleep',  text: '家で眠る',                  need: 1,  have: st => (st.n || {}).sleepHome || 0 },
    { id: 'talk',   text: '集団の人と話す',            need: 1,  have: st => (st.n || {}).talk || 0 },
    { id: 'share',  text: '近くの人に食べ物を分ける',   need: 1,  have: st => (st.n || {}).share || 0 },
    { id: 'hearth', text: '集団のみんなの炉で調理する', need: 1,  have: st => (st.n || {}).commonCook || 0 },
    { id: 'give',   text: '食べ物や薪を集団に分ける',   need: 1,  have: st => (st.n || {}).give || 0 },
    { id: 'learn',  text: '集団の人に技を教わる',       need: 1,  have: st => (st.n || {}).learn || 0 },
  ];
  // 順番に、最初の未達成の目標を返す。done＝達成した数、all＝全部達成
  function goals(st) {
    let done = 0;
    for (const g of GOALS) { const h = Math.min(g.need, g.have(st)); if (h < g.need) return { all: false, done, total: GOALS.length, id: g.id, text: g.text, have: h, need: g.need }; done++; }
    return { all: true, done, total: GOALS.length, id: null, text: '暮らしの基本を身につけた', have: 0, need: 0 };
  }

  // ---------------------------------------------------------------- 集団とのつながり：評判・分け合い・配給・教わる・話す
  const KCAL_PER_KG = 1800, CAMP_REACH = 2;
  function gainStanding(st, x) { st.standing = Math.min(100, Math.max(0, (st.standing || 0) + x)); }
  function standingInfo(st) {
    const v = st.standing || 0;
    return v >= 60 ? { v, level: 3, label: '頼られる人' } : v >= 30 ? { v, level: 2, label: '仲間' } : v >= 10 ? { v, level: 1, label: '顔見知り' } : { v, level: 0, label: 'よそ者' };
  }
  function nearCamp(camp, bx, by) { return !!camp && Math.abs(camp.bx - Math.floor(bx)) <= CAMP_REACH && Math.abs(camp.by - Math.floor(by)) <= CAMP_REACH; }
  // 食べ物を集団の蓄えに分ける（野営地の近くで）。生の物は価値が低い
  function giveToGroup(st, g, camp, id, n, bx, by) {
    if (!g || !camp) return { ok: false, why: '集団がない' };
    if (!nearCamp(camp, bx, by)) return { ok: false, why: '集団の野営地（みんなの炉のそば）でしか分けられない' };
    const it = ITEMS[IDX[id]]; if (!it || it.group !== 'food') return { ok: false, why: '食べ物ではない' };
    const have = st.inv[id] || 0; if (have <= 0) return { ok: false, why: '持っていない' };
    const k = Math.min(n == null ? have : n, have); drop(st, id, k);
    const kcal = k * it.kcal * (it.raw ? 0.6 : 1), kg = kcal / KCAL_PER_KG;
    g.food = (g.food || 0) + kg; st.given = (st.given || 0) + kcal; gainStanding(st, kg * 3); bump(st, 'give');
    return { ok: true, n: k, name: it.name, kg };
  }
  // 配給：おなかが空いていて、仲間と認められていれば、集団の蓄えから分けてもらえる
  const RATION_KCAL = 1400, RATION_DAYS = 2;
  function ration(st, g, camp, day, bx, by) {
    if (!g || !camp) return { ok: false, why: '集団がない' };
    if (!nearCamp(camp, bx, by)) return { ok: false, why: '野営地でしかもらえない' };
    if (day - (st.rationAt == null ? -99 : st.rationAt) < RATION_DAYS) return { ok: false, why: '配給は' + RATION_DAYS + '日に1度' };
    if (st.kcal > 1200) return { ok: false, why: 'まだおなかは空いていない' };
    if ((st.standing || 0) < 8) return { ok: false, why: 'まだ仲間とは認められていない（食べ物や薪を分けて、評判を上げよう）' };
    const kg = RATION_KCAL / KCAL_PER_KG; if ((g.food || 0) < kg) return { ok: false, why: 'いま集団に蓄えがない' };
    g.food -= kg; st.kcal = Math.min(EAT_FULL, st.kcal + RATION_KCAL); st.rationAt = day; gainStanding(st, -2); bump(st, 'ration');
    return { ok: true, kcal: RATION_KCAL };
  }
  // 近くの人に食べ物を分ける：その人の信頼・好意が上がる（相手から見たあなた）
  function clampB(x) { return x < 0 ? 0 : x > 255 ? 255 : x; }
  // 関係の枠が埋まっていても、いちばん薄い関係を押しのけて、あなたとの関係を作る（あなたは特別な存在として、必ず覚えてもらえる）
  function relSlot(P, i, j) {
    let sl = P._slot(i, j, true); if (sl >= 0) return sl;
    const K = Math.round(P.relId.length / P.cap); let w = -1, wd = 1e9;
    for (let k = 0; k < K; k++) { const v = (i * K + k) * 3, d = Math.abs(P.relV[v] - 128) + Math.abs(P.relV[v + 1] - 128) + Math.abs(P.relV[v + 2] - 128); if (d < wd) { wd = d; w = k; } }
    if (w < 0) return -1;
    const b = i * K + w; P.relId[b] = j; P.relV[b * 3] = P.relV[b * 3 + 1] = P.relV[b * 3 + 2] = 128; return b;
  }
  function share(P, st, me, npc, id) {
    if (!P || !(P.alive ? P.alive(npc) : true) || npc === me) return { ok: false, why: '相手がいない' };
    const it = ITEMS[IDX[id]]; if (!it || it.group !== 'food') return { ok: false, why: '食べ物ではない' };
    if (!(st.inv[id] > 0)) return { ok: false, why: '持っていない' };
    const sl = relSlot(P, npc, me); if (sl < 0) return { ok: false, why: 'うまく伝わらなかった' };
    drop(st, id, 1);
    const v = sl * 3, R = P.relV, w = it.raw ? 0.6 : 1;
    R[v] = clampB(R[v] + Math.round(6 * w)); R[v + 1] = clampB(R[v + 1] + Math.round(8 * w));
    const s2 = relSlot(P, me, npc); if (s2 >= 0) { P.relV[s2 * 3 + 1] = clampB(P.relV[s2 * 3 + 1] + 3); }
    gainStanding(st, 0.8 * w); bump(st, 'share');
    return { ok: true, name: it.name, trust: R[v] };
  }
  // 技を教わる：相手の信頼が一定以上で、相手がその道に詳しいとき。1人から5日に1度
  const LESSON_TRUST = 140, LESSON_DAYS = 5;
  function learn(P, st, me, npc, day, NS, jobs) {
    if (!P || npc === me || !(P.alive ? P.alive(npc) : true)) return { ok: false, why: '相手がいない' };
    const j = P.job[npc]; if (!j) return { ok: false, why: 'この人には教わることがない（仕事をしていない）' };
    const k = j - 1, sn = P.skills[npc * NS + k], sm = P.skills[me * NS + k], name = jobs && jobs[j] ? jobs[j].skill : '技';
    const b = P.bondOf ? P.bondOf(npc, me) : null, trust = b ? b[0] : 128;
    if (trust < LESSON_TRUST) return { ok: false, why: 'まだ打ち解けていない（食べ物を分けて、信頼を得よう）' };
    if (sn < 30 || sn < sm + 10) return { ok: false, why: 'この人からは、もう教わることがない（' + name + '）' };
    const last = st.lessons[npc]; if (last != null && day - last < LESSON_DAYS) return { ok: false, why: '今日はもう教わった（' + (LESSON_DAYS - Math.floor(day - last)) + '日後にまた）' };
    P.practice(me, k, 2, 3);
    const after = P.skills[me * NS + k]; st.lessons[npc] = day; gainStanding(st, 0.5); bump(st, 'learn');
    const keys = Object.keys(st.lessons); if (keys.length > 60) delete st.lessons[keys[0]];
    return { ok: true, name, before: sm, after };
  }
  // 話す：その人の言葉（仕事・集団の食料の具合・あなたとの関係から決まる。同じ日・同じ人なら同じ言葉）
  function talk(st, info, day, npc) {
    const hash = ((npc * 2654435761) ^ (Math.floor(day / 10) * 40503)) >>> 0;
    const job = info.job || '', fed = info.fed == null ? 1 : info.fed, w = [];
    if (fed < 0.6) w.push('このところ食べ物が足りなくて、みんな苦しんでいる。', '蓄えが減ってきた。冬を越せるだろうか。');
    else if (fed > 0.95) w.push('今年は食べ物に困らない。ありがたいことだ。', 'みんなおなかいっぱいで、顔色がいい。');
    else w.push('食べ物はなんとか足りている。', '蓄えはそこそこだ。油断はできないが。');
    const J = { 採集者: '私は木の実や草の実を集めている。秋は木の実が実り、冬は新芽が少し出る。', 狩人: '私は狩りをしている。獲物は夜明けと夕暮れによく動く。', 漁師: '私は魚や貝を獲っている。網があれば魚はずっと獲れる。', 道具製作者: '私は道具を作っている。石を割って、縄で結ぶんだ。', 建築従事者: '私は家を建てている。竪穴を掘って、茅で屋根を葺く。', 運搬者: '私は荷を運んでいる。', 治療者: '私は病人の世話をしている。熱が出たら、よく寝ることだ。', 警備者: '私は周りを見張っている。', 農民: '私は畑を見ている。', 牧畜従事者: '私は家畜の世話をしている。', 交易者: '私は遠くの人と物を替えている。' };
    const lines = [w[hash % w.length]]; if (J[job]) lines.push(J[job]); else if (info.relation) lines.push('あなたは「' + info.relation + '」だね。');
    const lv = standingInfo(st).level; lines.push(lv >= 2 ? '君はこの集団の仲間だ。頼りにしているよ。' : lv === 1 ? '最近よく見かける顔だ。' : '見かけない顔だな。何か分けてくれると助かる。');
    const first = st.talkDay[npc] == null || st.talkDay[npc] !== Math.floor(day);
    if (first) { st.talkDay[npc] = Math.floor(day); bump(st, 'talk'); const ks = Object.keys(st.talkDay); if (ks.length > 80) delete st.talkDay[ks[0]]; }
    return { ok: true, text: lines.join('') };
  }

  function save(st) { const o = JSON.parse(JSON.stringify(st)); delete o.commons; delete o.env; return o; }
  function load(o) {
    const st = newState();
    if (o && typeof o === 'object') {
      st.seq = Number.isFinite(o.seq) ? o.seq >>> 0 : 0;
      for (const k in (o.wear || {})) if (LIFE[k] && Number.isFinite(o.wear[k])) st.wear[k] = Math.max(0, o.wear[k] | 0);
      if (Number.isFinite(o.kcal)) st.kcal = Math.max(0, Math.min(KCAL_MAX, o.kcal));
      if (Number.isFinite(o.t)) st.t = o.t; if (Number.isFinite(o.sickUntil)) st.sickUntil = o.sickUntil;
      const f = o.fire; if (f && Number.isFinite(f.bx) && Number.isFinite(f.by) && Number.isFinite(f.until)) { st.fire = { bx: f.bx, by: f.by, until: f.until }; if (Number.isFinite(f.xM) && Number.isFinite(f.yM)) { st.fire.xM = f.xM; st.fire.yM = f.yM; } }
      const hm = o.home; if (hm && Number.isFinite(hm.bx) && Number.isFinite(hm.by) && Number.isFinite(hm.ready)) st.home = { bx: hm.bx, by: hm.by, xM: Number.isFinite(hm.xM) ? hm.xM : null, yM: Number.isFinite(hm.yM) ? hm.yM : null, ready: hm.ready };
      for (const id in (o.store || {})) if (IDX[id] != null && o.store[id] > 0) st.store[id] = o.store[id] | 0;
      for (const k in (o.n || {})) if (Number.isFinite(o.n[k]) && o.n[k] > 0) st.n[k] = o.n[k] | 0;
      if (Number.isFinite(o.hp)) st.hp = Math.max(1, Math.min(HP_MAX, o.hp));
      if (Number.isFinite(o.sp)) st.sp = Math.max(0, Math.min(SP_MAX, o.sp));
      if (Number.isFinite(o.water)) st.water = Math.max(0, Math.min(WATER_MAX, o.water));
      if (o.exhausted === true) st.exhausted = true;
      if (Number.isFinite(o.standing)) st.standing = Math.max(0, Math.min(100, o.standing));
      if (Number.isFinite(o.given)) st.given = Math.max(0, o.given); if (Number.isFinite(o.rationAt)) st.rationAt = o.rationAt;
      for (const k in (o.lessons || {})) if (Number.isFinite(o.lessons[k])) st.lessons[k] = o.lessons[k];
      for (const k in (o.talkDay || {})) if (Number.isFinite(o.talkDay[k])) st.talkDay[k] = o.talkDay[k];
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

  const api = { setEnv, rest, staminaCap, staminaStep, jumpCost, drink, vitalsInfo, HP_MAX, SP_MAX, WATER_MAX, setCommons, atCommons, ownFireActive, standingInfo, gainStanding, giveToGroup, ration, share, learn, talk, nearCamp, KCAL_PER_KG, goals, GOALS, slotsOf, HOME_NEED, HOME_DAYS, HOME_REACH, STORE_SLOTS, homeStatus, nearHome, homeNeedText, buildHome, demolishHome, storePut, storeTake, storeList, storeRoom, sleep, SLOTS, slotsUsed, roomFor, stackOf, RECIPES, LIFE, canCraft, craft, boil, tick, hunger, sick, vigor, eat, makeFire, stoke, fireActive, fireLeft, roast, soakStart, soakCollect, KCAL_MAX, KCAL_DAY, RAW, ROAST, rngFor, ITEMS, IDX, SPOT_CAP, newState, count, availability, spotLeft, gather, drop, list, save, load, prune };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WohForage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
