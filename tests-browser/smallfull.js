// 小規模ワールド：ブラウザでの総合検証
const { chromium } = require('playwright');
const UD = '/tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/ud_' + Date.now(); const U = 'file:///tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/v30/index3.html'; const D = '/tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/t/';
const launch = () => chromium.launchPersistentContext(UD, { args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-precise-memory-info'], viewport: { width: 874, height: 380 }, hasTouch: true, isMobile: true });
const SIG = () => { const pe = window.__geo.people, P = pe.npc; return { day: window.__geo.clock.day, chk: P.checksum(), living: P.livingCount(), stat: pe.statLog ? pe.statLog.days.length : 0, groups: pe.groups.filter(g => g.alive).map(g => [g.id, Math.round(g.pop), Math.round(g.food)]).join('|'), win: JSON.stringify(pe.win), lay: pe.groups.filter(g => g.layout).map(g => g.id + ':' + g.layout.t + ':' + g.layout.items.length).join('|') }; };
(async () => {
  let bad = 0; const t = (n, c, x) => { console.log((c ? 'OK  ' : 'NG  ') + n + (x !== undefined ? '  ' + x : '')); if (!c) bad++; };
  let ctx = await launch(); await ctx.addInitScript(() => { try { localStorage.setItem('woh-dev', '1'); localStorage.setItem('woh-seed-fixed', '1'); } catch (e) { } });
  let p = ctx.pages()[0] || await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  await p.goto(U); await p.waitForSelector('#titleScreen.show', { timeout: 60000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => { document.getElementById('tDevBox'); }); await p.evaluate(() => document.getElementById('tSmall').click());
  await p.waitForFunction(() => document.body.classList.contains('god-on'), null, { timeout: 500000 }); await p.waitForTimeout(2500);
  const ev = (f, a) => p.evaluate(f, a);
  const s0 = await ev(SIG); console.log('開始', JSON.stringify(s0).slice(0, 200));
  t('4村・約200人', s0.groups.split('|').length === 4 && s0.living >= 170 && s0.living <= 240, s0.living + '人');
  // 村ジャンプ
  await p.waitForTimeout(1500); const nJ = await ev(() => document.querySelectorAll('#godJump [data-jg]').length); t('村へジャンプの一覧に4村', nJ === 4, nJ);
  for (let i = 0; i < 4; i++) { await ev((i) => document.querySelectorAll('#godJump [data-jg]')[i].click(), i); await p.waitForTimeout(6000); const st = await ev(() => __wohGodView.state); t('村' + (i + 1) + 'へジャンプ（高さ・村人表示）', st.h < 200 && st.npcShown > 3, `h ${st.h.toFixed(0)} 村人 ${st.npcShown}`); if (i === 0) await p.screenshot({ path: D + 'sw_jump.png' }); }
  // 窓の端
  const edge = await ev(() => { const B = globalThis.__wohSmallBounds; __wohGodView.setView({ xM: B.x1 + 5000, yM: B.y1 + 5000 }); return B; }); await p.waitForTimeout(1500); const sE = await ev(() => __wohGodView.state);
  t('神モードのカメラが窓（20km）の外へ出ない', sE.xM <= edge.x1 + 50 && sE.yM <= edge.y1 + 50, `x ${sE.xM.toFixed(0)}/${edge.x1.toFixed(0)}`);
  // 月・年の早送り
  const d0 = await ev(() => window.__geo.clock.day); await ev(() => { document.getElementById('godYears').value = 3; document.getElementById('godUnit').value = '1'; document.getElementById('godAdvGo').click(); }); await p.waitForFunction(() => !document.getElementById('godAdv'), null, { timeout: 120000 }); const d1 = await ev(() => window.__geo.clock.day); t('3か月進める', d1 - d0 === 90, (d1 - d0) + '日');
  const tY = Date.now(); await ev(() => { document.getElementById('godYears').value = 5; document.getElementById('godUnit').value = '12'; document.getElementById('godAdvGo').click(); }); await p.waitForFunction(() => !document.getElementById('godAdv'), null, { timeout: 600000 }); const sec = (Date.now() - tY) / 1000; const d2 = await ev(() => window.__geo.clock.day); t('5年進める', d2 - d1 === 1800, `${(d2 - d1) / 360}年・${sec.toFixed(1)}秒（${(5 / sec).toFixed(2)}年/秒）`);
  // グラフ（食料）
  await ev(() => { const m = document.getElementById('godMetric'); m.value = 'fed'; m.dispatchEvent(new Event('change')); }); await p.waitForTimeout(1200); t('食料の充足のグラフ', await ev(() => /現在|記録をためて/.test(document.getElementById('godChartTxt').textContent)), await ev(() => document.getElementById('godChartTxt').textContent.slice(0, 70)));
  // 性能・保存容量
  await p.waitForTimeout(1500); const perf = await ev(() => document.getElementById('godPerf').textContent.replace(/\s+/g, ' ')); console.log('性能', perf); t('性能モニターが出る（FPS・1か月の計算・メモリ）', /FPS/.test(perf) && /1か月の計算/.test(perf));
  await ev(() => document.getElementById('godSaveMeasure').click()); await p.waitForTimeout(2500); const sv = await ev(() => document.getElementById('godSaveOut').textContent.replace(/\s+/g, ' ')); console.log('保存容量', sv); t('保存容量を測れる', /保存データ 約/.test(sv));
  await p.screenshot({ path: D + 'sw_panel.png' });
  // 保存→別セッション→続き
  const sB = await ev(SIG); await ev(() => __wohGod.exit()); await p.waitForTimeout(1500); await ev(() => document.getElementById('btnMenu').click()); await p.waitForTimeout(500); await ev(() => document.querySelector('#menuSlots [data-save="slot1"]').click()); await p.waitForTimeout(3000); await ctx.close();
  ctx = await launch(); p = ctx.pages()[0] || await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(U); await p.waitForSelector('#titleScreen.show', { timeout: 60000 }).catch(() => { }); await p.waitForTimeout(1500); await p.evaluate(() => document.getElementById('tLoad').click()); await p.waitForTimeout(800); await p.evaluate(() => document.querySelector('#menuSlots [data-load="slot1"]').click());
  await p.waitForFunction(() => window.__geo && window.__geo.world && window.__geo.people && !document.getElementById('loading').classList.contains('show'), null, { timeout: 500000 }); await p.waitForTimeout(3000);
  const sA = await p.evaluate(SIG); for (const k of ['day', 'chk', 'living', 'stat', 'groups', 'win']) t('保存→読み込みで一致：' + k, sB[k] === sA[k], String(sB[k]).slice(0, 40) + ' / ' + String(sA[k]).slice(0, 40));
  t('読み込み後も、小規模ワールド（窓の制限）が効く', await p.evaluate(() => !!globalThis.__wohSmallBounds && document.body.classList.contains('small-world')));
  await p.evaluate(() => __wohGod.enter()); await p.waitForTimeout(1500); const d3 = await p.evaluate(() => window.__geo.clock.day); await p.evaluate(() => { document.getElementById('godYears').value = 2; document.getElementById('godUnit').value = '12'; document.getElementById('godAdvGo').click(); }); await p.waitForFunction(() => !document.getElementById('godAdv'), null, { timeout: 600000 }); t('読み込み後に早送りを再開できる', (await p.evaluate(() => window.__geo.clock.day)) - d3 === 720);
  console.log('errors', errs.slice(0, 4)); if (errs.length) bad++; console.log(bad ? 'FAIL ' + bad : 'ALL OK'); await ctx.close(); process.exit(bad ? 1 : 0);
})();
