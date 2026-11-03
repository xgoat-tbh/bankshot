import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { validProfileId, formatAgentToken, sanitizeCampaignSnapshot, mergeCampaignSnapshots } from '../src/profile.js';

let DatabaseSync = null;
try {
  const sqlite = await import('node:sqlite');
  DatabaseSync = sqlite.DatabaseSync;
} catch { /* Running on an environment without node:sqlite */ }

const copy = value => JSON.parse(JSON.stringify(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = message => Object.assign(new Error(message), { statusCode: 400 });
function identity(id) { if (!validProfileId(id)) throw invalid('Invalid full profile identity'); return id; }
function blank(id) { return { id, agentToken: formatAgentToken(id), callsign: '', online: { elo: 1000, wins: 0, losses: 0, races: 0 }, campaign: sanitizeCampaignSnapshot() }; }

export function createProfileStore({ filePath = null, maxProfiles = 100000, sqlite = false } = {}) {
  let profiles = new Map(), outcomes = new Set();
  const filename = filePath ? resolve(filePath) : null;
  const useSqlite = Boolean(DatabaseSync && filename && (filename.endsWith('.db') || filename.endsWith('.sqlite') || sqlite || process.env.BANKSHOT_USE_SQLITE === 'true'));
  const sqlitePath = useSqlite ? (filename.endsWith('.json') ? `${filename}.db` : filename) : null;
  let db = null;

  if (sqlitePath && DatabaseSync) {
    try {
      mkdirSync(dirname(sqlitePath), { recursive: true });
      db = new DatabaseSync(sqlitePath);
      db.exec('PRAGMA journal_mode = WAL;');
      db.exec('PRAGMA synchronous = NORMAL;');
      db.exec(`
        CREATE TABLE IF NOT EXISTS profiles (
          id TEXT PRIMARY KEY,
          agent_token TEXT,
          callsign TEXT,
          elo INTEGER NOT NULL,
          wins INTEGER NOT NULL,
          losses INTEGER NOT NULL,
          races INTEGER NOT NULL,
          campaign TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_profiles_elo ON profiles(elo DESC);
        CREATE TABLE IF NOT EXISTS race_outcomes (
          race_id TEXT PRIMARY KEY,
          recorded_at INTEGER NOT NULL,
          winner_id TEXT,
          placements TEXT
        );
      `);
      const rows = db.prepare('SELECT * FROM profiles').all();
      for (const row of rows) {
        try {
          const id = identity(row.id);
          profiles.set(id, {
            id,
            agentToken: row.agent_token || formatAgentToken(id),
            callsign: row.callsign || '',
            online: { elo: row.elo, wins: row.wins, losses: row.losses, races: row.races },
            campaign: sanitizeCampaignSnapshot(JSON.parse(row.campaign || '{}'))
          });
        } catch { /* Skip invalid record */ }
      }
      const outcomeRows = db.prepare('SELECT race_id FROM race_outcomes').all();
      for (const row of outcomeRows) outcomes.add(row.race_id);
    } catch (error) {
      console.warn('SQLite storage initialization fallback:', error.message);
      db = null;
    }
  }

  // Load existing JSON if available or if SQLite had no records
  if (filename && filename.endsWith('.json') && existsSync(filename) && (!db || profiles.size === 0)) {
    try {
      const saved = JSON.parse(readFileSync(filename, 'utf8'));
      if (saved.version === 1 && object(saved.profiles) && Array.isArray(saved.outcomes)) {
        for (const [id, profile] of Object.entries(saved.profiles)) {
          identity(id);
          if (!object(profile.online) || !['elo', 'wins', 'losses', 'races'].every(key => Number.isSafeInteger(profile.online[key]) && profile.online[key] >= 0)) throw new Error('Invalid persisted profile rating');
          const entry = { ...blank(id), callsign: typeof profile.callsign === 'string' ? profile.callsign.slice(0, 24) : '', online: { elo: profile.online.elo, wins: profile.online.wins, losses: profile.online.losses, races: profile.online.races }, campaign: sanitizeCampaignSnapshot(profile.campaign) };
          profiles.set(id, entry);
          if (db) {
            try {
              db.prepare('INSERT OR REPLACE INTO profiles (id, agent_token, callsign, elo, wins, losses, races, campaign, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
                id, entry.agentToken, entry.callsign, entry.online.elo, entry.online.wins, entry.online.losses, entry.online.races, JSON.stringify(entry.campaign), Date.now()
              );
            } catch { /* Skip */ }
          }
        }
        for (const outcome of saved.outcomes.filter(v => typeof v === 'string' && v.length <= 160)) {
          outcomes.add(outcome);
          if (db) {
            try { db.prepare('INSERT OR IGNORE INTO race_outcomes (race_id, recorded_at) VALUES (?, ?)').run(outcome, Date.now()); }
            catch { /* Skip */ }
          }
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  function commit(nextProfiles, nextOutcomes = outcomes) {
    if (db) {
      try {
        const insertProfile = db.prepare('INSERT OR REPLACE INTO profiles (id, agent_token, callsign, elo, wins, losses, races, campaign, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const insertOutcome = db.prepare('INSERT OR IGNORE INTO race_outcomes (race_id, recorded_at, winner_id, placements) VALUES (?, ?, ?, ?)');
        db.exec('BEGIN IMMEDIATE;');
        for (const [id, p] of nextProfiles) {
          const current = profiles.get(id);
          if (!current || JSON.stringify(current) !== JSON.stringify(p)) {
            insertProfile.run(id, p.agentToken, p.callsign, p.online.elo, p.online.wins, p.online.losses, p.online.races, JSON.stringify(p.campaign), Date.now());
          }
        }
        for (const outcome of nextOutcomes) {
          if (!outcomes.has(outcome)) insertOutcome.run(outcome, Date.now(), null, null);
        }
        db.exec('COMMIT;');
      } catch (error) {
        try { db.exec('ROLLBACK;'); } catch { /* Ignore */ }
        console.warn('SQLite commit warning:', error.message);
      }
    }
    if (filename && (!sqlitePath || filename !== sqlitePath)) {
      mkdirSync(dirname(filename), { recursive: true });
      const temporary = `${filename}.${process.pid}.tmp`;
      writeFileSync(temporary, JSON.stringify({ version: 1, profiles: Object.fromEntries(nextProfiles), outcomes: [...nextOutcomes] }), { mode: 0o600 });
      renameSync(temporary, filename);
    }
    profiles = nextProfiles; outcomes = nextOutcomes;
  }

  function capacity(next) { if (next.size > maxProfiles) throw Object.assign(new Error('Profile capacity reached'), { statusCode: 503 }); }

  return {
    get(id) { identity(id); const profile = profiles.get(id); return profile ? copy(profile) : null; },
    getLeaderboard(limit = 100) {
      if (db) {
        try {
          const rows = db.prepare('SELECT id, agent_token, callsign, elo, wins, losses, races FROM profiles ORDER BY elo DESC LIMIT ?').all(Math.min(1000, limit));
          return rows.map(r => ({ id: r.id, agentToken: r.agent_token, callsign: r.callsign, elo: r.elo, wins: r.wins, losses: r.losses, races: r.races }));
        } catch { /* Fallback to map */ }
      }
      return [...profiles.values()].sort((a, b) => b.online.elo - a.online.elo).slice(0, limit).map(p => ({ id: p.id, agentToken: p.agentToken, callsign: p.callsign, elo: p.online.elo, wins: p.online.wins, losses: p.online.losses, races: p.online.races }));
    },
    sync(request) {
      if (!object(request)) throw invalid('Invalid profile request');
      if (Object.keys(request).some(key => !['id', 'callsign', 'campaign'].includes(key))) throw invalid('Unknown profile field; online rating is server controlled');
      const id = identity(request.id);
      if (request.callsign !== undefined && (typeof request.callsign !== 'string' || !request.callsign.trim() || request.callsign.trim().length > 24 || /[\u0000-\u001f\u007f]/.test(request.callsign))) throw invalid('Callsign must contain 1–24 printable characters');
      let incoming;
      try { if (request.campaign !== undefined) incoming = sanitizeCampaignSnapshot(request.campaign); }
      catch (error) { throw invalid(error.message); }
      const profile = copy(profiles.get(id) ?? blank(id));
      if (request.callsign !== undefined) profile.callsign = request.callsign.trim();
      if (incoming) profile.campaign = mergeCampaignSnapshots(profile.campaign, incoming);
      const next = new Map(profiles); next.set(id, profile); capacity(next);
      if (JSON.stringify(profiles.get(id)) !== JSON.stringify(profile)) commit(next);
      return copy(profile);
    },
    recordRace({ raceId, winnerId, participantIds, placements } = {}) {
      if (typeof raceId !== 'string' || !/^[a-zA-Z0-9:_-]{1,160}$/.test(raceId)) throw invalid('Invalid race identity');
      if (!Array.isArray(participantIds) || participantIds.length < 2 || participantIds.length > 8 || participantIds.some(id => !validProfileId(id)) || new Set(participantIds).size !== participantIds.length) throw invalid('Race participants must have unique valid identities');
      if (!participantIds.includes(winnerId)) throw invalid('Winner must be a race participant');
      if (placements !== undefined && (!Array.isArray(placements) || placements.length !== participantIds.length || new Set(placements).size !== participantIds.length || placements[0] !== winnerId || placements.some(id => !participantIds.includes(id)))) throw invalid('Invalid race placements');
      if (outcomes.has(raceId)) return participantIds.map(id => this.get(id));
      const old = participantIds.map(id => profiles.get(id) ?? blank(id));
      const next = new Map(profiles);
      for (const profile of old) {
        let delta = 0;
        for (const opponent of old) {
          if (opponent.id === profile.id) continue;
          const score = placements ? Number(placements.indexOf(profile.id) < placements.indexOf(opponent.id)) : profile.id === winnerId ? 1 : opponent.id === winnerId ? 0 : 0.5;
          const expected = 1 / (1 + 10 ** ((opponent.online.elo - profile.online.elo) / 400));
          delta += 16 * (score - expected) / (old.length - 1);
        }
        next.set(profile.id, { ...copy(profile), online: {
          elo: Math.max(0, profile.online.elo + Math.round(delta)),
          wins: profile.online.wins + Number(profile.id === winnerId),
          losses: profile.online.losses + Number(profile.id !== winnerId), races: profile.online.races + 1,
        } });
      }
      capacity(next);
      const nextOutcomes = new Set(outcomes); nextOutcomes.add(raceId);
      commit(next, nextOutcomes);
      return participantIds.map(id => this.get(id));
    },
    close() {
      if (db) {
        try {
          db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
          db.close();
        } catch { /* Ignore */ }
        db = null;
      }
    },
  };
}
