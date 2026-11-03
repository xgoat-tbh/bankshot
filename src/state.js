const KEY = 'bankshot.db.v3';
const clamp = (n,lo,hi) => Math.min(hi,Math.max(lo,n));
const signed = n => n > 0 ? `+${n}` : `${n}`;
const GRADES = ['S', 'A', 'B', 'C', 'D'];
export const TIERS = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal', 'Radiant'];
export const TIER_COLORS = {
  Iron: '#8B97A2',
  Bronze: '#CD7F32',
  Silver: '#B0C4DE',
  Gold: '#E6C229',
  Platinum: '#4DD0E1',
  Diamond: '#BA68C8',
  Ascendant: '#26A69A',
  Immortal: '#E53935',
  Radiant: '#FFD700',
  Unranked: '#5B6670',
};

const positive = n => Number.isSafeInteger(n) && n > 0;
const count = n => Number.isSafeInteger(n) && n >= 0 ? n : 0;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const validSeed = value => typeof value === 'string' && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value);
const uuid = () => globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const n = Math.random() * 16 | 0; return (c === 'x' ? n : (n & 3) | 8).toString(16); });

export function getRankFromIndex(index) {
  if (index === -1) return { tier: 'Unranked', division: 1, label: 'UNRANKED', color: TIER_COLORS.Unranked, index: -1 };
  index = Math.max(0, Math.min(24, Math.floor(count(index))));
  if (index === 24) return { tier: 'Radiant', division: 1, label: 'RADIANT', color: TIER_COLORS.Radiant, index };
  const tierIndex = Math.floor(index / 3);
  const div = (index % 3) + 1;
  const tier = TIERS[tierIndex];
  const roman = div === 1 ? 'I' : div === 2 ? 'II' : 'III';
  return {
    tier,
    division: div,
    label: `${tier.toUpperCase()} ${roman}`,
    color: TIER_COLORS[tier] || '#E9E6DF',
    index
  };
}

/** 2 RR = 1 ELO. Each division is 50 ELO = 100 RR. Radiant starts at 1200 ELO. */
export function getRankFromElo(elo, races = null) {
  elo = Math.max(0, Math.floor(count(elo)));
  if (races !== null && races < 5) {
    return {
      tier: 'Unranked',
      division: 1,
      label: 'UNRANKED',
      sublabel: `PLACEMENT (${races}/5)`,
      color: TIER_COLORS.Unranked,
      index: -1,
      tierIndex: -1,
      elo,
      eloInTier: 0,
      rr: 0,
      placementsNeeded: 5 - races
    };
  }
  const tierIndex = Math.min(24, Math.floor(elo / 50));
  const eloInTier = tierIndex === 24 ? Math.max(0, elo - 1200) : elo % 50;
  const rr = eloInTier * 2;
  const info = getRankFromIndex(tierIndex);
  return {
    ...info,
    tierIndex,
    elo,
    eloInTier,
    rr
  };
}

/** Budget from the last ten completed shots/par ratios; no history means average skill. */
export function calculateTriesBudget(par, recentRatios = [], failStreak = 0) {
  par = positive(par) ? par : 1;
  const recent = recentRatios.filter(n => Number.isFinite(n) && n > 0).slice(-10);
  const average = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 1.25;
  const base = average <= 1.05 ? par + 1 : average <= 1.5 ? par + 2 : Math.min(5, par + 3);
  return base + Math.floor(count(failStreak) / 3);
}

export function calculateRank(shots, par) {
  return shots < par ? 'S' : shots === par ? 'A' : shots === par+1 ? 'B' : shots === par+2 ? 'C' : 'D';
}
export const rank = calculateRank;

export function createStore(storage) {
  const writer = uuid();
  const subscribers = new Set();
  let available = true;
  if (arguments.length === 0) {
    try { storage = globalThis.localStorage; } catch { available = false; }
  }
  const data = {
    version: 3, userSeed: uuid(), currentLevel: 1, maxUnlocked: 1, currentFailStreak: 0,
    elo: 0, mmr: 0, winStreak: 0, lossStreak: 0, activeAttempt: null,
    stats: { totalShotsFired: 0, levelsCompleted: 0, sRanks: 0, aRanks: 0, bRanks: 0, cRanks: 0, dRanks: 0, recentShots: [], completedPar: 0 },
    rank: {
      tierIndex: 0, // Iron 1
      elo: 0,
      rr: 0,       // 2 RR = 1 ELO
      peakElo: 0,
      peakIndex: 0,
      matchHistory: [] // list of last 8 matches
    },
    levelRecords: {}, roomFailures: {}, seenGuide: false,
    settings: { reducedMotion: false, reducedMotionMode: 'system', aimPreview: true, touchSensitivity: 1, highDpi: true },
  };
  function read(key) {
    try { const raw = storage?.getItem(key); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  }
  const saved = read(KEY);
  const isV3 = object(saved) && saved.version === 3;
  const v2 = isV3 ? null : read('bankshot.db.v2');
  const source = isV3 ? saved : object(v2) && v2.version === 2 ? v2 : null;
  const legacy = source?.legacy ?? read('bankshot.progress.v1');
  if (object(legacy)) data.legacy = legacy;
  const settings = source?.settings ?? legacy?.settings;
  for (const key of ['reducedMotion','aimPreview','highDpi']) if (typeof settings?.[key] === 'boolean') data.settings[key] = settings[key];
  if (Number.isFinite(settings?.touchSensitivity) && settings.touchSensitivity >= 0.5 && settings.touchSensitivity <= 2) data.settings.touchSensitivity = settings.touchSensitivity;
  if (['system','on','off'].includes(settings?.reducedMotionMode)) data.settings.reducedMotionMode = settings.reducedMotionMode;
  else if (settings?.reducedMotion === true) data.settings.reducedMotionMode = 'on';
  if (source) {
    if (validSeed(source.userSeed)) data.userSeed = source.userSeed;
    data.seenGuide = source.seenGuide === true;
    if (object(source.levelRecords)) {
      const indices = Object.keys(source.levelRecords).map(Number).filter(positive).sort((a,b) => a-b);
      for (const index of indices) {
        const record = source.levelRecords[index];
        if (!object(record) || !positive(record.bestShots) || !positive(record.par) || !GRADES.includes(record.rank ?? record.bestRank)) continue;
        data.levelRecords[index] = { bestShots: record.bestShots, rank: record.rank ?? record.bestRank, bestRank: record.rank ?? record.bestRank, clearedAt: count(record.clearedAt), par: record.par, completions: Math.max(1,count(record.completions)) };
      }
      advanceUnlocked();
    }
    data.currentLevel = positive(source.currentLevel) ? Math.min(source.currentLevel,data.maxUnlocked) : 1;
    if (object(source.roomFailures)) for (const [key,value] of Object.entries(source.roomFailures)) {
      if (positive(Number(key)) && Number(key)<=data.maxUnlocked && count(value)) data.roomFailures[key]=count(value);
    }
    data.stats.totalShotsFired = count(source.stats?.totalShotsFired);
    data.stats.completedPar = count(source.stats?.completedPar);
    if (Array.isArray(source.stats?.recentShots)) data.stats.recentShots = source.stats.recentShots.filter(n=>Number.isFinite(n)&&n>0).slice(-10);

    if (isV3) {
      data.elo = count(source.elo ?? source.rank?.elo);
      data.mmr = count(source.mmr);
      data.winStreak = count(source.winStreak);
      data.lossStreak = data.winStreak ? 0 : count(source.lossStreak);
      const info = getRankFromElo(data.elo);
      Object.assign(data.rank,{elo:data.elo,tierIndex:info.tierIndex,rr:info.rr,peakElo:Math.max(data.elo,count(source.rank?.peakElo)),peakIndex:Math.max(info.tierIndex,Math.min(24,count(source.rank?.peakIndex)))});
      if(Array.isArray(source.rank?.matchHistory)) data.rank.matchHistory = source.rank.matchHistory.filter(m=>object(m) && ['win','fail'].includes(m.outcome) && positive(m.room) && typeof m.deltaElo === 'string' && /^[+-]?\d+$/.test(m.deltaElo) && Number.isSafeInteger(Number(m.deltaElo)*2)).slice(0,8).map(m=>({...m,deltaElo:signed(Number(m.deltaElo)),deltaRR:signed(Number(m.deltaElo)*2),delta:signed(Number(m.deltaElo)*2)}));
      if(object(source.activeAttempt) && positive(source.activeAttempt.room) && source.activeAttempt.room <= data.maxUnlocked && positive(source.activeAttempt.shots)) data.activeAttempt={room:source.activeAttempt.room,shots:source.activeAttempt.shots};
    }
  }
  let justPromoted = false;
  let promotedTier = null;
  const convergence = () => clamp(1+(data.mmr-data.elo)/100,0.6,1.4);
  function applyElo(deltaElo, room, outcome, shots, par, roomTime = null) {
    data.rankUpdatedAt = Math.max(Date.now(), (data.rankUpdatedAt ?? 0) + 1);
    const oldElo = data.elo;
    const oldTier = getRankFromElo(oldElo).tierIndex;
    const floor = oldTier*50;
    if(deltaElo > 0) data.elo = Math.min(Number.MAX_SAFE_INTEGER,data.elo+deltaElo);
    else if(deltaElo < 0) data.elo = data.elo > floor ? Math.max(floor,data.elo+deltaElo) : oldTier > 0 ? floor-15 : 0;
    const actual = data.elo-oldElo;
    const info = getRankFromElo(data.elo);
    Object.assign(data.rank,{elo:data.elo,tierIndex:info.tierIndex,rr:info.rr,peakElo:Math.max(data.rank.peakElo,data.elo),peakIndex:Math.max(data.rank.peakIndex,info.tierIndex)});
    justPromoted = info.tierIndex > oldTier;
    promotedTier = justPromoted ? getRankFromIndex(info.tierIndex) : null;
    data.rank.matchHistory.unshift({room,outcome,shots,par,roomTime,delta:signed(actual*2),deltaRR:signed(actual*2),deltaElo:signed(actual),tierIndex:info.tierIndex,elo:data.elo,rr:info.rr,date:Date.now()});
    data.rank.matchHistory = data.rank.matchHistory.slice(0,8);
  }
  function fail(index) {
    data.roomFailures[index]=(data.roomFailures[index]??0)+1;
    data.winStreak=0; data.lossStreak++;
    const multiplier = data.lossStreak===1 ? 1 : data.lossStreak===2 ? 1.15 : 1.35;
    // Inverse convergence makes low hidden MMR penalize losses more heavily.
    const penalty=Math.max(1,Math.round(8*multiplier/convergence()));
    applyElo(-penalty,index,'fail',data.activeAttempt?.room===index ? data.activeAttempt.shots : 0,0);
    // Hidden rating follows unscaled performance rather than visible shield deltas.
    data.mmr=Math.max(0,data.mmr-8);
    if(data.activeAttempt?.room===index) data.activeAttempt=null;
  }

  function refresh() {
    data.currentFailStreak = data.roomFailures[data.currentLevel] ?? 0;
    data.stats.levelsCompleted = Object.keys(data.levelRecords).length;
    for (const grade of GRADES) data.stats[`${grade.toLowerCase()}Ranks`] = 0;
    for (const record of Object.values(data.levelRecords)) data.stats[`${record.bestRank.toLowerCase()}Ranks`]++;
  }
  function advanceUnlocked() {
    while (data.maxUnlocked < Number.MAX_SAFE_INTEGER && data.levelRecords[data.maxUnlocked]) data.maxUnlocked++;
  }
  data.shotCounters = object(source?.shotCounters) ? Object.fromEntries(Object.entries(source.shotCounters).filter(([key,value]) => typeof key === 'string' && count(value) === value)) : { legacy: data.stats.totalShotsFired };
  let lastSnapshot = '';
  function mergeProgress(remote, settings = false) {
    if (!object(remote) || remote.version !== 3 || remote.userSeed !== data.userSeed) return;
    for (const [key, record] of Object.entries(remote.levelRecords ?? {})) {
      if (!positive(+key) || !object(record) || !positive(record.bestShots) || !positive(record.par) || !GRADES.includes(record.bestRank ?? record.rank)) continue;
      const previous = data.levelRecords[key];
      const bestRank = record.bestRank ?? record.rank;
      if (!previous) data.levelRecords[key] = { ...record, bestRank, rank: bestRank, completions: Math.max(1,count(record.completions)) };
      else {
        previous.bestShots = Math.min(previous.bestShots, record.bestShots);
        if (GRADES.indexOf(bestRank) < GRADES.indexOf(previous.bestRank)) previous.rank = previous.bestRank = bestRank;
        previous.completions = Math.max(previous.completions, count(record.completions));
      }
    }
    if (object(remote.shotCounters)) {
      for (const [key, value] of Object.entries(remote.shotCounters)) if (count(value) === value) data.shotCounters[key] = Math.max(data.shotCounters[key] ?? 0, value);
    } else data.shotCounters.legacy = Math.max(data.shotCounters.legacy ?? 0, count(remote.stats?.totalShotsFired));
    if (count(remote.rankUpdatedAt) > (data.rankUpdatedAt ?? 0)) {
      data.rankUpdatedAt = remote.rankUpdatedAt;
      data.elo = count(remote.elo); data.mmr = count(remote.mmr);
      data.winStreak = count(remote.winStreak); data.lossStreak = count(remote.lossStreak);
      const info = getRankFromElo(data.elo);
      Object.assign(data.rank, {elo:data.elo,tierIndex:info.tierIndex,rr:info.rr,peakElo:Math.max(data.rank.peakElo,count(remote.rank?.peakElo)),peakIndex:Math.max(data.rank.peakIndex,count(remote.rank?.peakIndex))});
      if (Array.isArray(remote.rank?.matchHistory)) data.rank.matchHistory = remote.rank.matchHistory.filter(m=>object(m)&&['win','fail'].includes(m.outcome)&&positive(m.room)&&typeof m.deltaElo==='string'&&/^[+-]?\d+$/.test(m.deltaElo)).slice(0,8);
    }
    data.stats.totalShotsFired = Object.values(data.shotCounters).reduce((sum, value) => sum + value, 0);
    if (settings && object(remote.settings)) {
      for (const key of ['aimPreview','highDpi','reducedMotion']) if (typeof remote.settings[key] === 'boolean') data.settings[key] = remote.settings[key];
      if (['system','on','off'].includes(remote.settings.reducedMotionMode)) data.settings.reducedMotionMode = remote.settings.reducedMotionMode;
      if (remote.settings.touchSensitivity >= 0.5 && remote.settings.touchSensitivity <= 2) data.settings.touchSensitivity = remote.settings.touchSensitivity;
    }
    advanceUnlocked(); refresh();
  }
  function sync() {
    const remote = read(KEY);
    const before = JSON.stringify(data);
    mergeProgress(remote, true);
    if (before !== JSON.stringify(data)) for (const listener of subscribers) listener(data);
    return true;
  }
  function save() {
    mergeProgress(read(KEY));
    try { lastSnapshot = JSON.stringify(data); storage.setItem(KEY, lastSnapshot); available = true; return true; }
    catch { available = false; return false; }
  }
  const canPlay = index => positive(index) && index <= data.maxUnlocked;
  // A reload or browser shutdown is not an explicit failed attempt. The world
  // restarts on load, but recorded shots and earned rating remain intact.
  data.activeAttempt = null;
  refresh(); save();
  const onStorage = event => { if (event.key === KEY && event.newValue !== lastSnapshot && (!event.storageArea || event.storageArea === storage)) sync(); };
  globalThis.window?.addEventListener?.('storage', onStorage);
  return {
    data,
    get available() { return available; },
    save, canPlay, sync,
    importProfileCampaign(campaign) {
      if (!object(campaign) || !validSeed(campaign.userSeed)) return false;
      const before = JSON.stringify(data);
      const seedChanged = campaign.userSeed !== data.userSeed;
      const newerRating = count(campaign.rankUpdatedAt) > count(data.rankUpdatedAt);
      data.userSeed = campaign.userSeed;
      mergeProgress({ ...campaign, version: 3 });
      data.stats.completedPar = Math.max(data.stats.completedPar, count(campaign.stats?.completedPar));
      if ((newerRating || seedChanged) && Array.isArray(campaign.stats?.recentShots)) {
        data.stats.recentShots = campaign.stats.recentShots.filter(n => Number.isFinite(n) && n > 0).slice(-10);
      }
      const peak = Math.max(data.rank.peakElo, count(campaign.rank?.peakElo));
      data.rank.peakElo = peak;
      data.rank.peakIndex = getRankFromElo(peak).tierIndex;
      if (seedChanged && canPlay(campaign.currentLevel)) data.currentLevel = campaign.currentLevel;
      if (before !== JSON.stringify(data)) {
        refresh(); save();
        for (const listener of subscribers) listener(data);
      }
      return true;
    },
    subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); },
    destroy() { subscribers.clear(); globalThis.window?.removeEventListener?.('storage', onStorage); },
    unlocked: () => data.maxUnlocked,
    select(index) { if (!canPlay(index)) return false; data.currentLevel = index; refresh(); save(); return true; },
    calculateBudget(index, par) { return calculateTriesBudget(par, data.stats.recentShots, data.roomFailures[index] ?? 0); },
    recordShot() {
      data.shotCounters[writer] = (data.shotCounters[writer] ?? 0) + 1;
      data.stats.totalShotsFired++;
      if(data.activeAttempt && data.activeAttempt.room !== data.currentLevel) fail(data.activeAttempt.room);
      data.activeAttempt = {room:data.currentLevel,shots:(data.activeAttempt?.shots??0)+1};
      save();
    },
    recordFailure(index = data.currentLevel) {
      sync();
      if (!canPlay(index)) return false;
      fail(index);
      refresh(); save(); return true;
    },
    recordSuccess(level, shots, triesUsed = shots, maxTries, roomTime = Infinity, isFirstAttempt = true) {
      sync();
      const index = typeof level === 'number' ? level : level?.id;
      const par = typeof level === 'number' ? (data.levelRecords[index]?.par ?? 1) : level?.par;
      if (!canPlay(index) || !positive(par) || !positive(shots) || !positive(triesUsed)) return false;
      const grade = calculateRank(shots, par);
      const previous = data.levelRecords[index];
      const firstAttempt = isFirstAttempt === true && !(data.roomFailures[index] > 0);
      data.levelRecords[index] = { bestShots: Math.min(previous?.bestShots ?? Infinity, shots), bestRank: previous && GRADES.indexOf(previous.bestRank)<GRADES.indexOf(grade) ? previous.bestRank : grade, par, completions: (previous?.completions ?? 0)+1 };
      data.stats.recentShots.push(shots/par); data.stats.recentShots = data.stats.recentShots.slice(-10);
      data.stats.completedPar += par;
      delete data.roomFailures[index];
      data.levelRecords[index].rank = data.levelRecords[index].bestRank;
      data.levelRecords[index].clearedAt = Date.now();
      data.maxUnlocked = Math.max(data.maxUnlocked, Math.min(Number.MAX_SAFE_INTEGER,index+1));
      advanceUnlocked();
      data.currentLevel = Math.min(Number.MAX_SAFE_INTEGER,index+1);
      
      const base = {S:9,A:6,B:4,C:2,D:1}[grade];
      const speed = Number.isFinite(roomTime) && roomTime>=0 ? roomTime<6 ? 2 : roomTime<12 ? 1 : 0 : 0;
      const performance=base+speed+(firstAttempt ? 2 : 0);
      data.winStreak++; data.lossStreak=0;
      const streak = data.winStreak===1 ? 1 : data.winStreak===2 ? 1.1 : data.winStreak===3 ? 1.25 : 1.4;
      const difficulty=clamp(0.85+index/100*0.45,0.85,1.3);
      const gain=Math.max(1,Math.round(performance*difficulty*streak*convergence()));
      applyElo(gain,index,'win',shots,par,Number.isFinite(roomTime)&&roomTime>=0 ? roomTime : null);
      data.mmr=Math.min(Number.MAX_SAFE_INTEGER,data.mmr+performance);
      if(data.activeAttempt?.room===index) data.activeAttempt=null;

      refresh(); save(); return grade;
    },
    setSetting(key,value) {
      const valid = ['aimPreview','highDpi','reducedMotion'].includes(key) ? typeof value === 'boolean' : key === 'touchSensitivity' ? Number.isFinite(value)&&value>=0.5&&value<=2 : key === 'reducedMotionMode' ? ['system','on','off'].includes(value) : false;
      if(!valid) return false;
      data.settings[key]=value;
      if(key==='reducedMotion') data.settings.reducedMotionMode=value?'on':'off';
      if(key==='reducedMotionMode') data.settings.reducedMotion=value==='on';
      save(); return true;
    },
    toggle(key) { if(typeof data.settings[key] !== 'boolean') return false; return this.setSetting(key,!data.settings[key]); },
    markGuideSeen() { data.seenGuide = true; save(); },
    getPerformanceRatio() {
      const { recentShots } = data.stats;
      return recentShots.length ? recentShots.reduce((a, b) => a + b, 0) / recentShots.length : 1.25;
    },
    getRankInfo() {
      const info = getRankFromElo(data.elo);
      const peak = getRankFromIndex(data.rank.peakIndex);
      return {
        ...info,
        mmr: data.mmr, winStreak: data.winStreak, lossStreak: data.lossStreak,
        justPromoted, promotedTier,
        deltaElo: Number(data.rank.matchHistory[0]?.deltaElo ?? 0),
        deltaRR: Number(data.rank.matchHistory[0]?.deltaRR ?? 0),
        lastDeltaElo: Number(data.rank.matchHistory[0]?.deltaElo ?? 0),
        lastDeltaRR: Number(data.rank.matchHistory[0]?.deltaRR ?? 0),
        elo: data.elo,
        peakElo: data.rank.peakElo ?? data.elo,
        peakLabel: peak.label,
        peakColor: peak.color,
        matchHistory: [...data.rank.matchHistory]
      };
    },
    getStats() {
      const { totalShotsFired, completedPar, recentShots } = data.stats;
      const rankInfo = this.getRankInfo();
      return {
        ...data.stats,
        recentShots: [...recentShots],
        accuracy: totalShotsFired ? Math.min(100, 100 * completedPar / totalShotsFired) : 0,
        averageRatio: recentShots.length ? recentShots.reduce((a,b)=>a+b,0)/recentShots.length : 1.25,
        totalRoomsPlayed: new Set([...Object.keys(data.levelRecords),...Object.keys(data.roomFailures)]).size,
        elo: data.elo,
        rankInfo
      };
    },
  };
}
export function safeStore() { return createStore(); }
