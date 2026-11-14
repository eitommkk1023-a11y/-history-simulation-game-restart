const WOH = require('../woh-env.js');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 874, height: 402 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(WOH.url('?autostart'));
  await p.waitForFunction(() => window.__geo && window.__geo.world && !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 });
  await p.waitForTimeout(2500);
  const sp = await p.evaluate(() => { const w = window.__geo.world, W = w.stats.width, H = w.stats.height; const coastNear = (x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!w.type[(y + dy) * W + x + dx]) return true; return false; };
    for (let y = 80; y < H - 80; y += 2) for (let x = 80; x < W - 80; x += 2) { const i = y * W + x; if (w.type[i] && w.water[i] && !coastNear(x, y, 6)) return { x: x + 3, y }; } return null; });
  for (let k = 0; k < 3; k++) { await p.evaluate(([x, y]) => window.__wohAvatar.toBlock(x, y, 0, 0), [sp.x, sp.y]); await p.waitForTimeout(1300); }
  // 粘土を実際に採る
  await p.evaluate(() => { __wohForage.state.kcal = 2500; });
  let got = {}; for (let i = 0; i < 14; i++) { await p.evaluate(() => document.getElementById('fgMat').click()); await p.waitForTimeout(760); const m = await p.evaluate(() => document.getElementById('forageMsg').textContent); const k = m.replace(/ ×\d+.*/, ''); got[k] = (got[k] || 0) + 1; }
  console.log('水辺で素材を14回', JSON.stringify(got), '粘土', await p.evaluate(() => __wohForage.state.inv.clay || 0));
  await p.evaluate(() => { const s = __wohForage.state; s.inv = { ...s.inv, clay: 8, firewood: 12, fiber: 30, stone: 5, nut: 10, shell: 6, root: 3, fish: 2 }; });
  await p.evaluate(() => document.getElementById('fgBag').click()); await p.waitForTimeout(300);
  const msg = () => p.evaluate(() => document.getElementById('forageMsg').textContent);
  const act = async (a, id) => { await p.evaluate(([a, id]) => { const el = document.querySelector('#bagPanel [data-act="' + a + '"]' + (id ? '[data-id="' + id + '"]' : '')); if (el) el.click(); else document.getElementById('forageMsg').textContent = '(ボタンなし ' + a + ')'; }, [a, id]); await p.waitForTimeout(150); return msg(); };
  const retry = async (a, id, ok) => { let r = ''; for (let i = 0; i < 8; i++) { r = await act(a, id); if (ok.test(r)) break; } return r; };
  console.log('縄:', await retry('craft', 'rope', /作った/));
  console.log('縄:', await retry('craft', 'rope', /作った/));
  console.log('石斧:', await retry('craft', 'axe', /作った/));
  console.log('ナイフ:', await retry('craft', 'knife', /作った/));
  console.log('魚網（縄が足りない）:', await act('craft', 'net'));
  console.log('土器（火なし）:', await act('craft', 'pot'));
  console.log('火:', await retry('fire', null, /火がついた/));
  console.log('土器:', await retry('craft', 'pot', /作った/));
  console.log('煮る:', await act('boil'));
  console.log('煮物を食べる:', await act('eat', 'stew'));
  console.log('パネル:', (await p.evaluate(() => document.getElementById('bagPanel').innerText.replace(/\n+/g, ' / '))).slice(0, 700));
  await p.evaluate(() => { document.getElementById('bagPanel').scrollTop = 0; });
  await p.screenshot({ path: WOH.out('craft_0.png') });
  const sv = await p.evaluate(() => { const f = window.__geo.serializeState().forage; return { wear: f.wear, inv: f.inv }; });
  console.log('保存', JSON.stringify(sv));
  console.log('errors', errs.slice(0, 5)); await b.close();
})();
