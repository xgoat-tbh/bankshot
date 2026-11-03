// Browser-derived continuity, not authentication or proof of a physical device.
// Privacy settings, browser updates and similar machines can change/share a digest.
export const PROFILE_STORAGE_KEY = 'bankshot.profile.v1';
const ID_PATTERN = /^[a-f0-9]{64}$/;
const GRADES = ['S', 'A', 'B', 'C', 'D'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = value => Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 1_000_000_000) : 0;
const clone = value => JSON.parse(JSON.stringify(value));

export function validProfileId(value) { return typeof value === 'string' && ID_PATTERN.test(value); }
export function formatAgentToken(id) { return validProfileId(id) ? `AGENT #${id.slice(0, 4).toUpperCase()}-${id.slice(4, 8).toUpperCase()}` : 'AGENT #---- ----'; }

// A real SHA-256 fallback keeps HTTP development and restricted WebCrypto usable.
// This digest is an identifier, never a password or an authentication credential.
export async function sha256(value, cryptoImpl = globalThis.crypto) {
  const bytes = new TextEncoder().encode(value);
  try {
    if (cryptoImpl?.subtle) {
      const digest = await cryptoImpl.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
    }
  } catch { /* Some privacy modes disable SubtleCrypto. */ }
  const constants = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes); padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bytes.length / 0x20000000));
  view.setUint32(padded.length - 4, (bytes.length * 8) >>> 0);
  const words = new Uint32Array(64);
  const rotate = (x, n) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = words[i - 15], y = words[i - 2];
      words[i] = words[i - 16] + (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) + words[i - 7] + (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10));
    }
    let [a,b,c,d,e,f,g,k] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (k + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + constants[i] + words[i]) | 0;
      const t2 = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      k=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    [a,b,c,d,e,f,g,k].forEach((value, i) => { h[i] = (h[i] + value) >>> 0; });
  }
  return h.map(value => value.toString(16).padStart(8, '0')).join('');
}

async function audioFeature(environment) {
  let timer;
  try {
    const OfflineAudio = environment.OfflineAudioContext ?? environment.webkitOfflineAudioContext;
    if (!OfflineAudio) return 'unavailable';
    const context = new OfflineAudio(1, 4096, 44100);
    const oscillator = context.createOscillator();
    const compressor = context.createDynamicsCompressor();
    oscillator.type = 'triangle'; oscillator.frequency.value = 1000;
    compressor.threshold.value = -50; compressor.knee.value = 40; compressor.ratio.value = 12;
    compressor.attack.value = 0; compressor.release.value = 0.25;
    oscillator.connect(compressor); compressor.connect(context.destination); oscillator.start(0);
    const buffer = await Promise.race([
      context.startRendering(),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), 1000); }),
    ]);
    if (!buffer) return 'unavailable';
    const samples = buffer.getChannelData(0);
    return sha256(Array.from(samples, value => Math.round(value * 1e7)).join(','));
  } catch { return 'unavailable'; }
  finally { clearTimeout(timer); }
}

export async function collectHardwareFeatures(environment = globalThis) {
  let canvas = 'unavailable', webgl = 'unavailable';
  try {
    const surface = environment.document.createElement('canvas');
    surface.width = 240; surface.height = 80;
    const context = surface.getContext('2d');
    context.fillStyle = '#18242b'; context.fillRect(0, 0, 240, 80);
    context.fillStyle = '#ff6b3d'; context.font = '17px sans-serif';
    context.fillText('Bankshot / Agent 1.0', 8, 25);
    context.strokeStyle = '#00e5ff'; context.lineWidth = 1.25;
    context.beginPath(); context.moveTo(3, 62); context.bezierCurveTo(30, 11, 160, 95, 235, 37); context.stroke();
    canvas = await sha256(surface.toDataURL());
  } catch { /* No canvas permission or no document. */ }
  try {
    const surface = environment.document.createElement('canvas');
    const context = surface.getContext('webgl') ?? surface.getContext('experimental-webgl');
    if (context) {
      const extension = context.getExtension('WEBGL_debug_renderer_info');
      webgl = extension ? `${context.getParameter(extension.UNMASKED_VENDOR_WEBGL)}|${context.getParameter(extension.UNMASKED_RENDERER_WEBGL)}` : `${context.getParameter(context.VENDOR)}|${context.getParameter(context.RENDERER)}`;
      context.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch { /* GPU details are optional. */ }
  return {
    canvas, webgl, audio: await audioFeature(environment),
    colorDepth: Number(environment.screen?.colorDepth) || 0,
    concurrency: Number(environment.navigator?.hardwareConcurrency) || 0,
    pixelRatio: Number(environment.devicePixelRatio) || 1,
    screenWidth: Number(environment.screen?.width) || 0,
    screenHeight: Number(environment.screen?.height) || 0,
  };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export async function computeHardwareToken({ features, environment = globalThis } = {}) {
  const attributes = features ?? await collectHardwareFeatures(environment);
  return sha256(JSON.stringify(canonical({ schema: 'bankshot-browser-identity-v1', attributes })));
}

export function sanitizeCampaignSnapshot(source = {}) {
  if (!object(source)) throw new Error('Invalid campaign snapshot');
  const records = object(source.levelRecords) ? Object.entries(source.levelRecords) : [];
  const counters = object(source.shotCounters) ? Object.entries(source.shotCounters) : [];
  if (records.length > 2000 || counters.length > 2048) throw new Error('Campaign snapshot exceeds records limit');
  const levelRecords = {};
  for (const [key, record] of records) {
    if (!/^[1-9]\d{0,6}$/.test(key) || !object(record) || !count(record.bestShots) || !count(record.par) || !GRADES.includes(record.bestRank ?? record.rank)) continue;
    const bestRank = record.bestRank ?? record.rank;
    levelRecords[key] = { bestShots: count(record.bestShots), par: count(record.par), bestRank, rank: bestRank, completions: Math.max(1, count(record.completions)), clearedAt: countTime(record.clearedAt) };
  }
  const shotCounters = Object.fromEntries(counters.filter(([key, value]) => /^[a-zA-Z0-9_-]{1,64}$/.test(key) && count(value) === value));
  const totalShotsFired = Math.max(count(source.stats?.totalShotsFired), Math.min(1_000_000_000, Object.values(shotCounters).reduce((sum, value) => sum + value, 0)));
  let maxUnlocked = 1;
  while (levelRecords[maxUnlocked]) maxUnlocked++;
  return {
    version: 3,
    ...(typeof source.userSeed === 'string' && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(source.userSeed) ? { userSeed: source.userSeed } : {}),
    levelRecords, shotCounters, maxUnlocked, currentLevel: Math.max(1, Math.min(count(source.currentLevel) || maxUnlocked, maxUnlocked)),
    elo: count(source.elo), mmr: count(source.mmr), rankUpdatedAt: countTime(source.rankUpdatedAt),
    winStreak: count(source.winStreak), lossStreak: count(source.lossStreak),
    rank: { peakElo: Math.max(count(source.rank?.peakElo ?? source.peakElo), count(source.elo)), peakIndex: Math.min(24, count(source.rank?.peakIndex)) },
    stats: { totalShotsFired, completedPar: count(source.stats?.completedPar), recentShots: Array.isArray(source.stats?.recentShots) ? source.stats.recentShots.filter(value => Number.isFinite(value) && value > 0 && value <= 1e6).slice(-10) : [], levelsCompleted: Object.keys(levelRecords).length },
  };
}
function countTime(value) { return Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 8_640_000_000_000_000) : 0; }

export function mergeCampaignSnapshots(previous, incoming) {
  const a = sanitizeCampaignSnapshot(previous), b = sanitizeCampaignSnapshot(incoming);
  const latest = b.rankUpdatedAt > a.rankUpdatedAt ? b : a;
  const merged = { ...latest, userSeed: a.userSeed ?? b.userSeed, levelRecords: { ...a.levelRecords }, shotCounters: { ...a.shotCounters }, rank: { peakElo: Math.max(a.rank.peakElo, b.rank.peakElo), peakIndex: Math.max(a.rank.peakIndex, b.rank.peakIndex) } };
  for (const [key, value] of Object.entries(b.levelRecords)) {
    const previous = merged.levelRecords[key];
    if (!previous) merged.levelRecords[key] = value;
    else {
      const bestRank = GRADES[Math.min(GRADES.indexOf(previous.bestRank), GRADES.indexOf(value.bestRank))];
      merged.levelRecords[key] = { ...previous, bestShots: Math.min(previous.bestShots, value.bestShots), bestRank, rank: bestRank, completions: Math.max(previous.completions, value.completions), clearedAt: Math.max(previous.clearedAt, value.clearedAt) };
    }
  }
  for (const [key, value] of Object.entries(b.shotCounters)) merged.shotCounters[key] = Math.max(merged.shotCounters[key] ?? 0, value);
  merged.stats = { ...latest.stats, totalShotsFired: Math.max(a.stats.totalShotsFired, b.stats.totalShotsFired), completedPar: Math.max(a.stats.completedPar, b.stats.completedPar) };
  merged.currentLevel = Math.max(a.currentLevel, b.currentLevel);
  return sanitizeCampaignSnapshot(merged);
}

export function profileEndpoint(relayUrl) {
  const url = new URL(relayUrl);
  if (!['https:', 'http:', 'wss:', 'ws:'].includes(url.protocol)) throw new Error('Invalid profile relay');
  url.protocol = url.protocol === 'wss:' ? 'https:' : url.protocol === 'ws:' ? 'http:' : url.protocol;
  url.pathname = '/profile'; url.search = ''; url.hash = '';
  return url.href;
}

export function createProfileService(options = {}) {
  let storage = options.storage;
  if (!storage) { try { storage = globalThis.localStorage; } catch { /* Storage may be disabled. */ } }
  let cached;
  try { cached = JSON.parse(storage?.getItem(PROFILE_STORAGE_KEY) ?? 'null'); } catch { /* Ignore damaged local cache. */ }
  let snapshot = { id: '', agentToken: formatAgentToken(''), callsign: '', online: { elo: 1000, wins: 0, losses: 0, races: 0 }, campaign: sanitizeCampaignSnapshot(), status: 'loading', error: '' };
  if (validProfileId(cached?.id)) snapshot = { ...snapshot, ...cached, agentToken: formatAgentToken(cached.id), status: 'loading', error: '' };
  const listeners = new Set(), controllers = new Set();
  let destroyed = false, epoch = 0, queue = Promise.resolve();
  const publish = () => {
    if (destroyed) return;
    try { storage?.setItem(PROFILE_STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* Session still works. */ }
    for (const listener of listeners) listener(clone(snapshot));
  };
  const getCampaign = () => typeof options.campaign === 'function' ? options.campaign() : options.campaign;
  async function exchange(payload, generation = epoch) {
    if (destroyed || generation !== epoch) return clone(snapshot);
    const controller = new AbortController(); controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
    try {
      if (!options.relayUrl) throw new Error('Relay is not configured');
      const fetchImpl = options.fetchImpl ?? globalThis.fetch;
      const response = await fetchImpl(profileEndpoint(typeof options.relayUrl === 'function' ? options.relayUrl() : options.relayUrl), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
      if (!response.ok) throw new Error(`Profile service unavailable (${response.status})`);
      const result = await response.json();
      if (result.id !== payload.id || !object(result.online) || !object(result.campaign)) throw new Error('Invalid profile response');
      if (destroyed || generation !== epoch) return clone(snapshot);
      snapshot = { id: result.id, agentToken: formatAgentToken(result.id), callsign: typeof result.callsign === 'string' ? result.callsign.slice(0, 24) : '', online: { elo: count(result.online.elo), wins: count(result.online.wins), losses: count(result.online.losses), races: count(result.online.races) }, campaign: sanitizeCampaignSnapshot(result.campaign), status: 'online', error: '' };
      options.onCampaign?.(clone(snapshot.campaign));
    } catch (error) {
      if (!destroyed && generation === epoch) snapshot = { ...snapshot, status: 'offline', error: 'Profile relay unavailable. Progress remains on this browser.' };
    } finally { clearTimeout(timeout); controllers.delete(controller); }
    if (generation === epoch) publish();
    return clone(snapshot);
  }
  function enqueue(payload) {
    const generation = epoch;
    queue = queue.catch(() => {}).then(() => exchange(payload, generation));
    return queue;
  }
  const service = {
    get snapshot() { return clone(snapshot); },
    ready: null,
    async refresh(campaign = getCampaign()) {
      await service.ready;
      return enqueue({ id: snapshot.id, ...(campaign ? { campaign: sanitizeCampaignSnapshot(campaign) } : {}) });
    },
    async rename(name) {
      await service.ready;
      const callsign = String(name).trim();
      if (!callsign || callsign.length > 24 || /[\u0000-\u001f\u007f]/.test(callsign)) throw new Error('Call-sign must contain 1–24 printable characters');
      snapshot = { ...snapshot, callsign }; publish();
      return enqueue({ id: snapshot.id, callsign });
    },
    async recover(token) {
      await service.ready;
      const match = /^BANKSHOT1:([a-f0-9]{64})$/i.exec(String(token).trim());
      if (!match) throw new Error('Enter a complete BANKSHOT1 recovery token, not the short Agent label');
      epoch++; for (const controller of controllers) controller.abort();
      snapshot = { id: match[1].toLowerCase(), agentToken: formatAgentToken(match[1].toLowerCase()), callsign: '', online: { elo: 1000, wins: 0, losses: 0, races: 0 }, campaign: sanitizeCampaignSnapshot(), status: 'loading', error: '' }; publish();
      // Never upload the previous agent's campaign while importing another ID.
      return enqueue({ id: snapshot.id });
    },
    exportToken() { return validProfileId(snapshot.id) ? `BANKSHOT1:${snapshot.id}` : ''; },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    destroy() { destroyed = true; epoch++; for (const controller of controllers) controller.abort(); listeners.clear(); },
  };
  service.ready = (async () => {
    if (!validProfileId(snapshot.id)) {
      const id = await computeHardwareToken({ features: options.features, environment: options.environment });
      snapshot = { ...snapshot, id, agentToken: formatAgentToken(id) }; publish();
    }
    const campaign = getCampaign();
    return enqueue({ id: snapshot.id, ...(snapshot.callsign ? { callsign: snapshot.callsign } : {}), ...(campaign ? { campaign: sanitizeCampaignSnapshot(campaign) } : {}) });
  })();
  return service;
}
