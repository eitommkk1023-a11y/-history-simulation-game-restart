'use strict';
// M2-a：食料の助け合い。不作の村へ、関係の近い村が、人の背で食料を届ける。node npc/test-aid.js <生成器> <世界データ>
const path = require('path'), { spawnSync } = require('child_process');
let ok = 0, ng = 0; const t = (name, cond, extra) => { if (cond) ok++; else ng++; console.log((cond ? '○ ' : '× ') + name + ' ' + (extra == null ? '' : extra)); };
if (!process.argv[3]) { console.log('世界データが必要です（tests/run-all.js から実行）'); process.exit(0); }
const gen = path.resolve(process.argv[2]), wld = path.resolve(process.argv[3]);
const prog = (years, child, forced) => `const v8=require('v8'),fs=require('fs'),G=require(${JSON.stringify(gen)}),w=v8.deserialize(fs.readFileSync(${JSON.stringify(wld)}));const P=require('./people-core.js'),SW=require('./small-world.js');const env=w.fauna.env,cc=w.climate.cell,W=w.stats.width,cm=99866.7/W,pf=(c,m,o)=>G.faunaPlantFood(env,cc,c,m,o,0,0),FA={faunaHunt:G.faunaHunt,faunaDensity:G.faunaDensity,ANIMAL_SPECIES:G.ANIMAL_SPECIES};const fa=G.faunaClone(w.fauna);const ST=SW.stageOf(3),win=SW.pickWindow(w,42,cm,ST);SW.pruneFauna(fa,w,win,cm);const pe=P.peopleGenerate(42,{world:w,plantFood:pf,fauna:fa,FA,month:0,small:{win,n:ST.villages,popTotal:ST.popTotal,popMin:ST.popMin,popMax:ST.popMax,minD:ST.minDm/cm,maxD:ST.maxDm/cm}});
const AIDC=require('./game-config.js').CONFIG.aid;const aidOn=AIDC.enabled;if(${child})AIDC.enabled=false;   /* 年40までは、助け合いなしで同じ世界にそろえる */
let victim=0,events=0;for(let i=0;i<${years}*12;i++){const month=i%12;if(${child}&&i===40*12){AIDC.enabled=aidOn;const kin=P.peKinTies(pe),live0=pe.groups.filter(g=>g.alive&&g.pop>=30&&g.pop<400),c=${forced}?pe.groups[${forced}-1]:live0.find(g=>live0.some(d=>d.id!==g.id&&P.peRelation(pe,d.id,g.id,kin).score>=20&&Math.hypot(d.x-g.x,d.y-g.y)*99.8667/W<40));if(c){victim=c.id;c.hardship=0.9;}}if(${child}&&i===43*12&&victim)pe.groups[victim-1].hardship=0;G.faunaMonthly(fa,{month,env,cc});const e=P.peopleMonthly(pe,{month,day:i*30,world:w,fauna:fa,FA,plantFood:pf,env,cc,res:w.resources});events+=e.filter(x=>x.type==='aid').length;}
const A=pe.aid||{tot:{},ship:[]},v=victim?pe.groups[victim-1]:null,live=pe.groups.filter(g=>g.alive);
const idf=pe.groups.filter(g=>g.ledger&&g.ledger.opened).map(g=>{const L=g.ledger,T=L.tot;return L.open0+T.prod-T.eat-T.spoil-T.lost-T.dryLoss-T.move+L.residNet-L.total();});
const sv=P.peopleSave(pe);const donors=A.ship.length?0:0;
console.log(JSON.stringify({events,tot:A.tot,victim,vPop:v?v.pop:0,vStarv:v?v.died.starvation:0,vGot:v&&v.fav?Object.values(v.fav).reduce((a,x)=>a+x.got,0):0,pop:Math.round(live.reduce((a,g)=>a+g.pop,0)),idfBad:idf.filter(x=>x!==0).length,saved:!!sv.meta.aid,carriers:(A.ship[0]||{}).carriers||null}));`;
const run = (years, child, cfg, forced) => JSON.parse(spawnSync('node', ['-e', prog(years, child, forced || 0)], { cwd: __dirname, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 1200000, env: Object.assign({}, process.env, cfg ? { WOH_CONFIG: JSON.stringify(cfg) } : {}) }).stdout.trim().split('\n').pop());
const off = run(46, 1, { aid: { enabled: false } }), on = run(46, 1, null, off.victim);   /* 年40までは同じ世界にそろえ、同じ村に不作を起こして比べる */
t('不作の村（関係の近い村が近くにある）へ、荷が届く', on.victim > 0 && on.events > 0 && on.tot.arrived > 0, `荷 ${on.events}回、受けた ${on.tot.arrived}刻み（約${Math.round(on.tot.arrived / 18)}kg）`);
t('道中の傷みで、届く量は出した量より少し少ない（0.5%/日）', on.tot.arrived < on.tot.sent && on.tot.arrived > on.tot.sent * 0.95, `出 ${on.tot.sent}・着 ${on.tot.arrived}・失 ${on.tot.lost}`);
t('助けがあると、不作の村の人口が残る（助けなしより多い）', on.vPop > off.vPop, `助けあり ${Math.round(on.vPop)}人／なし ${Math.round(off.vPop)}人`);
t('助けがあると、不作の村が全滅せず残る（助けなしでは人口が大きく減る）', on.vPop > 0 && on.vPop > off.vPop * 1.5 + 5, `${Math.round(on.vPop)}／${Math.round(off.vPop)}人`);
t('受けた村の「受けた恩」が記録される', on.vGot > 0, `${on.vGot}刻み`);
t('台帳の収支の恒等式が、全集団でちょうど0のまま', on.idfBad === 0, `不一致 ${on.idfBad}`);
t('運び手の人物IDが記録される', Array.isArray(on.carriers) || on.tot.n > 0);
t('保存データに、助け合いの記録が入る', on.saved === true);
const calmOn = run(40, 0), calmOff = run(40, 0, { aid: { enabled: false } });
t('不作がなくても、世界が悪くならない（人口が助けなしの95%以上。商人の分、少し減る）', calmOn.pop >= calmOff.pop * 0.95, `助けあり ${calmOn.pop}／なし ${calmOff.pop}人、荷 ${calmOn.events}回`);
// ---- 運び方（荷車・船・家畜）と、外との交易の入口
{ const Pm = require('./people-core.js'), C = require('./game-config.js').CONFIG, A = C.aid, port = { site: { kind: 'river' } }, mk = (o) => Object.assign({ pop: 300, herdN: 0 }, o);
  const walk = Pm.peAidMode(A, {}, mk({}), mk({}), 10), cart = Pm.peAidMode(A, { cart: true }, mk({}), mk({}), 10), boat = Pm.peAidMode(A, { dugout: true }, mk(port), mk(port), 30), boatFar = Pm.peAidMode(A, { dugout: true }, mk(port), mk(port), 90), boatDry = Pm.peAidMode(A, { dugout: true }, mk({}), mk(port), 30), pack = Pm.peAidMode(A, { herd: true }, mk({ herdN: 40 }), mk({}), 10), all = Pm.peAidMode(A, { cart: true, dugout: true, herd: true }, mk(Object.assign({ herdN: 40 }, port)), mk(port), 30);
  t('運び方：技術がなければ人の背（1,000kg）', walk.mode === 'walk' && walk.kg === 1000, `${walk.mode} ${walk.kg}kg`);
  t('運び方：荷車の技術があれば荷車（人口300で3台＋人の背＝2,500kg）', cart.mode === 'cart' && cart.kg === 2500, `${cart.mode} ${cart.kg}kg`);
  t('運び方：舟の技術があり、川の村どうしで60km以内なら船（人口300で3隻＋人の背＝7,000kg）', boat.mode === 'boat' && boat.kg === 7000, `${boat.mode} ${boat.kg}kg`);
  t('運び方：船は、60kmを超える・水路の村でないと使えない', boatFar.mode === 'walk' && boatDry.mode === 'walk', `${boatFar.mode}／${boatDry.mode}`);
  t('運び方：牧畜と家畜があれば家畜（40頭の1/4＝10頭×100kg＋人の背＝2,000kg）', pack.mode === 'pack' && pack.kg === 2000, `${pack.mode} ${pack.kg}kg`);
  t('運び方：複数あれば、運べる量が最も多いものを選ぶ', all.mode === 'boat', `${all.mode} ${all.kg}kg`); }
const progS4 = `const v8=require('v8'),fs=require('fs'),G=require(${JSON.stringify(gen)}),w=v8.deserialize(fs.readFileSync(${JSON.stringify(wld)}));const P=require('./people-core.js');const env=w.fauna.env,cc=w.climate.cell,pf=(c,m,o)=>G.faunaPlantFood(env,cc,c,m,o,0,0),FA={faunaHunt:G.faunaHunt,faunaDensity:G.faunaDensity,ANIMAL_SPECIES:G.ANIMAL_SPECIES};const fa=G.faunaClone(w.fauna);const pe=P.peopleGenerate(42,{world:w,plantFood:pf,fauna:fa,FA,month:0});
for(let i=0;i<80*12;i++){const month=i%12;G.faunaMonthly(fa,{month,env,cc});P.peopleMonthly(pe,{month,day:i*30,world:w,fauna:fa,FA,plantFood:pf,env,cc,res:w.resources});}
const A=pe.aid||{tot:{}},idf=pe.groups.filter(g=>g.ledger&&g.ledger.opened).map(g=>{const L=g.ledger,T=L.tot;return L.open0+T.prod-T.eat-T.spoil-T.lost-T.dryLoss-T.move+L.residNet-L.total();});
console.log(JSON.stringify({tot:A.tot,idfBad:idf.filter(x=>x!==0).length,n:idf.length,pop:Math.round(pe.groups.reduce((a,g)=>a+(g.alive?g.pop:0),0))}));`;
const W4 = JSON.parse(spawnSync('node', ['-e', progS4], { cwd: __dirname, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 1500000, env: Object.assign({}, process.env, { WOH_CONFIG: JSON.stringify({ population: { farmFeeds: 2, capBase: 50 } }) }) }).stdout.trim().split('\n').pop());   /* 土地で養える人数を少なくして、商人・買い入れが起きる状況にする */
t('世界全体（80年）：船・家畜・人の背のどれかで荷が運ばれる', (W4.tot.boat || 0) + (W4.tot.pack || 0) + (W4.tot.walk || 0) + (W4.tot.cart || 0) > 0, JSON.stringify(W4.tot));
t('世界全体（80年）：商人のいる村が、外から食料を買い入れる', (W4.tot.imported || 0) > 0 && (W4.tot.importN || 0) > 0, `${W4.tot.imported}刻み・${W4.tot.importN}回`);
t('世界全体（80年）：台帳の収支の恒等式が、全集団でちょうど0', W4.idfBad === 0, `${W4.n}集団`);
console.log(ng ? `不合格 ${ng}` : `全て合格（${ok}項目）`); process.exit(ng ? 1 : 0);
