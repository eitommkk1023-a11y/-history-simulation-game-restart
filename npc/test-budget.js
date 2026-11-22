'use strict';
// F8：世界の動きの予算の自動検査（tests/budgets.json）。人口の増え方・飢え・台帳の恒等式・同じ Seed の再現・1か月の計算時間。node npc/test-budget.js <生成器> <世界データ>
const path = require('path'), fs = require('fs'), { spawnSync } = require('child_process');
let ok = 0, ng = 0; const t = (name, cond, extra) => { if (cond) ok++; else ng++; console.log((cond ? '○ ' : '× ') + name + ' ' + (extra == null ? '' : extra)); };
if (!process.argv[3]) { console.log('世界データが必要です（tests/run-all.js から実行）'); process.exit(0); }
const B = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tests', 'budgets.json'), 'utf8')), gen = path.resolve(process.argv[2]), wld = path.resolve(process.argv[3]);
const prog = (small, years) => `const v8=require('v8'),fs=require('fs'),G=require(${JSON.stringify(gen)}),w=v8.deserialize(fs.readFileSync(${JSON.stringify(wld)}));const P=require('./people-core.js'),SW=require('./small-world.js');const env=w.fauna.env,cc=w.climate.cell,W=w.stats.width,cm=99866.7/W,pf=(c,m,o)=>G.faunaPlantFood(env,cc,c,m,o,0,0),FA={faunaHunt:G.faunaHunt,faunaDensity:G.faunaDensity,ANIMAL_SPECIES:G.ANIMAL_SPECIES};const fa=G.faunaClone(w.fauna);let sm=null;${small ? "const ST=SW.stageOf(3),win=SW.pickWindow(w,42,cm,ST);SW.pruneFauna(fa,w,win,cm);sm={win,n:ST.villages,popTotal:ST.popTotal,popMin:ST.popMin,popMax:ST.popMax,minD:ST.minDm/cm,maxD:ST.maxDm/cm};" : ""}const pe=P.peopleGenerate(42,{world:w,plantFood:pf,fauna:fa,FA,month:0,small:sm});
const pop=()=>pe.groups.reduce((a,g)=>a+(g.alive?g.pop:0),0);const p0=pop();let ms=0,mx=0;for(let i=0;i<${years}*12;i++){const month=i%12;G.faunaMonthly(fa,{month,env,cc});const t0=Date.now();P.peopleMonthly(pe,{month,day:i*30,world:w,fauna:fa,FA,plantFood:pf,env,cc,res:w.resources});const d=Date.now()-t0;ms+=d;if(d>mx)mx=d;}
const live=pe.groups.filter(g=>g.alive),idf=pe.groups.filter(g=>g.ledger&&g.ledger.opened).map(g=>{const L=g.ledger,T=L.tot;return L.open0+T.prod-T.eat-T.spoil-T.lost-T.dryLoss-T.move+L.residNet-L.total();});
console.log(JSON.stringify({p0,pop:Math.round(pop()),groups:live.length,starv:pe.groups.reduce((a,g)=>a+g.died.starvation,0),starving:live.filter(g=>g.fed<0.5).length,idBad:idf.filter(x=>x!==0).length,avgMs:ms/(${years}*12),maxMs:mx,sig:live.map(g=>g.id+':'+Math.round(g.pop)).join(',').length+':'+Math.round(pop())}));`;
const run = (small, years) => JSON.parse(spawnSync('node', ['-e', prog(small, years)], { cwd: __dirname, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 2400000 }).stdout.trim().split('\n').pop());
const a = run(true, 100), a2 = run(true, 100), s4 = run(false, 100);
const S3 = B.world.s3_100y, S4 = B.world.s4_100y;
t('S3 100年：人口が予算の範囲で増える', a.pop / a.p0 >= S3.popRatio[0] && a.pop / a.p0 <= S3.popRatio[1], `${a.p0}→${a.pop}（${(a.pop / a.p0).toFixed(2)}倍、予算 ${S3.popRatio.join('〜')}倍）`);
t('S3 100年：飢えの死者が、最終人口の予算以内', a.starv <= a.pop * S3.starvationShareMax, `${a.starv}／${a.pop}（予算 ${S3.starvationShareMax * 100}%）`);
t('S3 100年：集団が減らない（分裂・定着で増える）', a.groups >= S3.groupsMin, `${a.groups}集団`);
t('S3 100年：台帳の収支の恒等式が全集団でちょうど0', a.idBad <= S3.idFailMax, `不一致 ${a.idBad}`);
t('S3 100年：同じ Seed で、同じ結果（再現）', JSON.stringify(a) === JSON.stringify(Object.assign({}, a2, { avgMs: a.avgMs, maxMs: a.maxMs })), `${a.sig}／${a2.sig}`);
t('S4 100年：人口が予算の範囲', s4.pop >= S4.pop[0] && s4.pop <= S4.pop[1], `${s4.p0}→${s4.pop}（予算 ${S4.pop.join('〜')}）`);
t('S4 100年：集団の数が予算以内（増えすぎない）', s4.groups <= S4.groupsMax, `${s4.groups}集団`);
t('S4 100年：飢え（充足0.5未満）の集団が予算以内', s4.starving <= S4.starvingGroupsMax, `${s4.starving}集団`);
t('S4 100年：台帳の収支の恒等式が全集団でちょうど0', s4.idBad <= S4.idFailMax, `不一致 ${s4.idBad}`);
t('1か月の計算（node）の平均が予算以内（S4）', s4.avgMs <= B.world.monthMsNode.avgMax, `平均 ${s4.avgMs.toFixed(1)}ms／最大 ${s4.maxMs}ms（予算 平均 ${B.world.monthMsNode.avgMax}ms）`);
console.log(ng ? `不合格 ${ng}` : `全て合格（${ok}項目）`); process.exit(ng ? 1 : 0);
