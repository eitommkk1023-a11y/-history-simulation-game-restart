// node npc/test-forage.js
const F = require('./forage.js');
let ok = 0, ng = 0;
const t = (name, cond, extra) => { if (cond) ok++; else { ng++; console.log('NG', name, extra == null ? '' : extra); } };
const rngSeed = (s) => { const f = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); f(); f(); f(); return f; };

const forest = { plant: [0.3, 0.8, 0.1, 0.8, 0.3], forest: 0.9, grass: 0.1, coast: false, water: false, rock: 0 };
const coast = { plant: [0.4, 0.1, 0.1, 0, 0], forest: 0, grass: 0.5, coast: true, water: true, rock: 0.1 };
const desert = { plant: [0, 0, 0, 0, 0], forest: 0, grass: 0, coast: false, water: false, rock: 0 };

// 豊かさ
const af = F.availability(forest), ac = F.availability(coast);
t('森に木の実と薪', af.nut > 1 && af.firewood > 1);
t('森に貝は無い', af.shell === 0);
t('海辺に貝と魚', ac.shell > 0 && ac.fish > 0);
t('不毛地は全部ほぼ0', Object.values(F.availability(desert)).every(v => v === 0));

// 採取：何も無い所
{ const st = F.newState(); const r = F.gather(st, desert, 10, 10, 0, rngSeed(1)); t('不毛地は失敗', !r.ok && !!r.why); }

// 森で100回：木の実・薪が主、貝は出ない、重さ上限を超えない、同じ場所は枯れる
{
  const st = F.newState(), rng = rngSeed(7); let got = 0, fails = 0;
  for (let i = 0; i < 100; i++) { const r = F.gather(st, forest, 5, 5, 0, rng); if (r.ok) got++; else fails++; }
  t('森で何か採れる', got > 5, got);
  t('貝は出ない', !st.inv.shell);
  t('木の実か薪が入る', (st.inv.nut || 0) + (st.inv.firewood || 0) > 0);
  t('枠は上限以内', F.slotsUsed(st) <= F.SLOTS, F.slotsUsed(st));
  t('同じ場所は枯れる（成功は上限付近）', got <= F.SPOT_CAP + 1, got);
  const r2 = F.gather(st, forest, 5, 5, 0, rngSeed(3)); t('枯れた場所のメッセージ', !r2.ok);
  // 月が変わると回復
  let got2 = 0; const rng2 = rngSeed(11); for (let i = 0; i < 30; i++) if (F.gather(st, forest, 5, 5, 1, rng2).ok) got2++;
  t('翌月は採れる', got2 > 0, got2);
  // 別の場所は新しい
  let got3 = 0; const rng3 = rngSeed(13); for (let i = 0; i < 30; i++) if (F.gather(st, forest, 6, 5, 0, rng3).ok) got3++;
  t('隣のブロックは採れる', got3 > 0, got3);
}

// 海辺：want で貝だけ
{
  const st = F.newState(), rng = rngSeed(5); let got = 0;
  for (let i = 0; i < 30; i++) { const r = F.gather(st, coast, 1, 1, 0, rng, { want: 'shell' }); if (r.ok) { got++; t('貝だけ', r.id === 'shell'); } }
  t('貝が採れる', got > 0 && st.inv.shell > 0, got);
}
// want が無い所
{ const st = F.newState(); const r = F.gather(st, forest, 0, 0, 0, rngSeed(2), { want: 'shell' }); t('指定した物が無い', !r.ok && /貝/.test(r.why)); }
// 持ちきれない
{ const st = F.newState(); st.inv.stone = F.SLOTS * F.stackOf(F.ITEMS[F.IDX.stone]); const r = F.gather(st, { ...desert, rock: 1 }, 0, 0, 0, rngSeed(9), { want: 'stone' }); t('満杯なら失敗', !r.ok && /いっぱい/.test(r.why), JSON.stringify(r)); }
// 決定性
{
  const run = () => { const st = F.newState(), rng = rngSeed(42); for (let i = 0; i < 20; i++) F.gather(st, forest, 3, 3, 0, rng); return JSON.stringify(st); };
  t('決定的', run() === run());
}
// 保存・読み込み・捨てる
{
  const st = F.newState(), rng = rngSeed(8); for (let i = 0; i < 10; i++) F.gather(st, forest, 3, 3, 4, rng);
  const s2 = F.load(JSON.parse(JSON.stringify(F.save(st))));
  t('保存→読み込みで同じ', JSON.stringify(s2) === JSON.stringify(st));
  t('壊れた保存でも落ちない', F.slotsUsed(F.load({ inv: { x: 5, nut: -1 }, depl: { a: 3 } })) === 0);
  t('null でも落ちない', F.slotsUsed(F.load(null)) === 0);
  const before = F.count(st, 'nut') + F.count(st, 'firewood'); const id = st.inv.nut ? 'nut' : 'firewood';
  const d = F.drop(st, id, 1); t('捨てる', d === 1 && F.count(st, id) === (id === 'nut' ? F.count(F.load(F.save(st)), 'nut') : F.count(st, id)));
  F.prune(st, 9); t('古い記録を捨てる', Object.keys(st.depl).length === 0);
}
// 腕前で多く採れる
{
  const sum = (sk) => { let s = 0; for (let seed = 1; seed <= 200; seed++) { const st = F.newState(), r = F.gather(st, forest, 0, 0, 0, rngSeed(seed), { skill: sk, want: 'nut' }); if (r.ok) s += r.n; } return s; };
  t('腕前が高いほど多い', sum(0.9) > sum(0.1), sum(0.9) + ' vs ' + sum(0.1));
}

// ---------------------------------------------------------------- 食べる・火・調理
{
  const fixed = (v) => () => v;
  // 空腹：時間でおなかが減る
  const st = F.newState(); t('初期は満腹寄り', F.hunger(st).id === 'full', st.kcal);
  F.tick(st, 1); t('1日で約2000減る', Math.abs(st.kcal - (2200 - 2000)) < 1, st.kcal);
  t('1日で飢えの域', F.hunger(st).id === 'starving'); st.kcal = 600; t('空腹の判定', F.hunger(st).id === 'hungry'); st.kcal = 1500; t('普通の判定', F.hunger(st).id === 'ok'); st.kcal = 200;
  F.tick(st, 5); t('0未満にならない・飢え', st.kcal === 0 && F.hunger(st).id === 'starving');
  t('飢えで元気さ低下', F.vigor(st, 5) < 0.7);
  F.tick(st, 2); t('時計が戻っても壊れない', st.t === 2);
  // 食べる
  const s2 = F.newState(); s2.kcal = 500; s2.inv = { fruit: 3, nut: 2, fish: 2, root: 1, fishC: 1, firewood: 1 };
  t('生の木の実は食べられない', !F.eat(s2, 'nut', fixed(0.9), 0).ok && /渋く/.test(F.eat(s2, 'nut', fixed(0.9), 0).why));
  t('薪は食べ物でない', !F.eat(s2, 'firewood', fixed(0.9), 0).ok);
  t('持っていない物', !F.eat(s2, 'shell', fixed(0.9), 0).ok);
  let r = F.eat(s2, 'fruit', fixed(0.9), 0); t('果実を食べる', r.ok && r.kcal === 40 && s2.kcal === 540 && s2.inv.fruit === 2, JSON.stringify(r));
  r = F.eat(s2, 'fish', fixed(0.1), 3); t('生魚は半分以下・当たることがある', r.ok && r.kcal === 150 && r.sick && F.sick(s2, 4) && !F.sick(s2, 5), JSON.stringify(r));
  r = F.eat(s2, 'fish', fixed(0.9), 3); t('当たらないこともある', r.ok && !r.sick);
  r = F.eat(s2, 'fishC', fixed(0.1), 3); t('焼き魚は当たらず満額', r.ok && r.kcal === 280 && !r.sick);
  const s3 = F.newState(); s3.kcal = 3000; s3.inv.fruit = 1; t('満腹なら食べない', !F.eat(s3, 'fruit', fixed(0.5), 0).ok);

  // 火
  const f1 = F.newState(); f1.inv = { firewood: 1, fiber: 1 };
  t('薪不足', !F.makeFire(f1, 5, 5, 0, 0.5, fixed(0), false).ok && f1.inv.fiber === 1);
  f1.inv = { firewood: 3 }; t('繊維なし', !F.makeFire(f1, 5, 5, 0, 0.5, fixed(0), false).ok);
  f1.inv = { firewood: 3, fiber: 2 };
  r = F.makeFire(f1, 5, 5, 0, 0.5, fixed(0.99), false); t('失敗で繊維だけ減る', !r.ok && f1.inv.fiber === 1 && f1.inv.firewood === 3, JSON.stringify(r));
  r = F.makeFire(f1, 5, 5, 0, 0.5, fixed(0.0), false); t('成功で薪2と繊維1を使う', r.ok && f1.inv.firewood === 1 && !f1.inv.fiber && F.fireActive(f1, 5, 5, 0.5), JSON.stringify(f1));
  t('火の近く（2ブロック）は有効、遠いと無効', F.fireActive(f1, 7, 5, 1) && !F.fireActive(f1, 8, 5, 1));
  t('火は燃え尽きる', !F.fireActive(f1, 5, 5, 1.6) && F.fireLeft(f1, 1.6) === 0);
  t('既にある火の隣では起こせない', !F.makeFire(f1, 6, 5, 0.1, 0.5, fixed(0), false).ok);
  r = F.stoke(f1, 5, 5, 1); t('薪をくべる', r.ok && f1.inv.firewood === undefined && Math.abs(F.fireLeft(f1, 1) - (1.5 + 0.75 - 1)) < 1e-9, JSON.stringify(r));
  t('薪がないとくべられない', !F.stoke(f1, 5, 5, 1).ok);
  const f2 = F.newState(); f2.inv = { firewood: 2, fiber: 1 }; F.makeFire(f2, 1, 1, 0, 1, fixed(0.8), true);
  t('雨・水辺では火がつきにくい', f2.fire === null, JSON.stringify(f2.fire));

  // 焼く
  const c = F.newState(); c.inv = { fish: 2, shell: 3, root: 1, seed: 4, nutL: 5, nut: 7, fruit: 2 }; c.fire = { bx: 3, by: 3, until: 2 };
  t('火から離れていると焼けない', !F.roast(c, 9, 9, 0).ok);
  r = F.roast(c, 3, 3, 0); t('まとめて焼く', r.ok && c.inv.fishC === 2 && c.inv.shellC === 3 && c.inv.rootC === 1 && c.inv.seedC === 4 && c.inv.nutC === 5, JSON.stringify(c.inv));
  t('生の木の実・果実は焼かない', c.inv.nut === 7 && c.inv.fruit === 2 && !c.inv.fish);
  t('焼くと火が少し減る', c.fire.until < 2);
  const c2 = F.newState(); c2.fire = { bx: 0, by: 0, until: 5 }; t('焼く物なし', !F.roast(c2, 0, 0, 0).ok);

  // 水さらし
  const w = F.newState(); w.inv = { nut: 10 };
  t('真水がないと不可', !F.soakStart(w, 2, 2, 0, false).ok && w.inv.nut === 10);
  r = F.soakStart(w, 2, 2, 0, true); t('水にさらす', r.ok && w.inv.nut === undefined && w.soak.n === 10 && w.soak.ready === 2, JSON.stringify(w));
  t('二重には不可', !F.soakStart(w, 2, 2, 0, true).ok);
  t('早すぎる', !F.soakCollect(w, 2, 2, 1).ok && /あと/.test(F.soakCollect(w, 2, 2, 1).why));
  t('別の場所では受け取れない', !F.soakCollect(w, 20, 2, 3).ok);
  r = F.soakCollect(w, 3, 2, 3); t('受け取る', r.ok && r.n === 10 && w.inv.nutL === 10 && w.soak === null, JSON.stringify(w));
  const w2 = F.newState(); w2.inv = { nut: 5, stone: 24 }; F.soakStart(w2, 0, 0, 0, true); w2.inv.stone = 200;
  r = F.soakCollect(w2, 0, 0, 3); t('満杯なら受け取れず残る', !r.ok && /いっぱい/.test(r.why) && w2.soak.n === 5, JSON.stringify(r));

  // 保存・読み込み
  const sv = F.newState(); sv.kcal = 1234; sv.t = 7; sv.sickUntil = 9; sv.fire = { bx: 1, by: 2, until: 8 }; sv.soak = { bx: 3, by: 4, n: 6, ready: 9 }; sv.inv = { nutC: 2 };
  const ld = F.load(JSON.parse(JSON.stringify(F.save(sv)))); t('暮らしの状態も保存・読み込みできる', JSON.stringify(ld) === JSON.stringify(sv), JSON.stringify(ld));
  const bad = F.load({ kcal: 'x', fire: { bx: 1 }, soak: { n: -1 }, t: null }); t('壊れた保存でも既定値', bad.fire === null && bad.soak === null && bad.kcal === 2200);
  const old = F.load({ inv: { nut: 3 }, depl: {}, total: {}, seq: 5 }); t('古い保存（暮らし項目なし）を読める', old.kcal === 2200 && old.inv.nut === 3 && old.seq === 5);
  // 元気さが採取に効く
  const sum = (v) => { let n = 0; for (let sd = 1; sd <= 300; sd++) { const s = F.newState(); if (F.gather(s, forest, 0, 0, 0, rngSeed(sd), { want: 'nut', vigor: v }).ok) n++; } return n; };
  t('飢えると見つかりにくい', sum(0.6) < sum(1), sum(0.6) + ' vs ' + sum(1));
}

// ---------------------------------------------------------------- 道具づくり・土器・煮る
{
  const fixed = (v) => () => v;
  const riverCtx = { plant: [0.3, 0.3, 0.1, 0, 0], forest: 0.2, grass: 0.3, coast: false, water: true, rock: 0 };
  t('川辺に粘土がある', F.availability(riverCtx).clay > 0.5);
  t('内陸の森に粘土はない', F.availability(forest).clay === 0);
  // 縄・ナイフ・斧・網
  const a = F.newState(); a.inv = { fiber: 3 };
  t('縄の材料不足', !F.craft(F.newState(), 'rope', 0.5, fixed(0), 0, 0, 0).ok);
  let r = F.craft(a, 'rope', 0.5, fixed(0.99), 0, 0, 0); t('失敗で繊維1だけ失う', !r.ok && a.inv.fiber === 2 && /失敗/.test(r.why), JSON.stringify(a.inv));
  a.inv = { fiber: 3 }; r = F.craft(a, 'rope', 0.5, fixed(0), 0, 0, 0); t('縄ができる', r.ok && a.inv.rope === 1 && !a.inv.fiber);
  a.inv = { stone: 3, firewood: 2, rope: 2 };
  r = F.craft(a, 'axe', 0.5, fixed(0), 0, 0, 0); t('石斧ができる', r.ok && a.inv.axe === 1 && a.inv.stone === 1 && a.inv.firewood === 1 && a.inv.rope === 1, JSON.stringify(a.inv));
  r = F.craft(a, 'knife', 0.5, fixed(0), 0, 0, 0); t('ナイフができる', r.ok && a.inv.knife === 1 && !a.inv.stone);
  a.inv = { rope: 3 }; t('網ができる', F.craft(a, 'net', 0.5, fixed(0), 0, 0, 0).ok && a.inv.net === 1);
  t('腕前が高いと成功しやすい', (() => { const n = (sk) => { let c = 0; for (let i = 1; i <= 300; i++) { const s = F.newState(); s.inv = { stone: 1 }; if (F.craft(s, 'knife', sk, rngSeed(i), 0, 0, 0).ok) c++; } return c; }; return n(1) > n(0); })());
    const full = F.newState(); full.inv = { clay: 4, firewood: 2, stone: 200 }; full.fire = { bx: 0, by: 0, until: 5 }; r = F.craft(full, 'pot', 0.5, fixed(0), 0, 0, 0); t('土器は枠に余裕がないと作らない', !r.ok && /いっぱい/.test(r.why), JSON.stringify(r));

  // 土器：火が必要
  const pt = F.newState(); pt.inv = { clay: 5, firewood: 3 };
  t('火がないと土器は焼けない', !F.craft(pt, 'pot', 0.5, fixed(0), 0, 0, 0).ok && pt.inv.clay === 5);
  pt.fire = { bx: 0, by: 0, until: 5 };
  r = F.craft(pt, 'pot', 0.5, fixed(0.99), 0, 0, 0); t('土器の失敗で粘土2を失う', !r.ok && pt.inv.clay === 3 && pt.inv.firewood === 3, JSON.stringify(pt.inv));
  pt.inv = { clay: 5, firewood: 3 }; r = F.craft(pt, 'pot', 0.5, fixed(0), 0, 0, 0);
  t('土器ができる（粘土4・薪2）', r.ok && pt.inv.pot === 1 && pt.inv.clay === 1 && pt.inv.firewood === 1 && pt.fire.until < 5, JSON.stringify(pt));
  t('canCraft', F.canCraft({ inv: { fiber: 3 } }, 'rope') && !F.canCraft({ inv: { fiber: 2 } }, 'rope'));

  // 煮る
  const b = F.newState(); b.inv = { nut: 4, shell: 3, root: 3, fish: 2 }; b.fire = { bx: 0, by: 0, until: 5 };
  t('土器なしでは煮られない', !F.boil(b, 0, 0, 0, true).ok);
  b.inv.pot = 1;
  t('火なし', !F.boil(b, 9, 9, 0, true).ok); t('水なし', !F.boil(b, 0, 0, 0, false).ok);
  r = F.boil(b, 0, 0, 0, true); t('10個→煮物2、魚は使わない', r.ok && r.n === 2 && b.inv.stew === 2 && b.inv.fish === 2 && (b.inv.nut || 0) + (b.inv.shell || 0) + (b.inv.root || 0) === 2, JSON.stringify(b.inv));
  const b2 = F.newState(); b2.inv = { pot: 1, bud: 3 }; b2.fire = { bx: 0, by: 0, until: 5 }; t('食材不足', !F.boil(b2, 0, 0, 0, true).ok);
  const b3 = F.newState(); b3.inv = { pot: 1, nut: 40 }; b3.fire = { bx: 0, by: 0, until: 5 }; r = F.boil(b3, 0, 0, 0, true); t('1回に煮物は最大4つ', r.n === 4 && b3.inv.nut === 24);
  // 煮物は食べても当たらず満額
  const e = F.newState(); e.kcal = 100; e.inv = { stew: 1 }; r = F.eat(e, 'stew', fixed(0.0), 0); t('煮物は安全で260kcal', r.ok && r.kcal === 260 && !r.sick);
  // 道具の摩耗と効き目
  const w = F.newState(); w.inv = { pot: 1, nut: 100 }; w.fire = { bx: 0, by: 0, until: 999 }; let broke = null;
  for (let i = 0; i < 30 && !broke; i++) { w.inv.nut = 100; const q = F.boil(w, 0, 0, 0, true); if (q.broke) broke = q.broke; }
  t('土器は25回で壊れる', broke === '土器' && !w.inv.pot, JSON.stringify(w.wear));
  const ax = (has) => { let sum = 0; for (let i = 1; i <= 200; i++) { const s = F.newState(); if (has) s.inv.axe = 1; const q = F.gather(s, forest, 0, 0, 0, rngSeed(i), { want: 'firewood', skill: 0.3 }); if (q.ok) sum += q.n; } return sum; };
  t('石斧で薪が増える', ax(true) > ax(false) * 1.6, ax(true) + ' vs ' + ax(false));
  const nt = (has) => { let sum = 0; for (let i = 1; i <= 300; i++) { const s = F.newState(); if (has) s.inv.net = 1; const q = F.gather(s, riverCtx, 0, 0, 0, rngSeed(i), { want: 'fish', skill: 0.3 }); if (q.ok) sum += q.n; } return sum; };
  t('網で魚が増える', nt(true) > nt(false) * 2, nt(true) + ' vs ' + nt(false));
  const wk = F.newState(); wk.inv = { axe: 1 }; let br = null; for (let i = 1; i <= 400 && !br; i++) { wk.inv.firewood = 0; const q = F.gather(wk, forest, i, 0, 0, rngSeed(i), { want: 'firewood', skill: 0.9 }); if (q.broke) br = q.broke; if (wk.inv.axe === undefined) break; }
  t('石斧は使うと壊れる', br === '石斧' && !wk.inv.axe);
  // 保存
  const sv = F.newState(); sv.wear = { axe: 7, pot: 3 }; sv.inv = { axe: 1, pot: 1 };
  const ld = F.load(JSON.parse(JSON.stringify(F.save(sv)))); t('摩耗も保存できる', ld.wear.axe === 7 && ld.wear.pot === 3);
  t('壊れた摩耗の保存でも落ちない', F.load({ wear: { axe: 'x', zzz: 5 } }).wear.axe === undefined);
  t('古い保存（摩耗なし）', F.load({ inv: {} }).wear && Object.keys(F.load({ inv: {} }).wear).length === 0);
}

// ---------------------------------------------------------------- 持ち物の枠（重さは使わない）
{
  const S = F.newState();
  t('空は0枠', F.slotsUsed(S) === 0);
  S.inv = { nut: 40 }; t('軽い物は1枠に40個', F.slotsUsed(S) === 1 && F.stackOf(F.ITEMS[F.IDX.nut]) === 40);
  S.inv = { nut: 41 }; t('41個で2枠', F.slotsUsed(S) === 2);
  S.inv = { firewood: 10 }; t('薪は1枠10個', F.slotsUsed(S) === 1); S.inv = { firewood: 11 }; t('11本で2枠', F.slotsUsed(S) === 2);
  S.inv = { axe: 3 }; t('道具は1枠3個', F.slotsUsed(S) === 1); S.inv = { axe: 4 }; t('4個で2枠', F.slotsUsed(S) === 2);
  S.inv = { nut: 30 }; t('同じ物は枠の残りまで入る', F.roomFor(S, 'nut') === F.SLOTS * 40 - 30);
  S.inv = { stone: 10 * 19, nut: 1 }; t('20枠が埋まると新しい物は入らない', F.slotsUsed(S) === 20 && F.roomFor(S, 'fish') === 0);
  t('既にある物は枠の余りに入る', F.roomFor(S, 'nut') === 39);
  // 満杯でも、枠の余りがあれば採れて、積み上がる
  const G = F.newState(), rng = rngSeed(21); let tot = 0;
  for (let i = 0; i < 300; i++) { const q = F.gather(G, forest, i, 0, 0, rng, { want: 'firewood', skill: 1 }); if (q.ok) tot += q.n; }
  t('薪を集めても枠の上限まで', F.slotsUsed(G) <= F.SLOTS && (G.inv.firewood || 0) <= 200 && tot > 0, JSON.stringify(G.inv));
  const H = F.newState(); H.inv = { stone: 200 }; t('満杯のメッセージに枠数', /20\/20枠/.test(F.gather(H, { ...desert, rock: 1 }, 0, 0, 0, rngSeed(3), { want: 'stone' }).why));
  t('一覧に重さを出さない', !('kg' in (F.list({ inv: { nut: 2 } })[0] || {})) && !('weight' in F));
}

// ---------------------------------------------------------------- 住まい・貯蔵・睡眠
{
  const mats = () => ({ firewood: 12, fiber: 14, rope: 3, clay: 5 });
  const H = F.newState(); H.inv = mats();
  t('材料不足は建てられない', !F.buildHome(F.newState(), 5, 5, 0, 10, 10, true).ok);
  t('水辺には建てられない', !F.buildHome(H, 5, 5, 0, 10, 10, false).ok && H.inv.firewood === 12);
  let r = F.buildHome(H, 5.7, 5.2, 10, 123, 456, true);
  t('建築開始：材料を使い3日後に完成', r.ok && r.ready === 13 && H.inv.firewood === 2 && H.inv.fiber === 2 && H.inv.rope === 1 && H.inv.clay === 1 && F.homeStatus(H, 11) === 'building' && F.homeStatus(H, 13) === 'built', JSON.stringify(H));
  t('位置は整数ブロックと実座標', H.home.bx === 5 && H.home.by === 5 && H.home.xM === 123);
  t('二軒目は建てられない', !F.buildHome(H, 8, 8, 11, 1, 1, true).ok && /建築中/.test(F.buildHome(H, 8, 8, 11, 1, 1, true).why));
  H.inv = { ...mats() }; t('完成後も一軒だけ', /すでに家/.test(F.buildHome(H, 8, 8, 14, 1, 1, true).why));
  t('家のそば判定', F.nearHome(H, 7, 7) && !F.nearHome(H, 9, 5));
  // 貯蔵
  const S = F.newState(); S.inv = { nut: 30, stone: 5 };
  t('家が無いと預けられない', !F.storePut(S, 'nut', null, 0, 0, 0).ok);
  S.home = { bx: 0, by: 0, xM: 0, yM: 0, ready: 5 };
  t('建築中は預けられない', !F.storePut(S, 'nut', null, 0, 0, 3).ok);
  t('遠いと預けられない', !F.storePut(S, 'nut', null, 9, 9, 6).ok);
  r = F.storePut(S, 'nut', 10, 1, 1, 6); t('一部を預ける', r.ok && r.n === 10 && S.inv.nut === 20 && S.store.nut === 10, JSON.stringify(S));
  r = F.storePut(S, 'nut', null, 1, 1, 6); t('全部預ける', r.n === 20 && !S.inv.nut && S.store.nut === 30);
  t('持っていない物は預けられない', !F.storePut(S, 'fish', null, 1, 1, 6).ok);
  r = F.storeTake(S, 'nut', 5, 0, 0, 6); t('取り出す', r.ok && r.n === 5 && S.inv.nut === 5 && S.store.nut === 25);
  t('貯蔵庫にない物', !F.storeTake(S, 'fish', null, 0, 0, 6).ok);
  t('遠いと取り出せない', !F.storeTake(S, 'nut', null, 9, 9, 6).ok);
  t('一覧', F.storeList(S).length === 1 && F.storeList(S)[0].n === 25);
  // 貯蔵庫の上限
  const B = F.newState(); B.home = { bx: 0, by: 0, xM: 0, yM: 0, ready: 0 }; B.inv = { stone: 10 };
  B.store = { stone: 10 * 29 }; r = F.storePut(B, 'stone', null, 0, 0, 1); t('貯蔵庫は30枠まで', r.ok && r.n === 10 && F.storeRoom(B, 'stone') === 0, JSON.stringify(r));
  B.inv = { stone: 5 }; r = F.storePut(B, 'stone', null, 0, 0, 1); t('いっぱいなら預けられない', !r.ok && /いっぱい/.test(r.why));
  // 持ち物がいっぱいなら取り出せない
  const T = F.newState(); T.home = { bx: 0, by: 0, xM: 0, yM: 0, ready: 0 }; T.inv = { stone: 200 }; T.store = { nut: 5 };
  t('持ち物満杯だと取り出せない', !F.storeTake(T, 'nut', null, 0, 0, 1).ok);
  // 壊す
  t('貯蔵庫が空でないと壊せない', !F.demolishHome(S).ok && S.home !== null);
  const E = F.newState(); E.home = { bx: 0, by: 0, xM: 0, yM: 0, ready: 0 }; t('空なら壊せる', F.demolishHome(E).ok && E.home === null);
  t('家が無いと壊せない', !F.demolishHome(F.newState()).ok);
  // 眠る
  const Z = F.newState(); Z.sickUntil = 20;
  t('何もない所では眠れない', !F.sleep(Z, 0, 0, 5).ok);
  Z.fire = { bx: 0, by: 0, until: 9 }; r = F.sleep(Z, 1, 1, 5); t('焚き火のそばで野宿（体調は戻らない）', r.ok && !r.home && Z.sickUntil === 20);
  Z.home = { bx: 0, by: 0, xM: 0, yM: 0, ready: 3 }; r = F.sleep(Z, 1, 1, 5); t('家で眠ると体調不良が治る', r.ok && r.home && !F.sick(Z, 5), JSON.stringify(Z));
  Z.home.ready = 99; Z.sickUntil = 20; t('建築中の家では眠れず野宿扱い', F.sleep(Z, 1, 1, 5).home === false);
  // 保存
  const V = F.newState(); V.home = { bx: 3, by: 4, xM: 100, yM: 200, ready: 9 }; V.store = { nutC: 12, stew: 3 }; V.fire = { bx: 1, by: 2, until: 8, xM: 5, yM: 6 };
  const L = F.load(JSON.parse(JSON.stringify(F.save(V)))); t('家・貯蔵・焚き火の座標を保存できる', JSON.stringify(L) === JSON.stringify(V), JSON.stringify(L));
  const bad = F.load({ home: { bx: 'a' }, store: { zzz: 4, nut: -2, fish: 3 } }); t('壊れた保存でも既定値', bad.home === null && bad.store.fish === 3 && !bad.store.zzz && !bad.store.nut);
  t('古い保存（家なし）', F.load({ inv: {} }).home === null);
}

// ---------------------------------------------------------------- 暮らしの目標
{
  const fixed = (v) => () => v;
  const G = F.newState();
  let g = F.goals(G); t('最初の目標は食べ物集め', !g.all && g.id === 'food' && g.have === 0 && g.need === 5 && g.done === 0 && g.total === 11, JSON.stringify(g));
  G.total = { nut: 3, fish: 1 }; g = F.goals(G); t('進み具合が数えられる', g.id === 'food' && g.have === 4);
  G.total = { nut: 3, fish: 2, firewood: 4 }; g = F.goals(G); t('食べ物が済むと次は薪', g.id === 'wood' && g.have === 4 && g.done === 1);
  G.total = { nut: 9, firewood: 12 }; g = F.goals(G); t('薪が済むと火', g.id === 'fire' && g.done === 2);
  // 火を起こすと数える
  const S = F.newState(); S.inv = { firewood: 2, fiber: 1 }; F.makeFire(S, 0, 0, 0, 1, fixed(0), false); t('火を起こすと数える', S.n.fire === 1);
  const S2 = F.newState(); S2.inv = { firewood: 2, fiber: 1 }; F.makeFire(S2, 0, 0, 0, 1, fixed(0.99), false); t('失敗は数えない', !S2.n.fire);
  // 焼いた物を食べる＝数える／果実は数えない／生魚は数えない
  const E = F.newState(); E.kcal = 100; E.inv = { fruit: 1, fish: 1, fishC: 1, stew: 1 };
  F.eat(E, 'fruit', fixed(0.9), 0); F.eat(E, 'fish', fixed(0.9), 0); t('果実と生魚は料理に数えない', !E.n.cooked);
  F.eat(E, 'fishC', fixed(0.9), 0); t('焼き魚で数える', E.n.cooked === 1); F.eat(E, 'stew', fixed(0.9), 0); t('煮物も数える', E.n.cooked === 2);
  // 家と眠る
  const H = F.newState(); H.inv = { firewood: 10, fiber: 12, rope: 2, clay: 4 }; F.buildHome(H, 0, 0, 0, 1, 1, true); t('家を建てると数える', H.n.home === 1);
  F.sleep(H, 0, 0, 1); t('建築中は家で眠った数に入らない', !H.n.sleepHome); F.sleep(H, 0, 0, 5); t('家で眠ると数える', H.n.sleepHome === 1);
  // 全部達成
  const A = F.newState(); A.total = { nut: 5, firewood: 10, rope: 1, clay: 4, pot: 1, nutL: 1, stew: 1 }; A.n = { fire: 1, cooked: 1, home: 1, sleepHome: 1 };
  g = F.goals(A); t('全部達成', g.all && g.done === 11 && /身につけた/.test(g.text), JSON.stringify(g));
  // 保存
  const L = F.load(JSON.parse(JSON.stringify(F.save(A)))); t('カウンターも保存', JSON.stringify(L.n) === JSON.stringify(A.n) && F.goals(L).all);
  t('古い保存でも目標は動く', F.goals(F.load({ inv: {} })).id === 'food');
  t('壊れた n でも落ちない', Object.keys(F.load({ n: { fire: 'x', cooked: -1 } }).n).length === 0);
}
console.log(ng ? 'FAIL ' + ng + ' / ' + (ok + ng) : 'OK ' + ok + ' 件通過');
process.exit(ng ? 1 : 0);
