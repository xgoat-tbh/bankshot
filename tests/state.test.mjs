import test from 'node:test';
import assert from 'node:assert/strict';
import * as state from '../src/state.js';
const memory = (entries = {}) => ({ getItem: key => entries[key] ?? null, setItem: (key, value) => { entries[key] = value; }, entries });
const make = () => state.createStore(memory());
test('v2 uses one-based sequential unlocks and persists a UUID', () => {
 const storage = memory(); const s = state.createStore(storage);
 assert.equal(s.data.version, 2); assert.match(s.data.userSeed, /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i);
 assert.equal(s.canPlay(1), true); assert.equal(s.canPlay(0), false); assert.equal(s.select(2), false);
 s.recordSuccess({id:1,par:1},1); assert.equal(s.data.maxUnlocked,2); assert.equal(s.select(2),true);
 assert.equal(state.createStore(storage).data.userSeed,s.data.userSeed);
});
test('adaptive budgets cover ratio boundaries and pity', () => {
 assert.equal(state.calculateTriesBudget(2),4);
 assert.equal(state.calculateTriesBudget(2,[1.05]),3);
 assert.equal(state.calculateTriesBudget(2,[1.05001]),4);
 assert.equal(state.calculateTriesBudget(2,[1.5]),4);
 assert.equal(state.calculateTriesBudget(4,[1.50001]),5);
 assert.equal(state.calculateTriesBudget(2,[2],6),7);
});
test('letter ranks prioritize par thresholds then distinguish last try and failure', () => {
 assert.deepEqual([1,2,3,4].map(n=>state.calculateRank(n,2)),['S','S','A','B']);
 assert.equal(state.calculateRank(5,2,5,6),'C'); assert.equal(state.calculateRank(5,2,6,6),'D');
 assert.equal(state.calculateRank(5,2,5,8,1),'D');
});
test('room pity survives switching and reload and resets on success', () => {
 const storage=memory(); let s=state.createStore(storage); s.recordSuccess({id:1,par:1},1);
 for(let i=0;i<3;i++) s.recordFailure(2);
 s.select(1); s=state.createStore(storage); s.select(2);
 assert.equal(s.data.currentFailStreak,3); assert.equal(s.calculateBudget(2,2),4);
 s.recordSuccess({id:2,par:2},2); assert.equal(s.data.currentFailStreak,0);
});
test('best rank upgrades independently of shots; stats count unique rooms and every fired shot', () => {
 const s=make(); for(let i=0;i<12;i++) s.recordShot();
 s.recordFailure(); assert.equal(s.recordSuccess({id:1,par:1},5,5,8),'D');
 assert.equal(s.recordSuccess({id:1,par:1},5,5,8),'C');
 assert.equal(s.data.levelRecords[1].bestRank,'C');
 s.recordSuccess({id:1,par:1},1); assert.equal(s.data.levelRecords[1].bestShots,1);
 assert.equal(s.data.stats.levelsCompleted,1); assert.equal(s.data.stats.sRanks,1); assert.equal(s.data.stats.dRanks,0);
 assert.equal(s.data.stats.totalShotsFired,12); assert.ok(s.getStats().accuracy>0 && s.getStats().accuracy<=100);
});
test('rolling completion ratios retain only latest ten attempts including replays', () => {
 const s=make(); s.recordSuccess({id:1,par:1},5);
 for(let i=0;i<10;i++) s.recordSuccess({id:1,par:1},1);
 assert.deepEqual(s.data.stats.recentShots,Array(10).fill(1)); assert.equal(s.calculateBudget(1,2),3);
});
test('invalid and locked room operations do not mutate progression', () => {
 const s=make(); const before=JSON.stringify(s.data);
 for(const id of [-1,0,2,NaN,Infinity,1.2,'1']) { assert.equal(s.select(id),false); assert.equal(s.recordFailure(id),false); assert.equal(s.recordSuccess({id,par:1},1),false); }
 assert.equal(s.recordSuccess({id:1,par:1},NaN),false); assert.equal(JSON.stringify(s.data),before);
});
test('malformed fields repair without losing valid settings or seed', () => {
 const storage=memory(); const original=state.createStore(storage).data.userSeed;
 storage.entries['bankshot.db.v2']=JSON.stringify({version:2,userSeed:original,currentLevel:999,maxUnlocked:999,stats:{totalShotsFired:-2,recentShots:[1,null,-2,2]},levelRecords:{1:{bestShots:2,bestRank:'A',par:1},3:{bestShots:1,bestRank:'S',par:1}},settings:{aimPreview:false,reducedMotion:'yes'}});
 const s=state.createStore(storage); assert.equal(s.data.userSeed,original); assert.equal(s.data.maxUnlocked,2); assert.equal(s.data.currentLevel,2);
 assert.equal(s.data.settings.aimPreview,false); assert.equal(s.data.settings.reducedMotion,false); assert.equal(s.data.stats.totalShotsFired,0);
 assert.deepEqual(s.data.stats.recentShots,[1,2]); assert.equal(s.data.stats.levelsCompleted,1);
});
test('corrupt JSON is replaced and denied storage remains playable', () => {
 const storage=memory({'bankshot.db.v2':'{broken'}); const s=state.createStore(storage);
 assert.equal(JSON.parse(storage.entries['bankshot.db.v2']).version,2);
 const denied=state.createStore({getItem(){throw Error('denied');},setItem(){throw Error('denied');}});
 assert.equal(denied.available,false); denied.recordShot(); denied.recordSuccess({id:1,par:1},1); assert.equal(denied.data.maxUnlocked,2);
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 try {Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('denied');}}); assert.equal(state.safeStore().available,false); assert.equal(state.createStore().available,false);} finally {if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;}
});
test('legacy authored room clears are archived without unlocking procedural rooms', () => {
 const legacy={version:1,best:[1,2,1],current:3,settings:{reducedMotion:true,aimPreview:false}};
 const s=state.createStore(memory({'bankshot.progress.v1':JSON.stringify(legacy)}));
 assert.equal(s.data.maxUnlocked,1); assert.equal(s.data.stats.levelsCompleted,0); assert.deepEqual(s.data.legacy,legacy); assert.equal(s.data.settings.reducedMotion,true);
 s.markGuideSeen(); s.toggle('aimPreview'); assert.equal(s.data.seenGuide,true); assert.equal(s.data.settings.aimPreview,true);
});
test('records expose canonical rank and clear time while successful progression continues', () => {
 const s=make(); s.recordSuccess({id:1,par:1},1);
 assert.equal(s.data.levelRecords[1].rank,'S'); assert.ok(Number.isFinite(s.data.levelRecords[1].clearedAt));
 assert.equal(s.data.currentLevel,2);
});
test('Valorant ranked tier progression, ELO in DB, 2 RR = 1 ELO, demotion shield, and match history', () => {
 const s = make();
 const initial = s.getRankInfo();
 assert.equal(initial.tier, 'Iron');
 assert.equal(initial.division, 1);
 assert.equal(initial.elo, 25);
 assert.equal(initial.rr, 50); // 2 RR = 1 ELO (25 ELO = 50 RR)
 assert.equal(s.data.elo, 25);
 assert.equal(s.data.rank.elo, 25);

 // On-par win gives +16 ELO (+11 base + 5 first clear) = +32 RR
 s.recordSuccess({ id: 1, par: 1 }, 1);
 assert.equal(s.data.elo, 41);
 assert.equal(s.data.rank.elo, 41);
 assert.equal(s.data.rank.rr, 82);

 // Under-par win gives +20 ELO (+15 base + 5 first clear) = +40 RR
 // 41 + 20 = 61 ELO -> Promotes to Iron II (50-99 ELO), division ELO 11 -> 22 RR
 s.recordSuccess({ id: 2, par: 2 }, 1);
 assert.equal(s.data.elo, 61);
 assert.equal(s.data.rank.tierIndex, 1);
 assert.equal(s.data.rank.rr, 22);
 assert.equal(s.getRankInfo().label, 'IRON II');

 // Over-par win gives +13 ELO (+8 base + 5 first clear) = +26 RR
 s.recordSuccess({ id: 3, par: 1 }, 2);
 assert.equal(s.data.elo, 74);
 assert.equal(s.data.rank.rr, 48);

 // Failure causes -7 ELO (-14 RR)
 s.recordFailure(4);
 assert.equal(s.data.elo, 67);
 assert.equal(s.data.rank.rr, 34);

 // Drop to tier floor (Iron II floor = 50 ELO); demotion shield protects at floor
 for (let i = 0; i < 3; i++) s.recordFailure(4);
 assert.equal(s.data.elo, 50);
 assert.equal(s.data.rank.tierIndex, 1);
 assert.equal(s.data.rank.rr, 0); // clamped at floor on first boundary breach

 // Subsequent failure at 0 RR (50 ELO) demotes to previous tier at 38 ELO (76 RR)
 s.recordFailure(4);
 assert.equal(s.data.rank.tierIndex, 0);
 assert.equal(s.data.elo, 38);
 assert.equal(s.data.rank.rr, 76);
 assert.equal(s.getRankInfo().label, 'IRON I');
 assert.equal(s.getRankInfo().peakLabel, 'IRON II');

 // Match history recorded with RR and ELO deltas
 assert.ok(s.data.rank.matchHistory.length >= 5);
 assert.equal(s.data.rank.matchHistory[0].outcome, 'fail');
 assert.equal(s.data.rank.matchHistory[0].deltaRR, '-14');
 assert.equal(s.data.rank.matchHistory[0].deltaElo, '-7');
});

test('retroactive migration calculates ELO from cleared rooms and persists elo in db', () => {
 const storage = memory();
 // Simulate existing save from user with 12 cleared rooms and no elo field
 const levelRecords = {};
 for (let i = 1; i <= 12; i++) {
   levelRecords[i] = { bestShots: 1, par: 1, rank: 'S', bestRank: 'S', completions: 1 };
 }
 storage.entries['bankshot.db.v2'] = JSON.stringify({
   version: 2,
   userSeed: 'a1b2c3d4-e5f6-4a1b-8c2d-123456789abc',
   currentLevel: 13,
   maxUnlocked: 13,
   levelRecords,
   roomFailures: {},
   rank: { tierIndex: 1, rr: 0, peakIndex: 1, matchHistory: [] }
 });

 const s = state.createStore(storage);
 // 25 initial + 12 rooms * 16 (11 on-par + 5 first clear) = 217 ELO
 assert.equal(s.data.elo, 217);
 assert.equal(s.data.rank.elo, 217);
 // 217 ELO / 50 = Tier 4 = Bronze II!
 const rank = s.getRankInfo();
 assert.equal(rank.tier, 'Bronze');
 assert.equal(rank.division, 2);
 assert.equal(rank.label, 'BRONZE II');
 assert.equal(rank.rr, 34); // (217 % 50) * 2 = 17 * 2 = 34 RR

 // Verify db persistence contains elo
 const persisted = JSON.parse(storage.entries['bankshot.db.v2']);
 assert.equal(persisted.elo, 217);
 assert.equal(persisted.rank.elo, 217);
});
