const v8=require('v8'),fs=require('fs'),path=require('path');
const G=require('/tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/v30/gen_v5.js'),world=v8.deserialize(fs.readFileSync('/tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/v30/world_v5_42.bin'));
const P=require('/home/user/-history-simulation-game-restart/npc/people-core.js');
const env=world.fauna.env,cc=world.climate.cell,W=world.stats.width,plantFood=(c,m,out)=>G.faunaPlantFood(env,cc,c,m,out,0,0),FA={faunaHunt:G.faunaHunt,faunaDensity:G.faunaDensity,ANIMAL_SPECIES:G.ANIMAL_SPECIES};
const fauna=G.faunaClone(world.fauna);const people=P.peopleGenerate(42,{world,plantFood,fauna,FA,month:0});
console.log('集団',people.groups.length,'住民',people.npc.livingCount());
const t0=process.hrtime.bigint();let ft=0,pt=0;const YEARS=+process.argv[2]||10;
for(let i=0;i<YEARS*12;i++){const month=i%12;let a=process.hrtime.bigint();G.faunaMonthly(fauna,{month,env,cc});ft+=Number(process.hrtime.bigint()-a)/1e6;a=process.hrtime.bigint();P.peopleMonthly(people,{month,day:i*30,world,fauna,FA,plantFood,env,cc,res:world.resources});pt+=Number(process.hrtime.bigint()-a)/1e6;if(i%120==119)console.log('年',(i+1)/12,'住民',people.npc.livingCount(),'集団',people.groups.filter(g=>g.alive).length);}
console.log('1か月あたり ms: 動物',(ft/YEARS/12).toFixed(1),'人',(pt/YEARS/12).toFixed(1),'合計',((ft+pt)/YEARS/12).toFixed(1),'メモリMB',Math.round(process.memoryUsage().rss/1e6));
