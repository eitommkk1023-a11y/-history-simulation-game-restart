const {chromium}=require('playwright');
const {resolve,extname}=require('node:path');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const root=resolve(__dirname,'..');
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8'};
(async()=>{
  const executablePath=process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
  const browser=await chromium.launch({executablePath,headless:true,
    args:['--no-sandbox','--enable-unsafe-swiftshader']});
  try{
    const context=await browser.newContext({viewport:{width:1100,height:800}});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    if(process.env.THREE_R128_PATH)await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',route=>{
      return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(process.env.THREE_R128_PATH)});
    });
    await page.route('http://woh.test/**',route=>{
      const path=resolve(root,'.'+decodeURIComponent(new URL(route.request().url()).pathname));
      if(!path.startsWith(root+'/')||!fs.existsSync(path))return route.fulfill({status:404,body:'Not found'});
      return route.fulfill({contentType:types[extname(path)]||'text/plain',body:fs.readFileSync(path)});
    });
    await page.goto('http://woh.test/previews/terrain-chunks.html');
    await page.waitForFunction(()=>window.__chunkPreview?.state?.entries.length===9);
    async function compare(){
      return page.evaluate(()=>{
        const view=window.__chunkPreview,{state}=view;
        const ray=new THREE.Raycaster();let maxError=0,count=0;
        for(const {chunk,mesh}of state.entries){
          for(const [u,v]of [[.13,.21],[.63,.71],[.91,.11],[.5,.5]]){
            const x=chunk.originM.xM+chunk.widthM*u,y=chunk.originM.yM+chunk.heightM*v;
            const contact=chunk.sampleGround(x,y);
            ray.set(new THREE.Vector3(x-state.origin.xM,10000,y-state.origin.yM),new THREE.Vector3(0,-1,0));
            const hit=ray.intersectObject(mesh)[0];
            if(!hit)throw new Error('Rendered ground is missing');
            maxError=Math.max(maxError,Math.abs(hit.point.y+state.origin.elevationM-contact.elevationM));count++;
          }
        }
        return {label:state.label,chunks:state.entries.length,rays:count,maxError};
      });
    }
    const fixture=await compare();assert.ok(fixture.maxError<1e-5);
    await page.locator('#wire').check();
    assert.equal(await page.evaluate(()=>window.__chunkPreview.state.entries.every(e=>e.mesh.material.wireframe)),true);
    await page.locator('#wire').uncheck();
    await page.locator('#generate').click();
    await page.waitForFunction(()=>window.__chunkPreview?.state?.label.startsWith('既存世界'),{timeout:180000});
    const real=await compare();assert.ok(real.maxError<1e-5);
    if(process.env.WOH_SCREENSHOT_PATH)await page.screenshot({path:process.env.WOH_SCREENSHOT_PATH});
    await page.locator('#fixture').click();
    await page.waitForFunction(()=>window.__chunkPreview?.state?.label==='固定テスト地形');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({fixture,real,pageErrors:errors.length}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
