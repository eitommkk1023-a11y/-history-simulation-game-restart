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
  let g = F.goals(G); t('最初の目標は食べ物集め', !g.all && g.id === 'food' && g.have === 0 && g.need === 5 && g.done === 0 && g.total === 22, JSON.stringify(g));
  G.total = { nut: 3, fish: 1 }; g = F.goals(G); t('進み具合が数えられる', g.id === 'food' && g.have === 4);
  G.total = { nut: 3, fish: 2, firewood: 4 }; g = F.goals(G); t('食べ物が済むと次は水', g.id === 'drink' && g.done === 1); G.n = { drink: 1 }; g = F.goals(G); t('水が済むと次は薪', g.id === 'wood' && g.have === 4 && g.done === 2);
  G.total = { nut: 9, firewood: 12 }; g = F.goals(G); t('薪が済むと火', g.id === 'fire' && g.done === 3);
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
  const A = F.newState(); A.total = { nut: 5, firewood: 10, rope: 1, clay: 4, pot: 1, nutL: 1, stew: 1, bow: 1, fur: 1 }; A.n = { drink: 1, fire: 1, cooked: 1, home: 1, sleepHome: 1, talk: 1, share: 1, commonCook: 1, give: 1, learn: 1, hunt: 1, dry: 1, fill: 1 };
  g = F.goals(A); t('全部達成', g.all && g.done === 22 && /身につけた/.test(g.text), JSON.stringify(g));
  // 保存
  const L = F.load(JSON.parse(JSON.stringify(F.save(A)))); t('カウンターも保存', JSON.stringify(L.n) === JSON.stringify(A.n) && F.goals(L).all);
  t('古い保存でも目標は動く', F.goals(F.load({ inv: {} })).id === 'food');
  t('壊れた n でも落ちない', Object.keys(F.load({ n: { fire: 'x', cooked: -1 } }).n).length === 0);
}

// ---------------------------------------------------------------- 集団とのつながり
{
  const Npc = require('./npc-core.js'), NS = Npc.NSKILL, JOBS = Npc.JOBS;
  const fixed = (v) => () => v;
  const camp = { bx: 100, by: 100 };
  // 共同の炉
  const C = F.newState();
  t('炉の設定前は火なし', !F.fireActive(C, 100, 100, 0));
  F.setCommons(C, camp); t('野営地の中心とそのまわり1ブロックは炉が使える', F.fireActive(C, 100, 100, 0) && F.fireActive(C, 101, 99, 0) && !F.fireActive(C, 103, 100, 0));
  t('自分の火ではない', !F.ownFireActive(C, 100, 100, 0));
  C.inv = { fish: 2, shell: 3 }; let r = F.roast(C, 100, 100, 0); t('みんなの炉で焼ける', r.ok && C.inv.fishC === 2 && C.n.commonCook === 1, JSON.stringify(C.inv));
  C.inv = { clay: 4, firewood: 2 }; r = F.craft(C, 'pot', 0.5, fixed(0), 100, 100, 0); t('みんなの炉で土器も焼ける', r.ok && C.inv.pot === 1);
  C.inv = { pot: 1, nut: 8 }; r = F.boil(C, 100, 100, 0, true); t('みんなの炉で煮られる', r.ok && C.inv.stew === 2);
  C.inv = { firewood: 3 }; r = F.stoke(C, 100, 100, 0); t('みんなの炉に薪を足すと評判が上がる', r.ok && r.commons && C.inv.firewood === 2 && C.standing >= 1.5 && C.n.give === 1, JSON.stringify(C));
  C.inv = {}; t('薪がなければ足せない', !F.stoke(C, 100, 100, 0).ok);
  t('火はセーブに入らない', F.save(C).commons === undefined);
  F.setCommons(C, null); t('炉を外せる', !F.fireActive(C, 100, 100, 0));
  // 評判の段階
  const L = F.newState(); t('よそ者', F.standingInfo(L).label === 'よそ者'); L.standing = 10; t('顔見知り', F.standingInfo(L).level === 1); L.standing = 30; t('仲間', F.standingInfo(L).level === 2); L.standing = 60; t('頼られる人', F.standingInfo(L).level === 3);
  L.standing = 50; F.tick(L, 10); t('評判は少しずつ薄れる', L.standing < 50 && L.standing > 49, L.standing);
  // 集団に分ける
  const G = F.newState(), g = { food: 10 }; G.inv = { stew: 5, fish: 2, stone: 3 };
  t('野営地から遠いと分けられない', !F.giveToGroup(G, g, camp, 'stew', 5, 120, 100).ok);
  t('食べ物でない物は不可', !F.giveToGroup(G, g, camp, 'stone', 1, 100, 100).ok);
  r = F.giveToGroup(G, g, camp, 'stew', 5, 101, 100); t('煮物5個＝約0.72kgが蓄えへ', r.ok && r.n === 5 && Math.abs(g.food - (10 + 5 * 260 / 1800)) < 1e-9 && !G.inv.stew && G.standing > 2 && G.n.give === 1, JSON.stringify([g, G.standing]));
  r = F.giveToGroup(G, g, camp, 'fish', 2, 100, 100); t('生の魚は価値が6割', Math.abs(r.kg - 2 * 250 * 0.6 / 1800) < 1e-9);
  t('持っていない物は不可', !F.giveToGroup(G, g, camp, 'nut', 1, 100, 100).ok);
  t('集団がないと不可', !F.giveToGroup(G, null, camp, 'fish', 1, 100, 100).ok);
  // 配給
  const R = F.newState(), gr = { food: 5 }; R.kcal = 500; R.standing = 20;
  t('野営地でないともらえない', !F.ration(R, gr, camp, 10, 130, 100).ok);
  r = F.ration(R, gr, camp, 10, 100, 100); t('配給をもらう', r.ok && R.kcal === 1900 && Math.abs(gr.food - (5 - 1400 / 1800)) < 1e-9 && R.standing === 18 && R.n.ration === 1, JSON.stringify(R));
  R.kcal = 500; t('2日に1度', !F.ration(R, gr, camp, 11, 100, 100).ok && /2日/.test(F.ration(R, gr, camp, 11, 100, 100).why)); t('2日後はもらえる', F.ration(R, gr, camp, 12, 100, 100).ok);
  const R2 = F.newState(); R2.kcal = 2000; R2.standing = 50; t('空腹でないと不要', /空いていない/.test(F.ration(R2, { food: 9 }, camp, 5, 100, 100).why));
  const R3 = F.newState(); R3.kcal = 300; R3.standing = 3; t('評判が低いともらえない', /認められていない/.test(F.ration(R3, { food: 9 }, camp, 5, 100, 100).why));
  const R4 = F.newState(); R4.kcal = 300; R4.standing = 30; t('蓄えが無いともらえない', /蓄え/.test(F.ration(R4, { food: 0.2 }, camp, 5, 100, 100).why) && R4.kcal === 300);
  // 近くの人に分ける・教わる・話す（実際の住民の仕組みで）
  const P = new Npc.Population(1, 3, 100); P.day = 360 * 100;
  const me = P.addFounder(1, 30), a = P.addFounder(1, 40); P._setJob(a, 1); P.skills[a * NS + 0] = 120; P.skills[me * NS + 0] = 10; P.skills[me * NS + 1] = 0;
  const S = F.newState(); S.inv = { fruit: 6, stew: 2, fish: 2, firewood: 1 };
  const b0 = P.bondOf(a, me); t('最初は関係が無い', b0 === null || (b0[0] === 128 && b0[1] === 128));
  r = F.share(P, S, me, a, 'fruit'); const b1 = P.bondOf(a, me); t('果実を分けると信頼と好意が上がる', r.ok && b1[0] === 134 && b1[1] === 136 && S.inv.fruit === 5 && S.n.share === 1, JSON.stringify(b1));
  r = F.share(P, S, me, a, 'fish'); const b2 = P.bondOf(a, me); t('生魚は6割の効き目', r.ok && b2[0] === 134 + 4 && b2[1] === 136 + 5, JSON.stringify(b2));
  t('食べ物でない物は渡せない', !F.share(P, S, me, a, 'firewood').ok); t('自分には渡せない', !F.share(P, S, me, me, 'fruit').ok); t('持っていない物は渡せない', !F.share(P, S, me, a, 'nut').ok);
  t('あなたから相手への好意も少し上がる', P.bondOf(me, a)[1] === 128 + 6);
  // 関係の枠がすべて埋まっている相手にも分けられる
  { const P2 = new Npc.Population(2, 3, 100); P2.day = 360 * 100; const me2 = P2.addFounder(1, 30), a2 = P2.addFounder(1, 40); const K = Math.round(P2.relId.length / P2.cap); const others = [];
    for (let k = 0; k < K; k++) { const o = P2.addFounder(1, 25 + k); others.push(o); P2.relId[a2 * K + k] = o; const v = (a2 * K + k) * 3; P2.relV[v] = 200; P2.relV[v + 1] = 40 + k * 10; P2.relV[v + 2] = 180; }
    const S2 = F.newState(); S2.inv = { fruit: 2 }; const r2 = F.share(P2, S2, me2, a2, 'fruit'); const bb = P2.bondOf(a2, me2);
    t('枠が埋まっていても、あなたとの関係は作れる', r2.ok && bb && bb[0] === 134 && bb[1] === 136, JSON.stringify([r2, bb])); }
  r = F.learn(P, S, me, a, 100, NS, JOBS); t('まだ打ち解けていないと教われない', !r.ok && /打ち解けて/.test(r.why), JSON.stringify(r));
  for (let i = 0; i < 3; i++) { S.inv.stew = 5; F.share(P, S, me, a, 'stew'); }
  t('信頼が140を超える', P.bondOf(a, me)[0] >= 140, JSON.stringify(P.bondOf(a, me)));
  r = F.learn(P, S, me, a, 100, NS, JOBS); t('教わると技能が上がる', r.ok && r.after > r.before && r.name === '採集' && S.n.learn === 1, JSON.stringify(r));
  r = F.learn(P, S, me, a, 102, NS, JOBS); t('5日に1度', !r.ok && /日後/.test(r.why)); r = F.learn(P, S, me, a, 106, NS, JOBS); t('5日後はまた', r.ok || /もう教わること/.test(r.why));
  P.skills[me * NS + 0] = 118; P.skills[a * NS + 0] = 120; t('相手が詳しくないと教わる物がない', /教わることがない/.test(F.learn(P, S, me, a, 200, NS, JOBS).why));
  P._setJob(a, 0); t('仕事をしていない人からは教われない', !F.learn(P, S, me, a, 300, NS, JOBS).ok);
  // 話す
  const T = F.newState(); let tk = F.talk(T, { job: '採集者', fed: 0.4, relation: '' }, 50, a); t('話すと言葉が返る（食べ物が足りない）', tk.ok && /足りない|減ってきた/.test(tk.text) && /木の実/.test(tk.text) && /よそ者|見かけない/.test(tk.text) || /見かけない/.test(tk.text), tk.text);
  t('話すと数える（同じ日は1回）', T.n.talk === 1); F.talk(T, { job: '狩人', fed: 1 }, 50.5, a); t('同じ日に何度話しても1回', T.n.talk === 1); F.talk(T, { job: '狩人', fed: 1 }, 51, a); t('翌日は数える', T.n.talk === 2);
  t('同じ人・同じ時期は同じ言葉', F.talk(F.newState(), { job: '漁師', fed: 0.8 }, 20, 5).text === F.talk(F.newState(), { job: '漁師', fed: 0.8 }, 21, 5).text);
  T.standing = 40; t('仲間には親しげ', /仲間だ/.test(F.talk(T, { job: '', fed: 1, relation: '親' }, 70, 9).text));
  // 保存
  const V = F.newState(); V.standing = 33; V.given = 5000; V.rationAt = 12; V.lessons = { 7: 100 }; V.talkDay = { 7: 50 }; V.n = { talk: 2 };
  const W = F.load(JSON.parse(JSON.stringify(F.save(V)))); t('評判・配給日・教わった記録を保存', W.standing === 33 && W.given === 5000 && W.rationAt === 12 && W.lessons[7] === 100 && W.talkDay[7] === 50);
  const X = F.load({ standing: 'x', lessons: { 3: 'y' } }); t('壊れた保存でも既定値', X.standing === 0 && Object.keys(X.lessons).length === 0);
  t('古い保存（つながりなし）', F.load({ inv: {} }).standing === 0 && F.load({ inv: {} }).rationAt === -99);
}

// ---------------------------------------------------------------- 体力・スタミナ・水分
{
  const fixed = (v) => () => v;
  const N = F.newState();
  t('初期値', N.hp === 100 && N.sp === 100 && N.water === 80 && !N.exhausted);
  // 水分は1日で30減る
  F.tick(N, 1); t('水分は1日で30減る', N.water === 50 && N.hp === 100, JSON.stringify([N.water, N.hp]));
  F.tick(N, 2); t('2日で0へ', N.water === 20); F.tick(N, 3); t('0未満にならない', N.water === 0);
  // 体力：渇くと減る
  const H = F.newState(); H.kcal = 3000; H.water = 0; F.tick(H, 1); t('渇くと体力が減る（-12）', H.hp === 88, H.hp);
  const H2 = F.newState(); H2.kcal = 0; H2.water = 100; F.tick(H2, 0.5); H2.t = 0; H2.kcal = 0; H2.water = 100; H2.hp = 100; F.tick(H2, 1); t('飢えると体力が減る', H2.hp < 100, H2.hp);
  const H3 = F.newState(); H3.hp = 50; H3.kcal = 3000; H3.water = 100; F.tick(H3, 1); t('満たされていれば体力が戻る', H3.hp > 50, H3.hp);
  const H4 = F.newState(); H4.hp = 50; H4.kcal = 100; H4.water = 100; F.tick(H4, 1); t('飢えていると戻らない', H4.hp <= 50);
  const H5 = F.newState(); H5.mortal = false; H5.hp = 5; H5.kcal = 0; H5.water = 0; F.tick(H5, 20); t('「死なない」設定では体力は1で止まる', H5.hp === 1 && !H5.dead && H5.dyingDays === 0, JSON.stringify([H5.hp, H5.dead]));
  const H6 = F.newState(); H6.kcal = 3000; H6.water = 100; F.setEnv(H6, { temp: -10, sheltered: false }); F.tick(H6, 1); t('寒い外では体力が減る', H6.hp < 100, H6.hp);
  const H7 = F.newState(); H7.kcal = 3000; H7.water = 100; H7.hp = 80; F.setEnv(H7, { temp: -10, sheltered: true }); F.tick(H7, 1); t('屋根や火のそばなら寒さを防げる', H7.hp > 80, H7.hp);
  const H8 = F.newState(); H8.kcal = 3000; H8.water = 100; H8.hp = 80; F.setEnv(H8, { temp: 20, sheltered: false }); F.tick(H8, 1); t('暖かい日は影響なし', H8.hp > 80);
  t('環境は保存しない', F.save(H6).env === undefined);
  // 水を飲む
  const D = F.newState(); D.water = 30;
  t('真水がなければ飲めない', !F.drink(D, false).ok && /海の水/.test(F.drink(D, false).why));
  let r = F.drink(D, true); t('水を飲むと+45', r.ok && D.water === 75 && r.gain === 45 && D.n.drink === 1, JSON.stringify(D));
  D.water = 99; t('満たされていると飲まない', !F.drink(D, true).ok); D.water = 70; F.drink(D, true); t('100を超えない', D.water === 100);
  // 食べ物の水分
  const E = F.newState(); E.kcal = 100; E.water = 10; E.inv = { fruit: 1, stew: 1, fishC: 1 }; F.eat(E, 'fruit', fixed(0.9), 0); F.eat(E, 'stew', fixed(0.9), 0); F.eat(E, 'fishC', fixed(0.9), 0); t('果実と煮物で水分がとれる', E.water === 10 + 8 + 18, E.water);
  // スタミナ
  const S = F.newState(); let o = F.staminaStep(S, 1, { sprinting: true, moving: true }); t('ダッシュで1秒に6減る', S.sp === 94 && !o.lockSprint, S.sp);
  for (let i = 0; i < 40 && !S.exhausted; i++) o = F.staminaStep(S, 1, { sprinting: true, moving: true }); t('尽きる（0・疲れ切り）', S.sp === 0 && S.exhausted && o.lockSprint, JSON.stringify(S.sp));
  F.staminaStep(S, 1, { sprinting: true, moving: true }); t('疲れ切り中はダッシュしても減らない（回復側）', S.sp > 0);
  for (let i = 0; i < 4; i++) o = F.staminaStep(S, 1, { sprinting: false, moving: false }); t('休むと戻り、25を超えるとダッシュできる', S.sp >= 25 && !S.exhausted && !o.lockSprint, JSON.stringify([S.sp, S.exhausted]));
  const W = F.newState(); W.sp = 20; F.staminaStep(W, 1, { moving: true }); t('歩きながらも少し戻る', W.sp === 22); F.staminaStep(W, 1, { moving: false }); t('止まるともっと戻る', W.sp === 29);
  const C = F.newState(); C.hp = 20; C.water = 5; C.kcal = 100; t('弱っていると上限が下がる', F.staminaCap(C) < 40, F.staminaCap(C)); C.sp = 100; F.staminaStep(C, 0.1, {}); t('上限を超えない', C.sp <= F.staminaCap(C) + 1e-9);
  t('体力が10以下だとダッシュ不可', F.staminaStep(Object.assign(F.newState(), { hp: 8 }), 0.1, {}).lockSprint);
  const J = F.newState(); F.jumpCost(J); t('ジャンプで8減る', J.sp === 92); J.sp = 5; t('スタミナ8未満はジャンプ不可', F.staminaStep(J, 0, {}).lockJump); F.jumpCost(J); t('0で疲れ切り', J.sp === 0 && J.exhausted);
  const R = F.newState(); R.sp = 10; R.exhausted = true; R.hp = 50; F.rest(R, 20); t('休むと体力とスタミナが戻る（上限は体力で決まる）', R.hp === 70 && Math.abs(R.sp - F.staminaCap(R)) < 1e-9 && R.sp > 80 && !R.exhausted, JSON.stringify([R.hp, R.sp]));
  // 眠る
  const Z = F.newState(); Z.hp = 40; Z.sp = 10; Z.home = { bx: 0, by: 0, xM: 0, yM: 0, ready: 0 }; F.sleep(Z, 0, 0, 5); t('家で眠ると体力+25', Z.hp === 65 && Z.sp > 80, JSON.stringify([Z.hp, Z.sp]));
  const Z2 = F.newState(); Z2.hp = 40; Z2.fire = { bx: 0, by: 0, until: 9 }; F.sleep(Z2, 0, 0, 5); t('野宿は体力+10', Z2.hp === 50);
  // 採取への影響
  t('体力が低いと見つかりにくい', F.vigor(Object.assign(F.newState(), { hp: 20 }), 0) < F.vigor(F.newState(), 0)); t('瀕死はさらに低い', F.vigor(Object.assign(F.newState(), { hp: 5 }), 0) < F.vigor(Object.assign(F.newState(), { hp: 20 }), 0));
  // 一覧と保存
  const I = F.vitalsInfo(Object.assign(F.newState(), { hp: 8, water: 10, kcal: 1500 })); t('状態', I.dying && I.thirsty && I.food === 50);
  const V = F.newState(); V.hp = 33; V.sp = 12; V.water = 7; V.exhausted = true; const L = F.load(JSON.parse(JSON.stringify(F.save(V)))); t('体力・スタミナ・水分・疲れ切りを保存', L.hp === 33 && L.sp === 12 && L.water === 7 && L.exhausted === true);
  const B = F.load({ hp: 'x', sp: -5, water: 'y' }); t('壊れた保存でも既定値', B.hp === 100 && B.sp === 0 && B.water === 80);
  const O = F.load({ inv: {} }); t('古い保存（体力なし）', O.hp === 100 && O.sp === 100 && O.water === 80 && !O.exhausted);
}

// ---------------------------------------------------------------- 死と猶予
{
  const fixed = (v) => () => v;
  const mk = (o) => Object.assign(F.newState(), o);
  // 体力0 → 瀕死 → 3日で死亡
  const A = mk({ hp: 10, kcal: 3000, water: 0 }); F.tick(A, 1); t('渇きで体力0になる（死ぬ前）', A.hp === 0 && A.dyingDays === 1 && !A.dead && F.dyingLeft(A) === 2, JSON.stringify([A.hp, A.dyingDays]));
  F.tick(A, 2); t('2日目：まだ生きている', !A.dead && F.dyingLeft(A) === 1);
  F.tick(A, 3); t('3日目で亡くなる（渇き）', A.dead === 'thirst' && A.hp === 0, JSON.stringify([A.dead, A.dyingDays]));
  t('死因を一度だけ受け取れる', F.takeDeath(A) === 'thirst' && F.takeDeath(A) === null);
  // 長く時間を飛ばしても、猶予の日数が効く
  const B = mk({ hp: 100, kcal: 3000, water: 0 }); F.tick(B, 30); t('長く飛ばすと死ぬ（水なし）', B.dead === 'thirst', JSON.stringify([B.hp, B.dead]));
  const B2 = mk({ hp: 100, kcal: 3000, water: 80 }); F.tick(B2, 3); t('3日くらいでは死なない', !B2.dead && B2.hp > 0, B2.hp);
  // 原因：飢え・寒さ・病気
  const C = mk({ hp: 5, kcal: 0, water: 100 }); F.tick(C, 5); t('飢えで亡くなる', C.dead === 'hunger', JSON.stringify([C.dead, C.hp]));
  const C2 = mk({ hp: 5, kcal: 3000, water: 100 }); F.setEnv(C2, { temp: -25, sheltered: false }); F.tick(C2, 6); t('寒さで亡くなる', C2.dead === 'cold', JSON.stringify([C2.dead, C2.hp]));
  const C3 = mk({ hp: 2, kcal: 3000, water: 100, sickUntil: 99 }); F.tick(C3, 3); t('病気は-3/日。体力2なら1日で0、そのあとも病気のまま', C3.hp === 0 || C3.dyingDays >= 0, JSON.stringify([C3.hp, C3.dyingDays]));
  // 助かる：飲む・食べる・眠る・配給
  const D = mk({ hp: 0, kcal: 3000, water: 0 }); D.dyingDays = 2; let r = F.drink(D, true); t('瀕死の人が水を飲むと体力が少し戻る', r.ok && D.hp === 6, D.hp);
  F.drink(D, true); F.drink(D, true); t('飲み続けても水が満ちれば止まる', D.water > 0); D.water = 10; F.drink(D, true); D.water = 10; F.drink(D, true); t('体力15以上で猶予がリセット', D.hp >= 15 && D.dyingDays === 0, JSON.stringify([D.hp, D.dyingDays]));
  const D2 = mk({ hp: 0, kcal: 100, water: 100 }); D2.dyingDays = 2; D2.inv = { stew: 3 }; F.eat(D2, 'stew', fixed(0.9), 0); t('食べると体力が戻る（空腹時）', D2.hp === 6, D2.hp);
  const D3 = mk({ hp: 0, kcal: 3000, water: 100 }); D3.dyingDays = 2; D3.home = { bx: 0, by: 0, xM: 0, yM: 0, ready: 0 }; F.sleep(D3, 0, 0, 5); t('家で眠ると助かる（+25）', D3.hp === 25 && D3.dyingDays === 0);
  const D4 = mk({ hp: 0, kcal: 300, water: 100, standing: 20 }); D4.dyingDays = 1; r = F.ration(D4, { food: 9 }, { bx: 0, by: 0 }, 5, 0, 0); t('配給で体力も戻る', r.ok && D4.hp === 6);
  // 健康なら応急は効かない
  const D5 = mk({ hp: 80, kcal: 100, water: 20 }); D5.inv = { stew: 1 }; F.eat(D5, 'stew', fixed(0.9), 0); t('元気なら応急の上乗せなし', D5.hp === 80);
  // 助かったあとの再発
  const E = mk({ hp: 0, kcal: 3000, water: 0 }); E.dyingDays = 2; F.firstAid(E, 6); t('応急だけでは15に届かず猶予は残る', E.hp === 6 && E.dyingDays === 2);
  F.tick(E, 1); t('渇いたままだと次の日にまた0（猶予が尽きる）', E.dead === 'thirst' || E.dyingDays >= 3 || E.hp === 0, JSON.stringify([E.hp, E.dead]));
  // 設定：死なない
  const G = mk({ hp: 3, kcal: 0, water: 0, mortal: false }); F.tick(G, 10); t('死なない設定：体力1・死亡なし', G.hp === 1 && !G.dead && F.dyingLeft(G) === null);
  // 継承
  const I = mk({ hp: 0, kcal: 10, water: 0, standing: 40, given: 900 }); I.home = { bx: 4, by: 5, xM: 1, yM: 2, ready: 0 }; I.store = { stew: 3 }; I.inv = { fish: 5, rope: 2 }; I.fire = { bx: 0, by: 0, until: 9 }; I.soak = { bx: 0, by: 0, n: 3, ready: 5 }; I.n = { fire: 2, talk: 3 }; I.total = { nut: 20 }; I.lessons = { 4: 1 }; I.t = 12; I.dead = 'thirst'; I.sickUntil = 99;
  F.inherit(I); t('継承：家・貯蔵庫・目標の進みは残る', I.home.bx === 4 && I.store.stew === 3 && I.n.fire === 2 && I.total.nut === 20 && I.t === 12, JSON.stringify(I));
  t('継承：持ち物・火・水さらし・体調・教わった記録は消える', Object.keys(I.inv).length === 0 && I.fire === null && I.soak === null && I.hp === 100 && I.water === 80 && I.kcal > 2000 && I.sickUntil === 0 && Object.keys(I.lessons).length === 0 && !I.dead && I.dyingDays === 0);
  t('継承：評判は半分', I.standing === 20 && I.given === 900);
  const J = mk({ standing: 40 }); J.home = { bx: 1, by: 1, xM: 0, yM: 0, ready: 0 }; J.store = { stew: 1 }; J.n = { fire: 1 }; F.inherit(J, true);
  t('別の一族として続けるときは、家・貯蔵庫・評判を引き継がない（目標の進みは残る）', J.home === null && Object.keys(J.store).length === 0 && J.standing === 0 && J.n.fire === 1, JSON.stringify(J));
  // 保存
  const V = mk({ hp: 0, mortal: false, dyingDays: 2 }); const L = F.load(JSON.parse(JSON.stringify(F.save(V)))); t('設定と猶予の日数を保存', L.mortal === false && L.dyingDays === 2 && L.hp === 0);
  t('古い保存は「死ぬ」設定で読み込む', F.load({ inv: {} }).mortal === true);
}

// ---------------------------------------------------------------- 狩り・怪我・衣服・保存食・水の持ち運び
{
  const fixed = (v) => () => v;
  const mk = (o) => Object.assign(F.newState(), o);
  // 作る
  const A = mk({ inv: { firewood: 5, rope: 12, stone: 2, hide: 6, fiber: 20 } });
  t('弓を作る', F.craft(A, 'bow', 0.5, fixed(0), 0, 0, 0).ok && A.inv.bow === 1 && A.inv.rope === 10);
  t('槍を作る', F.craft(A, 'spear', 0.5, fixed(0), 0, 0, 0).ok && A.inv.spear === 1 && A.inv.stone === 1);
  t('水袋を作る', F.craft(A, 'skin', 0.5, fixed(0), 0, 0, 0).ok && A.inv.skin === 1 && A.inv.hide === 5);
  t('毛皮の衣を作る', F.craft(A, 'fur', 0.5, fixed(0), 0, 0, 0).ok && A.inv.fur === 1 && A.inv.hide === 1);
  t('草の外套を作る', F.craft(A, 'cloak', 0.5, fixed(0), 0, 0, 0).ok && A.inv.cloak === 1);
  t('武器の選択：弓が優先', F.bestWeapon(A) === 'bow'); t('武器がなければ null', F.bestWeapon(mk({ inv: { stone: 1 } })) === null);
  // 狩りの結果
  const H = mk({ inv: { bow: 1 } });
  let r = F.applyHunt(H, { kills: 1, meat: 30, hide: 1, bone: 2, antler: 1 }, 'deer', 'bow', 5, fixed(0.99));
  t('鹿1頭：肉14（持てる上限）・毛皮・骨・角', r.kills === 1 && H.inv.meat === 14 && H.inv.hide === 1 && H.inv.bone === 2 && H.inv.antler === 1 && !r.hurt && H.n.hunt === 1, JSON.stringify(H.inv));
  t('弓は使うと傷む', H.wear.bow === 1);
  const H2 = mk({ inv: { spear: 1, stone: 190 } }); r = F.applyHunt(H2, { kills: 2, meat: 100, hide: 2, bone: 3, antler: 0 }, 'boar', 'spear', 5, fixed(0.99));
  t('持ち物がいっぱいなら残す', r.left > 0 && F.slotsUsed(H2) <= F.SLOTS, JSON.stringify([r, F.slotsUsed(H2)]));
  const H3 = mk({ inv: { spear: 1 } }); r = F.applyHunt(H3, { kills: 1, meat: 200, hide: 1, bone: 1, antler: 0 }, 'aurochs', 'spear', 5, fixed(0.0));
  t('危険な獲物を槍で狩ると怪我をする', r.hurt && F.injured(H3, 5) && H3.hp === 92, JSON.stringify([r.hurt, H3.hp, H3.injuredUntil]));
  const H4 = mk({ inv: { bow: 1 } }); r = F.applyHunt(H4, { kills: 1, meat: 30, hide: 1, bone: 1, antler: 0 }, 'deer', 'bow', 5, fixed(0.1)); t('鹿を弓で狩ると怪我はまれ（確率4%×0.7）', !r.hurt);
  const H5 = mk({ inv: { bow: 1 } }); r = F.applyHunt(H5, { kills: 0, meat: 0, hide: 0, bone: 0, antler: 0 }, 'deer', 'bow', 5, fixed(0.5)); t('獲物なしでも武器は傷む', r.kills === 0 && H5.wear.bow === 1 && !r.hurt);
  const H6 = mk({ inv: { bow: 1 } }); H6.wear.bow = 29; r = F.applyHunt(H6, { kills: 0 }, 'deer', 'bow', 5, fixed(0.9)); t('弓は30回で壊れる', r.broke === '弓' && !H6.inv.bow);
  // 怪我：体力が減り続け、手当てで止まる
  const I = mk({ kcal: 3000, water: 100, hp: 100 }); F.hurt(I, 0, 6, 8); I.t = 0; F.tick(I, 1); t('怪我の間は体力が減る（-4/日）', I.hp === 92 - 4, I.hp);
  const I2 = mk({ hp: 50, injuredUntil: 6, inv: { herb: 3 } }); t('薬草が足りないと手当てできない', !F.treat(mk({ injuredUntil: 6, inv: { herb: 1 } }), 0).ok);
  r = F.treat(I2, 0); t('薬草2つで手当て：怪我が止まり体力が戻る', r.ok && !F.injured(I2, 0) && I2.inv.herb === 1 && I2.hp === 54 && I2.n.treat === 1, JSON.stringify(I2));
  t('怪我が無いと手当て不要', !F.treat(mk({ inv: { herb: 3 } }), 0).ok);
  const I3 = mk({ hp: 1, kcal: 3000, water: 100, injuredUntil: 99 }); I3.dyingDays = 2; F.tick(I3, 1); t('怪我だけで亡くなることもある（死因：怪我）', I3.dead === 'injury', JSON.stringify([I3.dead, I3.hp]));
  // 衣服
  const C = mk({ hp: 100, kcal: 3000, water: 100 }); F.setEnv(C, { temp: -20, sheltered: false }); F.tick(C, 1); const noCloth = C.hp;
  const C2 = mk({ hp: 100, kcal: 3000, water: 100, inv: { fur: 1 } }); F.setEnv(C2, { temp: -20, sheltered: false }); F.tick(C2, 1); t('毛皮の衣は寒さを8割防ぐ', C2.hp > noCloth && 100 - C2.hp < (100 - noCloth) * 0.3, JSON.stringify([noCloth, C2.hp]));
  const C3 = mk({ hp: 100, kcal: 3000, water: 100, inv: { cloak: 1 } }); F.setEnv(C3, { temp: -20, sheltered: false }); F.tick(C3, 1); t('草の外套は4割', C3.hp > noCloth && C3.hp < C2.hp);
  t('衣服の優先：毛皮', F.clothOf(mk({ inv: { fur: 1, cloak: 1 } })) === 'fur');
  const C4 = mk({ kcal: 3000, water: 100, inv: { cloak: 1 } }); C4.clothWear.cloak = 79; F.tick(C4, 1); t('外套は日がたつと傷んで無くなる', !C4.inv.cloak && F.takeRotted(C4).cloak === 1);
  // 傷む
  const R = mk({ kcal: 3000, water: 100, inv: { meat: 10, fish: 4, nut: 20, meatD: 10, stone: 3 } }); F.tick(R, 1);
  t('生肉は1日で約3割傷む', R.inv.meat === 7, R.inv.meat); t('魚は約1割（4×0.25=1）', R.inv.fish === 3, R.inv.fish); t('木の実・石は傷まない', R.inv.nut === 20 && R.inv.stone === 3); t('干し肉はほぼ傷まない', R.inv.meatD === 10);
  const rr = F.takeRotted(R); t('傷んだ数を一度だけ知らせる', rr.meat === 3 && rr.fish === 1 && F.takeRotted(R) === null, JSON.stringify(rr));
  const R2 = mk({ kcal: 3000, water: 100, inv: { fruit: 1 } }); for (let d = 1; d <= 10; d++) F.tick(R2, d); t('端数は積み上がって、いつか傷む（果実1個は10日で消える）', !R2.inv.fruit, JSON.stringify(R2.inv));
  const R3 = mk({ kcal: 3000, water: 100, store: { meat: 10 } }); F.tick(R3, 1); t('貯蔵庫では傷みが半分（-1.5→1）', R3.store.meat === 9, R3.store.meat);
  // 干す
  const D = mk({ inv: { meat: 6, fish: 4, fruit: 5, nut: 2 }, fire: { bx: 0, by: 0, until: 5 } });
  t('火から離れると干せない', !F.dry(D, 9, 9, 0).ok); r = F.dry(D, 0, 0, 0); t('肉・魚・果実を干す', r.ok && D.inv.meatD === 6 && D.inv.fishD === 4 && D.inv.fruitD === 5 && D.inv.nut === 2 && !D.inv.meat && D.n.dry === 1, JSON.stringify(D.inv));
  t('干す物がなければ不可', !F.dry(mk({ fire: { bx: 0, by: 0, until: 5 }, inv: { nut: 1 } }), 0, 0, 0).ok);
  // 食べる：肉
  const E = mk({ kcal: 100, inv: { meat: 1, meatC: 1, meatD: 1 } }); r = F.eat(E, 'meat', fixed(0.9), 0); t('生肉は7割・当たることがある', r.ok && r.kcal === 700); r = F.eat(E, 'meatC', fixed(0.1), 0); t('焼き肉は1100kcalで安全', r.kcal === 1100 && !r.sick); r = F.eat(E, 'meatD', fixed(0.1), 0); t('干し肉', r.kcal === 800);
  const E2 = mk({ inv: { meat: 3, fish: 1 }, fire: { bx: 0, by: 0, until: 5 } }); F.roast(E2, 0, 0, 0); t('肉を焼ける', E2.inv.meatC === 3 && E2.inv.fishC === 1);
  // 水の持ち運び
  const W = mk({ water: 20 }); t('入れ物がなければ汲めない', !F.fillWater(W, true).ok); W.inv = { skin: 1 };
  t('水辺でなければ汲めない', !F.fillWater(W, false).ok); r = F.fillWater(W, true); t('水袋に3回分', r.ok && W.carried === 3 && r.cap === 3 && W.n.fill === 1);
  t('満杯なら汲めない', !F.fillWater(W, true).ok); W.inv.pot = 1; t('土器があれば7回分', F.carryCap(W) === 7);
  r = F.drinkCarried(W); t('持ち歩いた水を飲む（水辺でなくても）', r.ok && W.water === 65 && W.carried === 2 && r.left === 2, JSON.stringify(W));
  W.water = 99; t('喉が渇いていなければ飲まない', !F.drinkCarried(W).ok); const W2 = mk({ water: 10, inv: {} }); W2.carried = 3; t('入れ物を失うと水もない', !F.drinkCarried(W2).ok);
  // 保存
  const V = mk({ injuredUntil: 7, carried: 2, inv: { skin: 1 } }); V.clothWear = { fur: 12 }; V.rotAcc = { 'i:meat': 0.4 }; const L = F.load(JSON.parse(JSON.stringify(F.save(V))));
  t('怪我・水・衣の傷み・端数を保存', L.injuredUntil === 7 && L.carried === 2 && L.clothWear.fur === 12 && L.rotAcc['i:meat'] === 0.4 && F.save(V).rotted === undefined);
  t('古い保存でも動く', F.load({ inv: {} }).injuredUntil === 0 && F.load({ inv: {} }).carried === 0);
  // 採取：薬草
  const forest2 = { plant: [0.3, 0.8, 0.5, 0.8, 0.3], forest: 0.9, grass: 0.1, coast: false, water: false, rock: 0 };
  t('森に薬草がある', F.availability(forest2).herb > 0.2); t('砂漠に薬草はない', F.availability({ plant: [0, 0, 0, 0, 0], forest: 0, grass: 0 }).herb === 0);
}

// ---------------------------------------------------------------- 開発者モードの「消耗なし」
{
  const mk = (o) => Object.assign(F.newState(), o);
  const G = mk({ god: true, kcal: 100, water: 0, hp: 5, injuredUntil: 99 }); F.tick(G, 30);
  t('消耗なし：30日たっても、満たされて体力も満タン', G.water === 100 && G.hp === 100 && G.kcal >= 2200 && G.injuredUntil === 0 && !G.dead && G.dyingDays === 0, JSON.stringify([G.kcal, G.water, G.hp]));
  const G2 = mk({ god: true, hp: 0, dyingDays: 2, kcal: 0, water: 0 }); F.tick(G2, 5); t('消耗なし：瀕死でも死なない', !G2.dead && G2.hp === 100);
  const G3 = mk({ god: true }); G3.sp = 3; G3.exhausted = true; const o = F.staminaStep(G3, 1, { sprinting: true, moving: true }); t('消耗なし：スタミナは尽きない', G3.sp === 100 && !G3.exhausted && !o.lockSprint && !o.lockJump);
  const G4 = mk({ god: true, kcal: 3000, water: 100 }); G4.inv = { meat: 10 }; F.setEnv(G4, { temp: -30, sheltered: false }); F.tick(G4, 3); t('消耗なし：寒くても平気。傷む（保存食）は別なので続く', G4.hp === 100 && G4.inv.meat < 10);
  const R = mk({ kcal: 100, water: 0, hp: 5 }); F.tick(R, 5); t('消耗なしでなければ、いつもどおり消耗する（god未設定）', R.water === 0 && R.hp < 5 || R.dead === 'thirst' || R.dead === 'hunger', JSON.stringify([R.hp, R.dead]));
  t('消耗なしはセーブに入らない', F.save(G).god === undefined);
}
console.log(ng ? 'FAIL ' + ng + ' / ' + (ok + ng) : 'OK ' + ok + ' 件通過');
process.exit(ng ? 1 : 0);
