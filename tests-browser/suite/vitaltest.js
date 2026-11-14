const WOH = require('../woh-env.js');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 874, height: 380 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('woh-dev', '1'); localStorage.setItem('woh-god', '0'); } catch (e) { } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(WOH.url('?autostart'));
  await p.waitForFunction(() => window.__geo && window.__geo.world && !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 });
  await p.waitForTimeout(3000);
  const ev = (f, a) => p.evaluate(f, a);
  const bars = () => ev(() => ['hudHp', 'hudSp', 'hudFood', 'hudWt'].map(i => document.querySelector('#' + i + ' b').style.width).join(' / '));
  console.log('初期のバー（体力/スタミナ/満腹/水分）', await bars(), JSON.stringify(await ev(() => { const s = __wohForage.state; return [s.hp, Math.round(s.sp), s.water]; })));
  // ダッシュ：キーでダッシュ＋前進し、スタミナが減る
  await ev(() => document.getElementById('sprint').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 5 }))); await p.keyboard.down('KeyW');
  const sp0 = await ev(() => __wohForage.state.sp); await p.waitForTimeout(4000);
  const sp1 = await ev(() => __wohForage.state.sp); const ms = await ev(() => window.__wohAvatar.moveState);
  console.log('ダッシュ中', JSON.stringify(ms), 'スタミナ', sp0.toFixed(1), '→', sp1.toFixed(1), ' 水分', (await ev(() => __wohForage.state.water)).toFixed(2));
  // 強制的に尽きさせる
  await ev(() => { __wohForage.state.sp = 3; }); await p.waitForTimeout(1500);
  console.log('尽きた後：疲れ切り', await ev(() => __wohForage.state.exhausted), '／ダッシュ解除', !(await ev(() => window.__wohAvatar.moveState.sprinting)), '／ロック', await ev(() => !!globalThis.__wohNoSprint));
  await ev(() => document.getElementById('sprint').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 6 }))); await p.waitForTimeout(300); console.log('疲れ切り中にダッシュを押す →', await ev(() => window.__wohAvatar.moveState.sprinting));
  await p.keyboard.up('KeyW'); await p.waitForTimeout(5000);
  console.log('休んで回復', (await ev(() => __wohForage.state.sp)).toFixed(1), '疲れ切り', await ev(() => __wohForage.state.exhausted), 'ロック', await ev(() => !!globalThis.__wohNoSprint));
  // ジャンプ
  await ev(() => { __wohForage.state.sp = 50; __wohForage.state.exhausted = false; }); await p.waitForTimeout(300);
  await ev(() => document.getElementById('jump').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7 }))); await p.waitForTimeout(300);
  console.log('ジャンプ後のスタミナ', (await ev(() => __wohForage.state.sp)).toFixed(1));
  await ev(() => { __wohForage.state.sp = 4; }); await p.waitForTimeout(200); console.log('スタミナ不足でジャンプ不可', await ev(() => !!globalThis.__wohNoJump));
  // 水
  const sp = await ev(() => { const w = __geo.world, W = w.stats.width, H = w.stats.height; const coastNear = (x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!w.type[(y + dy) * W + x + dx]) return true; return false; };
    for (let y = 80; y < H - 80; y += 2) for (let x = 80; x < W - 80; x += 2) { const i = y * W + x; if (w.type[i] && w.water[i] && !coastNear(x, y, 6)) return { x: x + 3, y }; } return null; });
  for (let k = 0; k < 3; k++) { await ev(([x, y]) => window.__wohAvatar.toBlock(x, y, 0, 0), [sp.x, sp.y]); await p.waitForTimeout(1300); }
  console.log('文脈', JSON.stringify(await ev(() => { const c = __wohForage.context().ctx; return { water: c.water, coast: c.coast }; })));
  await ev(() => { __wohForage.state.water = 20; });
  await ev(() => document.getElementById('hmWat').click()); await ev(() => document.getElementById('hudTalk').click()); await p.waitForTimeout(300);
  console.log('水を飲む（調べる・水モード）:', await ev(() => document.getElementById('forageMsg').textContent), '→', await ev(() => __wohForage.state.water));
  console.log('目標', await ev(() => document.getElementById('hudGoalT').textContent));
  // 渇き：日数が進む
  await ev(() => { const s = __wohForage.state; s.water = 5; s.kcal = 3000; s.hp = 100; });
  await ev(() => window.__geo.skipDays(2)); await p.waitForTimeout(800); await ev(() => document.getElementById('fgBag').click()); await p.waitForTimeout(300);
  console.log('2日で水が尽きる→体力', Math.round(await ev(() => __wohForage.state.hp)), '／パネル', (await ev(() => document.getElementById('bagPanel').innerText.replace(/\n+/g, ' / '))).slice(0, 140));
  console.log('バー（体力/スタミナ/満腹/水分）', await bars());
  // 眠る
  await ev(() => { const s = __wohForage.state; s.fire = { bx: 0, by: 0, until: 0 }; s.hp = 30; s.water = 90; s.kcal = 2500; });
  await p.screenshot({ path: WOH.out('vital_0.png') });
  const sv = await ev(() => { const f = __geo.serializeState().forage; return { hp: Math.round(f.hp), sp: Math.round(f.sp), water: Math.round(f.water), exhausted: f.exhausted, env: f.env }; });
  console.log('保存', JSON.stringify(sv));
  console.log('errors', errs.slice(0, 5)); await b.close();
})();
