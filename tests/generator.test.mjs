import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { generateRoom, createEmergencyRoom, createRoomProvider, createCampaignProvider } from '../src/generator.js';
import { ClearanceEngine, validateClearance, edgeDistance, entityShape } from '../src/clearance.js';
import { LEVELS } from '../src/levels.js';
import { simulateSolution } from '../src/physics.js';

test('clearance uses edge distances and complete swept motion envelopes',()=>{
 const engine=new ClearanceEngine();
 assert.equal(engine.add('spawn',[200,200]),true);
 assert.equal(engine.add('bumper',{x:300,y:200,radius:25}),false);
 assert.equal(engine.add('bumper',{x:400,y:200,radius:25}),true);
 const moving={a:[600,300],b:[650,300],delta:[100,0]};
 assert.equal(edgeDistance(entityShape('moving',moving),entityShape('wall',{a:[750,250],b:[750,350]})),0);
 const portal={x:900,y:300,radius:24,motion:{type:'orbital',amplitude:[40,40]}};
 assert.equal(edgeDistance(entityShape('portal',portal),entityShape('wall',{a:[940,0],b:[940,600]})),16);
});

test('expanded arena and procedural progression support level100',()=>{
 assert.equal(CONFIG.world.width,1600);assert.equal(CONFIG.world.height,900);
 const early=generateRoom(1,'progress'),late=generateRoom(100,'progress');
 assert.ok(late.walls.length>early.walls.length);assert.equal(late.par,5);assert.equal(late.difficulty,2.5);
 for(const [index,type] of [[31,'linear'],[51,'linear'],[71,'linear']]){
  const room=generateRoom(index,'movement');
  assert.equal(room.portals[0].A.motion.type,type);
  assert.equal(room.portals[0].A.motion.amplitude[0],0);
  assert.equal(simulateSolution(room).status,'won');
 }
});

test('one thousand seeded rooms have no clearance violations and executable solutions',()=>{
 let emergencies=0;
 for(let i=0;i<1000;i++){
  const index=1+i%100,seed='clearance-'+Math.floor(i/100);
  const room=generateRoom(index,seed);
  assert.equal(validateClearance(room).length,0,`clearance room ${index} seed ${seed}`);
  assert.equal(simulateSolution(room).status,'won',`solution room ${index} seed ${seed}`);
  assert.equal(room.solution.length,room.par);
  if(room.generation.emergency)emergencies++;
  if(i<100)assert.deepEqual(generateRoom(index,seed),room);
 }
 assert.equal(emergencies,0,'normal seeds never need simplified emergency rooms');
});

test('fallback is deterministic, solved and clear at every progression transition',()=>{
 for(const index of [1,14,15,24,25,30,31,49,50,51,70,71,75,100,100000]){
  const room=generateRoom(index,'forced',{maxAttempts:0});
  assert.equal(room.generation.fallback,true);
  assert.equal(simulateSolution(room).status,'won');
  assert.equal(validateClearance(room).length,0);
 }
});

test('last-resort direct corridor remains executable and clear for every level',()=>{
 for(let index=1;index<=100;index++){
  const room=createEmergencyRoom(index);
  assert.equal(simulateSolution(room).status,'won');
  assert.equal(validateClearance(room).length,0);
 }
});

test('campaign restores executable authored tutorials and curated milestones',()=>{
 const campaign=createCampaignProvider('campaign');
 for(const original of LEVELS){assert.equal(campaign(original.id),original);assert.equal(simulateSolution(original).status,'won');}
 for(const index of [25,50,75,100]){
  const a=campaign(index),b=createCampaignProvider('another-seed')(index);
  assert.equal(a.milestone,true);assert.deepEqual(a,b);assert.equal(simulateSolution(a).status,'won');
 }
});

test('bounded provider eviction and performance changes cannot alter seeded rooms',()=>{
 const provider=createRoomProvider('persistent',1);
 const room=provider(50);provider(51);assert.deepEqual(provider(50),room);
 assert.deepEqual(generateRoom(10,'persistent',{performanceRatio:.9}),generateRoom(10,'persistent',{performanceRatio:2}));
 for(const invalid of [0,-1,NaN,Infinity,1.5,'1'])assert.throws(()=>generateRoom(invalid,'bad'),RangeError);
});

