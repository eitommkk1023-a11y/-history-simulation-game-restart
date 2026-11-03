const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});try{
for(const [width,height]of [[844,390],[1180,820]]){
 const page=await browser.newPage({viewport:{width,height},hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://woh.test/play',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync('exports/World-of-History.html','utf8')}));await page.goto('http://woh.test/play');
 await page.waitForFunction(()=>window.__chunkPreview?.state);const pos=()=>page.evaluate(()=>({...__chunkPreview.markerPoint}));
 await page.locator('#uiToggle').click();assert.equal(await page.locator('header').isVisible(),false);assert.equal(await page.locator('#joystick').isVisible(),false);await page.locator('#uiToggle').click();
 if(!await page.locator('#settings').evaluate(e=>e.open))await page.locator('summary').click();
 assert.equal(await page.locator('#distance').isVisible(),false);
 await page.keyboard.down('w');await page.locator('#sprint').click();await page.waitForTimeout(120);assert.equal(await page.locator('#sprint').getAttribute('aria-pressed'),'true');
 await page.locator('#sprint').click();assert.equal(await page.locator('#sprint').getAttribute('aria-pressed'),'false');
 await page.locator('#sprint').click();await page.keyboard.up('w');await page.waitForTimeout(120);assert.equal(await page.locator('#sprint').getAttribute('aria-pressed'),'false');
 await page.locator('#viewMode').click();assert.equal(await page.locator('#distance').isVisible(),true);assert.equal(await page.locator('#sprint').isVisible(),false);
 const p=await pos(),before=await page.evaluate(()=>__chunkPreview.view);
 await page.keyboard.down('w');await page.waitForTimeout(200);await page.keyboard.up('w');assert.deepEqual(await pos(),p);const after=await page.evaluate(()=>__chunkPreview.view);assert.notDeepEqual(after.target,before.target);
 await page.locator('#distance').fill('180');await page.locator('#distance').dispatchEvent('input');
 await page.locator('#viewMode').click();assert.deepEqual(await pos(),p);assert.equal(await page.locator('#distance').isVisible(),false);
 assert.equal((await page.evaluate(()=>__chunkPreview.view)).yaw,.7);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({viewport:[width,height],ui:true,sprintToggle:true,stopCancels:true,overviewOnlyCamera:true}));await page.close();
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
