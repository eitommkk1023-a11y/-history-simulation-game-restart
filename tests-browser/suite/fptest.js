const WOH = require('../woh-env.js');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 874, height: 402 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(WOH.url('?autostart'));
  await p.waitForFunction(() => window.__geo && window.__geo.world && !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 });
  await p.waitForTimeout(2500);
  const sp = await p.evaluate(() => { const w = window.__geo.world, W = w.stats.width, H = w.stats.height, env = w.fauna.env, cc = w.climate.cell, step = Math.round(W / cc.w);
    const near = (x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const i = (y + dy) * W + x + dx; if (!w.type[i] || w.water[i]) return true; } return false; };
    for (let y = 80; y < H - 80; y += 4) for (let x = 80; x < W - 80; x += 4) { const ci = Math.floor(y / step) * cc.w + Math.floor(x / step); if (w.type[y * W + x] && env.grass[ci] > 120 && [7, 8, 9].includes(cc.zone[ci]) && !near(x, y, 6)) return { x, y }; } return null; });
  for (let k = 0; k < 3; k++) { await p.evaluate(([x, y]) => window.__wohAvatar.toBlock(x, y, 0, 0), [sp.x, sp.y]); await p.waitForTimeout(1300); }
  const shot = async (n) => { await p.waitForTimeout(700); await p.screenshot({ path: WOH.out('fp_') + n + '.png' }); };
  const info = () => p.evaluate(() => ({ fp: window.__wohAvatar.firstPerson, label: document.getElementById('fgView').textContent, fov: __chunkPreview.camera.fov, hidden: (() => { let vis = 0, tot = 0; __chunkPreview.character.traverse(o => { if (o.isMesh) { tot++; if (o.visible) vis++; } }); return vis + '/' + tot; })(), cam: __chunkPreview.camera.position.toArray().map(v => +v.toFixed(2)), me: __chunkPreview.character.position.toArray().map(v => +v.toFixed(2)) }));
  console.log('初期', JSON.stringify(await info())); await shot('0_third');
  await p.evaluate(() => document.getElementById('fgView').click()); await p.waitForTimeout(500);
  console.log('1人称', JSON.stringify(await info())); await p.evaluate(() => window.__wohAvatar.setView && 0); await shot('1_first');
  // 視線：ドラッグで見回す（右半分）
  await p.mouse.move(700, 150); await p.mouse.down(); await p.mouse.move(560, 110, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(400);
  console.log('見回し後', JSON.stringify(await info())); await shot('2_look');
  // 上下の限界
  await p.mouse.move(700, 200); await p.mouse.down(); await p.mouse.move(700, 20, { steps: 10 }); await p.mouse.move(700, 20); await p.mouse.up(); await p.waitForTimeout(300);
  await shot('3_up');
  // 前進：W を押して進む
  const a0 = await p.evaluate(() => ({ ...window.__wohAvatar.point }));
  await p.keyboard.down('KeyW'); await p.waitForTimeout(4000); await p.keyboard.up('KeyW');
  const a1 = await p.evaluate(() => ({ ...window.__wohAvatar.point }));
  console.log('Wで進んだ距離m', Math.round(Math.hypot(a1.xM - a0.xM, a1.yM - a0.yM) * 10) / 10);
  await shot('4_walk');
  // 家と焚き火：1人称で見る
  await p.evaluate(() => { const s = __wohForage.state; s.inv = { firewood: 30, fiber: 30, rope: 4, clay: 8 }; });
  await p.evaluate(() => document.getElementById('fgBag').click()); await p.waitForTimeout(300);
  for (let i = 0; i < 8; i++) { const r = await p.evaluate(() => { document.querySelector('#bagPanel [data-act="fire"]').click(); return document.getElementById('forageMsg').textContent; }); if (/火がついた/.test(r)) break; }
  await p.evaluate(() => document.querySelector('#bagPanel [data-act="home"]').click()); await p.waitForTimeout(300);
  await p.evaluate(() => document.getElementById('bagPanel').classList.remove('show'));
  await p.evaluate(() => window.__wohAvatar.setView(-1.2, 0.0, 4)); await shot('5_home_fire');
  // 3人称に戻す
  await p.evaluate(() => document.getElementById('fgView').click()); await p.waitForTimeout(500);
  console.log('戻した', JSON.stringify(await info())); await shot('6_back');
  // キーV
  await p.keyboard.press('KeyV'); await p.waitForTimeout(300); const k1 = (await info()).fp; await p.keyboard.press('KeyV'); await p.waitForTimeout(300);
  console.log('Vキーで切替', k1, (await info()).fp, 'ラベル', (await info()).label);
  console.log('errors', errs.slice(0, 5)); await b.close();
})();
