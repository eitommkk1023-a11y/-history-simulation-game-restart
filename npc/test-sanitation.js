'use strict';
// M3：水と衛生。井戸・排水路が受け持つ人数で、疫病・密集による病気が減る。村が自分で作り、町が育つ。node npc/test-sanitation.js <生成器> <世界データ>
const path = require('path'), { spawnSync } = require('child_process');
let ok = 0, ng = 0; const t = (name, cond, extra) => { if (cond) ok++; else ng++; console.log((cond ? '○ ' : '× ') + name + ' ' + (extra == null ? '' : extra)); };
{ const P = require('./people-core.js');
  const g = (o) => Object.assign({ pop: 300, facil: { well: 0, drain: 0 } }, o);
  t('受け持つ割合：施設なしは0', P.peSanitation(g({})) === 0);
  t('受け持つ割合：井戸1つ（150人）＋排水路1つ（300人）が人口300の村で、1（上限）', P.peSanitation(g({ facil: { well: 1, drain: 1 } })) === 1);
  t('受け持つ割合：井戸2つ（300人ぶん）で人口600なら 0.5', Math.abs(P.peSanitation(g({ pop: 600, facil: { well: 2, drain: 0 } })) - 0.5) < 1e-9);
  t('井戸・排水路が、建てられる施設の表にある（上限8）', P.FACIL.well.max === 8 && P.FACIL.drain.max === 8 && P.FACIL.drain.role === 'drain'); }
if (!process.argv[3]) { console.log(ng ? `不合格 ${ng}` : `全て合格（${ok}項目）`); process.exit(ng ? 1 : 0); }
const gen = path.resolve(process.argv[2]), wld = path.resolve(process.argv[3]);
const prog = `const v8=require('v8'),fs=require('fs'),G=require(${JSON.stringify(gen)}),w=v8.deserialize(fs.readFileSync(${JSON.stringify(wld)}));const P=require('./people-core.js'),SW=require('./small-world.js');const env=w.fauna.env,cc=w.climate.cell,W=w.stats.width,cm=99866.7/W,pf=(c,m,o)=>G.faunaPlantFood(env,cc,c,m,o,0,0),FA={faunaHunt:G.faunaHunt,faunaDensity:G.faunaDensity,ANIMAL_SPECIES:G.ANIMAL_SPECIES};const fa=G.faunaClone(w.fauna);const ST=SW.stageOf(3),win=SW.pickWindow(w,42,cm,ST);SW.pruneFauna(fa,w,win,cm);const pe=P.peopleGenerate(42,{world:w,plantFood:pf,fauna:fa,FA,month:0,small:{win,n:ST.villages,popTotal:ST.popTotal,popMin:ST.popMin,popMax:ST.popMax,minD:ST.minDm/cm,maxD:ST.maxDm/cm}});
for(let i=0;i<100*12;i++){const month=i%12;G.faunaMonthly(fa,{month,env,cc});P.peopleMonthly(pe,{month,day:i*30,world:w,fauna:fa,FA,plantFood:pf,env,cc,res:w.resources});}
const live=pe.groups.filter(g=>g.alive);const wells=live.reduce((a,g)=>a+(g.facil?g.facil.well||0:0),0),drains=live.reduce((a,g)=>a+(g.facil?g.facil.drain||0:0),0);const big=live.filter(g=>g.pop>=800).length;const idf=pe.groups.filter(g=>g.ledger&&g.ledger.opened).map(g=>{const L=g.ledger,T=L.tot;return L.open0+T.prod-T.eat-T.spoil-T.lost-T.dryLoss-T.move+L.residNet-L.total();});
console.log(JSON.stringify({pop:Math.round(live.reduce((a,g)=>a+g.pop,0)),max:Math.round(Math.max(...live.map(g=>g.pop))),wells,drains,big,san:live.length?live.reduce((a,g)=>a+P.peSanitation(g),0)/live.length:0,idfBad:idf.filter(x=>x!==0).length}));`;
const run = (cfg) => JSON.parse(spawnSync('node', ['-e', prog], { cwd: __dirname, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 1500000, env: Object.assign({}, process.env, cfg ? { WOH_CONFIG: JSON.stringify(cfg) } : {}) }).stdout.trim().split('\n').pop());
const on = run(null), off = run({ population: { aiSanitation: false } });
t('村が自分で井戸・排水路を作る（100年）', on.wells > 0 && off.wells === 0, `井戸 ${on.wells}・排水路 ${on.drains}／なし：${off.wells}`);
t('作ると、人口が増える（作らないより5%以上多い）', on.pop >= off.pop * 1.05, `${on.pop}／${off.pop}人`);
t('作ると、大きな村（800人以上）が増える／最大の村が大きい', on.max > off.max, `最大 ${on.max}／${off.max}人、800人以上 ${on.big}／${off.big}`);
t('台帳の収支の恒等式が、ちょうど0のまま', on.idfBad === 0, `不一致 ${on.idfBad}`);
console.log(ng ? `不合格 ${ng}` : `全て合格（${ok}項目）`); process.exit(ng ? 1 : 0);
