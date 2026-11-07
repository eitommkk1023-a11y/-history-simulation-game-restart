const { chromium } = require('playwright'); const D = '/tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/t/';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-precise-memory-info'] });
  const ctx = await b.newContext({ viewport: { width: 874, height: 380 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('woh-dev', '1'); } catch (e) { } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file:///tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/v30/index3.html?autostart');
  await p.waitForFunction(() => window.__geo && window.__geo.world && !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 }); await p.waitForTimeout(3000);
  const ev = (f, a) => p.evaluate(f, a); let bad = 0; const t = (n, c, x) => { console.log((c ? 'OK  ' : 'NG  ') + n + (x !== undefined ? '  ' + x : '')); if (!c) bad++; };
  await ev(() => { const pe = window.__geo.people, out = []; for (const g of pe.groups) { if (!g.alive || !g.hist || g.settle !== 2) continue; out.push(g.id); if (out.length >= 5) break; } for (const id of out) window.__wohMapData.ensureLayout(id); const g = pe.groups[out[0] - 1]; __wohAvatar.toBlock(g.homeX, g.homeY, 0, 0); }); await p.waitForTimeout(4000);
  await ev(() => __wohGod.enter()); await p.waitForTimeout(1500);
  // パネルのスクロール（指の動き）：touchmove が止められていないこと
  const sc = await ev(() => { const bar = document.getElementById('godBar'); return { cls: bar.className, sh: bar.scrollHeight, ch: bar.clientHeight, ta: getComputedStyle(bar).touchAction, ov: getComputedStyle(bar).overflowY }; }); console.log('パネル', JSON.stringify(sc));
  t('パネルは、はみ出す内容をスクロールできる設定（scrollable・overflow・touch-action）', /scrollable/.test(sc.cls) && sc.ov === 'auto' && /pan-y/.test(sc.ta) && sc.sh > sc.ch);
  const blocked = await ev(() => { const bar = document.getElementById('godBar'), el = bar.querySelector('.gb-time'); const e = new Event('touchmove', { bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented; }); t('パネル内の指の動きが止められない（スクロールできる）', !blocked);
  await ev(() => { document.getElementById('godBar').scrollTop = 400; }); await p.waitForTimeout(200); t('スクロール位置が動く', await ev(() => document.getElementById('godBar').scrollTop > 100), await ev(() => document.getElementById('godBar').scrollTop));
  await p.screenshot({ path: D + 'godadv1.png' });
  // 年数を指定して進める
  const d0 = await ev(() => window.__geo.clock.day), c0 = await ev(() => window.__geo.people.npc.checksum()); const t0 = Date.now();
  await ev(() => { document.getElementById('godYears').value = 12; document.getElementById('godAdvGo').click(); }); await p.waitForTimeout(2500);
  t('進行画面が出る', await ev(() => !!document.getElementById('godAdv')), await ev(() => document.getElementById('gaTxt').textContent + ' / ' + document.getElementById('gaSub').textContent)); await p.screenshot({ path: D + 'godadv2.png' });
  await p.waitForFunction(() => !document.getElementById('godAdv'), null, { timeout: 600000 }); const sec = (Date.now() - t0) / 1000;
  const d1 = await ev(() => window.__geo.clock.day), c1 = await ev(() => window.__geo.people.npc.checksum());
  t('指定した年数（12年）だけ進む', Math.abs((d1 - d0) / 360 - 12) < 0.2, ((d1 - d0) / 360).toFixed(2) + '年・' + sec.toFixed(0) + '秒（' + (12 / sec).toFixed(2) + '年/秒）'); t('住民の状態が実際に変わる', c0 !== c1);
  const lay = await ev(() => { const pe = window.__geo.people; return pe.groups.filter(g => g.layout).map(g => Math.round((pe.npc.day - g.layout.t) / 30)); }); t('集落も同じ日まで進む', lay.length > 0 && lay.every(x => x <= 2), JSON.stringify(lay));
  t('進行後は止まっている（勝手に進み続けない）', await ev(async () => { const d = window.__geo.clock.day; await new Promise(r => setTimeout(r, 1500)); return window.__geo.clock.day === d; }));
  // 中止
  await ev(() => { document.getElementById('godYears').value = 200; document.getElementById('godAdvGo').click(); }); await p.waitForTimeout(3000); const dm = await ev(() => window.__geo.clock.day); await ev(() => document.getElementById('gaCancel').click()); await p.waitForFunction(() => !document.getElementById('godAdv'), null, { timeout: 60000 });
  const d2 = await ev(() => window.__geo.clock.day); t('中止できる（その月で止まる）', d2 > d1 && (d2 - d1) / 360 < 190 && d2 % 30 === 0, ((d2 - d1) / 360).toFixed(1) + '年');
  console.log('errors', errs.slice(0, 3)); if (errs.length) bad++; console.log(bad ? 'FAIL ' + bad : 'ALL OK'); await b.close(); process.exit(bad ? 1 : 0);
})();
