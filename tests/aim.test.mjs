import test from 'node:test';
import assert from 'node:assert/strict';
import * as physics from '../src/physics.js';
import { CONFIG } from '../src/config.js';
import { Renderer } from '../src/render.js';
import { aimPreviewLength } from '../src/render.js';
import { generateRoom } from '../src/generator.js';

test('keyboard rotation shows only a needle; charging grows the full trajectory', () => {
  assert.equal(aimPreviewLength({lastInput:'keyboard',charging:false,power:1},2000),50);
  assert.equal(aimPreviewLength({lastInput:'keyboard',charging:true,power:0},2000),0);
  assert.equal(aimPreviewLength({lastInput:'keyboard',charging:true,power:.25},2000),500);
  assert.equal(aimPreviewLength({lastInput:'keyboard',charging:true,power:1},2000),2000);
  assert.equal(aimPreviewLength({lastInput:'touch',dragging:true,power:.25},2000),2000);
});

test('renderer draws v3 vectors, bounded streak embers, portal guides and density settings', () => {
  const gradient = { addColorStop() {} };
  const context = new Proxy({ createLinearGradient: () => gradient, createRadialGradient: () => gradient }, { get: (target, key) => key in target ? target[key] : () => {} });
  const canvas = () => ({ getContext: () => context, getBoundingClientRect: () => ({ width: 1200, height: 900, left: 0, top: 0 }) });
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = { createElement: canvas };
  globalThis.window = { devicePixelRatio: 3 };
  try {
    const renderer = new Renderer(canvas());
    const world = physics.createWorld(generateRoom(50, 'render-smoke'));
    world.winStreak = 3;
    renderer.setWorld(world, 'game', 0);
    assert.equal(renderer.dpr, 2);
    renderer.highDpi = false;
    renderer.resize();
    assert.equal(renderer.dpr, 1);
    world.status = 'moving';
    for (let i = 0; i < 60; i++) renderer.draw(i / 60, 1, { aiming: false, angle: 0 }, { reducedMotion: false });
    assert.ok(renderer.embers.length > 0 && renderer.embers.length <= 32);
    world.status = 'won';
    world.shots = 1;
    renderer.draw(1.1, 1, { aiming: false, angle: 0 }, { reducedMotion: false });
    renderer.draw(1.2, 1, { aiming: false, angle: 0 }, { reducedMotion: true });
    assert.equal(renderer.embers.length, 0);
    const portalWorld = physics.createWorld({ puck: [100, 100], walls: [], goal: [], hazards: [], portals: [{ A: { x: 160, y: 100, nx: -1, ny: 0, radius: 20 }, B: { x: 600, y: 300, nx: 0, ny: 1, radius: 20 } }] });
    renderer.drawAim(context, portalWorld, 0, false, 1);
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});

test('aim ray crosses a portal and starts a separate exit segment', () => {
  const world = physics.createWorld({ puck: [100, 100], walls: [], goal: [], hazards: [], portals: [{ A: { x: 160, y: 100, nx: -1, ny: 0, radius: 20 }, B: { x: 600, y: 300, nx: 0, ny: 1, radius: 20 } }] });
  const path = physics.getAimTrajectory(world, 0, 300);
  assert.equal(path.hasPortal, true);
  assert.ok(path.segments.length >= 2);
  assert.ok(path.segments[1].y0 > 330);
  assert.ok(path.segments[1].y1 > path.segments[1].y0);
});

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

test('gravity preview follows the launched trajectory without mutating live physics', () => {
  const world = physics.createWorld({ puck: [100, 100], walls: [], goal: [], hazards: [], gravityWells: [{ x: 180, y: 170, radius: 200, strength: 1800 }] });
  const before = JSON.stringify(world);
  const preview = physics.getAimTrajectory(world, 0, 400, 0.25);
  assert.equal(preview.hasGravity, true);
  assert.ok(preview.segments.length > 2);
  assert.ok(preview.segments[3].y1 > 100);
  assert.equal(JSON.stringify(world), before);
  const replay = physics.createWorld(world.level);
  physics.launch(replay, 0, 0.25);
  for (let i = 0; i < preview.steps; i++) physics.stepWorld(replay);
  assert.ok(Math.hypot(preview.x2 - replay.x, preview.y2 - replay.y) < 1e-7);
  const weaker = physics.getAimTrajectory(world, 0, 400, 0.1);
  assert.notDeepEqual(weaker.segments, preview.segments);
});

test('pointer coordinates refresh after canvas scrolling without a resize', () => {
  const renderer = { canvas: { getBoundingClientRect: () => ({ left: 25, top: 70 }) }, left: 0, top: 0, x: 10, y: 20, scale: 2, pointerPoint: {} };
  assert.deepEqual(Renderer.prototype.toWorld.call(renderer, 75, 130), { x: 20, y: 20 });
});

test('portal preview retains the pull-back indicator while dragging', () => {
  const world = physics.createWorld({ puck: [100, 100], walls: [], goal: [], hazards: [], portals: [{ A: { x: 160, y: 100, nx: -1, ny: 0, radius: 20 }, B: { x: 600, y: 300, nx: 0, ny: 1, radius: 20 } }] });
  const lines = [];
  const context = new Proxy({ lineTo: (x, y) => lines.push([x, y]) }, { get: (target, key) => key in target ? target[key] : () => {} });
  Renderer.prototype.drawAim.call({}, context, world, 0, true, 1);
  assert.ok(lines.some(([x, y]) => x < world.x && y === world.y));
});

test('oblique bumper preview matches normal-only restitution in the live shot', () => {
  const world = physics.createWorld({ puck: [126, 400], walls: [], goal: [], hazards: [], bumpers: [{ x: 160, y: 400, radius: 20, restitution: 1.25 }] });
  const preview = physics.getAimTrajectory(world, Math.PI / 6, 500, 0.5);
  physics.launch(world, Math.PI / 6, 0.5);
  physics.stepWorld(world);
  const ray = preview.segments[1];
  const predicted = Math.atan2(ray.y1 - ray.y0, ray.x1 - ray.x0);
  const actual = Math.atan2(world.vy, world.vx);
  assert.ok(Math.abs(predicted - actual) < 1e-8, `${predicted} != ${actual}`);
  assert.ok(Math.abs(Math.hypot(ray.x1 - ray.x0, ray.y1 - ray.y0) - 500) < 1e-7);
});
