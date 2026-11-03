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

test('high-frequency pointer motion coalesces to the latest sample per frame', () => {
 const oldRequest=globalThis.requestAnimationFrame;
 let callback, requests=0; globalThis.requestAnimationFrame=fn=>{callback=fn;requests++;return 1;};
 try {
  const samples=[];
  const previousWindow=globalThis.window,previousDocument=globalThis.document;
  const target={addEventListener(){},hasPointerCapture(){return false;}};
  globalThis.window=target;globalThis.document=target;
  const instance=new input.Input(target,{},()=>({status:'ready'}),{kind(){}});
  instance.pointerId=7;instance.dragging=true;instance.applyPointer=event=>samples.push(event.clientX);
  for(let i=0;i<1000;i++)instance.pointerMove({pointerId:7,clientX:i,clientY:0});
  assert.equal(requests,1);callback();assert.deepEqual(samples,[999]);instance.destroy();
  globalThis.window=previousWindow;globalThis.document=previousDocument;
 } finally { globalThis.requestAnimationFrame=oldRequest; }
});

test('blur and cancellation clear fine aim and held controls without firing', () => {
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  const listeners = new Map();
  const target = { addEventListener: (name, fn) => listeners.set(name, fn), hasPointerCapture: () => false };
  globalThis.window = target; globalThis.document = target;
  try {
    const controls = new input.Input(target, {}, () => ({ status: 'ready' }), { kind() {}, shot() { assert.fail('cancel fired'); } });
    controls.fine = true; controls.turnLeft = true; controls.charging = true;
    listeners.get('blur')();
    assert.equal(controls.fine, false);
    assert.equal(controls.turnLeft, false);
    assert.equal(controls.charging, false);
    controls.destroy();
  } finally { globalThis.window = previousWindow; globalThis.document = previousDocument; }
});


