const WOH = require('../woh-env.js');
const { chromium } = require('playwright');
(async () => {
  const file = process.argv[2] || WOH.HTML + '?autostart';
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 874, height: 402 }, hasTouch: true, isMobile: true }); await ctx.addInitScript(() => { try { localStorage.setItem('woh-dev', '1'); } catch (e) {} });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto('file://' + file);
  await p.waitForFunction(() => window.__geo && window.__geo.world && !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.body.classList.add('dev-toolbar')); await p.waitForTimeout(300);
  await p.tap('#devMenu'); await p.waitForTimeout(400);
  const speeds = await p.evaluate(() => Array.from(document.querySelectorAll('#devSpeeds button')).map(b => b.textContent));
  console.log('dev speeds', speeds.join(' '));
  await p.evaluate(() => { const b = Array.from(document.querySelectorAll('#devSpeeds button')).find(b => b.textContent === '×100'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 3 })); });
  await p.waitForTimeout(800);
  await p.evaluate(() => document.body.classList.remove('dev-toolbar')); await p.waitForTimeout(300);   // 開発ツールを閉じて操作できる状態に
  const c = await ctx.newCDPSession(p);
  const st = await p.evaluate(() => { const r = document.getElementById('joystick').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: st[0], y: st[1] }] });
  for (let k = 1; k <= 6; k++) await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: st[0], y: st[1] - 12 * k }] });
  await p.waitForTimeout(3000);
  console.log('hud', await p.textContent('#hudStats'));
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const msg = await p.evaluate(() => (document.getElementById('movementNotice') || {}).textContent);
  console.log('notice:', msg);
  console.log('errors', errs.slice(0, 4)); await b.close();
})();
