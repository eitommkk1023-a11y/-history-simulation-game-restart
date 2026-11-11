from pathlib import Path
from playwright.sync_api import sync_playwright
import json
r=Path(__file__).resolve().parents[1];checks=[];errors=[];requests=[]
def ok(name,value):
 assert value,name
 checks.append(name)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1180,'height':820});page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda q:requests.append(q.url))
 page.route('http://assignment.test/**',lambda route:route.fulfill(body=(r/'tools/politics-military/assignment-sandbox.html').read_bytes(),content_type='text/html'))
 page.goto('http://assignment.test/');page.wait_for_function('window.__assignmentSandbox')
 before=page.evaluate('(()=>{const p=__assignmentSandbox.people.npc;return {n:p.n,rng:p.rng,checksum:p.checksum(),stats:JSON.stringify(p.stats),jobs:[...p.job],groups:[...p.group]};})()')
 ok('fixture is explicitly separate from main world',page.get_by_text('本作とは別の、検査用の住民6人を使う小世界です。',exact=False).is_visible())
 page.locator('[data-person="0"]').check();page.click('#assign')
 ok('ID zero assigned without changing population',page.locator('#assignedCount').inner_text()=='1' and page.locator('#populationCount').inner_text()=='6')
 page.click('#retry');ok('retry creates neither extra assignment nor history event',page.locator('#revision').inner_text()=='1' and page.locator('#pendingCount').inner_text()=='1')
 page.select_option('#unit','b');page.select_option('#actor','1');page.click('#assign')
 ok('duplicate assignment rejected in browser',page.locator('#status').get_attribute('data-ok')=='false' and page.locator('#revision').inner_text()=='1')
 page.locator('[data-person="2"]').check();page.click('#assign')
 ok('mixed batch failure is atomic',page.evaluate('__assignmentSandbox.ledger.assignments().map(x=>x.personId)')==[0])
 page.locator('[data-person="2"]').uncheck();page.click('#release')
 ok('wrong unit release is rejected',page.locator('#assignedCount').inner_text()=='1')
 page.select_option('#unit','a');page.select_option('#actor','0');page.click('#release');ok('explicit release succeeds',page.locator('#assignedCount').inner_text()=='0')
 page.select_option('#unit','b');page.select_option('#actor','1');page.click('#assign');ok('released person can be reassigned',page.evaluate('__assignmentSandbox.ledger.assignments()[0].unitId')=='b')
 page.locator('[data-person="0"]').uncheck();page.locator('[data-person="1"]').check();page.select_option('#actor','2');page.click('#assign')
 ok('no implicit authority for other actors',page.locator('#status').get_attribute('data-ok')=='false' and page.locator('#revision').inner_text()=='3')
 page.locator('details').evaluate('(e)=>e.open=true');page.click('#ack');page.click('#save');saved=page.locator('#snapshot').input_value();page.click('#load')
 ok('save/restore preserves roster and outbox acknowledgement',page.locator('#assignedCount').inner_text()=='1' and page.locator('#pendingCount').inner_text()=='2')
 corrupted=json.loads(saved);corrupted['worldKey']='another-world';page.fill('#snapshot',json.dumps(corrupted));page.click('#load')
 ok('invalid restore leaves live ledger untouched',page.locator('#status').get_attribute('data-ok')=='false' and page.locator('#revision').inner_text()=='3')
 after=page.evaluate('(()=>{const p=__assignmentSandbox.people.npc;return {n:p.n,rng:p.rng,checksum:p.checksum(),stats:JSON.stringify(p.stats),jobs:[...p.job],groups:[...p.group]};})()')
 ok('all browser actions preserve canonical people jobs RNG and statistics',before==after)
 page.fill('#snapshot',saved);page.click('#load');page.evaluate('window.scrollTo(0,0)')
 (r/'docs/images').mkdir(exist_ok=True);page.screenshot(path=str(r/'docs/images/politics-military-assignment.png'),full_page=True)
 for w,h in [(390,844),(822,286),(1180,820)]:
  page.set_viewport_size({'width':w,'height':h});page.evaluate('window.scrollTo(0,0)')
  ok(f'{w}x{h} page fits viewport',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  ok(f'{w}x{h} action targets remain touch-sized',page.evaluate('[...document.querySelectorAll("button,select")].every(e=>e.getBoundingClientRect().height>=44)'))
 ok('no runtime errors',not errors);ok('no dependency network requests',requests==['http://assignment.test/'])
 result={'checks':checks,'errors':errors,'requests':requests,'actual_iOS_hardware':False,'scope':'isolated development fixture, not main-game integration'}
 (r/'docs/politics-military/sandbox-validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
 print(json.dumps({'checks':len(checks),'errors':errors}));b.close()
