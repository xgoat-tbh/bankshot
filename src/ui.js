import { Sandbox } from './sandbox.js';
import { CONFIG, applyConfigTokens } from './config.js';
const B = 'M4 0H33L43 10V25L36 32L45 41V55L34 66H0V4ZM12 12V27H29L31 25V14L29 12ZM12 39V54H29L33 50V43L29 39Z';
export function icon(name, cls = '') {
    return name === 'b' ? `<svg class="icon ${cls}" viewBox="0 0 45 66" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="${B}"/></svg>` : `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="${name === 'close' ? 'M5 5L19 19M19 5L5 19' : name === 'back' ? 'M20 12H4L10 6M4 12L10 18' : 'M4 12H20L14 6M20 12L14 18'}"/></svg>`;
}
const button = (label, action, cls = '', attrs = '') => `<button type="button" class="button ${cls}" data-action="${action}" ${attrs}><span class="button-surface" aria-hidden="true"><span class="button-sweep"></span></span><span class="button-label">${label}</span><span class="button-line" aria-hidden="true"></span></button>`;
const switcher = (label, key) => button(`${label}<span class="setting-value mono" data-value="${key}">OFF</span>`, 'setting', 'setting', `role="switch" aria-checked="false" data-key="${key}"`);
const chapters = ['TRAJECTORY', 'RESILIENCE', 'FRAGILITY', 'THE VOID', 'MASTERY'];
const chapter = n => chapters[Math.min(4, Math.floor((n - 1) / 10))];
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function getRankEmblemSVG(tier, division, color) {
    const chevrons = division === 3 ?
        `<path d="M20 54 L32 64 L44 54" stroke="${color}" stroke-width="2.5" fill="none"/>
     <path d="M22 60 L32 68 L42 60" stroke="${color}" stroke-width="2.5" fill="none"/>
     <path d="M24 66 L32 72 L40 66" stroke="${color}" stroke-width="2.5" fill="none"/>` :
        division === 2 ?
            `<path d="M20 56 L32 66 L44 56" stroke="${color}" stroke-width="2.5" fill="none"/>
     <path d="M22 62 L32 70 L42 62" stroke="${color}" stroke-width="2.5" fill="none"/>` :
            `<path d="M20 58 L32 68 L44 58" stroke="${color}" stroke-width="2.5" fill="none"/>`;
    return `<svg class="rank-emblem" viewBox="0 0 64 80" fill="none" aria-hidden="true">
    <polygon points="32,4 58,26 50,56 32,74 14,56 6,26" stroke="${color}" stroke-width="2" fill="rgba(27,35,43,0.85)"/>
    <polygon points="32,12 50,28 44,50 32,64 20,50 14,28" stroke="${color}" stroke-width="1.5" fill="${color}" fill-opacity="0.25"/>
    <polygon points="32,20 42,32 32,46 22,32" fill="${color}"/>
    ${tier === 'Radiant' ? '<polygon points="32,2 40,16 32,12 24,16" fill="#FFD700"/><polygon points="32,76 40,62 32,66 24,62" fill="#FFD700"/>' : chevrons}
  </svg>`;
}
function guideDiagram(section, reduced) {
    if (reduced) {
        const staticDiagrams = [
            '<path class="guide-route" d="M80 85H415"/><path class="guide-goal" d="M395 65H435V105H395Z"/><circle class="guide-puck" cx="240" cy="85" r="7"/>',
            '<path class="guide-route" d="M130 75H390"/><line x1="130" y1="75" x2="80" y2="75" stroke="var(--accent)" stroke-width="2" stroke-dasharray="3 3"/><circle class="guide-ghost" cx="80" cy="75" r="10" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="3 3"/><text x="60" y="118">PULL BACK</text><text x="320" y="118">RELEASE</text><circle class="guide-puck" cx="130" cy="75" r="7"/>',
            '<path class="guide-wall" d="M80 25H420" stroke-width="3"/><path class="guide-route" d="M90 115L250 25L410 115"/><line x1="250" y1="25" x2="250" y2="115" stroke="var(--grey)" stroke-dasharray="3 3"/><path class="guide-goal" d="M390 95H430V135H390Z"/><text x="145" y="70">IN</text><text x="325" y="70">OUT</text><circle class="guide-puck" cx="250" cy="25" r="7"/>',
            '<path class="guide-wall" d="M80 25V95M240 25V95M246 25V95" stroke-width="3"/><path class="guide-glass" d="M400 25V95"/><path class="guide-route" d="M30 80L80 50L30 20M180 80L240 50L180 20M340 80L400 50L450 25"/><text x="40" y="125">SOLID (80%)</text><text x="180" y="125">RUBBER (98%)</text><text x="360" y="125">GLASS (BREAKS)</text><circle class="guide-puck" cx="80" cy="50" r="6"/><circle class="guide-puck" cx="240" cy="50" r="6"/><circle class="guide-puck" cx="400" cy="50" r="6"/>',
            '<g transform="translate(60, 20)"><polygon points="20,5 35,20 20,35 5,20" stroke="#8B97A2" stroke-width="2" fill="none"/><text x="5" y="52" fill="#8B97A2" font-size="10" font-family="var(--mono)">IRON</text><polygon points="100,5 115,20 100,35 85,20" stroke="#CD7F32" stroke-width="2" fill="none"/><text x="80" y="52" fill="#CD7F32" font-size="10" font-family="var(--mono)">BRONZE</text><polygon points="180,5 195,20 180,35 165,20" stroke="#E6C229" stroke-width="2" fill="none"/><text x="168" y="52" fill="#E6C229" font-size="10" font-family="var(--mono)">GOLD</text><polygon points="260,5 275,20 260,35 245,20" stroke="#BA68C8" stroke-width="2" fill="none"/><text x="242" y="52" fill="#BA68C8" font-size="10" font-family="var(--mono)">DIAMOND</text><polygon points="340,5 355,20 340,35 325,20" stroke="#FFD700" stroke-width="2" fill="#FFD700" fill-opacity="0.3"/><text x="322" y="52" fill="#FFD700" font-size="10" font-family="var(--mono)">RADIANT</text></g><rect x="60" y="85" width="380" height="8" rx="2" fill="var(--slate)"/><rect x="60" y="85" width="220" height="8" rx="2" fill="var(--accent)"/><text x="60" y="120" fill="var(--accent)" font-family="var(--mono)" font-size="12">+30 RR (+15 ELO) UNDER PAR</text><text x="280" y="120" fill="var(--grey)" font-family="var(--mono)" font-size="12">-14 RR (-7 ELO) FAIL</text>',
            '<path class="guide-route" d="M65 105L210 105L350 28L430 95"/><path class="guide-wall" d="M290 28H430M65 20V70"/><circle class="guide-ghost" cx="210" cy="105" r="12"/><path class="guide-goal" d="M410 75H450V115H410Z"/><text x="105" y="135">1 / SET UP</text><text x="280" y="135">2 / BANK</text><circle class="guide-puck" cx="210" cy="105" r="7"/>'
        ];
        return `<svg class="guide-art guide-art-${section}" viewBox="0 0 500 150" fill="none" aria-hidden="true">${staticDiagrams[section]}</svg>`;
    }
    const kineticDiagrams = [
        // 0: BASICS - Medium speed launch, smooth deceleration as it reaches pocket, sinks in, then resets cleanly to start
        `<path class="guide-route" d="M80 85H415"/>
     <path class="guide-goal" d="M395 65H435V105H395Z"/>
     <circle cx="80" cy="85" r="9" stroke="var(--grey)" stroke-width="1.5" stroke-dasharray="3 3" fill="none"/>
     <circle class="guide-puck" cx="0" cy="0" r="7">
       <animateMotion dur="3.0s" repeatCount="indefinite" path="M80 85 L415 85 L415 85" keyTimes="0; 0.72; 1" keySplines="0.15 0.55 0.25 1.0; 0 0 1 1" calcMode="spline"/>
       <animate attributeName="opacity" dur="3.0s" repeatCount="indefinite" values="1; 1; 0; 0; 1" keyTimes="0; 0.75; 0.85; 0.94; 1"/>
     </circle>
     <circle cx="415" cy="85" r="7" stroke="var(--accent)" stroke-width="2" fill="none">
       <animate attributeName="r" values="7; 7; 28" dur="3.0s" repeatCount="indefinite" keyTimes="0; 0.70; 0.92"/>
       <animate attributeName="opacity" values="0; 0; 1; 0" dur="3.0s" repeatCount="indefinite" keyTimes="0; 0.69; 0.74; 0.96"/>
     </circle>`,
        // 1: CONTROLS - Pullback tension indicator, releases forward at medium speed, slows down to a stop, then resets
        `<path class="guide-route" d="M130 75H390"/>
     <circle class="guide-ghost" cx="130" cy="75" r="10" stroke="var(--grey)" stroke-width="1.5" stroke-dasharray="3 3"/>
     <line x1="130" y1="75" x2="80" y2="75" stroke="var(--accent)" stroke-width="2" stroke-dasharray="3 3"/>
     <circle cx="80" cy="75" r="7" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="2 2" fill="none"/>
     <text x="60" y="118">PULL BACK</text><text x="320" y="118">RELEASE</text>
     <circle class="guide-puck" cx="0" cy="0" r="7">
       <animateMotion dur="3.0s" repeatCount="indefinite" path="M130 75 L130 75 L390 75 L390 75" keyTimes="0; 0.22; 0.74; 1" keySplines="0 0 1 1; 0.15 0.55 0.25 1.0; 0 0 1 1" calcMode="spline"/>
       <animate attributeName="opacity" dur="3.0s" repeatCount="indefinite" values="1; 1; 0; 0; 1" keyTimes="0; 0.76; 0.86; 0.94; 1"/>
     </circle>`,
        // 2: PHYSICS - Angle in = angle out. Glides from launch to wall, rebounds cleanly, slows down smoothly into pocket
        `<path class="guide-wall" d="M80 25H420" stroke-width="3"/>
     <path class="guide-route" d="M90 115L250 25L410 115"/>
     <line x1="250" y1="25" x2="250" y2="115" stroke="var(--grey)" stroke-dasharray="3 3"/>
     <path class="guide-goal" d="M390 95H430V135H390Z"/>
     <text x="145" y="70">IN</text><text x="325" y="70">OUT</text>
     <circle class="guide-puck" cx="0" cy="0" r="7">
       <animateMotion dur="3.0s" repeatCount="indefinite" path="M90 115 L250 25 L410 115 L410 115" keyTimes="0; 0.35; 0.74; 1" keySplines="0.1 0.7 0.3 1; 0.15 0.55 0.25 1.0; 0 0 1 1" calcMode="spline"/>
       <animate attributeName="opacity" dur="3.0s" repeatCount="indefinite" values="1; 1; 0; 0; 1" keyTimes="0; 0.76; 0.86; 0.94; 1"/>
     </circle>
     <circle cx="250" cy="25" r="5" stroke="var(--accent)" stroke-width="2" fill="none">
       <animate attributeName="r" values="5; 5; 22" dur="3.0s" repeatCount="indefinite" keyTimes="0; 0.35; 0.52"/>
       <animate attributeName="opacity" values="0; 0; 1; 0" dur="3.0s" repeatCount="indefinite" keyTimes="0; 0.34; 0.37; 0.55"/>
     </circle>`,
        // 3: MATERIALS - Solid bounce vs Rubber elastic bounce vs Glass shatter, with deceleration and clean reset
        `<path class="guide-wall" d="M80 25V95M240 25V95M246 25V95" stroke-width="3"/>
     <path class="guide-glass" d="M400 25V95"/>
     <path class="guide-route" d="M30 80L80 50L30 20M180 80L240 50L180 20M340 80L400 50L450 25"/>
     <text x="40" y="125">SOLID (80%)</text><text x="180" y="125">RUBBER (98%)</text><text x="360" y="125">GLASS (BREAKS)</text>
     <circle class="guide-puck" cx="0" cy="0" r="6">
       <animateMotion dur="3.0s" repeatCount="indefinite" path="M30 80 L80 50 L30 20 L30 20" keyTimes="0; 0.36; 0.74; 1" calcMode="spline" keySplines="0.1 0.7 0.3 1; 0.15 0.55 0.25 1.0; 0 0 1 1"/>
       <animate attributeName="opacity" dur="3.0s" repeatCount="indefinite" values="1; 1; 0; 0; 1" keyTimes="0; 0.76; 0.86; 0.94; 1"/>
     </circle>
     <circle class="guide-puck" cx="0" cy="0" r="6">
       <animateMotion dur="3.0s" repeatCount="indefinite" path="M180 80 L240 50 L180 20 L180 20" keyTimes="0; 0.36; 0.74; 1" calcMode="spline" keySplines="0.1 0.7 0.3 1; 0.15 0.55 0.25 1.0; 0 0 1 1"/>
       <animate attributeName="opacity" dur="3.0s" repeatCount="indefinite" values="1; 1; 0; 0; 1" keyTimes="0; 0.76; 0.86; 0.94; 1"/>
     </circle>
     <circle class="guide-puck" cx="0" cy="0" r="6">
       <animateMotion dur="3.0s" repeatCount="indefinite" path="M340 80 L400 50 L450 25 L450 25" keyTimes="0; 0.36; 0.74; 1" calcMode="spline" keySplines="0.1 0.7 0.3 1; 0.15 0.55 0.25 1.0; 0 0 1 1"/>
       <animate attributeName="opacity" dur="3.0s" repeatCount="indefinite" values="1; 1; 0; 0; 1" keyTimes="0; 0.76; 0.86; 0.94; 1"/>
     </circle>
     <line x1="400" y1="50" x2="388" y2="40" stroke="var(--bone)" stroke-width="1.5">
       <animate attributeName="opacity" values="0; 0; 1; 0" dur="3.0s" repeatCount="indefinite" keyTimes="0; 0.35; 0.38; 0.85"/>
     </line>
     <line x1="400" y1="50" x2="412" y2="60" stroke="var(--bone)" stroke-width="1.5">
       <animate attributeName="opacity" values="0; 0; 1; 0" dur="3.0s" repeatCount="indefinite" keyTimes="0; 0.35; 0.38; 0.85"/>
     </line>`,
        // 4: SCORING & VALORANT RANKS - Tier progression and smooth RR gauge
        `<g transform="translate(60, 20)">
       <polygon points="20,5 35,20 20,35 5,20" stroke="#8B97A2" stroke-width="2" fill="none"/>
       <text x="5" y="52" fill="#8B97A2" font-size="10" font-family="var(--mono)">IRON</text>
       <polygon points="100,5 115,20 100,35 85,20" stroke="#CD7F32" stroke-width="2" fill="none"/>
       <text x="80" y="52" fill="#CD7F32" font-size="10" font-family="var(--mono)">BRONZE</text>
       <polygon points="180,5 195,20 180,35 165,20" stroke="#E6C229" stroke-width="2" fill="none"/>
       <text x="168" y="52" fill="#E6C229" font-size="10" font-family="var(--mono)">GOLD</text>
       <polygon points="260,5 275,20 260,35 245,20" stroke="#BA68C8" stroke-width="2" fill="none"/>
       <text x="242" y="52" fill="#BA68C8" font-size="10" font-family="var(--mono)">DIAMOND</text>
       <polygon points="340,5 355,20 340,35 325,20" stroke="#FFD700" stroke-width="2" fill="#FFD700" fill-opacity="0.3"/>
       <text x="322" y="52" fill="#FFD700" font-size="10" font-family="var(--mono)">RADIANT</text>
     </g>
     <rect x="60" y="85" width="380" height="8" rx="2" fill="var(--slate)"/>
     <rect x="60" y="85" width="220" height="8" rx="2" fill="var(--accent)">
       <animate attributeName="width" values="180; 290; 290; 180" dur="3.0s" repeatCount="indefinite" keyTimes="0; 0.65; 0.88; 1" calcMode="spline" keySplines="0.15 0.55 0.25 1.0; 0 0 1 1; 0.2 0 0 1"/>
     </rect>
     <text x="60" y="120" fill="var(--accent)" font-family="var(--mono)" font-size="12">WIN & UNDER PAR: +30 RR (+15 ELO)</text>
     <text x="280" y="120" fill="var(--grey)" font-family="var(--mono)" font-size="12">FAIL: -14 RR (-7 ELO)</text>`,
        // 5: TIPS - 2-shot setup and bank, smooth deceleration into pocket, sinks in and cleanly resets
        `<path class="guide-route" d="M65 105L210 105L350 28L430 95"/>
     <path class="guide-wall" d="M290 28H430M65 20V70"/>
     <circle class="guide-ghost" cx="210" cy="105" r="10" stroke="var(--grey)" stroke-width="1.5" stroke-dasharray="3 3"/>
     <path class="guide-goal" d="M410 75H450V115H410Z"/>
     <text x="105" y="135">1 / SET UP</text><text x="280" y="135">2 / BANK</text>
     <circle class="guide-puck" cx="0" cy="0" r="7">
       <animateMotion dur="3.0s" repeatCount="indefinite" path="M65 105 L210 105 L210 105 L350 28 L430 95 L430 95" keyTimes="0; 0.30; 0.40; 0.60; 0.78; 1" keySplines="0.15 0.6 0.2 1.0; 0 0 1 1; 0.1 0.7 0.3 1; 0.15 0.55 0.25 1.0; 0 0 1 1" calcMode="spline"/>
       <animate attributeName="opacity" dur="3.0s" repeatCount="indefinite" values="1; 1; 0; 0; 1" keyTimes="0; 0.80; 0.88; 0.94; 1"/>
     </circle>`
    ];
    return `<svg class="guide-art guide-art-${section}" viewBox="0 0 500 150" fill="none" aria-hidden="true">${kineticDiagrams[section]}</svg>`;
}
export class UI {
    constructor(root, getRoom, store, actions) {
        Object.assign(this, { root, getRoom, store, actions, screen: 'title', lastInput: 'mouse', abort: new AbortController(), roomHorizon: 30 });
        applyConfigTokens(root);
        root.className = 'bankshot';
        root.dataset.screen = 'title';
        root.innerHTML = `<canvas class="arena" tabindex="0" aria-label="BANKSHOT playfield. Pull back from the puck and release. Arrows aim; hold and release Space to shoot. R restarts, H opens help, Escape pauses."></canvas>
  <header class="masthead"><button class="brand" data-action="home" aria-label="BANKSHOT main menu">${icon('b', 'brand-mark')}<span>BANKSHOT <span class="brand-edition mono">/ ENDLESS</span></span></button><span class="masthead-label mono">A GAME OF ANGLES</span></header>
  <main class="screens"><section class="screen title-screen" data-panel="title" aria-labelledby="title-heading"><div class="title-content"><div class="eyebrow mono">FIND YOUR ANGLE</div><h1 id="title-heading" class="wordmark" aria-label="BANKSHOT"><svg class="wordmark-b" viewBox="0 0 45 66" aria-hidden="true"><defs><clipPath id="b-shape"><path fill-rule="evenodd" d="${B}"/></clipPath></defs><path class="b-trace" fill="none" stroke="currentColor" stroke-width="1" pathLength="1" d="${B}"/><path class="b-fill" fill="currentColor" fill-rule="evenodd" d="${B}"/></svg><span class="wordmark-rest" aria-hidden="true">ANKSHOT</span><i class="wordmark-line" aria-hidden="true"></i></h1><p class="title-subtitle">ONE PUCK. A PERFECT LINE.</p><p class="title-note mono">ENDLESS ROOMS / EVERY ANGLE IS YOURS</p></div><nav class="title-actions" aria-label="Main menu">${button('PLAY', 'play', 'primary play-button')}${button('LEVELS', 'levels')}${button('STATS', 'stats')}${button('HOW TO PLAY', 'guide')}${button('SETTINGS', 'settings')}</nav></section>
  <section class="screen level-screen" data-panel="levels" hidden><div class="level-content"><div class="screen-heading"><div><div class="eyebrow mono">ONE MORE ANGLE</div><h2>THE ROOMS<span class="heading-period">.</span></h2></div>${button('BACK', 'back', 'small-button')}</div><p class="levels-summary mono">REPLAY TO IMPROVE YOUR RANK. NEW ROOMS UNLOCK IN ORDER.</p><div class="room-scroll" tabindex="0" aria-label="Rooms, scroll for more"><div class="room-space"></div><div class="room-window"></div></div></div></section>
  <section class="screen settings-screen" data-panel="settings" hidden><div class="settings-content"><div class="eyebrow mono">YOUR GAME</div><h2>SETTINGS.</h2><section class="settings-category"><h3>GAMEPLAY & CONTROLS</h3><div class="setting-list">${switcher('AIM PREVIEW', 'aimPreview')}<label class="range-setting" for="touch-sensitivity"><span>TOUCH DRAG SENSITIVITY <output data-sensitivity>1.00×</output></span><input id="touch-sensitivity" type="range" min="0.5" max="2" step="0.05" value="1" data-setting-value="touchSensitivity"><small class="mono">0.5× / LONG PULL <span>2× / SHORT PULL</span></small></label></div></section><section class="settings-category"><h3>VIDEO & ACCESSIBILITY</h3><div class="setting-list"><label class="select-setting" for="reduced-mode"><span>REDUCED MOTION</span><select id="reduced-mode" data-setting-value="reducedMotionMode"><option value="system">SYSTEM</option><option value="on">ON</option><option value="off">OFF</option></select></label>${switcher('HIGH-DPI DISPLAY', 'highDpi')}</div></section><section class="settings-category"><h3>KEYBINDS REFERENCE</h3><dl class="keybind-grid">${[['AIM', 'ARROWS'], ['FINE AIM', 'SHIFT'], ['CHARGE / RELEASE', 'SPACE'], ['RESTART', 'R'], ['HELP', 'H'], ['PAUSE', 'ESC']].map(([label, key]) => '<div><dt>' + label + '</dt><dd><kbd>' + key + '</kbd></dd></div>').join('')}</dl></section>${button('BACK', 'back', 'wide-button')}</div></section>
  <section class="screen overlay-screen" data-panel="pause" role="dialog" aria-modal="true" aria-labelledby="pause-heading" hidden><div class="panel"><div class="eyebrow mono">TAKE YOUR TIME</div><h2 id="pause-heading">PAUSED.</h2>${button('RESUME', 'resume', 'primary wide-button')}${button('HOW TO PLAY', 'guide', 'wide-button')}${button('RESTART', 'restart', 'wide-button')}${button('MAIN MENU', 'title', 'wide-button')}</div></section>
  <section class="screen overlay-screen" data-panel="result" role="dialog" aria-modal="true" aria-labelledby="result-heading" hidden><div class="panel result-panel"><div class="eyebrow mono" data-result-level></div><h2 id="result-heading">ON TARGET.</h2><div class="result-rank mono" data-result-rank></div><div class="result-score mono"><span><b data-result-shots></b> SHOTS</span><span>PAR <b data-result-par></b></span></div><div class="result-performance mono"><span data-result-time></span><span data-result-rating></span></div>${button('NEXT ROOM', 'next', 'primary wide-button')}${button('RETRY', 'restart', 'wide-button')}${button('THE ROOMS', 'levels', 'wide-button')}</div></section>
  <section class="screen overlay-screen" data-panel="stats" role="dialog" aria-modal="true" aria-labelledby="stats-heading" hidden><div class="panel stats-panel"><div class="eyebrow mono">YOUR TRAJECTORY</div><h2 id="stats-heading">STATS.</h2><div data-stats></div>${button('BACK', 'back', 'wide-button')}</div></section></main>
  <section class="hud" aria-label="Game status" hidden><div class="hud-left"><div class="eyebrow mono" data-chapter></div><div class="hud-level-number mono"><span class="hud-label">ROOM</span> <b data-level-number>01</b></div><h2 class="hud-level-name" data-level-name></h2><dl class="hud-metrics mono"><div><dt>SHOTS</dt><dd data-shots>0</dd></div><div><dt>PAR</dt><dd data-par>1</dd></div><div><dt>TRIES LEFT</dt><dd data-tries>3</dd></div><div><dt>STREAK</dt><dd data-streak>0W</dd></div><div><dt>TIME</dt><dd data-elapsed>0.0s</dd></div></dl><span class="shot-status mono" data-shot-status>READY</span></div><div class="hud-right">${button('?', 'guide', 'hud-button', 'aria-label="How to play (H)"')}${button('RESTART', 'restart', 'hud-button', 'aria-label="Restart room (R)"')}${button('MENU', 'pause', 'hud-button', 'aria-label="Pause game (Escape)"')}</div><div class="power-readout" hidden><div class="power-label mono"><span>POWER</span><span data-power></span></div><div class="power-track"><span class="power-fill"></span></div></div></section>
  <footer class="footer"><span class="footer-motto">LESS FORCE<span class="footer-slash">/</span>MORE FINESSE</span><span class="input-prompt mono" data-input-label>DRAG & RELEASE</span><span class="footer-version mono">ENDLESS / V.3</span></footer>
  <div class="guide-backdrop" hidden><section class="guide-dialog" role="dialog" aria-modal="true" aria-labelledby="guide-heading"><div class="guide-heading"><div><div class="eyebrow mono">FIND YOUR ANGLE</div><h2 id="guide-heading">HOW TO PLAY.</h2></div>${button('×', 'guide-close', 'guide-close', 'aria-label="Close guide"')}</div><div class="guide-tabs" role="tablist" aria-label="Guide sections">${['BASICS & CONTROLS', 'PHYSICS & SURFACES', 'NEW ELEMENTS', 'RANKED LADDER & MMR', 'PRACTICE SANDBOX', 'PRO TIPS'].map((t, i) => `<button type="button" role="tab" id="guide-tab-${i}" aria-controls="guide-content" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-guide-tab="${i}">${t}</button>`).join('')}<span class="tab-accent" aria-hidden="true"></span></div><div id="guide-content" class="guide-content" role="tabpanel" tabindex="0" aria-labelledby="guide-tab-0"></div><div class="guide-footer mono"><span>← → SECTIONS / 1–6 JUMP</span><span>ESC CLOSE</span></div></section></div><div class="chapter-card" hidden role="status"><span class="eyebrow mono" data-chapter-number></span><h2 data-chapter-title></h2><span class="chapter-rule"></span></div><div class="sr-only" role="status" aria-live="polite" data-announcement></div>`;
        this.hudRefs = Object.fromEntries(['shots', 'tries', 'shot-status', 'power', 'streak', 'elapsed'].map(key => [key, root.querySelector('[data-' + key + ']')]));
        this.hudRefs.readout = root.querySelector('.power-readout');
        this.hudRefs.fill = root.querySelector('.power-fill');
        this.hudCache = {};
        this.canvas = root.querySelector('canvas');
        this.panels = root.querySelectorAll('[data-panel]');
        this.hud = root.querySelector('.hud');
        this.announcement = root.querySelector('[data-announcement]');
        root.addEventListener('input', event => {
            const control = event.target.closest('[data-setting-value]');
            if (!control)
                return;
            this.actions('setting-value', { key: control.dataset.settingValue, value: control.type === 'range' ? parseFloat(control.value) : control.value });
        }, { signal: this.abort.signal });
        root.addEventListener('click', this.click, { signal: this.abort.signal });
        root.addEventListener('keydown', this.keyDown, { signal: this.abort.signal });
        root.querySelector('.room-scroll').addEventListener('scroll', () => this.renderLevels(), { signal: this.abort.signal, passive: true });
        this.renderGuide(0);
        const tabs = root.querySelector('.guide-tabs');
        const move = tab => {
            if (!tab)
                return;
            const accent = tabs.querySelector('.tab-accent');
            accent.style.width = tab.offsetWidth + 'px';
            accent.style.height = '2px';
            accent.style.top = (tab.offsetTop + tab.offsetHeight - 2) + 'px';
            accent.style.transform = 'translateX(' + tab.offsetLeft + 'px)';
        };
        tabs.addEventListener('pointerover', e => {
            if (matchMedia('(hover:hover)').matches)
                move(e.target.closest('[role=tab]'));
        }, { signal: this.abort.signal });
        tabs.addEventListener('pointerleave', () => move(tabs.querySelector('[aria-selected=true]')), { signal: this.abort.signal });
        this.tabResize = new ResizeObserver(() => move(tabs.querySelector('[aria-selected=true]')));
        this.tabResize.observe(tabs);
    }
    click = event => {
        const tier = event.target.closest('[data-ladder-tier]');
        if (tier) {
            this.selectLadder(+tier.dataset.ladderTier);
            return;
        }
        if (event.target.closest('[data-sandbox-reset]')) {
            this.sandbox?.reset();
            return;
        }
        if (event.target.closest('[data-promotion-close]')) {
            this.finishPromotion?.();
            return;
        }
        const tab = event.target.closest('[data-guide-tab]');
        if (tab) {
            this.renderGuide(+tab.dataset.guideTab);
            return;
        }
        if (event.target === this.root.querySelector('.guide-backdrop')) {
            this.closeGuide();
            return;
        }
        const target = event.target.closest('[data-action]');
        if (!target || target.disabled)
            return;
        if (target.dataset.action === 'guide-close') {
            this.closeGuide();
            return;
        }
        this.actions(target.dataset.action, target.dataset);
    };
    keyDown = event => {
        const roomButton = event.target.closest('.room-row');
        if (!this.guideOpen && this.screen === 'levels' && roomButton) {
            const id = +roomButton.dataset.index;
            const unlocked = this.store.data.maxUnlocked || 1;
            const mounted = [...this.root.querySelectorAll('.room-row:not(:disabled)')];
            let next = event.key === 'ArrowDown' ? id + 1 : event.key === 'ArrowUp' ? id - 1 : event.key === 'Home' ? 1 : event.key === 'End' ? unlocked : null;
            if (event.key === 'Tab' && !event.shiftKey && roomButton === mounted.at(-1) && id < unlocked)
                next = id + 1;
            if (event.key === 'Tab' && event.shiftKey && roomButton === mounted[0] && id > 1)
                next = id - 1;
            if (next !== null) {
                event.preventDefault();
                next = Math.max(1, Math.min(unlocked, next));
                const scroller = this.root.querySelector('.room-scroll');
                scroller.scrollTop = Math.max(0, (next - 3) * 76);
                this.renderLevels();
                this.root.querySelector('.room-row[data-index="' + next + '"]')?.focus({ preventScroll: true });
                return;
            }
        }
        if (this.promotionOpen) {
            if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                this.finishPromotion?.();
            }
            else if (event.key === 'Tab') {
                event.preventDefault();
                this.root.querySelector('[data-promotion-close]')?.focus();
            }
            return;
        }
        if (this.guideOpen && event.target.closest('.practice-canvas') && !['Escape', 'Tab'].includes(event.key))
            return;
        const guide = this.guideOpen;
        const panel = guide ? this.root.querySelector('.guide-dialog') : this.root.querySelector(`[data-panel="${this.screen}"]`);
        if (guide) {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                this.closeGuide();
                return;
            }
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || /^[1-6]$/.test(event.key)) {
                event.preventDefault();
                const n = /^[1-6]$/.test(event.key) ? +event.key - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? 5 : (this.guideTab + (event.key === 'ArrowRight' ? 1 : 5)) % 6;
                this.renderGuide(n);
                this.root.querySelector(`[data-guide-tab="${n}"]`).focus();
                return;
            }
        }
        if (event.key !== 'Tab' || !panel || (!guide && !['pause', 'result', 'stats'].includes(this.screen)))
            return;
        const controls = [...panel.querySelectorAll('button:not(:disabled),[tabindex="0"]')];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        }
        else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };
    show(screen) {
        this.screen = screen;
        this.root.dataset.screen = screen;
        for (const panel of this.panels)
            panel.hidden = panel.dataset.panel !== screen;
        this.hud.hidden = !['game', 'pause', 'result'].includes(screen);
        this.hud.inert = screen !== 'game';
        this.canvas.tabIndex = screen === 'game' ? 0 : -1;
        this.root.querySelector('.brand').inert = ['pause', 'result', 'stats'].includes(screen);
        if (screen === 'levels') {
            const maxUnlocked = this.store.data.maxUnlocked || 1;
            this.roomHorizon = maxUnlocked + 5;
            this.renderLevels();
        }
        if (screen === 'stats')
            this.renderStats();
        this.root.querySelector('.play-button .button-label').textContent = this.store.data.currentLevel > 1 ? `CONTINUE ROOM ${this.store.data.currentLevel}` : 'PLAY';
        const focus = screen === 'game' ? this.canvas : this.root.querySelector(`[data-panel="${screen}"] button:not(:disabled)`);
        if (!this.guideOpen)
            focus?.focus({ preventScroll: true });
    }
    renderLevels() {
        const focusedId = document.activeElement?.closest('.room-row')?.dataset.index;
        const scroller = this.root.querySelector('.room-scroll');
        const row = 76;
        const maxUnlocked = this.store.data.maxUnlocked || 1;
        this.roomHorizon = maxUnlocked + 5;
        let first = Math.max(0, Math.floor(scroller.scrollTop / row) - 3);
        const end = Math.min(this.roomHorizon, first + Math.ceil((scroller.clientHeight || 500) / row) + 7);
        const host = this.root.querySelector('.room-window');
        host.style.transform = `translateY(${first * row}px)`;
        this.root.querySelector('.room-space').style.height = `${this.roomHorizon * row}px`;
        let html = '';
        for (let i = first + 1; i <= end; i++) {
            const room = this.getRoom(i);
            const unlocked = this.store.canPlay(i);
            const record = this.store.data.levelRecords?.[i];
            html += `<button class="button room-row ${unlocked ? '' : 'locked'}" type="button" data-action="level" data-index="${i}" data-level="${i}" ${unlocked ? '' : 'disabled'} aria-label="Room ${i}: ${escape(room.name)}, par ${room.par}${unlocked ? '' : ', locked'}${record ? `, rank ${record.rank}, best ${record.bestShots} shots` : ''}"><span class="button-surface"><span class="button-sweep"></span></span><span class="mono room-id"><small>ROOM</small>${String(i).padStart(2, '0')}</span><canvas width="80" height="52" class="room-mini" data-mini="${i}" aria-hidden="true"></canvas><span class="button-label room-name">${escape(room.name)}<small class="mono">PAR ${room.par}</small></span><span class="mono room-best">${record ? `${record.bestShots} SHOTS` : unlocked ? 'READY' : '<svg class="room-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M6 10H18V21H6ZM8 10V6A4 4 0 0 1 16 6V10"/></svg><span>LOCKED</span>'}</span><span class="mono room-rank">${record?.rank || '—'}</span><span class="button-line"></span></button>`;
        }
        host.innerHTML = html;
        for (const mini of host.querySelectorAll('canvas'))
            this.drawMini(mini, this.getRoom(+mini.dataset.mini));
        if (focusedId)
            this.root.querySelector('.room-row[data-index="' + focusedId + '"]')?.focus({ preventScroll: true });
    }
    drawMini(canvas, room) {
        const c = canvas.getContext('2d');
        c.scale(canvas.width / CONFIG.world.width, canvas.height / CONFIG.world.height);
        c.strokeStyle = '#5B6670';
        c.lineWidth = 20;
        for (const w of room.walls) {
            c.beginPath();
            c.moveTo(...w.a);
            c.lineTo(...w.b);
            c.stroke();
        }
        c.fillStyle = '#FF6B3D';
        if (Array.isArray(room.goal)) {
            c.beginPath();
            room.goal.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p));
            c.closePath();
            c.fill();
        }
        c.fillStyle = '#E9E6DF';
        c.beginPath();
        c.arc(room.puck[0], room.puck[1], 35, 0, Math.PI * 2);
        c.fill();
    }
    setLevel(level, index) {
        this.level = level;
        this.root.querySelector('[data-chapter]').textContent = chapter(level.id);
        this.root.querySelector('[data-level-number]').textContent = String(level.id).padStart(2, '0');
        this.root.querySelector('[data-level-name]').textContent = level.name;
        this.root.querySelector('[data-par]').textContent = level.par;
        this.announcement.textContent = `Room ${level.id}. ${level.name}. Par ${level.par}.`;
    }
    setSettings(settings, systemReduced) {
        this.settings = settings;
        const mode = settings.reducedMotionMode || (settings.reducedMotion ? 'on' : 'system');
        this.reduced = mode === 'on' || (mode === 'system' && systemReduced);
        for (const control of this.root.querySelectorAll('[data-setting-value]'))
            control.value = String(settings[control.dataset.settingValue] ?? (control.dataset.settingValue === 'touchSensitivity' ? 1 : 'system'));
        this.root.querySelector('[data-sensitivity]').textContent = Number(settings.touchSensitivity || 1).toFixed(2) + '×';
        this.root.dataset.reduced = String(this.reduced);
        for (const control of this.root.querySelectorAll('[data-action="setting"]')) {
            const key = control.dataset.key;
            control.setAttribute('aria-checked', String(Boolean(settings[key])));
            control.querySelector('[data-value]').textContent = key === 'reducedMotion' && systemReduced ? 'SYSTEM' : settings[key] ? 'ON' : 'OFF';
        }
    }
    setInput(kind) {
        this.lastInput = kind;
        this.root.dataset.input = kind;
        this.root.querySelector('[data-input-label]').textContent = kind === 'keyboard' ? 'ARROWS / HOLD SPACE' : kind === 'touch' ? 'PULL & RELEASE' : 'DRAG & RELEASE';
    }
    update(world, input) {
        const moving = world.status === 'moving';
        const max = typeof world.budget === 'number' ? world.budget : world.budget?.max ?? world.budget?.tries ?? world.budget?.maxTries;
        const values = { streak: world.winStreak ? ((world.winStreak >= 3 ? '🔥 ' : '') + world.winStreak + 'W') : world.lossStreak ? world.lossStreak + 'L' : '0W', elapsed: (Math.floor((world.time || 0) * 10) / 10).toFixed(1) + 's', shots: world.shots, tries: Math.max(0, (max ?? world.maxTries ?? this.level?.par + 2) - world.shots), 'shot-status': moving ? 'IN MOTION' : world.status === 'won' ? 'ON TARGET' : world.lastOutcome === 'hazard' ? 'HAZARD / RESET' : 'READY' };
        if (this.hudCache.moving !== moving) {
            this.hud.classList.toggle('is-moving', moving);
            this.hudCache.moving = moving;
        }
        for (const key of Object.keys(values)) {
            if (this.hudCache[key] !== values[key]) {
                this.hudRefs[key].textContent = values[key];
                this.hudCache[key] = values[key];
            }
        }
        const charging = Boolean(input.dragging || input.charging);
        if (this.hudCache.charging !== charging) {
            this.hudRefs.readout.hidden = !charging;
            this.hudCache.charging = charging;
        }
        if (charging) {
            const percent = Math.round(input.power * 100);
            if (this.hudCache.percent !== percent) {
                this.hudRefs.power.textContent = percent + '%';
                this.hudRefs.fill.style.transform = 'scaleX(' + input.power + ')';
                this.hudCache.percent = percent;
            }
        }
    }
    result(world, index, rank) {
        const room = this.level || this.getRoom(index);
        this.root.querySelector('[data-result-level]').textContent = `ROOM ${room.id} COMPLETE`;
        this.root.querySelector('[data-result-shots]').textContent = world.shots;
        this.root.querySelector('[data-result-par]').textContent = room.par;
        this.root.querySelector('[data-result-rank]').textContent = rank || 'D';
        const match = this.store.getRankInfo?.().matchHistory?.[0] || {};
        const signed = value => Number(value) >= 0 ? '+' + Number(value) : String(value);
        this.root.querySelector('[data-result-time]').textContent = 'TIME: ' + (world.time || 0).toFixed(2) + 's';
        this.root.querySelector('[data-result-rating]').textContent = signed(match.deltaRR || 0) + ' RR (' + signed(match.deltaElo || 0) + ' ELO)';
        this.announcement.textContent = `Room complete. Rank ${rank}. ${world.shots} shots.`;
        this.show('result');
    }
    renderStats() {
        const s = this.store.getStats?.() || {};
        const rankInfo = this.store.getRankInfo?.() || {
            tier: 'Iron', division: 1, label: 'IRON I', color: '#8B97A2', rr: 50, elo: 25, peakElo: 25, peakLabel: 'IRON I', peakColor: '#8B97A2', matchHistory: []
        };
        const highestRoom = s.highestRoom ?? s.highestLevel ?? this.store.data.maxUnlocked ?? 1;
        const totalShots = s.totalShotsFired ?? this.store.data.stats?.totalShotsFired ?? 0;
        const completed = Object.keys(this.store.data.levelRecords || {}).length;
        const failures = Object.values(this.store.data.roomFailures || {}).reduce((a, b) => a + b, 0);
        const winRate = completed + failures > 0 ? Math.round(100 * completed / (completed + failures)) : 100;
        const historyRows = rankInfo.matchHistory && rankInfo.matchHistory.length > 0
            ? rankInfo.matchHistory.map(m => {
                const deltaRR = String(m.deltaRR ?? m.delta ?? '+0');
                const deltaElo = m.deltaElo || (m.delta ? `${Math.round(parseInt(m.delta, 10) / 2) > 0 ? '+' : ''}${Math.round(parseInt(m.delta, 10) / 2)}` : '+0');
                return `
                <div class="match-row ${m.outcome}">
                    <span class="mono match-room">ROOM ${String(m.room).padStart(2, '0')}</span>
                    <span class="mono match-score">${m.shots ? `${m.shots}/${m.par} SHOTS` : 'FAILED'}</span>
                    <span class="mono match-rr ${deltaRR.startsWith('+') ? 'gain' : 'loss'}">${deltaRR} RR <small class="match-elo">(${deltaElo} ELO)</small></span>
                </div>
            `;
            }).join('')
            : `<div class="match-empty mono">NO RANKED MATCHES RECORDED YET</div>`;
        this.root.querySelector('[data-stats]').innerHTML = `
            <div class="career-rank-header">
                ${getRankEmblemSVG(rankInfo.tier, rankInfo.division, rankInfo.color)}
                <div class="career-rank-details">
                    <div class="career-tier-title" style="color: ${rankInfo.color}">${rankInfo.label}</div>
                    <div class="career-rr-readout mono"><span>RANK RATING</span><b>${rankInfo.rr} / 100 RR <small class="career-elo-pill">(${rankInfo.elo} ELO)</small></b></div>
                    <div class="rr-track"><div class="rr-fill" style="width: ${Math.min(100, Math.max(0, rankInfo.rr))}%; background: ${rankInfo.color}"></div></div>
                </div>
            </div>
            <dl class="stats-metrics mono">
                <div><dt>HIGHEST ROOM</dt><dd>${highestRoom}</dd></div>
                <div><dt>PEAK RANK</dt><dd style="color: ${rankInfo.peakColor || '#E9E6DF'}">${rankInfo.peakLabel} <small class="career-peak-elo">(${rankInfo.peakElo ?? rankInfo.elo} ELO)</small></dd></div>
                <div><dt>WIN RATE</dt><dd>${winRate}%</dd></div>
                <div><dt>CAREER SHOTS</dt><dd>${totalShots}</dd></div>
            </dl>
            <div class="match-history-header">
                <h3>RECENT MATCHES</h3>
            </div>
            <div class="match-history-list">${historyRows}</div>
        `;
    }
    openGuide() {
        if (this.guideOpen)
            return;
        this.guideOpen = true;
        this.previousFocus = document.activeElement;
        this.root.querySelector('.guide-backdrop').hidden = false;
        for (const child of this.root.children)
            if (!child.classList.contains('guide-backdrop'))
                child.inert = true;
        this.renderGuide(0);
        this.root.querySelector('[data-guide-tab="0"]').focus();
    }
    closeGuide() {
        if (!this.guideOpen)
            return;
        this.sandbox?.destroy();
        this.sandbox = null;
        this.guideOpen = false;
        this.root.querySelector('.guide-backdrop').hidden = true;
        for (const child of this.root.children)
            child.inert = false;
        this.hud.inert = this.screen !== 'game';
        this.root.querySelector('.brand').inert = ['pause', 'result', 'stats'].includes(this.screen);
        this.store.markGuideSeen?.();
        this.previousFocus?.focus({ preventScroll: true });
        this.actions('guide-close', {});
    }
    renderGuide(n) {
        this.sandbox?.destroy();
        this.sandbox = null;
        this.guideTab = n;
        for (const tab of this.root.querySelectorAll('[data-guide-tab]')) {
            const active = +tab.dataset.guideTab === n;
            tab.setAttribute('aria-selected', active);
            tab.tabIndex = active ? 0 : -1;
        }
        const tab = this.root.querySelector('[data-guide-tab="' + n + '"]');
        const accent = this.root.querySelector('.tab-accent');
        accent.style.width = tab.offsetWidth + 'px';
        accent.style.top = (tab.offsetTop + tab.offsetHeight - 2) + 'px';
        accent.style.transform = 'translateX(' + tab.offsetLeft + 'px)';
        const panel = this.root.querySelector('#guide-content');
        panel.setAttribute('aria-labelledby', 'guide-tab-' + n);
        const p = CONFIG.physics, reduced = this.reduced ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
        const sections = [
            ['ONE PUCK. A PERFECT LINE.', 'Mouse or touch: pull backward from the puck, then release toward your goal. Short pulls make soft shots. Keyboard: arrows aim, Shift makes fine adjustments, and holding Space builds power; release to shoot. R restarts, Escape pauses, and H opens this guide. Clear the orange goal within your shot budget to unlock the next room.'],
            ['READ THE REFLECTION.', 'Angle in equals angle out. Solid walls return ' + Math.round(p.restitution.solid * 100) + '% speed; rubber returns ' + Math.round(p.restitution.rubber * 100) + '%. Glass breaks above ' + p.glassThreshold + ' impact speed, retaining ' + Math.round(p.glassRetention * 100) + '%; softer impacts bounce. Damping slows every shot. Hazards reset the whole room and its shots. The trajectory preview helps you read your first reflection.'],
            ['FOUR NEW WAYS THROUGH.', 'Moving walls (room 15+) oscillate along their marked tracks: time your shot. Pinball bumpers (25+) reflect and boost the puck outward. Portals (35+) preserve motion through paired cyan entrances and rotate your exit direction. Gravity wells (50+) bend nearby motion toward their centre. The goal stays the same: read the geometry and control your momentum.'],
            ['EARN EVERY DIVISION.', '2 RR = 1 ELO. Hidden MMR adjusts gains toward your demonstrated skill. Efficient, fast, first-attempt clears earn more; over-par clears earn less. Win streak multipliers reach 1.4×; repeated losses increase penalties. One loss above 0 RR can land on your division floor; losing at 0 RR demotes you to the previous division at 70 RR. Select any emblem to inspect its threshold.'],
            ['CALIBRATE YOUR TOUCH.', 'Practice freely with a rubber wall, pinball bumper and paired portals. Pull from the puck and release. Focus the canvas to use arrows and Space. Reset any time. This world has no career, rating or progression effects.'],
            ['SEE THE SECOND ANGLE.', '1. Bank off corners to reach hidden lanes. 2. Use low power to set up a clean second shot. 3. Break glass to open a direct route. 4. Preserve momentum with rubber and bumpers; reduce power before gravity wells. 5. Hold Shift for precise keyboard aiming and soft positioning.']
        ];
        let art = n === 0 ? guideDiagram(1, reduced) : n === 1 ? guideDiagram(2, reduced) : n === 5 ? guideDiagram(5, reduced) : '';
        if (n === 2)
            art = '<div class="element-showcase">' + [['MOVING WALL', '15', 'moving'], ['PINBALL BUMPER', '25', 'bumper'], ['PAIRED PORTALS', '35', 'portal'], ['GRAVITY WELL', '50', 'gravity']].map(([label, room, kind]) => '<div class="element-demo ' + kind + '"><span class="element-vector" aria-hidden="true"></span><b>' + label + '</b><small class="mono">ROOM ' + room + '+</small></div>').join('') + '</div>';
        panel.innerHTML = art + '<h3>' + sections[n][0] + '</h3><p>' + sections[n][1] + '</p>';
        if (n === 3) {
            const groups = [['Iron', '#8B97A2'], ['Bronze', '#CD7F32'], ['Silver', '#B8C6CE'], ['Gold', '#E6C229'], ['Platinum', '#40C5C0'], ['Diamond', '#BA68C8'], ['Ascendant', '#41BB83'], ['Immortal', '#EC526C'], ['Radiant', '#FFD700']];
            this.ladderTiers = groups.flatMap(([tier, color], group) => Array.from({ length: tier === 'Radiant' ? 1 : 3 }, (_, offset) => ({ tier, color, division: offset + 1, index: group * 3 + offset, label: tier === 'Radiant' ? 'RADIANT' : tier.toUpperCase() + ' ' + ['I', 'II', 'III'][offset] })));
            panel.insertAdjacentHTML('beforeend', '<div class="ladder-selected" aria-live="polite"></div><div class="tier-showcase" aria-label="All 25 ranked tiers">' + this.ladderTiers.map(tier => '<button type="button" class="tier-button" data-ladder-tier="' + tier.index + '" aria-pressed="false" aria-label="Inspect ' + tier.label + '">' + getRankEmblemSVG(tier.tier, tier.division, tier.color) + '<span>' + tier.label + '</span></button>').join('') + '</div>');
            this.selectLadder(Math.min(24, this.store.getRankInfo?.().tierIndex || 0));
        }
        if (n === 4) {
            panel.insertAdjacentHTML('beforeend', '<canvas class="practice-canvas" width="1200" height="800" tabindex="0" aria-label="Practice sandbox. Pull backward from the puck to shoot, or focus and use arrows and Space."></canvas><div class="sandbox-footer"><span class="mono" data-sandbox-status></span><button type="button" class="sandbox-reset" data-sandbox-reset>RESET PRACTICE</button></div>');
            this.sandbox = new Sandbox(panel.querySelector('canvas'), panel.querySelector('[data-sandbox-status]'), this.settings?.touchSensitivity || 1);
        }
    }
    selectLadder(index) {
        const tier = this.ladderTiers[index];
        if (!tier)
            return;
        for (const button of this.root.querySelectorAll('[data-ladder-tier]'))
            button.setAttribute('aria-pressed', String(+button.dataset.ladderTier === index));
        this.root.querySelector('.ladder-selected').innerHTML = getRankEmblemSVG(tier.tier, tier.division, tier.color) + '<div><strong style="color:' + tier.color + '">' + tier.label + '</strong><span class="mono">' + (index * 50) + ' ELO / ' + (index * 100) + ' CAREER RR</span><small>' + (index === 24 ? 'TOP OF THE LADDER' : '100 DIVISION RR TO PROMOTE') + '</small></div>';
    }
    showPromotion(info) {
        this.finishPromotion?.();
        const promoted = typeof info.promotedTier === 'object' ? info.promotedTier : info;
        const label = typeof info.promotedTier === 'string' ? info.promotedTier : promoted.label || info.label || 'NEW DIVISION';
        const overlay = document.createElement('div');
        overlay.className = 'promotion-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'promotion-title');
        overlay.innerHTML = '<div class="promotion-rays" aria-hidden="true"></div><div class="promotion-content"><div class="eyebrow mono">RANK PROMOTION</div>' + getRankEmblemSVG(promoted.tier || info.tier, promoted.division || info.division, promoted.color || info.color || '#FFD700') + '<h2 id="promotion-title">' + escape(label) + '</h2><p class="mono">A NEW ANGLE. A HIGHER STANDARD.</p><button type="button" class="button primary" data-promotion-close>CONTINUE</button></div>';
        const focus = document.activeElement;
        for (const child of this.root.children)
            child.inert = true;
        this.root.append(overlay);
        this.promotionOpen = true;
        overlay.querySelector('button').focus();
        return new Promise(resolve => {
            const timer = setTimeout(() => this.finishPromotion?.(), this.reduced ? 700 : 2800);
            this.finishPromotion = () => {
                clearTimeout(timer);
                overlay.remove();
                this.promotionOpen = false;
                for (const child of this.root.children)
                    child.inert = false;
                this.hud.inert = this.screen !== 'game';
                focus?.focus({ preventScroll: true });
                this.finishPromotion = null;
                resolve();
            };
        });
    }
    async startIntro() {
        if (this.introPromise)
            return this.introPromise;
        this.introActive = true;
        this.root.dataset.intro = 'waiting';
        this.introPromise = new Promise(resolve => {
            let done = false, timer, releaseTimer, initiatingEvent;
            const consume = event => {
                event.preventDefault();
                event.stopImmediatePropagation();
            };
            const cleanShield = () => {
                clearTimeout(releaseTimer);
                for (const type of ['keydown', 'keyup', 'pointerup', 'pointercancel', 'click'])
                    window.removeEventListener(type, shield, true);
                window.removeEventListener('blur', cleanShield, true);
                this.cleanIntroShield = null;
            };
            const shield = event => {
                if (event.type === 'click') {
                    consume(event);
                    return;
                }
                const isKey = initiatingEvent?.type === 'keydown';
                const matches = isKey ? event.code === initiatingEvent.code : event.pointerId === initiatingEvent?.pointerId;
                if (!matches)
                    return;
                if (isKey && !['keydown', 'keyup'].includes(event.type))
                    return;
                if (!isKey && !['pointerup', 'pointercancel'].includes(event.type))
                    return;
                consume(event);
                if (event.type === 'keyup' || event.type === 'pointerup' || event.type === 'pointercancel') {
                    // The generated activation click follows release in the same browser task.
                    releaseTimer = setTimeout(cleanShield, 0);
                }
            };
            const finish = (skipped = false) => {
                if (done)
                    return;
                done = true;
                clearTimeout(timer);
                this.introActive = false;
                delete this.root.dataset.intro;
                for (const type of ['pointerdown', 'keydown'])
                    window.removeEventListener(type, skip, true);
                if (skipped && initiatingEvent) {
                    for (const type of ['keydown', 'keyup', 'pointerup', 'pointercancel', 'click'])
                        window.addEventListener(type, shield, true);
                    window.addEventListener('blur', cleanShield, true);
                    this.cleanIntroShield = cleanShield;
                }
                this.root.querySelector('.play-button').focus({ preventScroll: true });
                resolve();
            };
            const skip = event => {
                initiatingEvent = event;
                consume(event);
                finish(true);
            };
            for (const type of ['pointerdown', 'keydown'])
                window.addEventListener(type, skip, true);
            Promise.resolve(document.fonts?.ready).then(() => {
                if (done)
                    return;
                const wordmark = this.root.querySelector('.wordmark');
                const rect = wordmark.getBoundingClientRect();
                wordmark.style.setProperty('--b-centre', ((rect.width - wordmark.querySelector('.wordmark-b').getBoundingClientRect().width) / 2) + 'px');
                wordmark.style.setProperty('--intro-x', `${innerWidth / 2 - (rect.left + rect.width / 2)}px`);
                wordmark.style.setProperty('--intro-y', `${innerHeight / 2 - (rect.top + rect.height / 2)}px`);
                this.root.dataset.intro = this.reduced ? 'reduced' : 'running';
                timer = setTimeout(() => finish(), this.reduced ? 400 : 3500);
            });
            this.skipIntro = () => finish(true);
        });
        return this.introPromise;
    }
    showChapter(level) {
        const id = typeof level === 'number' ? level : level.id;
        if ((id - 1) % 10 !== 0)
            return Promise.resolve();
        const card = this.root.querySelector('.chapter-card');
        card.querySelector('[data-chapter-number]').textContent = `CHAPTER ${String(Math.floor((id - 1) / 10) + 1).padStart(2, '0')} / ROOM ${id}`;
        card.querySelector('[data-chapter-title]').textContent = chapter(id);
        card.hidden = false;
        return new Promise(resolve => setTimeout(() => {
            card.hidden = true;
            resolve();
        }, this.reduced ? 400 : 1800));
    }
    destroy() {
        this.sandbox?.destroy();
        this.finishPromotion?.();
        this.skipIntro?.();
        this.cleanIntroShield?.();
        this.tabResize?.disconnect();
        this.abort.abort();
        this.root.innerHTML = '';
    }
}
