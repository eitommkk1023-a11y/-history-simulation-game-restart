'use strict';
// 小さな野戦の検証：node npc/test-battle.js [generator.js world.bin]   （引数があれば、実際の世界の標高の戦場でも動かす）
const Bt = require('./battle.js');
let ok = 0, ng = 0; const t = (name, cond, extra) => { if (cond) ok++; else { ng++; console.log('NG', name, extra == null ? '' : extra); } };
const W20 = [['spear', true, 10], ['spear', false, 4], ['sword', true, 2], ['bow', false, 4]];   // 20人の部隊

// ---------------------------------------------------------------- 場面（battle.js の scenario を使う）
const scenario = Bt.scenario;
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
function play(kind, seed, o, secs) { const B = scenario(kind, seed, o); Bt.run(B, secs || 1200); const S = Bt.summary(B); const a = S.sides[1], b = S.sides[2]; const enc = S.log.filter(l => l.e === 'encircled' && (B.units.find(u => u.id === l.unit) || {}).side === 1).length; return { B, S, enc, aOk: a.ok, bOk: b.ok, aDown: a.down, bDown: b.down, bWin: b.ok > a.ok, aRear: a.rear, aFlank: a.flank, sprung: S.stats.sprung }; }

// ---------------------------------------------------------------- 1. 向き：背面からの攻撃は、正面より傷が大きい（盾は正面を守る）
{
  const f = (sh, ang) => Bt.hitFactor({ x: 0, y: 0, f: 0, shield: sh }, Math.cos(ang) * 5, Math.sin(ang) * 5);
  t('正面：盾があれば傷が半分', f(true, 0) === 0.5 && f(false, 0) === 0.8); t('側面は等倍', f(false, Math.PI / 2) === 1.0); t('背面は1.6倍（盾も効かない）', f(true, Math.PI) === 1.6);
}
  { const s = { f: 0 }; Bt.face(s, Math.PI / 2); t('向きを変えるのには時間がかかる（0.5秒で約0.5ラジアン）', Math.abs(s.f - 0.5) < 1e-9); for (let i = 0; i < 3; i++) Bt.face(s, Math.PI / 2); t('数秒で向き直る', Math.abs(s.f - Math.PI / 2) < 1e-9); }
// ---------------------------------------------------------------- 2. 伝令：遅れて届く・届くまでは前の命令で動く・討たれることがある
{
  const F = Bt.makeField({ seed: 1, hill: 0 }), B = Bt.create(F, 1);
  const u = Bt.addUnit(B, { side: 1, x: 500, y: 800, facing: 0, weapons: W20 }); Bt.addCommander(B, 1, { x: 200, y: 800, doctrine: 'cautious' });
  Bt.issue(B, 1, u, { type: 'advance', x: 900, y: 800 }); let at = -1; for (let i = 0; i < 400; i++) { Bt.step(B); if (at < 0 && u.order.type === 'advance') at = B.t; }
  t('伝令の遅れ：約300mを走るので、届くのは40〜60秒後', at >= 40 && at <= 60, at);
  const B2 = Bt.create(F, 2), u2 = Bt.addUnit(B2, { side: 1, x: 500, y: 800, facing: 0, weapons: W20 }); Bt.addCommander(B2, 1, { x: 200, y: 800, doctrine: 'cautious' }); Bt.issue(B2, 1, u2, { type: 'advance', x: 900, y: 800 });
  for (let i = 0; i < 20; i++) Bt.step(B2); t('届くまでは、前の命令（持ち場）のまま', u2.order.type === 'hold');
  let lost = 0; for (let sd = 1; sd <= 30; sd++) { const Bx = Bt.create(F, sd), ux = Bt.addUnit(Bx, { side: 1, x: 500, y: 800, facing: 0, weapons: [['spear', true, 4]] }); Bt.addCommander(Bx, 1, { x: 200, y: 800, doctrine: 'cautious' }); const en = Bt.addUnit(Bx, { side: 2, x: 340, y: 800, facing: Math.PI, weapons: [['spear', true, 3]] }); en.order = { type: 'hold', x: 340, y: 800 }; Bt.issue(Bx, 1, ux, { type: 'advance', x: 900, y: 800 }); Bt.run(Bx, 60); if (Bx.stats.msgLost) lost++; }
  t('敵兵が通り道にいると、伝令が討たれることがある（30回中10回以上）', lost >= 10, lost);
}
// ---------------------------------------------------------------- 3. 視界：伏兵は近づくまで見えない／尾根と森は視界をさえぎる
{
  const F = Bt.makeField({ seed: 1, hill: 0, patches: [{ x: 600, y: 800, r: 50 }] }), B = Bt.create(F, 3);
  const a = Bt.addUnit(B, { side: 1, x: 400, y: 800, facing: 0, weapons: [['spear', true, 5]] }); const h = Bt.addUnit(B, { side: 2, x: 600, y: 800, facing: Math.PI, weapons: [['spear', true, 5]] });
  h.order = { type: 'ambush', x: 600, y: 800, facing: Math.PI, springR: 5, minEnemies: 99 }; for (let i = 0; i < 20; i++) Bt.step(B);
  t('隠れた伏兵は、200mからは見えない（相手の見たものに入らない）', h.hidden && ![...a.seen.keys()].some(id => h.members.some(s => s.id === id)), h.hidden);
  for (const s of a.members) { s.x = 575; s.y = 800; } B.t += 1; for (let i = 0; i < 4; i++) Bt.step(B);
  t('30m以内に近づくと、伏兵が見つかる（見つかった／飛び出した）', [...a.seen.keys()].some(id => h.members.some(s => s.id === id)) || B.stats.sprung > 0);
  const R = Bt.makeField({ seed: 1, size: 1600, elevFn: (x, y) => 30 * Math.exp(-Math.pow((x - 800) / 60, 2)) });
  t('尾根は視界をさえぎる', !R.los(600, 800, 1000, 800) && R.los(600, 800, 700, 800));
  const Fo = Bt.makeField({ seed: 1, hill: 0, patches: [{ x: 800, y: 800, r: 120 }] }); t('厚い森は視界をさえぎる', !Fo.los(600, 800, 1000, 800) && Fo.los(600, 400, 1000, 400));
}
// ---------------------------------------------------------------- 4. 士気：囲まれると崩れる（敵が一方向だけなら崩れにくい）
{
  const mk = (surround, seed) => { const F = Bt.makeField({ seed, hill: 0 }), B = Bt.create(F, seed); const me = Bt.addUnit(B, { side: 1, x: 800, y: 800, facing: 0, weapons: [['spear', true, 16]], discipline: 0.9 }); Bt.addCommander(B, 1, { x: 700, y: 800, doctrine: 'cautious' });
    const n = 30; for (let k = 0; k < (surround ? 3 : 1); k++) { const ang = surround ? (k * 2 * Math.PI / 3) : 0; const e = Bt.addUnit(B, { side: 2, x: 800 + Math.cos(ang) * 22, y: 800 + Math.sin(ang) * 22, facing: ang + Math.PI, weapons: [['spear', true, 10]], formation: 'loose', discipline: 0.9 }); e.order = { type: 'advance', x: 800, y: 800 }; }
    Bt.addCommander(B, 2, { x: 1500, y: 800, doctrine: 'cautious' }); Bt.run(B, 40); return B.stats.routs; };
  const rs = mean(Array.from({ length: 10 }, (_, i) => mk(true, i + 1))), r1 = mean(Array.from({ length: 10 }, (_, i) => mk(false, i + 1)));
  t('囲まれた部隊は、一方向から攻められた部隊より崩れる', rs > r1 + 1, rs + ' vs ' + r1);
}
// ---------------------------------------------------------------- 5. 偽装撤退と伏兵（本題）
{
  const N = 24, base = [], trick = [], cautious = [], sprungC = [];
  for (let sd = 1; sd <= N; sd++) { base.push(play('hold', sd, { A: { discipline: 0.1 } })); trick.push(play('trickster', sd, { A: { discipline: 0.1 } })); cautious.push(play('trickster', sd, { A: { discipline: 0.9, doctrine: 'cautious' } })); }
  const win = a => a.filter(r => r.bWin).length / a.length, ratio = a => mean(a.map(r => (r.aDown + 1) / (r.bDown + 1)));
  console.log('野戦の統計（A＝西の軍・命令どおり前進し、規律が低く敵を深追いする。24回ずつ、各軍60人）');
  console.log(`  B＝持ち場を守る（基準）      ：Bの勝ち ${(win(base) * 100).toFixed(0)}% ／ A損害÷B損害 ${ratio(base).toFixed(2)} ／ Aの背面・側面の損害 ${mean(base.map(r => r.aRear + r.aFlank)).toFixed(1)}人`);
  console.log(`  B＝偽装撤退と伏兵            ：Bの勝ち ${(win(trick) * 100).toFixed(0)}% ／ A損害÷B損害 ${ratio(trick).toFixed(2)} ／ Aの背面・側面の損害 ${mean(trick.map(r => r.aRear + r.aFlank)).toFixed(1)}人 ／ 伏兵が飛び出した ${trick.filter(r => r.sprung > 0).length}回`);
  console.log(`  Aが用心深い（前進しない）に対し、Bが伏兵：飛び出した ${cautious.filter(r => r.sprung > 0).length}回 ／ 双方の損害 平均 ${mean(cautious.map(r => r.aDown + r.bDown)).toFixed(1)}人`);
  t('偽装撤退と伏兵は、持ち場を守るだけより、勝ちが多い', win(trick) >= win(base) + 0.2, win(trick) + ' vs ' + win(base));
  const rf = a => mean(a.map(r => (r.aRear + r.aFlank) / Math.max(1, r.aDown)));
  console.log(`  Aの損害のうち、背面・側面から受けた割合：基準 ${(rf(base) * 100).toFixed(0)}% ／ 伏兵 ${(rf(trick) * 100).toFixed(0)}%`);
  t('伏兵で、相手の背面・側面の損害が増える（側面・背面から攻められる）', mean(trick.map(r => r.aRear + r.aFlank)) > mean(base.map(r => r.aRear + r.aFlank)) + 2 || rf(trick) > rf(base) + 0.08, mean(trick.map(r => r.aRear + r.aFlank)) + ' vs ' + mean(base.map(r => r.aRear + r.aFlank)));
  t('伏兵は、罠に入ったときだけ飛び出す（用心深い相手には飛び出さない）', trick.filter(r => r.sprung > 0).length >= N * 0.5 && cautious.filter(r => r.sprung > 0).length <= N * 0.25, trick.filter(r => r.sprung > 0).length + ' / ' + cautious.filter(r => r.sprung > 0).length);
  t('用心深い相手には、罠は効かず損害が小さい', mean(cautious.map(r => r.aDown + r.bDown)) < mean(trick.map(r => r.aDown + r.bDown)));
}
// ---------------------------------------------------------------- 6. 決定性と性能
{
  const a = play('trickster', 5, {}, 760), b = play('trickster', 5, {}, 760); t('決定性：同じSeedは同じ結果', JSON.stringify(a.S.sides) === JSON.stringify(b.S.sides) && a.S.log.length === b.S.log.length);
  const c = play('trickster', 6, {}, 760); t('Seedが違えば結果が違う', JSON.stringify(a.S.sides) !== JSON.stringify(c.S.sides) || a.S.log.length !== c.S.log.length);
  // 規模：1部隊20人×10部隊×2軍＝400人
  const F = Bt.makeField({ seed: 9, size: 1600, hill: 8 }), B = Bt.create(F, 9);
  for (let i = 0; i < 10; i++) { Bt.addUnit(B, { side: 1, x: 500, y: 300 + i * 100, facing: 0, weapons: W20, discipline: 0.3 }); Bt.addUnit(B, { side: 2, x: 700, y: 300 + i * 100, facing: Math.PI, weapons: W20, discipline: 0.3 }); }
  const ca = Bt.addCommander(B, 1, { x: 400, y: 800, doctrine: 'frontal' }); ca.guess = { x: 700, y: 800 }; ca.advanceAt = 5; Bt.addCommander(B, 2, { x: 800, y: 800, doctrine: 'cautious' });
  const t0 = process.hrtime.bigint(); const steps = 600; for (let i = 0; i < steps; i++) Bt.step(B); const ms = Number(process.hrtime.bigint() - t0) / 1e6 / steps;
  console.log(`規模（400人・5分）：1ステップ（0.5秒）あたり ${ms.toFixed(2)}ms`); t('400人でも1ステップ（0.5秒）は10ms以下（iPhoneで30fps以上の目安の約1/3）', ms <= 10, ms);
}
// ---------------------------------------------------------------- 7. 実際の世界の標高で動く
if (process.argv.length >= 4) {
  const v8 = require('v8'), fs = require('fs'), world = v8.deserialize(fs.readFileSync(process.argv[3]));
  const F = Bt.fieldFromWorld(world, 1500, 1500, { size: 1600, patches: [{ x: 800, y: 800, r: 60 }] });
  let mn = 1e9, mx = -1e9; for (const e of F.elev) { mn = Math.min(mn, e); mx = Math.max(mx, e); }
  const B = Bt.create(F, 4); Bt.addUnit(B, { side: 1, x: 300, y: 800, facing: 0, weapons: W20 }); Bt.addUnit(B, { side: 2, x: 1300, y: 800, facing: Math.PI, weapons: W20 }); Bt.addCommander(B, 1, { x: 200, y: 800, doctrine: 'cautious' }); Bt.addCommander(B, 2, { x: 1400, y: 800, doctrine: 'cautious' });
  Bt.run(B, 60); console.log(`実際の世界の戦場（${(F.size / 1000).toFixed(1)}km四方・標高 ${mn.toFixed(0)}〜${mx.toFixed(0)}m）：60秒を実行`); t('実際の標高の戦場で動く（標高に起伏がある）', mx - mn > 1 && B.t >= 60 - 1e-9, mx - mn);
}

// ---------------------------------------------------------------- 騎兵と荷馬車
{
  const mk = (seed) => { const F = Bt.makeField({ seed, size: 1800, hill: 0 }); return { F, B: Bt.create(F, seed) }; };
  const LANCE = [['lance', false, 12]], INF = [['spear', true, 14], ['spear', false, 6]];
  // 速さ・歩様
  { const { B } = mk(1); const c = Bt.addUnit(B, { side: 1, x: 200, y: 900, facing: 0, weapons: LANCE, mounted: true, discipline: 0.5 }), f = Bt.addUnit(B, { side: 1, x: 200, y: 1000, facing: 0, weapons: INF });
    Bt.addCommander(B, 1, { x: 100, y: 950, doctrine: 'cautious' }); Bt.issue(B, 1, c, { type: 'advance', x: 800, y: 900 }); Bt.issue(B, 1, f, { type: 'advance', x: 800, y: 1000 });
    for (let i = 0; i < 160; i++) Bt.step(B); const cc = Bt.unitCenter(c), fc = Bt.unitCenter(f);
    t('騎兵は歩兵の約2倍進む（80秒）', (cc.x - 200) > (fc.x - 200) * 1.8, (cc.x - 200) + ' vs ' + (fc.x - 200));
    const v = Bt.viewHorses(B); t('騎兵12騎＝馬12頭、騎手あり', v.horses.length === 12 && v.horses.every(h => h.rider === 1), v.horses.length);
    t('行軍中の馬は速歩〜駆け足の歩様', v.horses.every(h => ['trot', 'canter', 'walk'].includes(h.gait)), v.horses.map(h => h.gait).join()); }
  t('歩様：速さ→名前', Bt.gaitOf(0) === 'idle' && Bt.gaitOf(2) === 'walk' && Bt.gaitOf(4) === 'trot' && Bt.gaitOf(6) === 'canter' && Bt.gaitOf(9) === 'gallop');
  // 突撃：助走をつけると、止まったまま戦うより敵を多く倒す。背面・側面は正面より効く
  const charge = (runUp, seed, from) => { const { B } = mk(seed); const inf = Bt.addUnit(B, { side: 2, x: 900, y: 900, facing: Math.PI, weapons: INF, discipline: 0.9 }); Bt.addCommander(B, 2, { x: 1100, y: 900, doctrine: 'cautious' });
    const sx = from === 'back' ? 900 + runUp : from === 'flank' ? 900 : 900 - runUp, sy = from === 'flank' ? 900 + runUp : 900, fac = from === 'back' ? Math.PI : from === 'flank' ? -Math.PI / 2 : 0;
    const c = Bt.addUnit(B, { side: 1, x: sx, y: sy, facing: fac, weapons: LANCE, mounted: true, discipline: 0.5 }); Bt.addCommander(B, 1, { x: sx, y: sy, doctrine: 'cautious' }); Bt.issue(B, 1, c, { type: 'advance', x: 900, y: 900 }); Bt.run(B, 120); const S = Bt.summary(B); return S.sides[2].down + S.sides[2].flee; };
  const m = (f) => mean([1, 2, 3, 4, 5, 6, 7, 8].map(f));
  { const withRun = m(s => charge(150, s, 'front')), noRun = m(s => charge(5, s, 'front')); t('助走をつけた突撃は、止まって戦うより敵を多く倒す', withRun > noRun, withRun.toFixed(1) + ' vs ' + noRun.toFixed(1)); }
  { const front = m(s => charge(150, s, 'front')), back = m(s => charge(150, s, 'back')); t('騎兵は、槍の歩兵の背後から突くほうが、正面からより敵を倒す', back > front, back.toFixed(1) + ' vs ' + front.toFixed(1)); }
  // 槍衾：槍の歩兵に正面から突っ込むと、馬を失う
  let gotDead = false;
  { const lost = m(s => { const { B } = mk(s); Bt.addUnit(B, { side: 2, x: 900, y: 900, facing: Math.PI, weapons: [['spear', true, 20]], discipline: 0.9 }); Bt.addCommander(B, 2, { x: 1100, y: 900, doctrine: 'cautious' }); Bt.addCommander(B, 1, { x: 690, y: 900, doctrine: 'cautious' }); const c = Bt.addUnit(B, { side: 1, x: 700, y: 900, facing: 0, weapons: LANCE, mounted: true }); Bt.issue(B, 1, c, { type: 'advance', x: 900, y: 900 }); Bt.run(B, 120); const v = Bt.viewHorses(B); if (v.horses.some(q => q.state === 3 && q.rider === 0)) gotDead = true; return B.stats.horsesLost; });
    t('槍衾：正面から突っ込んだ騎兵は、馬を失う（平均1頭以上）', lost >= 1, lost.toFixed(1)); t('倒れた馬は state 3（倒れたまま）・乗り手なしで渡される', gotDead); }
  // 荷馬車：進む・敵が近づくと引く・歩兵に壊される
  { const { B } = mk(4); const tr = Bt.addTrain(B, { side: 1, x: 300, y: 900, facing: 0, wagons: 3, arrows: 100, dest: { x: 700, y: 900 }, home: { x: 100, y: 900 } }); Bt.addCommander(B, 1, { x: 100, y: 900, doctrine: 'cautious' }); Bt.addCommander(B, 2, { x: 1500, y: 900, doctrine: 'cautious' });
    for (let i = 0; i < 400; i++) Bt.step(B); t('荷馬車は目的地へ進む（200秒で約360m）', tr.every(w => w.x > 600), tr.map(w => Math.round(w.x)).join());
    const v = Bt.viewHorses(B); t('荷馬車の見た目の値：速さ・歩様・2頭立て', v.wagons.length === 3 && v.wagons.every(w => w.horses === 2 && w.state === 0)); }
  { const lostN = (guard) => { const { B } = mk(5); Bt.addTrain(B, { side: 1, x: 400, y: 900, facing: 0, wagons: 4, arrows: 100, dest: { x: 400, y: 900 }, home: { x: 400, y: 900 } }); Bt.addCommander(B, 1, { x: 380, y: 900, doctrine: 'cautious' }); Bt.addCommander(B, 2, { x: 660, y: 900, doctrine: 'cautious' });
      if (guard) Bt.addUnit(B, { side: 1, x: 460, y: 900, facing: 0, weapons: [['spear', true, 20]], discipline: 0.9 });
      const raid = Bt.addUnit(B, { side: 2, x: 650, y: 900, facing: Math.PI, weapons: [['sword', true, 12]], discipline: 0.9 }); Bt.issue(B, 2, raid, { type: 'advance', x: 400, y: 900 }); Bt.run(B, 240); return B.stats.wagonsLost; };
    const a = mean([1, 2, 3].map(() => lostN(false))), b = lostN(true); t('護衛が無い荷馬車は、敵の歩兵に壊される', a >= 3, a); t('護衛がいると、壊される荷馬車が減る', b < a, b + ' vs ' + a); }
  // 矢：荷馬車が近くに無いと、射手は矢が尽きて撃てなくなる。荷馬車があれば補給される
  { const arrowsLeft = (withWagon) => { const { B } = mk(6); const u = Bt.addUnit(B, { side: 1, x: 500, y: 900, facing: 0, weapons: [['bow', false, 10]], arrows: 8 }); Bt.addCommander(B, 1, { x: 100, y: 900, doctrine: 'cautious' }); Bt.addCommander(B, 2, { x: 1500, y: 900, doctrine: 'cautious' });
      if (withWagon) Bt.addTrain(B, { side: 1, x: 490, y: 900, facing: 0, wagons: 1, arrows: 5000, dest: { x: 490, y: 900 }, home: { x: 100, y: 900 } });
      Bt.addUnit(B, { side: 2, x: 560, y: 900, facing: Math.PI, weapons: [['spear', true, 30]], discipline: 0.9 }); Bt.run(B, 200); return mean(u.members.map(s => s.ar)); };
    const a = arrowsLeft(false), b = arrowsLeft(true); t('補給なし：矢が尽きる', a < 1, a); t('荷馬車が近くにあると、矢が補給される', b > a, b + ' vs ' + a); }
  // 5000体
  { const F = Bt.makeField({ seed: 1, size: 1800, hill: 8 }), B = Bt.create(F, 1); for (const side of [1, 2]) { for (let i = 0; i < 50; i++) Bt.addUnit(B, { side, x: side === 1 ? 700 : 1100, y: 100 + (i % 25) * 60 + Math.floor(i / 25) * 30, facing: side === 1 ? 0 : Math.PI, weapons: i % 5 === 0 ? [['lance', false, 50]] : [['spear', true, 30], ['bow', false, 10], ['sword', true, 10]], mounted: i % 5 === 0, discipline: 0.5 }); Bt.addCommander(B, side, { x: 800, y: 800, doctrine: 'frontal' }); }
    const t0 = Date.now(); for (let i = 0; i < 200; i++) Bt.step(B); const ms = (Date.now() - t0) / 200; console.log('5000体（うち騎兵1000）：1ステップ ' + ms.toFixed(1) + 'ms'); t('5000体でも1ステップ60ms以内（PC）', ms < 60, ms); }
}
console.log(ng ? 'FAIL ' + ng + ' / ' + (ok + ng) : 'OK ' + ok + ' 件通過'); process.exit(ng ? 1 : 0);
