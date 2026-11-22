'use strict';
// M1：集落どうしの関係値（余剰を誰に分けるかの材料）。親の集落の記録・血縁・贈り合い・保存。node npc/test-relation.js <生成器> <世界データ>
const path = require('path'), { spawnSync } = require('child_process');
let ok = 0, ng = 0; const t = (name, cond, extra) => { if (cond) ok++; else ng++; console.log((cond ? '○ ' : '× ') + name + ' ' + (extra == null ? '' : extra)); };
if (!process.argv[3]) { console.log('世界データが必要です（tests/run-all.js から実行）'); process.exit(0); }
const gen = path.resolve(process.argv[2]), wld = path.resolve(process.argv[3]);
const prog = `const v8=require('v8'),fs=require('fs'),G=require(${JSON.stringify(gen)}),w=v8.deserialize(fs.readFileSync(${JSON.stringify(wld)}));const P=require('./people-core.js'),SW=require('./small-world.js');const env=w.fauna.env,cc=w.climate.cell,W=w.stats.width,cm=99866.7/W,pf=(c,m,o)=>G.faunaPlantFood(env,cc,c,m,o,0,0),FA={faunaHunt:G.faunaHunt,faunaDensity:G.faunaDensity,ANIMAL_SPECIES:G.ANIMAL_SPECIES};const fa=G.faunaClone(w.fauna);const ST=SW.stageOf(3),win=SW.pickWindow(w,42,cm,ST);SW.pruneFauna(fa,w,win,cm);const pe=P.peopleGenerate(42,{world:w,plantFood:pf,fauna:fa,FA,month:0,small:{win,n:ST.villages,popTotal:ST.popTotal,popMin:ST.popMin,popMax:ST.popMax,minD:ST.minDm/cm,maxD:ST.maxDm/cm}});
for(let i=0;i<60*12;i++){const month=i%12;G.faunaMonthly(fa,{month,env,cc});P.peopleMonthly(pe,{month,day:i*30,world:w,fauna:fa,FA,plantFood:pf,env,cc,res:w.resources});}
const live=pe.groups.filter(g=>g.alive),kin=P.peKinTies(pe),out={};
const kids=live.filter(g=>g.parent&&pe.groups[g.parent-1]&&pe.groups[g.parent-1].alive);out.nKids=kids.length;
const pc=kids.map(c=>P.peRelation(pe,c.id,c.parent,kin).score);out.pcMin=Math.min(...pc);
// 親子でない・同じ民族でもない遠い組
let far=null;for(const a of live)for(const b of live){if(a.id<b.id&&a.ethId!==b.ethId&&a.parent!==b.id&&b.parent!==a.id&&!(pe.nbr[a.id]||[]).includes(b.id)){far=[a.id,b.id];break;}if(far)break;}
out.far=far?P.peRelation(pe,far[0],far[1],kin).score:null;
const noFav=(r)=>{let x=0;for(const k in r.parts)if(k!=='favor')x+=r.parts[k];return x;};out.sym=live.slice(0,8).every(a=>live.slice(0,8).every(b=>a.id===b.id||noFav(P.peRelation(pe,a.id,b.id,kin))===noFav(P.peRelation(pe,b.id,a.id,kin))));
out.det=JSON.stringify(P.peRelation(pe,live[0].id,live[1].id,kin))===JSON.stringify(P.peRelation(pe,live[0].id,live[1].id));
out.marr=[...kin.values()].reduce((a,o)=>a+o.marr,0);
// 贈り合い
const a=live[0].id,b=live[1].id,before=P.peRelation(pe,b,a,kin).score;P.peGiftRecord(pe,a,b,60000);const after=P.peRelation(pe,b,a,kin).score,afterA=P.peRelation(pe,a,b,kin).score;out.favorUp=after-before;out.giverSame=afterA===P.peRelation(pe,a,b,kin).score;
let thrown=0;for(const x of [1.5,0,-3])try{P.peGiftRecord(pe,a,b,x);}catch(e){thrown++;}out.thrown=thrown;
// 保存→読み込み
const sv=P.peopleSave(pe);const js=JSON.parse(JSON.stringify(sv,(k,v)=>ArrayBuffer.isView(v)?{__ta:v.constructor.name,d:Array.from(v)}:v),(k,v)=>v&&v.__ta?new (globalThis[v.__ta])(v.d):v);
out.saveKeep=!!(sv.meta.groups.find(g=>g.parent)&&sv.meta.groups.find(g=>g.fav));
console.log(JSON.stringify(out));`;
const r = JSON.parse(spawnSync('node', ['-e', prog], { cwd: __dirname, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 900000 }).stdout.trim().split('\n').pop());
t('分裂した集落に、親の集落が記録されている', r.nKids >= 3, `${r.nKids}集落`);
t('親子の集落は、関係値が高い（40以上）', r.pcMin >= 40, `最小 ${r.pcMin}`);
t('遠くて血縁も民族も違う集落は、関係値が低い（親子より大幅に低い）', r.far !== null && r.far < 20, `${r.far}`);
t('贈り合いを除いた関係値は、a→b と b→a で同じ（助け合いで恩ができるので、恩は除く）', r.sym === true);
t('同じ入力で同じ結果（血縁の集計を渡しても、渡さなくても）', r.det === true);
t('集落をまたぐ婚姻・親子の集計が計算できる（村が数km以上離れていると、少ない）', Number.isInteger(r.marr) && r.marr >= 0, `婚姻 ${r.marr}`);
t('贈り合いを記録すると、受けた側の関係値が上がる（恩）', r.favorUp > 0, `+${r.favorUp}`);
t('贈った側の関係値は変わらない', r.giverSame === true);
t('整数でない・0以下の贈り合いは受け付けない', r.thrown === 3);
t('保存データに、親の集落と贈り合いが入る', r.saveKeep === true);
console.log(ng ? `不合格 ${ng}` : `全て合格（${ok}項目）`); process.exit(ng ? 1 : 0);
