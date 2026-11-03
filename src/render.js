import { CONFIG, TAU, ease } from './config.js';
import { createWorld, getAimTrajectory } from './physics.js';

const C = CONFIG.palette;
const V = CONFIG.render;
const W = CONFIG.world;
const M = CONFIG.motion;
const AIM_DASH = [5, 5];

export function aimPreviewLength(input, maximum) {
  if (input.lastInput !== 'keyboard') return maximum;
  return input.charging ? maximum * Math.max(0, Math.min(1, input.power)) : 50;
}

function hexagon(ctx, radius) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = i * TAU / 6;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function polygon(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
}

function segment(ctx, ax, ay, bx, by) {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
}

function drawWall(ctx, wall, progress, color) {
  if (!wall.active || progress <= 0) return;
  const bx = wall.ax + wall.dx * progress;
  const by = wall.ay + wall.dy * progress;
  ctx.strokeStyle = color;
  if (wall.mat === 'rubber') {
    ctx.lineWidth = V.rubberWidth;
    const ox = wall.nx * V.rubberGap / 2;
    const oy = wall.ny * V.rubberGap / 2;
    segment(ctx, wall.ax + ox, wall.ay + oy, bx + ox, by + oy);
    segment(ctx, wall.ax - ox, wall.ay - oy, bx - ox, by - oy);
  } else if (wall.mat === 'glass') {
    ctx.lineWidth = V.glassWidth;
    segment(ctx, wall.ax, wall.ay, bx, by);
    for (let distance = V.glassSpacing; distance < wall.length * progress; distance += V.glassSpacing) {
      const x = wall.ax + wall.dx * distance / wall.length;
      const y = wall.ay + wall.dy * distance / wall.length;
      segment(ctx, x - wall.nx * V.glassTick / 2, y - wall.ny * V.glassTick / 2, x + wall.nx * V.glassTick / 2, y + wall.ny * V.glassTick / 2);
    }
  } else {
    ctx.lineWidth = V.solidWidth;
    segment(ctx, wall.ax, wall.ay, bx, by);
  }
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.cache = document.createElement('canvas');
    this.staticCtx = this.cache.getContext('2d');
    this.titleWorld = createWorld(CONFIG.render.titleScene);
    this.world = this.titleWorld;
    this.mode = 'title';
    this.width = 0;
    this.height = 0;
    this.scale = 1;
    this.x = 0;
    this.y = 0;
    this.dpr = 1;
    this.highDpi = true;
    this.version = -1;
    this.loadedAt = 0;
    this.tracing = true;
    this.reducedMotion = false;
    this.goalX = 0;
    this.goalY = 0;
    this.pointerPoint = { x: 0, y: 0 };
    this.setWorld(this.titleWorld, 'title', 0);
  }

  setWorld(world, mode, now) {
    this.world = world;
    this.mode = mode;
    this.loadedAt = now;
    this.ghosts = [];
    this.embers = [];
    this.lastEmberTime = -Infinity;
    this.lastGhostTime = -Infinity;
    this.wonAt = null;
    this.goalFlashed = false;
    this.aimCache = null;
    this.tracing = !this.reducedMotion;
    this.goalX = 0;
    this.goalY = 0;
    for (let i = 0; i < world.goal.length; i++) {
      this.goalX += world.goal[i][0] / world.goal.length;
      this.goalY += world.goal[i][1] / world.goal.length;
    }
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.left = rect.left;
    this.top = rect.top;
    this.dpr = this.highDpi ? Math.min(window.devicePixelRatio || 1, W.dprCap) : 1;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    const L = CONFIG.layout;
    const unit = Math.max(L.unitMin, Math.min(L.unitMax, Math.min(this.width, this.height) * L.unitVmin / 100));
    if (this.mode === 'practice') {
      this.scale = Math.max(CONFIG.physics.epsilon, Math.min(this.width / W.width, this.height / W.height));
      this.x = (this.width - W.width * this.scale) / 2;
      this.y = (this.height - W.height * this.scale) / 2;
    } else if (this.mode === 'title') {
      const mobile = this.width / this.height < L.portraitRatio;
      this.scale = mobile
        ? Math.min(this.width / W.width, this.height / W.height) * V.mobileTitleZoom
        : Math.min(this.width * V.titleWidth / W.width, this.height * V.titleHeight / W.height) * V.titleZoom;
      this.x = this.width * (mobile ? V.mobileTitleX : V.titleX) - W.width * this.scale / 2;
      this.y = this.height * (mobile ? V.mobileTitleY : V.titleY) - W.height * this.scale / 2;
    } else {
      const portrait = this.width / this.height < L.portraitRatio;
      const side = (portrait ? L.mobileSideUnits : L.sideUnits) * unit;
      const top = (portrait ? L.mobileTopUnits : L.topUnits) * unit;
      const bottom = (portrait ? L.mobileBottomUnits : L.bottomUnits) * unit;
      this.scale = Math.max(CONFIG.physics.epsilon, Math.min((this.width - side * 2) / W.width, (this.height - top - bottom) / W.height));
      this.x = (this.width - W.width * this.scale) / 2;
      this.y = top + (this.height - top - bottom - W.height * this.scale) / 2;
    }
    this.cache.width = Math.ceil(W.width * this.scale * this.dpr);
    this.cache.height = Math.ceil(W.height * this.scale * this.dpr);
    this.buildCache();
  }

  buildCache() {
    const ctx = this.staticCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.cache.width, this.cache.height);
    // Compensate for integer backing sizes so cached and dynamic geometry align.
    ctx.setTransform(this.scale * this.dpr, 0, 0, this.scale * this.dpr, 0, 0);
    const world = this.world;
    for (let i = 0; i < world.hazards.length; i++) {
      const hazard = world.hazards[i];
      ctx.save();
      polygon(ctx, hazard);
      ctx.clip();
      ctx.fillStyle = C.slate;
      ctx.fillRect(0, 0, W.width, W.height);
      ctx.strokeStyle = C.grey;
      ctx.globalAlpha = V.hatchOpacity;
      ctx.lineWidth = V.hatchWidth;
      for (let x = -W.height; x < W.width; x += V.hatchSpacing) segment(ctx, x, W.height, x + W.height, 0);
      ctx.restore();
      ctx.strokeStyle = C.grey;
      ctx.lineWidth = V.hatchWidth;
      polygon(ctx, hazard);
      ctx.stroke();
    }
    polygon(ctx, world.goal);
    ctx.fillStyle = C.accent;
    ctx.globalAlpha = V.goalFill;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = V.goalWidth;
    ctx.stroke();
    if (!this.tracing) {
      for (let i = 0; i < world.walls.length; i++) drawWall(ctx, world.walls[i], 1, C.bone);
    }
    this.version = world.version;
  }

  toWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.left = rect.left;
    this.top = rect.top;
    this.pointerPoint.x = (clientX - this.left - this.x) / this.scale;
    this.pointerPoint.y = (clientY - this.top - this.y) / this.scale;
    return this.pointerPoint;
  }

  draw(now, alpha, input, settings) {
    const ctx = this.ctx;
    const world = this.world;
    this.reducedMotion = settings.reducedMotion;

    if (this.mode === 'title') {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, this.width, this.height);
      const cx = this.width * 0.7;
      const cy = this.height * 0.5;
      const radius = Math.max(this.width, this.height) * 0.75;
      const grad = ctx.createRadialGradient(cx, cy, 20, cx, cy, radius);
      grad.addColorStop(0, 'rgba(27, 35, 43, 0.45)');
      grad.addColorStop(1, 'rgba(12, 17, 22, 1)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.width, this.height);
      return;
    }

    const elapsed = (now - this.loadedAt) * 1000;
    if (this.tracing && (elapsed >= M.wallTotalMs || this.reducedMotion)) {
      this.tracing = false;
      this.buildCache();
    } else if (this.version !== world.version) this.buildCache();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.drawImage(this.cache, 0, 0, W.width * this.scale * this.dpr, W.height * this.scale * this.dpr, this.x, this.y, W.width * this.scale, W.height * this.scale);
    ctx.setTransform(this.scale * this.dpr, 0, 0, this.scale * this.dpr, this.x * this.dpr, this.y * this.dpr);
    if (this.tracing) {
      const stagger = Math.min(M.wallStaggerMs, (M.wallTotalMs - M.wallTraceMs) / Math.max(1, world.walls.length - 1));
      for (let i = 0; i < world.walls.length; i++) {
        const progress = Math.max(0, Math.min(1, (elapsed - i * stagger) / M.wallTraceMs));
        drawWall(ctx, world.walls[i], ease(progress), C.bone);
      }
    }
    if (!this.reducedMotion && this.mode !== 'title') {
      for (let i = 0; i < world.walls.length; i++) {
        const sinceHit = world.time - world.walls[i].hitAt;
        if (sinceHit >= M.impactSeconds) continue;
        ctx.globalAlpha = 1 - ease(sinceHit / M.impactSeconds);
        drawWall(ctx, world.walls[i], 1, C.accent);
      }
    }
    ctx.globalAlpha = 1;
    this.drawElements(ctx, now);
    if (!this.tracing) for (const wall of world.walls) drawWall(ctx, wall, 1, C.bone);
    this.drawGoal(ctx, now);
    const x = world.px + (world.x - world.px) * alpha;
    const y = world.py + (world.y - world.py) * alpha;
    const angle = this.reducedMotion ? 0 : world.previousAngle + (world.angle - world.previousAngle) * alpha;
    this.drawEmbers(ctx, now, x, y);
    if (world.status === 'moving' && !this.reducedMotion) {
      if (world.time - this.lastGhostTime >= 1 / 30) {
        this.ghosts.push({ x: world.px, y: world.py, angle: world.previousAngle });
        if (this.ghosts.length > 3) this.ghosts.shift();
        this.lastGhostTime = world.time;
      }
      for (let i = 0; i < this.ghosts.length; i++) {
        const ghost = this.ghosts[i];
        this.drawPuck(ctx, ghost.x, ghost.y, ghost.angle, false, 0, false, (i + 1) * 0.1);
      }
    } else this.ghosts.length = 0;
    this.drawPuck(ctx, x, y, angle, world.status === 'ready', input.angle, input.aiming && world.status === 'ready');
    if (world.status === 'ready' && input.aiming && settings.aimPreview) {
      if (input.lastInput === 'keyboard' && !input.charging) {
        ctx.save(); ctx.strokeStyle = C.bone; ctx.lineWidth = 2; ctx.setLineDash([]);
        segment(ctx, world.x, world.y, world.x + Math.cos(input.angle) * 50, world.y + Math.sin(input.angle) * 50);
        ctx.restore();
      } else this.drawAim(ctx, world, input.angle, input.dragging, world.level.id, input.power, input);
    }
    ctx.globalAlpha = 1;
  }

  drawGoal(ctx, now) {
    if (this.world.status === 'won') {
      if (this.wonAt === null) this.wonAt = now;
      if (!this.reducedMotion && !this.goalFlashed) {
        ctx.save();
        ctx.globalCompositeOperation = 'difference';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W.width, W.height);
        ctx.restore();
        this.goalFlashed = true;
      }
      const progress = (now - this.wonAt) / 0.3;
      const burst = (now - this.wonAt) / 0.7;
      if (this.world.shots === 1 && burst < 1) {
        ctx.save();
        ctx.strokeStyle = C.fireGold;
        ctx.lineWidth = 2;
        ctx.globalAlpha = this.reducedMotion ? 0.65 : 1 - burst;
        const expansion = this.reducedMotion ? 0.2 : burst;
        ctx.beginPath();
        ctx.arc(this.goalX, this.goalY, 24 + expansion * 100, 0, TAU);
        ctx.stroke();
        for (let i = 0; i < 12; i++) {
          const angle = i * TAU / 12;
          const inner = 18 + expansion * 55;
          const outer = inner + 18 * (1 - expansion);
          segment(ctx, this.goalX + Math.cos(angle) * inner, this.goalY + Math.sin(angle) * inner, this.goalX + Math.cos(angle) * outer, this.goalY + Math.sin(angle) * outer);
        }
        ctx.restore();
      }
      if (!this.reducedMotion && progress < 1) {
        ctx.save();
        ctx.translate(this.goalX, this.goalY);
        hexagon(ctx, 20 + ease(progress) * 75);
        ctx.globalAlpha = 1 - progress;
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
    }
    const phase = now % M.goalPeriod / M.goalPeriod;
    const pulse = ease(phase < 0.5 ? phase * 2 : 2 - phase * 2);
    ctx.globalAlpha = this.reducedMotion || this.tracing ? 1 : M.goalOpacity + (1 - M.goalOpacity) * pulse;
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = V.goalWidth;
    const size = V.goalMarker;
    segment(ctx, this.goalX - size, this.goalY, this.goalX + size, this.goalY);
    segment(ctx, this.goalX, this.goalY - size, this.goalX, this.goalY + size);
    ctx.globalAlpha = 1;
  }

  drawElements(ctx, now) {
    const world = this.world;
    ctx.save();
    this.drawGravityWells(ctx, now);
    for (const hazard of world.hazards) {
      ctx.globalAlpha = this.reducedMotion ? 0.65 : 0.55 + Math.sin(now * 2.5) * 0.15;
      ctx.strokeStyle = C.accent;
      ctx.shadowColor = C.accent;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2;
      polygon(ctx, hazard); ctx.stroke();
    }
    for (const wall of world.movingWalls) {
      if (!wall.active) continue;
      ctx.strokeStyle = C.movingWhite;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 7]);
      for (const point of [wall.baseA, wall.baseB]) segment(ctx, point[0] - wall.delta[0], point[1] - wall.delta[1], point[0] + wall.delta[0], point[1] + wall.delta[1]);
      ctx.setLineDash([]);
      ctx.globalAlpha = this.reducedMotion ? 1 : 0.75 + Math.sin(now * 3) * 0.2;
      ctx.shadowColor = C.movingWhite;
      ctx.shadowBlur = 6;
      drawWall(ctx, wall, 1, C.movingWhite);
    }
    for (const bumper of world.bumpers) {
      const sinceHit = world.time - bumper.hitAt;
      const scale = !this.reducedMotion && sinceHit < 0.2 ? 1 + (1 - sinceHit / 0.2) * 0.2 : 1;
      ctx.save();
      ctx.translate(bumper.x, bumper.y);
      ctx.scale(scale, scale);
      ctx.strokeStyle = C.bumperOrange;
      ctx.shadowColor = C.bumperOrange;
      ctx.shadowBlur = sinceHit < 0.2 ? 16 : 6;
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      for (const radius of [bumper.radius, bumper.radius * 0.68]) {
        ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.stroke();
      }
      for (let i = 0; i < 12; i++) {
        const angle = i * TAU / 12;
        segment(ctx, Math.cos(angle) * (bumper.radius + 4), Math.sin(angle) * (bumper.radius + 4), Math.cos(angle) * (bumper.radius + 9), Math.sin(angle) * (bumper.radius + 9));
      }
      ctx.restore();
    }
    for (const pair of world.portals) for (const [index, portal] of [pair.A, pair.B].entries()) {
      const inactive = pair.active === false;
      const cooling = pair.cooldown > 0;
      const flash = !inactive && !this.reducedMotion && world.time - pair.hitAt < 0.08;
      const color = inactive ? C.grey : index ? C.portalBlue : C.portalCyan;
      const pulse = this.reducedMotion || cooling || inactive ? 1 : 1 + Math.sin(now * 3.5) * 0.06;
      ctx.save();
      ctx.translate(portal.x, portal.y);
      ctx.rotate(Math.atan2(portal.ny, portal.nx));
      ctx.strokeStyle = flash ? C.bone : color;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = inactive ? 0 : flash ? 24 : cooling ? 4 : 12;
      ctx.globalAlpha = inactive ? 0.35 : cooling && !flash ? 0.4 : 0.95;
      ctx.lineWidth = 2;
      for (const scale of [1, 0.72]) {
        ctx.beginPath(); ctx.arc(0, 0, portal.radius * scale * pulse, 0, TAU); ctx.stroke();
      }
      // The chevron communicates the outgoing frame; the circular rim accepts
      // incoming shots from every direction, matching the collision geometry.
      segment(ctx, portal.radius + 6, -5, portal.radius + 12, 0);
      segment(ctx, portal.radius + 12, 0, portal.radius + 6, 5);
      if (!inactive && cooling) {
        ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(0, 0, portal.radius + 5, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, pair.cooldown / CONFIG.physics.portals.cooldown)); ctx.stroke();
      } else if (!inactive) for (let i = 0; i < 12; i++) {
        const phase = (i / 12 + (this.reducedMotion ? 0 : now * 0.4)) % 1;
        const angle = i * TAU / 12 + phase * TAU;
        const radius = portal.radius * (0.2 + 0.65 * (1 - phase));
        ctx.beginPath(); ctx.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, 1.4, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  drawGravityWells(ctx, now) {
    ctx.save();
    const world = this.world;
    for (const well of world.gravityWells) {
      const halo = ctx.createRadialGradient(well.x, well.y, 8, well.x, well.y, well.radius);
      halo.addColorStop(0, 'rgba(213,0,249,0.22)');
      halo.addColorStop(0.4, 'rgba(213,0,249,0.08)');
      halo.addColorStop(1, 'rgba(213,0,249,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = halo;
      ctx.fillRect(well.x - well.radius, well.y - well.radius, well.radius * 2, well.radius * 2);
      ctx.strokeStyle = C.gravityPurple;
      ctx.shadowColor = C.gravityPurple;
      ctx.shadowBlur = 4;
      ctx.lineWidth = 1;
      for (const ratio of [0.25, 0.5, 0.75, 1]) {
        ctx.globalAlpha = 0.14 + (1 - ratio) * 0.25;
        ctx.beginPath(); ctx.arc(well.x, well.y, well.radius * ratio, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#030408';
      ctx.beginPath();
      ctx.arc(well.x, well.y, 12, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(well.x, well.y, 25, 10, -0.4, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.65;
      for (let i = 0; i < 8; i++) {
        const angle = i * TAU / 8 + (this.reducedMotion ? 0 : now * 0.4);
        const radius = well.radius * 0.8;
        const tipX = well.x + Math.cos(angle) * (radius - 8);
        const tipY = well.y + Math.sin(angle) * (radius - 8);
        const fin1X = well.x + Math.cos(angle - 0.25) * (radius + 2);
        const fin1Y = well.y + Math.sin(angle - 0.25) * (radius + 2);
        const fin2X = well.x + Math.cos(angle + 0.25) * (radius + 2);
        const fin2Y = well.y + Math.sin(angle + 0.25) * (radius + 2);
        segment(ctx, fin1X, fin1Y, tipX, tipY);
        segment(ctx, fin2X, fin2Y, tipX, tipY);
      }
    }
    ctx.restore();
  }

  drawEmbers(ctx, now, x, y) {
    if (this.reducedMotion || (this.world.winStreak ?? 0) < 3) { this.embers.length = 0; return; }
    if (this.world.status === 'moving' && now - this.lastEmberTime >= 1 / 60) {
      this.embers.push({ x, y, r: 3 + (this.embers.length % 3), opacity: 0.8, born: now });
      if (this.embers.length > 32) this.embers.shift();
      this.lastEmberTime = now;
    }
    this.embers = this.embers.filter(ember => now - ember.born < 0.45);
    ctx.save();
    ctx.shadowBlur = 12;
    for (let i = 0; i < this.embers.length; i++) {
      const ember = this.embers[i];
      const age = (now - ember.born) / 0.45;
      ctx.fillStyle = i % 2 ? C.fireAmber : C.fireGold;
      ctx.shadowColor = ctx.fillStyle;
      ctx.globalAlpha = ember.opacity * (1 - age);
      ctx.beginPath(); ctx.arc(ember.x, ember.y - age * 12, ember.r * (1 - age), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  drawPuck(ctx, x, y, rotation, atRest, aimAngle = 0, isAiming = false, opacity = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = opacity;
    if (atRest && isAiming) {
      ctx.rotate(aimAngle);
      ctx.beginPath();
      ctx.moveTo(W.radius + 8, 0);
      ctx.lineTo(W.radius, -4);
      ctx.lineTo(W.radius, 4);
      ctx.closePath();
      ctx.fillStyle = C.accent;
      ctx.fill();
      ctx.rotate(-aimAngle);
    }
    ctx.rotate(rotation);
    hexagon(ctx, W.radius + 3);
    ctx.strokeStyle = C.accent;
    ctx.globalAlpha = opacity * 0.35;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    hexagon(ctx, W.radius);
    ctx.globalAlpha = opacity;
    ctx.fillStyle = C.bone;
    ctx.fill();
    ctx.restore();
  }

  drawAim(ctx, world, angle, dragging, levelIndex = 1, power = CONFIG.input.defaultPower, input = {}) {
    const length = aimPreviewLength(input, Math.max(450, Math.min(2400, CONFIG.input.previewLength - levelIndex * 25)));
    if (length <= 0) return;
    const dynamic = world.movingWalls.length || world.portals.some(pair => pair.cooldown > 0 || pair.A.motion || pair.B.motion);
    const key = [angle, power, length, world.x, world.y, world.version, dynamic ? Math.floor(world.time * 30) : 0].join(':');
    if (this.aimCache?.world !== world || this.aimCache.key !== key) this.aimCache = { world, key, path: getAimTrajectory(world, angle, length, power) };
    const path = this.aimCache.path;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    ctx.save();
    if (path.hasPortal || path.hasGravity) {
      ctx.lineWidth = V.aimWidth;
      ctx.setLineDash(AIM_DASH);
      for (let i = 0; i < path.segments.length; i++) {
        const ray = path.segments[i];
        ctx.strokeStyle = path.hasGravity ? C.bone : i ? C.portalBlue : C.bone;
        ctx.globalAlpha = Math.max(0.18, 0.6 - i / path.segments.length * 0.4);
        segment(ctx, ray.x0, ray.y0, ray.x1, ray.y1);
      }
    } else {
      const primary = ctx.createLinearGradient(path.x0, path.y0, path.x1, path.y1);
      primary.addColorStop(0, 'rgba(233,230,223,0.65)');
      primary.addColorStop(1, 'rgba(233,230,223,0.28)');
      ctx.strokeStyle = primary;
      ctx.lineWidth = V.aimWidth;
      ctx.setLineDash(AIM_DASH);
      segment(ctx, path.x0, path.y0, path.x1, path.y1);
      if (path.hasBounce) {
        const reflected = ctx.createLinearGradient(path.x1, path.y1, path.x2, path.y2);
        reflected.addColorStop(0, 'rgba(255,107,61,0.5)');
        reflected.addColorStop(1, 'rgba(255,107,61,0)');
        ctx.strokeStyle = reflected;
        segment(ctx, path.x1, path.y1, path.x2, path.y2);
        ctx.setLineDash([]);
        ctx.strokeStyle = C.accent;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(path.x1, path.y1, 4, 0, TAU);
        ctx.stroke();
      }
    }
    if (dragging) {
      ctx.globalAlpha = V.puckRingOpacity;
      ctx.strokeStyle = C.bone;
      ctx.setLineDash([3, 3]);
      segment(ctx, world.x - dx * V.puckRingRadius, world.y - dy * V.puckRingRadius, world.x - dx * V.puckRingRadius * 2, world.y - dy * V.puckRingRadius * 2);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}
