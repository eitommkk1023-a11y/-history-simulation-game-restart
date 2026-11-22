'use strict';
// M5 の土台：人物の経歴（身分・職業・所属の履歴）と、市場（町・商人のいる集落の物の出入り）の記録。node npc/test-careers.js <生成器> <世界データ>
const path = require('path'), { spawnSync } = require('child_process');
let ok = 0, ng = 0; const t = (name, cond, extra) => { if (cond) ok++; else ng++; console.log((cond ? '○ ' : '× ') + name + ' ' + (extra == null ? '' : extra)); };
{ const P = require('./people-core.js'), pe = { npc: { day: 120, gcount: new Int32Array(64) }, groups: [], careers: null };
  let thrown = 0; for (const f of [() => P.peCareerAdd(pe, -1, 'status', 'x', 1), () => P.peCareerAdd(pe, 1.5, 'status', 'x', 1), () => P.peCareerAdd(pe, 3, 'bogus', 'x', 1), () => P.peMarketRecord(pe, 1, 'bogus', 1), () => P.peMarketRecord(pe, 1, 'import', 1.5)]) { try { f(); } catch (e) { thrown++; } }
  t('経歴・市場：不正な人物ID・種類・小数の量は受け付けない', thrown === 5, `${thrown}/5`);
  for (let i = 0; i < 40; i++) { pe.npc.day = i; P.peCareerAdd(pe, 7, 'job', i % 12, 2); }
  const c = P.peCareerOf(pe, 7); t('経歴は、1人あたり最新32件まで残る（古いものから消える）', c.length === 32 && c[0].day === 8 && c[31].day === 39, `${c.length}件、最古 日${c[0].day}`);
  t('経歴の形：日・種類・値・集落', c[0].kind === 'job' && c[0].group === 2 && typeof c[0].value === 'number' && P.peCareerOf(pe, 99).length === 0); }
if (!process.argv[3]) { console.log(ng ? `不合格 ${ng}` : `全て合格（${ok}項目）`); process.exit(ng ? 1 : 0); }
const gen = path.resolve(process.argv[2]), wld = path.resolve(process.argv[3]);
const prog = `const v8=require('v8'),fs=require('fs'),G=require(${JSON.stringify(gen)}),w=v8.deserialize(fs.readFileSync(${JSON.stringify(wld)}));const P=require('./people-core.js'),SW=require('./small-world.js');const env=w.fauna.env,cc=w.climate.cell,W=w.stats.width,cm=99866.7/W,pf=(c,m,o)=>G.faunaPlantFood(env,cc,c,m,o,0,0),FA={faunaHunt:G.faunaHunt,faunaDensity:G.faunaDensity,ANIMAL_SPECIES:G.ANIMAL_SPECIES};const fa=G.faunaClone(w.fauna);const ST=SW.stageOf(3),win=SW.pickWindow(w,42,cm,ST);SW.pruneFauna(fa,w,win,cm);const pe=P.peopleGenerate(42,{world:w,plantFood:pf,fauna:fa,FA,month:0,small:{win,n:ST.villages,popTotal:ST.popTotal,popMin:ST.popMin,popMax:ST.popMax,minD:ST.minDm/cm,maxD:ST.maxDm/cm}});
for(let i=0;i<${'${Y}'}*12;i++){const month=i%12;G.faunaMonthly(fa,{month,env,cc});P.peopleMonthly(pe,{month,day:i*30,world:w,fauna:fa,FA,plantFood:pf,env,cc,res:w.resources});}
const ids=Object.keys(pe.careers||{}).map(Number),first=ids[0];const leaders=pe.groups.filter(g=>g.alive&&g.leader>=0&&g.leader!==undefined);const withHist=leaders.filter(g=>P.peCareerOf(pe,g.leader).some(r=>r.kind==='status'&&r.value==='leader'&&r.group===g.id)).length;
const mk=Object.keys(pe.markets||{}).map(k=>pe.markets[k]);const sv=P.peopleSave(pe);const js=JSON.parse(JSON.stringify(sv.meta));
console.log(JSON.stringify({nCareer:ids.length,leaders:leaders.length,withHist,markets:mk.length,mIn:mk.reduce((a,o)=>a+o.aidIn,0),mOut:mk.reduce((a,o)=>a+o.aidOut,0),imp:mk.reduce((a,o)=>a+o.import,0),saved:!!sv.meta.careers&&!!sv.meta.markets,sample:first===undefined?null:P.peCareerOf(pe,first).length,roundC:JSON.stringify(js.careers)===JSON.stringify(pe.careers),roundM:JSON.stringify(js.markets)===JSON.stringify(pe.markets||null)}));`;
const run = (Y) => JSON.parse(spawnSync('node', ['-e', prog.replace('${Y}', String(Y))], { cwd: __dirname, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 1500000 }).stdout.trim().split('\n').pop());
const a = run(60), b = run(60);
t('首長・合議の入れ替わりが、経歴に残る（60年）', a.nCareer > 0 && a.withHist >= a.leaders * 0.9, `経歴のある人 ${a.nCareer}人、首長のうち履歴あり ${a.withHist}/${a.leaders}`);
t('同じ Seed で、同じ結果（再現）', JSON.stringify(a) === JSON.stringify(b));
t('保存データに、経歴と（あれば）市場が入る／保存の形が壊れない', a.roundC === true && a.roundM === true);
t('市場：町・商人のいる集落に、助け合い・買い入れの記録がたまる', a.markets >= 0 && (a.markets === 0 || a.mIn + a.mOut + a.imp > 0), `市場 ${a.markets}、受け ${a.mIn}・出し ${a.mOut}・買い入れ ${a.imp}`);
console.log(ng ? `不合格 ${ng}` : `全て合格（${ok}項目）`); process.exit(ng ? 1 : 0);
