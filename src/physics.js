import { CONFIG } from './config.js';

const P = CONFIG.physics;
const R = CONFIG.world.radius;

export function collisionResult() {
  return { time: Infinity, nx: 0, ny: 0, wall: -1 };
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
  return {
    level, x: level.puck[0], y: level.puck[1], px: level.puck[0], py: level.puck[1],
    vx: 0, vy: 0, angle: 0, previousAngle: 0, status: 'ready', shots: 0,
    time: 0, shotTime: 0, startX: level.puck[0], startY: level.puck[1],
    walls: level.walls.map(compileWall), goal: level.goal, hazards: level.hazards,
    collision: collisionResult(), preview: collisionResult(), version: 0,
    impacts: 0, breaks: 0, failures: 0, lastOutcome: '',
  };
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

export function findCollision(world, x, y, vx, vy, maxTime, out) {
  out.time = Infinity;
  out.wall = -1;
  out.nx = 0;
  out.ny = 0;
  for (let i = 0; i < world.walls.length; i++) {
    const wall = world.walls[i];
    if (!wall.active) continue;
    const before = out.time;
    sweepCircleSegment(x, y, vx, vy, R, wall, maxTime, out);
    if (out.time < before) out.wall = i;
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
  if (world.status !== 'moving') return;
  world.shotTime += dt;
  const damping = Math.exp(-P.damping * dt);
  world.vx *= damping;
  world.vy *= damping;
  world.angle += Math.hypot(world.vx, world.vy) * dt / R * CONFIG.motion.spinFactor;
  let remaining = dt;
  let count = 0;
  while (remaining > P.epsilon && count < P.maxCollisions) {
    const hit = findCollision(world, world.x, world.y, world.vx, world.vy, remaining, world.collision);
    const travel = Math.min(remaining, hit.time);
    if (moveThroughRegions(world, world.vx * travel, world.vy * travel)) return;
    remaining -= travel;
    if (hit.wall < 0) break;
    const wall = world.walls[hit.wall];
    const normalSpeed = world.vx * hit.nx + world.vy * hit.ny;
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
  const length = Number.isFinite(maxLength) ? Math.max(0, maxLength) : CONFIG.input.previewLength;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const hit = findCollision(world, world.x, world.y, dx, dy, length, world.preview);
  const hasBounce = hit.wall >= 0 && hit.time <= length;
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
  return {
    x0: world.x, y0: world.y, x1, y1,
    x2: startX + reflectedX * secondLength,
    y2: startY + reflectedY * secondLength,
    hasBounce, normal,
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
