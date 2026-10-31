import test from 'node:test';
import assert from 'node:assert/strict';
import * as input from '../src/input.js';
import { CONFIG } from '../src/config.js';

test('precise placement powers remain accessible beyond the cancel zone on touch and edges', () => {
  assert.equal(typeof input.calculateDragPower, 'function');
  const cancel = CONFIG.input.cancelPixels;
  for (const range of [24, 80, 210]) {
    assert.equal(input.calculateDragPower(cancel - 1, range), 0);
    assert.equal(input.calculateDragPower(cancel, range), 0);
    assert.equal(input.calculateDragPower(range * 2, range), 1);
    for (const power of [0.035, 0.07, 0.7, 1]) {
      const length = cancel + Math.sqrt(power) * (range - cancel);
      assert.ok(length > cancel);
      assert.ok(Math.abs(input.calculateDragPower(length, range) - power) < 1e-10);
    }
  }
});

test('keyboard can charge the smallest reference placement shot', () => {
  assert.ok(CONFIG.input.minimumPower <= 0.035);
});


