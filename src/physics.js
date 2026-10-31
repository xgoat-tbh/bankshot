import { CONFIG } from './config.js';

const P = CONFIG.physics;
const R = CONFIG.world.radius;

export function collisionResult() {
  return { time: Infinity, nx: 0, ny: 0, wall: -1, kind: null, index: -1 };
}

export function compileWall(wall) {
  const dx = wall.b[0] - wall.a[0];
  const dy = wall.b[1] - wall.a[1];
  const length = Math.hypot(dx, dy);
  return {
    ax: wall.a[0], ay: wall.a[1], bx: wall.b[0], by: wall.b[1],
    dx, dy, length, nx: length ? -dy / length : 0, ny: length ? dx / length : 0,
    mat: wall.mat, active: true, hitAt: -Infinity,
  };
}

// A segment's capsule consists of two offset lines and two endpoint circles.
// Testing both parts prevents tunneling and gives exact vertex normals.
export function sweepCircleSegment(x, y, vx, vy, radius, wall, maxTime, out) {
  const limit = Math.min(maxTime, out.time);
  if (wall.length > P.epsilon) {
    const distance = (x - wall.ax) * wall.nx + (y - wall.ay) * wall.ny;
    const normalSpeed = vx * wall.nx + vy * wall.ny;
    for (let side = -1; side <= 1; side += 2) {
      if (normalSpeed * side >= -P.epsilon) continue;
      let time = (side * radius - distance) / normalSpeed;
      if (Math.abs(distance) < radius && distance * side >= 0) time = 0;
      if (time < -P.epsilon || time > limit + P.epsilon || time >= out.time) continue;
      time = Math.max(0, time);
      const hx = x + vx * time - wall.ax;
      const hy = y + vy * time - wall.ay;
      const along = (hx * wall.dx + hy * wall.dy) / wall.length;
      if (along >= 0 && along <= wall.length) {
        out.time = time;
        out.nx = wall.nx * side;
        out.ny = wall.ny * side;
      }
    }
  }
  const speedSquared = vx * vx + vy * vy;
  if (speedSquared < P.epsilon) return;
  for (let end = 0; end < 2; end++) {
    const ex = end ? wall.bx : wall.ax;
    const ey = end ? wall.by : wall.ay;
    const ox = x - ex;
    const oy = y - ey;
    const projection = ox * vx + oy * vy;
    const c = ox * ox + oy * oy - radius * radius;
    if (projection >= 0) continue;
    const discriminant = projection * projection - speedSquared * c;
    if (discriminant < 0) continue;
    let time = c < 0 ? 0 : (-projection - Math.sqrt(discriminant)) / speedSquared;
    if (time < -P.epsilon || time > limit + P.epsilon || time >= out.time) continue;
    time = Math.max(0, time);
    const nx = ox + vx * time;
    const ny = oy + vy * time;
    const length = Math.hypot(nx, ny);
    if (length < P.epsilon) continue;
    out.time = time;
    out.nx = nx / length;
    out.ny = ny / length;
  }
}

export function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const cross = (x - a[0]) * (b[1] - a[1]) - (y - a[1]) * (b[0] - a[0]);
    if (Math.abs(cross) < P.epsilon && x >= Math.min(a[0], b[0]) && x <= Math.max(a[0], b[0]) && y >= Math.min(a[1], b[1]) && y <= Math.max(a[1], b[1])) return true;
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function polygonEntry(x, y, dx, dy, polygon) {
  if (pointInPolygon(x, y, polygon)) return 0;
  let earliest = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const ax = polygon[j][0];
    const ay = polygon[j][1];
    const ex = polygon[i][0] - ax;
    const ey = polygon[i][1] - ay;
    const denominator = dx * ey - dy * ex;
    if (Math.abs(denominator) < P.epsilon) continue;
    const qx = ax - x;
    const qy = ay - y;
    const t = (qx * ey - qy * ex) / denominator;
    const u = (qx * dy - qy * dx) / denominator;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && t < earliest) earliest = t;
  }
  return earliest;
}

export function createWorld(level) {
  const world = {
    level, x: level.puck[0], y: level.puck[1], px: level.puck[0], py: level.puck[1],
    vx: 0, vy: 0, angle: 0, previousAngle: 0, status: 'ready', shots: 0,
    time: 0, shotTime: 0, startX: level.puck[0], startY: level.puck[1],
    walls: level.walls.map(compileWall), goal: level.goal, hazards: level.hazards,
    collision: collisionResult(), preview: collisionResult(), version: 0,
    impacts: 0, breaks: 0, failures: 0, lastOutcome: '',
    movingWalls: (level.movingWalls ?? []).map(item => ({ ...compileWall({ ...item, mat: item.mat ?? 'solid' }), baseA: [...item.a], baseB: [...item.b], delta: [...item.delta], freq: item.freq ?? 1, phase: item.phase ?? 0, active: item.active !== false, vx: 0, vy: 0 })),
    bumpers: (level.bumpers ?? []).map(item => ({ restitution: 1.25, ...item, hitAt: -Infinity })),
    portals: (level.portals ?? []).map(item => ({ ...item, A: { ...item.A }, B: { ...item.B }, cooldown: 0 })),
    gravityWells: (level.gravityWells ?? []).map(item => ({ radius: 140, strength: 2200, ...item })),
    teleports: 0,
  };
  updateMovingWalls(world);
  return world;
}

function updateMovingWalls(world, time = world.time) {
  for (const wall of world.movingWalls) {
    const phase = wall.freq * time + wall.phase;
    const offset = Math.sin(phase);
    wall.ax = wall.baseA[0] + wall.delta[0] * offset;
    wall.ay = wall.baseA[1] + wall.delta[1] * offset;
    wall.bx = wall.baseB[0] + wall.delta[0] * offset;
    wall.by = wall.baseB[1] + wall.delta[1] * offset;
    wall.vx = Math.cos(phase) * wall.freq * wall.delta[0];
    wall.vy = Math.cos(phase) * wall.freq * wall.delta[1];
  }
}

function circleSweep(x, y, vx, vy, cx, cy, radius, maxTime, out) {
  const ox = x - cx;
  const oy = y - cy;
  const speed = vx * vx + vy * vy;
  const projection = ox * vx + oy * vy;
  if (speed < P.epsilon || projection >= 0) return;
  const c = ox * ox + oy * oy - radius * radius;
  const discriminant = projection * projection - speed * c;
  if (discriminant < 0) return;
  const time = c <= 0 ? 0 : (-projection - Math.sqrt(discriminant)) / speed;
  if (time > maxTime || time >= out.time || time < 0) return;
  const nx = ox + vx * time;
  const ny = oy + vy * time;
  const distance = Math.hypot(nx, ny);
  if (distance < P.epsilon) return;
  out.time = time;
  out.nx = nx / distance;
  out.ny = ny / distance;
}

function portalCollision(world, x, y, vx, vy, maxTime, excluded = null) {
  const hit = { time: Infinity, pair: null, entrance: null, exit: null };
  for (const pair of world.portals) {
    if (pair === excluded || pair.cooldown > 0) continue;
    for (const [entrance, exit] of [[pair.A, pair.B], [pair.B, pair.A]]) {
      if (vx * entrance.nx + vy * entrance.ny >= -P.epsilon) continue;
      const candidate = collisionResult();
      circleSweep(x, y, vx, vy, entrance.x, entrance.y, entrance.radius, maxTime, candidate);
      if (candidate.time < hit.time) Object.assign(hit, { time: candidate.time, pair, entrance, exit });
    }
  }
  return hit;
}

function portalExit(hit, vx, vy) {
  // Incoming direction points against entrance normal; outgoing follows exit normal.
  const angle = Math.atan2(hit.exit.ny, hit.exit.nx) - Math.atan2(-hit.entrance.ny, -hit.entrance.nx);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const clearance = hit.exit.radius + R + P.separation;
  return { x: hit.exit.x + hit.exit.nx * clearance, y: hit.exit.y + hit.exit.ny * clearance, vx: vx * cosine - vy * sine, vy: vx * sine + vy * cosine };
}

export function launch(world, angle, power) {
  if (Number.isFinite(world.budget) && world.shots >= world.budget) return false;
  if (world.status !== 'ready' || !Number.isFinite(angle) || !Number.isFinite(power) || power <= 0) return false;
  const speed = Math.min(1, power) * P.maxSpeed;
  world.vx = Math.cos(angle) * speed;
  world.vy = Math.sin(angle) * speed;
  world.startX = world.x;
  world.startY = world.y;
  world.shotTime = 0;
  world.shots++;
  world.status = 'moving';
  world.lastOutcome = '';
  return true;
}

export function findCollision(world, x, y, vx, vy, maxTime, out, moving = false, movingOffset = 0) {
  out.time = Infinity;
  out.wall = -1;
  out.nx = 0;
  out.ny = 0;
  out.kind = null;
  out.index = -1;
  for (let i = 0; i < world.walls.length; i++) {
    const wall = world.walls[i];
    if (!wall.active) continue;
    const before = out.time;
    sweepCircleSegment(x, y, vx, vy, R, wall, maxTime, out);
    if (out.time < before) { out.wall = i; out.kind = 'wall'; out.index = i; }
  }
  for (let i = 0; i < world.movingWalls.length; i++) {
    const wall = world.movingWalls[i];
    if (!wall.active) continue;
    const before = out.time;
    const segment = movingOffset ? { ...wall, ax: wall.ax + wall.vx * movingOffset, ay: wall.ay + wall.vy * movingOffset, bx: wall.bx + wall.vx * movingOffset, by: wall.by + wall.vy * movingOffset } : wall;
    sweepCircleSegment(x, y, vx - (moving ? wall.vx : 0), vy - (moving ? wall.vy : 0), R, segment, maxTime, out);
    if (out.time < before) { out.wall = world.walls.length + i; out.kind = 'moving'; out.index = i; }
  }
  for (let i = 0; i < world.bumpers.length; i++) {
    const bumper = world.bumpers[i];
    const before = out.time;
    circleSweep(x, y, vx, vy, bumper.x, bumper.y, R + bumper.radius, maxTime, out);
    if (out.time < before) { out.wall = -2; out.kind = 'bumper'; out.index = i; }
  }
  return out;
}

function moveThroughRegions(world, dx, dy) {
  let time = polygonEntry(world.x, world.y, dx, dy, world.goal);
  let hazard = false;
  for (let i = 0; i < world.hazards.length; i++) {
    const entry = polygonEntry(world.x, world.y, dx, dy, world.hazards[i]);
    if (entry < time) { time = entry; hazard = true; }
  }
  if (time <= 1) {
    world.x += dx * time;
    world.y += dy * time;
    world.vx = 0;
    world.vy = 0;
    if (hazard) {
      world.x = world.startX;
      world.y = world.startY;
      world.px = world.x;
      world.py = world.y;
      world.status = 'ready';
      world.failures++;
      world.lastOutcome = 'hazard';
    } else {
      world.status = 'won';
      world.lastOutcome = 'goal';
    }
    return true;
  }
  world.x += dx;
  world.y += dy;
  return false;
}

export function stepWorld(world, dt = P.step) {
  world.px = world.x;
  world.py = world.y;
  world.previousAngle = world.angle;
  world.time += dt;
  for (const pair of world.portals) pair.cooldown = Math.max(0, pair.cooldown - dt);
  if (world.status !== 'moving') { updateMovingWalls(world); return; }
  updateMovingWalls(world, world.time - dt);
  world.shotTime += dt;
  const damping = Math.exp(-P.damping * dt);
  world.vx *= damping;
  world.vy *= damping;
  for (const well of world.gravityWells) {
    const dx = well.x - world.x;
    const dy = well.y - world.y;
    const distance = Math.hypot(dx, dy);
    if (distance < well.radius && distance > R) {
      const acceleration = well.strength * (1 - distance / well.radius) / distance;
      world.vx += acceleration * dx * dt;
      world.vy += acceleration * dy * dt;
    }
  }
  world.angle += Math.hypot(world.vx, world.vy) * dt / R * CONFIG.motion.spinFactor;
  let remaining = dt;
  let count = 0;
  while (remaining > P.epsilon && count < P.maxCollisions) {
    const hit = findCollision(world, world.x, world.y, world.vx, world.vy, remaining, world.collision, true, dt - remaining);
    const portal = portalCollision(world, world.x, world.y, world.vx, world.vy, remaining);
    const travel = Math.min(remaining, hit.time, portal.time);
    if (moveThroughRegions(world, world.vx * travel, world.vy * travel)) { updateMovingWalls(world); return; }
    remaining -= travel;
    if (portal.time <= hit.time && portal.time <= travel) {
      const exit = portalExit(portal, world.vx, world.vy);
      Object.assign(world, { x: exit.x, y: exit.y, px: exit.x, py: exit.y, vx: exit.vx, vy: exit.vy });
      portal.pair.cooldown = 0.15;
      world.teleports++;
      count++;
      continue;
    }
    if (!hit.kind) break;
    if (hit.kind === 'bumper') {
      const bumper = world.bumpers[hit.index];
      const dot = world.vx * hit.nx + world.vy * hit.ny;
      world.vx = (world.vx - 2 * dot * hit.nx) * bumper.restitution;
      world.vy = (world.vy - 2 * dot * hit.ny) * bumper.restitution;
      const speed = Math.hypot(world.vx, world.vy);
      if (speed > P.maxSpeed) { world.vx *= P.maxSpeed / speed; world.vy *= P.maxSpeed / speed; }
      world.x += hit.nx * P.separation;
      world.y += hit.ny * P.separation;
      bumper.hitAt = world.time;
      world.impacts++;
      count++;
      continue;
    }
    const wall = hit.kind === 'moving' ? world.movingWalls[hit.index] : world.walls[hit.wall];
    const wallVx = hit.kind === 'moving' ? wall.vx : 0;
    const wallVy = hit.kind === 'moving' ? wall.vy : 0;
    const normalSpeed = (world.vx - wallVx) * hit.nx + (world.vy - wallVy) * hit.ny;
    wall.hitAt = world.time;
    world.impacts++;
    if (wall.mat === 'glass' && -normalSpeed >= P.glassThreshold) {
      wall.active = false;
      world.version++;
      world.breaks++;
      world.vx *= P.glassRetention;
      world.vy *= P.glassRetention;
    } else {
      const impulse = (1 + P.restitution[wall.mat]) * normalSpeed;
      world.vx -= impulse * hit.nx;
      world.vy -= impulse * hit.ny;
      world.x += hit.nx * P.separation;
      world.y += hit.ny * P.separation;
    }
    count++;
  }
  updateMovingWalls(world);
  // If an adversarial corner exhausts the cap, discard remaining time, never tunnel.
  if (Math.hypot(world.vx, world.vy) < P.stopSpeed || world.shotTime >= P.shotLimit) {
    world.vx = 0;
    world.vy = 0;
    world.status = 'ready';
    world.lastOutcome = 'rest';
  }
}

export function getAim(world, angle, out = world.preview) {
  const vx = Math.cos(angle);
  const vy = Math.sin(angle);
  findCollision(world, world.x, world.y, vx, vy, CONFIG.input.previewLength, out);
  if (!Number.isFinite(out.time)) out.time = CONFIG.input.previewLength;
  return out;
}

export function getAimTrajectory(world, angle, maxLength = CONFIG.input.previewLength) {
  return traceAim(world, angle, maxLength, 0);
}

function traceAim(world, angle, maxLength, depth, excluded = null) {
  const length = Number.isFinite(maxLength) ? Math.max(0, maxLength) : CONFIG.input.previewLength;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const hit = findCollision(world, world.x, world.y, dx, dy, length, world.preview);
  const portal = depth < 4 ? portalCollision(world, world.x, world.y, dx, dy, length, excluded) : { time: Infinity };
  if (portal.time < hit.time && portal.time <= length) {
    const x1 = world.x + dx * portal.time;
    const y1 = world.y + dy * portal.time;
    const exit = portalExit(portal, dx, dy);
    const next = traceAim({ ...world, x: exit.x, y: exit.y, preview: collisionResult() }, Math.atan2(exit.vy, exit.vx), length - portal.time, depth + 1, portal.pair);
    return { x0: world.x, y0: world.y, x1, y1, x2: next.x2, y2: next.y2, hasBounce: next.hasBounce, hasPortal: true, normal: next.normal, segments: [{ x0: world.x, y0: world.y, x1, y1 }, ...next.segments] };
  }
  const hasBounce = Boolean(hit.kind) && hit.time <= length;
  const distance = hasBounce ? hit.time : length;
  const x1 = world.x + dx * distance;
  const y1 = world.y + dy * distance;
  const dot = dx * hit.nx + dy * hit.ny;
  const normal = { x: hit.nx, y: hit.ny };
  const remaining = hasBounce ? length - distance : 0;
  const reflectedX = dx - 2 * dot * normal.x;
  const reflectedY = dy - 2 * dot * normal.y;
  const startX = x1 + (hasBounce ? normal.x * P.separation : 0);
  const startY = y1 + (hasBounce ? normal.y * P.separation : 0);
  const hit2 = collisionResult();
  if (hasBounce && remaining > 0) findCollision(world, startX, startY, reflectedX, reflectedY, remaining, hit2);
  const secondLength = Math.min(remaining, hit2.time);
  const x2 = startX + reflectedX * secondLength;
  const y2 = startY + reflectedY * secondLength;
  const secondPortal = hasBounce && depth < 4 ? portalCollision(world, startX, startY, reflectedX, reflectedY, secondLength, excluded) : { time: Infinity };
  if (secondPortal.time <= secondLength) {
    const entryX = startX + reflectedX * secondPortal.time;
    const entryY = startY + reflectedY * secondPortal.time;
    const exit = portalExit(secondPortal, reflectedX, reflectedY);
    const next = traceAim({ ...world, x: exit.x, y: exit.y, preview: collisionResult() }, Math.atan2(exit.vy, exit.vx), remaining - secondPortal.time, depth + 1, secondPortal.pair);
    return { x0: world.x, y0: world.y, x1, y1, x2: next.x2, y2: next.y2, hasBounce, hasPortal: true, normal, segments: [{ x0: world.x, y0: world.y, x1, y1 }, { x0: startX, y0: startY, x1: entryX, y1: entryY }, ...next.segments] };
  }
  return {
    x0: world.x, y0: world.y, x1, y1,
    x2, y2, hasBounce, normal, hasPortal: false,
    segments: [{ x0: world.x, y0: world.y, x1, y1 }, ...(hasBounce ? [{ x0: startX, y0: startY, x1: x2, y1: y2 }] : [])],
  };
}

export function simulateSolution(level) {
  const world = createWorld(level);
  for (let i = 0; i < level.solution.length; i++) {
    const shot = level.solution[i];
    launch(world, shot.angleDeg * Math.PI / 180, shot.power);
    let steps = 0;
    while (world.status === 'moving' && steps++ < CONFIG.tests.maxSteps) stepWorld(world);
    if (world.status === 'won') break;
  }
  return world;
}
