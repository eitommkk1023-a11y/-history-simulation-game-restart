const { chromium } = require('playwright'); const D = '/tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/t/';
(async () => { const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] }); const ctx = await b.newContext({ viewport: { width: 874, height: 380 }, hasTouch: true, isMobile: true }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file:///tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/v30/index3.html?small=LK-2'); await p.waitForFunction(() => document.body.classList.contains('god-on'), null, { timeout: 500000 }); await p.waitForTimeout(3000);
  const vis = () => p.evaluate(() => ({ bar: getComputedStyle(document.getElementById('godBar')).display, tog: document.getElementById('godUiToggle').textContent, hud: [...document.querySelectorAll('.hud')].map(e => getComputedStyle(e).display).join(',') }));
  console.log('初期', JSON.stringify(await vis()));
  await p.evaluate(() => document.getElementById('godUiToggle').click()); await p.waitForTimeout(500); console.log('非表示後', JSON.stringify(await vis())); await p.screenshot({ path: D + 'uioff.png' });
  await p.keyboard.press('KeyH'); await p.waitForTimeout(500); console.log('Hキー後', JSON.stringify(await vis()));
  // 通知：出来事を発生させて、画面に出ないこと・一覧に残ること
  await p.evaluate(() => { __geo.skipDays(360 * 3); }); await p.waitForTimeout(1500);
  console.log('通知', await p.evaluate(() => document.getElementById('toasts').children.length), '一覧', await p.evaluate(() => { document.getElementById('godEv').closest('details').open = true; return (globalThis.__wohGodEvents || []).length + '件／' + document.getElementById('godEv').textContent.slice(0, 80); }));
  console.log('解像度', await p.evaluate(() => JSON.stringify({ pr: __wohFrameStats.pixelRatio, now: window.devicePixelRatio }))); console.log('errors', JSON.stringify(errs.slice(0, 3))); await b.close(); })();
