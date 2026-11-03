const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../exports/World-of-History.html'),'utf8');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',
    args:['--no-sandbox','--enable-unsafe-swiftshader']});
  try{
    const reports=[];
    for(const [name,width,height]of [['phone',844,390],['tablet',1180,820]]){
      const context=await browser.newContext({viewport:{width,height},hasTouch:true,offline:true});
      const page=await context.newPage(),errors=[],requests=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
      await page.route('http://woh.test/offline',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:html}));
      await page.goto('http://woh.test/offline');
      await page.waitForFunction(()=>window.__chunkPreview?.state?.entries.length===9);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.equal(await page.locator('#orientationHint').isVisible(),false);
      const settings=page.locator('#settings');
      assert.equal(await settings.evaluate(e=>e.open),name==='tablet');
      if(name==='phone')assert.equal(await page.locator('#status').isVisible(),false,'閉じた設定の情報が地形に重ならない');
      if(name==='phone')await settings.locator('summary').click();
      assert.equal(await page.locator('#status').isVisible(),true,'設定を開けば地形情報を確認できる');
      for(const id of ['fixture','generate','seed']){
        const box=await page.locator('#'+id).boundingBox();
        assert.ok(box.height>=44 && box.width>=44 && box.x>=0 && box.x+box.width<=width,id);
      }
      if(name==='phone'){
        await page.locator('#generate').click();
        await page.waitForFunction(()=>window.__chunkPreview?.state?.label==='既存世界 Seed 12345',{timeout:180000});
        await page.setViewportSize({width:390,height:844});
        assert.equal(await page.locator('#orientationHint').isVisible(),true);
        await page.setViewportSize({width,height});
        assert.equal(await page.locator('#orientationHint').isVisible(),false);
      }
      if(process.env.WOH_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.WOH_SCREENSHOT_DIR,`offline-${name}.png`)});
      assert.deepEqual(errors,[]);
      assert.deepEqual(requests,['http://woh.test/offline']);
      reports.push({name,viewport:[width,height],label:await page.evaluate(()=>window.__chunkPreview.state.label),networkRequests:requests.length});
      await context.close();
    }
    console.log(JSON.stringify(reports));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
