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
    for (let y = 80; y < H - 80; y += 4) for (let x = 80; x < W - 80; x += 4) { const ci = Math.floor(y / step) * cc.w + Math.floor(x / step); if (w.type[y * W + x] && env.grass[ci] > 120 && !near(x, y, 6)) return { x, y }; } return null; });
  console.log('場所', JSON.stringify(sp));
  for (let k = 0; k < 3; k++) { await p.evaluate(([x, y]) => window.__wohAvatar.toBlock(x, y, 0, 0), [sp.x, sp.y]); await p.waitForTimeout(1300); }
  await p.evaluate(() => { const s = __wohForage.state; s.inv = { firewood: 30, fiber: 30, rope: 4, clay: 8, nutC: 12, stew: 2 }; s.kcal = 2500; });
  await p.evaluate(() => document.getElementById('fgBag').click()); await p.waitForTimeout(300);
  const msg = () => p.evaluate(() => document.getElementById('forageMsg').textContent);
  const act = async (a, id) => { await p.evaluate(([a, id]) => { const el = document.querySelector('#bagPanel [data-act="' + a + '"]' + (id ? '[data-id="' + id + '"]' : '')); if (el) el.click(); else document.getElementById('forageMsg').textContent = '(ボタンなし ' + a + ')'; }, [a, id]); await p.waitForTimeout(200); return msg(); };
  const status = () => p.evaluate(() => document.getElementById('bagPanel').innerText.replace(/\n+/g, ' / ').slice(0, 260));
  console.log('預ける（家なし）:', await act('put', 'nutC'));
  console.log('家を建てる:', await act('home'));
  console.log('パネル:', await status());
  console.log('置き物', JSON.stringify(await p.evaluate(() => __wohProps.info())));
  console.log('すぐ預ける（建築中）:', await act('put', 'nutC'));
  console.log('眠る（家なし・火なし）:', await act('sleep'));
  console.log('火:', await (async () => { let r = ''; for (let i = 0; i < 8; i++) { r = await act('fire'); if (/火がついた/.test(r)) break; } return r; })());
  await p.waitForTimeout(1800);
  console.log('置き物（火あり）', JSON.stringify(await p.evaluate(() => __wohProps.info())));
  console.log('野宿:', await act('sleep'));
  console.log('日付', await p.evaluate(() => window.__geo.clock.day));
  await p.evaluate(() => window.__geo.skipDays(3)); await p.waitForTimeout(2200);
  console.log('家で預ける:', await act('put', 'nutC'));
  console.log('取り出す:', await act('take', 'nutC'));
  console.log('家で眠る:', await act('sleep'));
  console.log('パネル:', await status());
  
  console.log('パネル（家のそば）:', (await status()) + ' | ' + (await p.evaluate(() => document.getElementById('bagPanel').innerText.replace(/\n+/g, ' / ').slice(-260))));
  console.log('取り出す（残り）:', await act('take', 'nutC'));
  console.log('取り出す2:', await act('take', 'stew'));
  await act('put', 'stew');
  console.log('置き物', JSON.stringify(await p.evaluate(() => __wohProps.info())));
  // 見た目
  await p.evaluate(() => { document.getElementById('bagPanel').classList.remove('show'); });
  for (const yaw of [0, 1.57, 3.14, -1.57]) { await p.evaluate((y) => window.__wohAvatar.setView(y, 0.25, 9), yaw); await p.waitForTimeout(900); await p.screenshot({ path: WOH.out('home_') + yaw + '.png' }); }
  const sv = await p.evaluate(() => { const f = window.__geo.serializeState().forage; return { home: f.home, fire: f.fire, store: f.store }; });
  console.log('保存', JSON.stringify(sv));
  console.log('errors', errs.slice(0, 5)); await b.close();
})();
