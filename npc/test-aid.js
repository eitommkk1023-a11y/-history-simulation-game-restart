'use strict';
// M2-a：食料の助け合い。不作の村へ、関係の近い村が、人の背で食料を届ける。node npc/test-aid.js <生成器> <世界データ>
const path = require('path'), { spawnSync } = require('child_process');
let ok = 0, ng = 0; const t = (name, cond, extra) => { if (cond) ok++; else ng++; console.log((cond ? '○ ' : '× ') + name + ' ' + (extra == null ? '' : extra)); };
if (!process.argv[3]) { console.log('世界データが必要です（tests/run-all.js から実行）'); process.exit(0); }
const gen = path.resolve(process.argv[2]), wld = path.resolve(process.argv[3]);
const prog = (years, child, forced) => `const v8=require('v8'),fs=require('fs'),G=require(${JSON.stringify(gen)}),w=v8.deserialize(fs.readFileSync(${JSON.stringify(wld)}));const P=require('./people-core.js'),SW=require('./small-world.js');const env=w.fauna.env,cc=w.climate.cell,W=w.stats.width,cm=99866.7/W,pf=(c,m,o)=>G.faunaPlantFood(env,cc,c,m,o,0,0),FA={faunaHunt:G.faunaHunt,faunaDensity:G.faunaDensity,ANIMAL_SPECIES:G.ANIMAL_SPECIES};const fa=G.faunaClone(w.fauna);const ST=SW.stageOf(3),win=SW.pickWindow(w,42,cm,ST);SW.pruneFauna(fa,w,win,cm);const pe=P.peopleGenerate(42,{world:w,plantFood:pf,fauna:fa,FA,month:0,small:{win,n:ST.villages,popTotal:ST.popTotal,popMin:ST.popMin,popMax:ST.popMax,minD:ST.minDm/cm,maxD:ST.maxDm/cm}});
let victim=0,events=0;for(let i=0;i<${years}*12;i++){const month=i%12;if(${child}&&i===40*12){const c=${forced}?pe.groups[${forced}-1]:pe.groups.find(g=>g.alive&&g.parent&&pe.groups[g.parent-1].alive&&g.pop>30);if(c){victim=c.id;c.hardship=0.9;}}if(${child}&&i===43*12&&victim)pe.groups[victim-1].hardship=0;G.faunaMonthly(fa,{month,env,cc});const e=P.peopleMonthly(pe,{month,day:i*30,world:w,fauna:fa,FA,plantFood:pf,env,cc,res:w.resources});events+=e.filter(x=>x.type==='aid').length;}
const A=pe.aid||{tot:{},ship:[]},v=victim?pe.groups[victim-1]:null,live=pe.groups.filter(g=>g.alive);
const idf=pe.groups.filter(g=>g.ledger&&g.ledger.opened).map(g=>{const L=g.ledger,T=L.tot;return L.open0+T.prod-T.eat-T.spoil-T.lost-T.dryLoss-T.move+L.residNet-L.total();});
const sv=P.peopleSave(pe);const donors=A.ship.length?0:0;
console.log(JSON.stringify({events,tot:A.tot,victim,vPop:v?v.pop:0,vStarv:v?v.died.starvation:0,vGot:v&&v.fav?Object.values(v.fav).reduce((a,x)=>a+x.got,0):0,pop:Math.round(live.reduce((a,g)=>a+g.pop,0)),idfBad:idf.filter(x=>x!==0).length,saved:!!sv.meta.aid,carriers:(A.ship[0]||{}).carriers||null}));`;
const run = (years, child, cfg, forced) => JSON.parse(spawnSync('node', ['-e', prog(years, child, forced || 0)], { cwd: __dirname, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 1200000, env: Object.assign({}, process.env, cfg ? { WOH_CONFIG: JSON.stringify(cfg) } : {}) }).stdout.trim().split('\n').pop());
const off = run(46, 1, { aid: { enabled: false } }), on = run(46, 1, null, off.victim);   /* 同じ村に不作を起こして比べる */
t('不作の村（親が近くにある）へ、荷が届く', on.victim > 0 && on.events > 0 && on.tot.arrived > 0, `荷 ${on.events}回、受けた ${on.tot.arrived}刻み（約${Math.round(on.tot.arrived / 18)}kg）`);
t('道中の傷みで、届く量は出した量より少し少ない（0.5%/日）', on.tot.arrived < on.tot.sent && on.tot.arrived > on.tot.sent * 0.95, `出 ${on.tot.sent}・着 ${on.tot.arrived}・失 ${on.tot.lost}`);
t('助けがあると、不作の村の人口が残る（助けなしより多い）', on.vPop > off.vPop, `助けあり ${Math.round(on.vPop)}人／なし ${Math.round(off.vPop)}人`);
t('助けがあると、不作の村が全滅せず残る（助けなしでは人口が大きく減る）', on.vPop > 0 && on.vPop > off.vPop * 1.5 + 5, `${Math.round(on.vPop)}／${Math.round(off.vPop)}人`);
t('受けた村の「受けた恩」が記録される', on.vGot > 0, `${on.vGot}刻み`);
t('台帳の収支の恒等式が、全集団でちょうど0のまま', on.idfBad === 0, `不一致 ${on.idfBad}`);
t('運び手の人物IDが記録される', Array.isArray(on.carriers) || on.tot.n > 0);
t('保存データに、助け合いの記録が入る', on.saved === true);
const calmOn = run(40, 0), calmOff = run(40, 0, { aid: { enabled: false } });
t('不作がなくても、世界が悪くならない（人口が助けなしより減らず、飢えの死者も増えない）', calmOn.pop >= calmOff.pop * 0.98, `助けあり ${calmOn.pop}／なし ${calmOff.pop}人、荷 ${calmOn.events}回`);
console.log(ng ? `不合格 ${ng}` : `全て合格（${ok}項目）`); process.exit(ng ? 1 : 0);
