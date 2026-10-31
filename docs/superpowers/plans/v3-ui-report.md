# v3 UI implementation report

## Scope
Updated src/ui.js, src/styles/ui.css; added src/sandbox.js. No career state, main gameplay or physics source modified.

## Guide
Six new tabs: Basics & Controls; Physics & Surfaces; New Elements; Ranked Ladder & MMR; Practice Sandbox; Pro Tips. Existing Escape/backdrop/close behavior, focus restore, inert siblings, arrow/number tab navigation, responsive active accent and focus trap remain.

The ladder renders 25 keyboard-focusable custom vector emblems. Selecting one updates a live detail panel with tier, ELO threshold and career RR threshold. Copy explains 2 RR = 1 ELO, hidden MMR convergence, performance/streak multipliers and one-loss floor protection.

Sandbox uses production createWorld/launch/stepWorld in an entirely separate world with no store reference. It includes solid boundary, rubber wall, pinball bumper, portal pair and goal. Pointer pulling supports primary-pointer capture, cancellation, single active pointer and release; keyboard arrows/Space work when canvas focused. Leaving tab, closing guide or destroying UI aborts input and cancels its animation frame. Goals auto-reset after a short success message. Manual reset is available.

New-element cards show moving wall, bumper, portal and gravity well vector motifs and room thresholds. Existing relevant kinetic diagrams retained for controls/reflection/tips; reduced motion uses static diagrams.

## Settings
480px maximum content width, categorized Gameplay & Controls / Video & Accessibility / Keybinds Reference. Aim preview and high-DPI are existing setting actions. Range sensitivity is 0.5–2.0 in 0.05 steps. Reduced motion is System / On / Off.
Range/select input emit `action('setting-value', {key, value})`. setSettings updates controls and interprets explicit Off separately from system preference. Dynamic sensitivity output remains synchronized. Root owns applying these settings to main input/renderer.

## HUD, result and promotion
HUD adds win/loss streak (fire indicator at 3+W) and elapsed seconds. Cached nodes update only when displayed values change. Results add exact two-decimal time and most recent RR/ELO delta.
`showPromotion(rankInfo): Promise<void>` appends an accessible fullscreen promotion dialog, makes siblings inert and returns on Continue / Escape / Enter / Space or auto-dismiss (~2800ms; reduced 700ms). Root awaits it before calling result. Modal handles its own close interaction and restores prior focus.

## Browser selectors
- `.practice-canvas` intrinsic 1200×800; initial puck at (250,570), physical radius14, pointer hit area100.
- `[data-sandbox-status]`, `[data-sandbox-reset]`.
- `[data-ladder-tier="0"]` through `[data-ladder-tier="24"]`; `.ladder-selected` live detail.
- `[data-setting-value="touchSensitivity"]`, `[data-setting-value="reducedMotionMode"]`, `[data-key="highDpi"]`.
- `[data-streak]`, `[data-elapsed]`, `[data-result-time]`, `[data-result-rating]`.
- `.promotion-overlay`, `[data-promotion-close]`.

## Verification
TypeScript parser reported no ui.js diagnostics after v3 changes. Parent owns integration browser and build QA. Sandbox compiled-wall drawing corrected to ax/ay/bx/by after review. Canvas CSS maintains its true3:2 ratio without letterboxing so pointer coordinates map correctly.
