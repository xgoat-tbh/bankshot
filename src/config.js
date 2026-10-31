// Shared tuning lives here; procedural room geometry lives in generator.js.
export const CONFIG = Object.freeze({
  world: {
    width: 1200, height: 800, radius: 14, dprCap: 2,
    boundary: [[100, 60], [1100, 60], [1140, 100], [1140, 700], [1100, 740], [100, 740], [60, 700], [60, 100]],
    goalHalfWidth: 48, goalHalfHeight: 46, goalCut: 14,
  },
  physics: {
    step: 1 / 240, maxFrame: 0.05, maxSpeed: 1800, damping: 0.6,
    stopSpeed: 8, shotLimit: 12, maxCollisions: 16,
    epsilon: 1e-8, separation: 0.002, glassThreshold: 900, glassRetention: 0.7,
    restitution: { solid: 0.8, rubber: 0.98, glass: 0.5 },
  },
  input: {
    cancelPixels: 12, dragPixels: 210, touchDragPixels: 80, edgePowerFactor: 0.85,
    minimumDragRange: 24, hitPixels: 30,
    turnSpeed: 1.65, fineTurnFactor: 0.25, chargeSeconds: 1.25,
    defaultPower: 0.5, defaultAngle: -0.55, minimumPower: 0.01,
    previewLength: 2400,
  },
  motion: {
    ease: 'cubic-bezier(0.2, 0, 0, 1)', hoverMs: 140, pressMs: 80,
    bezier: [0.2, 0, 0, 1], easeIterations: 12, hoverCutScale: 1.5,
    screenMs: 220, wallStaggerMs: 30, wallTraceMs: 260, wallTotalMs: 580,
    impactSeconds: 0.2, goalPeriod: 2.4, goalOpacity: 0.6,
    spinFactor: 0.24, hudOpacity: 0.3,
  },
  render: {
    solidWidth: 3, rubberWidth: 2, rubberGap: 5, glassWidth: 1.5,
    glassTick: 7, glassSpacing: 25,
    goalWidth: 2, goalFill: 0.12, goalMarker: 10, hatchSpacing: 15,
    hatchWidth: 1, hatchOpacity: 0.55, puckSides: 6,
    aimWidth: 1, aimDash: 7, aimGap: 7, markerSize: 7,
    puckRingRadius: 25, puckRingOpacity: 0.35, puckRingGap: 8,
    titleZoom: 0.91, titleX: 0.735, titleY: 0.505, titleWidth: 0.66, titleHeight: 0.86,
    mobileTitleX: 0.5, mobileTitleY: 0.535, mobileTitleZoom: 1,
    previewAngle: -0.79,
    titleScene: {
      puck: [270, 615],
      goal: [[820, 440], [905, 440], [935, 470], [935, 555], [850, 555], [820, 525]],
      walls: [
        { a: [155, 230], b: [400, 105], mat: 'solid' },
        { a: [400, 105], b: [740, 105], mat: 'solid' },
        { a: [740, 105], b: [1025, 325], mat: 'solid' },
        { a: [1025, 325], b: [1025, 650], mat: 'solid' },
        { a: [1025, 650], b: [790, 735], mat: 'solid' },
        { a: [790, 735], b: [440, 735], mat: 'solid' },
        { a: [155, 230], b: [155, 450], mat: 'solid' },
        { a: [400, 410], b: [620, 220], mat: 'solid' },
        { a: [665, 610], b: [815, 660], mat: 'solid' },
        { a: [820, 260], b: [925, 340], mat: 'solid' },
      ], hazards: [],
    },
  },
  layout: {
    unitMin: 7, unitVmin: 1, unitMax: 11, cutUnits: 1.2,
    minTarget: 44, portraitRatio: 0.9, sideUnits: 14, topUnits: 11, bottomUnits: 11,
    mobileSideUnits: 2, mobileTopUnits: 16, mobileBottomUnits: 16,
  },
  palette: { ink: '#0C1116', slate: '#1B232B', grey: '#5B6670', bone: '#E9E6DF', accent: '#FF6B3D' },
  game: { chapters: ['Trajectory', 'Resilience', 'Fragility', 'The Void', 'Mastery'], chapterSize: 10 },
  storage: { key: 'bankshot.db.v2', version: 2, legacyKey: 'bankshot.progress.v1' },
  tests: { tolerance: 0.001, maxSteps: 3200, stressAngles: 48 },
});

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function ease(progress) {
  const p = Math.max(0, Math.min(1, progress));
  if (p === 0 || p === 1) return p;
  const curve = CONFIG.motion.bezier;
  let low = 0;
  let high = 1;
  let t = p;
  for (let i = 0; i < CONFIG.motion.easeIterations; i++) {
    t = (low + high) / 2;
    const inverse = 1 - t;
    const x = 3 * inverse * inverse * t * curve[0] + 3 * inverse * t * t * curve[2] + t * t * t;
    if (x < p) low = t; else high = t;
  }
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * curve[1] + 3 * inverse * t * t * curve[3] + t * t * t;
}

export function applyConfigTokens(element) {
  const style = element.style;
  for (const [key, value] of Object.entries(CONFIG.palette)) style.setProperty(`--${key}`, value);
  style.setProperty('--u', `clamp(${CONFIG.layout.unitMin}px, ${CONFIG.layout.unitVmin}vmin, ${CONFIG.layout.unitMax}px)`);
  style.setProperty('--cut', `calc(var(--u) * ${CONFIG.layout.cutUnits})`);
  style.setProperty('--facet', 'polygon(var(--cut) 0, 100% 0, 100% calc(100% - var(--cut)), calc(100% - var(--cut)) 100%, 0 100%, 0 var(--cut))');
  const hoverCut = `calc(var(--cut) * ${CONFIG.motion.hoverCutScale})`;
  style.setProperty('--facet-hover', `polygon(${hoverCut} 0, 100% 0, 100% calc(100% - ${hoverCut}), calc(100% - ${hoverCut}) 100%, 0 100%, 0 ${hoverCut})`);
  style.setProperty('--ease', CONFIG.motion.ease);
  style.setProperty('--hover-time', `${CONFIG.motion.hoverMs}ms`);
  style.setProperty('--press-time', `${CONFIG.motion.pressMs}ms`);
  style.setProperty('--screen-time', `${CONFIG.motion.screenMs}ms`);
  style.setProperty('--goal-time', `${CONFIG.motion.goalPeriod}s`);
  style.setProperty('--target', `${CONFIG.layout.minTarget}px`);
  style.setProperty('--hud-moving-opacity', CONFIG.motion.hudOpacity);
}
