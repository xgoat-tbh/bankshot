import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { CONFIG, DEG } from '../src/config.js';
import { createCampaignProvider } from '../src/generator.js';
import { createWorld, launch, stepWorld } from '../src/physics.js';
const url = process.env.BANKSHOT_URL || 'http://127.0.0.1:4174';
const seed = '12345678-1234-4123-8123-123456789012';
const campaign = createCampaignProvider(seed);
const browser = await chromium.launch({ executablePath: process.env.BANKSHOT_BROWSER || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined) });
let checks = 0;
const errors = [];
const check = (value, message) => { assert.ok(value, message); checks++; console.log(`ok ${checks} ${message}`); };
const screen = p => p.locator('.bankshot').getAttribute('data-screen');
const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('bankshot.db.v3')));
const action = (p, n) => p.locator(`[data-action="${n}"]:visible`).first();
const tick = (p, ms = 500) => p.clock.runFor(ms);
mkdirSync('tests/artifacts', { recursive: true });
function fixture(highest = 1, seenGuide = true) { const levelRecords = {}; for (let i = 1; i < highest; i++)
    levelRecords[i] = { bestShots: 1, par: 1, rank: 'S', bestRank: 'S', completions: 1 }; return { version: 2, userSeed: seed, currentLevel: highest, maxUnlocked: highest, levelRecords, roomFailures: {}, seenGuide, settings: { aimPreview: true, reducedMotion: true }, stats: { totalShotsFired: highest - 1, completedPar: highest - 1, recentShots: [] } }; }
async function open(options = {}, save) { const p = await browser.newPage({ viewport: { width: 1440, height: 900 }, ...options }); p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error')
    errors.push(m.text()); }); if (save)
    await p.addInitScript(value => { if (!sessionStorage.getItem('fixture')) {
        localStorage.setItem('bankshot.db.v2', JSON.stringify(value));
        sessionStorage.setItem('fixture', '1');
    } }, save); await p.clock.install({time:new Date('2026-11-02T12:00:00Z')}); await p.clock.pauseAt(new Date('2026-11-02T12:00:01Z')); await p.goto(url, { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready); return p; }
function pull(page, world, shot, touch = false) { const v = page.viewportSize(), L = CONFIG.layout, W = CONFIG.world; const unit = Math.max(L.unitMin, Math.min(L.unitMax, Math.min(v.width, v.height) * L.unitVmin / 100)); const portrait = v.width / v.height < L.portraitRatio; const side = (portrait ? L.mobileSideUnits : L.sideUnits) * unit, top = (portrait ? L.mobileTopUnits : L.topUnits) * unit, bottom = (portrait ? L.mobileBottomUnits : L.bottomUnits) * unit; const scale = Math.min((v.width - side * 2) / W.width, (v.height - top - bottom) / W.height); const x = (v.width - W.width * scale) / 2 + world.x * scale, y = top + (v.height - top - bottom - W.height * scale) / 2 + world.y * scale; const a = shot.angleDeg * DEG, c = Math.cos(a), s = Math.sin(a); const ex = Math.abs(c) > CONFIG.physics.epsilon ? (c > 0 ? x : v.width - x) / Math.abs(c) : Infinity, ey = Math.abs(s) > CONFIG.physics.epsilon ? (s > 0 ? y : v.height - y) / Math.abs(s) : Infinity; const range = Math.max(Math.min(touch ? CONFIG.input.touchDragPixels : CONFIG.input.dragPixels, CONFIG.input.cancelPixels * 4), Math.min(touch ? CONFIG.input.touchDragPixels : CONFIG.input.dragPixels, Math.min(ex, ey) * CONFIG.input.edgePowerFactor)); return { x, y, endX: x - c * (CONFIG.input.cancelPixels + Math.sqrt(shot.power) * (range - CONFIG.input.cancelPixels)), endY: y - s * (CONFIG.input.cancelPixels + Math.sqrt(shot.power) * (range - CONFIG.input.cancelPixels)) }; }
async function drag(p, world, shot) { const q = pull(p, world, shot); await p.mouse.move(q.x, q.y); await p.mouse.down(); await p.mouse.move(q.endX, q.endY, { steps: 3 }); await p.mouse.up(); }
async function solve(p, room, interrupt = false) { const expected = createWorld(room); await tick(p, 2200); for (const shot of room.solution) {
    await drag(p, expected, shot);
    if (interrupt) {
        await tick(p, 80);
        await p.keyboard.press('h');
        check(await p.locator('.guide-backdrop').isVisible(), 'H opens guide in flight');
        const before = await p.locator('[data-shots]').textContent();
        await tick(p, 3000);
        check(await screen(p) === 'game' && await p.locator('[data-shots]').textContent() === before, 'Guide suspends in-flight result');
        await p.keyboard.press('Escape');
        interrupt = false;
    }
    launch(expected, shot.angleDeg * DEG, shot.power);
    let steps = 0;
    while (expected.status === 'moving' && steps++ < CONFIG.tests.maxSteps)
        stepWorld(expected);
    await tick(p, Math.ceil(steps * CONFIG.physics.step * 1000) + 700);
} if (await p.locator('.promotion-overlay').isVisible()) { check((await p.locator('.promotion-overlay').textContent()).includes('RANK PROMOTION'), 'Promotion fanfare appears'); await p.locator('[data-promotion-close]').click(); await tick(p, 50); } if (await screen(p) !== 'result') {
    console.log('FAIL ROOM', room.id, JSON.stringify(room.solution), await db(p), await p.locator('.hud').textContent());
    await p.screenshot({ path: `tests/artifacts/fail-${room.id}.png` });
} check(await screen(p) === 'result', `Real pointer clears room ${room.id}`); check(await p.locator('[data-result-rank]').textContent() === 'A', `Room ${room.id} awards A`); }
try {
    const first = await open();
    check(await first.locator('.bankshot').getAttribute('data-intro') !== null, 'Full intro starts');
    await tick(first, 2000);
    check(!await first.locator('.guide-backdrop').isVisible(), 'Full intro lasts over two seconds');
    await tick(first, 1800);
    check(await first.locator('.guide-backdrop').isVisible(), 'First visit guide opens after intro');
    await first.screenshot({ path: 'tests/artifacts/guide.png' });
    await first.locator('[data-guide-tab="3"]').click();
    check(await first.locator('[data-ladder-tier]').count() === 25, 'Guide shows all 25 ladder tiers');
    await first.locator('[data-ladder-tier="24"]').click();
    check((await first.locator('.ladder-selected').textContent()).includes('RADIANT'), 'Ladder selection updates detail');
    const practiceBefore = JSON.stringify(await db(first));
    await first.locator('[data-guide-tab="4"]').click();
    const practice = first.locator('.practice-canvas');
    await practice.focus();
    await first.keyboard.down('Space');
    await tick(first, 300);
    check((await first.locator('[data-sandbox-status]').textContent()).includes('POWER'), 'Practice shows keyboard charge power');
    await first.keyboard.up('Space');
    await tick(first, 300);
    check((await first.locator('[data-sandbox-status]').textContent()).includes('1 SHOTS'), 'Practice canvas fires a real shot');
    check(JSON.stringify(await db(first)) === practiceBefore, 'Practice does not mutate career');
    await first.locator('[data-sandbox-reset]').click();
    await practice.focus();
    await first.keyboard.down('Space');
    await tick(first, 200);
    await first.locator('[data-sandbox-reset]').click();
    await first.keyboard.up('Space');
    await tick(first, 700);
    check((await first.locator('[data-sandbox-status]').textContent()).includes('0 SHOTS'), 'Practice reset cancels a charged shot');
    check(await first.locator('.sandbox-toolbar button').count() === 6, 'Practice offers all object placement tools');
    await first.locator('#guide-content').evaluate(el => { el.scrollTop = 0; });
    await first.screenshot({ path: 'tests/artifacts/practice.png' });
    await first.locator('[data-guide-tab="0"]').click();
    await first.keyboard.press('ArrowRight');
    check(await first.locator('[data-guide-tab="1"]').getAttribute('aria-selected') === 'true', 'Guide arrow navigation');
    await first.keyboard.press('6');
    check(await first.locator('[data-guide-tab="5"]').getAttribute('aria-selected') === 'true', 'Guide number navigation');
    await first.locator('.guide-close').focus();
    await first.keyboard.press('Shift+Tab');
    check(await first.evaluate(() => document.activeElement.id) === 'guide-content', 'Guide focus wraps backward');
    await first.keyboard.press('Tab');
    check(await first.locator('.guide-close').evaluate(el => el === document.activeElement), 'Guide focus wraps forward');
    await first.keyboard.press('Escape');
    check((await db(first)).seenGuide, 'Seen guide persists');
    check(await first.locator('.play-button').evaluate(el => el === document.activeElement), 'Guide restores focus');
    await first.screenshot({ path: 'tests/artifacts/title.png' });
    await first.close();
    for (const kind of ['pointer', 'keyboard']) {
        const p = await open({}, { ...fixture(), settings: { aimPreview: true, reducedMotion: false } });
        if (kind === 'pointer') {
            const box = await p.locator('.play-button').boundingBox();
            await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        }
        else
            await p.keyboard.press('Space');
        await tick(p, 150);
        check(await screen(p) === 'title', `${kind} intro skip cannot activate Play`);
        await p.close();
    }
    const p = await open({}, fixture());
    await tick(p, 500);
    check(!await p.locator('.bankshot').getAttribute('data-intro'), 'Reduced intro finishes in 400ms');
    await action(p, 'play').click();
    await tick(p, 2200);
    await p.screenshot({ path: 'tests/artifacts/game.png' });
    for (let n = 1; n <= 12; n++) {
        await solve(p, campaign(n, seed), n === 1);
        await action(p, 'next').click();
    }
    let saved = await db(p);
    check(saved.maxUnlocked === 13 && saved.stats.levelsCompleted === 12, 'Twelve sequential unlocks');
    check(saved.stats.totalShotsFired === Array.from({length:12},(_,i)=>campaign(i+1).par).reduce((a,b)=>a+b,0) && saved.stats.recentShots.length === 10, 'Career shots and rolling ten history');
    await p.reload({ waitUntil: 'networkidle' });
    await tick(p, 500);
    check((await db(p)).maxUnlocked === 13, 'Progress survives reload');
    await action(p, 'levels').click();
    await p.locator('[data-index="1"]').evaluate(el=>{window.retainedRoom=el;});
    await p.locator('.room-scroll').evaluate(el=>{el.scrollTop=76;el.dispatchEvent(new Event('scroll'));});
    check(await p.locator('[data-index="1"]').evaluate(el=>el===window.retainedRoom), 'Virtual scrolling retains keyed room elements');
    await p.locator('[data-index="1"]').click();
    await solve(p, campaign(1, seed));
    saved = await db(p);
    check(saved.maxUnlocked === 13 && saved.levelRecords[1].completions === 2 && saved.levelRecords[1].rank === 'A', 'Replay preserves unlock and best rank');
    await action(p, 'next').click();
    await tick(p, 2200);
    await p.keyboard.press('Escape');
    await action(p, 'title').click();
    await action(p, 'stats').click();
    check((await p.locator('[data-stats]').textContent()).includes('13'), 'Stats show highest room');
    await action(p, 'back').click();
    await action(p, 'settings').click();
    await p.locator('[data-key="aimPreview"]').click();
    check((await db(p)).settings.aimPreview === false, 'Aim setting persists');
    await p.locator('#touch-sensitivity').fill('1.5');
    await p.locator('#reduced-mode').selectOption('off');
    await p.locator('[data-key="highDpi"]').click();
    check((await db(p)).settings.touchSensitivity === 1.5, 'Touch sensitivity persists');
    check((await db(p)).settings.reducedMotionMode === 'off' && (await db(p)).settings.highDpi === false, 'Display controls persist');
    await p.locator('#reduced-mode').selectOption('on');
    for (const v of [{ width: 360, height: 640 }, { width: 768, height: 1024 }, { width: 844, height: 390 }, { width: 1920, height: 1080 }]) {
        await p.setViewportSize(v);
        await tick(p, 60);
        check(await p.evaluate(() => document.body.scrollWidth <= innerWidth), `No overflow ${v.width}x${v.height}`);
        const small = await p.locator('button:visible').evaluateAll(es => es.filter(el => !el.disabled && (el.getBoundingClientRect().width < 43.9 || el.getBoundingClientRect().height < 43.9)).map(el => el.textContent));
        check(!small.length, `44px targets ${v.width}x${v.height}: ${small}`);
    }
    await p.close();
    const failing = await open({}, fixture());
    await tick(failing, 500);
    await action(failing, 'play').click();
    await tick(failing, 2200);
    const miss = { angleDeg: 90, power: 0.12 };
    for (let failure = 0; failure < 3; failure++) {
        const budget = Number(await failing.locator('[data-tries]').textContent());
        for (let shot = 0; shot < budget; shot++) {
            const expected = createWorld(campaign(1, seed));
            for (let prev = 0; prev < shot; prev++) {
                launch(expected, miss.angleDeg * DEG, miss.power);
                let steps = 0;
                while (expected.status === 'moving' && steps++ < CONFIG.tests.maxSteps)
                    stepWorld(expected);
            }
            await drag(failing, expected, miss);
            await tick(failing, 12000);
        }
        check((await db(failing)).roomFailures[1] === failure + 1, `Budget exhaustion persists failure ${failure + 1}`);
        check(Number(await failing.locator('[data-shots]').textContent()) === 0 && await failing.locator('[data-level-number]').textContent() === '01', 'Failure resets same room');
    }
    check(Number(await failing.locator('[data-tries]').textContent()) === 4, 'Third failure grants one pity shot');
    check((await db(failing)).stats.totalShotsFired === 9, 'Failed shots remain in career stats');
    await failing.reload({ waitUntil: 'networkidle' });
    await tick(failing, 500);
    await action(failing, 'play').click();
    await tick(failing, 2200);
    check(Number(await failing.locator('[data-tries]').textContent()) === 4, 'Pity survives reload');
    await failing.close();
    const late = await open({}, fixture(31));
    await tick(late, 500);
    await action(late, 'play').click();
    const room = campaign(31, seed);
    check(room.hazards.length > 0 && room.walls.some(w => w.mat !== 'solid'), 'Room31 includes hazards and later materials');
    await solve(late, room);
    await late.close();
    for (const n of [41, 51]) {
        const advanced = await open({}, fixture(n));
        await tick(advanced, 500);
        await action(advanced, 'play').click();
        await solve(advanced, campaign(n, seed));
        await advanced.close();
    }
    const high = await open({}, fixture(1200));
    await tick(high, 500);
    await action(high, 'levels').click();
    check(await high.locator('.room-row').count() < 30, 'High-progress DOM bounded');
    await high.locator('.room-scroll').evaluate(el => { el.scrollTop = 1195 * 76; el.dispatchEvent(new Event('scroll')); });
    await tick(high, 300);
    check(await high.locator('.room-row').count() < 30 && await high.locator('[data-index="1200"]').count() === 1, 'Virtual scroll reaches room1200 with bounded DOM');
    await high.close();
    const touch = await open({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }, fixture());
    await tick(touch, 500);
    await action(touch, 'play').tap();
    await tick(touch, 2200);
    await touch.screenshot({ path: 'tests/artifacts/mobile.png' });
    check(await touch.locator('canvas.arena').getAttribute('width') === '720', 'DPR capped at two');
    const cdp = await touch.context().newCDPSession(touch), point = pull(touch, createWorld(campaign(1, seed)), campaign(1, seed).solution[0], true), q = { x: point.x, y: point.y, id: 1 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [q] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...q, x: point.endX, y: point.endY }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    check(Number(await touch.locator('[data-shots]').textContent()) === 0, 'Touch cancel consumes no shot');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [q] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...q, x: point.endX, y: point.endY }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await tick(touch, 5000);
    check(await screen(touch) === 'result', 'Real touch clears mobile room');
    await action(touch, 'restart').tap();
    await tick(touch, 2200);
    await touch.keyboard.down('Space');
    await tick(touch, 200);
    await touch.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await touch.keyboard.up('Space');
    check(await screen(touch) === 'pause' && Number(await touch.locator('[data-shots]').textContent()) === 0, 'Hidden tab pauses and cancels charging');
    await touch.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
    await action(touch, 'guide').tap();
    await touch.keyboard.press('Escape');
    check(await screen(touch) === 'pause', 'Guide opened from pause returns to pause');
    await action(touch, 'resume').tap();
    await touch.keyboard.press('h');
    await touch.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
    await touch.keyboard.press('Escape');
    check(await screen(touch) === 'pause' && await touch.locator('[data-panel="pause"]').isVisible(), 'Hidden tab while guide open restores visible pause panel');
    await touch.close();
    check(errors.length === 0, `No browser errors: ${errors.join('; ')}`);
    console.log(`PASS ${checks} browser checks; 14 pointer clears and one touch clear.`);
}
finally {
    await browser.close();
}



