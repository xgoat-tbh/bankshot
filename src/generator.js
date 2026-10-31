import { CONFIG } from './config.js';
import { simulateSolution } from './physics.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const wall = (a, b, mat = 'solid') => ({ a, b, mat });

// Hash strings rather than coercing seeds to numbers: persisted UUID seeds work too.
function randomFor(seed, index) {
  let state = 2166136261;
  for (const character of `${seed}:${index}`) state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  return () => {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function material(n, random) {
  const value = random();
  if (n <= 10) return 'solid';
  if (n <= 20) return value < 0.75 ? 'solid' : 'rubber';
  if (n <= 30) return value < 0.6 ? 'solid' : value < 0.8 ? 'rubber' : 'glass';
  return value < 0.5 ? 'solid' : value < 0.75 ? 'rubber' : 'glass';
}

function candidate(index, seed, fallback = false, modifier = 0) {
  const n = index;
  const random = randomFor(seed, fallback ? 0 : index);
  const count = clamp(2 + Math.floor(n / 5) + modifier, 2, 8);
  const w = clamp(48 - Math.floor(n / 10) * 2, 32, 48);
  const px = 190 + random() * 90;
  const py = 390 + random() * 70;
  const gx = 880 + random() * 100;
  const gy = 380 + random() * 80;
  const h = CONFIG.world.goalHalfHeight;
  const c = CONFIG.world.goalCut;
  const mirrorX = random() < 0.5;
  const mirrorY = random() < 0.5;
  const transform = ([x, y]) => [mirrorX ? 1200 - x : x, mirrorY ? 800 - y : y];
  const interior = [wall([520 + random() * 70, 310], [520, 550])];
  // The direct-shot barrier is cardinal; reserve the upper bank corridor.
  interior[0].b[0] = interior[0].a[0];
  for (let i = 1; i < count; i++) {
    const x = 170 + random() * 790;
    const y = 590 + random() * 40;
    const length = 35 + random() * 45;
    const orientation = Math.floor(random() * 4);
    interior.push(wall([x, y], [x + (orientation === 1 ? 0 : length), y + (orientation === 0 ? 0 : orientation === 3 ? -length : length)]));
  }
  if (n > 20) {
    // A gate closes the original bank approach. Move beneath its tip first;
    // later rooms add a perpendicular positioning shot before the bank.
    interior[1] = wall([px + 100, 100], [px + 100, py - 40]);
    interior[0].a[1] = Math.min(py, gy) - 25;
  }
  for (const item of interior) {
    item.mat = material(n, random);
    item.a = transform(item.a);
    item.b = transform(item.b);
  }
  const boundary = CONFIG.world.boundary.map((point, i, points) => wall([...point], [...points[(i + 1) % points.length]]));
  const hazards = [];
  if (n > 30) {
    const hazardCount = 1 + Math.floor(random() * 2);
    for (let i = 0; i < hazardCount; i++) {
      const x = 320 + i * 340 + random() * 60;
      hazards.push([[x, 510], [x + 100, 510], [x + 100, 555], [x, 555]].map(transform));
    }
  }
  // Unfold the top boundary at the puck center's collision line, not the wall.
  const collisionY = 60 + CONFIG.world.radius;
  const preparation = [];
  if (n > 20) preparation.push({ angleDeg: mirrorX ? 180 : 0, power: 0.07 });
  if (n > 40) preparation.push({ angleDeg: mirrorY ? 90 : -90, power: 0.035 });
  const position = preparation.length ? simulateSolution({ puck: transform([px, py]), walls: boundary.concat(interior), goal: [], hazards, solution: preparation }) : null;
  const startX = position ? (mirrorX ? 1200 - position.x : position.x) : px;
  const startY = position ? (mirrorY ? 800 - position.y : position.y) : py;
  const reflectedY = collisionY - (gy - collisionY) / CONFIG.physics.restitution.solid;
  let dx = gx - startX;
  let dy = reflectedY - startY;
  if (mirrorX) dx = -dx;
  if (mirrorY) dy = -dy;
  return {
    id: n, name: `Bank ${n}`, puck: transform([px, py]),
    goal: [[gx - w + c, gy - h], [gx + w, gy - h], [gx + w, gy + h - c], [gx + w - c, gy + h], [gx - w, gy + h], [gx - w, gy - h + c]].map(transform),
    walls: boundary.concat(interior), hazards, par: preparation.length + 1,
    solution: preparation.concat({ angleDeg: Math.atan2(dy, dx) * 180 / Math.PI, power: 0.7 }),
    aimLength: clamp(2400 - n * 25, 450, 2400),
    difficulty: Math.min(1, n / 50), generation: { fallback, attempts: 1 },
  };
}

/** One-based room index; bounded deterministic work. Options exercise fallback. */
export function generateRoom(levelIndex, userSeed, options = {}) {
  if (!Number.isSafeInteger(levelIndex) || levelIndex < 1) throw new RangeError('Room index must be a positive safe integer');
  const attempts = clamp(Math.floor(options.maxAttempts ?? 8), 0, 29);
  let modifier = 0;
  if (options.difficultyModifier !== undefined) {
    modifier = Math.max(-2, Math.min(2, Math.floor(options.difficultyModifier)));
  } else if (options.performanceRatio !== undefined) {
    const ratio = options.performanceRatio;
    modifier = ratio <= 0.95 ? 2 : ratio <= 1.10 ? 1 : ratio > 1.40 ? -1 : 0;
  }
  for (let attempt = 0; attempt < attempts; attempt++) {
    const room = candidate(levelIndex, `${userSeed}:${attempt}`, false, modifier);
    room.generation.attempts = attempt + 1;
    if (simulateSolution(room).status === 'won') return room;
  }
  // Same reserved corridor and scaling, with fixed coordinates from a known seed.
  // Physics verification still runs: no unchecked room can escape this function.
  const room = candidate(levelIndex, 'bankshot-safe-corridor', true, modifier);
  room.generation.attempts = attempts + 1;
  if (simulateSolution(room).status !== 'won') throw new Error('Verified bank corridor violated physics assumptions');
  return room;
}

/** LRU bounds memory independently of the player's highest unlocked room. */
export function createRoomProvider(seed, capacity = 32, getPerfRatio = null) {
  const rooms = new Map();
  const limit = clamp(Math.floor(capacity) || 32, 1, 128);
  const getRoom = (index) => {
    const options = getPerfRatio ? { performanceRatio: getPerfRatio() } : {};
    const room = rooms.get(index) ?? generateRoom(index, seed, options);
    rooms.delete(index);
    rooms.set(index, room);
    if (rooms.size > limit) rooms.delete(rooms.keys().next().value);
    return room;
  };
  getRoom.getRoom = getRoom;
  return getRoom;
}
