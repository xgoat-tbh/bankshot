import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { validProfileId, formatAgentToken, sanitizeCampaignSnapshot, mergeCampaignSnapshots } from '../src/profile.js';

const copy = value => JSON.parse(JSON.stringify(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = message => Object.assign(new Error(message), { statusCode: 400 });
function identity(id) { if (!validProfileId(id)) throw invalid('Invalid full profile identity'); return id; }
function blank(id) { return { id, agentToken: formatAgentToken(id), callsign: '', online: { elo: 1000, wins: 0, losses: 0, races: 0 }, campaign: sanitizeCampaignSnapshot() }; }

// Single-process relay store. Atomic replacement prevents partially written files.
// Deploy with a persistent disk; multiple relay instances need a shared database.
export function createProfileStore({ filePath = null, maxProfiles = 100000 } = {}) {
  let profiles = new Map(), outcomes = new Set();
  const filename = filePath ? resolve(filePath) : null;
  if (filename) {
    try {
      const saved = JSON.parse(readFileSync(filename, 'utf8'));
      if (saved.version !== 1 || !object(saved.profiles) || !Array.isArray(saved.outcomes)) throw new Error('Invalid profile database');
      for (const [id, profile] of Object.entries(saved.profiles)) {
        identity(id);
        if (!object(profile.online) || !['elo', 'wins', 'losses', 'races'].every(key => Number.isSafeInteger(profile.online[key]) && profile.online[key] >= 0)) throw new Error('Invalid persisted profile rating');
        profiles.set(id, { ...blank(id), callsign: typeof profile.callsign === 'string' ? profile.callsign.slice(0, 24) : '', online: { elo: profile.online.elo, wins: profile.online.wins, losses: profile.online.losses, races: profile.online.races }, campaign: sanitizeCampaignSnapshot(profile.campaign) });
      }
      outcomes = new Set(saved.outcomes.filter(value => typeof value === 'string' && value.length <= 160));
    } catch (error) {
      // Fail closed for damaged files instead of silently overwriting earned stats.
      if (error.code !== 'ENOENT') throw error;
    }
  }
  function commit(nextProfiles, nextOutcomes = outcomes) {
    if (filename) {
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
      // Reads/repeated syncs do not rewrite the database on every page open.
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
    close() { /* Every mutation is already persisted. */ },
  };
}
