# v3 state implementation report

Owned: src/state.js and tests/state.test.mjs. Read PLAN.md Component 1 and current implementation before changing. No Git or subagents.

## Delivered

- Storage now uses bankshot.db.v3/version3. With no valid v3 document, v2 room records, sequential unlocks, current room, player seed, failure counts, settings, guide flag, legacy archive and career statistics migrate. Ranked ELO/MMR/streaks/peaks/history reset to zero once. Subsequent v3 loads retain ranked progress.
- Strict room grades: under-par S, on-par A, +1 B, +2 C, +3 or worse D. Prior saved room records are retained as requested; new attempts use v3 grade rules.
- Wins start with 9/6/4/2/1 ELO, add speed (<6s +2, <12s +1) and safe first-attempt +2. Multiply the sum by difficulty, current win-streak multiplier and clamped convergence, then round to integer ELO (minimum1). Difficulty caps at1.30; streaks cap at1.4.
- Loss uses round(8 * lossStreakMultiplier / convergence), inverse convergence honoring the plan prose that lower hidden MMR causes harsher losses. Visible loss stops at current division floor before a subsequent floor loss demotes15 ELO to previous division70RR. IronI clamps0. History records actual post-shield delta, not nominal penalty.
- PLAN does not specify how hidden MMR itself changes. Chosen deterministic policy: add unscaled performance (base+bonuses) on win, subtract8 on failure, clamp at0. It stays independent from visible difficulty/streak/shield transformations and generates the specified convergence pressure. Root informed.
- Accepted launches persist activeAttempt {room,shots} immediately while retaining all career shots. On reload a pending attempt becomes one loss and is cleared/saved, preventing repeated loss charging on further reloads. Success/failure clear the corresponding pending attempt. First-attempt bonus checks persisted room failures even when caller passes true.
- setSetting validates booleans aimPreview/highDpi/reducedMotion, numeric touchSensitivity0.5..2, and reducedMotionMode system/on/off. Defaults are sensitivity1, highDpi true, system motion. Legacy true reducedMotion migrates to on. setSetting synchronizes old motion boolean; toggle works for boolean fields only.
- Rank history bounded to8 newest-first; malformed ELO deltas rejected, RR reconstructed from actual ELO on repair. Room history/ratio stats and storage-denial repair remain supported.

## Integration API

recordSuccess(level,shots,triesUsed=shots,maxTries,roomTime=Infinity,isFirstAttempt=true) returns grade. roomTime is seconds. getRankInfo now includes winStreak,lossStreak,mmr,justPromoted,promotedTier (rank info object or null), numeric deltaElo/deltaRR and lastDeltaElo/lastDeltaRR aliases, plus existing label/color/peak/matchHistory. Promotion flag describes latest applied match and resets on reload. History retains signed string deltaElo/deltaRR/delta compatibility fields.

Main integration reviewed: accepted Input.launch callback records shots once; restart/title/switch abandonment records failure; completed success passes world.time seconds; paused/guide world clock remains stopped. Settings binding matches new state fields. Identified existing performance-dependent geometry changing after eviction/reload; reported root to resolve in generator. PLAN under-par verification wording differs from generator's on-par reference witness; reported for root ruling.

## Verification

TDD initial v3 replacement tests ran against old implementation:12 expected failures (v3 reset/formulas/settings/reload/grades missing),5 retained tests passing. Implementation yielded17/17. Added expanded boundary/repair checks:19/19. Added malformed-history regression, observed expected failure, fixed repair and verified20 state tests passing.

Full suite command from PLAN:

`agy-node.cmd --test tests/physics.test.mjs tests/generator.test.mjs tests/state.test.mjs tests/aim.test.mjs tests/input.test.mjs`

First full run:61 passed0 failed. Latest full run during concurrent root regression additions:61 passed2 failed, all20 state tests passed. Failures: `changing player performance cannot alter persistent room geometry after eviction` (6 vs4 walls, generator issue reported root) and `touch sensitivity changes power without changing aim or mouse calibration` (Input.prototype.pointerMove undefined because pointerMove is class instance arrow field, test needs actual instance). Root informed of both. Root owns final integrated suite/build/browser evidence.
