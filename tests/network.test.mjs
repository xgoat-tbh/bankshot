import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { encodeTelemetry,decodeTelemetry,isNewer,unwrapTime,GhostBuffer } from '../src/network/protocol.js';
import { createRaceServer,verifyReplay } from '../server/race-server.mjs';
import { generateRoom } from '../src/generator.js';
import { createWorld,launch,stepWorld } from '../src/physics.js';
import { CONFIG } from '../src/config.js';
import { resolveRelayUrl } from '../src/network/relay.js';

test('relay configuration uses local development, same-host production, or a deployment override', () => {
  assert.equal(resolveRelayUrl(new URL('http://127.0.0.1:4174')), 'ws://127.0.0.1:8787/relay');
  assert.equal(resolveRelayUrl(new URL('https://game.example')), 'wss://game.example/relay');
  assert.equal(resolveRelayUrl(new URL('https://game.example'), 'wss://relay.example/relay'), 'wss://relay.example/relay');
  assert.throws(() => resolveRelayUrl(new URL('https://game.example'), 'ws://relay.example/relay'), TypeError);
});

test('ten-byte telemetry roundtrips arena coordinates, wrapping sequences and clocks',()=>{
  const encoded=encodeTelemetry({sequence:4095,timestamp:65535,x:1540.25,y:830,level:100,status:'moving',shots:15,angle:Math.PI});
  assert.equal(encoded.byteLength,10);const frame=decodeTelemetry(encoded);
  assert.equal(frame.x,1540.5);assert.equal(frame.y,830);assert.equal(frame.level,100);assert.equal(frame.status,1);assert.equal(frame.shots,15);
  assert.ok(Math.abs(frame.angle-Math.PI)<.002);assert.ok(isNewer(0,4095));assert.ok(!isNewer(4095,0));assert.equal(unwrapTime(10,65540),65546);
  assert.throws(()=>decodeTelemetry(new ArrayBuffer(9)),RangeError);
});
test('Hermite ghost buffer rejects stale frames and never interpolates teleport jumps or level changes',()=>{
  const ghosts=new GhostBuffer(60);ghosts.push({sequence:0,timestamp:1000,x:0,y:0,level:1,angle:0},1000);ghosts.push({sequence:1,timestamp:1100,x:100,y:0,level:1,angle:0},1100);
  assert.ok(Math.abs(ghosts.sample(1110).x-50)<1e-6);
  ghosts.push({sequence:0,timestamp:1050,x:999,y:0,level:1,angle:0},1050);assert.equal(ghosts.frames.length,2);
  ghosts.push({sequence:2,timestamp:1200,x:800,y:0,level:1,angle:0},1200);assert.equal(ghosts.sample(1210).x,800);
});
function replay(room){
  const world=createWorld(room);const shots=[];let steps=0;
  for(const shot of room.solution){shots.push({step:steps,angle:shot.angleDeg*Math.PI/180,power:shot.power});assert.ok(launch(world,shots.at(-1).angle,shot.power));while(world.status==='moving'&&steps<72000){stepWorld(world);steps++;}if(world.status==='won')break;}
  assert.equal(world.status,'won');return {shots,steps};
}
test('server replay verification rejects forged and malformed completion inputs',()=>{
  const room=generateRoom(1,'network-proof'),valid=replay(room);
  assert.equal(verifyReplay(room,valid.shots).world.status,'won');
  assert.equal(verifyReplay(room,[]),null);assert.equal(verifyReplay(room,[{step:-1,angle:0,power:1}]),null);assert.equal(verifyReplay(room,[{step:0,angle:0,power:NaN}]),null);
  assert.equal(verifyReplay(room,[{step:0,angle:Math.PI,power:.01}]),null);
});
async function socketClient(url){
  const socket=new WebSocket(url);const inbox=[];socket.on('message',(data,binary)=>{inbox.push(binary?data:JSON.parse(data.toString()));});
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  return {socket,inbox,clear:()=>{inbox.length=0;},send:message=>socket.send(JSON.stringify(message)),async wait(predicate){for(let i=0;i<500;i++){const index=inbox.findIndex(predicate);if(index>=0)return inbox.splice(index,1)[0];await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Timed out waiting for race message');}};
}
test('eight racers synchronize, reject cheats, relay at 150ms latency, finish 100 rooms, and rematch', {timeout:300000},async()=>{
  let clock=1_000_000;const server=createRaceServer({port:0,now:()=>clock,countdownMs:30,finishMs:60});const address=await server.listen();const clients=[];
  try{
    const profileId = index => String(index + 1).padStart(64, '0');
    const url=`ws://127.0.0.1:${address.port}/relay`;clients.push(await socketClient(url));clients[0].send({type:'create',name:'Racer 1',profileId:profileId(0)});
    const joined=await clients[0].wait(m=>m.type==='joined');const code=joined.code;const tokens=[joined.token];
    const duplicate = await socketClient(url);
    duplicate.send({ type: 'join', code, profileId: profileId(0) });
    assert.match((await duplicate.wait(message => message.type === 'error')).message, /already joined/);
    duplicate.socket.close();
    for(let i=1;i<8;i++){const client=await socketClient(url);clients.push(client);client.send({type:'join',code,name:`Racer ${i+1}`,profileId:profileId(i)});tokens.push((await client.wait(m=>m.type==='joined')).token);}
    const extra=await socketClient(url);extra.send({type:'join',code});assert.match((await extra.wait(m=>m.type==='error')).message,/full/);extra.socket.close();
    for(const c of clients)c.send({type:'ready',ready:true});
    const countdown=await clients[0].wait(m=>m.type==='room'&&m.state==='COUNTDOWN');assert.equal(countdown.players.length,8);
    clock+=31;const room=await clients[0].wait(m=>m.type==='room'&&m.state==='RACING');assert.match(room.seed,/^[\da-f-]{36}$/);
    clients[0].send({type:'complete',level:1,shots:[]});assert.match((await clients[0].wait(m=>m.type==='error')).message,/Replay rejected/);
    await new Promise(resolve=>setTimeout(resolve,150));clients[0].socket.send(encodeTelemetry({sequence:1,timestamp:clock%65536,x:200,y:300,level:1,status:0,shots:0,angle:0}));
    const packet=await clients[1].wait(m=>Buffer.isBuffer(m));assert.equal(packet.length,11);assert.equal(packet[0],1);assert.equal(decodeTelemetry(packet.subarray(1)).x,200);
    for(let level=1;level<=100;level++){
      const proof=replay(generateRoom(level,room.seed));clock+=Math.ceil(proof.steps*CONFIG.physics.step*1000)+250;
      await Promise.all(clients.map(async client=>{await new Promise(resolve=>setTimeout(resolve,150));client.send({type:'complete',level,shots:proof.shots});}));
      await Promise.all(clients.map(client=>client.wait(m=>m.type==='accepted'&&m.level===level)));
    }
    const results=await clients[0].wait(m=>m.type==='room'&&m.state==='PODIUM_RESULTS');assert.equal(results.results.length,8);assert.equal(results.players.every(p=>p.level===101),true);assert.ok(results.results.every(p=>p.splits[25]&&p.splits[50]&&p.splits[75]&&p.splits[100]));assert.equal(results.results.reduce((n,p)=>n+p.deltaMMR,0),0);
    const winner = results.results[0];
    const profileResponse = await fetch(`http://127.0.0.1:${address.port}/profile/${profileId(winner.id - 1)}`);
    assert.equal(profileResponse.status, 200);
    const profile = await profileResponse.json();
    assert.equal(profile.online.wins, 1);
    assert.equal(profile.online.elo, winner.mmr);
    assert.ok(winner.highlights.some(replay => replay.level === 100 && replay.shots.length));
    clients[0].clear();clients[0].send({type:'ready',ready:true});const rematch=await clients[0].wait(m=>m.type==='room'&&m.state==='LOBBY_WAITING');assert.notEqual(rematch.seed,room.seed);assert.ok(rematch.players.every(p=>p.level===1));
    clients[7].socket.close();await clients[0].wait(m=>m.type==='room'&&m.players.some(p=>p.id===8&&!p.connected));
    const resumed=await socketClient(url);clients.push(resumed);resumed.send({type:'resume',code,token:tokens[7]});assert.equal((await resumed.wait(m=>m.type==='joined')).id,8);
  } finally {for(const client of clients)client.socket.close();await server.close();}
});
