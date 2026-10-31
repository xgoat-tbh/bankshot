import { CONFIG } from './config.js';
import { createWorld, launch, stepWorld } from './physics.js';
// An isolated practice world: it never receives the career store or game input.
export class Sandbox {
    constructor(canvas, status, sensitivity = 1) {
        this.canvas = canvas;
        this.status = status;
        this.sensitivity = sensitivity;
        this.abort = new AbortController();
        this.level = {
            id: 0, name: 'Practice', par: 1, puck: [250, 570],
            goal: [[930, 190], [1010, 190], [1030, 210], [1030, 280], [950, 280], [930, 260]],
            walls: CONFIG.world.boundary.map((a, i, points) => ({ a, b: points[(i + 1) % points.length], mat: 'solid' })).concat([{ a: [440, 340], b: [730, 340], mat: 'rubber' }]),
            hazards: [], movingWalls: [], gravityWells: [],
            bumpers: [{ x: 780, y: 560, radius: 40, restitution: 1.25 }],
            portals: [{ id: 'practice', A: { x: 420, y: 180, nx: 1, ny: 0, radius: 30 }, B: { x: 850, y: 230, nx: 1, ny: 0, radius: 30 }, cooldown: 0 }],
        };
        this.reset();
        const opts = { signal: this.abort.signal };
        canvas.addEventListener('pointerdown', event => {
            if (this.world.status !== 'ready' || this.pointer != null || event.isPrimary === false || event.button !== 0)
                return;
            const point = this.point(event);
            if (Math.hypot(point.x - this.world.x, point.y - this.world.y) > 100)
                return;
            event.preventDefault();
            canvas.focus({ preventScroll: true });
            this.pointer = event.pointerId;
            this.drag = point;
            this.origin = { x: this.world.x, y: this.world.y };
            canvas.setPointerCapture(event.pointerId);
        }, opts);
        canvas.addEventListener('pointermove', event => {
            if (this.pointer !== event.pointerId)
                return;
            event.preventDefault();
            this.drag = this.point(event);
        }, opts);
        canvas.addEventListener('pointerup', event => {
            if (this.pointer !== event.pointerId)
                return;
            event.preventDefault();
            this.drag = this.point(event);
            const dx = this.origin.x - this.drag.x, dy = this.origin.y - this.drag.y;
            if (Math.hypot(dx, dy) > 20)
                launch(this.world, Math.atan2(dy, dx), Math.min(1, Math.pow(Math.hypot(dx, dy) / (360 / this.sensitivity), 2)));
            this.pointer = null;
            this.drag = null;
            if (canvas.hasPointerCapture(event.pointerId))
                canvas.releasePointerCapture(event.pointerId);
        }, opts);
        const cancel = event => {
            if (event.pointerId !== this.pointer)
                return;
            this.pointer = null;
            this.drag = null;
            if (canvas.hasPointerCapture(event.pointerId))
                canvas.releasePointerCapture(event.pointerId);
        };
        canvas.addEventListener('pointercancel', cancel, opts);
        canvas.addEventListener('lostpointercapture', cancel, opts);
        canvas.addEventListener('keydown', event => {
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) {
                event.preventDefault();
                event.stopPropagation();
                if (event.key === ' ')
                    launch(this.world, this.angle || -.55, .55);
                else
                    this.angle = (this.angle || -.55) + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) * (event.shiftKey ? .025 : .12);
            }
        }, opts);
        this.running = true;
        this.last = performance.now();
        this.frame = requestAnimationFrame(this.tick);
    }
    point(event) {
        const rect = this.canvas.getBoundingClientRect();
        return { x: (event.clientX - rect.left) * 1200 / rect.width, y: (event.clientY - rect.top) * 800 / rect.height };
    }
    reset() {
        this.world = createWorld(this.level);
        this.drag = null;
        this.pointer = null;
        this.status.textContent = 'PRACTICE ONLY / PULL BACK FROM THE PUCK';
        this.wonAt = null;
    }
    tick = now => {
        if (!this.running)
            return;
        const elapsed = Math.min(.05, (now - this.last) / 1000);
        this.last = now;
        for (let time = 0; time < elapsed; time += CONFIG.physics.step)
            stepWorld(this.world, Math.min(CONFIG.physics.step, elapsed - time));
        if (this.world.status === 'won') {
            this.status.textContent = 'ON TARGET / PRACTICE AGAIN';
            this.wonAt ??= now;
            if (now - this.wonAt > 1500)
                this.reset();
        }
        else if (this.status.textContent !== `PRACTICE ONLY / ${this.world.shots} SHOTS`)
            this.status.textContent = `PRACTICE ONLY / ${this.world.shots} SHOTS`;
        this.draw();
        this.frame = requestAnimationFrame(this.tick);
    };
    draw() {
        const c = this.canvas.getContext('2d');
        const w = this.world;
        c.clearRect(0, 0, 1200, 800);
        c.fillStyle = '#0C1116';
        c.fillRect(0, 0, 1200, 800);
        for (const wall of w.walls) {
            if (wall.active === false)
                continue;
            c.strokeStyle = wall.mat === 'rubber' ? '#FF6B3D' : '#5B6670';
            c.lineWidth = wall.mat === 'rubber' ? 8 : 4;
            c.beginPath();
            c.moveTo(wall.ax, wall.ay);
            c.lineTo(wall.bx, wall.by);
            c.stroke();
        }
        c.strokeStyle = '#FF6B3D';
        c.fillStyle = '#FF6B3D22';
        c.lineWidth = 4;
        c.beginPath();
        w.goal.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p));
        c.closePath();
        c.fill();
        c.stroke();
        c.strokeStyle = '#FF9100';
        c.beginPath();
        c.arc(780, 560, 40, 0, Math.PI * 2);
        c.stroke();
        c.beginPath();
        c.arc(780, 560, 30, 0, Math.PI * 2);
        c.stroke();
        c.strokeStyle = '#00E5FF';
        for (const p of [this.level.portals[0].A, this.level.portals[0].B]) {
            c.beginPath();
            c.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            c.stroke();
        }
        if (this.drag) {
            c.setLineDash([12, 12]);
            c.strokeStyle = '#E9E6DF';
            c.lineWidth = 3;
            c.beginPath();
            c.moveTo(w.x, w.y);
            c.lineTo(w.x + (w.x - this.drag.x), w.y + (w.y - this.drag.y));
            c.stroke();
            c.setLineDash([]);
            c.strokeStyle = '#FF6B3D';
            c.beginPath();
            c.moveTo(w.x, w.y);
            c.lineTo(this.drag.x, this.drag.y);
            c.stroke();
        }
        c.fillStyle = '#E9E6DF';
        c.beginPath();
        c.arc(w.x, w.y, CONFIG.world.radius, 0, Math.PI * 2);
        c.fill();
    }
    destroy() {
        this.running = false;
        cancelAnimationFrame(this.frame);
        this.abort.abort();
        this.drag = null;
    }
}
