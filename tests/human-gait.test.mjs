import test from 'node:test';import assert from 'node:assert/strict';import {humanGait,solveHumanLeg} from '../src/player/human-gait.mjs';
test('walk has continuous support, run has a flight phase and higher pelvis',()=>{
 let flight=0,minHip=2,maxKnee=0;
 for(let i=0;i<200;i++){
 const walk=humanGait(i/200,'walk'),run=humanGait(i/200,'run');assert.ok(walk.feet.some(f=>f.stance));
 flight+=Number(run.flight);minHip=Math.min(minHip,run.hip);
 for(const f of run.feet){const p=solveHumanLeg(f.z,run.hip-.035-f.lift);maxKnee=Math.max(maxKnee,p.knee);if(f.stance)assert.ok(Math.abs(run.hip-.035-.42*Math.cos(p.hip)-.42*Math.cos(p.hip+p.knee))<1e-8);}
 }
 assert.ok(flight>20);assert.ok(minHip>.75);assert.ok(maxKnee>1);
});
test('planted foot retreats at the same rate as forward travel',()=>{
 for(const mode of ['walk','run']){const a=humanGait(.1,mode),distance=.01,b=humanGait(.1+distance*a.cyclesPerMeter,mode);assert.ok(Math.abs(b.feet[0].z-a.feet[0].z+distance)<1e-9);}
});
