import { CONFIG } from './config.js';
import { simulateSolution } from './physics.js';
import { ClearanceEngine, validateClearance } from './clearance.js';
import { LEVELS, MILESTONES } from './levels.js';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const wall = (a, b, mat = 'solid') => ({ a, b, mat });

function randomFor(seed, index) {
  let state = 2166136261;
  for (const c of `${seed}:${index}`) state = Math.imul(state ^ c.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let n = Math.imul(state ^ state >>> 15, 1 | state);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

const milestoneNames = { 25: 'Kinetic Gate', 50: 'Gravity Crucible', 75: 'Orbital Convergence', 100: 'Event Horizon' };

function pointSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, q = dx * dx + dy * dy;
  const t = q ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / q)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function candidate(index, seed, fallback = false) {
  const random = randomFor(seed, index);
  const tier = Math.min(100, index);
  const archetype = fallback ? 0 : (index + Math.floor(random() * 4)) % 4;

  let px, py, gx, gy, bankY, reflectedY;
  const w = Math.max(32, 48 - Math.floor(tier / 10) * 2), h = 46, c = 14;

  if (archetype === 0) {
    px = 210 + random() * 60; py = 640 + random() * 40;
    gx = 1340 + random() * 50; gy = 210 + random() * 30;
    bankY = 70 + CONFIG.world.radius;
    reflectedY = bankY - (gy - bankY) / CONFIG.physics.restitution.solid;
  } else if (archetype === 1) {
    px = 1350 - random() * 60; py = 640 + random() * 40;
    gx = 240 - random() * 50; gy = 210 + random() * 30;
    bankY = 70 + CONFIG.world.radius;
    reflectedY = bankY - (gy - bankY) / CONFIG.physics.restitution.solid;
  } else if (archetype === 2) {
    px = 210 + random() * 60; py = 220 + random() * 40;
    gx = 1340 + random() * 50; gy = 650 + random() * 30;
    bankY = 830 - CONFIG.world.radius;
    reflectedY = bankY + (bankY - gy) / CONFIG.physics.restitution.solid;
  } else {
    px = 1350 - random() * 60; py = 220 + random() * 40;
    gx = 240 - random() * 50; gy = 650 + random() * 30;
    bankY = 830 - CONFIG.world.radius;
    reflectedY = bankY + (bankY - gy) / CONFIG.physics.restitution.solid;
  }

  const puck = [px, py];
  const goal = [[gx - w + c, gy - h], [gx + w, gy - h], [gx + w, gy + h - c], [gx + w - c, gy + h], [gx - w, gy + h], [gx - w, gy - h + c]];

  const par = Math.min(5, 1 + Math.floor((tier - 1) / 20));
  const prepDir = px < 800 ? 0 : 180;
  const preparation = Array.from({ length: par - 1 }, (_, step) => ({
    angleDeg: step % 2 ? (prepDir === 0 ? 180 : 0) : prepDir,
    power: 0.025,
  }));

  let curX = px, curY = py;
  if (preparation.length) {
    const replay = simulateSolution({ puck, goal: [], walls: [], hazards: [], solution: preparation });
    curX = replay.x; curY = replay.y;
  }

  const angleDeg = Math.atan2(reflectedY - curY, gx - curX) * 180 / Math.PI;

  const tBank = (bankY - curY) / (reflectedY - curY);
  const hitX = curX + tBank * (gx - curX);
  const inCorridor = (x, y, r = 60) =>
    pointSegment(x, y, curX, curY, hitX, bankY) < (r + 45) ||
    pointSegment(x, y, hitX, bankY, gx, gy) < (r + 45);

  const boundary = CONFIG.world.boundary.map((p, i, points) => wall([...p], [...points[(i + 1) % points.length]]));
  const engine = new ClearanceEngine();
  for (const b of boundary) engine.add('wall', b, true);
  engine.add('spawn', puck, true);
  engine.add('goal', goal, true);

  const movingWalls = [], bumpers = [], portals = [], gravityWells = [], hazards = [];
  const walls = [...boundary];

  const add = (type, item, list) => {
    if (engine.add(type, item)) { list.push(item); return true; }
    return false;
  };

  if (index >= 31) {
    const motionType = 'linear';
    const amplitude = [0, index <= 50 ? 25 : index <= 70 ? 30 : 35];
    const frequency = (index <= 50 ? 2 : index <= 70 ? 3.8 : 5.2) / (Math.PI * 2);

    const pY1 = archetype < 2 ? 280 : 600;
    const pY2 = archetype < 2 ? 580 : 280;
    const pA = { x: px < 800 ? 240 : 1360, y: pY1, nx: px < 800 ? 1 : -1, ny: 0, radius: 24, motion: { type: motionType, amplitude, frequency, phase: 0, ratio: 2 } };
    const pB = { x: px < 800 ? 1360 : 240, y: pY2, nx: px < 800 ? -1 : 1, ny: 0, radius: 24, motion: { type: motionType, amplitude, frequency, phase: Math.PI, ratio: 2 } };
    if (!inCorridor(pA.x, pA.y, 40) && !inCorridor(pB.x, pB.y, 40) && engine.add('portal', pA) && engine.add('portal', pB)) {
      portals.push({ id: `gate-${index}`, A: pA, B: pB });
    }
  }

  if (index >= 50) {
    const wellCandidates = [
      { x: 800 + (random() - 0.5) * 400, y: archetype < 2 ? 550 : 330, radius: 95, strength: 1600 + random() * 400 },
      { x: px < 800 ? 1100 : 500, y: archetype < 2 ? 500 : 380, radius: 90, strength: 1800 },
      { x: 800, y: archetype < 2 ? 600 : 280, radius: 90, strength: 1800 },
    ];
    for (const cand of wellCandidates) {
      if (!inCorridor(cand.x, cand.y, cand.radius) && add('well', cand, gravityWells)) break;
    }
  }

  if (index >= 25) {
    const bumperCandidates = [
      { x: px < 800 ? 460 + random() * 80 : 1140 - random() * 80, y: archetype < 2 ? 460 : 420, radius: 25, restitution: 1.25 },
      { x: 800 + (random() - 0.5) * 200, y: archetype < 2 ? 650 : 250, radius: 25, restitution: 1.25 },
    ];
    for (const cand of bumperCandidates) {
      if (!inCorridor(cand.x, cand.y, 35) && add('bumper', cand, bumpers)) break;
    }
  }

  if (index >= 15) {
    const mx = 650 + (random() - 0.5) * 200;
    const my = archetype < 2 ? 680 : 220;
    const mw = { a: [mx - 40, my], b: [mx + 40, my], delta: [30, 0], freq: 1, phase: 0, mat: 'solid', active: true };
    if (!inCorridor(mx, my, 50)) add('moving', mw, movingWalls);
  }

  if (index >= 30) {
    const yList = archetype < 2 ? [680, 720, 600, 520, 440] : [200, 160, 320, 400, 480];
    const xList = px < 800 ? [1160, 960, 760, 560, 360] : [360, 560, 760, 960, 1160];
    outer: for (const hy of yList) {
      for (const hx of xList) {
        const hz = [[hx, hy], [hx + 80, hy], [hx + 80, hy + 40], [hx, hy + 40]];
        if (!inCorridor(hx + 40, hy + 20, 50) && add('hazard', hz, hazards)) break outer;
      }
    }
  }

  const barX = (px + gx) / 2;
  const barY = (py + gy) / 2;
  const bar = wall([barX, barY - 50], [barX, barY + 50]);
  if (!inCorridor(barX, barY, 40)) add('wall', bar, walls);

  const target = Math.min(14, 2 + Math.floor(tier / 8));
  const slots = [];
  const yStart = archetype < 2 ? 500 : 180;
  const yEnd = archetype < 2 ? 760 : 440;
  for (let y = yStart; y <= yEnd; y += 80) {
    for (let x = 360; x <= 1260; x += 100) slots.push([x, y]);
  }
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }

  for (const [x, y] of slots) {
    if (walls.length - 8 >= target) break;
    if (inCorridor(x + 15, y, 40)) continue;
    const isSpecial = walls.length === 8 && index >= 20;
    const mat = index < 10 ? 'solid' : (isSpecial || random() < 0.25) ? 'rubber' : (random() < 0.2 ? 'glass' : 'solid');
    add('wall', wall([x, y], [x + 30, y], mat), walls);
  }

  return {
    id: index,
    name: milestoneNames[index] ?? `${CONFIG.game.chapters[Math.min(9, Math.floor((tier - 1) / 10))]} ${index}`,
    milestone: Boolean(milestoneNames[index]),
    puck, goal, walls, hazards, movingWalls, bumpers, portals, gravityWells, par,
    solution: preparation.concat({ angleDeg, power: 0.94 }),
    aimLength: clamp(2400 - tier * 20, 450, 2400),
    difficulty: Math.min(2.5, tier / 40),
    generation: { fallback, attempts: 1 },
    zones: { upper: [70, 320], middle: [320, 580], lower: [580, 830] },
  };
}

export function generateRoom(index, seed, options = {}) {
  if (!Number.isSafeInteger(index) || index < 1) throw new RangeError('Room index must be a positive safe integer');
  const attempts = clamp(Math.floor(options.maxAttempts ?? 8), 0, 29);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const room = candidate(index, `${MILESTONES[index]?.seed ?? seed}:${attempt}`);
    room.generation.attempts = attempt + 1;
    if (!validateClearance(room).length && simulateSolution(room).status === 'won') return room;
  }
  for (let attempt = 0; attempt < 64; attempt++) {
    const room = candidate(index, `bankshot-safe:${attempt}`, true);
    room.generation.attempts = attempts + attempt + 1;
    if (!validateClearance(room).length && simulateSolution(room).status === 'won') return room;
  }
  return createEmergencyRoom(index);
}

export function createEmergencyRoom(index) {
  const room = candidate(index, 'bankshot-emergency', true);
  room.walls = room.walls.slice(0, 8);
  room.movingWalls = []; room.bumpers = []; room.portals = []; room.gravityWells = []; room.hazards = [];
  room.generation.emergency = true;
  const goalX = (Math.min(...room.goal.map(p => p[0])) + Math.max(...room.goal.map(p => p[0]))) / 2;
  const goalY = (Math.min(...room.goal.map(p => p[1])) + Math.max(...room.goal.map(p => p[1]))) / 2;
  room.solution = [{ angleDeg: Math.atan2(goalY - room.puck[1], goalX - room.puck[0]) * 180 / Math.PI, power: 0.65 }];
  room.par = 1;
  return room;
}

function provider(seed, capacity, campaign) {
  const rooms = new Map(), limit = clamp(Math.floor(capacity) || 32, 1, 128);
  const getRoom = index => {
    if (!Number.isSafeInteger(index) || index < 1) throw new RangeError('Room index must be a positive safe integer');
    const room = rooms.get(index) ?? (campaign && index <= LEVELS.length ? LEVELS[index - 1] : generateRoom(index, seed));
    rooms.delete(index); rooms.set(index, room);
    if (rooms.size > limit) rooms.delete(rooms.keys().next().value);
    return room;
  };
  getRoom.getRoom = getRoom;
  return getRoom;
}

export const createRoomProvider = (seed, capacity = 32) => provider(seed, capacity, false);
export const createCampaignProvider = (seed, capacity = 32) => provider(seed, capacity, true);
