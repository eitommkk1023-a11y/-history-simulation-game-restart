const tau=Math.PI*2;
const wrap=x=>((x%1)+1)%1;
const smooth=x=>x*x*(3-2*x);
export function humanGait(phase,mode){
 const run=mode==='run',crouch=mode==='crouch-walk';
 const duty=run?.38:crouch?.68:.60,span=run?.40:crouch?.18:.35;
 const feet=[0,.5].map(offset=>{
  const u=wrap(phase+offset),stance=u<duty,t=stance?u/duty:(u-duty)/(1-duty);
  return {stance,z:stance?span*(1-2*t):-span+2*span*smooth(t),
   lift:stance?0:(run?.29:crouch?.06:.09)*Math.pow(Math.sin(Math.PI*t),1.3),
   toe:stance?(t>.65?-.28*smooth((t-.65)/.35):.12*(1-smooth(Math.min(1,t/.2)))):0};
 });
 const support=feet.filter(f=>f.stance);
 const hip=crouch?.59:support.length?Math.min(...support.map(f=>Math.sqrt(.83*.83-f.z*f.z)))+.035:
   .89+.015*Math.sin(tau*wrap(phase)*2);
 return {feet,hip,cyclesPerMeter:duty/(2*span),flight:support.length===0};
}
export function solveHumanLeg(z,down){
 const radius=Math.min(.8399,Math.max(.01,Math.hypot(z,down))),knee=2*Math.acos(radius/.84);
 return {hip:Math.atan2(-z,down)-knee/2,knee};
}
