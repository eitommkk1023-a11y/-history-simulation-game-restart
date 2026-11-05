// node npc/test-forage.js
const F = require('./forage.js');
let ok = 0, ng = 0;
const t = (name, cond, extra) => { if (cond) ok++; else { ng++; console.log('NG', name, extra == null ? '' : extra); } };
const rngSeed = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

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
  t('重さは上限以内', F.weight(st) <= F.CARRY_KG + 1e-9, F.weight(st));
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
{ const st = F.newState(); st.inv.stone = 25; const r = F.gather(st, { ...desert, rock: 1 }, 0, 0, 0, rngSeed(9), { want: 'stone' }); t('満杯なら失敗', !r.ok && /持ちきれない/.test(r.why), JSON.stringify(r)); }
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
  t('壊れた保存でも落ちない', F.weight(F.load({ inv: { x: 5, nut: -1 }, depl: { a: 3 } })) === 0);
  t('null でも落ちない', F.weight(F.load(null)) === 0);
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
  const w2 = F.newState(); w2.inv = { nut: 5, stone: 24 }; F.soakStart(w2, 0, 0, 0, true); w2.inv.stone = 25;
  r = F.soakCollect(w2, 0, 0, 3); t('満杯なら受け取れず残る', !r.ok && /持ちきれない/.test(r.why) && w2.soak.n === 5, JSON.stringify(r));

  // 保存・読み込み
  const sv = F.newState(); sv.kcal = 1234; sv.t = 7; sv.sickUntil = 9; sv.fire = { bx: 1, by: 2, until: 8 }; sv.soak = { bx: 3, by: 4, n: 6, ready: 9 }; sv.inv = { nutC: 2 };
  const ld = F.load(JSON.parse(JSON.stringify(F.save(sv)))); t('暮らしの状態も保存・読み込みできる', JSON.stringify(ld) === JSON.stringify(sv), JSON.stringify(ld));
  const bad = F.load({ kcal: 'x', fire: { bx: 1 }, soak: { n: -1 }, t: null }); t('壊れた保存でも既定値', bad.fire === null && bad.soak === null && bad.kcal === 2200);
  const old = F.load({ inv: { nut: 3 }, depl: {}, total: {}, seq: 5 }); t('古い保存（暮らし項目なし）を読める', old.kcal === 2200 && old.inv.nut === 3 && old.seq === 5);
  // 元気さが採取に効く
  const sum = (v) => { let n = 0; for (let sd = 1; sd <= 300; sd++) { const s = F.newState(); if (F.gather(s, forest, 0, 0, 0, rngSeed(sd), { want: 'nut', vigor: v }).ok) n++; } return n; };
  t('飢えると見つかりにくい', sum(0.6) < sum(1), sum(0.6) + ' vs ' + sum(1));
}
console.log(ng ? 'FAIL ' + ng + ' / ' + (ok + ng) : 'OK ' + ok + ' 件通過');
process.exit(ng ? 1 : 0);
