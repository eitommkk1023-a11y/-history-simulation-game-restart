// 2C 検証：配置の安定（施設を建てても・畑が広がっても動かない）、履歴、旧形式の補完、3Dとの一致
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 874, height: 380 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('woh-dev', '1'); localStorage.setItem('woh-god', '1'); } catch (e) { } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
  await p.goto('file:///tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/v30/index3.html?autostart');
  await p.waitForFunction(() => window.__geo && window.__geo.world && !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 });
  await p.waitForTimeout(3000);
  const ev = (f, a) => p.evaluate(f, a); let bad = 0; const t = (n, c, x) => { console.log((c ? 'OK  ' : 'NG  ') + n + (x !== undefined ? '  ' + x : '')); if (!c) bad++; };
  // あなたの集団を村にして、配置を作る
  await ev(() => { const pe = window.__geo.people, g = pe.groups.find(x => x.id === pe.npc.group[pe.player.id]); g.settle = 2; g.pop = Math.max(g.pop, 80); g.layout = null; WohPeople.peopleGrantTech(pe, pe.playerEth, 'cultivate'); WohPeople.peopleGrantTech(pe, pe.playerEth, 'herd'); });
  await p.waitForTimeout(6000);
  const gid = await ev(() => { const pe = window.__geo.people; return pe.npc.group[pe.player.id]; });
  const snap = () => ev((g) => { const L = window.__geo.people.groups[g - 1].layout; return L ? { n: L.items.length, pos: L.items.map(b => [b.id, b.x, b.z, b.rot, b.state]), fields: (L.fields || []).length, log: L.log.map(e => e.type), ver: L.version, fieldLv: L.fieldLv, recs: L.items.filter(b => b.rec).length } : null; }, gid);
  const s0 = await snap(); t('配置がある・履歴の記録がある', !!s0 && s0.log.includes('found') && s0.recs === s0.n && s0.ver === 2, JSON.stringify(s0 && s0.log));
  // 1) 施設を建てても配置は変わらない
  await ev((g) => { __wohForage.state.inv = { firewood: 99, fiber: 99, rope: 99, stone: 99 }; const pe = window.__geo.people, G = pe.groups[g - 1]; const sp = { x: G.layout.center.x + 12, z: G.layout.center.z + 12, rot: 0 }; return JSON.stringify(WohPeople.peopleBuildStart(pe, 'granary', sp)); }, gid).then(r => console.log('建設開始', r));
  await ev(() => window.__geo.skipDays(300)); await p.waitForTimeout(3000);
  const s1 = await snap(); const same = (a, b) => a.pos.every(q => { const r = b.pos.find(x => x[0] === q[0]); return r && r[1] === q[1] && r[2] === q[2] && r[3] === q[3]; });
  t('施設を建てても、既存の建物の位置・向きは変わらない', same(s0, s1) && /"granary":1/.test(await ev((g) => JSON.stringify(window.__geo.people.groups[g - 1].facil), gid)), '建設完了を確認 facil=' + await ev((g) => JSON.stringify(window.__geo.people.groups[g - 1].facil), gid));
  // 2) 畑の広がりの段階が変わっても、建物は動かない（畑だけ更新・記録）
  await ev((g) => { const G = window.__geo.people.groups[g - 1]; G.fieldLv = 0; G.fieldsDirty = true; }, gid); await p.waitForTimeout(3500);
  const s2 = await snap(); t('畑の更新でも建物は動かない', same(s0, s2)); t('畑の更新が履歴に残る', s2.log.includes('fields'), JSON.stringify(s2.log));
  // 3) 世帯が増える：建設の記録（誰が・いつ・何のため）
  const day0 = await ev(() => window.__geo.clock.day);
  await ev(() => window.__geo.skipDays(720)); await p.waitForTimeout(3500);
  const s3 = await snap(); t('2年進めても既存の建物は動かない（廃屋化・撤去は別）', s3.pos.filter(q => s0.pos.some(r => r[0] === q[0])).every(q => { const r = s0.pos.find(x => x[0] === q[0]); return r[1] === q[1] && r[2] === q[2]; }));
  const rec = await ev((g) => { const L = window.__geo.people.groups[g - 1].layout; const nb = L.items.find(b => b.rec && !b.rec.synthetic); return { new: nb ? { id: nb.id, rec: nb.rec, house: nb.house } : null, logTypes: [...new Set(L.log.map(e => e.type))], chron: window.__geo.people.groups[g - 1].chron }; }, gid);
  console.log('履歴', JSON.stringify(rec).slice(0, 420));
  t('増築された建物は 誰が・いつ・目的 が記録される（世帯＝人物ID）', !rec.new || (rec.new.rec.by === rec.new.house && rec.new.rec.builtDay > day0 - 800 && !!rec.new.rec.purpose), rec.new ? '' : '（2年では増築なし）');
  t('集落の年表（chron）がある', Array.isArray(rec.chron) && rec.chron.length >= 1);
  // 4) 旧形式（履歴なし・version 1）の補完
  const up = await ev((g) => { const L = JSON.parse(JSON.stringify(window.__geo.people.groups[g - 1].layout)); delete L.log; L.version = 1; delete L.plaza.kind; for (const b of L.items) delete b.rec; const pos0 = JSON.stringify(L.items.map(b => [b.x, b.z, b.rot])); WohSettle.upgradeLayout(L); return { ok: L.version === 2 && Array.isArray(L.log) && L.items.every(b => b.rec && b.rec.synthetic) && L.plaza.kind === 'open', same: pos0 === JSON.stringify(L.items.map(b => [b.x, b.z, b.rot])) }; }, gid);
  t('旧形式の配置を補完できる（位置は変えない）', up.ok && up.same);
  // 5) 3Dと配置の一致：その集落へ行って、描画された建物の位置を照合
  await ev((g) => { const G = window.__geo.people.groups[g - 1]; __wohAvatar.toBlock(G.homeX, G.homeY, 0, 0); }, gid); await p.waitForTimeout(7000);
  const m = await ev((g) => __wohSettle.matchReport(g), gid); console.log('3D照合', JSON.stringify(m));
  t('地図の詳細（g.layout）の建物が、3Dにも同じ位置にある', m && m.tot > 5 && m.ok === m.tot, m ? m.ok + '/' + m.tot : '');
  console.log('errors', errs.slice(0, 4)); if (errs.length) bad++; console.log(bad ? 'FAIL ' + bad : 'ALL OK'); await b.close(); process.exit(bad ? 1 : 0);
})();
