/**
 * Bellona (1760) interior: walking on the Codex study's floors, stairs and obstacles (assets/bellona/bellona-layout.json).
 * The navigation code (floors with sampled width/height, stair ramps, obstacle boxes, ceilings) is ported from the study's viewer
 * (createShipNavigation) without behaviour changes; the wrapper below gives it the interior interface the ship glue expects.
 * Frames: hull x = forward from the stern, y = starboard, h = height above the waterline (model Y). Model Z = sternZ - x (bow is -Z).
 * Level D: the layout is a provisional fit-out; compartment assignments are unverified.
 */
import { BELLONA_MEASURED as M, BELLONA_LAYOUT as LAYOUT } from './bellona-data.mjs';

function createBellonaNavigation(layout){
 const radius=.23,eps=.025;
 const grid=new Map(),cellSize=3;
 for(const b of layout.obstacles||[]){
  for(let x=Math.floor((b.x-b.w/2-radius)/cellSize);x<=Math.floor((b.x+b.w/2+radius)/cellSize);x++)for(let z=Math.floor((b.z-b.d/2-radius)/cellSize);z<=Math.floor((b.z+b.d/2+radius)/cellSize);z++){const k=x+','+z;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(b);}
 }
 const near=(x,z)=>grid.get(Math.floor(x/cellSize)+','+Math.floor(z/cellSize))||[];
 function floorAt(f,x,z){
  const a=f.samples;if(z<a[0][0]||z>a[a.length-1][0])return null;
  let low=0,high=a.length-1;while(high-low>1){const m=(low+high)>>1;if(a[m][0]<z)low=m;else high=m;}const p=a[low],q=a[high];
  const t=(z-p[0])/(q[0]-p[0]),w=p[1]+(q[1]-p[1])*t,y=p[2]+(q[2]-p[2])*t;
  if(Math.abs(x)>w-radius)return null;
  if((f.holes||[]).some(h=>Math.abs(x-h.x)<h.w/2&&Math.abs(z-h.z)<h.d/2))return null;
  return {y:y+(f.camber||0)*(1-Math.abs(x)/w),id:f.id};
 }
 function surfaces(x,z){
  const a=[];for(const f of layout.floors){const s=floorAt(f,x,z);if(s)a.push(s);}
  for(const r of layout.ramps){const t=(z-r.z0)/(r.z1-r.z0);if(t>=0&&t<=1&&Math.abs(x-r.x)<=r.w/2-radius+.02)a.push({y:r.y0+(r.y1-r.y0)*Math.min(1,Math.ceil(t*(r.steps||12))/(r.steps||12)),id:r.id||'stairs'});}
  return a;
 }
 function ceiling(p){let c=Infinity;for(const s of surfaces(p.x,p.z))if(s.y>p.y+.22)c=Math.min(c,s.y-.10);for(const b of near(p.x,p.z)){const bottom=b.y-b.h/2;if(bottom>p.y+.4&&Math.abs(p.x-b.x)<b.w/2+radius&&Math.abs(p.z-b.z)<b.d/2+radius)c=Math.min(c,bottom);}return c;}
 function blocked(p,h){return near(p.x,p.z).some(b=>{
  if(p.y+h<=b.y-b.h/2+eps||p.y>=b.y+b.h/2-.04)return false;
  const dx=Math.max(0,Math.abs(p.x-b.x)-b.w/2),dz=Math.max(0,Math.abs(p.z-b.z)-b.d/2);
  return dx*dx+dz*dz<radius*radius;
 });}
 function support(x,z,y){return surfaces(x,z).filter(s=>s.y-y<=.28&&s.y-y>=-.40).sort((a,b)=>b.y-a.y)[0]||null;}
 function candidate(p,dx,dz,h){const x=p.x+dx,z=p.z+dz,s=support(x,z,p.y);if(!s)return null;const q={x,y:s.y,z,surface:s.id};return blocked(q,h)||ceiling(q)<q.y+h-.02?null:q;}
 function move(pos,dx,dz,height=1.7){
  if(![pos.x,pos.y,pos.z,dx,dz,height].every(Number.isFinite))return {...pos,blocked:true};
  const n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.065));dx/=n;dz/=n;let p={...pos},hit=false;
  for(let i=0;i<n;i++){let q=candidate(p,dx,dz,height);if(!q){hit=true;const alternatives=[candidate(p,dx,0,height),candidate(p,0,dz,height)];
    const probe={x:p.x+dx,y:p.y,z:p.z+dz};
    for(const b of near(probe.x,probe.z)){
     if(p.y+height<=b.y-b.h/2+eps||p.y>=b.y+b.h/2-.04)continue;
     const cx=Math.max(b.x-b.w/2,Math.min(b.x+b.w/2,probe.x)),cz=Math.max(b.z-b.d/2,Math.min(b.z+b.d/2,probe.z));
     let nx=probe.x-cx,nz=probe.z-cz;const length=Math.hypot(nx,nz);if(length<1e-8||length>=radius)continue;
     nx/=length;nz/=length;const inward=dx*nx+dz*nz;if(inward<0)alternatives.push(candidate(p,dx-nx*inward,dz-nz*inward,height));
    }
    q=alternatives.filter(Boolean).sort((a,b)=>((b.x-p.x)*dx+(b.z-p.z)*dz)-((a.x-p.x)*dx+(a.z-p.z)*dz))[0]||null;}if(q)p=q;else break;}
  return {...p,blocked:hit};
 }
 return {surfaces,floorAt,support,blocked,ceiling,move,radius};
}

const DECK_NAME = { hold: '船倉', orlop: '最下甲板', lower: '下砲列甲板', upper: '上砲列甲板', quarter: '後甲板', fore: '前甲板', poop: '船尾楼甲板', head: '船首楼' };
const WEATHER = new Set(['poop', 'head']); // open to the sky everywhere (the others are open only where nothing lies above)

export function createBellonaInterior({ layout = LAYOUT, sternZ = M.sternZ, keelOffset = M.draftM } = {}) {
  const nav = createBellonaNavigation(layout), floorIds = new Set(layout.floors.map((f) => f.id));
  const decks = layout.floors.map((f) => ({ id: f.id, z: f.baseLevel + keelOffset, name: DECK_NAME[f.id] ?? f.id, exterior: WEATHER.has(f.id) }));
  const toNav = (p) => ({ x: p.y, y: p.h, z: sternZ - p.x }), fromNav = (n, deck) => ({ x: sternZ - n.z, y: n.x, h: n.y, deck: floorIds.has(n.surface) ? n.surface : deck });
  const rooms = layout.rooms.map((r) => ({ id: r.id, name: r.name, deck: r.floor, use: r.kind, x0: sternZ - r.z1, x1: sternZ - r.z0, y0: r.x0, y1: r.x1 }));
  /** Closest standable spot to (x, y) on a deck, searched in rings (used for crew stations and the start position). */
  function snap(deck, x, y) {
    const f = layout.floors.find((q) => q.id === deck), h = f.baseLevel + 0.02;
    for (let r = 0; r <= 4; r += 0.25) for (let a = 0; a < (r ? 16 : 1); a++) {
      const px = x + Math.cos(a * Math.PI / 8) * r, py = y + Math.sin(a * Math.PI / 8) * r, s = nav.support(py, sternZ - px, h);
      if (s && Math.abs(s.y - f.baseLevel) < 0.4 && !nav.blocked({ x: py, y: s.y, z: sternZ - px }, 1.7)) return { x: px, y: py, h: s.y, deck };
    }
    return { x, y, h: f.baseLevel, deck };
  }
  const startPosition = () => snap('upper', M.LOA / 2, 0);
  return {
    layout, decks, rooms, doors: [], ladders: [], walls: [], keelOffset, sternZ, nav, floorIds,
    startPosition, snap,
    /** Move by (forward, starboard) metres; follows floors and stairs. Returns the new position (with blocked flag). */
    move(pos, df, ds) { const r = nav.move(toNav(pos), ds, -df, 1.7); return { ...fromNav(r, pos.deck), blocked: r.blocked }; },
    laddersNear: () => [], climb() { throw new RangeError('Bellona has stairs, not ladders: walk up them'); },
    walkable: (deck, x, y) => !!nav.support(y, sternZ - x, (layout.floors.find((q) => q.id === deck)?.baseLevel ?? 0) + 0.02),
    deckZ: (id) => (layout.floors.find((f) => f.id === id)?.baseLevel ?? 0) + keelOffset,
    heightAt: (pos) => pos.h + keelOffset,
    ceilingAt: (pos) => nav.ceiling(toNav(pos)),
    /** Height of the lowest deck floor above a position (Infinity when open to the sky): used to place the cutaway plane. */
    deckAbove(pos) { const n = toNav(pos); let c = Infinity; for (const f of layout.floors) { const q = nav.floorAt(f, n.x, n.z); if (q && q.y > pos.h + 1.2) c = Math.min(c, q.y); } return c; },
    roomOf(deck, x, y) { const n = toNav({ x, y, h: 0 }); return layout.rooms.find((r) => r.floor === deck && n.x >= r.x0 && n.x <= r.x1 && n.z >= r.z0 && n.z <= r.z1) ? rooms.find((q) => q.deck === deck && x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1) ?? null : null; },
    floorRects: () => [], wallRects: () => [],
  };
}
