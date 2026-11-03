# BANKSHOT v3 Architecture & Specifications

## 1. Competitive Ranked Architecture (ELO & RR)
* **Rating Basis**: Competitive ratings initialize at **Iron I** (`0 ELO` / `0 RR`). Migration from legacy saves preserves the player's seed, room records, unlocks, failure history, guide preferences, and settings. Subsequent saves persist directly to `bankshot.db.v3`.
* **Division Spans**: Each sub-tier spans exactly **50 ELO** (**100 RR**), with **Radiant** unlocked at **1,200 ELO**.
* **Grades**: Evaluated strictly on shot efficiency:
  * **S**: Under par
  * **A**: Exactly on par
  * **B**: 1 over par
  * **C**: 2 over par
  * **D**: 3+ over par
* **Scoring Factors**: Ratings synthesize shot efficiency, active room elapsed time, clean first-attempt bonuses, room difficulty multipliers, win streaks, and hidden MMR convergence. Pausing or opening the How-to-Play guide suspends the in-flight room timer.
* **Demotion Shields & Buffers**: A loss cannot penetrate a division floor (`0 RR`) until an additional loss occurs while sitting at that floor. Demotions land at `70 RR` in the prior tier rather than dropping to zero.

## 2. Procedural Level Generation & Clearance Engine
* **4 Dynamic Archetypes**: To eliminate repetition across high levels (Rooms 51–100+), levels are procedurally assigned to 4 geometric reflection archetypes:
  1. *Archetype 0*: Bottom-Left to Top-Right (Bank Top)
  2. *Archetype 1*: Bottom-Right to Top-Left (Bank Top Invert)
  3. *Archetype 2*: Top-Left to Bottom-Right (Bank Bottom)
  4. *Archetype 3*: Top-Right to Bottom-Left (Bank Bottom Invert)
* **Progression Thresholds**:
  * Moving walls: Room 15+
  * Bumpers: Room 25+
  * Moving portals: Room 31+ (Linear $\to$ Orbital $\to$ Lissajous motion)
  * Gravity wells: Room 50+
* **ClearanceEngine (`src/clearance.js`)**: Evaluates pairwise edge-to-edge separation and swept motion envelopes across spawns, goals, portals, gravity wells, bumpers, moving walls, and interior barriers to guarantee 0 overlapping geometry.
* **Corridor Reservation**: Responds dynamically to the intended primary reflection line to ensure that obstacles enrich puzzle complexity without blocking fair paths.

## 3. Multiplayer Online Race to Level 100 Mode
* **Authoritative WebSocket Server (`server/race-server.mjs`)**: Simulates and validates the complete physics replay of every completed room before accepting it. Forged inputs and illegitimate completion claims are rejected.
* **Delta Telemetry (`src/network/protocol.js`)**: Real-time position, velocity, and shot sequence data is quantized into 10-byte binary packets for minimal latency and bandwidth overhead.
* **Ghost Interpolation (`src/network/ghost.js`)**: Opponent positions are smoothly extrapolated via cubic Hermite splines. Teleportation through portals and room advancements break the spline continuity to prevent phantom warping.
* **Lobbies & Matchmaking**: Support for up to 8 racers per room, custom join codes, synchronized ready states, live leaderboard standings, and instant rematch queues.

## 4. UI, Viewport Lock & Valorant-Style Scrollbars
* **Viewport Scrolling Eliminated**: `html, body, #root, .bankshot` are locked with `overflow: hidden !important; width: 100%; height: 100%; height: 100svh;`. Window-level scrolling is eliminated across all viewports.
* **Valorant Scrollbar Styling**: Scrollable UI containers (`.settings-screen`, `.room-scroll`, `.guide-content`) feature ultra-thin, low-opacity bars with orange hover accents (`rgba(255, 107, 74, 0.7)`).
* **Interactive Sandbox**: Guide Tab 5 features a live practice canvas where players can place and test bumpers, gravity wells, portals, hazards, and walls with real-time clearance feedback.

## 5. Development & Verification
* `npm run dev`: Local Vite development server.
* `npm run build`: Single-file production bundler producing `dist/index.html`.
* `npm run server`: Dedicated authoritative multiplayer race server.
* `npm test`: Node.js native test runner executing all unit, generator, mechanics, and network test suites (91 checks).
* `npm run test:browser`: Playwright automated browser test suite (90 acceptance checks).
* `npm run test:ui-browser`: Playwright UI storage event and sandbox verification suite.
* `npm run test:race-browser`: Multi-client real-time race browser acceptance suite.
* `npm run test:all`: Executes all test suites sequentially.
