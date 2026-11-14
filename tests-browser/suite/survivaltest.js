const WOH = require('../woh-env.js');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 874, height: 380 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('woh-dev', '1'); localStorage.setItem('woh-god', '0'); localStorage.removeItem('woh-mortal'); } catch (e) { } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(WOH.url('?autostart'));
  await p.waitForFunction(() => window.__geo && window.__geo.world && !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 });
  await p.waitForTimeout(3000);
  const ev = (f, a) => p.evaluate(f, a);
  const msg = () => ev(() => document.getElementById('forageMsg').textContent);
  await ev(() => document.getElementById('fgBag').click()); await p.waitForTimeout(300);
  const act = async (a, id) => { await ev(([a, id]) => { const el = document.querySelector('#bagPanel [data-act="' + a + '"]' + (id ? '[data-id="' + id + '"]' : '')); if (el) el.click(); else document.getElementById('forageMsg').textContent = '(ボタンなし ' + a + ')'; }, [a, id]); await p.waitForTimeout(250); return msg(); };
  console.log('パネルのボタン', await ev(() => Array.from(document.querySelectorAll('#bagPanel [data-act]')).map(e => e.textContent).filter((v, i, a) => a.indexOf(v) === i).slice(0, 24).join(' / ')));
  // 武器なしで狩り
  console.log('武器なし:', await act('hunt'));
  // 作る：弓・水袋・衣
  await ev(() => { const s = __wohForage.state; s.inv = { firewood: 8, rope: 12, hide: 8, fiber: 20, stone: 3, herb: 4, meat: 5, fish: 3 }; s.kcal = 2500; });
  for (const id of ['bow', 'spear', 'skin', 'fur']) { let r = ''; for (let i = 0; i < 6; i++) { r = await act('craft', id); if (/作った/.test(r)) break; } console.log(id, r); }
  // 狩りに出る：獲物がいる場所を探す
  const spots = await ev(() => { const w = __geo.world, W = w.stats.width, H = w.stats.height, fa = __geo.world.fauna ? null : null; const f = window.__geo; return null; });
  const find = await ev(() => { // 動物のいるセル→ブロックへ
    const F = globalThis.__wohForage; const w = __geo.world, cc = w.climate.cell, step = cc.gridStep || Math.round(w.stats.width / cc.w), W = cc.gridW || cc.w;
    const fa = __wohForage.fauna(); if (!fa) return null; for (const sid of Object.keys(fa.species)) for (const pop of fa.species[sid].pops) if (pop.alive && pop.cells.length) { const c = pop.cells[Math.floor(pop.cells.length / 2)]; return { x: (c % W) * step + Math.floor(step / 2), y: Math.floor(c / W) * step + Math.floor(step / 2), sid }; } return null; });
  console.log('獲物のいる場所', JSON.stringify(find));
  if (find) {
    for (let k = 0; k < 3; k++) { await ev(([x, y]) => window.__wohAvatar.toBlock(x, y, 0, 0), [find.x, find.y]); await p.waitForTimeout(1200); }
    const d0 = await ev(() => window.__geo.clock.day); let got = 0, tries = 0, hurt = 0;
    for (let i = 0; i < 8; i++) { await ev(() => { const s = __wohForage.state; s.sp = 100; s.hp = Math.max(s.hp, 80); s.kcal = 2500; s.water = 80; });
      const r = await act('hunt'); tries++; if (/しとめた/.test(r)) got++; if (/怪我/.test(r)) hurt++; if (i < 3) console.log('狩り', i + 1, r); }
    console.log('8回の狩りの旅：成功', got, '／怪我', hurt, '／経過日数', (await ev(() => window.__geo.clock.day)) - d0);
    console.log('持ち物', JSON.stringify(await ev(() => __wohForage.state.inv)));
  }
  // 怪我→手当て
  await ev(() => { const s = __wohForage.state; WohForage.hurt(s, __geo.clock.day, 6, 8); s.inv.herb = 3; });
  await p.waitForTimeout(800); console.log('怪我の予告', await ev(() => document.getElementById('hudDanger').textContent));
  console.log('手当て:', await act('treat'));
  // 干す：火のそばで
  await ev(() => { const s = __wohForage.state; s.inv.meat = 4; s.inv.fish = 3; s.inv.firewood = 4; s.inv.fiber = 3; });
  let fr = ''; for (let i = 0; i < 8; i++) { fr = await act('fire'); if (/火がついた/.test(fr)) break; } console.log('火:', fr);
  console.log('干す:', await act('dry'));
  // 傷む：日を進める
  await ev(() => { const s = __wohForage.state; s.inv.meat = 10; s.inv.fruit = 6; s.kcal = 3000; s.water = 100; });
  await ev(() => window.__geo.skipDays(1)); await p.waitForTimeout(1000);
  console.log('1日後の持ち物', JSON.stringify(await ev(() => { const i = __wohForage.state.inv; return { meat: i.meat, fruit: i.fruit, meatD: i.meatD, fishD: i.fishD }; })), '／通知', await msg());
  // 水を汲んで持ち歩く
  const sp = await ev(() => { const w = __geo.world, W = w.stats.width, H = w.stats.height; const coastNear = (x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!w.type[(y + dy) * W + x + dx]) return true; return false; };
    for (let y = 80; y < H - 80; y += 2) for (let x = 80; x < W - 80; x += 2) { const i = y * W + x; if (w.type[i] && w.water[i] && !coastNear(x, y, 6)) return { x: x + 3, y }; } return null; });
  for (let k = 0; k < 3; k++) { await ev(([x, y]) => window.__wohAvatar.toBlock(x, y, 0, 0), [sp.x, sp.y]); await p.waitForTimeout(1200); }
  console.log('水を汲む:', await act('fill'));
  // 水辺を離れて飲む
  for (let k = 0; k < 3; k++) { await ev(() => window.__wohAvatar.toPlayer()); await p.waitForTimeout(1200); }
  await ev(() => { __wohForage.state.water = 20; });
  console.log('離れた所で水を飲む:', await act('drink'), '→', Math.round(await ev(() => __wohForage.state.water)), '/ 持ち水', await ev(() => __wohForage.state.carried));
  console.log('目標', await ev(() => document.getElementById('hudGoalN').textContent + ' ' + document.getElementById('hudGoalT').textContent));
  await p.screenshot({ path: WOH.out('survival_0.png') });
  const sv = await ev(() => { const f = __geo.serializeState().forage; return { carried: f.carried, injuredUntil: f.injuredUntil, wear: f.wear, rotAcc: Object.keys(f.rotAcc || {}).length }; });
  console.log('保存', JSON.stringify(sv)); console.log('errors', errs.slice(0, 5)); await b.close();
})();
