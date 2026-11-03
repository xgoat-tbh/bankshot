import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld, launch, samplePortal } from '../src/physics.js';
import { CONFIG } from '../src/config.js';
const fixture = extras => ({puck:[400,400],walls:[],goal:[],hazards:[],...extras});
test('portal motion remains vertical even for legacy patterns, with analytic derivatives',()=>{
 for(const type of ['linear','orbital','lissajous']) {
  const portal={x:400,y:400,motion:{type,amplitude:[40,30],frequency:2,ratio:3}};
  const t=.6,h=1e-7,a=samplePortal(portal,t),b=samplePortal(portal,t+h);
  assert.equal(a.x,400);assert.equal(a.vx,0);assert.notEqual(a.y,400);
  assert.ok(Math.abs((b.x-a.x)/h-a.vx)<.01);
  assert.ok(Math.abs((b.y-a.y)/h-a.vy)<.01);
 }
});
test('moving portal can collect a resting puck without consuming a shot',()=>{
 const world=createWorld(fixture({portals:[{A:{x:400,y:340,nx:0,ny:1,radius:20,motion:{type:'linear',amplitude:[0,80],frequency:.5}},B:{x:900,y:400,nx:1,ny:0,radius:20}}]}));
 for(let i=0;i<100&&!world.teleports;i++)stepWorld(world);
 assert.equal(world.teleports,1);assert.equal(world.shots,0);assert.ok(world.x>900);
});
test('moving portal exit inherits motion while remaining speed limited',()=>{
 const world=createWorld(fixture({puck:[300,400],portals:[{A:{x:350,y:400,nx:-1,ny:0,radius:20},B:{x:900,y:400,nx:1,ny:0,radius:20,motion:{type:'linear',amplitude:[0,80],frequency:2}}}]}));
 launch(world,0,.4);for(let i=0;i<30&&!world.teleports;i++)stepWorld(world);
 assert.equal(world.teleports,1);assert.ok(world.vy>100);assert.ok(Math.hypot(world.vx,world.vy)<=CONFIG.physics.maxSpeed);
});
test('puck rim contact with a swept narrow hazard fails without a center crossing',()=>{
 const world=createWorld(fixture({puck:[100,100],hazards:[[[120,110],[125,110],[125,130],[120,130]]]}));
 launch(world,0,1);for(let i=0;i<5;i++)stepWorld(world);
 assert.equal(world.failures,1);assert.equal(world.lastOutcome,'hazard');
});
test('simultaneous corner faces reflect once without repeated energy collapse',()=>{
 const world=createWorld(fixture({puck:[105,405],walls:[{a:[120,0],b:[120,800],mat:'solid'},{a:[0,420],b:[1200,420],mat:'solid'}]}));
 launch(world,Math.PI/4,1);stepWorld(world);
 assert.equal(world.impacts,2);assert.ok(world.vx<0&&world.vy<0);
 assert.ok(Math.hypot(world.vx,world.vy)>1400);
});
test('projection solver repairs overlapping wall contacts without NaN or tunneling',()=>{
 const world=createWorld(fixture({puck:[495,400],walls:[{a:[500,100],b:[500,700],mat:'solid'}]}));
 launch(world,Math.PI,.1);stepWorld(world);
 assert.ok(world.x<=486);assert.ok(Number.isFinite(world.y));
});
