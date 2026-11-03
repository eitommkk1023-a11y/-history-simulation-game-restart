/**
 * World of History: read-only geographic adapter for the existing generator.
 * Works with window.__geo.world (world.elev/type/biome/water).
 * This is a local land-route prototype; not a population/economy integration.
 * Coefficients below are experimental and NOT approved gameplay rules.
 */
const BIOME_SPEED = Object.freeze({
  2: 0.55, 3: 0.75, 4: 0.70, 6: 0.80, 7: 0.65,
  8: 0.72, 10: 0.75, 11: 0.55, 12: 0.55, 13: 0.35,
  14: 0.78, 15: 0.65,
});
const DIRECTIONS = Object.freeze([
  [1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1],
]);
function assertPosition(p, w, h) {
  if (!p || !Number.isInteger(p.x) || !Number.isInteger(p.y) || p.x < 0 || p.y < 0 || p.x >= w || p.y >= h) {
    throw new RangeError('Position must be an in-bounds integer {x, y}');
  }
}
function heapPush(q, item) {
  q.push(item); let i = q.length-1;
  while (i) {
    const p=(i-1)>>1; if (q[p].f <= item.f) break;
    q[i]=q[p]; i=p;
  }
  q[i]=item;
}
function heapPop(q) {
  const result=q[0], tail=q.pop();
  if (q.length) {
    let i=0;
    while (i*2+1 < q.length) {
      let child=i*2+1;
      if (child+1<q.length && q[child+1].f<q[child].f) child++;
      if (q[child].f>=tail.f) break;
      q[i]=q[child]; i=child;
    }
    q[i]=tail;
  }
  return result;
}
export function createGeographyAdapter(world, { width=3000, height=3000, kmPerBlock=3.33, infrastructure=null } = {}) {
  if (!world || !Number.isInteger(width) || !Number.isInteger(height) || width<1 || height<1 || !Number.isFinite(kmPerBlock) || kmPerBlock<=0) throw new TypeError('Invalid world dimensions');
  const n=width*height;
  for (const k of ['elev','type','biome','water']) {
    if (!world[k] || world[k].length!==n) throw new TypeError(`Expected ${k} with ${n} cells`);
  }
  if (infrastructure && (typeof infrastructure.roadFor !== 'function' || typeof infrastructure.crossingsFrom !== 'function')) throw new TypeError('Invalid transport network');
  const ix=(x,y)=>y*width+x;
  const inBounds=(x,y)=>x>=0 && y>=0 && x<width && y<height;
  // 0=none, 1=river, 2=lake in the current generator. Bridge/ford edges
  // will need explicit data before river cells can be traversed.
  const traversable=(x,y)=>inBounds(x,y) && world.type[ix(x,y)]!==0 && world.water[ix(x,y)]===0;
  function sample(x,y) {
    assertPosition({x,y},width,height);
    const i=ix(x,y);
    return {x,y,index:i,elevationM:world.elev[i],land:world.type[i]!==0,water:world.water[i],biome:world.biome[i],traversable:traversable(x,y)};
  }
  function route(start,finish,{knows,baseKmH=5,maxSlopeDeg=Infinity,maxExpanded=30000,
    mode='foot',loadKg=0,knowsFacility=()=>false,canUse=()=>true,terrainPassable=()=>true}={}) {
    assertPosition(start,width,height); assertPosition(finish,width,height);
    if (typeof knows!=='function') throw new TypeError('A per-actor knows(x, y) function is required; do not use omniscient terrain knowledge');
    if (!Number.isFinite(baseKmH) || baseKmH<=0 || !(maxSlopeDeg>0) || !Number.isInteger(maxExpanded) || maxExpanded<1 || !Number.isFinite(loadKg) || loadKg<0 ||
      typeof knowsFacility!=='function' || typeof canUse!=='function' || typeof terrainPassable!=='function') throw new RangeError('Invalid travel profile or search budget');
    if (!knows(start.x,start.y) || !knows(finish.x,finish.y)) return {status:'unknown'};
    if (!traversable(start.x,start.y) || !traversable(finish.x,finish.y) ||
        !terrainPassable(start.x,start.y,mode) || !terrainPassable(finish.x,finish.y,mode)) return {status:'blocked'};
    const source=ix(start.x,start.y), target=ix(finish.x,finish.y);
    const g=new Map([[source,0]]), prev=new Map(), open=[];
    // With arbitrary crossing links or roads, Euclidean distance is no longer a safe
    // admissible heuristic; use Dijkstra while infrastructure is present.
    const heuristic=infrastructure ? ()=>0 :
      (x,y)=>Math.hypot(finish.x-x,finish.y-y)*kmPerBlock/(baseKmH*1.125);
    heapPush(open,{i:source,g:0,f:heuristic(start.x,start.y)});
    let expanded=0;
    function relax(curr,to,time,leg) {
      const ng=curr.g+time;
      if (ng<(g.get(to)??Infinity)) {
        g.set(to,ng); prev.set(to,{from:curr.i,leg});
        const x=to%width,y=Math.floor(to/width);
        heapPush(open,{i:to,g:ng,f:ng+heuristic(x,y)});
      }
    }
    const ctx={mode,loadKg,knowsFacility,canUse};
    while (open.length) {
      const curr=heapPop(open);
      if (curr.g!==g.get(curr.i)) continue;
      if (curr.i===target) {
        const indices=[target],legs=[];
        while (indices.at(-1)!==source) {
          const p=prev.get(indices.at(-1));
          indices.push(p.from);legs.push(p.leg);
        }
        indices.reverse();legs.reverse();
        const path=indices.map(i=>({x:i%width,y:Math.floor(i/width)}));
        const distanceKm=legs.reduce((s,leg)=>s+leg.distanceKm,0);
        return {status:'ok',path,legs,hours:curr.g,distanceKm,expanded};
      }
      if (++expanded>maxExpanded) return {status:'budget-exceeded',expanded};
      const x=curr.i%width,y=Math.floor(curr.i/width),elev=world.elev[curr.i];
      for (const [dx,dy] of DIRECTIONS) {
        const nx=x+dx,ny=y+dy;
        if (!traversable(nx,ny) || !knows(nx,ny) || !terrainPassable(nx,ny,mode)) continue;
        if (dx && dy && (!traversable(x+dx,y) || !traversable(x,y+dy) ||
          !knows(x+dx,y) || !knows(x,y+dy) ||
          !terrainPassable(x+dx,y,mode) || !terrainPassable(x,y+dy,mode))) continue;
        const j=ix(nx,ny),length=kmPerBlock*Math.hypot(dx,dy);
        const slope=Math.atan2(world.elev[j]-elev,length*1000)*180/Math.PI;
        if (Math.abs(slope)>maxSlopeDeg) continue;
        const slopeFactor=slope>=0 ? Math.exp(-0.065*slope) : Math.max(0.15,Math.min(1.125,1.125-0.035*(Math.abs(slope)-5)));
        const biomeFactor=BIOME_SPEED[world.biome[j]]??1;
        const eligibleRoad=infrastructure?.roadFor(curr.i,j,ctx);
        const road=eligibleRoad?.speedFactor>1?eligibleRoad:null;
        const hours=length/(baseKmH*slopeFactor*biomeFactor*(road?.speedFactor??1));
        relax(curr,j,hours,{kind:road?'road':'terrain',id:road?.id??null,
          distanceKm:length,hours,path:[{x,y},{x:nx,y:ny}]});
      }
      if (infrastructure) for (const {to,link} of infrastructure.crossingsFrom(curr.i,ctx)) {
        const tx=to%width,ty=Math.floor(to/width);
        if (!knows(tx,ty) || !terrainPassable(tx,ty,mode)) continue;
        const totalDist=link.path.slice(1).reduce((sum,p,k)=>sum+kmPerBlock*Math.hypot(p.x-link.path[k].x,p.y-link.path[k].y),0);
        const hours=link.travelHours??(totalDist/(baseKmH*link.speedFactor));
        relax(curr,to,hours,{kind:link.kind,id:link.id,distanceKm:totalDist,hours,
          path:link.path[0].x===x&&link.path[0].y===y?link.path:link.path.slice().reverse()});
      }
    }
    return {status:'unreachable',expanded};
  }
  return Object.freeze({width,height,kmPerBlock,sample,route});
}
