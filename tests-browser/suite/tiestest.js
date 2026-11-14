const WOH = require('../woh-env.js');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 874, height: 380 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('woh-dev', '1'); localStorage.setItem('woh-god', '0'); } catch (e) { } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(WOH.url('?autostart'));
  await p.waitForFunction(() => window.__geo && window.__geo.world && !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 });
  await p.waitForTimeout(2500);
  const ev = (f, a) => p.evaluate(f, a);
  for (let k = 0; k < 3; k++) { await ev(() => window.__wohAvatar.toPlayer()); await p.waitForTimeout(1500); }
  await p.waitForTimeout(2500);
  console.log('住民が見える数', await ev(() => __wohNpcView.count));
  const camp = await ev(() => { const y = WohPeople.peopleYou(__geo.people); return { camp: y.camp, block: __wohAvatar.block() }; });
  console.log('野営地', JSON.stringify(camp));
  // 共同の炉：持ち物を入れて、みんなの炉で調理（自分の火なし）
  await ev(() => { const s = __wohForage.state; s.inv = { fish: 3, fruit: 8, stew: 4, firewood: 4, nut: 6, stone: 3 }; s.kcal = 500; s.standing = 0; s.fire = null; });
  await ev(() => document.getElementById('fgBag').click()); await p.waitForTimeout(400);
  const act = async (a, id) => { await ev(([a, id]) => { const el = document.querySelector('#bagPanel [data-act="' + a + '"]' + (id ? '[data-id="' + id + '"]' : '')); if (el) el.click(); else document.getElementById('forageMsg').textContent = '(ボタンなし ' + a + ')'; }, [a, id]); await p.waitForTimeout(250); return ev(() => document.getElementById('forageMsg').textContent); };
  const panel = () => ev(() => document.getElementById('bagPanel').innerText.replace(/\n+/g, ' / ').slice(0, 360));
  console.log('パネル', await panel());
  console.log('みんなの炉で焼く:', await act('roast'));
  console.log('みんなの炉に薪:', await act('stoke'));
  console.log('評判（薪で上がる）', await ev(() => __wohForage.state.standing));
  const g0 = await ev(() => { const G = WohPeople.peopleYou(__geo.people); const pe = __geo.people; return pe.groups[pe.npc.group[pe.player.id] - 1].food; });
  console.log('食べ物を分ける:', await act('give', 'stew'));
  const g1 = await ev(() => { const pe = __geo.people; return pe.groups[pe.npc.group[pe.player.id] - 1].food; });
  console.log('集団の蓄え', g0.toFixed(2), '→', g1.toFixed(2), '／評判', (await ev(() => __wohForage.state.standing)).toFixed(1));
  await ev(() => { const s = __wohForage.state; s.kcal = 400; s.standing = 25; s.rationAt = -99; const pe = __geo.people; pe.groups[pe.npc.group[pe.player.id] - 1].food = 20; });
  console.log('配給をもらう:', await act('ration'), '／おなか', await ev(() => Math.round(__wohForage.state.kcal)), 'kcal');
  console.log('すぐもう一度:', await act('ration'));
  await ev(() => document.getElementById('bagClose').click());
  // 住民のそばへ
  const pos = await ev(() => __wohNpcView.positions());
  console.log('位置が取れた住民', pos.length);
  const me = await ev(() => __geo.people.player.id);
  const cand = pos.filter(q => q.i !== me)[0];
  if (cand) {
    await ev((q) => { const t = __chunkPreview.state.terrain, pt = __wohAvatar.point, g = t.metersToGrid(q.xM, q.yM), bx = Math.floor(g.x), by = Math.floor(g.y), o = t.gridToMeters(bx, by); __wohAvatar.toBlock(bx, by, q.xM - o.xM + 1.2, q.yM - o.yM); }, cand);
    await p.waitForTimeout(1800);
    console.log('近くの人', await ev(() => JSON.stringify(__wohNpcView.nearest(6, __geo.people.player.id))), '／ボタンの表示', await ev(() => document.querySelector('#hudTalk span').textContent));
    await ev(() => document.getElementById('hudTalk').click()); await p.waitForTimeout(300);
    console.log('話すパネル', await ev(() => document.getElementById('talkPanel').innerText.replace(/\n+/g, ' / ').slice(0, 300)));
    const tk = async (k) => { await ev((k) => document.querySelector('#talkPanel [data-tk="' + k + '"]').click(), k); await p.waitForTimeout(200); return ev(() => document.getElementById('talkSay').textContent); };
    console.log('話す:', await tk('talk'));
    await ev(() => { __wohForage.state.inv = { stew: 6, fruit: 4 }; });
    for (let i = 0; i < 4; i++) await tk('share');
    console.log('分ける:', await tk('share'));
    console.log('教わる:', await tk('learn'));
    console.log('カウンター', JSON.stringify(await ev(() => __wohForage.state.n)));
    await p.screenshot({ path: WOH.out('ties_talk.png') });
    await tk('close'); console.log('閉じる', await ev(() => !document.getElementById('talkPanel').classList.contains('show')));
  } else console.log('近くに住民が取れなかった');
  console.log('目標', await ev(() => document.getElementById('hudGoal').innerText.replace(/\n+/g, ' ')));
  const sv = await ev(() => { const f = __geo.serializeState().forage; return { standing: +f.standing.toFixed(1), given: Math.round(f.given), rationAt: f.rationAt, lessons: f.lessons, n: f.n, commons: f.commons }; });
  console.log('保存', JSON.stringify(sv));
  console.log('errors', errs.slice(0, 5)); await b.close();
})();
