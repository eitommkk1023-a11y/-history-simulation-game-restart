import test from 'node:test';import assert from 'node:assert/strict';import * as rocks from '../src/rocks/catalog.mjs';
test('24 rocks have ranges, composition, formation and thermal/joint properties',()=>{
 assert.equal(rocks.ROCKS.length,24);assert.equal(new Set(rocks.ROCKS.map(r=>r.key)).size,24);
 for(const r of rocks.ROCKS){for(const k of ['densityKgM3','hardnessMohs','ucsMPa','tensileMPa','porosity','matrixPermeabilityM2']){assert.equal(r[k].length,2);assert.ok(r[k][0]>0&&r[k][1]>=r[k][0]);}assert.ok(r.erosionResistance>0);assert.ok(r.weatheringMPerYear>0);assert.ok(r.thermal.conductivityWmK>0&&r.thermal.heatCapacityJkgK>0);assert.ok(r.joints.frictionDegrees>0);assert.ok(r.formation.length);assert.ok(Object.keys(r.minerals).length);}
});
test('local fractures, weathering and moisture affect effective physics but do not rewrite the catalog',()=>{
 const before=JSON.stringify(rocks.ROCKS),fresh=rocks.effectiveRockProperties(0,{fracture:0,weathering:0,moisture:0,temperatureC:15}),damaged=rocks.effectiveRockProperties(0,{fracture:.9,weathering:.8,moisture:.8,temperatureC:15});assert.ok(damaged.ucsMPa<fresh.ucsMPa);assert.ok(damaged.permeabilityM2>fresh.permeabilityM2);assert.ok(damaged.weatheringMPerYear>fresh.weatheringMPerYear);assert.equal(JSON.stringify(rocks.ROCKS),before);
});
test('uniform experiment removes physical differences while resistance-only intervention changes no other effective field',()=>{
 const c={fracture:.3,weathering:.2,moisture:.4,temperatureC:12},a=rocks.effectiveRockProperties(0,c,{uniform:true}),b=rocks.effectiveRockProperties(12,c,{uniform:true});assert.deepEqual(a,b);
 const baseline=rocks.effectiveRockProperties(9,c),changed=rocks.effectiveRockProperties(9,c,{resistanceMultiplier:1.5,targetRockId:9});assert.equal(changed.erosionResistance,baseline.erosionResistance*1.5);delete changed.erosionResistance;const rest={...baseline};delete rest.erosionResistance;assert.deepEqual(changed,rest);
});
