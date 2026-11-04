import fs from 'node:fs';import crypto from 'node:crypto';import v8 from 'node:v8';
const seed=Number(process.argv[2]??12345),mode=process.argv[3]??'new',html=fs.readFileSync(mode==='baseline'?'baseline/自然地理生成器.html':'exports/World-of-History-integrated.html','utf8');
const script=id=>html.match(new RegExp('<script[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)<\\/script>'))?.[1]??'';
const code=script('generator-src')+'\n'+script('fauna-src')+'\n'+script('rock-src');
let input;const capture=mode==='new'?`const realRockWorld=generateRockWorld;generateRockWorld=function(seed,ter,tec,clim,W,H,report){capture(buildRockInput(seed,ter,tec,clim,W,H));return realRockWorld(seed,ter,tec,clim,W,H,report);};`:'';
const generate=new Function('self','capture',code+'\n'+capture+'\nreturn generateWorld;')({},v=>{input=v;});
const t=performance.now();const world=mode==='baseline'?generate(seed,()=>{}):generate(seed,()=>{},mode==='legacy'?null:undefined);
const hash=a=>crypto.createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
const hashes={};for(const key of ['elev','type','biome','water','lakeId','lakeLevels','riverPts','regionId','mtnId'])hashes[key]=hash(world[key]);
function bytes(o,set=new Set()){if(!o||typeof o!=='object')return 0;if(ArrayBuffer.isView(o)){if(set.has(o.buffer))return 0;set.add(o.buffer);return o.buffer.byteLength;}return Object.values(o).reduce((s,v)=>s+bytes(v,set),0);}
const report={seed,mode,elapsedMs:performance.now()-t,maxRssKiB:process.resourceUsage().maxRSS,worldTypedBytes:bytes(world),rockTypedBytes:bytes(world.rocks),stats:world.stats,hashes,rockMetrics:world.rocks?.metrics,exposedIds:world.rocks?[...new Set(world.rocks.exposedRockId)].sort((a,b)=>a-b):[]};
fs.mkdirSync('validation/rocks',{recursive:true});fs.writeFileSync(`validation/rocks/world-${seed}-${mode}.json`,JSON.stringify(report,null,2));if(input)fs.writeFileSync(`validation/rocks/input-${seed}.bin`,v8.serialize(input));if(world.rocks)fs.writeFileSync(`validation/rocks/world-${seed}-grid.bin`,v8.serialize(world.rocks));console.log(JSON.stringify({seed,mode,elapsedMs:report.elapsedMs,maxRssMiB:report.maxRssKiB/1024,version:world.stats.version,ids:report.exposedIds,massError:world.rocks?.metrics.massRelativeError}));
