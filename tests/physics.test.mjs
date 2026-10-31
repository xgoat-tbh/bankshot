import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { LEVELS } from '../src/levels.js';
import { simulateSolution } from '../src/physics.js';
import { createStore, rank } from '../src/state.js';
import { collisionResult, compileWall, sweepCircleSegment, createWorld, launch, stepWorld, pointInPolygon, polygonEntry } from '../src/physics.js';

const wall = (a, b, mat = 'solid') => ({ a, b, mat });
const fixture = (walls = [], extras = {}) => ({
  id: 0, puck: [100, 400], goal: [[1100, 700], [1150, 700], [1150, 750], [1100, 750]],
  walls, hazards: [], ...extras,
});
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < CONFIG.tests.tolerance, `${actual} != ${expected}`);

test('swept face collision at maximum speed', () => {
  const result = collisionResult();
  sweepCircleSegment(100, 400, 1800, 0, 14, compileWall(wall([200, 200], [200, 600])), 1, result);
  close(result.time, 86 / 1800);
  close(result.nx, -1);
});

test('exact vertex hit has a radial normal', () => {
  const result = collisionResult();
  sweepCircleSegment(100, 100, 1000, 1000, 14, compileWall(wall([200, 200], [400, 200])), 1, result);
  close(result.time, (100 - 14 / Math.sqrt(2)) / 1000);
  close(result.nx, -1 / Math.sqrt(2));
  close(result.ny, -1 / Math.sqrt(2));
});

test('maximum-speed puck never tunnels through a thin wall', () => {
  const world = createWorld(fixture([wall([120, 0], [120, 800])]));
  launch(world, 0, 1);
  for (let i = 0; i < 8; i++) stepWorld(world);
  assert.ok(world.x < 106);
  assert.ok(world.vx < 0);
  assert.equal(world.impacts, 1);
});

test('two walls in one timestep both resolve', () => {
  const world = createWorld(fixture([wall([120, 0], [120, 800]), wall([0, 420], [1200, 420])], { puck: [105, 405] }));
  launch(world, Math.PI / 4, 1);
  stepWorld(world);
  assert.ok(world.vx < 0 && world.vy < 0);
  assert.equal(world.impacts, 2);
});

test('fast glass impact breaks and retains 70 percent speed', () => {
  const world = createWorld(fixture([wall([120, 0], [120, 800], 'glass')]));
  launch(world, 0, 1);
  stepWorld(world);
  assert.equal(world.walls[0].active, false);
  close(world.vx, 1800 * Math.exp(-0.6 / 240) * 0.7);
  assert.equal(world.breaks, 1);
});

test('slow glass impact reflects without breaking', () => {
  const world = createWorld(fixture([wall([116, 0], [116, 800], 'glass')]));
  launch(world, 0, 0.4);
  stepWorld(world);
  assert.equal(world.walls[0].active, true);
  assert.ok(world.vx < 0);
  close(world.vx, -720 * Math.exp(-0.6 / 240) * 0.5);
});

test('rubber reflects with 0.98 restitution', () => {
  const world = createWorld(fixture([wall([116, 0], [116, 800], 'rubber')]));
  launch(world, 0, 0.5);
  stepWorld(world);
  close(world.vx, -900 * Math.exp(-0.6 / 240) * 0.98);
});

test('hazard returns to shot origin and still counts the shot', () => {
  const world = createWorld(fixture([], { hazards: [[[105, 300], [108, 300], [108, 500], [105, 500]]] }));
  launch(world, 0, 1);
  stepWorld(world);
  assert.equal(world.status, 'ready');
  assert.equal(world.shots, 1);
  assert.equal(world.x, 100);
  assert.equal(world.failures, 1);
});

test('a narrow goal cannot be skipped between timesteps', () => {
  const world = createWorld(fixture([], { goal: [[102, 390], [103, 390], [103, 410], [102, 410]] }));
  launch(world, 0, 1);
  stepWorld(world);
  assert.equal(world.status, 'won');
  assert.ok(pointInPolygon(world.x, world.y, world.goal));
});

test('polygon entry detects continuous crossings and inside points', () => {
  const polygon = [[10, 10], [20, 10], [20, 20], [10, 20]];
  close(polygonEntry(0, 15, 100, 0, polygon), 0.1);
  assert.equal(polygonEntry(15, 15, 100, 0, polygon), 0);
  assert.equal(polygonEntry(0, 0, 5, 0, polygon), Infinity);
});

test('zero power does not consume a shot; a moving puck cannot fire', () => {
  const world = createWorld(fixture());
  assert.equal(launch(world, 0, 0), false);
  assert.equal(world.shots, 0);
  assert.equal(launch(world, 0, 1), true);
  assert.equal(launch(world, 0, 1), false);
  assert.equal(world.shots, 1);
});

test('fixed steps are deterministic and shots eventually stop', () => {
  const level = fixture([wall([600, 100], [600, 700])]);
  const a = createWorld(level);
  const b = createWorld(level);
  launch(a, 0.15, 0.8);
  launch(b, 0.15, 0.8);
  for (let i = 0; i < CONFIG.tests.maxSteps; i++) { stepWorld(a); stepWorld(b); }
  assert.equal(a.x, b.x);
  assert.equal(a.y, b.y);
  assert.equal(a.status, 'ready');
});

test('zero-length segments resolve as endpoint circles', () => {
  const result = collisionResult();
  sweepCircleSegment(100, 400, 1800, 0, 14, compileWall(wall([200, 400], [200, 400])), 1, result);
  close(result.time, 86 / 1800);
});

for (const level of LEVELS) {
  test(`solution ${String(level.id).padStart(2, '0')}: ${level.name} / par ${level.par}`, () => {
    assert.equal(level.solution.length, level.par);
    const world = simulateSolution(level);
    assert.equal(world.status, 'won', `Stopped at ${world.x.toFixed(2)}, ${world.y.toFixed(2)}; impacts ${world.impacts}; failures ${world.failures}`);
    assert.equal(world.shots, level.par);
    assert.equal(world.failures, 0);
    assert.ok(pointInPolygon(world.x, world.y, level.goal));
  });
}

test('all rooms contain maximum-speed launches across 48 directions', () => {
  for (const level of LEVELS) {
    for (let angle = 0; angle < CONFIG.tests.stressAngles; angle++) {
      const world = createWorld(level);
      launch(world, angle / CONFIG.tests.stressAngles * Math.PI * 2, 1);
      let steps = 0;
      while (world.status === 'moving' && steps++ < CONFIG.tests.maxSteps) {
        stepWorld(world);
        assert.ok(world.x >= 60 && world.x <= 1140 && world.y >= 60 && world.y <= 740, `Escaped level ${level.id} at angle ${angle}`);
        assert.ok(Number.isFinite(world.x) && Number.isFinite(world.y));
      }
      assert.notEqual(world.status, 'moving');
    }
  }
});


