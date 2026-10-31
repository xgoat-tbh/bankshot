# Progression implementation report

Owned files: src/state.js, tests/state.test.mjs, obsolete state imports/assertions removed from tests/physics.test.mjs. No Git commands used.

## Persistence and API

Storage key is always bankshot.db.v2, independent of transitional config. New data has version 2, persistent UUID userSeed, one-based currentLevel/maxUnlocked, settings, seenGuide, stats, levelRecords, and roomFailures. Store creation saves repairs and the new UUID immediately. safeStore and createStore safely handle a throwing localStorage getter and storage read/write denial.

Exports: createStore, safeStore, calculateRank, rank (letter-rank compatibility alias), calculateTriesBudget(par, recentRatios = [], failStreak = 0). Methods: canPlay, select, calculateBudget(index,par), recordShot, recordFailure(index=currentLevel), recordSuccess(level,shots,triesUsed=shots,maxTries optional), toggle, markGuideSeen, save, getStats, unlocked. available is a getter. select/recordFailure/recordSuccess reject invalid or locked IDs without mutation. Success returns a letter and advances currentLevel to the next room.

recordSuccess accepts a level object {id,par}; numeric IDs are supported with existing par or fallback par 1. Prefer passing the actual level object. Records expose {rank,bestRank,bestShots,par,clearedAt,completions}; rank is canonical, bestRank is a compatibility alias. Repairs accept either rank field. Both best shot and best grade improve independently. Replays cannot downgrade a grade, inflate unique completed counts, or increment unlocks beyond the sequential frontier.

## Adaptive behavior and stats

Completed attempts append shots/par ratios, retaining only the last ten. No history uses the average category, par+2. Inclusive 1.05 and 1.5 boundaries and the hard-category min(5,par+3) cap apply before persisted per-room pity floor(failures/3). Failure count survives reload and browsing; success clears that room's failure streak. S/A/B thresholds take precedence over D; later clears become D after failures or on the last try, otherwise C. Clean replays can upgrade D to C even with equal shots.

recordShot is the sole fired-shot counter and saves immediately, so controller must call it once per accepted launch, including failed and replay launches. recordSuccess deliberately does not increment fired shots. Rank counts describe current best room ranks and completed count is unique rooms. getStats returns these counters, accuracy, averageRatio, totalRoomsPlayed. Accuracy is completed-attempt par-equivalent shots divided by every fired shot, capped at 100%; completedPar is accumulated across completed attempts, including replays. Rooms played counts rooms with either completions or failed attempts.

## Repair/migration

JSON failures produce fresh repaired saves. Valid settings, seed, counters, ratio entries and records survive individual invalid fields. Sequential completed records are retained; holes, malformed records, and disconnected later records cannot unlock rooms. currentLevel is clamped to the reconstructed unlock frontier. Legacy bankshot.progress.v1 content is archived at data.legacy, with valid settings preserved; fixed-room clears do not unlock different procedural geometry.

## Verification

TDD: initial ten behavioral tests were run against the old store and all failed for missing v2 behavior. Implemented replacement; all ten passed. Added canonical rank/timestamp/continue regression, observed expected failure, implemented, and all eleven passed.

Latest focused and physics/generator/aim run:

`node --test tests/physics.test.mjs tests/state.test.mjs tests/aim.test.mjs tests/generator.test.mjs`

42 passed, 0 failed, exit 0. Runtime: C:/Users/Outcast/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe.

Earlier broad `node --test tests/*.test.mjs` run: 40 passed and one failed because tests/browser.test.mjs could not resolve package playwright. Reported to root; browser dependencies and acceptance belong to integration. At that time state had 10 tests and generator had 2. No state logic failures remained. Root owns package.json test configuration and full final integration/build validation.
