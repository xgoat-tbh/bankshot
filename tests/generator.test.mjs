import test from 'node:test';
import assert from 'node:assert/strict';
import * as generator from '../src/generator.js';
import { simulateSolution } from '../src/physics.js';

test('v3 elements unlock at exact thresholds and retain verified deterministic replays', () => {
  for (const index of [9, 10, 14, 15, 19, 20, 24, 25, 29, 30, 34, 35, 49, 50, 75, 100000]) {
    const room = generator.generateRoom(index, 'v3-elements');
    for (const [key, threshold] of [['movingWalls', 15], ['bumpers', 25], ['portals', 35], ['gravityWells', 50]]) assert.equal(room[key]?.length > 0, index >= threshold, `${key} ${index}`);
    const goalCenter = room.goal.reduce((sum, point) => [sum[0] + point[0] / room.goal.length, sum[1] + point[1] / room.goal.length], [0, 0]);
    const elements = [...room.bumpers, ...room.gravityWells, ...room.portals.flatMap(pair => [pair.A, pair.B])];
    for (const element of elements) {
      assert.ok(Math.hypot(element.x - room.puck[0], element.y - room.puck[1]) > element.radius + 14);
      assert.ok(Math.hypot(element.x - goalCenter[0], element.y - goalCenter[1]) > element.radius + 60);
    }
    assert.equal(simulateSolution(room).status, 'won');
    assert.deepEqual(room, generator.generateRoom(index, 'v3-elements'));
  }
});

test('seeded procedural rooms have executable bank solutions and progression geometry', () => {
  assert.equal(typeof generator.generateRoom, 'function');
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    const index = i < 45 ? i + 1 : 1000000 + i;
    const room = generator.generateRoom(index, `player-${i % 5}`);
    assert.deepEqual(room, generator.generateRoom(index, `player-${i % 5}`));
    assert.equal(room.id, index);
    assert.equal(room.walls.length - 8, Math.min(8, 2 + Math.floor(room.id / 5)));
    assert.equal(room.aimLength, Math.max(450, 2400 - room.id * 25));
    assert.equal(Math.max(...room.goal.map(p => p[0])) - Math.min(...room.goal.map(p => p[0])), 2 * Math.max(32, 48 - Math.floor(room.id / 10) * 2));
    assert.equal(room.hazards.length > 0, room.id >= 30);
    assert.equal(room.par, room.id > 40 ? 3 : room.id > 20 ? 2 : 1);
    for (const wall of room.walls.slice(8)) {
      const dx = Math.abs(wall.b[0] - wall.a[0]);
      const dy = Math.abs(wall.b[1] - wall.a[1]);
      assert.ok(dx === 0 || dy === 0 || Math.abs(dx - dy) < 1e-8);
      for (const [x, y] of [wall.a, wall.b]) assert.ok(x >= 90 && x <= 1110 && y >= 90 && y <= 710);
      if (room.id < 10) assert.equal(wall.mat, 'solid');
      if (room.id < 20) assert.notEqual(wall.mat, 'glass');
    }
    const result = simulateSolution(room);
    assert.equal(result.status, 'won', `room ${room.id}`);
    assert.ok(result.impacts > 0, 'solution must involve a bank');
    seen.add(JSON.stringify(room.walls));
  }
  assert.equal(seen.size, 60);
});

test('fallback stays verified and provider evicts rooms without changing replay', () => {
  assert.equal(typeof generator.createRoomProvider, 'function');
  const provider = generator.createRoomProvider('cache', 3);
  const original = provider.getRoom(40);
  assert.equal(provider(1).id, 1);
  for (let i = 1; i <= 10; i++) provider.getRoom(i);
  assert.deepEqual(provider.getRoom(40), original);
  const room = generator.generateRoom(1000, 'fallback', { maxAttempts: 0 });
  assert.equal(room.generation.fallback, true);
  assert.equal(room.walls.length, 16);
  assert.ok(room.hazards.length);
  assert.equal(simulateSolution(room).status, 'won');
});

test('forced fallback remains verified across all difficulty transitions', () => {
  for (let index = 1; index <= 100; index++) {
    const room = generator.generateRoom(index, 'forced', { maxAttempts: 0 });
    assert.equal(simulateSolution(room).status, 'won', `fallback ${index}`);
  }
});

test('changing player performance cannot alter persistent room geometry after eviction', () => {
  const baseRoom = generator.generateRoom(10, 'seed123', { performanceRatio: 1.25 });
  const baseWalls = baseRoom.walls.length - 8;
  assert.equal(baseWalls, 4); // 2 + floor(10/5) = 4

  const hardRoom = generator.generateRoom(10, 'seed123', { performanceRatio: 0.90 });
  const hardWalls = hardRoom.walls.length - 8;
  assert.equal(hardWalls, baseWalls);
  assert.equal(simulateSolution(hardRoom).status, 'won');

  const skilledRoom = generator.generateRoom(10, 'seed123', { performanceRatio: 1.05 });
  const skilledWalls = skilledRoom.walls.length - 8;
  assert.equal(skilledWalls, baseWalls);
  assert.equal(simulateSolution(skilledRoom).status, 'won');

  const easyRoom = generator.generateRoom(10, 'seed123', { performanceRatio: 1.60 });
  const easyWalls = easyRoom.walls.length - 8;
  assert.equal(easyWalls, baseWalls);
  assert.equal(simulateSolution(easyRoom).status, 'won');
  let ratio = 0.9;
  const provider = generator.createRoomProvider('seed123', 1, () => ratio);
  const original = provider(10);
  provider(11);
  ratio = 2;
  assert.deepEqual(provider(10), original);
  assert.deepEqual(generator.createRoomProvider('seed123')(10), original);
});
