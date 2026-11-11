from pathlib import Path
import json,time,hashlib
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
result={'checks':[],'pageErrors':[],'htmlSha256':hashlib.sha256((root/'World-of-History-v30-development.html').read_bytes()).hexdigest()};start=time.time()
def check(name,value,detail=None):
 result['checks'].append({'name':name,'passed':bool(value),'detail':detail});print(json.dumps(result['checks'][-1],ensure_ascii=False),flush=True)
 if not value:raise AssertionError(name)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1180,'height':820})
 page.on('pageerror',lambda e: (result['pageErrors'].append(str(e)),print('PAGE ERROR '+str(e),flush=True)))
 def route(r):
  from urllib.parse import urlparse,unquote
  path=unquote(urlparse(r.request.url).path)
  p=root/('World-of-History-v30-development.html' if path=='/' else path.lstrip('/'))
  if p.is_file():
   if p.suffix=='.html':r.fulfill(content_type='text/html',body=p.read_text().replace('generate(randomSeed())',"generate('12345')"))
   else:r.fulfill(path=str(p))
  else:r.fulfill(status=404,body='missing local resource')
 page.route('http://woh-main.test/**',route)
 page.add_init_script("localStorage.setItem('woh-dev','1')")
 print('booting actual main HTML',flush=True)
 page.goto('http://woh-main.test/?autostart',wait_until='domcontentloaded',timeout=60000)
 page.wait_for_function("window.__geo?.world && __geo.people && !document.getElementById('loading').classList.contains('show')",timeout=400000)
 page.evaluate('__geo.clock.playing=false')
 metrics=page.evaluate('({day:__geo.clock.day,popDay:__geo.people.npc.day,n:__geo.people.npc.n,seed:__geo.seed})')
 print('READY '+json.dumps(metrics),flush=True)
 check('main boot and shared population clock',metrics['day']==metrics['popDay'],metrics)
 page.evaluate('window.beforeMainSave=__geo.serializeState()')
 check('existing main save has world-bound military extension',page.evaluate('beforeMainSave.format===1 && beforeMainSave.military.worldKey===beforeMainSave.worldKey'))
 page.evaluate('__geo.skipDays(31)')
 check('daily and monthly paths share one day',page.evaluate('__geo.clock.day===31 && __geo.people.npc.day===31 && __geo.military.audit().day===31'))
 page.evaluate('window.mainSave=__geo.serializeState(); window.mainJson=__geo.packTyped(mainSave); window.mainBack=__geo.unpackTyped(mainJson)')
 check('JSON retains military collection data',page.evaluate('mainBack.military.data.state.transport.positions.__wohMap.length===0'))
 page.evaluate('window.goodPeople=__geo.people;window.goodDay=__geo.clock.day;window.badSave=structuredClone(mainSave);badSave.military.data.day=999;window.badResult=__geo.loadState(badSave)')
 check('invalid extension rejected before regeneration',page.evaluate('__geo.people===goodPeople && __geo.clock.day===goodDay && badResult===false'))
 page.evaluate('__geo.applyState(mainBack)')
 check('native in-place restoration preserves shared clock and accumulator',page.evaluate('__geo.clock.day===mainSave.clock.day && __geo.people.npc.day===mainSave.clock.day && __geo.clock.acc===mainSave.clock.acc'))
 # Real generated NPCs; developer fixture supplies authority/knowledge and a mission, never people or food.
 config=page.evaluate("""()=>{
  const w=__geo.world,p=__geo.people,P=p.npc,W=w.stats.width;
  for(const g of p.groups){
   if(!g.alive||!Number.isInteger(g.x)||!Number.isInteger(g.y)||g.food<24)continue;
   const ids=[];for(let i=0;i<P.n&&ids.length<3;i++)if(P.alive(i)&&P.group[i]===g.id&&P.age(i)>=20&&P.age(i)<40&&i!==p.player.id)ids.push(i);
   if(ids.length<3)continue;
   const from={x:g.x,y:g.y};if(!w.type[from.y*W+from.x]||w.water[from.y*W+from.x])continue;
   for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const to={x:g.x+dx,y:g.y+dy};if(to.x<0||to.y<0||to.x>=W||to.y>=w.stats.height||!w.type[to.y*W+to.x]||w.water[to.y*W+to.x])continue;
    const durable=g.food-(g.fresh||0)-(g.dried||0),kind=(g.dried||0)>=12?'dried':durable>=12?'durable':(g.fresh||0)>=12?'fresh':null;if(!kind)continue;
    return {unitId:'main-browser-pilot',issuerId:ids[0],recipientId:ids[1],courierId:ids[2],positions:[[ids[0],from],[ids[2],from],[ids[1],to]],knownCells:[[from.x,from.y],[to.x,to.y]],profile:{baseKmH:0.5,travelHoursPerDay:2},capacityKg:20,loadKg:12,groupId:g.id,foodKind:kind};
   }
  }throw Error('No suitable existing NPC mission site');
 }""")
 installed=page.evaluate('(c)=>__geo.military.installDeveloperMission(c)',config)
 check('developer mission uses existing generated people and actual group stock',installed.get('ok'),{'ids':[config['issuerId'],config['recipientId'],config['courierId']],'result':installed})
 page.evaluate('__geo.skipDays(1);window.midMission=__geo.serializeState();window.midAudit=__geo.military.audit()')
 check('actual main courier is in transit with consumed real rations',page.evaluate("midAudit.foodConsumedKg>0 && midAudit.deliveries[0].status==='in-transit'"),page.evaluate('({consumed:midAudit.foodConsumedKg,status:midAudit.deliveries[0].status})'))
 page.evaluate('__geo.skipDays(8);window.branchA={clock:__geo.clock.day,checksum:__geo.people.npc.checksum(),rng:__geo.people.npc.rng,stats:structuredClone(__geo.people.npc.stats),audit:__geo.military.audit()};__geo.applyState(midMission);__geo.skipDays(8);window.branchB={clock:__geo.clock.day,checksum:__geo.people.npc.checksum(),rng:__geo.people.npc.rng,stats:structuredClone(__geo.people.npc.stats),audit:__geo.military.audit()}')
 comparison=page.evaluate('({same:JSON.stringify(branchA)===JSON.stringify(branchB),a:branchA.audit.orders[0].stage,b:branchB.audit.orders[0].stage,checksumA:branchA.checksum,checksumB:branchB.checksum,rngA:branchA.rng,rngB:branchB.rng})')
 check('resume from an actual main mid-delivery save reproduces population and military results',comparison['same'],comparison)
 check('received command updates the actual main unit and result record',page.evaluate("branchB.audit.orders[0].stage==='completed' && !!branchB.audit.units[0].lastExecutedOrder"))
 page.evaluate('window.persistedMain=__geo.serializeState();__geo.clock.playing=false')
 page.evaluate("async()=>{await __geo.saveTo('slot1');window.diskMain=await new Promise((resolve,reject)=>{const r=indexedDB.open('geo-world-saves',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('saves','readonly'),q=tx.objectStore('saves').get('slot1');q.onsuccess=()=>{resolve(q.result);db.close()};q.onerror=()=>reject(q.error)};r.onerror=()=>reject(r.error)});}")
 check('existing IndexedDB stores the same native military extension',page.evaluate('diskMain.military.data.day===persistedMain.military.data.day && diskMain.military.worldKey===persistedMain.worldKey'))
 page.evaluate('__geo.applyState(diskMain);window.jsonMission=__geo.unpackTyped(__geo.packTyped(__geo.serializeState()));__geo.applyState(jsonMission)')
 check('IndexedDB and file round-trip retain delivery/consumption state',page.evaluate('JSON.stringify(__geo.military.audit())===JSON.stringify(branchB.audit)'))
 page.evaluate("window.fastStart=__geo.clock.day;__wohGod.enter();__wohGod.setTime('d10')")
 page.wait_for_timeout(700)
 page.evaluate('__geo.clock.playing=false')
 check('actual accelerated frame path advances the same shared clocks',page.evaluate('__geo.clock.day>fastStart && __geo.clock.day===__geo.people.npc.day && __geo.clock.day===__geo.military.audit().day'))
 page.set_default_timeout(300000)
 bench=page.evaluate("""()=>{
  const original=__geo.serializeState(),p=__geo.people,P=p.npc,groups=p.groups.filter(g=>g.alive),initial=P.n;
  const build=performance.now();while(P.n<100000)P.addFounder(groups[P.n%groups.length].id,25);WohPeople.peStats(p);const buildMs=performance.now()-build;
  const day=__geo.clock.day,t=performance.now();__geo.skipDays(30);const runMs=performance.now()-t;
  const s0=performance.now(),snapshot=__geo.serializeState(),saveMs=performance.now()-s0;
  const l0=performance.now();__geo.applyState(snapshot);const loadMs=performance.now()-l0;
  const result={kind:'actual-main-browser-with-explicit-load-fixture',initial,target:100000,totalIds:__geo.people.npc.n,living:__geo.people.npc.livingCount(),days:__geo.clock.day-day,aligned:__geo.clock.day===__geo.people.npc.day&&__geo.clock.day===__geo.military.audit().day,buildMs,runMs,saveMs,loadMs};
  __geo.applyState(original);return result;
 }""")
 result['populationLoad']=bench
 check('actual main 100,000-person load fixture advances and reloads without clock divergence',bench['totalIds']>=100000 and bench['days']==30 and bench['aligned'],bench)
 # Exercise the real loadState -> worker regeneration -> onWorldReady -> applyState path.
 page.evaluate('window.diskBefore=__geo.clock.day;__geo.applyState(diskMain);__geo.skipDays(30);window.fullExpected={checksum:__geo.people.npc.checksum(),rng:__geo.people.npc.rng,audit:__geo.military.audit(),food:__geo.people.groups.map(g=>g.food)};window.beforeReloadClock=__geo.clock.day;__geo.clock.playing=true;__geo.loadState(diskMain)')
 page.wait_for_function("document.getElementById('loading').classList.contains('show')")
 page.wait_for_timeout(1500)
 check('native load pauses the existing shared clock while terrain is regenerated',page.evaluate('__geo.clock.day===beforeReloadClock && __geo.clock.playing===false'))
 page.wait_for_function("!document.getElementById('loading').classList.contains('show') && __geo.military?.audit().day===diskMain.clock.day",timeout=400000)
 page.evaluate('__geo.clock.playing=false;__geo.skipDays(30);window.fullActual={checksum:__geo.people.npc.checksum(),rng:__geo.people.npc.rng,audit:__geo.military.audit(),food:__geo.people.groups.map(g=>g.food)}')
 full=page.evaluate('({same:JSON.stringify(fullExpected)===JSON.stringify(fullActual),expectedChecksum:fullExpected.checksum,actualChecksum:fullActual.checksum,expectedRng:fullExpected.rng,actualRng:fullActual.rng,foodEqual:JSON.stringify(fullExpected.food)===JSON.stringify(fullActual.food),militaryEqual:JSON.stringify(fullExpected.audit)===JSON.stringify(fullActual.audit)})')
 check('actual worker reload and a further month reproduce population, food and military outcomes',full['same'],full)
 check('main history does not duplicate military events after reload',page.evaluate('(()=>{const a=__geo.history.list.filter(e=>e.militaryEventKey).map(e=>e.militaryEventKey);return a.length===new Set(a).size})()'))
 page.screenshot(path='/tmp/woh-main-military.png')
 result['elapsedSeconds']=time.time()-start
 result['boot']=metrics
 (root/'docs/politics-military/main-browser-validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 check('no main page runtime exceptions',not result['pageErrors'],result['pageErrors'])
 browser.close()
