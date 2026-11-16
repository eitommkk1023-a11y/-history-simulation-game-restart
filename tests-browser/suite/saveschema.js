const WOH = require('../woh-env.js');
// 保存の版管理・検査値・移行：新しい保存に schema と検査値が付く／圧縮しても検査値が合う／壊れた・新しすぎる記録は、世界を変えずに断る／古い記録（schema・検査値なし）は読み込める
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] }); const ctx = await b.newContext({ viewport: { width: 874, height: 380 }, hasTouch: true, isMobile: true }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(WOH.url('?small=SCH-1')); await p.waitForFunction(() => document.body.classList.contains('god-on'), null, { timeout: 500000 }); await p.waitForTimeout(2500);
  let bad = 0; const t = (name, cond, extra) => { if (!cond) bad++; console.log((cond ? 'OK  ' : 'NG  ') + name, extra == null ? '' : extra); };
  await p.evaluate(() => { __geo.skipDays(360); }); await p.waitForTimeout(1500);
  const info = await p.evaluate(async () => { const st = __wohZ.serialize(); const z = await __wohZ.pack(st), u = await __wohZ.unpack(z); const v = WohSave.verify(u); const raw = WohSave.verify(st); return { schema: st.schema, digest: typeof st.digest === 'string' && st.digest.length === 8, rawOk: raw.ok && raw.checked, zOk: v.ok && v.checked, cur: WohSave.CURRENT_SCHEMA, ms: (() => { const t0 = performance.now(); WohSave.digest(st); return Math.round(performance.now() - t0); })() }; });
  t('新しい保存に、版（schema）と検査値が付く', info.schema === info.cur && info.digest, JSON.stringify({ schema: info.schema, cur: info.cur }));
  t('圧縮して戻しても、検査値が合う（NaN などで壊れない）', info.rawOk && info.zOk); t('検査値の計算が軽い（100ms未満）', info.ms < 100, info.ms + 'ms');
  const ex = await p.evaluate(() => { const st = __wohZ.serialize(), text = JSON.stringify(__geo.packTyped(st)), back = __geo.unpackTyped(JSON.parse(text)), v = WohSave.verify(back); return { ok: v.ok && v.checked, kb: Math.round(text.length / 1024) }; });
  t('ファイルへの書き出し→読み込み（packTyped/unpackTyped）でも、検査値が合う', ex.ok, ex.kb + 'KB');
  const state = () => p.evaluate(() => ({ day: __geo.people.npc.day, living: WohPeople.peopleLayerSummary(__geo.people).total, msg: (document.getElementById('menuMsg') || {}).textContent || '' }));
  const s0 = await state();
  const refuse = async (mut, re, label) => { const r = await p.evaluate(async (m) => { const st = __wohZ.serialize(), z = await __wohZ.pack(st), u = await __wohZ.unpack(z); (new Function('u', m))(u); const out = __geo.loadState(u); await new Promise(r => setTimeout(r, 1200)); return { ret: out === false, msg: (document.getElementById('menuMsg') || {}).textContent || '', loading: document.getElementById('loading').classList.contains('show') }; }, mut); const s1 = await state(); t(label, r.ret && re.test(r.msg) && !r.loading && s1.day === s0.day && s1.living === s0.living, r.msg); };
  await refuse("u.people.birth[5] ^= 1;", /壊れている/, '壊れた記録（人々のデータを1か所書き換え）は、世界を変えずに断る');
  await refuse("u.clock.day += 1;", /壊れている/, '壊れた記録（日付を書き換え）は、断る');
  await refuse("u.schema = 99; u.digest = WohSave.digest(u);", /新しい版/, '新しすぎる版の記録は、断る');
  await refuse("u.people.death = u.people.death.slice(0, 5); u.digest = WohSave.digest(u);", /形が正しくありません/, '配列が短い記録（検査値は合っている）は、形の検査で断る');
  // 古い記録：schema・検査値がない → 読み込める
  const day0 = s0.day; await p.evaluate(async () => { const st = __wohZ.serialize(), z = await __wohZ.pack(st), u = await __wohZ.unpack(z); delete u.schema; delete u.digest; __geo.loadState(u); });
  await p.waitForTimeout(1500); await p.waitForFunction(() => !document.getElementById('loading').classList.contains('show') && document.body.classList.contains('god-on'), null, { timeout: 500000 }); await p.waitForTimeout(2000);
  const s2 = await state(); t('古い記録（schema・検査値なし）は読み込める（日付・人数が同じ）', s2.day === day0 && Math.abs(s2.living - s0.living) <= 2, `${day0}→${s2.day}、${s0.living}→${s2.living}`);
  console.log('errors', JSON.stringify(errs.slice(0, 3))); console.log(bad || errs.length ? 'NG あり' : 'ALL OK'); await b.close(); process.exit(bad || errs.length ? 1 : 0);
})();
