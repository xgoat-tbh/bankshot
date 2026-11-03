import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const browserModule = await import('../src/profile.js').catch(() => ({}));
const serverModule = await import('../server/profile-store.mjs').catch(() => ({}));
const ID = 'a'.repeat(64), OTHER = 'b'.repeat(64);
const memory = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; };
const campaign = (extras = {}) => ({ version: 3, userSeed: '12345678-1234-1234-1234-123456789abc', levelRecords: { 1: { bestShots: 2, par: 1, bestRank: 'B', completions: 1 } }, stats: { totalShotsFired: 2, completedPar: 1 }, rank: { peakElo: 20 }, ...extras });

test('browser features produce a deterministic full SHA256 identity and a separate short label', async () => {
  assert.equal(typeof browserModule.computeHardwareToken, 'function');
  const features = { canvas: 'raster', webgl: 'vendor/gpu', audio: 'samples', colorDepth: 24, concurrency: 8, pixelRatio: 1 };
  const id = await browserModule.computeHardwareToken({ features });
  assert.match(id, /^[a-f0-9]{64}$/);
  assert.equal(await browserModule.computeHardwareToken({ features: { ...features } }), id);
  assert.notEqual(await browserModule.computeHardwareToken({ features: { ...features, canvas: 'other' } }), id);
  assert.match(browserModule.formatAgentToken(id), /^AGENT #[A-F0-9]{4}-[A-F0-9]{4}$/);
  assert.equal(await browserModule.sha256('abc', null), createHash('sha256').update('abc').digest('hex'), 'fallback remains real SHA256');
});

test('blocked fingerprint APIs degrade gracefully without claiming a physical identity', async () => {
  assert.equal(typeof browserModule.collectHardwareFeatures, 'function');
  const features = await browserModule.collectHardwareFeatures({ document: { createElement() { throw Error('denied'); } }, navigator: {}, screen: {} });
  assert.equal(typeof features.canvas, 'string');
  assert.match(await browserModule.computeHardwareToken({ features }), /^[a-f0-9]{64}$/);
});

test('profile store merges campaign progress and survives a process-store restart', () => {
  assert.equal(typeof serverModule.createProfileStore, 'function');
  const dir = mkdtempSync(join(tmpdir(), 'bankshot-profile-'));
  try {
    const filePath = join(dir, 'profiles.json');
    const store = serverModule.createProfileStore({ filePath });
    store.sync({ id: ID, callsign: 'ACE', campaign: campaign() });
    store.sync({ id: ID, campaign: campaign({ levelRecords: { 1: { bestShots: 1, par: 1, bestRank: 'A', completions: 1 }, 3: { bestShots: 2, par: 2, bestRank: 'A' } }, stats: { totalShotsFired: 1, completedPar: 2 } }) });
    const restored = serverModule.createProfileStore({ filePath }).get(ID);
    assert.equal(restored.callsign, 'ACE');
    assert.equal(restored.campaign.levelRecords[1].bestShots, 1);
    assert.equal(restored.campaign.levelRecords[3].bestShots, 2);
    assert.equal(restored.campaign.maxUnlocked, 2);
    assert.equal(restored.campaign.stats.totalShotsFired, 2);
    assert.equal(restored.online.elo, 1000);
    assert.ok(!readFileSync(filePath, 'utf8').includes('canvas'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('public profile updates reject forged online rating and bounded invalid payloads', () => {
  assert.equal(typeof serverModule.createProfileStore, 'function');
  const store = serverModule.createProfileStore();
  assert.throws(() => store.sync({ id: ID, online: { elo: 9999 } }), /field|rating/i);
  assert.throws(() => store.sync({ id: ID, elo: 9999 }), /field|rating/i);
  assert.throws(() => store.sync({ id: 'AGENT #AAAA-AAAA' }), /identity|profile|id/i);
  assert.throws(() => store.sync({ id: ID, callsign: 'x'.repeat(100) }), /callsign|name/i);
  assert.throws(() => store.sync({ id: ID, campaign: { levelRecords: Object.fromEntries(Array.from({ length: 2001 }, (_, i) => [i + 1, {}])) } }), /large|limit|records/i);
  assert.equal(store.get(ID), null);
});

test('only server race settlement updates lifetime rating and persisted outcome IDs prevent double rewards', () => {
  assert.equal(typeof serverModule.createProfileStore, 'function');
  const dir = mkdtempSync(join(tmpdir(), 'bankshot-results-'));
  try {
    const filePath = join(dir, 'profiles.json');
    let store = serverModule.createProfileStore({ filePath });
    store.sync({ id: ID }); store.sync({ id: OTHER });
    store.recordRace({ raceId: 'race-1', winnerId: ID, participantIds: [ID, OTHER], placements: [ID, OTHER] });
    assert.equal(store.get(ID).online.wins, 1);
    assert.equal(store.get(OTHER).online.losses, 1);
    assert.ok(store.get(ID).online.elo > 1000);
    assert.ok(store.get(OTHER).online.elo < 1000);
    store = serverModule.createProfileStore({ filePath });
    store.recordRace({ raceId: 'race-1', winnerId: ID, participantIds: [ID, OTHER] });
    assert.equal(store.get(ID).online.races, 1);
    store.sync({ id: ID, campaign: campaign() });
    assert.equal(store.get(ID).online.wins, 1);
    assert.throws(() => store.recordRace({ raceId: 'same-agent', winnerId: ID, participantIds: [ID, ID] }), /unique|participant/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('profile client supports offline cached identity, recovery, subscription, and campaign restore', async () => {
  assert.equal(typeof browserModule.createProfileService, 'function');
  const profiles = serverModule.createProfileStore();
  profiles.sync({ id: OTHER, callsign: 'RECOVERED', campaign: campaign() });
  const storage = memory();
  let restored, updates = 0;
  const fetchImpl = async (_url, options) => ({ ok: true, json: async () => profiles.sync(JSON.parse(options.body)) });
  const service = browserModule.createProfileService({ storage, relayUrl: 'ws://localhost:8787', features: { canvas: 'device' }, fetchImpl, onCampaign: data => { restored = data; } });
  service.subscribe(() => updates++);
  await service.ready;
  assert.equal(service.snapshot.status, 'online');
  await service.rename('LOCAL');
  assert.equal(service.snapshot.callsign, 'LOCAL');
  await service.recover(`BANKSHOT1:${OTHER}`);
  assert.equal(service.snapshot.id, OTHER);
  assert.equal(service.snapshot.callsign, 'RECOVERED');
  assert.equal(restored.levelRecords[1].bestShots, 2);
  assert.equal(service.exportToken(), `BANKSHOT1:${OTHER}`);
  assert.ok(updates >= 3);
  await assert.rejects(service.recover('AGENT #BBBB-BBBB'), /recovery/i);
  const offline = browserModule.createProfileService({ storage, relayUrl: 'ws://localhost:8787', features: { canvas: 'changed-browser' }, fetchImpl: async () => { throw Error('offline'); } });
  await offline.ready;
  assert.equal(offline.snapshot.id, OTHER);
  assert.equal(offline.snapshot.callsign, 'RECOVERED');
  assert.equal(offline.snapshot.status, 'offline');
  service.destroy(); offline.destroy();
});

test('profile store with sqlite persistence creates tables, records ratings, and serves leaderboard', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bankshot-sqlite-'));
  try {
    const filePath = join(dir, 'profiles.db');
    const store = serverModule.createProfileStore({ filePath });
    store.sync({ id: ID, callsign: 'VIPER', campaign: campaign() });
    store.sync({ id: OTHER, callsign: 'JETT', campaign: campaign() });
    store.recordRace({ raceId: 'race-sqlite-1', winnerId: ID, participantIds: [ID, OTHER], placements: [ID, OTHER] });
    assert.equal(store.get(ID).callsign, 'VIPER');
    assert.equal(store.get(ID).online.wins, 1);
    const leaderboard = store.getLeaderboard(10);
    assert.equal(leaderboard.length, 2);
    assert.equal(leaderboard[0].id, ID);
    assert.ok(leaderboard[0].elo > leaderboard[1].elo);
    store.close();
    // Reopen to verify disk persistence
    const reloaded = serverModule.createProfileStore({ filePath });
    assert.equal(reloaded.get(ID).online.wins, 1);
    reloaded.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
