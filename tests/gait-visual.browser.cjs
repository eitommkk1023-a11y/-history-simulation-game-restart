const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});try{const p=await b.newPage({viewport:{width:844,height:390}});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('http://woh.test/gait',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync('exports/World-of-History.html','utf8')}));await p.goto('http://woh.test/gait');await p.waitForFunction(()=>window.__chunkPreview?.state);await p.locator('#uiToggle').click();
for(const mode of ['walk','run']){
 await p.keyboard.down('d');if(mode==='run')await p.locator('#sprint').click();
 const samples=await p.evaluate(async()=>{const out=[];const start=performance.now();while(performance.now()-start<1800){await new Promise(requestAnimationFrame);const v=__chunkPreview,r=v.character;r.updateMatrixWorld(true);out.push(['left','right'].map(side=>{const a=r.getObjectByName(side+'Ankle').getWorldPosition(new THREE.Vector3());return {height:a.y-r.position.y-.035,knee:r.getObjectByName(side+'Knee').rotation.x};}));}return out;});
 console.log(JSON.stringify({mode,peak:Math.max(...samples.flat().map(s=>s.height)),minimum:Math.min(...samples.flat().map(s=>s.height))}));
 assert.ok(samples.flat().some(s=>s.height>(mode==='run'?.16:.045)),'swing foot clears the ground');assert.ok(samples.flat().some(s=>s.knee>(mode==='run'?1:.6)),'knee bends');assert.ok(samples.some(pair=>pair.some(s=>Math.abs(s.height)<.015)),'stance foot contacts ground');
 for(let i=0;i<10;i++){await p.waitForTimeout(65);await p.screenshot({path:`/tmp/woh-review/gait-${mode}-${i}.png`});}
 console.log(JSON.stringify({mode,maxLift:Math.max(...samples.flat().map(s=>s.height)),maxKnee:Math.max(...samples.flat().map(s=>s.knee)),frames:samples.length}));await p.keyboard.up('d');await p.waitForTimeout(200);
}
assert.deepEqual(errors,[]);assert.ok(await p.evaluate(()=>{const v=__chunkPreview,t=v.character.position.clone();t.y+=1.2;return v.camera.position.distanceTo(t)<4.1;}));}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
