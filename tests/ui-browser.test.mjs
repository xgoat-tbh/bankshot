import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { createRaceServer } from '../server/race-server.mjs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: existsSync(chrome) ? chrome : undefined });
const relay = createRaceServer({ port: 0 });
const address = await relay.listen();
const relayUrl = `ws://127.0.0.1:${address.port}/relay`;
const url = process.env.BANKSHOT_URL || 'http://127.0.0.1:4174';
const errors = [];
const click = (page, action) => page.locator(`[data-action="${action}"]:visible`).click();
const save = page => page.evaluate(() => JSON.parse(localStorage.getItem('bankshot.db.v3')));

async function openContext() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await context.addInitScript(endpoint => {
    window.BANKSHOT_RELAY_URL = endpoint;
    if (!localStorage.getItem('bankshot.db.v3')) {
      localStorage.setItem('bankshot.db.v3', JSON.stringify({
        version: 3, userSeed: crypto.randomUUID(), seenGuide: true,
        settings: { reducedMotion: true, reducedMotionMode: 'on' },
      }));
    }
  }, relayUrl);
  return context;
}

async function open(context) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.locator('.bankshot:not([data-intro])').waitFor();
  return page;
}

try {
  const context = await openContext();
  const first = await open(context);
  const second = await open(context);
  for (const page of [first, second]) await click(page, 'settings');
  await second.locator('[data-key=aimPreview]').click();
  await first.waitForFunction(() => document.querySelector('[data-key=aimPreview]').getAttribute('aria-checked') === 'false');
  console.log('PASS browser storage events synchronize visible controls');

  await second.close();
  await first.bringToFront();
  await first.locator('[data-setting-value=reducedMotionMode]').selectOption('off');
  await click(first, 'back');
  await click(first, 'guide');
  for (const tab of [0, 1]) {
    await first.locator(`[data-guide-tab="${tab}"]`).click();
    const shot = await first.locator('.guide-art').evaluate(svg => {
      svg.pauseAnimations();
      const puck = svg.querySelector('.guide-puck');
      const positions = Array.from({ length: 12 }, (_, index) => {
        svg.setCurrentTime((index + 1) * .18);
        return { x: puck.getCTM().e, y: puck.getCTM().f };
      });
      svg.setCurrentTime(2.88);
      return { positions, opacity: Number(getComputedStyle(puck).opacity), points: puck.querySelector('animateMotion').getAttribute('keyPoints') };
    });
    assert.equal(shot.points, '0;1');
    assert.equal(shot.opacity, 0);
    assert.ok(shot.positions.every((point, index) => index === 0 || point.x >= shot.positions[index - 1].x - .01));
    if (tab === 1) assert.ok(Math.min(...shot.positions.map(point => point.y)) < Math.min(shot.positions[0].y, shot.positions.at(-1).y) - 10);
  }
  console.log('PASS guide shots travel forward, bank, and fade before looping');

  await first.locator('[data-guide-tab="4"]').click();
  await first.locator('[data-place=bumper]').click();
  await first.locator('.practice-canvas').click({ position: { x: 380, y: 140 } });
  await first.waitForFunction(() => document.querySelector('[data-sandbox-status]').textContent.includes('PLACE BUMPER'));
  await first.locator('[data-sandbox-reset]').click();
  assert.equal(await first.locator('[data-place=shoot]').getAttribute('aria-pressed'), 'true');
  assert.match(await first.locator('[data-sandbox-status]').textContent(), /0 SHOTS/);
  await first.keyboard.press('Escape');
  console.log('PASS practice toolbar selects placement and reset restores shooting');

  await click(first, 'profile');
  await first.waitForFunction(() => document.querySelector('[data-profile-status]').textContent === 'RELAY CONNECTED');
  const token = await first.locator('[data-agent-token]').textContent();
  assert.match(token, /^AGENT #[A-F0-9]{4}-[A-F0-9]{4}$/);
  await first.locator('[data-profile-callsign]').fill('High Bank');
  await first.locator('[data-profile-callsign]').press('Enter');
  await first.waitForFunction(() => document.querySelector('[data-profile-status]').textContent === 'CALL-SIGN SAVED');
  await click(first, 'profile-copy');
  await first.waitForFunction(() => document.querySelector('[data-profile-status]').textContent === 'AGENT TOKEN COPIED');
  assert.equal(await first.evaluate(() => navigator.clipboard.readText()), token);
  mkdirSync('tests/artifacts', { recursive: true });
  await first.screenshot({ path: 'tests/artifacts/profile.png' });
  const incognito = await open(await openContext());
  await click(incognito, 'profile');
  await incognito.waitForFunction(() => document.querySelector('[data-profile-status]').textContent === 'RELAY CONNECTED');
  assert.equal(await incognito.locator('[data-agent-token]').textContent(), token);
  assert.equal(await incognito.locator('[data-profile-callsign]').inputValue(), 'High Bank');
  assert.equal((await save(incognito)).userSeed, (await save(first)).userSeed);
  await incognito.context().close();
  await first.bringToFront();
  console.log('PASS profile dossier copies token and restores the same agent in a fresh context');

  await first.clock.install();
  await click(first, 'back');
  await click(first, 'play');
  await first.clock.runFor(2200);
  const firstAttempt = await save(first);
  async function fire() {
    await first.keyboard.down('Space');
    await first.clock.runFor(100);
    await first.keyboard.up('Space');
  }
  await fire();
  assert.equal(await first.locator('[data-shots]').textContent(), '1');
  await first.keyboard.press('Escape');
  assert.equal(await first.locator('.bankshot').getAttribute('data-screen'), 'pause');
  await first.locator('[data-panel=pause] [data-action=restart]').click();
  assert.equal(await first.locator('[data-shots]').textContent(), '0');
  const budget = Number(await first.locator('[data-tries]').textContent());
  for (let shot = 1; shot < budget; shot++) {
    await fire();
    await first.clock.runFor(7200);
    assert.equal(await first.locator('[data-shots]').textContent(), String(shot));
  }
  await fire();
  assert.equal(await first.locator('[data-tries]').textContent(), '0');
  await first.locator('.hud-right [data-action=restart]').click();
  await first.clock.runFor(100);
  const restarted = await save(first);
  assert.equal(await first.locator('[data-shots]').textContent(), '0');
  assert.deepEqual(restarted.roomFailures, firstAttempt.roomFailures);
  assert.equal(restarted.elo, firstAttempt.elo);
  assert.equal(restarted.activeAttempt, null);
  await first.screenshot({ path: 'tests/artifacts/restart-hud.png' });
  console.log('PASS paused and last-budget in-flight restarts clear input and preserve rank');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await relay.close();
}
