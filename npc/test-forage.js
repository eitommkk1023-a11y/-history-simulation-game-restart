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
console.log(ng ? 'FAIL ' + ng + ' / ' + (ok + ng) : 'OK ' + ok + ' 件通過');
process.exit(ng ? 1 : 0);
