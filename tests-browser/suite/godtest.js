const WOH = require('../woh-env.js');
const { chromium } = require('playwright'); const D = WOH.out('');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 874, height: 380 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('woh-dev', '1'); } catch (e) { } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
  await p.goto(WOH.url('?autostart'));
  await p.waitForFunction(() => window.__geo && window.__geo.world && !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 });
  await p.waitForTimeout(3000); const ev = (f, a) => p.evaluate(f, a); let bad = 0; const t = (n, c, x) => { console.log((c ? 'OK  ' : 'NG  ') + n + (x !== undefined ? '  ' + x : '')); if (!c) bad++; };
  // 村の近くへ行ってから入る
  const gid = await ev(() => { const pe = window.__geo.people; const g = pe.groups.filter(g => g.alive && g.settle === 2).sort((a, b) => b.pop - a.pop)[0]; window.__wohMapData.ensureLayout(g.id); __wohAvatar.toBlock(g.homeX, g.homeY, 0, 0); return g.id; });
  await p.waitForTimeout(6000);
  const before = await ev(() => { const st = __wohForage.state; return { kcal: st.kcal, water: st.water, hp: st.hp, home: JSON.stringify(window.__wohPlayerSave()) }; });
  await ev(() => document.getElementById('btnMenu').click()); await p.waitForTimeout(500);
  await ev(() => document.getElementById('menuGodView').click()); await p.waitForTimeout(2500);
  t('神モードに入る', await ev(() => window.__wohGod.active && document.body.classList.contains('god-on')));
  t('操作盤・時間・人口が出る', await ev(() => /総人口/.test(document.getElementById('godPop').textContent)), await ev(() => document.getElementById('godPop').textContent));
  await p.screenshot({ path: D + 'god1.png' });
  // 村人の描画
  const s0 = await ev(() => __wohGodView.state); console.log('状態', JSON.stringify(s0));
  t('村人が大きく描かれる（高さ110mで拡大）', s0.npcScale > 3 && s0.npcShown > 5, `倍率 ${s0.npcScale.toFixed(1)}・表示 ${s0.npcShown}人`);
  // 動かす：ドラッグ・ピンチ・キー
  console.log('最前面の要素', await ev(() => { const e = document.elementFromPoint(437, 190); return e.tagName + '#' + e.id + '.' + e.className; }));
  // 指の操作（ポインターイベント）を、キャンバスに送る：ドラッグ・ホイール
  const fire = (type, x, y, id = 1, extra = {}) => ev(([type, x, y, id, extra]) => { const el = document.elementFromPoint(437, 190) && window.__cv || (window.__cv = document.querySelector('#view canvas') || document.querySelector('canvas')); el.dispatchEvent(new PointerEvent(type, Object.assign({ pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true, pointerType: 'touch', button: 0 }, extra))); }, [type, x, y, id, extra]);
  await fire('pointerdown', 437, 190); for (let i = 1; i <= 6; i++) await fire('pointermove', 437 - i * 20, 190 - i * 12); await fire('pointerup', 317, 118); await p.waitForTimeout(600);
  const s1 = await ev(() => __wohGodView.state); t('ドラッグで動く', Math.hypot(s1.xM - s0.xM, s1.yM - s0.yM) > 5, Math.hypot(s1.xM - s0.xM, s1.yM - s0.yM).toFixed(0) + 'm');
  // 2本指で広げる／回す
  await fire('pointerdown', 380, 190, 1); await fire('pointerdown', 480, 190, 2); for (let i = 1; i <= 5; i++) { await fire('pointermove', 380 - i * 12, 190 + i * 6, 1); await fire('pointermove', 480 + i * 12, 190 - i * 6, 2); } await fire('pointerup', 320, 220, 1); await fire('pointerup', 540, 160, 2); await p.waitForTimeout(500);
  const sp = await ev(() => __wohGodView.state); t('2本指で拡大・回転', sp.h < s1.h * 0.8 && Math.abs(sp.yaw) > 0.05, `高さ ${s1.h.toFixed(0)}→${sp.h.toFixed(0)}・向き ${sp.yaw.toFixed(2)}`);
  await ev(() => { const el = window.__cv; for (let i = 0; i < 8; i++) el.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, clientX: 437, clientY: 190, bubbles: true, cancelable: true })); }); await p.waitForTimeout(800);
  const s2 = await ev(() => __wohGodView.state); t('ホイールで高く上がる', s2.h > sp.h * 1.5, sp.h.toFixed(0) + ' → ' + s2.h.toFixed(0) + 'm'); await p.screenshot({ path: D + 'god2.png' });
  await p.keyboard.down('KeyD'); await p.waitForTimeout(700); await p.keyboard.up('KeyD'); const s3 = await ev(() => __wohGodView.state); t('キーで動く', Math.hypot(s3.xM - s2.xM, s3.yM - s2.yM) > 5);
  // 村へ飛ぶ
  await ev((g) => __wohGodView.flyTo(g, 90), gid); await p.waitForTimeout(3500); await p.screenshot({ path: D + 'god3.png' });
  const s4 = await ev(() => __wohGodView.state); t('村へ飛べる', s4.h < 140, `高さ ${s4.h.toFixed(0)}m・村人 ${s4.npcShown}人・ラベル`);
  t('村の名前のラベルが出る', await ev(() => document.querySelectorAll('#godLabels .gl').length > 0), await ev(() => document.querySelectorAll('#godLabels .gl').length));
  // ラベルをタップ→情報
  await ev(() => document.querySelector('#godLabels .gl').click()); await p.waitForTimeout(800); t('村を選ぶと情報が出る', await ev(() => /民族/.test(document.getElementById('godInfo').innerText)), await ev(() => document.getElementById('godInfo').innerText.replace(/\s+/g, ' ').slice(0, 120)));
  // 時間を進める
  const d0 = await ev(() => window.__geo.clock.day); await ev(() => __wohGod.setTime('d10')); await p.waitForTimeout(3000); const d1 = await ev(() => window.__geo.clock.day); t('時間を速められる（日×10）', d1 - d0 > 5, (d1 - d0).toFixed(1) + '日'); await ev(() => __wohGod.setTime('real'));
  // 出る：元の場所・状態
  await ev(() => __wohGod.exit()); await p.waitForTimeout(2500);
  const after = await ev(() => { const st = __wohForage.state; return { kcal: st.kcal, water: st.water, hp: st.hp, home: JSON.stringify(window.__wohPlayerSave()), vis: document.body.classList.contains('god-on'), label: !!document.getElementById('godLabels') }; });
  t('出ると元の場所に戻る', before.home === after.home, before.home.slice(0, 60) + ' / ' + after.home.slice(0, 60)); t('神モード中の消耗はなかったことになる', Math.abs(before.kcal - after.kcal) < 1 && Math.abs(before.water - after.water) < 1 && after.hp >= before.hp - 0.01); t('画面が通常に戻る', !after.vis && !after.label);
  await p.screenshot({ path: D + 'god4.png' });
  console.log('errors', errs.slice(0, 4)); if (errs.length) bad++; console.log(bad ? 'FAIL ' + bad : 'ALL OK'); await b.close(); process.exit(bad ? 1 : 0);
})();
