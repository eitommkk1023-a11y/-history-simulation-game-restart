'use strict';
// 設定値（game-config.js）の検証：node npc/test-config.js [<generator.js> <world.bin>]
const { spawnSync } = require('child_process'), path = require('path'), fs = require('fs');
let ok = 0, ng = 0; const t = (name, cond, extra) => { if (cond) { ok++; console.log('○', name, extra == null ? '' : extra); } else { ng++; console.log('×', name, extra == null ? '' : extra); } };
const C = require('./game-config.js'), SW = require('./small-world.js'), P = require('./people-core.js');
t('既定の設定に問題がない', C.validate(C.DEFAULT).length === 0);
t('段階の設定が、小規模ワールドの段階になっている（S1〜S3）', [1, 2, 3].every(n => { const s = SW.stageOf(n), c = C.CONFIG.stages[n]; return s.sizeM === c.sizeM && s.villages === c.villages && s.popMin === c.popMin && s.popMax === c.popMax && s.minDm === c.minDm; }));
t('人口・層の設定が、`PE` に反映されている', P.PE.SPLIT_POP === C.CONFIG.population.splitPop && P.PE.SPLIT_POP_SETTLED === C.CONFIG.population.splitPopSettled && P.PE.INIT_SITE_MIN === C.CONFIG.population.initSiteMin && P.PE.LAYER_CAP === C.CONFIG.layers.cap && P.PE.LAYER_NEAR_CAP === C.CONFIG.layers.nearCap);
t('不正な設定は、検出される', C.validate(C.merge(C.DEFAULT, { stages: { 1: { popMax: 10 } } })).length > 0 && C.validate(C.merge(C.DEFAULT, { layers: { cap: -5 } })).length > 0);
t('merge は元の設定を変えない', (() => { const a = JSON.stringify(C.DEFAULT); C.merge(C.DEFAULT, { layers: { cap: 77 } }); return JSON.stringify(C.DEFAULT) === a; })());
const child = (patch, code) => spawnSync('node', ['-e', code], { cwd: __dirname, encoding: 'utf8', env: Object.assign({}, process.env, patch ? { WOH_CONFIG: JSON.stringify(patch) } : {}) });
{ const r = child({ layers: { cap: 77 }, population: { splitPop: 150 }, stages: { 3: { villages: 12 } } }, "const P=require('./people-core.js'),S=require('./small-world.js');console.log(JSON.stringify([P.PE.LAYER_CAP,P.PE.SPLIT_POP,S.stageOf(3).villages,S.stageOf(3).sizeM]))");
  t('環境変数 WOH_CONFIG で設定を上書きできる（一部だけ）', r.stdout.trim() === '[77,150,12,80000]', r.stdout.trim()); }
{ const r = child({ layers: { cap: -5 } }, "const P=require('./people-core.js');console.log(P.PE.LAYER_CAP)"); t('不正な上書きは、エラーを知らせて既定の設定を使う', r.stdout.trim() === String(C.DEFAULT.layers.cap) && /設定に問題/.test(r.stderr), (r.stderr || '').split('\n')[0]); }
if (process.argv[3]) { // 世界データがあるとき：設定を変えると、初期の村の人数が変わる
  const gen = path.resolve(process.argv[2]), wld = path.resolve(process.argv[3]);
  const code = (patch) => `const v8=require('v8'),fs=require('fs'),G=require(${JSON.stringify(gen)}),w=v8.deserialize(fs.readFileSync(${JSON.stringify(wld)}));const P=require('./people-core.js'),SW=require('./small-world.js');const env=w.fauna.env,cc=w.climate.cell,W=w.stats.width,cm=99866.7/W,pf=(c,m,o)=>G.faunaPlantFood(env,cc,c,m,o,0,0),FA={faunaHunt:G.faunaHunt,faunaDensity:G.faunaDensity,ANIMAL_SPECIES:G.ANIMAL_SPECIES};const ST=SW.stageOf(1),win=SW.pickWindow(w,42,cm,ST),fa=G.faunaClone(w.fauna);SW.pruneFauna(fa,w,win,cm);const pe=P.peopleGenerate(42,{world:w,plantFood:pf,fauna:fa,FA,month:0,small:{win,n:ST.villages,popTotal:ST.popTotal,popMin:ST.popMin,popMax:ST.popMax,minD:ST.minDm/cm,maxD:ST.maxDm/cm}});console.log(JSON.stringify(pe.groups.map(g=>Math.round(g.pop))))`;
  const a = child(null, code()), b = child(null, code()), c = child({ stages: { 1: { popMin: 100, popMax: 160 } } }, code());
  t('同じ設定・同じSeedで、同じ結果', a.stdout.trim() === b.stdout.trim() && a.stdout.trim().startsWith('['), a.stdout.trim());
  const pc = JSON.parse(c.stdout.trim() || '[]'); t('設定を変えると（popMax=160）、初期の村の人数が変わる（全て160人以下）', pc.length === 4 && pc.every(x => x <= 160) && c.stdout.trim() !== a.stdout.trim(), c.stdout.trim());
}
console.log(ng ? `不合格 ${ng}` : `全て合格（${ok}項目）`); process.exit(ng ? 1 : 0);
