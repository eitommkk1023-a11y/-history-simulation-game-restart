import fs from 'node:fs';import crypto from 'node:crypto';
// Reuse the pinned library already embedded in the frozen development export.
const expectedThree='9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2';
const baseline=fs.readFileSync('exports/World-of-History-development.html','utf8');
const three=[...baseline.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).find(s=>crypto.createHash('sha256').update(s).digest('hex')===expectedThree);
if(!three)throw Error('Expected pinned Three r128 in the frozen development export');
const files=['prototypes/horse/identity.mjs','prototypes/horse/motion.mjs','prototypes/horse/controller.mjs','src/player/human-gait.mjs','prototypes/horse/rider.mjs','prototypes/horse/arena.mjs','prototypes/horse/renderer.mjs','prototypes/horse/app.mjs'];
// Each module binds imports explicitly from api, avoiding a new build dependency.
const imports={controller:'const {HORSE_GAITS}=api;',rider:'const {humanGait,solveHumanLeg}=api;',renderer:'const {HORSE_COATS,horseIdentity,horsePose,HORSE_GAITS,HORSE_BONES}=api;',app:'const {horseIdentity,freshHorseState,stepHorse,horseGait,createHorseRenderer,createHorseArena,createHorseRider}=api;'};
const modules=files.map(p=>{const key=p.split('/').at(-1).replace('.mjs',''),source=fs.readFileSync(p,'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,''),exports=[...fs.readFileSync(p,'utf8').matchAll(/^export (?:const|function) (\w+)/gm)].map(m=>m[1]);return `(()=>{${imports[key]||''}\n${source}\nObject.assign(api,{${exports.join(',')}});})();`;}).join('\n');
const asset=fs.readFileSync('assets/horse-source/horse.render.json','utf8');let html=fs.readFileSync('prototypes/horse/index.html','utf8').replace('<!--THREE-->','<script>'+three.replace(/<\/script/gi,'<\\/script')+'</script>').replace('<!--ASSET-->','<script id="horseAsset" type="application/json">'+asset+'</script>').replace('<!--APP-->','<script>(()=>{const api={};'+modules+'\napi.startHorsePrototype(THREE,JSON.parse(document.getElementById("horseAsset").textContent));})();</script>');
fs.mkdirSync('exports',{recursive:true});fs.writeFileSync('exports/World-of-History-horse-prototype-v2.html',html);console.log(JSON.stringify({bytes:Buffer.byteLength(html),sha256:crypto.createHash('sha256').update(html).digest('hex')}));
