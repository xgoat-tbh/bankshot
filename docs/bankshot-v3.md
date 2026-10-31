# BANKSHOT v3

v3 starts competitive ratings at Iron I, 0 ELO / 0 RR. Migration preserves the player's seed, room records, unlocks, failure history, guide preference, and settings. The old v2 save remains available in local storage; the game subsequently writes `bankshot.db.v3`.

Each division spans 50 ELO (100 RR), with Radiant at 1,200 ELO. Room grades are S below par, A at par, B one above, C two above, and D thereafter. Ratings combine shot efficiency, active room time, a clean first attempt, difficulty, streaks, and hidden MMR convergence. Pauses and the guide do not advance the room timer. A loss cannot cross a division floor until a subsequent loss at that floor; demotion lands at 70 RR in the previous division. Match history shows the actual applied change.

The plan does not define an MMR update equation. This implementation updates it from the unscaled performance score on wins and an eight-point base loss independently of visible ELO. Loss convergence is inverted to fulfill the plan's stated requirement that lower MMR makes losses harsher. The plan's suggested >55% required win rate is a balancing target, not a mathematical guarantee of these variable performance rewards.

Moving walls appear from room 15, bumpers from 25, portals from 35, and gravity wells from 50. Rooms are checked with the same physics used in gameplay. Generation is constructive, with seeded geometry and bounded verification, rather than unrestricted random obstacles.

The guide includes an independent practice canvas and an interactive 25-division ladder. Practice does not alter shots, ratings, or room progress. Settings expose touch sensitivity, aim preview, display density, and explicit system/on/off reduced motion. Reduced motion suppresses animated feedback.

## Development and verification

`npm run dev` serves the plain ES module entry. `npm run build` produces the self-contained `dist/index.html` bundle. `npm test` runs the headless regression suites. With a local server at port 4174, `npm run test:browser` exercises the UI with Playwright. Override `BANKSHOT_URL` and `BANKSHOT_BROWSER` for another server or Chromium executable.

On this Windows workspace, the available Node wrapper is `C:\Users\Outcast\AppData\Roaming\Antigravity\bin\agy-node.cmd`. It can run `node_modules/vite/bin/vite.js build` and `--test tests/physics.test.mjs tests/generator.test.mjs tests/aim.test.mjs tests/state.test.mjs tests/input.test.mjs` directly.
