const WOH = require('../woh-env.js');
// F4：月の処理を複数のコマに分けても（動物は種ごと→人々→集落）、一度に計算したのと同じ結果になる。保存の前に途中の処理は済まされる
const { chromium } = require('playwright');
async function run(b, slice) {
  const p = await (await b.newContext({ viewport: { width: 874, height: 380 } })).newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.addInitScript((sl) => { globalThis.__wohSliceMonth = sl; }, slice);
  await p.goto(WOH.url('?small=MS-7')); await p.waitForFunction(() => document.body.classList.contains('god-on'), null, { timeout: 500000 }); await p.waitForTimeout(1500);
  const r = await p.evaluate(async () => {
    // 世界の状態だけの要約（保存の時刻・通し番号・時計の端数（実際の時間で変わる）は除く）
    const H = (st) => { const txt = JSON.stringify([st.clock && st.clock.day].concat(['history', 'names', 'fauna', 'hunt', 'people', 'forage', 'sim', 'player'].map(k => st[k])), (k, x) => ArrayBuffer.isView(x) ? Array.from(x).join(',') : x); let h = 2166136261; for (let i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16) + ':' + txt.length; };
    const d0 = H(__wohZ.serialize()); const d0b = H(__wohZ.serialize());
    __geo.stepDaysPlay(95);   // 3か月と少し
    const st = __wohZ.serialize(); const PM = globalThis.__wohPerfMonth;
    const keys = {}; for (const k of ['history', 'names', 'fauna', 'hunt', 'people', 'forage', 'sim', 'player']) keys[k] = H({ clock: { day: 0 }, history: st[k] }); return { keys, digest: H(st), same0: d0 === d0b, frames: globalThis.__wohMonthFrames || [], stageMax: PM.stageMax || 0, monthMax: PM.maxMs, pop: __geo.people.groups.filter(g => g.alive).reduce((a, g) => a + g.pop, 0) };
  });
  // 月の初めの処理が残っている状態で保存すると、処理は済まされる
  const r2 = await p.evaluate(() => { let n = 0; while (!__wohMonthJob.pending && n++ < 40) __geo.stepDayOnly(); const was = __wohMonthJob.pending; __wohZ.serialize(); return { was, now: __wohMonthJob.pending }; });
  r.saveFinish = r2; await p.close(); return { r, errs };
}
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  let bad = 0; const t = (name, cond, extra) => { if (!cond) bad++; console.log((cond ? 'OK  ' : 'NG  ') + name, extra == null ? '' : extra); };
  const A = await run(b, false), B = await run(b, true);
  if (process.env.MS_TWICE) { const A2 = await run(b, false); console.log('分けない同士', A.r.digest === A2.r.digest, Object.keys(A.r.keys).filter(k => A.r.keys[k] !== A2.r.keys[k]).join(',')); }
  console.log('違う項目', Object.keys(A.r.keys).filter(k => A.r.keys[k] !== B.r.keys[k]).join(','));
  t('世界の要約は、同じ状態なら同じ', A.r.same0 && B.r.same0);
  t('分けない場合は、月の処理は1コマ', A.r.frames.length === 0, JSON.stringify(A.r.frames));
  t('分ける場合は、月の処理が複数のコマになる', B.r.frames.length >= 3 && B.r.frames.every(f => f >= 2), JSON.stringify(B.r.frames));
  t('分けても、3か月後の世界がまったく同じ', A.r.digest === B.r.digest, `${A.r.digest} / ${B.r.digest}（人口 ${A.r.pop} / ${B.r.pop}）`);
  t('月の処理の途中で保存すると、先に済まされる', B.r.saveFinish.was === true && B.r.saveFinish.now === false, JSON.stringify(B.r.saveFinish));
  console.log('1か月の最大（一度に）', A.r.monthMax.toFixed(1), 'ms／段階の最大（分けた）', B.r.stageMax.toFixed(1), 'ms');
  const errs = [...A.errs, ...B.errs]; console.log('errors', JSON.stringify(errs.slice(0, 3)));
  console.log(bad || errs.length ? 'NG あり' : 'ALL OK'); await b.close(); process.exit(bad || errs.length ? 1 : 0);
})();
