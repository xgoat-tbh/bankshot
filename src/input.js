import { CONFIG } from './config.js';
import { launch } from './physics.js';

const I = CONFIG.input;

// Preserve a no-shot dead zone while giving soft placement shots useful travel
// on both small touchscreens and an edge-limited drag.
export function calculateDragPower(distance, range) {
  const normalized = Math.max(0, Math.min(1, (distance - I.cancelPixels) / Math.max(1, range - I.cancelPixels)));
  return normalized * normalized;
}

export class Input {
  constructor(canvas, renderer, getWorld, handlers, { keyboardTarget = window, pointerTarget = document } = {}) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.getWorld = getWorld;
    this.handlers = handlers;
    this.keyboardTarget = keyboardTarget;
    this.enabled = false;
    this.pointerId = null;
    this.dragging = false;
    this.charging = false;
    this.aiming = false;
    this.angle = I.defaultAngle;
    this.power = I.defaultPower;
    this.dragLength = 0;
    this.startX = 0;
    this.startY = 0;
    this.pointerKind = 'mouse';
    this.turnLeft = false;
    this.turnRight = false;
    this.fine = false;
    this.lastInput = 'mouse';
    this.abort = new AbortController();
    const options = { signal: this.abort.signal };
    canvas.addEventListener('pointerdown', this.pointerDown, options);
    canvas.addEventListener('pointermove', this.pointerMove, options);
    canvas.addEventListener('pointerup', this.pointerUp, options);
    canvas.addEventListener('pointercancel', this.pointerCancel, options);
    canvas.addEventListener('lostpointercapture', this.pointerCancel, options);
    keyboardTarget.addEventListener('keydown', this.keyDown, options);
    keyboardTarget.addEventListener('keyup', this.keyUp, options);
    window.addEventListener('blur', this.cancel, options);
    pointerTarget.addEventListener('pointerdown', this.detectPointer, options);
    if (keyboardTarget === canvas) canvas.addEventListener('blur', this.cancel, options);
  }

  setKind(kind) {
    if (this.lastInput === kind) return;
    this.lastInput = kind;
    this.handlers.kind(kind);
  }

  detectPointer = (event) => { this.setKind(event.pointerType === 'touch' ? 'touch' : 'mouse'); };

  pointerDown = (event) => {
    const world = this.getWorld();
    if (!this.enabled || event.button !== 0 || !event.isPrimary || this.pointerId !== null || this.charging || world.status !== 'ready') return;
    const point = this.renderer.toWorld(event.clientX, event.clientY);
    const distance = Math.hypot(point.x - world.x, point.y - world.y) * this.renderer.scale;
    if (distance > Math.max(I.hitPixels, CONFIG.world.radius * this.renderer.scale)) return;
    event.preventDefault();
    this.canvas.focus({ preventScroll: true });
    this.pointerId = event.pointerId;
    this.pointerKind = event.pointerType;
    this.canvas.setPointerCapture(event.pointerId);
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.dragLength = 0;
    this.power = 0;
    this.dragging = true;
    this.aiming = true;
  };

  pointerMove = (event) => {
    if (event.pointerId !== this.pointerId || !this.dragging) return;
    this.pendingPointer = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
    if (this.pointerFrame != null) return;
    this.pointerFrame = requestAnimationFrame(() => {
      this.pointerFrame = null;
      const latest = this.pendingPointer;
      this.pendingPointer = null;
      if (latest) this.applyPointer(latest);
    });
  };

  applyPointer = (event) => {
    if (event.pointerId !== this.pointerId || !this.dragging) return;
    const dx = this.startX - event.clientX;
    const dy = this.startY - event.clientY;
    this.dragLength = Math.hypot(dx, dy);
    if (this.dragLength <= CONFIG.physics.epsilon) { this.power = 0; return; }
    const maxDrag = this.pointerKind === 'touch' ? I.touchDragPixels / (this.touchSensitivity || 1) : I.dragPixels;
    // Edge-aware calibration keeps full power reachable on a small screen.
    const localX = this.startX - this.renderer.left;
    const localY = this.startY - this.renderer.top;
    const edgeX = Math.abs(dx) > CONFIG.physics.epsilon ? (dx > 0 ? localX : this.renderer.width - localX) * this.dragLength / Math.abs(dx) : Infinity;
    const edgeY = Math.abs(dy) > CONFIG.physics.epsilon ? (dy > 0 ? localY : this.renderer.height - localY) * this.dragLength / Math.abs(dy) : Infinity;
    // Reserve a usable soft-shot interval even when the puck is near an edge.
    const range = Math.max(Math.min(maxDrag, I.cancelPixels * 4), Math.min(maxDrag, Math.min(edgeX, edgeY) * I.edgePowerFactor));
    this.power = calculateDragPower(this.dragLength, range);
    this.angle = Math.atan2(dy, dx);
  };

  pointerUp = (event) => {
    if (event.pointerId !== this.pointerId) return;
    this.applyPointer(event);
    if (this.enabled && this.dragLength >= I.cancelPixels) this.fire();
    this.cancel();
  };

  pointerCancel = (event) => {
    if (event.pointerId === this.pointerId) this.cancel();
  };

  keyDown = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (this.keyboardTarget === this.canvas && (event.code.startsWith('Arrow') || event.code === 'Space' || event.code === 'KeyR')) event.stopPropagation();
    this.setKind('keyboard');
    if (event.code === 'KeyH' && !event.repeat) {
      event.preventDefault();
      this.cancel();
      this.handlers.guide?.();
      return;
    }
    if (event.code === 'Escape') {
      event.preventDefault();
      if (!event.repeat) this.handlers.pause();
      return;
    }
    if (!this.enabled) return;
    const isControl = event.target instanceof Element && event.target.closest('button, input, select, a');
    if (isControl && (event.code === 'Space' || event.code === 'Enter')) return;
    if (event.code === 'KeyR' && !event.repeat) {
      event.preventDefault();
      this.cancel();
      this.handlers.restart();
      return;
    }
    if (this.getWorld().status !== 'ready' || this.dragging) return;
    if (event.code.startsWith('Arrow')) {
      event.preventDefault();
      this.aiming = true;
      this.fine = event.shiftKey;
      if (event.code === 'ArrowLeft' || event.code === 'ArrowUp') this.turnLeft = true;
      else this.turnRight = true;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat && !this.charging) {
        this.power = 0;
        this.charging = true;
        this.aiming = true;
      }
    }
  };

  keyUp = (event) => {
    if (this.keyboardTarget === this.canvas && (event.code.startsWith('Arrow') || event.code === 'Space')) event.stopPropagation();
    if (event.code === 'ArrowLeft' || event.code === 'ArrowUp') this.turnLeft = false;
    if (event.code === 'ArrowRight' || event.code === 'ArrowDown') this.turnRight = false;
    this.fine = event.shiftKey;
    if (event.code === 'Space' && this.charging) {
      event.preventDefault();
      if (this.enabled && this.power >= I.minimumPower) this.fire();
      this.charging = false;
      this.aiming = false;
    }
  };

  fire() {
    if (launch(this.getWorld(), this.angle, this.power)) this.handlers.shot();
    this.aiming = false;
  }

  update(dt) {
    if (!this.enabled) return;
    const direction = Number(this.turnRight) - Number(this.turnLeft);
    this.angle += direction * I.turnSpeed * (this.fine ? I.fineTurnFactor : 1) * dt;
    if (this.charging) this.power = Math.min(1, this.power + dt / I.chargeSeconds);
  }

  cancel = () => {
    if (this.pointerFrame != null) cancelAnimationFrame(this.pointerFrame);
    this.pointerFrame = null;
    this.pendingPointer = null;
    const pointer = this.pointerId;
    this.pointerId = null;
    this.dragging = false;
    this.charging = false;
    this.aiming = false;
    this.turnLeft = false;
    this.turnRight = false;
    this.dragLength = 0;
    this.fine = false;
    if (pointer !== null && this.canvas.hasPointerCapture(pointer)) this.canvas.releasePointerCapture(pointer);
  };

  reset() {
    this.cancel();
    this.angle = I.defaultAngle;
    this.power = I.defaultPower;
  }

  destroy() {
    this.cancel();
    this.abort.abort();
  }
}
