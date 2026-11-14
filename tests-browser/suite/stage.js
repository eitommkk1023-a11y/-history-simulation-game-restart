const WOH = require('../woh-env.js');
const { chromium } = require('playwright');
(async () => { for (const st of [2, 3]) { const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] }); const ctx = await b.newContext({ viewport: { width: 874, height: 380 }, hasTouch: true, isMobile: true }); await ctx.addInitScript(() => { try { localStorage.setItem('woh-dev', '1'); } catch (e) { } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const t0 = Date.now(); await p.goto(WOH.url('?small=ST&stage=') + st); await p.waitForFunction(() => document.body.classList.contains('god-on'), null, { timeout: 500000 }); const boot = Date.now() - t0;
  const r = await p.evaluate(() => { const pe = window.__geo.people, w = pe.win; return { km: [(w.x1 - w.x0) * 99.8667 / window.__geo.world.stats.width, (w.y1 - w.y0) * 99.8667 / window.__geo.world.stats.width].map(x => +x.toFixed(1)), groups: pe.groups.length, pop: pe.npc.livingCount() }; });
  await p.evaluate(() => window.__geo.skipDays(360 * 5)); const r2 = await p.evaluate(() => ({ pop: window.__geo.people.npc.livingCount(), groups: window.__geo.people.groups.filter(g => g.alive).length }));
  console.log('S' + st, JSON.stringify(r), '5年後', JSON.stringify(r2), '起動', (boot / 1000).toFixed(1) + 's', 'errors', JSON.stringify(errs)); await b.close(); } })();
