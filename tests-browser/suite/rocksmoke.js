const WOH = require('../woh-env.js');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 874, height: 402 }, hasTouch: true, isMobile: true }); await ctx.addInitScript(() => { try { localStorage.setItem('woh-dev', '1'); } catch (e) {} });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(WOH.url('?autostart'));
  await p.waitForFunction(() => window.__geo && window.__geo.world && !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 });
  console.log('rocks version', await p.evaluate(() => window.__geo.world.rocks && window.__geo.world.rocks.version), 'gen ms', await p.evaluate(() => window.__geo.world.stats.ms));
  await p.evaluate(() => document.getElementById('viewMode').click()); await p.waitForTimeout(1500);
  await p.tap('#btnView'); await p.waitForTimeout(500); await p.screenshot({ path: 'rs_0.png' });
  const labels = await p.evaluate(() => Array.from(document.querySelectorAll('#displayChoices button')).map(b => b.textContent));
  console.log('choices', labels.join(' / '));
  const rb = labels.findIndex(t => /岩石24|岩石/.test(t));
  if (rb >= 0) { await p.evaluate((i) => document.querySelectorAll('#displayChoices button')[i].click(), rb); await p.waitForTimeout(1500); await p.screenshot({ path: 'rs_1.png' }); }
  console.log('save version', await p.evaluate(() => { const st = window.__geo.serializeState(); return st.rockGenerationVersion + ' genVersion ' + st.genVersion; }));
  console.log('errors', errs.slice(0, 4)); await b.close();
})();
