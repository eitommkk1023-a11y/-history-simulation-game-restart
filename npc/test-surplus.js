'use strict';
// M1：余剰と土地の限り。蓄えの多い農耕の村は、人口が増える（100年で約2〜3倍）が、土地の広さで頭打ちになる。node npc/test-surplus.js <生成器> <世界データ>
const path = require('path'), { spawnSync } = require('child_process');
let ok = 0, ng = 0; const t = (name, cond, extra) => { if (cond) ok++; else ng++; console.log((cond ? '○ ' : '× ') + name + ' ' + (extra == null ? '' : extra)); };
if (!process.argv[3]) { console.log('世界データが必要です（tests/run-all.js から実行）'); process.exit(0); }
const gen = path.resolve(process.argv[2]), wld = path.resolve(process.argv[3]);
const prog = (years) => `const v8=require('v8'),fs=require('fs'),G=require(${JSON.stringify(gen)}),w=v8.deserialize(fs.readFileSync(${JSON.stringify(wld)}));const P=require('./people-core.js'),SW=require('./small-world.js');const env=w.fauna.env,cc=w.climate.cell,W=w.stats.width,cm=99866.7/W,pf=(c,m,o)=>G.faunaPlantFood(env,cc,c,m,o,0,0),FA={faunaHunt:G.faunaHunt,faunaDensity:G.faunaDensity,ANIMAL_SPECIES:G.ANIMAL_SPECIES};const fa=G.faunaClone(w.fauna);const ST=SW.stageOf(3),win=SW.pickWindow(w,42,cm,ST);SW.pruneFauna(fa,w,win,cm);const pe=P.peopleGenerate(42,{world:w,plantFood:pf,fauna:fa,FA,month:0,small:{win,n:ST.villages,popTotal:ST.popTotal,popMin:ST.popMin,popMax:ST.popMax,minD:ST.minDm/cm,maxD:ST.maxDm/cm}});
const pop=()=>pe.groups.reduce((a,g)=>a+(g.alive?g.pop:0),0);const p0=pop(),out={p0,y:[]};for(let i=0;i<${years}*12;i++){const month=i%12;G.faunaMonthly(fa,{month,env,cc});P.peopleMonthly(pe,{month,day:i*30,world:w,fauna:fa,FA,plantFood:pf,env,cc,res:w.resources});if(i%12===11&&((i+1)/12)%50===0)out.y.push(Math.round(pop()));}
out.groups=pe.groups.filter(g=>g.alive).length;out.starv=pe.groups.reduce((a,g)=>a+g.died.starvation,0);out.maxPop=Math.max(...pe.groups.filter(g=>g.alive).map(g=>g.pop));console.log(JSON.stringify(out));`;
const run = (cfg) => JSON.parse(spawnSync('node', ['-e', prog(100)], { cwd: __dirname, encoding: 'utf8', maxBuffer: 1 << 26, env: Object.assign({}, process.env, cfg ? { WOH_CONFIG: JSON.stringify(cfg) } : {}) }).stdout.trim().split('\n').pop());
const A = run({ population: { aiSanitation: false } }), B = run({ population: { aiSanitation: false, surplusFert: 0, surplusDis: 0, splitPopSettled: 800 } });   /* 水と衛生（M3）は別のテストで。ここでは切る */
const rA = A.y[1] / A.p0, rB = B.y[1] / B.p0;
t('余剰ありで、100年で人口が約2〜3倍（1.8〜3.5倍）', rA >= 1.8 && rA <= 3.5, `${A.p0}→${A.y[1]}（${rA.toFixed(2)}倍）`);
t('余剰なし（従来）では、あまり増えない（1.6倍未満）', rB < 1.6, `${B.p0}→${B.y[1]}（${rB.toFixed(2)}倍）`);
t('集団が増える（分裂して新しい村ができる）', A.groups > 28, `${A.groups}集団`);
t('飢えによる死者が、ごくわずか（100年で最終人口の3%以内）', A.starv <= A.y[1] * 0.03, `飢え ${A.starv}／最終 ${A.y[1]}人`);
t('1つの集団の人口が、土地の限りで頭打ち（最大の集団が 3,000人未満）', A.maxPop < 3000, `最大 ${Math.round(A.maxPop)}人`);
console.log(ng ? `不合格 ${ng}` : `全て合格（${ok}項目）`); process.exit(ng ? 1 : 0);
