import test from 'node:test';import assert from 'node:assert/strict';
import {legPose} from '../src/player/leg-pose.mjs';
for(const [name,hip,stride,lift]of [['walk',.66,.23,.14],['run',.59,.35,.26]])test(name+' plants stance feet and lifts a bent knee during swing',()=>{
 let maxLift=0,maxKnee=0;
 for(let i=0;i<100;i++){const phase=i/100,p=legPose(phase,hip,stride,lift);const bottom=hip-.35*Math.cos(p.hip)-.35*Math.cos(p.hip+p.knee)-.035;
 assert.ok(Math.abs(bottom-p.lift)<1e-8);if(phase<.5)assert.ok(Math.abs(bottom)<1e-8);maxLift=Math.max(maxLift,bottom);maxKnee=Math.max(maxKnee,p.knee);}
 assert.ok(maxLift>lift*.95);assert.ok(maxKnee>1);
});
