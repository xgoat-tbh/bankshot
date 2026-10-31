# BANKSHOT Evolution Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Check each deliverable and report evidence.

**Goal:** Implement the user's complete endless procedural BANKSHOT evolution.
**Architecture:** Keep vanilla ES modules and the existing swept-circle fixed-step engine. Generate verified, seed-stable rooms; persist progression in one repaired v2 document; coordinate accessible DOM overlays with canvas gameplay.
**Tech Stack:** JavaScript, Canvas 2D, SVG, CSS, Node tests, Vite, browser acceptance checks.
**Spec:** User-supplied Master Implementation Plan in this chat, including Q1–Q17 and T1–T4.

## Global constraints
- Infinite sequential rooms, one-based room IDs, same-room reset on failure, unique persistent player seed.
- W(N)=clamp(2+floor(N/5),2,8); goal half width clamp(48-floor(N/10)*2,32,48); aim length clamp(2400-N*25,450,2400).
- Materials: solid through 10; 75/25 solid/rubber through 20; 60/20/20 solid/rubber/glass through 30; 50/25/25 plus 1–2 hazards thereafter.
- Budget uses last ten shots/par ratios: <=1.05: par+1; <=1.50: par+2; otherwise min(5,par+3); add floor(same-room failures/3).
- Letter ranks only; JetBrains Mono. Best rank survives replay. No particles or screen shake.
- Preserve plain static entry, mouse/touch/keyboard controls, storage failure safety, reduced motion, and continuous collisions.
- Generation must always return a physics-verified solution; bound stochastic search and use deterministic verified fallback. Runtime timing must not change a player's geometry.

## Review focus
- Exhausted budgets, hazards, and manual restarts must not grant unlimited free attempts or lose career shots.
- Corrupt saves, legacy saves, replay order, and reloading must preserve sequential unlocks and same-room pity.
- Intro skip input must not activate underlying actions; dialogs must pause and restore focus/state.
- Large level indices and scrolling must remain bounded in memory and DOM nodes.
- Generated solution must win through actual production physics, including material changes and hazards.

## Tasks
- [ ] 1. Generator and aim physics: `src/generator.js`, additions to `src/physics.js`, focused generation/aim tests. Deterministic finite search, executable solution, formulas, validated fallback, first reflection.
- [ ] 2. Persistence and adaptive progression: `src/state.js`, state tests, update obsolete state assertions. Repair/migrate v2, rolling ten completions, pity, rank upgrades, profile stats.
- [ ] 3. Interface: `src/ui.js`, `src/styles/ui.css`, `src/styles/tokens.css`, `index.html`. Intro and skip shield, title/HUD, virtual rooms/thumbnails, stats, six-section accessible guide, chapter cards, universal button motion.
- [ ] 4. Integration and rendering: `src/main.js`, `src/input.js`, `src/render.js`, `src/config.js`. Endless loop, finite budgets/failure reset, pause-safe overlays, chapter timing, trajectory, ghost puck, goal flash.
- [ ] 5. Verification: execute headless tests and production build; update browser suite for procedural progression; exercise desktop/mobile, intro, guide, replay, persistence and failures; review and fix findings; update README.

## Rulings
- Supplied detailed design and implementation plan authorize implementation; no repeat design approval needed.
- D:/Game is not a Git repository. Reuse it as requested; do not initialize Git or create a worktree.
- Parallel workers own disjoint files. Root owns config/main/input/render and integration.
- S/A/B shot thresholds take precedence, following supplied calculateRank; C/D distinguish later clears and failed attempts. A clean replay can upgrade any rank.
- First-time budget defaults to average player (par+2). Same-room fail state is persisted per room so browsing cannot reset pity.
- Legacy authored scores cannot truthfully become ranks for different procedural geometry; retain legacy data for reference and settings, begin procedural progression at room 1.
- Generation uses fixed deterministic work bounds instead of choosing geometry by elapsed time; measure the 40ms target and report hardware limitations honestly.
