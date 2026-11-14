const WOH = require('../woh-env.js');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 874, height: 402 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(WOH.url('?autostart'));
  await p.waitForFunction(() => window.__geo && window.__geo.world && !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 });
  await p.waitForTimeout(1500);
  const chk = () => p.evaluate(() => { const g = window.__geo, y = WohPeople.peopleYou(g.people), a = globalThis.__wohAvatar, pt = a && a.point, sv = window.__wohPlayerSave && window.__wohPlayerSave(); return { camp: y.camp, avatarBlock: sv ? { x: +(sv.xM / 3330).toFixed(1), y: +(sv.yM / 3330).toFixed(1) } : null, rawSv: sv && { xM: Math.round(sv.xM), yM: Math.round(sv.yM) }, act: y.activity, sel: document.getElementById('iAct').value, selOptions: document.getElementById('iAct').options.length }; });
  console.log('起動直後', JSON.stringify(await chk()));
  // 活動を変える
  await p.evaluate(() => { const s = document.getElementById('iAct'); s.value = 'hunt'; s.dispatchEvent(new Event('change')); });
  await p.evaluate(() => window.__geo.skipDays(360)); console.log('狩りを選んで1年', JSON.stringify(await chk()));
  // 野営地を動かして、プレイヤーを亡くならせ、跡継ぎの野営地へ移るか
  const r = await p.evaluate(() => { const g = window.__geo, pe = g.people, N = pe.npc, id = pe.player.id, grp = pe.groups[N.group[id] - 1]; const old = { x: grp.x, y: grp.y }; grp.x = Math.min(2900, grp.x + 40); grp.y = Math.min(2900, grp.y + 25); N._die(id, 6); g.skipDays(30); const y = WohPeople.peopleYou(pe); return { old, newCamp: { x: grp.x, y: grp.y }, nowCamp: y.camp, gen: y.gen, act: y.activity, lineage: y.lineage }; });
  console.log('亡くなって継承', JSON.stringify(r)); await p.waitForTimeout(800); console.log('継承後', JSON.stringify(await chk()));
  console.log('errors', errs.slice(0, 5)); await b.close();
})();
