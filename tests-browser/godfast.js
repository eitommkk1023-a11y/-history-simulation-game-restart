// 神モード追加要望：高速進行・統計・ランキング・保存整合
const { chromium } = require('playwright');
const UD = '/tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/ud_' + Date.now(); const U = 'file:///tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/v30/index3.html'; const D = '/tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/t/';
const launch = () => chromium.launchPersistentContext(UD, { args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-precise-memory-info'], viewport: { width: 874, height: 380 }, hasTouch: true, isMobile: true });
const SIG = () => { const pe = window.__geo.people, P = pe.npc; const L = pe.statLog; return { day: window.__geo.clock.day, chk: P.checksum(), living: P.livingCount(), stat: L ? L.days.length : 0, last: L ? L.pop[L.pop.length - 1] : 0, lay: pe.groups.filter(g => g.layout).map(g => g.id + ':' + g.layout.t + ':' + g.layout.items.length + ':' + g.layout.log.length).join('|') }; };
(async () => {
  let bad = 0; const t = (n, c, x) => { console.log((c ? 'OK  ' : 'NG  ') + n + (x !== undefined ? '  ' + x : '')); if (!c) bad++; };
  let ctx = await launch(); await ctx.addInitScript(() => { try { localStorage.setItem('woh-dev', '1'); } catch (e) { } });
  let p = ctx.pages()[0] || await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  await p.goto(U + '?autostart'); await p.waitForFunction(() => window.__geo && window.__geo.world && !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 }); await p.waitForTimeout(3000);
  const ev = (f, a) => p.evaluate(f, a);
  // 村を2つ以上作っておく（集落の更新を見るため）
  const ids = await ev(() => { const pe = window.__geo.people, out = []; for (const g of pe.groups) { if (!g.alive || !g.hist || g.settle !== 2) continue; out.push(g.id); if (out.length >= 5) break; } for (const id of out) window.__wohMapData.ensureLayout(id); const g = pe.groups[out[0] - 1]; __wohAvatar.toBlock(g.homeX, g.homeY, 0, 0); return out; }); await p.waitForTimeout(5000);
  await ev(() => __wohGod.enter()); await p.waitForTimeout(1500);
  const s0 = await ev(SIG); const heap0 = await ev(() => Math.round(performance.memory.usedJSHeapSize / 1048576));
  // 高速：1年/秒・5年/秒・30年/秒 を10秒ずつ。実効の速さ（端末の限界）を測る
  const res = {}; for (const k of ['y1', 'y5', 'y30']) { const d0 = await ev(() => window.__geo.clock.day); await ev((k) => __wohGod.setTime(k), k); await p.waitForTimeout(10000); const m = await ev(() => ({ day: window.__geo.clock.day, eff: __wohClockEff(), fast: !!globalThis.__wohFastSim })); res[k] = { years: ((m.day - d0) / 360).toFixed(1), perSec: ((m.day - d0) / 360 / 10).toFixed(2), eff: m.eff, fast: m.fast }; console.log(k, JSON.stringify(res[k])); }
  t('1年/秒で高速進行する（実測）', parseFloat(res.y1.perSec) > 0.1);
  t('高速進行中は3D描画を省く', res.y30.fast === true);
  await ev(() => __wohGod.setTime('pause')); await p.waitForTimeout(1500);
  const s1 = await ev(SIG); const heap1 = await ev(() => Math.round(performance.memory.usedJSHeapSize / 1048576)); console.log('進行後', JSON.stringify(s1).slice(0, 220), 'ヒープ', heap0, '→', heap1, 'MB');
  t('日付だけでなく、人口の記録（統計）が増えた', s1.stat > s0.stat + 4, s0.stat + ' → ' + s1.stat); t('住民の状態（検査値）が変わった＝実際に計算された', s1.chk !== s0.chk);
  t('集落の建築・履歴が進んだ（遠い村も含む）', s1.lay !== s0.lay, '');
  const lay = await ev(() => { const pe = window.__geo.people; const out = []; for (const g of pe.groups) if (g.layout) { const L = g.layout; out.push({ id: g.id, behind: Math.round((pe.npc.day - L.t) / 30), log: L.log.length, stock: Math.round(Object.values(L.stock).reduce((a, x) => a + x, 0)), proj: L.proj.length }); } return out; });
  console.log('集落', JSON.stringify(lay)); t('作ってある全ての集落が、いまの日まで進んでいる（遅れ 2か月以内）', lay.length > 0 && lay.every(x => x.behind <= 2));
  // 統計・ランキング・グラフの表示
  await ev(() => document.querySelector('#godScope').value = 'world'); await p.waitForTimeout(1500);
  t('人口グラフが描かれる', await ev(() => /現在/.test(document.getElementById('godChartTxt').textContent)), await ev(() => document.getElementById('godChartTxt').textContent));
  await p.screenshot({ path: D + 'godstat1.png' });
  await ev(() => { const d = document.querySelector('#godBar details:nth-of-type(2)'); d.open = true; document.querySelector('#godRankKind').value = 'up'; document.querySelector('#godRankKind').dispatchEvent(new Event('change')); }); await p.waitForTimeout(800);
  t('ランキングが出る', await ev(() => document.querySelectorAll('#godRank [data-rk]').length >= 5), await ev(() => document.querySelectorAll('#godRank [data-rk]').length));
  await ev(() => document.querySelector('#godRank [data-rk]').click()); await p.waitForTimeout(3500); t('ランキングから村へ飛べて、情報が出る', await ev(() => /民族/.test(document.getElementById('godInfo').innerText) && __wohGodView.state.h < 200));
  await ev(() => { document.querySelector('#godScope').value = 'group'; document.querySelector('#godScope').dispatchEvent(new Event('change')); }); await p.waitForTimeout(800); t('選んだ集落の人口グラフ', await ev(() => /年あたり|記録をためて/.test(document.getElementById('godChartTxt').textContent)), await ev(() => document.getElementById('godChartTxt').textContent.slice(0, 60)));
  await p.screenshot({ path: D + 'godstat2.png' });
  // 保存→別セッション→続き
  const sBefore = await ev(SIG); await ev(() => __wohGod.exit()); await p.waitForTimeout(1500); await ev(() => document.getElementById('btnMenu').click()); await p.waitForTimeout(500); await ev(() => document.querySelector('#menuSlots [data-save="slot1"]').click()); await p.waitForTimeout(3000); await ctx.close();
  ctx = await launch(); p = ctx.pages()[0] || await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(U); await p.waitForSelector('#titleScreen.show', { timeout: 60000 }).catch(() => { }); await p.waitForTimeout(1500); await p.evaluate(() => document.getElementById('tLoad').click()); await p.waitForTimeout(800); await p.evaluate(() => document.querySelector('#menuSlots [data-load="slot1"]').click());
  await p.waitForFunction(() => window.__geo && window.__geo.world && window.__geo.people && !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 }); await p.waitForTimeout(2500);
  const sAfter = await p.evaluate(SIG); for (const k of ['day', 'chk', 'living', 'stat', 'last']) t('保存→読み込みで一致：' + k, JSON.stringify(sBefore[k]) === JSON.stringify(sAfter[k]), JSON.stringify(sBefore[k]) + ' / ' + JSON.stringify(sAfter[k]));
  t('集落の時刻・履歴も一致', sBefore.lay === sAfter.lay);
  // 読み込み後に高速進行を再開できる
  const d2 = await p.evaluate(() => window.__geo.clock.day); await p.evaluate(() => { __wohGod.enter(); }); await p.waitForTimeout(1500); await p.evaluate(() => __wohGod.setTime('y5')); await p.waitForTimeout(6000); await p.evaluate(() => __wohGod.setTime('pause')); await p.waitForTimeout(1500);
  const d3 = await p.evaluate(() => window.__geo.clock.day); t('読み込み後も、高速進行を再開できる', d3 - d2 > 360, ((d3 - d2) / 360).toFixed(1) + '年');
  const sg = await p.evaluate(SIG); t('再開後も統計が続く', sg.stat > sAfter.stat);
  console.log('errors', errs.slice(0, 4)); if (errs.length) bad++; console.log(bad ? 'FAIL ' + bad : 'ALL OK'); await ctx.close(); process.exit(bad ? 1 : 0);
})();
