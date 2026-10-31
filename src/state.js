const KEY = 'bankshot.db.v2';
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
};

const positive = n => Number.isSafeInteger(n) && n > 0;
const count = n => Number.isSafeInteger(n) && n >= 0 ? n : 0;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const uuid = () => globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const n = Math.random() * 16 | 0; return (c === 'x' ? n : (n & 3) | 8).toString(16); });

export function getRankFromIndex(index) {
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
export function getRankFromElo(elo) {
  elo = Math.max(0, Math.floor(count(elo)));
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

export function calculateRank(shots, par, triesUsed = shots, maxTries = Infinity, failStreak = 0) {
  if (shots <= par) return 'S';
  if (shots <= par + 1) return 'A';
  if (shots <= par + 2) return 'B';
  return triesUsed >= maxTries || failStreak > 0 ? 'D' : 'C';
}
export const rank = calculateRank;

export function createStore(storage) {
  let available = true;
  if (arguments.length === 0) {
    try { storage = globalThis.localStorage; } catch { available = false; }
  }
  const data = {
    version: 2, userSeed: uuid(), currentLevel: 1, maxUnlocked: 1, currentFailStreak: 0,
    elo: 25,
    stats: { totalShotsFired: 0, levelsCompleted: 0, sRanks: 0, aRanks: 0, bRanks: 0, cRanks: 0, dRanks: 0, recentShots: [], completedPar: 0 },
    rank: {
      tierIndex: 0, // Iron 1
      elo: 25,
      rr: 50,       // 2 RR = 1 ELO (25 ELO = 50 RR)
      peakElo: 25,
      peakIndex: 0,
      matchHistory: [] // list of last 8 matches
    },
    levelRecords: {}, roomFailures: {}, seenGuide: false,
    settings: { reducedMotion: false, aimPreview: true },
  };
  function read(key) {
    try { const raw = storage?.getItem(key); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  }
  const saved = read(KEY);
  const source = object(saved) && saved.version === 2 ? saved : null;
  const legacy = source?.legacy ?? read('bankshot.progress.v1');
  if (object(legacy)) data.legacy = legacy;
  const settings = source?.settings ?? legacy?.settings;
  for (const key of Object.keys(data.settings)) if (typeof settings?.[key] === 'boolean') data.settings[key] = settings[key];
  if (source) {
    if (typeof source.userSeed === 'string' && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(source.userSeed)) data.userSeed = source.userSeed;
    data.seenGuide = source.seenGuide === true;
    if (object(source.levelRecords)) {
      const indices = Object.keys(source.levelRecords).map(Number).filter(positive).sort((a,b) => a-b);
      for (const index of indices) {
        if (index !== data.maxUnlocked) break;
        const record = source.levelRecords[index];
        if (!object(record) || !positive(record.bestShots) || !positive(record.par) || !GRADES.includes(record.rank ?? record.bestRank)) break;
        data.levelRecords[index] = { bestShots: record.bestShots, rank: record.rank ?? record.bestRank, bestRank: record.rank ?? record.bestRank, clearedAt: count(record.clearedAt), par: record.par, completions: Math.max(1,count(record.completions)) };
        data.maxUnlocked = Math.min(Number.MAX_SAFE_INTEGER, index + 1);
      }
    }
    data.currentLevel = positive(source.currentLevel) ? Math.min(source.currentLevel,data.maxUnlocked) : 1;
    if (object(source.roomFailures)) for (const [key,value] of Object.entries(source.roomFailures)) {
      if (positive(Number(key)) && Number(key)<=data.maxUnlocked && count(value)) data.roomFailures[key]=count(value);
    }
    data.stats.totalShotsFired = count(source.stats?.totalShotsFired);
    data.stats.completedPar = count(source.stats?.completedPar);
    if (Array.isArray(source.stats?.recentShots)) data.stats.recentShots = source.stats.recentShots.filter(n=>Number.isFinite(n)&&n>0).slice(-10);

    // ELO and Rank Loading / Retroactive Migration
    const sourceElo = source.elo ?? source.rank?.elo;
    if (typeof sourceElo === 'number' && Number.isFinite(sourceElo)) {
      data.elo = Math.max(0, Math.floor(sourceElo));
    } else if (object(source.levelRecords) && Object.keys(source.levelRecords).length > 0) {
      // Retroactive migration: player cleared rooms without ELO in database
      let migratedElo = 25;
      for (const record of Object.values(source.levelRecords)) {
        const s = positive(record.bestShots) ? record.bestShots : 1;
        const p = positive(record.par) ? record.par : 1;
        const gain = (s < p ? 15 : s === p ? 11 : 8) + 5;
        migratedElo += gain;
      }
      data.elo = migratedElo;
    } else if (source.rank && typeof source.rank.tierIndex === 'number') {
      data.elo = (count(source.rank.tierIndex) * 50) + Math.floor(count(source.rank.rr) / 2);
    }
    const rankCalc = getRankFromElo(data.elo);
    data.rank.elo = data.elo;
    data.rank.tierIndex = rankCalc.tierIndex;
    data.rank.rr = rankCalc.rr;
    data.rank.peakElo = Math.max(data.elo, count(source.rank?.peakElo));
    data.rank.peakIndex = Math.max(rankCalc.tierIndex, count(source.rank?.peakIndex));

    if (Array.isArray(source.rank?.matchHistory)) {
      data.rank.matchHistory = source.rank.matchHistory.slice(-8).map(m => {
        if (!m || typeof m !== 'object') return m;
        const delta = typeof m.delta === 'string' ? m.delta : '+0';
        const rawNum = parseInt(delta, 10);
        const eloVal = Number.isFinite(rawNum) ? Math.round(rawNum / 2) : 0;
        const deltaRR = typeof m.deltaRR === 'string' ? m.deltaRR : delta;
        const deltaElo = typeof m.deltaElo === 'string' ? m.deltaElo : `${eloVal > 0 ? '+' : ''}${eloVal}`;
        return {
          ...m,
          delta: deltaRR,
          deltaRR,
          deltaElo
        };
      });
    }
  }

  function applyElo(deltaElo, room, outcome, shots, par) {
    const currentTier = Math.min(24, Math.floor(data.elo / 50));
    const tierFloorElo = currentTier * 50;

    if (deltaElo > 0) {
      data.elo += deltaElo;
    } else if (deltaElo < 0) {
      if (data.elo > tierFloorElo) {
        // Demotion protection at division floor
        data.elo = Math.max(tierFloorElo, data.elo + deltaElo);
      } else if (currentTier > 0) {
        // Demote to previous tier with landing buffer
        data.elo = Math.max(0, tierFloorElo - 12);
      } else {
        data.elo = Math.max(0, data.elo + deltaElo);
      }
    }

    const rank = getRankFromElo(data.elo);
    data.rank.elo = data.elo;
    data.rank.tierIndex = rank.tierIndex;
    data.rank.rr = rank.rr;
    data.rank.peakElo = Math.max(data.rank.peakElo ?? 0, data.elo);
    data.rank.peakIndex = Math.max(data.rank.peakIndex ?? 0, rank.tierIndex);

    const deltaRR = deltaElo * 2;
    data.rank.matchHistory.unshift({
      room,
      delta: deltaRR > 0 ? `+${deltaRR}` : `${deltaRR}`,
      deltaRR: deltaRR > 0 ? `+${deltaRR}` : `${deltaRR}`,
      deltaElo: deltaElo > 0 ? `+${deltaElo}` : `${deltaElo}`,
      outcome,
      shots,
      par,
      tierIndex: rank.tierIndex,
      elo: data.elo,
      rr: rank.rr,
      date: Date.now()
    });
    data.rank.matchHistory = data.rank.matchHistory.slice(0, 8);
  }

  function refresh() {
    data.currentFailStreak = data.roomFailures[data.currentLevel] ?? 0;
    data.stats.levelsCompleted = Object.keys(data.levelRecords).length;
    for (const grade of GRADES) data.stats[`${grade.toLowerCase()}Ranks`] = 0;
    for (const record of Object.values(data.levelRecords)) data.stats[`${record.bestRank.toLowerCase()}Ranks`]++;
  }
  function save() {
    try { storage.setItem(KEY, JSON.stringify(data)); available = true; return true; }
    catch { available = false; return false; }
  }
  const canPlay = index => positive(index) && index <= data.maxUnlocked;
  refresh(); save();
  return {
    data,
    get available() { return available; },
    save, canPlay,
    unlocked: () => data.maxUnlocked,
    select(index) { if (!canPlay(index)) return false; data.currentLevel = index; refresh(); save(); return true; },
    calculateBudget(index, par) { return calculateTriesBudget(par, data.stats.recentShots, data.roomFailures[index] ?? 0); },
    recordShot() { data.stats.totalShotsFired++; save(); },
    recordFailure(index = data.currentLevel) {
      if (!canPlay(index)) return false;
      data.roomFailures[index] = (data.roomFailures[index] ?? 0) + 1;
      // Budget exhaustion failure: -7 ELO = -14 RR
      applyElo(-7, index, 'fail', 0, 0);
      refresh(); save(); return true;
    },
    recordSuccess(level, shots, triesUsed = shots, maxTries) {
      const index = typeof level === 'number' ? level : level?.id;
      const par = typeof level === 'number' ? (data.levelRecords[index]?.par ?? 1) : level?.par;
      if (!canPlay(index) || !positive(par) || !positive(shots) || !positive(triesUsed)) return false;
      const grade = calculateRank(shots, par, triesUsed, maxTries ?? calculateTriesBudget(par,data.stats.recentShots,data.roomFailures[index]), data.roomFailures[index] ?? 0);
      const previous = data.levelRecords[index];
      const isFirstClear = !previous;
      data.levelRecords[index] = { bestShots: Math.min(previous?.bestShots ?? Infinity, shots), bestRank: previous && GRADES.indexOf(previous.bestRank)<GRADES.indexOf(grade) ? previous.bestRank : grade, par, completions: (previous?.completions ?? 0)+1 };
      data.stats.recentShots.push(shots/par); data.stats.recentShots = data.stats.recentShots.slice(-10);
      data.stats.completedPar += par;
      delete data.roomFailures[index];
      data.levelRecords[index].rank = data.levelRecords[index].bestRank;
      data.levelRecords[index].clearedAt = Date.now();
      data.maxUnlocked = Math.max(data.maxUnlocked, Math.min(Number.MAX_SAFE_INTEGER,index+1));
      data.currentLevel = Math.min(Number.MAX_SAFE_INTEGER,index+1);
      
      // Calculate Valorant ELO Gain: 2 RR = 1 ELO
      // Under par: +15 ELO (+30 RR)
      // On par: +11 ELO (+22 RR)
      // Over par: +8 ELO (+16 RR)
      // First-time clear bonus: +5 ELO (+10 RR)
      const baseElo = shots < par ? 15 : shots === par ? 11 : 8;
      const firstClearBonus = isFirstClear ? 5 : 0;
      const deltaElo = baseElo + firstClearBonus;
      applyElo(deltaElo, index, 'win', shots, par);

      refresh(); save(); return grade;
    },
    toggle(key) { if (!Object.hasOwn(data.settings,key)) return false; data.settings[key] = !data.settings[key]; save(); return true; },
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
