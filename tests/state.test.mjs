import test from 'node:test';
import assert from 'node:assert/strict';
import * as state from '../src/state.js';
const memory = (entries = {}) => ({ getItem: key => entries[key] ?? null, setItem: (key, value) => { entries[key] = value; }, entries });
const make = () => state.createStore(memory());
test('v3 uses one-based sequential unlocks and persists a UUID', () => {
 const storage = memory(); const s = state.createStore(storage);
 assert.equal(s.data.version, 3); assert.match(s.data.userSeed, /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i);
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
test('v3 grades use strict under-par and ignore last try and failure history', () => {
 assert.deepEqual([1,2,3,4].map(n=>state.calculateRank(n,2)),['S','A','B','C']);
 assert.equal(state.calculateRank(5,2,5,6),'D'); assert.equal(state.calculateRank(5,2,6,6),'D');
 assert.equal(state.calculateRank(5,2,5,8,1),'D');
});
test('room pity survives switching and reload and resets on success', () => {
 const storage=memory(); let s=state.createStore(storage); s.recordSuccess({id:1,par:1},1);
 for(let i=0;i<3;i++) s.recordFailure(2);
 s.select(1); s=state.createStore(storage); s.select(2);
 assert.equal(s.data.currentFailStreak,3); assert.equal(s.calculateBudget(2,2),4);
 s.recordSuccess({id:2,par:2},2); assert.equal(s.data.currentFailStreak,0);
});
test('replays improve best grades and stats count unique rooms and every fired shot', () => {
 const s=make(); for(let i=0;i<12;i++) s.recordShot();
 s.recordFailure(); assert.equal(s.recordSuccess({id:1,par:1},5,5,8),'D');
 assert.equal(s.recordSuccess({id:1,par:1},5,5,8),'D');
 assert.equal(s.data.levelRecords[1].bestRank,'D');
 s.recordSuccess({id:1,par:1},1); assert.equal(s.data.levelRecords[1].bestShots,1);
 assert.equal(s.data.stats.levelsCompleted,1); assert.equal(s.data.stats.aRanks,1); assert.equal(s.data.stats.dRanks,0);
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
 storage.entries['bankshot.db.v3']=JSON.stringify({version:3,userSeed:original,currentLevel:999,maxUnlocked:999,stats:{totalShotsFired:-2,recentShots:[1,null,-2,2]},levelRecords:{1:{bestShots:2,bestRank:'A',par:1},3:{bestShots:1,bestRank:'S',par:1}},settings:{aimPreview:false,reducedMotion:'yes'}});
 const s=state.createStore(storage); assert.equal(s.data.userSeed,original); assert.equal(s.data.maxUnlocked,2); assert.equal(s.data.currentLevel,2);
 assert.equal(s.data.settings.aimPreview,false); assert.equal(s.data.settings.reducedMotion,false); assert.equal(s.data.stats.totalShotsFired,0);
 assert.deepEqual(s.data.stats.recentShots,[1,2]); assert.equal(s.data.stats.levelsCompleted,1);
});
test('corrupt JSON is replaced and denied storage remains playable', () => {
 const storage=memory({'bankshot.db.v3':'{broken'}); const s=state.createStore(storage);
 assert.equal(JSON.parse(storage.entries['bankshot.db.v3']).version,3);
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
 assert.equal(s.data.levelRecords[1].rank,'A'); assert.ok(Number.isFinite(s.data.levelRecords[1].clearedAt));
 assert.equal(s.data.currentLevel,2);
});

test('v3 migration resets ranked state once and retains rooms seed and controls',()=>{
 const storage=memory({'bankshot.db.v2':JSON.stringify({version:2,userSeed:'a1b2c3d4-e5f6-4a1b-8c2d-123456789abc',elo:900,mmr:800,winStreak:5,levelRecords:{1:{bestShots:1,par:1,rank:'S'}},currentLevel:2,roomFailures:{2:3},seenGuide:true,settings:{reducedMotion:true,aimPreview:false},rank:{matchHistory:[{outcome:'win'}]}})});
 let s=state.createStore(storage);assert.equal(s.data.version,3);assert.equal(s.data.elo,0);assert.equal(s.data.mmr,0);assert.equal(s.data.winStreak,0);assert.equal(s.data.rank.matchHistory.length,0);assert.equal(s.data.currentLevel,2);assert.equal(s.data.currentFailStreak,3);assert.equal(s.data.settings.reducedMotionMode,'on');
 s.recordSuccess({id:2,par:1},1,1,3,20,false);const elo=s.data.elo;s=state.createStore(storage);assert.equal(s.data.elo,elo);assert.equal(s.data.mmr,6);assert.equal(s.data.winStreak,1);
});
test('hard ladder win bases speed boundaries difficulty and convergence are deterministic',()=>{
 for(const [shots,par,time,first,want] of [[1,2,20,false,8],[1,1,20,false,5],[2,1,20,false,3],[3,1,20,false,2],[4,1,20,false,1],[1,1,5.99,true,9],[1,1,6,false,6],[1,1,12,false,5]]) {const s=make();s.recordSuccess({id:1,par},shots,shots,10,time,first);assert.equal(s.data.elo,want);}
 const low=make();low.data.elo=100;low.data.mmr=0;low.recordSuccess({id:1,par:1},1,1,3,20,false);assert.equal(low.data.elo,103);
 const high=make();high.data.elo=100;high.data.mmr=200;high.recordSuccess({id:1,par:1},1,1,3,20,false);assert.equal(high.data.elo,107);
});
test('loss convergence is inverse and shield history reports actual delta',()=>{
 const s=make();s.data.elo=53;s.data.mmr=53;s.recordFailure();assert.equal(s.data.elo,50);assert.equal(s.data.rank.matchHistory[0].deltaElo,'-3');s.recordFailure();assert.equal(s.data.elo,35);assert.equal(s.data.rank.rr,70);assert.equal(s.data.rank.matchHistory[0].deltaElo,'-15');
 const low=make();low.data.elo=90;low.data.mmr=0;low.recordFailure();assert.equal(low.data.elo,77);
 const high=make();high.data.elo=90;high.data.mmr=190;high.recordFailure();assert.equal(high.data.elo,84);
 for(let i=0;i<12;i++)s.recordFailure();assert.equal(s.data.rank.matchHistory.length,8);assert.equal(s.data.elo,0);assert.equal(s.data.rank.matchHistory[0].deltaElo,'0');
});
test('streaks reset on outcome change and promotions report latest actual result',()=>{
 const s=make();s.data.elo=47;s.data.mmr=47;s.recordSuccess({id:1,par:1},1,1,4,20,false);assert.equal(s.data.elo,52);assert.equal(s.getRankInfo().justPromoted,true);assert.equal(s.getRankInfo().promotedTier.label,'IRON II');assert.equal(s.getRankInfo().deltaElo,5);
 s.recordSuccess({id:2,par:1},1,1,4,20,false);assert.equal(s.data.winStreak,2);s.recordFailure();assert.equal(s.data.winStreak,0);assert.equal(s.data.lossStreak,1);assert.equal(s.getRankInfo().justPromoted,false);
});
test('active attempt reload counts one loss and blocks clean bonus cheating',()=>{
 const storage=memory();let s=state.createStore(storage);s.recordShot();s.recordShot();s=state.createStore(storage);assert.equal(s.data.roomFailures[1],1);assert.equal(s.data.lossStreak,1);assert.equal(s.data.stats.totalShotsFired,2);s=state.createStore(storage);assert.equal(s.data.lossStreak,1);
 s.recordSuccess({id:1,par:1},1,1,3,20,true);assert.equal(s.data.mmr,6);assert.equal(s.data.activeAttempt,null);
});
test('production settings validate types ranges and persist',()=>{
 const storage=memory();let s=state.createStore(storage);assert.equal(s.setSetting('touchSensitivity',0.5),true);assert.equal(s.setSetting('touchSensitivity',2),true);assert.equal(s.setSetting('touchSensitivity',2.01),false);assert.equal(s.setSetting('touchSensitivity','1'),false);assert.equal(s.toggle('touchSensitivity'),false);assert.equal(s.setSetting('highDpi',false),true);assert.equal(s.setSetting('reducedMotionMode','off'),true);assert.equal(s.setSetting('reducedMotionMode','bogus'),false);s=state.createStore(storage);assert.equal(s.data.settings.touchSensitivity,2);assert.equal(s.data.settings.highDpi,false);assert.equal(s.data.settings.reducedMotionMode,'off');
});
test('all streak multiplier steps and difficulty cap affect awarded ELO',()=>{
 for(const [prior,want] of [[0,8],[1,8],[2,10],[3,11],[8,11]]) {const s=make();s.data.elo=100;s.data.mmr=100;s.data.winStreak=prior;s.recordSuccess({id:1,par:2},1,1,4,20,false);assert.equal(s.data.elo-100,want);}
 for(const room of [100,1000]) {const s=make();s.data.maxUnlocked=room;s.data.elo=100;s.data.mmr=100;s.recordSuccess({id:room,par:1},1,1,4,20,false);assert.equal(s.data.elo,108);}
 for(const [prior,want] of [[0,8],[1,9],[2,11],[8,11]]) {const s=make();s.data.elo=140;s.data.mmr=140;s.data.lossStreak=prior;s.recordFailure();assert.equal(140-s.data.elo,want);}
});
test('v3 repairs bad ladder fields and retains valid progress without consulting v2',()=>{
 const storage=memory({'bankshot.db.v3':JSON.stringify({version:3,elo:-5,mmr:'100',winStreak:-2,lossStreak:2,rank:{peakIndex:999,matchHistory:[null,{room:1,outcome:'win',deltaElo:'oops'}]},settings:{touchSensitivity:99,highDpi:'yes',reducedMotionMode:'bad'}}),'bankshot.db.v2':JSON.stringify({version:2,elo:900})});
 const s=state.createStore(storage);assert.equal(s.data.elo,0);assert.equal(s.data.mmr,0);assert.equal(s.data.lossStreak,2);assert.equal(s.data.rank.matchHistory.length,0);assert.equal(s.data.settings.touchSensitivity,1);assert.equal(s.data.settings.highDpi,true);assert.equal(s.data.settings.reducedMotionMode,'system');
});
test('repaired history reconstructs RR from valid actual ELO and rejects unsafe deltas',()=>{
 const storage=memory({'bankshot.db.v3':JSON.stringify({version:3,rank:{matchHistory:[{room:1,outcome:'win',deltaElo:'+4',deltaRR:'oops'},{room:1,outcome:'fail',deltaElo:'99999999999999999999999999999999999'}]}})});
 const s=state.createStore(storage);assert.equal(s.data.rank.matchHistory.length,1);assert.equal(s.getRankInfo().deltaRR,8);assert.equal(s.data.rank.matchHistory[0].deltaRR,'+8');
});
