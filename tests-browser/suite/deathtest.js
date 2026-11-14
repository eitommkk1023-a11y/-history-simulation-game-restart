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
  const st = () => ev(() => { const s = __wohForage.state; return { hp: Math.round(s.hp), dying: s.dyingDays, water: Math.round(s.water), dead: s.dead, mortal: s.mortal }; });
  const pl = () => ev(() => { const y = WohPeople.peopleYou(__geo.people); return { id: y.id, gen: y.gen, name: __wohPersonName(y.id) }; });
  console.log('初期', JSON.stringify(await st()), JSON.stringify(await pl()));
  console.log('メニューの表示', await ev(() => { document.getElementById('hbMenu').click(); return document.getElementById('menuMortal').textContent; })); await ev(() => document.getElementById('menuClose').click());
  // 渇きで体力0に（猶予が始まる）
  await ev(() => { const s = __wohForage.state; s.hp = 5; s.water = 0; s.kcal = 3000; });
  await ev(() => window.__geo.skipDays(1)); await p.waitForTimeout(900);
  console.log('1日後', JSON.stringify(await st()), '／予告', await ev(() => document.getElementById('hudDanger').textContent), '／画面の赤み', await ev(() => document.getElementById('hudVig').style.opacity));
  await p.screenshot({ path: WOH.out('death_warn.png') });
  // 助ける：水辺へ行って飲む（ここでは直接飲む）
  await ev(() => { const s = __wohForage.state; s.water = 10; });
  for (let i = 0; i < 3; i++) await ev(() => { const s = __wohForage.state; WohForage.drink(s, true); s.water = Math.min(s.water, 10); });
  console.log('飲んで助かった', JSON.stringify(await st()));
  await p.waitForTimeout(800); console.log('予告', JSON.stringify(await ev(() => document.getElementById('hudDanger').textContent)));
  // 助からない：3日放置
  await ev(() => { const s = __wohForage.state; s.hp = 0; s.dyingDays = 0; s.water = 0; s.kcal = 3000; s.dead = null; s.home = { bx: 10, by: 10, xM: 100, yM: 100, ready: 0 }; s.store = { stew: 2 }; s.inv = { fish: 4 }; s.n = { fire: 1 }; });
  const before = await pl();
  await ev(() => window.__geo.skipDays(3)); await p.waitForTimeout(1200);
  const after = await pl();
  console.log('死亡の画面', await ev(() => document.getElementById('deathBox').classList.contains('show')), '／', await ev(() => document.getElementById('deathText').innerText.replace(/\n+/g, ' ')));
  console.log('継承', JSON.stringify(before), '→', JSON.stringify(after));
  console.log('後継者の状態', JSON.stringify(await st()), '／持ち物', JSON.stringify(await ev(() => __wohForage.state.inv)), '／家', JSON.stringify(await ev(() => !!__wohForage.state.home)), '／貯蔵', JSON.stringify(await ev(() => __wohForage.state.store)), '／目標カウンター', JSON.stringify(await ev(() => __wohForage.state.n)));
  console.log('歴史に記録', await ev(() => __geo.history.list.slice(-3).map(e => e.text).join(' ／ ').slice(0, 200)));
  await p.screenshot({ path: WOH.out('death_box.png') });
  await ev(() => document.getElementById('deathOk').click());
  // 「死亡なし」に切り替え
  await ev(() => { document.getElementById('hbMenu').click(); document.getElementById('menuMortal').click(); }); await p.waitForTimeout(400);
  console.log('設定を切替', await ev(() => document.getElementById('menuMortal').textContent), JSON.stringify(await st())); await ev(() => document.getElementById('menuClose').click());
  await ev(() => { const s = __wohForage.state; s.hp = 5; s.water = 0; s.kcal = 0; });
  await ev(() => window.__geo.skipDays(10)); await p.waitForTimeout(900);
  console.log('死なない設定で10日放置', JSON.stringify(await st()), '／同じ人物', (await pl()).id === after.id);
  const sv = await ev(() => { const f = __geo.serializeState().forage; return { mortal: f.mortal, hp: f.hp, dyingDays: f.dyingDays }; });
  console.log('保存', JSON.stringify(sv), '／localStorage', await ev(() => localStorage.getItem('woh-mortal')));
  console.log('errors', errs.slice(0, 5)); await b.close();
})();
