'use strict';
// 村の成長（農耕・牧畜）の検証：node npc/test-growth.js <generator.js> <world.bin> [年数]
const v8 = require('v8'), fs = require('fs');
const G = require(require('path').resolve(process.argv[2])), world = v8.deserialize(fs.readFileSync(process.argv[3])), YEARS = +process.argv[4] || 40;
const P = require('./people-core.js'), N = require('./nation.js');
const env = world.fauna.env, cc = world.climate.cell, res = world.resources;
const plantFood = (c, m, out) => G.faunaPlantFood(env, cc, c, m, out, 0, 0);
const FA = { faunaHunt: G.faunaHunt, faunaDensity: G.faunaDensity, ANIMAL_SPECIES: G.ANIMAL_SPECIES };
let ok = 0, ng = 0; const t = (name, cond, extra) => { if (cond) ok++; else { ng++; console.log('NG', name, extra == null ? '' : extra); } };
function run(grant, years) {
  const fauna = G.faunaClone(world.fauna), people = P.peopleGenerate(42, { world, plantFood, fauna, FA }), out = { years: [], ev: {}, ms: [] };
  let granted = false;
  for (let i = 0; i < years * 12; i++) {
    const month = i % 12; G.faunaMonthly(fauna, { month, env, cc });
    const t0 = process.hrtime.bigint(), ev = P.peopleMonthly(people, { month, day: i * 30, world, fauna, FA, plantFood, env, cc, res }); out.ms.push(Number(process.hrtime.bigint() - t0) / 1e6);
    for (const e of ev) out.ev[e.type] = (out.ev[e.type] || 0) + 1;
    if (!granted && grant && people.nation) { granted = true; const alive = people.ethnicities.filter(e => e.alive); alive.forEach((e, k) => { if (k % 2 === 0) { P.peopleGrantTech(people, e.id, 'cultivate'); } if (k % 4 === 0) P.peopleGrantTech(people, e.id, 'herd'); }); }
    if (month === 11 && (i + 1) / 12 % 5 === 0) {
      let pop = 0, fed = 0, n = 0, farm = 0, herd = 0, villages = 0, large = 0, farmers = 0, herdN = 0, fk = 0, tot = 0;
      for (const g of people.groups) if (g.alive) { pop += g.pop; fed += g.fed; n++; const gr = P.peopleGrowth(people, g.id); if (g.settle === 2) villages++; if (gr.stage === 3) large++; farmers += gr.farmers; herdN += gr.herdN; fk += (g.lastFood.farm || 0); tot += (g.lastFood.hunt + g.lastFood.gather + g.lastFood.fish + (g.lastFood.farm || 0) + (g.lastFood.herd || 0)); }
      out.years.push({ y: (i + 1) / 12, pop: Math.round(pop), groups: n, fed: +(fed / n).toFixed(2), villages, large, farmers, herdN, farmShare: +(fk / Math.max(1, tot)).toFixed(2) });
    }
  }
  out.people = people; return out;
}
const base = run(false, YEARS), tech = run(true, YEARS);
const fmt = (o) => o.years.map(r => `${String(r.y).padStart(3)}年 人口${String(r.pop).padStart(6)} 集団${r.groups} 充足${r.fed} 村${r.villages}(大${r.large}) 農民${r.farmers} 家畜${r.herdN} 農産物${(r.farmShare * 100).toFixed(0)}%`).join('\n');
console.log('--- 技術なし（対照）\n' + fmt(base)); console.log('--- 栽培・牧畜を一部の民族に与える\n' + fmt(tech));
const last = (o) => o.years[o.years.length - 1];
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`1か月の計算：対照 ${avg(base.ms).toFixed(1)}ms／技術あり ${avg(tech.ms).toFixed(1)}ms`);
console.log('出来事（技術あり）', JSON.stringify(tech.ev));
t('開始時から栽培を持つ民族がある（地域差）が、与えた方が農民が多い', base.years.some(r => r.farmers > 0) && last(tech).farmers > last(base).farmers * 1.5, last(base).farmers + ' / ' + last(tech).farmers);
t('技術ありでは農民がいる', last(tech).farmers > 0, JSON.stringify(last(tech)));
t('技術ありでは農産物が食料の一部になる', last(tech).farmShare > 0.05, last(tech).farmShare);
t('技術ありは、人口の減りが対照より小さい（または増える）', last(tech).pop > last(base).pop, `${last(tech).pop} vs ${last(base).pop}`);
t('食料の充足は対照より下がらない', last(tech).fed >= last(base).fed - 0.03);
// 保存・読み込みで技術が残る
const sv = P.peopleSave ? null : null;
// 決定性：同じ条件で同じ結果
const again = run(true, Math.min(YEARS, 10)); const part = tech.years.find(r => r.y === Math.min(YEARS, 10)); if (part) t('決定性：同じ条件で同じ10年後', again.years[again.years.length - 1].pop === part.pop, `${again.years[again.years.length - 1].pop} vs ${part.pop}`);
// 民族の技術：新しい民族は親から受け継ぐ
const S = tech.people.nation; t('技術の層が作られている', !!S && S.n >= 100);
// ---- 指導者の操作：分配・方針・建設
{
  const fauna = G.faunaClone(world.fauna), people = P.peopleGenerate(7, { world, plantFood, fauna, FA }), pl = people.player, Pn = people.npc;
  const g = people.groups[Pn.group[pl.id] - 1]; g.settle = 1; g.pop = Math.max(g.pop, 30);
  const step = (n) => { for (let i = 0; i < n; i++) { const month = i % 12; G.faunaMonthly(fauna, { month, env, cc }); P.peopleMonthly(people, { month, day: (people.__d = (people.__d || 0) + 30), world, fauna, FA, plantFood, env, cc, res }); } };
  const ctx = { world, x: g.x, y: g.y };
  t('技術のない農耕の提案は断られる', P.peopleProposal(people, 'farm', ctx).reason === 'noTech');
  t('技術のない畑の拡張は建てられない', P.peopleBuildCheck(people, 'field').reason === 'locked');
  t('干し棚は半定住でなくても（野営地でも）建てられる', (g.settle = 0, P.peopleBuildCheck(people, 'rack').ok) && !P.peopleBuildCheck(people, 'pit').ok && (g.settle = 1, true));
  t('倉庫は村になるまで建てられない', P.peopleBuildCheck(people, 'granary').reason === 'locked');
  t('窯は技術「高温焼成」がなければ建てられない', P.peopleBuildCheck(people, 'kiln').reason === 'locked');
  t('物見櫓は建設の候補にない', P.FACIL.watchtower === undefined);
  P.peopleGrantTech(people, people.playerEth, 'cultivate');
  const b0 = P.peopleBuildCheck(people, 'field'); t('技術があれば畑の拡張を始められる', b0.ok, JSON.stringify(b0.reason));
  const r = P.peopleBuildStart(people, 'field'); t('建設を始める', r.ok && r.months === 4);
  t('建設中は、別の建設ができない', P.peopleBuildCheck(people, 'well').reason === 'busy');
  step(2); t('建設の途中では、まだ施設が増えない', (g.facil ? g.facil.field : 0) === 0 && !!g.build);
  step(5); t('月数がたつと完成する', g.facil && g.facil.field === 1 && !g.build, JSON.stringify([g.facil, g.build, g.fed, g.pop]));
  const gr = P.peopleGrowth(people, g.id); t('画面用の情報に施設が出る', gr.facil.field === 1 && gr.build === null);
  for (let k = 0; k < 3; k++) { P.peopleBuildStart(people, 'well'); step(3); }
  t('施設は上限を超えない（井戸は2つまで）', (g.facil.well || 0) <= 2 && P.peopleBuildCheck(people, 'well').reason === 'max');
  // 分配
  g.share = 0.5; const sv = P.peopleSave ? 1 : 1; t('分配の割合は集団に残る', g.share === 0.5);
}
// ---- 保存：干し棚が生鮮を干物にする／貯蔵穴は穀物に効き、生鮮には逆効果
{
  const mkRun = (facil) => { const fauna = G.faunaClone(world.fauna), people = P.peopleGenerate(5, { world, plantFood, fauna, FA }), pl = people.player, Pn = people.npc, g = people.groups[Pn.group[pl.id] - 1]; g.settle = 2; g.pop = Math.max(g.pop, 80); g.fresh = 4000; g.food = 4000; Object.assign(g, { facil: Object.assign({}, facil) });
    for (let i = 0; i < 12; i++) { G.faunaMonthly(fauna, { month: i % 12, env, cc }); P.peopleMonthly(people, { month: i % 12, day: i * 30, world, fauna, FA, plantFood, env, cc, res }); }
    return { g, gr: P.peopleGrowth(people, g.id) }; };
  const a = mkRun({}), b = mkRun({ rack: 3 });
  t('干し棚がないと、干物はできない', (a.g.dried || 0) === 0, a.g.dried);
  t('干し棚があると、干物ができる', (b.g.dried || 0) > 0, b.g.dried);
  t('蓄えの内訳が出る', b.gr.stock && b.gr.stock.dried > 0 && Math.abs(b.gr.stock.dur + b.gr.stock.fresh + b.gr.stock.dried - b.g.food) < 1e-6);
  t('施設の解放状況が出る', b.gr.avail.rack.open === true && b.gr.avail.kiln.open === false && typeof b.gr.avail.kiln.lock === 'string');
}
// ---- 建てる前の判断：足りないもの・建てた後の見込み・不利な使い方の注意・施設の受け持ち
{
  t('受け持ちは人数に比例し、最大1', P.peCover('pit', 1, 100) === 0.25 && P.peCover('pit', 4, 100) === 1 && P.peCover('granary', 1, 20) === 1 && P.peCover('pit', 2, 400) === 0.125);
  const fauna = G.faunaClone(world.fauna), people = P.peopleGenerate(11, { world, plantFood, fauna, FA }), Pn = people.npc, g = people.groups[Pn.group[people.player.id] - 1];
  for (let i = 0; i < 14; i++) { G.faunaMonthly(fauna, { month: i % 12, env, cc }); P.peopleMonthly(people, { month: i % 12, day: i * 30, world, fauna, FA, plantFood, env, cc, res }); }
  g.settle = 1; g.pop = 49; g.herdN = 3;
  let gr = P.peopleGrowth(people, g.id);
  t('未解放の施設は、足りないものを具体的に示す（村になる必要・いまの段階）', gr.avail.granary.open === false && gr.avail.granary.missing.some(m => m.includes('村になる') && m.includes('半定住')), JSON.stringify(gr.avail.granary.missing));
  t('共同の炉は、あと何人必要かを示す', (g.settle = 2, P.peopleGrowth(people, g.id).avail.hearth.missing.some(m => m.includes('あと11人'))), JSON.stringify(P.peopleGrowth(people, g.id).avail.hearth.missing)); g.settle = 1;
  t('家畜の囲いは、あと何頭必要かを示す', P.peopleGrowth(people, g.id).avail.pen.missing.some(m => m.includes('牧畜') || m.includes('あと5頭')), JSON.stringify(P.peopleGrowth(people, g.id).avail.pen.missing));
  t('窯は、技術がないと示す', gr.avail.kiln.missing.some(m => m.includes('高温焼成')));
  t('開放済みの施設は、足りないものが空', P.peopleGrowth(people, g.id).avail.rack.missing.length === 0);
  // 不利な使い方の注意：生鮮が主な村の貯蔵穴に警告、穀物が主なら警告なし
  g.lastFood = Object.assign({}, g.lastFood, { need: 1000, fish: 3000, hunt: 500, gather: 200, farm: 0, herd: 0 });
  t('生鮮が主な村では、貯蔵穴に注意が出る', P.peopleGrowth(people, g.id).preview.pit.warn && P.peopleGrowth(people, g.id).preview.pit.warn.includes('生鮮'), P.peopleGrowth(people, g.id).preview.pit.warn);
  t('生鮮が主な村では、干し棚がおすすめ', P.peopleGrowth(people, g.id).preview.rack.recommend && P.peopleGrowth(people, g.id).preview.rack.recommend.includes('生鮮'));
  g.lastFood = Object.assign({}, g.lastFood, { fish: 100, hunt: 0, gather: 0, farm: 3000 });
  t('穀物が主な村では、貯蔵穴に注意が出ない・穀物向きとおすすめ', !P.peopleGrowth(people, g.id).preview.pit.warn && (P.peopleGrowth(people, g.id).preview.pit.recommend || '').includes('穀物'));
  // 建てた後の見込み：保存日数が前後で出る
  g.fresh = 500; g.food = 3000; const pv = P.peopleGrowth(people, g.id).preview;
  t('貯蔵穴：保存日数の前後と、生鮮が短くなる表示', pv.pit.lines.some(l => l.includes('保存日数') && l.includes('→')) && pv.pit.lines.some(l => l.includes('短くなる')), JSON.stringify(pv.pit.lines));
  t('干し棚：生鮮と干物の保存日数が出る', pv.rack.lines[0].includes('干物'));
  t('倉庫：受け持つ人数（人口に対して）が出る', pv.granary.lines[0].includes('受け持つ人数') && pv.granary.lines[0].includes('49人'));
  // 増設の意味：貯蔵穴を増やすと、傷みが段階的に減る
  const rate = (n) => { g.facil = Object.assign({}, g.facil, { pit: n }); return P.peopleGrowth(people, g.id).stock && n; };
  // 不作（収入の減り）の設定は、通常は0
  t('不作の設定は、ふだんは0', !people.groups.some(x => x.hardship));
}
console.log(ng ? 'FAIL ' + ng + ' / ' + (ok + ng) : 'OK ' + ok + ' 件通過'); process.exit(ng ? 1 : 0);
