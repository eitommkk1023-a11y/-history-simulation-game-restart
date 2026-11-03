/**
 * World of History - optional, dependency-free terrain service prototype.
 * Reads the existing world arrays without copying them. No terrain generator,
 * renderer, game-rules engine or persistence backend is modified by this file.
 * Coordinates: X east, Y south, origin at the NW map corner, meters.
 */

function finite(name, n) {
  if (!Number.isFinite(n)) throw new RangeError(`${name} must be finite`);
  return n;
}
function positive(name, n) {
  if (!(finite(name, n) > 0)) throw new RangeError(`${name} must be positive`);
  return n;
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function mix(a, b, t) { return a + (b - a) * t; }
function smooth(t) { return t * t * (3 - 2 * t); }
function hash2(x, y, seed) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ (seed >>> 0);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295 * 2 - 1;
}
function noise(x, y, scale, seed) {
  const fx = x / scale, fy = y / scale, ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = smooth(fx - ix), ty = smooth(fy - iy);
  return mix(mix(hash2(ix, iy, seed), hash2(ix + 1, iy, seed), tx),
    mix(hash2(ix, iy + 1, seed), hash2(ix + 1, iy + 1, seed), tx), ty);
}
function boundsDistance(x, y, x0, y0, x1, y1) {
  return Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1));
}

export function createTerrainSystem(world, options = {}) {
  const width = options.width ?? world?.stats?.width ?? 3000;
  const height = options.height ?? world?.stats?.height ?? 3000;
  const metersPerCell = options.metersPerCell ?? (world?.geology?.kmPerBlock ?? 3.33) * 1000;
  const seed = options.seed ?? 0;
  const detailAmplitudeM = options.detailAmplitudeM ?? 6;
  const tileSizeM = options.tileSizeM ?? 128;
  const segments = options.segments ?? 64;
  const skirtsM = options.skirtsM ?? 40;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new TypeError('Invalid world dimensions');
  for (const name of ['elev', 'type', 'biome', 'water']) {
    if (!world?.[name] || world[name].length !== width * height) throw new TypeError(`Expected world.${name} with ${width * height} cells`);
  }
  positive('metersPerCell', metersPerCell);
  positive('tileSizeM', tileSizeM);
  finite('detailAmplitudeM', detailAmplitudeM);
  if (detailAmplitudeM < 0) throw new RangeError('detailAmplitudeM must be nonnegative');
  if (!Number.isSafeInteger(segments) || segments < 2 || segments > 128) throw new RangeError('segments must be 2..128');
  if (!Number.isSafeInteger(seed)) throw new TypeError('seed must be an integer');
  positive('skirtsM', skirtsM);
  const worldWidthM = width * metersPerCell, worldHeightM = height * metersPerCell;
  const id = `${seed}:${width}:${height}:${metersPerCell}:${world?.stats?.version ?? 'unknown'}`;
  const events = new Map();
  const bucketM = 4096;
  const eventBuckets = new Map();
  let revision = 0;
  const index = (x, y) => y * width + x;
  function assertPoint(xM, yM) {
    finite('xM', xM); finite('yM', yM);
    if (xM < 0 || yM < 0 || xM > worldWidthM || yM > worldHeightM) throw new RangeError('Out-of-world metric position');
  }
  function cellAt(xM, yM) {
    assertPoint(xM, yM);
    return { x: clamp(Math.floor(xM / metersPerCell), 0, width - 1),
      y: clamp(Math.floor(yM / metersPerCell), 0, height - 1) };
  }
  function cellCenter(x, y) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) throw new RangeError('Invalid cell');
    return { xM: (x + 0.5) * metersPerCell, yM: (y + 0.5) * metersPerCell };
  }
  function keyForBucket(x, y) { return `${x},${y}`; }
  function bucketForPoint(xM, yM) { return keyForBucket(Math.floor(xM / bucketM), Math.floor(yM / bucketM)); }
  function indexEvent(ev) {
    const x0 = Math.floor((ev.xM - ev.radiusM) / bucketM), x1 = Math.floor((ev.xM + ev.radiusM) / bucketM);
    const y0 = Math.floor((ev.yM - ev.radiusM) / bucketM), y1 = Math.floor((ev.yM + ev.radiusM) / bucketM);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const key = keyForBucket(x, y);
      if (!eventBuckets.has(key)) eventBuckets.set(key, []);
      eventBuckets.get(key).push(ev);
    }
  }
  function validateEvent(raw) {
    if (!raw || typeof raw.id !== 'string' || !/^[\w.:-]{1,80}$/.test(raw.id)) throw new TypeError('Event requires a stable id');
    if (!['eruption', 'earthquake', 'erosion', 'deposition', 'excavation', 'construction'].includes(raw.kind)) throw new TypeError('Invalid terrain event kind');
    const {xM, yM, radiusM, deltaM} = raw;
    assertPoint(xM, yM);
    positive('radiusM', radiusM);
    if (radiusM > 20000) throw new RangeError('Event radius exceeds this prototype limit');
    finite('deltaM', deltaM);
    if (Math.abs(deltaM) > 10000) throw new RangeError('Excessive terrain delta');
    if (!Number.isSafeInteger(raw.day) || raw.day < 0) throw new TypeError('day must be an integer >= 0');
    return Object.freeze({id:raw.id, kind:raw.kind, day:raw.day, xM, yM, radiusM, deltaM});
  }
  function addEvent(raw) {
    const ev = validateEvent(raw);
    if (events.has(ev.id)) throw new Error(`Duplicate event id: ${ev.id}`);
    events.set(ev.id, ev); indexEvent(ev); revision++;
    return ev;
  }
  function deltaAt(xM, yM) {
    let deltaM = 0;
    for (const ev of eventBuckets.get(bucketForPoint(xM, yM)) ?? []) {
      const d = Math.hypot(xM - ev.xM, yM - ev.yM) / ev.radiusM;
      if (d < 1) { const influence = (1 - d * d) ** 2; deltaM += ev.deltaM * influence; }
    }
    return deltaM;
  }
  function sample(xM, yM) {
    const cell = cellAt(xM, yM), i = index(cell.x, cell.y);
    // Cell centers are fixed global anchor points; bilinear base heights are
    // continuous on both sides of every tile/LOD border.
    const fx = clamp(xM / metersPerCell - 0.5, 0, width - 1);
    const fy = clamp(yM / metersPerCell - 0.5, 0, height - 1);
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
    const base = mix(mix(world.elev[index(x0, y0)], world.elev[index(x1, y0)], fx - x0),
      mix(world.elev[index(x0, y1)], world.elev[index(x1, y1)], fx - x0), fy - y0);
    const water = world.water[i], land = world.type[i] !== 0;
    const detail = land && water === 0 ? detailAmplitudeM * (
      0.65 * noise(xM, yM, 512, seed ^ 0x137) +
      0.25 * noise(xM, yM, 128, seed ^ 0x521) +
      0.10 * noise(xM, yM, 32, seed ^ 0x281)) : 0;
    const groundElevationM = base + detail + deltaAt(xM, yM);
    const lake = world.lakeId?.[i] ?? 0;
    const lakeLevel = lake && world.lakeLevels && Number.isFinite(world.lakeLevels[lake]) ? world.lakeLevels[lake] : null;
    const visibleElevationM = lakeLevel === null ? groundElevationM : Math.max(groundElevationM, lakeLevel);
    return { xM, yM, cell, groundElevationM, visibleElevationM,
      waterSurfaceElevationM: lakeLevel, land, water, biome: world.biome[i],
      // Non-numeric caveat: river depths/flow are NOT simulated here.
      hydrologyNeedsReview: events.size > 0 && deltaAt(xM,yM) !== 0 };
  }
  function conditions(xM, yM, stepM = 4) {
    positive('stepM', stepM);
    const p = sample(xM, yM);
    const lx = sample(clamp(xM - stepM, 0, worldWidthM), yM).groundElevationM;
    const rx = sample(clamp(xM + stepM, 0, worldWidthM), yM).groundElevationM;
    const ly = sample(xM, clamp(yM - stepM, 0, worldHeightM)).groundElevationM;
    const ry = sample(xM, clamp(yM + stepM, 0, worldHeightM)).groundElevationM;
    const dx = (rx - lx) / Math.max(1e-9, clamp(xM + stepM, 0, worldWidthM) - clamp(xM - stepM, 0, worldWidthM));
    const dy = (ry - ly) / Math.max(1e-9, clamp(yM + stepM, 0, worldHeightM) - clamp(yM - stepM, 0, worldHeightM));
    return {...p, slopeDegrees: Math.atan(Math.hypot(dx,dy))*180/Math.PI};
  }
  function makeTile(level, tx, ty) {
    if (!Number.isSafeInteger(level) || level < 0 || level > 32 || !Number.isSafeInteger(tx) || !Number.isSafeInteger(ty) || tx < 0 || ty < 0) throw new RangeError('Invalid tile address');
    const sizeM = tileSizeM * 2 ** level;
    const xM = tx * sizeM, yM = ty * sizeM;
    if (xM >= worldWidthM || yM >= worldHeightM) return null;
    return {key:`${level}:${tx}:${ty}`,level,tx,ty,xM,yM,widthM:Math.min(sizeM,worldWidthM-xM),heightM:Math.min(sizeM,worldHeightM-yM),stepM:sizeM/segments};
  }
  function selectTiles({xM,yM,radiusM=8000,detailFactor=1.5,maxTiles=128}={}) {
    assertPoint(xM,yM); positive('radiusM',radiusM); positive('detailFactor',detailFactor);
    if (!Number.isInteger(maxTiles) || maxTiles < 4 || maxTiles > 2048) throw new RangeError('Invalid maxTiles');
    const maxLevel = Math.max(0, Math.ceil(Math.log2(Math.max(worldWidthM,worldHeightM) / tileSizeM)));
    const selected = [];
    function visit(level,tx,ty) {
      const t = makeTile(level,tx,ty);
      if (!t || boundsDistance(xM,yM,t.xM,t.yM,t.xM+t.widthM,t.yM+t.heightM) > radiusM) return;
      const dist = boundsDistance(xM,yM,t.xM,t.yM,t.xM+t.widthM,t.yM+t.heightM);
      if (level>0 && dist < tileSizeM*2**level*detailFactor && selected.length+4 < maxTiles) {
        const old=selected.length;
        for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)visit(level-1,tx*2+dx,ty*2+dy);
        if (selected.length <= maxTiles) return;
        selected.length=old;
      }
      selected.push(t);
    }
    visit(maxLevel,0,0);
    return selected;
  }
  function buildMesh(tile) {
    if (!tile || !tile.key || !Number.isFinite(tile.widthM) || !Number.isFinite(tile.heightM)) throw new TypeError('Invalid tile');
    const edge = segments + 1;
    const interior = edge * edge;
    const positions = new Float32Array((interior + 4*edge) * 3);
    const heights = new Float32Array(interior);
    let v=0;
    function write(xLocal, yLocal, z) {
      positions[v++]=xLocal; positions[v++]=z; positions[v++]=yLocal;
    }
    for(let y=0;y<=segments;y++) for(let x=0;x<=segments;x++) {
      const xLocal=tile.widthM*x/segments, yLocal=tile.heightM*y/segments;
      const z=sample(tile.xM+xLocal,tile.yM+yLocal).visibleElevationM;
      heights[y*edge+x]=z;
      write(xLocal,yLocal,z);
    }
    // Four downward skirts conceal T-junction cracks where coarse/fine LOD tiles meet.
    // Skirts are visual only: physics and roads use sample()/conditions().
    const side=[];
    for(let x=0;x<=segments;x++) side.push(x);
    for(let y=0;y<=segments;y++) side.push(y*edge+segments);
    for(let x=segments;x>=0;x--) side.push(segments*edge+x);
    for(let y=segments;y>=0;y--) side.push(y*edge);
    for(const i of side)write(positions[i*3],positions[i*3+2],heights[i]-skirtsM);
    const indices=[];
    for(let y=0;y<segments;y++) for(let x=0;x<segments;x++) {
      const a=y*edge+x,b=a+1,c=a+edge,d=c+1;
      indices.push(a,c,b,b,c,d);
    }
    for(let e=0;e<4;e++)for(let i=0;i<segments;i++){
      const a=side[e*edge+i],b=side[e*edge+i+1],c=interior+e*edge+i,d=c+1;
      indices.push(a,b,c,b,d,c);
    }
    return {tile,positions,indices:new Uint16Array(indices),revision,originM:{xM:tile.xM,yM:tile.yM},skirtsM};
  }
  // Original river polylines stay canonical across all tile sizes. Segment
  // clipping gives adjacent tiles identical intersection points at their seam.
  function riverSegmentsInTile(tile) {
    if (!tile || !Number.isFinite(tile.xM) || !Number.isFinite(tile.yM)) throw new TypeError('Invalid river tile');
    const pts=world.riverPts, starts=world.riverStarts;
    if (!pts || !starts) return [];
    if (pts.length%3 || !starts.length && pts.length) throw new TypeError('Malformed river polylines');
    const x0=tile.xM,y0=tile.yM,x1=x0+tile.widthM,y1=y0+tile.heightM;
    const result=[],n=pts.length/3;
    for(let line=0;line<starts.length;line++){
      const a=starts[line],b=line+1<starts.length?starts[line+1]:n;
      if(!Number.isInteger(a)||a<0||b>n||b<a)throw new TypeError('Malformed river line indices');
      for(let i=a;i<b-1;i++){
        const ax=(pts[i*3]+.5)*metersPerCell,ay=(pts[i*3+1]+.5)*metersPerCell;
        const bx=(pts[(i+1)*3]+.5)*metersPerCell,by=(pts[(i+1)*3+1]+.5)*metersPerCell;
        const dx=bx-ax,dy=by-ay;
        const p=[-dx,dx,-dy,dy],q=[ax-x0,x1-ax,ay-y0,y1-ay];
        let t0=0,t1=1,valid=true;
        for(let j=0;j<4;j++){
          if(p[j]===0){if(q[j]<0){valid=false;break;}continue;}
          const r=q[j]/p[j];
          if(p[j]<0)t0=Math.max(t0,r);else t1=Math.min(t1,r);
          if(t0>t1){valid=false;break;}
        }
        if(!valid)continue;
        result.push({lineId:world.riverLine?.[line]??line,
          start:{xM:ax+dx*t0,yM:ay+dy*t0,widthM:mix(pts[i*3+2],pts[(i+1)*3+2],t0)*metersPerCell},
          end:{xM:ax+dx*t1,yM:ay+dy*t1,widthM:mix(pts[i*3+2],pts[(i+1)*3+2],t1)*metersPerCell}});
      }
    }
    return result;
  }
  function serializeEvents() {return {format:'woh-terrain-events-v1',worldId:id,events:[...events.values()]};}
  function loadEvents(snapshot) {
    if (!snapshot || snapshot.format!=='woh-terrain-events-v1' || snapshot.worldId!==id || !Array.isArray(snapshot.events)) throw new TypeError('Incompatible terrain-event snapshot');
    if (events.size) throw new Error('Load only into a fresh terrain system');
    const validated=snapshot.events.map(validateEvent);
    if (new Set(validated.map(e=>e.id)).size!==validated.length) throw new Error('Duplicate ids in snapshot');
    for(const ev of validated) addEvent(ev);
  }
  return Object.freeze({id,width,height,metersPerCell,worldWidthM,worldHeightM,tileSizeM,segments,
    cellAt,cellCenter,sample,conditions,makeTile,selectTiles,buildMesh,riverSegmentsInTile,addEvent,serializeEvents,loadEvents,
    get revision(){return revision;},get eventCount(){return events.size;},
    // Origin subtraction is required for large worlds, avoiding float32 GPU jitter.
    toLocal(xM,yM,originXM,originYM) {assertPoint(xM,yM);finite('originXM',originXM);finite('originYM',originYM);return {x:xM-originXM,z:yM-originYM};}
  });
}

/**
 * Incremental tile cache. A new update supersedes pending view requests.
 * A macrotask yield prevents long synchronous bursts; it is not a Web Worker.
 * Consumers can mount/unmount returned meshes in Three.js and use a real worker
 * in a future render integration without changing the terrain-world contract.
 */
export function createTerrainTileCache(terrain, {maxResidentTiles=128,yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0))}={}) {
  if (!terrain || typeof terrain.selectTiles!=='function') throw new TypeError('Expected terrain system');
  if (!Number.isInteger(maxResidentTiles) || maxResidentTiles < 4) throw new RangeError('Invalid tile capacity');
  const cache=new Map();let requestId=0,disposed=false;
  async function update(view) {
    if(disposed)throw new Error('Cache disposed');
    const id=++requestId;
    const selected=terrain.selectTiles({...view,maxTiles:Math.min(view?.maxTiles??maxResidentTiles,maxResidentTiles)});
    const wanted=new Set(selected.map(t=>t.key));
    for(const t of selected){
      if(id!==requestId)return {status:'superseded',tiles:[]};
      const existing=cache.get(t.key);
      if(existing?.revision===terrain.revision){cache.delete(t.key);cache.set(t.key,existing);continue;}
      await yieldTask();
      if(id!==requestId)return {status:'superseded',tiles:[]};
      cache.set(t.key,terrain.buildMesh(t));
    }
    for(const key of cache.keys())if(!wanted.has(key))cache.delete(key);
    while(cache.size>maxResidentTiles)cache.delete(cache.keys().next().value);
    return {status:'ok',tiles:selected.map(t=>cache.get(t.key)).filter(Boolean),revision:terrain.revision};
  }
  return Object.freeze({update,get:(key)=>cache.get(key),get size(){return cache.size;},dispose(){disposed=true;requestId++;cache.clear();}});
}
