'use strict';
// 保存の版管理・移行・検査の検証：node npc/test-save-schema.js [<generator.js> <world.bin>]
const v8 = require('v8'), fs = require('fs'), path = require('path');
const S = require('./save-schema.js');
let ok = 0, ng = 0; const t = (name, cond, extra) => { if (cond) { ok++; console.log('○', name, extra == null ? '' : extra); } else { ng++; console.log('×', name, extra == null ? '' : extra); } };
const sample = () => ({ format: 1, seed: 'S-1', clock: { day: 100 }, savedAt: 1, people: null, fauna: { species: { deer: { pops: [{ cells: new Int32Array([1, 2, 3]), n: 5.5 }] } } }, names: { a: 'あ' } });
// 版の移行
{ const r = S.migrate(sample()); t('古い保存（schema なし）を、現在の版へ移す', r.ok && r.from === 1 && r.to === S.CURRENT_SCHEMA && r.st.schema === S.CURRENT_SCHEMA && r.steps.length === S.CURRENT_SCHEMA - 1, JSON.stringify(r.steps)); t('移行しても、元の中身は変わらない', r.st.seed === 'S-1' && r.st.clock.day === 100 && r.st.fauna.species.deer.pops[0].cells.length === 3); }
t('新しい版の保存は、安全に断る', (() => { const x = sample(); x.schema = S.CURRENT_SCHEMA + 1; const r = S.migrate(x); return !r.ok && /新しい版/.test(r.error); })());
t('不正な版（0・小数・空）は、断る/1とみなす', !S.migrate(null).ok && !S.migrate(Object.assign(sample(), { schema: 0 })).ok && S.migrate(Object.assign(sample(), { schema: 1.5 })).ok);
t('移行の手順が抜けていると、断る', (() => { const save = S.MIGRATIONS[1]; delete S.MIGRATIONS[1]; const r = S.migrate(sample()); S.MIGRATIONS[1] = save; return !r.ok && /手順がありません/.test(r.error); })());
t('移行の途中で例外が出ても、安全に断る', (() => { const save = S.MIGRATIONS[1]; S.MIGRATIONS[1] = () => { throw new Error('テスト'); }; const r = S.migrate(sample()); S.MIGRATIONS[1] = save; return !r.ok && /移行に失敗/.test(r.error); })());
// 検査値
{ const a = sample(), d1 = S.digest(a), d2 = S.digest(sample()); t('同じ内容なら、同じ検査値（決定的）', d1 === d2 && /^[0-9a-f]{8}$/.test(d1), d1);
  const b = sample(); b.clock.day = 101; t('1か所変わると、検査値が変わる（数値）', S.digest(b) !== d1);
  const c = sample(); c.fauna.species.deer.pops[0].cells[1] = 9; t('配列の1要素が変わると、検査値が変わる', S.digest(c) !== d1);
  const e = sample(); e.names.a = 'い'; t('文字が変わると、検査値が変わる', S.digest(e) !== d1);
  const k = sample(); const k2 = { names: k.names, fauna: k.fauna, people: k.people, clock: k.clock, savedAt: k.savedAt, seed: k.seed, format: k.format }; t('項目の並び順が違っても、同じ検査値', S.digest(k2) === d1);
  const f = sample(); f.digest = 'x'; f.legacy = true; f.slot = 'slot1'; f.zpack = 1; t('digest・legacy・slot（保存先）・zpack の項目は、検査値に入らない（保存の直前に slot が付くため）', S.digest(f) === d1); }
{ const a = sample(); a.digest = S.digest(a); t('検査値が合えば合格', S.verify(a).ok && S.verify(a).checked); a.clock.day = 5; t('内容が変わると「壊れている」', !S.verify(a).ok && /壊れている/.test(S.verify(a).error)); t('検査値がない古い保存は、検査しない（読み込める）', S.verify(sample()).ok && !S.verify(sample()).checked); }
// 形の検査
t('正しい形は、エラーなし', S.validate(sample()).length === 0);
t('必須の項目がないと、エラー', S.validate({ format: 2 }).length >= 2 && S.validate(Object.assign(sample(), { clock: null })).some(x => /clock/.test(x)));
t('人々の配列が短いと、エラー', (() => { const x = sample(); x.people = { meta: { groups: [{ id: 1 }], npc: { n: 10 } }, birth: new Int32Array(10), death: new Int32Array(3), sex: new Uint8Array(10), group: new Uint16Array(10), mother: new Uint32Array(10), father: new Uint32Array(10), spouse: new Uint32Array(10), job: new Uint8Array(10), flags: new Uint8Array(10) }; const e = S.validate(x); return e.length === 1 && /death/.test(e[0]); })());
t('集団の番号が連続でないと、エラー', (() => { const x = sample(); x.people = { meta: { groups: [{ id: 1 }, { id: 3 }], npc: { n: 0 } }, birth: [], death: [], sex: [], group: [], mother: [], father: [], spouse: [], job: [], flags: [] }; return S.validate(x).some(e => /連続/.test(e)); })());
// 実データ（世界データがあるとき）：本物の保存に、検査値を付けて確認
if (process.argv[3]) {
  const gen = require(path.resolve(process.argv[2])), world = v8.deserialize(fs.readFileSync(process.argv[3])), P = require('./people-core.js'), SW = require('./small-world.js');
  const env = world.fauna.env, cc = world.climate.cell, W = world.stats.width, cm = 99866.7 / W, pf = (c, m, o) => gen.faunaPlantFood(env, cc, c, m, o, 0, 0), FA = { faunaHunt: gen.faunaHunt, faunaDensity: gen.faunaDensity, ANIMAL_SPECIES: gen.ANIMAL_SPECIES };
  const ST = SW.stageOf(1), win = SW.pickWindow(world, 42, cm, ST), fa = gen.faunaClone(world.fauna); SW.pruneFauna(fa, world, win, cm);
  const pe = P.peopleGenerate(42, { world, plantFood: pf, fauna: fa, FA, month: 0, small: { win, n: ST.villages, popTotal: ST.popTotal, popMin: ST.popMin, popMax: ST.popMax, minD: ST.minDm / cm, maxD: ST.maxDm / cm } });
  for (let i = 0; i < 24; i++) { const month = i % 12; gen.faunaMonthly(fa, { month, env, cc }); P.peopleMonthly(pe, { month, day: i * 30, world, fauna: fa, FA, plantFood: pf, env, cc, res: world.resources }); }
  const st = { format: 1, schema: S.CURRENT_SCHEMA, seed: '42', clock: { day: 720 }, people: P.peopleSave(pe) };
  t('実際の保存の形が、検査を通る', S.validate(st).length === 0, S.validate(st).join(' / '));
  st.digest = S.digest(st); t('実際の保存に検査値を付けて、確認できる', S.verify(st).ok && S.verify(st).checked, st.digest);
  const bad = v8.deserialize(v8.serialize(st)); bad.people.birth[7] ^= 1; t('実際の保存の配列を1つ書き換えると、検出できる', !S.verify(bad).ok);
  const trunc = v8.deserialize(v8.serialize(st)); trunc.people.death = trunc.people.death.slice(0, 10); t('配列が切り詰められた保存は、形の検査で断る', S.validate(trunc).some(e => /death/.test(e)));
  const t0 = process.hrtime.bigint(); for (let i = 0; i < 5; i++) S.digest(st); const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 5; t('検査値の計算が軽い（50ms未満）', ms < 50, ms.toFixed(1) + 'ms');
}
console.log(ng ? `不合格 ${ng}` : `全て合格（${ok}項目）`); process.exit(ng ? 1 : 0);
