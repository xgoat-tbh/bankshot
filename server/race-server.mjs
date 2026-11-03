import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createReadStream, existsSync } from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import { generateRoom } from '../src/generator.js';
import { createWorld, stepWorld, launch } from '../src/physics.js';
import { CONFIG } from '../src/config.js';
import { decodeTelemetry } from '../src/network/protocol.js';
import { createProfileStore } from './profile-store.mjs';

const PROFILE_ID = /^[0-9a-f]{64}$/i;
const MAX_PROFILE_BYTES = 256 * 1024;
const defaultIndexFile = new URL('../dist/index.html', import.meta.url);

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

async function profileRequest(req, res, path, profiles) {
  const headers = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...headers, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' });
    res.end();
    return;
  }
  try {
    if (req.method === 'GET' && path.startsWith('/profile/')) {
      const id = path.slice('/profile/'.length);
      if (!PROFILE_ID.test(id)) return sendJson(res, 400, { error: 'Invalid profile ID' }, headers);
      const profile = profiles.get(id.toLowerCase());
      return sendJson(res, profile ? 200 : 404, profile ?? { error: 'Profile not found' }, headers);
    }
    if (req.method === 'POST' && path === '/profile') {
      if (Number(req.headers['content-length']) > MAX_PROFILE_BYTES) {
        req.resume();
        return sendJson(res, 413, { error: 'Profile is too large' }, headers);
      }
      let size = 0;
      const chunks = [];
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > MAX_PROFILE_BYTES) {
          req.resume();
          return sendJson(res, 413, { error: 'Profile is too large' }, headers);
        }
        chunks.push(chunk);
      }
      let update;
      try { update = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return sendJson(res, 400, { error: 'Invalid JSON' }, headers); }
      return sendJson(res, 200, profiles.sync(update), headers);
    }
    return sendJson(res, 405, { error: 'Unsupported profile operation' }, headers);
  } catch (error) {
    if (res.destroyed || res.headersSent) return;
    return sendJson(res, error.statusCode ?? 500, { error: error.statusCode ? error.message : 'Profile service unavailable' }, headers);
  }
}

export function verifyReplay(level, shots, maxSteps = 72000) {
  if (!Array.isArray(shots) || !shots.length || shots.length > 20) return null;
  const world = createWorld(level); let step = 0;
  for (const shot of shots) {
    if (!Number.isSafeInteger(shot.step) || shot.step < step || shot.step > maxSteps || !Number.isFinite(shot.angle) || !Number.isFinite(shot.power) || shot.power <= 0 || shot.power > 1) return null;
    while (step < shot.step) { stepWorld(world); step++; if (world.status === 'won') return null; }
    if (!launch(world,shot.angle,shot.power)) return null;
  }
  while (world.status === 'moving' && step < maxSteps) { stepWorld(world); step++; }
  return world.status === 'won' ? { world, steps: step } : null;
}

export function createRaceServer({ port = 8787, host = '127.0.0.1', now = Date.now, countdownMs = 3000, finishMs = 60000, graceMs = 30000, profileFile, indexFile = defaultIndexFile } = {}) {
  const profiles = createProfileStore({ filePath: profileFile });
  const http = createServer((req, res) => {
    const path = req.url.split('?')[0];
    if (path === '/profile' || path.startsWith('/profile/')) return void profileRequest(req, res, path, profiles);
    if (path === '/health') return sendJson(res, 200, { service: 'Bankshot race', rooms: rooms.size });
    if ((path === '/' || path === '/index.html') && ['GET', 'HEAD'].includes(req.method) && existsSync(indexFile)) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      if (req.method === 'HEAD') return res.end();
      const stream = createReadStream(indexFile);
      stream.on('error', () => res.destroy());
      return stream.pipe(res);
    }
    return sendJson(res, 404, { error: 'Not found' });
  });
  const wss = new WebSocketServer({ server: http, maxPayload: 32768 });
  const rooms = new Map();
  const send = (socket,message) => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); };
  function snapshot(room) {
    return { type:'room', code:room.code, seed:room.seed, state:room.state, startAt:room.startAt, deadline:room.deadline, serverTime:now(), players:[...room.players.values()].map(({id,name,ready,level,finishedAt,splits,socket,forfeited}) => ({id,name,ready,level,finishedAt,splits,forfeited:Boolean(forfeited),connected:socket?.readyState === WebSocket.OPEN})), results:room.results ?? null };
  }
  const broadcast = room => { const data = snapshot(room); for (const player of room.players.values()) send(player.socket,data); };
  function podium(room) {
    room.state = 'PODIUM_RESULTS';
    const standings = [...room.players.values()].sort((a,b) => (b.level-a.level) || ((a.finishedAt ?? Infinity)-(b.finishedAt ?? Infinity)));
    const winner = standings.find(player => player.finishedAt !== null);
    const placements = standings.flatMap(player => player.profileId ? [player.profileId] : []);
    const oldRatings = new Map(placements.map(id => [id, profiles.get(id)?.online.elo ?? 1000]));
    let updated = [];
    if (winner?.profileId && placements.length >= 2) {
      try { updated = profiles.recordRace({ raceId: room.raceId, winnerId: winner.profileId, participantIds: placements, placements }); }
      catch (error) { console.error('Unable to record race result:', error.message); }
    }
    room.results = standings.map((p, index) => {
      const mmr = updated.find(profile => profile.id === p.profileId)?.online.elo ?? oldRatings.get(p.profileId) ?? 1000;
      return { id: p.id, name: p.name, place: index + 1, level: Math.min(100,p.level), time: p.finishedAt ? p.finishedAt - room.startAt : null,
        deltaMMR: mmr - (oldRatings.get(p.profileId) ?? 1000), mmr, splits: p.splits, highlights: p.highlights ?? [] };
    });
    broadcast(room);
  }
  function reset(room) { room.seed=randomUUID();room.maps=new Map();room.state='LOBBY_WAITING';room.startAt=null;room.deadline=null;room.results=null;for(const [id,p] of room.players){if(p.forfeited){room.players.delete(id);continue;}p.ready=false;p.level=1;p.splits={};p.highlights=[];p.finishedAt=null;p.levelStart=null;} }
  wss.on('connection',socket => {
    let room,player;let messages=0,windowAt=now();
    socket.on('message',(data,binary) => {
      if (now()-windowAt > 1000) { windowAt=now();messages=0; }
      if (++messages > 80) { socket.close(1008,'Rate limit');return; }
      try {
        if (binary) {
          if (!room || !player || room.state !== 'RACING') return;
          const frame=decodeTelemetry(data);
          if(frame.level!==player.level || frame.x>CONFIG.world.width || frame.y>CONFIG.world.height) return;
          const packet=Buffer.alloc(11);packet[0]=player.id;Buffer.from(data).copy(packet,1);
          for(const other of room.players.values()) if(other!==player && other.socket?.readyState===WebSocket.OPEN) other.socket.send(packet);
          return;
        }
        const message=JSON.parse(data.toString());
        if(message.type==='ping') { send(socket,{type:'pong',sent:message.sent,serverReceived:now(),serverSent:now()});return; }
        if(message.type==='create'||message.type==='join'||message.type==='resume') {
          if (player) throw Error('Already joined');
          if(message.type==='create') { const code=randomBytes(3).toString('hex').toUpperCase();room={code,seed:randomUUID(),maps:new Map(),state:'LOBBY_WAITING',players:new Map(),startAt:null,deadline:null};rooms.set(code,room); }
          else { room=rooms.get(String(message.code).toUpperCase());if(!room) throw Error('Room not found'); }
          if(message.type==='resume') {
            const member = [...room.players.values()].find(p=>p.token===message.token);
            if(!member || member.forfeited || member.socket?.readyState===WebSocket.OPEN) throw Error('Session unavailable');
            player = member;
          } else {
            if(room.state!=='LOBBY_WAITING'||room.players.size>=8) throw Error('Room is full or racing');
            const profileId = PROFILE_ID.test(message.profileId ?? '') ? message.profileId.toLowerCase() : null;
            if(profileId && [...room.players.values()].some(p=>p.profileId===profileId)) throw Error('This agent has already joined the room');
            const id=Array.from({length:8},(_,i)=>i+1).find(id=>!room.players.has(id));
            player={id,token:randomUUID(),profileId,name:String(message.name||`Racer ${id}`).slice(0,24),ready:false,level:1,splits:{},finishedAt:null};
            room.players.set(id,player);
          }
          player.socket=socket;player.disconnectedAt=null;send(socket,{type:'joined',id:player.id,token:player.token,code:room.code});broadcast(room);return;
        }
        if(!room||!player) throw Error('Join a room first');
        if(message.type==='signal') { const other=room.players.get(message.to);if(other && typeof message.signal==='object') send(other.socket,{type:'signal',from:player.id,signal:message.signal});return; }
        if(message.type==='ready') {
          if(room.state==='PODIUM_RESULTS') reset(room);
          if(room.state!=='LOBBY_WAITING') return;
          player.ready=message.ready!==false;
          if(room.players.size>=2 && [...room.players.values()].every(p=>p.ready && p.socket?.readyState===WebSocket.OPEN)) {room.state='COUNTDOWN';room.raceId=randomUUID();room.startAt=now()+countdownMs;for(const p of room.players.values())p.levelStart=room.startAt;}
          broadcast(room);return;
        }
        if(message.type==='complete') {
          if(room.state!=='RACING'||message.level!==player.level||player.finishedAt) throw Error('Unexpected completion');
          const elapsedSteps=Math.max(0,Math.min(72000,Math.ceil((now()-player.levelStart+200)/(CONFIG.physics.step*1000))));
          let map=room.maps.get(player.level);if(!map){map=generateRoom(player.level,room.seed);room.maps.set(player.level,map);}
          const signature=JSON.stringify(message.shots);
          room.proofs??=new Map();
          const proofKey=`${room.seed}:${player.level}:${signature}`;
          let verified=room.proofs.get(proofKey);
          if(verified&&verified.steps>elapsedSteps)verified=null;
          if(!verified){verified=verifyReplay(map,message.shots,elapsedSteps);if(verified){room.proofs.set(proofKey,verified);if(room.proofs.size>128)room.proofs.delete(room.proofs.keys().next().value);}}
          if(!verified || verified.steps*CONFIG.physics.step*1000 > now()-player.levelStart+200) throw Error('Replay rejected');
          player.splits[player.level]=now()-room.startAt;
          if([25,50,75,100].includes(player.level)){player.highlights??=[];player.highlights.push({level:player.level,shots:message.shots,steps:verified.steps,impacts:verified.world.impacts,teleports:verified.world.teleports});}
          player.level++;
          player.levelStart=now();
          if(player.level===101){player.finishedAt=now();room.deadline??=now()+finishMs;}
          send(socket,{type:'accepted',level:message.level});
          if([...room.players.values()].every(p=>p.finishedAt || p.forfeited))podium(room);else broadcast(room);
        }
      } catch(error) { send(socket,{type:'error',message:error.message}); }
    });
    socket.on('close',()=>{ if(!player||!room)return;player.socket=null;player.disconnectedAt=now();if(room.state==='COUNTDOWN'){room.state='LOBBY_WAITING';room.startAt=null;for(const p of room.players.values())p.ready=false;}broadcast(room); });
  });
  const timer=setInterval(()=>{
    for(const [code,room] of rooms){
      if(room.state==='COUNTDOWN'&&now()>=room.startAt){room.state='RACING';broadcast(room);}
      if(room.state==='RACING'&&room.deadline&&now()>=room.deadline)podium(room);
      for(const [id,p]of room.players)if(p.disconnectedAt !== null && now()-p.disconnectedAt>graceMs && !p.forfeited){
        if(room.state==='RACING')p.forfeited=true;
        else room.players.delete(id);
        broadcast(room);
      }
      if(room.state==='RACING' && [...room.players.values()].every(p=>p.finishedAt || p.forfeited) && [...room.players.values()].some(p=>p.finishedAt))podium(room);
      if(!room.players.size || [...room.players.values()].every(p=>p.forfeited))rooms.delete(code);
    }
  },50);timer.unref();
  return {rooms,http,wss,profiles,listen:()=>new Promise(resolve=>http.listen(port,host,()=>resolve(http.address()))),close:()=>new Promise(resolve=>{clearInterval(timer);for(const socket of wss.clients)socket.terminate();wss.close(()=>http.close(()=>{profiles.close();resolve();}));})};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){const server=createRaceServer({port:Number(process.env.PORT)||8787,host:process.env.HOST||'0.0.0.0',profileFile:process.env.BANKSHOT_PROFILE_FILE || 'data/profiles.json'});const address=await server.listen();console.log(`Bankshot race server listening on ${address.address}:${address.port}`);}
