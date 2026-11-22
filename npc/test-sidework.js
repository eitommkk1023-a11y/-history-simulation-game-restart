'use strict';
// M5：兼業（農民・牧畜従事者が、足りない仕事を兼ねる）と識字（文字の技術のある民族の子どもが、家庭・共同体で身につける）。node npc/test-sidework.js <生成器> <世界データ>
const path = require('path'), { spawnSync } = require('child_process');
let ok = 0, ng = 0; const t = (name, cond, extra) => { if (cond) ok++; else ng++; console.log((cond ? '○ ' : '× ') + name + ' ' + (extra == null ? '' : extra)); };
if (!process.argv[3]) { console.log('世界データが必要です（tests/run-all.js から実行）'); process.exit(0); }
const gen = path.resolve(process.argv[2]), wld = path.resolve(process.argv[3]);
const prog = (script) => `const v8=require('v8'),fs=require('fs'),G=require(${JSON.stringify(gen)}),w=v8.deserialize(fs.readFileSync(${JSON.stringify(wld)}));const P=require('./people-core.js'),SW=require('./small-world.js');const env=w.fauna.env,cc=w.climate.cell,W=w.stats.width,cm=99866.7/W,pf=(c,m,o)=>G.faunaPlantFood(env,cc,c,m,o,0,0),FA={faunaHunt:G.faunaHunt,faunaDensity:G.faunaDensity,ANIMAL_SPECIES:G.ANIMAL_SPECIES};const fa=G.faunaClone(w.fauna);const ST=SW.stageOf(3),win=SW.pickWindow(w,42,cm,ST);SW.pruneFauna(fa,w,win,cm);const pe=P.peopleGenerate(42,{world:w,plantFood:pf,fauna:fa,FA,month:0,small:{win,n:ST.villages,popTotal:ST.popTotal,popMin:ST.popMin,popMax:ST.popMax,minD:ST.minDm/cm,maxD:ST.maxDm/cm}});
${script ? "for(const e of pe.ethnicities){P.peopleGrantTech(pe,e.id,'cultivate');P.peopleGrantTech(pe,e.id,'herd');P.peopleGrantTech(pe,e.id,'script');}" : ""}
for(let i=0;i<40*12;i++){const month=i%12;G.faunaMonthly(fa,{month,env,cc});P.peopleMonthly(pe,{month,day:i*30,world:w,fauna:fa,FA,plantFood:pf,env,cc,res:w.resources});}
const side=pe.side||{},lit=pe.lit||{},sk=Object.keys(side);const bad=sk.filter(k=>{const i=+k;return pe.npc.death[i]!==0x7fffffff||(pe.npc.job[i]!==9&&pe.npc.job[i]!==10);}).length;
const litBad=Object.keys(lit).filter(k=>pe.npc.age(+k)<8&&pe.npc.death[+k]===0x7fffffff).length;
const withTech=Object.keys(lit).length;const g0=pe.groups.find(g=>g.alive&&g.settle===2);const sv=P.peopleSave(pe);
console.log(JSON.stringify({nSide:sk.length,bad,jobs:[4,5,6,7,8].map(j=>sk.filter(k=>side[k]===j).length),nLit:withTech,rate:g0?+P.peLiteracyRate(pe,g0.id).toFixed(3):0,litBad,saved:!!sv.meta.side&&(!withTech||!!sv.meta.lit),sideCareer:Object.values(pe.careers||{}).filter(c=>c.some(r=>r[1]==='side')).length,learnCareer:Object.values(pe.careers||{}).filter(c=>c.some(r=>r[1]==='learn')).length}));`;
const run = (script) => JSON.parse(spawnSync('node', ['-e', prog(script)], { cwd: __dirname, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 1500000 }).stdout.trim().split('\n').pop());
const a = run(true), a2 = run(true), none = run(false);
t('兼業：農民・牧畜従事者の一部が、足りない仕事を兼ねる（40年）', a.nSide > 0, `${a.nSide}人（道具 ${a.jobs[0]}・建築 ${a.jobs[1]}・運搬 ${a.jobs[2]}・治療 ${a.jobs[3]}・警備 ${a.jobs[4]}）`);
t('兼業：兼ねているのは、生きている農民・牧畜従事者だけ', a.bad === 0, `不正 ${a.bad}`);
t('兼業：経歴に、兼業の始まりが残る', a.sideCareer > 0, `${a.sideCareer}人`);
t('識字：文字の技術があると、子どもが読み書きを身につける', a.nLit > 0, `${a.nLit}人、集団の識字率 ${a.rate}`);
t('識字：8歳未満は読み書きを身につけない', a.litBad === 0);
t('識字：文字の技術がなければ、誰も身につけない', none.nLit === 0, `${none.nLit}人`);
t('識字：経歴に、習得が残る', a.learnCareer > 0, `${a.learnCareer}人`);
t('保存データに、兼業・識字が入る', a.saved === true);
t('同じ Seed で、同じ結果（再現）', JSON.stringify(a) === JSON.stringify(a2));
console.log(ng ? `不合格 ${ng}` : `全て合格（${ok}項目）`); process.exit(ng ? 1 : 0);
