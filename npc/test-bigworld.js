'use strict';
// 大きな世界（集団が160を超える）でも、死亡・出生の表が最新のまま使われる（以前は、集団が増えて表が作り直されたあと、古い表を使い続けて人口が止まらなくなった）。node npc/test-bigworld.js <生成器> <世界データ>
const path = require('path'), { spawnSync } = require('child_process');
let ok = 0, ng = 0; const t = (name, cond, extra) => { if (cond) ok++; else ng++; console.log((cond ? '○ ' : '× ') + name + ' ' + (extra == null ? '' : extra)); };
if (!process.argv[3]) { console.log('世界データが必要です（tests/run-all.js から実行）'); process.exit(0); }
const gen = path.resolve(process.argv[2]), wld = path.resolve(process.argv[3]);
const prog = `const v8=require('v8'),fs=require('fs'),G=require(${JSON.stringify(gen)}),w=v8.deserialize(fs.readFileSync(${JSON.stringify(wld)}));const P=require('./people-core.js');const env=w.fauna.env,cc=w.climate.cell,pf=(c,m,o)=>G.faunaPlantFood(env,cc,c,m,o,0,0),FA={faunaHunt:G.faunaHunt,faunaDensity:G.faunaDensity,ANIMAL_SPECIES:G.ANIMAL_SPECIES};const fa=G.faunaClone(w.fauna);const pe=P.peopleGenerate(42,{world:w,plantFood:pf,fauna:fa,FA,month:0});
let maxG=0,i=0;for(;i<${'${YEARS}'}*12;i++){const month=i%12;G.faunaMonthly(fa,{month,env,cc});P.peopleMonthly(pe,{month,day:i*30,world:w,fauna:fa,FA,plantFood:pf,env,cc,res:w.resources});const n=pe.groups.filter(g=>g.alive).length;if(n>maxG)maxG=n;if(n>=175)break;}
const alive=pe.groups.filter(g=>g.alive);const hz=pe.haz;let stale=0,nan=0;for(const g of alive){const h=pe.npc.hazardFn(30,g.id);if(!isFinite(h))nan++;const base=pe.npc.hazardFn(30,g.id);if(hz.dis[g.id]>0.05&&base<hz.dis[g.id]*0.9)stale++;}
console.log(JSON.stringify({groups:alive.length,maxG,years:Math.round(i/12),stale,nan,tableLen:hz.dis.length}));`.replace('${YEARS}', '300');
const r = JSON.parse(spawnSync('node', ['-e', prog], { cwd: __dirname, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 3000000 }).stdout.trim().split('\n').pop());
t('集団が増えて（175以上）、表が作り直されるところまで進んだ', r.groups >= 175, `${r.groups}集団・${r.years}年`);
t('すべての集団で、死亡率が有限（NaN でない）', r.nan === 0, `NaN ${r.nan}`);
t('病気のハザードが高い集団で、死亡率に反映されている（古い表を使っていない）', r.stale === 0, `古い表 ${r.stale}`);
console.log(ng ? `不合格 ${ng}` : `全て合格（${ok}項目）`); process.exit(ng ? 1 : 0);
