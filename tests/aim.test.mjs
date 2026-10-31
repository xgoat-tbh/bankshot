import test from 'node:test';
import assert from 'node:assert/strict';
import * as physics from '../src/physics.js';
import { CONFIG } from '../src/config.js';

test('trajectory hits swept radius then reflects across the exact normal', () => {
  assert.equal(typeof physics.getAimTrajectory, 'function');
  const world = physics.createWorld({ puck: [100, 100], walls: [{ a: [200, 0], b: [200, 400], mat: 'solid' }], goal: [], hazards: [] });
  const aim = physics.getAimTrajectory(world, Math.PI / 4, 300);
  assert.equal(aim.hasBounce, true);
  assert.ok(Math.abs(aim.x1 - 186) < 1e-8);
  const incoming = [Math.SQRT1_2, Math.SQRT1_2];
  const reflectedStartX = aim.x1 + aim.normal.x * CONFIG.physics.separation;
  const reflectedStartY = aim.y1 + aim.normal.y * CONFIG.physics.separation;
  const length = Math.hypot(aim.x2 - reflectedStartX, aim.y2 - reflectedStartY);
  const dot = incoming[0] * aim.normal.x + incoming[1] * aim.normal.y;
  assert.ok(Math.abs((aim.x2 - reflectedStartX) / length - (incoming[0] - 2 * dot * aim.normal.x)) < 1e-8);
  assert.ok(Math.abs(Math.hypot(aim.x1 - aim.x0, aim.y1 - aim.y0) + length - 300) < 1e-8);
});

test('empty or inactive walls produce an unreflected finite ray', () => {
  const world = physics.createWorld({ puck: [100, 100], walls: [], goal: [], hazards: [] });
  const aim = physics.getAimTrajectory(world, 0, 50);
  assert.equal(aim.hasBounce, false);
  assert.equal(aim.x1, 150);
  assert.equal(aim.x2, 150);
});

test('exhausted finite budget blocks launch before consuming a shot', () => {
  const world = physics.createWorld({ puck: [100, 100], walls: [], goal: [], hazards: [] });
  world.budget = 1;
  world.shots = 1;
  assert.equal(physics.launch(world, 0, 0.5), false);
  assert.equal(world.status, 'ready');
  assert.equal(world.shots, 1);
});

test('reflected trajectory terminates at the next swept wall and retains first normal', () => {
  const world = physics.createWorld({ puck: [100, 100], walls: [
    { a: [200, 0], b: [200, 400], mat: 'solid' },
    { a: [0, 250], b: [200, 250], mat: 'solid' },
  ], goal: [], hazards: [] });
  const aim = physics.getAimTrajectory(world, Math.PI / 4, 500);
  assert.ok(Math.abs(aim.y2 - 236) < 1e-8);
  assert.deepEqual(aim.normal, { x: -1, y: 0 });
});
