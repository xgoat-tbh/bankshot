import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { existsSync,mkdirSync } from 'node:fs';
import { createRaceServer } from '../server/race-server.mjs';
import { generateRoom } from '../src/generator.js';
import { CONFIG } from '../src/config.js';
const server=createRaceServer({port:0,countdownMs:300});const address=await server.listen();
const browser=await chromium.launch({executablePath:existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined});
const errors=[];const pages=[];
try{
  for(let i=0;i<2;i++){
    const page=await browser.newPage({viewport:{width:1440,height:900}});pages.push(page);page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(({relay, hardwareConcurrency})=>{
      window.BANKSHOT_RELAY_URL = relay;
      Object.defineProperty(navigator, 'hardwareConcurrency', { value: hardwareConcurrency });
      localStorage.setItem('bankshot.db.v3',JSON.stringify({version:3,userSeed:'12345678-1234-4123-8123-123456789012',seenGuide:true,settings:{reducedMotion:true}}));
    }, {relay: `ws://127.0.0.1:${address.port}/relay`, hardwareConcurrency: 8 + 8 * i});
    await page.goto(process.env.BANKSHOT_URL||'http://127.0.0.1:4174');
    await page.locator('[data-action="race"]').click();
    assert.equal(await page.locator('[data-race-url]').count(), 0);
    assert.equal(await page.locator('[data-race-create] .button-surface').count(), 1);
    await page.locator('[data-race-name]').fill(`Browser ${i+1}`);
  }
  await pages[0].locator('[data-race-create]').click();await pages[0].locator('[data-race-room]').waitFor();
  let code='';for(let i=0;i<100&&!code;i++){code=await pages[0].locator('[data-race-room]').textContent();if(!code)await new Promise(resolve=>setTimeout(resolve,20));}
  assert.ok(code);await pages[1].locator('[data-race-code]').fill(code);await pages[1].locator('[data-race-join]').click();
  await pages[1].locator('[data-race-ready]').waitFor();
  assert.equal(await pages[0].locator('[data-race-status]').textContent(), 'IN LOBBY');
  mkdirSync('tests/artifacts',{recursive:true});await pages[0].screenshot({path:'tests/artifacts/race-lobby.png'});
  for(const page of pages)await page.locator('[data-race-ready]').click();
  for(const page of pages)await page.locator('.race-play').waitFor({state:'visible'});
  while(server.rooms.get(code).state!=='RACING')await new Promise(resolve=>setTimeout(resolve,25));
  const level=generateRoom(1,server.rooms.get(code).seed),shot=level.solution[0],page=pages[0],box=await page.locator('.race-canvas').boundingBox();
  const W=CONFIG.world,L=CONFIG.layout,I=CONFIG.input,unit=Math.max(L.unitMin,Math.min(L.unitMax,Math.min(box.width,box.height)*L.unitVmin/100));
  const portrait=box.width/box.height<L.portraitRatio,side=(portrait?L.mobileSideUnits:L.sideUnits)*unit,top=(portrait?L.mobileTopUnits:L.topUnits)*unit,bottom=(portrait?L.mobileBottomUnits:L.bottomUnits)*unit;
  const scale=Math.min((box.width-side*2)/W.width,(box.height-top-bottom)/W.height),ox=(box.width-W.width*scale)/2,oy=top+(box.height-top-bottom-W.height*scale)/2;
  const x=ox+level.puck[0]*scale,y=oy+level.puck[1]*scale,angle=shot.angleDeg*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  const edgeX=Math.abs(c)>1e-8?(c>0?x:box.width-x)/Math.abs(c):Infinity,edgeY=Math.abs(s)>1e-8?(s>0?y:box.height-y)/Math.abs(s):Infinity;
  const range=Math.max(I.minimumDragRange,Math.min(I.dragPixels,Math.min(edgeX,edgeY)*I.edgePowerFactor)),distance=I.cancelPixels+Math.sqrt(shot.power)*(range-I.cancelPixels);
  await page.mouse.move(box.x+x,box.y+y);await page.mouse.down();await page.mouse.move(box.x+x-c*distance,box.y+y-s*distance,{steps:5});await page.mouse.up();
  await page.waitForFunction(()=>document.querySelector('[data-race-hud]').textContent.includes('ROOM 2/100'),{timeout:25000});
  assert.equal(server.rooms.get(code).players.get(1).level,2);
  mkdirSync('tests/artifacts',{recursive:true});await page.screenshot({path:'tests/artifacts/race.png'});
  await pages[1].locator('[data-race-exit]').click();await pages[1].locator('.race-overlay').waitFor({state:'detached'});
  assert.deepEqual(errors,[]);console.log('PASS race browser: two clients create/join/ready, synchronized start, real pointer verified clear, progress, leave, no page errors.');
}finally{await browser.close();await server.close();}
