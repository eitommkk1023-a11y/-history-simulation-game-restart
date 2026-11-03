const {chromium}=require('playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
  for(const [width,height] of [[844,390],[1180,820]]){
   const context=await browser.newContext({viewport:{width,height},hasTouch:true,offline:true});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('http://woh.test/play',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync('exports/World-of-History.html','utf8')}));
   await page.goto('http://woh.test/play');await page.waitForFunction(()=>window.__chunkPreview?.state);
   assert.equal(await page.locator('#joystick').count(),1,'walking controls exist');
   const position=()=>page.evaluate(()=>({...window.__chunkPreview.markerPoint}));
   const a=await position();await page.keyboard.down('w');await page.waitForTimeout(450);await page.keyboard.up('w');
   const b=await position();assert.ok(Math.hypot(b.xM-a.xM,b.yM-a.yM)>.1,'keyboard moves');
   const contact=await page.evaluate(()=>{const p=window.__chunkPreview.markerPoint;return {p,g:window.__chunkPreview.groundAt(p.xM,p.yM)};});
   assert.ok(Math.abs(contact.p.elevationM-contact.g.elevationM)<1e-8);
   const js=await page.locator('#joystick').boundingBox(),cx=js.x+js.width/2,cy=js.y+js.height/2;
   const cdp=await context.newCDPSession(page);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy,id:1}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx,y:cy-35,id:1}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy-35,id:1},{x:width-160,y:height/2,id:2}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx,y:cy-35,id:1},{x:width-220,y:height/2+10,id:2}]});
   await page.waitForTimeout(400);const c=await position();assert.ok(Math.hypot(c.xM-b.xM,c.yM-b.yM)>.1,'simultaneous camera and stick still move');
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await page.waitForTimeout(100);const stopped=await position();await page.waitForTimeout(150);assert.deepEqual(await position(),stopped,'release stops movement');
   if(!await page.locator('#settings').evaluate(e=>e.open))await page.locator('#settings summary').click();
   await page.locator('#viewMode').click();assert.deepEqual(await position(),stopped,'view switch preserves position');
   await page.locator('#viewMode').click();
   await page.keyboard.down('w');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));const blurred=await position();await page.waitForTimeout(150);assert.deepEqual(await position(),blurred);await page.keyboard.up('w');
   assert.deepEqual(errors,[]);
   await page.screenshot({path:`/tmp/woh-review/walking-${width}.png`});
   console.log(JSON.stringify({viewport:[width,height],keyboard:true,multiTouch:true,release:true,ground:true}));await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
