import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const p=await b.newPage();
await p.addInitScript(()=>localStorage.setItem('bankshot.db.v2',JSON.stringify({version:2,userSeed:'12345678-1234-4123-8123-123456789012',currentLevel:1,seenGuide:true,settings:{reducedMotion:false,aimPreview:true}})));
await p.clock.install(); await p.goto('http://127.0.0.1:4174'); await p.evaluate(()=>document.fonts.ready); await p.clock.pauseAt(await p.evaluate(()=>Date.now()+10));
console.log('intro before',await p.locator('#root').getAttribute('data-intro'));
await p.keyboard.down('Enter');
await p.clock.runFor(1100);
await p.keyboard.down('Enter');
console.log('repeat Enter state',await p.locator('#root').getAttribute('data-screen'));
await p.keyboard.up('Enter'); await p.clock.runFor(2000);
await p.keyboard.press('h');
await p.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{value:false,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
await p.keyboard.press('Escape');
console.log('guide hide return',await p.locator('#root').getAttribute('data-screen'),'pause visible',await p.locator('[data-panel=pause]').isVisible());
await b.close();

