'use strict';
// M5：財産（家・畑・家畜の持ち主の記録と相続）。node npc/test-property.js <生成器> <世界データ>
const path = require('path'), { spawnSync } = require('child_process');
let ok = 0, ng = 0; const t = (name, cond, extra) => { if (cond) ok++; else ng++; console.log((cond ? '○ ' : '× ') + name + ' ' + (extra == null ? '' : extra)); };
if (!process.argv[3]) { console.log('世界データが必要です（tests/run-all.js から実行）'); process.exit(0); }
const gen = path.resolve(process.argv[2]), wld = path.resolve(process.argv[3]);
const prog = () => `const v8=require('v8'),fs=require('fs'),G=require(${JSON.stringify(gen)}),w=v8.deserialize(fs.readFileSync(${JSON.stringify(wld)}));const P=require('./people-core.js'),SW=require('./small-world.js');const env=w.fauna.env,cc=w.climate.cell,W=w.stats.width,cm=99866.7/W,pf=(c,m,o)=>G.faunaPlantFood(env,cc,c,m,o,0,0),FA={faunaHunt:G.faunaHunt,faunaDensity:G.faunaDensity,ANIMAL_SPECIES:G.ANIMAL_SPECIES};const fa=G.faunaClone(w.fauna);const ST=SW.stageOf(3),win=SW.pickWindow(w,42,cm,ST);SW.pruneFauna(fa,w,win,cm);const pe=P.peopleGenerate(42,{world:w,plantFood:pf,fauna:fa,FA,month:0,small:{win,n:ST.villages,popTotal:ST.popTotal,popMin:ST.popMin,popMax:ST.popMax,minD:ST.minDm/cm,maxD:ST.maxDm/cm}});
for(const e of pe.ethnicities){P.peopleGrantTech(pe,e.id,'cultivate');P.peopleGrantTech(pe,e.id,'herd');}
for(let i=0;i<40*12;i++){const month=i%12;G.faunaMonthly(fa,{month,env,cc});P.peopleMonthly(pe,{month,day:i*30,world:w,fauna:fa,FA,plantFood:pf,env,cc,res:w.resources});}
P.peOwnYear(pe);const own=pe.own||{list:[],common:0},P2=pe.npc,L=own.list;const bad=L.filter(it=>P2.death[it.owner]!==0x7fffffff).length;const ids=new Set(L.map(it=>it.id));const kinds={house:0,field:0,herd:0};for(const it of L)kinds[it.kind]++;
const fieldBad=L.filter(it=>it.kind==='field'&&P2.job[it.owner]!==9&&P2.job[it.owner]!==10).length;const sv=P.peopleSave(pe);const pe2=P.peopleLoad(sv);
console.log(JSON.stringify({n:L.length,bad,dup:L.length-ids.size,kinds,common:own.common,next:own.next,saved:!!sv.meta.own&&sv.meta.own.list.length===L.length,loaded:!!pe2.own&&pe2.own.list.length===L.length,minor:L.filter(it=>it.kind==='house'&&P2.age(it.owner)<18).length}));`;
const run = () => JSON.parse(spawnSync('node', ['-e', prog()], { cwd: __dirname, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 1500000 }).stdout.trim().split('\n').pop());
const a = run(), a2 = run();
t('財産：家・畑・家畜が割り当てられる（40年）', a.n > 0 && a.kinds.house > 0 && a.kinds.field > 0, JSON.stringify(a.kinds));
t('財産：持ち主は、生きている人だけ', a.bad === 0, `不正 ${a.bad}`);
t('財産：同じ記録番号が重ならない', a.dup === 0);
t('財産：18歳未満の持ち主は、相続した孤児など（家の15%未満）', a.minor < a.kinds.house * 0.15, `${a.minor}件`);
t('相続：持ち主が亡くなっても、記録が残る（引き継ぐか共有地へ）', a.next > a.n, `割当 ${a.next - 1}件／現在 ${a.n}件／共有地へ ${a.common}件`);
t('保存・復元で財産が残る', a.saved && a.loaded);
t('同じ Seed で、同じ結果（再現）', JSON.stringify(a) === JSON.stringify(a2));
console.log(ng ? `不合格 ${ng}` : `全て合格（${ok}項目）`); process.exit(ng ? 1 : 0);
