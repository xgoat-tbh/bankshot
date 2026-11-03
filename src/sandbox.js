import { CONFIG } from './config.js';
import { createWorld, stepWorld, pointInPolygon } from './physics.js';
import { Input } from './input.js';
import { Renderer } from './render.js';
import { ClearanceEngine, validateClearance } from './clearance.js';

// The practice world shares controls and visuals, but never receives a career store.
export class Sandbox {
  constructor(canvas, status, sensitivity = 1, settings = {}) {
    this.canvas = canvas;
    this.status = status;
    this.settings = { aimPreview: true, reducedMotion: false, ...settings };
    const gx = 1380, gy = 240, w = 48, h = 46, ct = 14;
    this.level = {
      id: 0, name: 'Practice', par: 1, puck: [220, 660],
      goal: [[gx-w+ct,gy-h],[gx+w,gy-h],[gx+w,gy+h-ct],[gx+w-ct,gy+h],[gx-w,gy+h],[gx-w,gy-h+ct]],
      walls: CONFIG.world.boundary.map((a, i, points) => ({ a, b: points[(i + 1) % points.length], mat: 'solid' }))
        .concat([{ a: [720, 260], b: [980, 260], mat: 'rubber' }]),
      hazards: [[[1340, 720], [1460, 720], [1460, 760], [1340, 760]]],
      movingWalls: [{ a: [600, 720], b: [680, 720], delta: [30, 0], freq: 0.8, phase: 0 }],
      gravityWells: [{ x: 1050, y: 480, radius: 100, strength: 1800 }],
      bumpers: [{ x: 550, y: 420, radius: 30 }],
      portals: [{ id: 'practice', A: { x: 280, y: 240, nx: 1, ny: 0, radius: 30 }, B: { x: 1420, y: 480, nx: -1, ny: 0, radius: 30 } }],
    };
    this.initialLevel = structuredClone(this.level);
    this.placement = 'shoot';
    this.abort = new AbortController();
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'sandbox-toolbar';
    this.toolbar.setAttribute('role', 'toolbar');
    this.toolbar.setAttribute('aria-label', 'Practice object placement');
    for (const [mode, label] of [['shoot','SHOOT'],['wall','WALL'],['bumper','BUMPER'],['portal','PORTALS'],['well','WELL'],['hazard','HAZARD']]) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label; button.dataset.place = mode;
      button.setAttribute('aria-pressed', String(mode === 'shoot'));
      this.toolbar.append(button);
    }
    canvas.before(this.toolbar);
    this.toolbar.addEventListener('click', event => {
      const button = event.target.closest('[data-place]');
      if (!button) return;
      this.input.cancel(); this.anchor = null; this.placement = button.dataset.place;
      this.input.enabled = this.placement === 'shoot';
      for (const control of this.toolbar.children) control.setAttribute('aria-pressed', String(control === button));
      this.status.textContent = this.placement === 'shoot'
        ? `PRACTICE ONLY / ${this.world.shots} SHOTS`
        : `PLACE ${this.placement.toUpperCase()} / CLICK THE ARENA`;
    }, { signal: this.abort.signal });
    canvas.addEventListener('pointerdown', event => {
      if (this.placement === 'shoot') return;
      event.preventDefault(); event.stopImmediatePropagation();
      this.place(this.renderer.toWorld(event.clientX, event.clientY));
    }, { capture: true, signal: this.abort.signal });
    canvas.addEventListener('keydown', event => {
      if (event.code === 'KeyR' && this.placement !== 'shoot') { event.preventDefault(); event.stopImmediatePropagation(); this.reset(); }
    }, { capture: true, signal: this.abort.signal });
    this.renderer = new Renderer(canvas);
    this.renderer.reducedMotion = this.settings.reducedMotion;
    this.renderer.highDpi = settings.highDpi !== false;
    this.reset();
    this.input = new Input(canvas, this.renderer, () => this.world, {
      kind() {}, shot() {}, pause() {}, restart: () => this.reset(),
    }, { keyboardTarget: canvas, pointerTarget: canvas });
    this.input.enabled = true;
    this.input.touchSensitivity = sensitivity;
    this.observer = new ResizeObserver(() => {
      this.input.cancel();
      this.renderer.resize();
    });
    this.observer.observe(canvas);
    this.running = true;
    this.frame = requestAnimationFrame(this.tick);
  }

  reset() {
    this.input?.reset();
    this.placement = 'shoot';
    if (this.input) this.input.enabled = true;
    for (const control of this.toolbar.children) control.setAttribute('aria-pressed', String(control.dataset.place === 'shoot'));
    this.level = structuredClone(this.initialLevel);
    this.anchor = null;
    this.rebuild();
  }

  rebuild() {
    this.world = createWorld(this.level);
    this.accumulator = 0;
    this.last = performance.now();
    this.wonAt = null;
    this.renderer.setWorld(this.world, 'practice', this.last / 1000);
    this.status.textContent = this.placement === 'shoot'
      ? `PRACTICE ONLY / ${this.world.shots} SHOTS`
      : `PLACE ${this.placement.toUpperCase()} / ${this.anchor ? 'SELECT SECOND POINT' : 'CLICK THE ARENA'}`;
  }

  place(point) {
    const p = [point.x, point.y];
    if (!pointInPolygon(...p, CONFIG.world.boundary) || p[0] < 110 || p[0] > CONFIG.world.width - 110 || p[1] < 120 || p[1] > CONFIG.world.height - 120) return;
    const testLevel = structuredClone(this.level);
    if (this.placement === 'bumper') {
      const b = {x:p[0],y:p[1],radius:30};
      testLevel.bumpers.push(b);
      if (validateClearance(testLevel).length) return;
      this.level.bumpers.push(b);
    } else if (this.placement === 'well') {
      const w = {x:p[0],y:p[1],radius:100,strength:1800};
      testLevel.gravityWells.push(w);
      if (validateClearance(testLevel).length) return;
      this.level.gravityWells.push(w);
    } else {
      if (!this.anchor) { this.anchor = p; return; }
      if (Math.hypot(p[0]-this.anchor[0],p[1]-this.anchor[1]) < 60) return;
      const a = this.anchor;
      if (this.placement === 'wall') {
        const wl = {a,b:p,mat:'solid'};
        testLevel.walls.push(wl);
        if (validateClearance(testLevel).length) { this.anchor = null; return; }
        this.level.walls.push(wl);
      } else if (this.placement === 'portal') {
        const prt = {id:`custom-${this.level.portals.length}`,A:{x:a[0],y:a[1],nx:1,ny:0,radius:30},B:{x:p[0],y:p[1],nx:-1,ny:0,radius:30}};
        testLevel.portals.push(prt);
        if (validateClearance(testLevel).length) { this.anchor = null; return; }
        this.level.portals.push(prt);
      } else if (this.placement === 'hazard') {
        const hz = [[a[0],a[1]],[p[0],a[1]],p,[a[0],p[1]]];
        testLevel.hazards.push(hz);
        if (validateClearance(testLevel).length) { this.anchor = null; return; }
        this.level.hazards.push(hz);
      }
      this.anchor = null;
    }
    this.rebuild();
  }

  tick = now => {
    if (!this.running) return;
    const elapsed = document.hidden ? 0 : Math.max(0, Math.min(CONFIG.physics.maxFrame, (now - this.last) / 1000));
    this.last = now;
    if (document.hidden) this.input.cancel();
    this.input.update(elapsed);
    this.accumulator += elapsed;
    while (this.accumulator >= CONFIG.physics.step) {
      stepWorld(this.world);
      this.accumulator -= CONFIG.physics.step;
    }
    if (this.world.status === 'won') {
      this.status.textContent = 'ON TARGET / PRACTICE AGAIN';
      this.wonAt ??= now;
      if (now - this.wonAt > 1500) this.reset();
    } else {
      const power = this.input.aiming ? ` / POWER ${Math.round(this.input.power * 100)}%` : '';
      this.status.textContent = this.placement === 'shoot' ? `PRACTICE ONLY / ${this.world.shots} SHOTS${power}` : `PLACE ${this.placement.toUpperCase()} / ${this.anchor ? 'SELECT SECOND POINT' : 'CLICK THE ARENA'}`;
    }
    this.renderer.draw(now / 1000, this.accumulator / CONFIG.physics.step, this.input, this.settings);
    this.frame = requestAnimationFrame(this.tick);
  };

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.input.destroy();
    this.abort.abort();
    this.toolbar.remove();
  }
}
