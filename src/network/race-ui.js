import { CONFIG } from '../config.js';
import { generateRoom } from '../generator.js';
import { createWorld, launch, stepWorld } from '../physics.js';
import { Renderer } from '../render.js';
import { Input } from '../input.js';
import { RaceClient, resolveRelayUrl } from './client.js';
import { encodeTelemetry } from './protocol.js';
import './race.css';

const colors=['#00E5FF','#FF6B3D','#D500F9','#FFD700','#3B82F6','#4DD0A0','#E9E6DF','#FF80AB'];
const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function raceButton(label, action, variant = '', value = '') {
  return `<button type="button" class="button ${variant}" data-race-${action}="${escape(value)}"><span class="button-surface" aria-hidden="true"><span class="button-sweep"></span></span><span class="button-label">${label}</span><span class="button-line" aria-hidden="true"></span></button>`;
}

export function mountRace(root,{onExit=()=>{}, profile=null}={}) {
  const previousFocus = document.activeElement;
  const overlay=document.createElement('section');overlay.className='race-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Race to level 100');
  overlay.innerHTML = `
    <header class="race-header">
      <div><p class="eyebrow mono">BANKSHOT / ONLINE</p><h2>RACE TO 100</h2></div>
      <div class="race-header-status"><span class="race-status-pill" data-race-status>ONLINE</span><span data-race-clock></span></div>
      ${raceButton('LEAVE RACE', 'exit')}
    </header>
    <div class="race-connect">
      <p class="eyebrow mono">COMPETITIVE PLAY / 2–8 RACERS</p>
      <h3>Find your room.</h3>
      <p>Race through the same 100 rooms. Create a lobby or enter a friend's room code.</p>
      <div class="race-fields">
        <label>YOUR NAME<input data-race-name aria-label="Racer name" maxlength="24" value="Racer"></label>
        <label>ROOM CODE<input data-race-code aria-label="Room code" maxlength="6" placeholder="6-CHARACTER CODE" autocomplete="off" spellcheck="false"></label>
      </div>
      <div class="race-actions">${raceButton('CREATE ROOM', 'create', 'primary')}${raceButton('JOIN ROOM', 'join')}</div>
      <div class="race-lobby" data-race-lobby hidden>
        <p class="eyebrow mono">ROOM CODE <strong class="race-room-code" data-race-room></strong></p>
        <ul class="race-players" data-race-players></ul>
        ${raceButton('READY', 'ready', 'primary')}
      </div>
    </div>
    <p class="race-notice" data-race-notice role="status" aria-live="polite" hidden></p>
    <div data-race-progress class="race-progress" hidden><div class="race-progress-track" data-race-track></div></div>
    <div class="race-hud" data-race-hud hidden></div>
    <div class="race-play" hidden>
      <canvas class="race-canvas" tabindex="0" aria-label="Race playfield: drag puck or hold and release Space. R restarts this room."></canvas>
      <div class="race-countdown" data-race-countdown></div>
    </div>
    <section class="race-results" hidden>
      <h2>PODIUM</h2><div data-race-results></div>
      <div data-race-replay-panel hidden><p data-race-replay-label></p><canvas class="race-replay-canvas" aria-label="Verified race replay"></canvas></div>
      ${raceButton('REMATCH / READY', 'rematch', 'primary')}
    </section>`;
  root.append(overlay);
  const q=selector=>overlay.querySelector(selector), abort=new AbortController();let client=null,room=null,world=null,renderer=null,input=null,frame=0,last=0,accumulator=0,level=0,steps=0,shots=[],submitted=false,sequence=0,lastPacket=0,disposed=false;
  const settings={reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,aimPreview:true};
  let replay = null, reconnecting = false;
  profile?.ready?.then(() => {
    if (!disposed && q('[data-race-name]').value === 'Racer' && profile.snapshot?.callsign) q('[data-race-name]').value = profile.snapshot.callsign;
  }).catch(() => {});
  function notice(text) {
    const element = q('[data-race-notice]');
    element.textContent = text;
    element.hidden = !text;
  }
  function status(text) { q('[data-race-status]').textContent = text; }
  function renderResults() {
    const rows = room.results.map(result => {
      const time = result.time === null ? 'DNF' : `${(result.time / 1000).toFixed(2)}s`;
      const delta = `${result.deltaMMR >= 0 ? '+' : ''}${result.deltaMMR}`;
      return `<tr><td>${result.place}</td><td>${escape(result.name)}</td><td>${result.level}</td><td>${time}</td><td>${result.mmr} (${delta})</td></tr>`;
    }).join('');
    const splits = room.results.map(result => {
      const labels = [25, 50, 75, 100].map(level => `${level} · ${result.splits[level] === undefined ? '—' : `${(result.splits[level] / 1000).toFixed(2)}s`}`);
      return `<p>${escape(result.name)} ${labels.join(' / ')}</p>`;
    }).join('');
    const highlights = room.results[0]?.highlights ?? [];
    q('[data-race-results]').innerHTML = `<table><thead><tr><th>PLACE</th><th>RACER</th><th>LEVEL</th><th>TIME</th><th>RACE ELO</th></tr></thead><tbody>${rows}</tbody></table>
      <details><summary>MILESTONE SPLITS</summary>${splits}</details>
      ${highlights.length ? `<details><summary>WINNER REPLAYS</summary><div class="race-actions">${highlights.map(proof => raceButton(`ROOM ${proof.level}`, 'replay', '', proof.level)).join('')}</div></details>` : ''}`;
  }
  function playReplay(level) {
    const proof = room.results?.[0]?.highlights?.find(item => item.level === level);
    if (!proof) return;
    const replayWorld = createWorld(generateRoom(level, room.seed));
    q('[data-race-replay-panel]').hidden = false;
    q('[data-race-replay-label]').textContent = `ROOM ${level} / VERIFIED WINNING CLEAR`;
    const replayRenderer = new Renderer(q('.race-replay-canvas'));
    replayRenderer.reducedMotion = true;
    replayRenderer.setWorld(replayWorld, 'practice', performance.now() / 1000);
    replay = { world: replayWorld, renderer: replayRenderer, proof, step: 0, shot: 0, accumulator: 0 };
  }
  function startLevel(index){
    level=index;world=createWorld(generateRoom(index,room.seed));steps=0;shots=[];submitted=false;accumulator=0;last=0;
    if(!renderer){renderer=new Renderer(q('canvas'));renderer.reducedMotion=settings.reducedMotion;input=new Input(q('canvas'),renderer,()=>world,{kind(){},shot(){shots.push({step:steps,angle:input.angle,power:input.power});},restart:()=>startLevel(level),pause(){input.cancel();},guide(){}},{keyboardTarget:q('canvas'),pointerTarget:q('canvas')});}
    input.reset();renderer.setWorld(world,'game',performance.now()/1000);input.enabled=room.state==='RACING';q('canvas').focus({preventScroll:true});
  }
  function onRoom(next){
    const oldSeed=room?.seed, oldState=room?.state;room=next;const me=room.players.find(p=>p.id===client.id);if(!me)return;
    q('[data-race-room]').textContent=room.code;
    q('[data-race-players]').innerHTML=room.players.map(p=>`<li><span style="color:${colors[p.id-1]}">${escape(p.name)}${p.id===client.id?' (YOU)':''}</span><span>${p.forfeited?'FORFEITED':!p.connected?'RECONNECTING':p.ready?'READY':'WAITING'}</span></li>`).join('');
    const playing=['COUNTDOWN','RACING'].includes(room.state),results=room.state==='PODIUM_RESULTS';
    if (playing && oldState !== room.state) notice('');
    q('.race-connect').hidden=playing||results;q('.race-play').hidden=!playing;q('[data-race-progress]').hidden=!playing;q('[data-race-hud]').hidden=!playing;q('.race-results').hidden=!results;
    q('[data-race-ready] .button-label').textContent=me.ready?'CANCEL READY':'READY';
    status(results ? 'RESULTS' : room.state === 'RACING' ? 'RACING' : room.state === 'COUNTDOWN' ? 'STARTING' : 'IN LOBBY');
    q('[data-race-track]').innerHTML=room.players.map(p=>`<span class="race-pin" style="left:${Math.min(100,Math.max(0,p.level-1))}%;color:${colors[p.id-1]}"><span>${escape(p.name)} · ${Math.min(100,p.level)}</span></span>`).join('');
    if(playing&&me.level<=100&&(!world||level!==me.level||oldSeed!==room.seed))startLevel(me.level);
    if(input)input.enabled=room.state==='RACING'&&me.level<=100&&!submitted;
    if (reconnecting) {
      reconnecting = false;
      notice('');
      if (room.state === 'RACING' && me.level === level && submitted) client.send({ type: 'complete', level, shots });
    }
    if(me.level>100)q('[data-race-countdown]').textContent='FINISHED · WAITING FOR RACERS';
    if (results && oldState !== room.state) {
      input?.cancel();
      notice('');
      renderResults();
      Promise.resolve(profile?.refresh?.()).catch(() => {});
    } else if (!results && replay) {
      replay = null;
      q('[data-race-replay-panel]').hidden = true;
    }
  }
  async function connect(type) {
    const code = q('[data-race-code]').value.trim().toUpperCase();
    if (type === 'join' && !/^[0-9A-F]{6}$/.test(code)) {
      notice('Enter the six-character room code.');
      q('[data-race-code]').focus();
      return;
    }
    status('CONNECTING');
    notice('Connecting to the relay…');
    try {
      const url = resolveRelayUrl();
      await profile?.ready?.catch(() => {});
      if (disposed) return;
      client?.close();
      client = new RaceClient(url);
      client.addEventListener('notice', event => {
        notice(event.detail);
        if (!client.id) status('ONLINE');
        if (submitted && /replay rejected|unexpected completion/i.test(event.detail)) startLevel(level);
      }, { signal: abort.signal });
      client.addEventListener('disconnected', () => {
        reconnecting = true;
        status('CONNECTING');
        if (input) { input.enabled = false; input.cancel(); }
      }, { signal: abort.signal });
      client.addEventListener('joined', () => {
        q('[data-race-lobby]').hidden = false;
        notice('Share the room code. Everyone must be ready to start.');
        q('[data-race-create]').disabled = true;
        q('[data-race-join]').disabled = true;
      }, { signal: abort.signal });
      client.addEventListener('room', event => onRoom(event.detail), { signal: abort.signal });
      const name = q('[data-race-name]').value.trim();
      client.connect({ type, code, name, profileId: profile?.snapshot?.id });
    } catch (error) {
      status('ONLINE');
      notice(error.message);
    }
  }
  function tick(timestamp){
    if(disposed)return;const dt=last?Math.max(0,Math.min(CONFIG.physics.maxFrame,(timestamp-last)/1000)):0;last=timestamp;
    if (replay && replay.step < replay.proof.steps) {
      replay.accumulator += dt * 2;
      while (replay.accumulator >= CONFIG.physics.step && replay.step < replay.proof.steps) {
        const shot = replay.proof.shots[replay.shot];
        if (shot?.step === replay.step) { launch(replay.world, shot.angle, shot.power); replay.shot++; }
        stepWorld(replay.world);
        replay.step++;
        replay.accumulator -= CONFIG.physics.step;
      }
      replay.renderer.draw(timestamp / 1000, 1, { aiming: false }, { ...settings, reducedMotion: true });
    }
    if(room&&client){const now=client.serverNow(),me=room.players.find(p=>p.id===client.id);q('[data-race-clock]').textContent=room.startAt?`${Math.max(0,(now-room.startAt)/1000).toFixed(1)}s`:'';
      if(room.state==='COUNTDOWN') {
        const seconds = Math.ceil((room.startAt-now)/1000);
        q('[data-race-countdown]').textContent=seconds>0?String(seconds):'GO';
        status(seconds > 0 ? `STARTING IN ${seconds}…` : 'STARTING');
      }
      else if(room.state==='RACING'&&me?.level<=100)q('[data-race-countdown]').textContent=submitted?'VERIFYING FINISH…':'';
      if(world&&room.state==='RACING'&&me?.level<=100&&!submitted){input.update(dt);accumulator+=dt;while(accumulator>=CONFIG.physics.step){stepWorld(world);steps++;accumulator-=CONFIG.physics.step;if(world.status==='won'){submitted=true;input.enabled=false;client.send({type:'complete',level,shots});break;}}}
      if(world&&!q('.race-play').hidden){
        renderer.draw(timestamp/1000,accumulator/CONFIG.physics.step,input,settings);
        const ctx=renderer.ctx;ctx.save();ctx.setTransform(renderer.scale*renderer.dpr,0,0,renderer.scale*renderer.dpr,renderer.x*renderer.dpr,renderer.y*renderer.dpr);
        for(const [id,buffer]of client.ghosts){const ghost=buffer.sample(now);if(!ghost||ghost.level!==level)continue;ctx.globalAlpha=.45;ctx.fillStyle=colors[id-1];ctx.beginPath();ctx.arc(ghost.x,ghost.y,CONFIG.world.radius,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.9;ctx.font='14px monospace';ctx.fillText(room.players.find(p=>p.id===id)?.name??'',ghost.x+20,ghost.y-20);}
        ctx.restore();
        if(timestamp-lastPacket>=50&&room.state==='RACING'&&me.level<=100){lastPacket=timestamp;client.telemetry(encodeTelemetry({sequence:sequence++%4096,timestamp:Math.floor(now)%65536,x:world.x,y:world.y,level,status:world.status,shots:Math.min(15,world.shots),angle:world.angle}));}
        const leader=room.players.reduce((a,b)=>a.level>b.level?a:b),milestone=[100,75,50,25].find(n=>me?.splits[n]&&leader.splits[n]);const split=milestone?(me.splits[milestone]-leader.splits[milestone])/1000:null;
        q('[data-race-hud]').textContent=`ROOM ${level}/100 · SHOTS ${world.shots} · PAR ${world.level.par} · ${Number.isFinite(client.rtt)?Math.round(client.rtt)+'ms':'CONNECTING'}${split!==null?` · LEVEL ${milestone} SPLIT ${split>=0?'+':''}${split.toFixed(2)}s`:''}${room.deadline?` · FINISH WINDOW ${Math.max(0,Math.ceil((room.deadline-now)/1000))}s`:''}`;
      }
    }
    frame=requestAnimationFrame(tick);
  }
  const observer=new ResizeObserver(()=>renderer?.resize());observer.observe(q('canvas'));
  function leave() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    input?.destroy();
    client?.close();
    abort.abort();
    overlay.remove();
    onExit();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }
  overlay.addEventListener('click',event=>{if(event.target.closest('[data-race-exit]'))leave();if(event.target.closest('[data-race-create]'))connect('create');if(event.target.closest('[data-race-join]'))connect('join');if(event.target.closest('[data-race-ready]'))client?.send({type:'ready',ready:!room?.players.find(p=>p.id===client.id)?.ready});if(event.target.closest('[data-race-rematch]'))client?.send({type:'ready',ready:true});},{signal:abort.signal});
  overlay.addEventListener('click', event => {
    const button = event.target.closest('[data-race-replay]');
    if (button) playReplay(Number(button.dataset.raceReplay));
  }, { signal: abort.signal });
  // Keep campaign shortcuts and hidden controls out of this modal's events.
  overlay.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.code === 'Escape') leave();
    if (event.code === 'Enter' && event.target.matches('[data-race-code]') && !q('[data-race-join]').disabled) connect('join');
    if (event.code === 'Tab') {
      const controls = [...overlay.querySelectorAll('button:not(:disabled),input,summary,canvas[tabindex="0"]')].filter(element => element.getClientRects().length);
      const edge = event.shiftKey ? controls[0] : controls.at(-1);
      if (edge && document.activeElement === edge) {
        event.preventDefault();
        (event.shiftKey ? controls.at(-1) : controls[0]).focus();
      }
    }
  }, { signal: abort.signal });
  document.addEventListener('visibilitychange',()=>{input?.cancel();last=0;accumulator=0;},{signal:abort.signal});
  frame=requestAnimationFrame(tick);q('[data-race-name]').focus();return leave;
}
