const WOH = require('../woh-env.js');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 874, height: 402 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + (process.argv[2] || WOH.HTML + '?autostart'));
  await p.waitForFunction(() => window.__geo && window.__geo.world && !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 });
  const info = () => p.evaluate(() => { const g = window.__geo, pe = g.people; if (!pe) return null; return { day: g.clock.day, living: pe.npc.livingCount(), groups: pe.groups.filter(x => x.alive).length, eth: pe.ethnicities.filter(x => x.alive).length, ev: g.history.list.filter(e => e.cat === 'people').length }; });
  console.log('起動', JSON.stringify(await info()));
  let t = Date.now(); await p.evaluate(() => window.__geo.skipDays(360 * 5)); console.log('5年進めた', Date.now() - t, 'ms', JSON.stringify(await info()));
  const st = await p.evaluate(() => { const s = window.__geo.serializeState(); return { hasPeople: !!s.people, n: s.people && s.people.meta.npc.n, mb: s.people ? ((s.people.birth.byteLength * 6 + s.people.skills.byteLength + s.people.train.byteLength) / 1048576).toFixed(2) : 0 }; });
  console.log('保存', JSON.stringify(st));
  // 保存→読み込み（IndexedDB を使わず、serializeState を loadState へ）
  const before = await info();
  await p.evaluate(() => { window.__saved = window.__geo.serializeState(); }); 
  await p.evaluate(() => window.__geo.loadState(window.__saved));
  await p.waitForFunction(() => !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 }); await p.waitForTimeout(500);
  const after = await info(); console.log('読み込み後', JSON.stringify(after), '一致', JSON.stringify(before.living) === JSON.stringify(after.living) && before.groups === after.groups);
  t = Date.now(); await p.evaluate(() => window.__geo.skipDays(360)); console.log('読み込み後に1年', Date.now() - t, 'ms', JSON.stringify(await info()));
  console.log('あなた：', await p.evaluate(() => document.getElementById('iYou').textContent), '／継承の確認', await p.evaluate(() => { const g = window.__geo, pe = g.people; return JSON.stringify(pe.player); }));
  console.log('errors', errs.slice(0, 5)); await b.close();
})();
