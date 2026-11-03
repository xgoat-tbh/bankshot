> **v3 update:** See [current ranked rules, multiplayer race architecture, migration, mechanics, and settings](docs/bankshot-v3.md). The v3 implementation supersedes older rating examples below.

<div align="center">

# 🎱 BANKSHOT

**A deterministic 2D precision bank-shot billiards physics puzzle game with endless procedural levels, real-time 8-player online race to level 100, 8-ball pool predictive reflection trajectories, and a Valorant-style competitive ranked progression system.**

[![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?logo=javascript&logoColor=black&style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Canvas 2D](https://img.shields.io/badge/HTML5-Canvas_2D-E34F26?logo=html5&logoColor=white&style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
[![Physics](https://img.shields.io/badge/Physics-Fixed--Step_120Hz-FF6B3D?style=for-the-badge)](#-mathematics--physics-engine)
[![Unit Tests](https://img.shields.io/badge/Unit_Tests-91%20Passed-10B981?logo=node.js&logoColor=white&style=for-the-badge)](#-testing--quality-assurance)
[![Playwright](https://img.shields.io/badge/Browser_E2E-90%20Passed-45ba4b?logo=playwright&logoColor=white&style=for-the-badge)](#-browser-acceptance-suite)
[![Multiplayer](https://img.shields.io/badge/Online_Race-8--Player_100_Rooms-blueviolet?style=for-the-badge)](#-multiplayer-online-race-to-level-100)
[![Dependencies](https://img.shields.io/badge/Dependencies-Zero_Runtime-blue?style=for-the-badge)](#-zero-runtime-dependencies)
[![License](https://img.shields.io/badge/License-MIT-A855F7?style=for-the-badge)](LICENSE)

<br/>

> *"ONE PUCK. A PERFECT LINE. ENDLESS ROOMS. EVERY ANGLE IS YOURS."*

<br/>

<img src="assets/screenshots/hero.png" alt="Bankshot Title Screen" width="900" style="border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);" />

</div>

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Visual Showcase](#-visual-showcase)
- [Core Gameplay & Features](#-core-gameplay--features)
- [Multiplayer Online Race to Level 100](#-multiplayer-online-race-to-level-100)
- [Valorant-Style Ranked System (ELO & RR)](#-valorant-style-ranked-system-elo--rr)
- [Mathematics & Physics Engine](#-mathematics--physics-engine)
- [Procedural Level Generation & Spatial Clearance Engine](#-procedural-level-generation--spatial-clearance-engine)
- [Adaptive Budget & Pity System](#-adaptive-budget--pity-system)
- [Controls & Input Modes](#-controls--input-modes)
- [Quick Start (Zero Build Required)](#-quick-start-zero-build-required)
- [Testing & Quality Assurance](#-testing--quality-assurance)
- [Codebase Architecture](#-codebase-architecture)
- [Production Build](#-production-build)
- [License](#-license)

---

## 🌟 Overview

**Bankshot** is an arcade precision puzzle game designed around geometric bank shots, specular wall bounces, and spatial calculation. Built entirely with vanilla web technologies, the game pairs high-framerate 2D vector canvas rendering with a continuous swept-capsule collision physics engine and an endless procedural room generator that physically verifies every solution before presenting it to the player.

Players compete through a tiered ranked ladder inspired by **Valorant**, earning **Rank Rating (RR)** and persistent **ELO** rating (`2 RR = 1 ELO`) across 25 distinct competitive tiers from **Iron I** to **Radiant**, or jump into real-time **Online Race Mode** to compete live against up to 8 players across 100 synchronized procedural rooms.

### Key Highlights
* 🎯 **8-Ball Pool Predictive Trajectory**: Dotted projection line reveals the exact launch path and specular reflection normal before you release.
* ⚡ **120 Hz Continuous Collision Physics**: Sub-step swept-circle continuous collision detection ensures no tunneling through thin walls even at 3,200 px/s.
* 🏎️ **Real-Time Online Race to Level 100**: Low-latency WebSocket multiplayer with authoritative server replay validation, 10-byte delta-compressed binary telemetry, and cubic Hermite ghost interpolation.
* 🌌 **Infinite Procedural Rooms & Clearance Engine**: Seed-driven level generation with 4 dynamic geometric archetypes and an automated spatial clearance solver guaranteeing zero overlap and 100% solvable puzzle geometry.
* 🏆 **Competitive Ranked Ladder**: Full 25-tier progression system (Iron, Bronze, Silver, Gold, Platinum, Diamond, Ascendant, Immortal, Radiant) with demotion shields and match history.
* 🛠️ **Interactive Vector Practice Sandbox**: In-guide placement tool allowing players to drop bumpers, gravity wells, portals, hazards, and walls directly onto a live practice canvas.
* 📱 **Universal Cross-Platform Controls**: Seamless support for mouse slingshots, fine touch drag-and-release, and precision keyboard aiming (`Shift` for fine angular adjustments).
* 🛡️ **Zero Runtime Dependencies**: Pure ES2022 modules, single-file canvas rendering, local storage persistence, and full offline functionality for single-player.

---

## 📸 Visual Showcase

<div align="center">

| In-Game Precision Aiming & HUD | Interactive Vector Guide & Sandbox |
| :---: | :---: |
| <img src="assets/screenshots/gameplay.png" alt="Gameplay HUD and Arena" width="440" /> | <img src="assets/screenshots/guide.png" alt="Interactive How-to-Play Guide" width="440" /> |
| *8-ball pool specular aim trajectory with live try budget and par* | *Interactive multi-tab modal with kinetic vector line-art & practice tools* |

| Competitive Ranked Career Profile | Responsive Mobile & Touch Play |
| :---: | :---: |
| <img src="assets/screenshots/career_stats.png" alt="Valorant Career Profile" width="440" /> | <img src="assets/screenshots/mobile.png" alt="Mobile Viewport" width="440" /> |
| *Valorant rank emblems, division RR gauge, ELO tracking & match history* | *Responsive touch slingshot interface optimized for mobile viewports* |

</div>

---

## 🎮 Core Gameplay & Features

### 1. 8-Ball Pool Style Predictive Trajectory
Pulling back on the puck casts a ray along your launch vector, calculating:
* Direct distance and power indicator with calibrated dead-zones.
* The exact point of first impact with any wall geometry.
* The specular reflection angle calculated via $\vec{v}' = \vec{v} - 2(\vec{v} \cdot \hat{n})\hat{n}$.
* Traversal through glowing portals with split-vector exit ray trajectories.
* A trailing dotted trajectory that automatically truncates on goal capture or material boundaries.

### 2. Reactive Surface Materials & Cosmic Hazards
| Material / Element | Restitution | Behavior | Visual Indicator |
| :--- | :---: | :--- | :--- |
| **Solid Wall** | `0.80` (80%) | Standard firm reflection; foundational puzzle surface. | High-contrast bone stroke (`#E9E6DF`) |
| **Rubber Wall** | `0.98` (98%) | Hyper-elastic rebound; preserves almost all kinetic energy. | Vibrant cyan glow (`#4DD0E1`) |
| **Glass Wall** | `0.70` (70%) | Brittle; shatters on high-speed impact (>650 px/s), opening routes. | Frosted line-art (`#80CBC4`) |
| **Moving Wall** | `0.80` (80%) | Oscillates on linear trajectories with continuous swept motion. | Dynamic velocity arrows & trail |
| **Bumper** | `1.25` (125%) | Hyper-elastic circular boost pin applying positive normal kick. | Pulsing solar amber rings |
| **Portal Gate** | Pass-through | Teleports puck instantaneously, redirecting velocity vector. | Dual cyan/blue glowing ellipses (Linear, Orbital, Lissajous) |
| **Gravity Well** | Gravitational | Pulls or repels puck trajectory with bounded $1/r^2$ force curves. | Swirling magenta accretion disk |
| **Hazard Barrier** | `0.00` (0%) | Instantly consumes the shot and resets puck to origin. | Hazard red / warning amber (`#FF5252`) |

---

## 🏎️ Multiplayer Online Race to Level 100

Bankshot includes a competitive real-time multiplayer race mode where up to 8 players compete head-to-head to clear 100 procedural rooms first.

### Architecture & Network Stack
* **Authoritative Server Verification**: The Node.js race server (`server/race-server.mjs`) deterministically simulates and validates the full physics replay of each claimed room clear before awarding advancement. Forged completions and out-of-order claims are rejected instantly.
* **10-Byte Delta Telemetry**: During flight, clients broadcast ultra-compact 10-byte binary packets encoding quantized position `(x, y)`, velocity `(vx, vy)`, shot sequence ID, and high-resolution server timestamp.
* **Hermite Ghost Interpolation**: Opponents appear as ethereal ghost pucks rendered via cubic Hermite spline extrapolation. Teleportation jumps through portals and room transitions automatically break spline interpolation to eliminate visual warping.
* **Synchronized Seeded Progression**: All racers in a room share an identical procedural seed, guaranteeing equal geometric puzzle layouts.
* **Lobby & Rematch Lifecycle**: Real-time room creation, join codes, player ready toggles, countdown synchronization, live rank leaderboards, and instant post-match rematches.

Start the local relay alongside Vite, then open **Race to 100**. Create a room and share its code, or enter a code to join. The browser connects to the relay automatically.
```bash
npm run server
```

`npm run build` creates the single-file client. The race server serves that build at `/` when `dist/index.html` exists, with the relay at `/relay` and profile API at `/profile`. The local CLI saves profiles in `data/profiles.json`. Set `BANKSHOT_PROFILE_FILE` to use another path.

The repository includes a Render Blueprint for hosting the client and relay together. If you host the client separately on Vercel, set `VITE_BANKSHOT_RELAY_URL` to the WebSocket URL of your deployed relay before building, for example `wss://your-relay.example/relay`. `window.BANKSHOT_RELAY_URL` set before the app loads overrides the build configuration. The default uses port 8787 on local HTTP and same-origin `/relay` elsewhere. The lobby never asks players for a server address. [Render Blueprint reference](https://render.com/docs/blueprint-spec)

---

## 🏆 Valorant-Style Ranked System (ELO & RR)

Bankshot features a competitive progression system modeled after **Valorant's competitive ranking architecture**, connecting room performance directly to a global player **ELO** and division **Rank Rating (RR)**.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  IRON      BRONZE     SILVER     GOLD       PLATINUM   DIAMOND    ASCENDANT  ... │
│  [I-II-III][I-II-III] [I-II-III] [I-II-III] [I-II-III] [I-II-III] [I-II-III] ... │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### The `2 RR = 1 ELO` Equivalence
* **Equivalence**: **`2 RR = 1 ELO`** ($\implies 1\text{ ELO} = 2\text{ RR}$).
* **Division Span**: Every sub-tier spans exactly **`50 ELO`** ($100\text{ RR}$).
* **Tier Index**: $\text{Tier} = \min\left(24, \lfloor \text{ELO} / 50 \rfloor\right)$.
* **Division RR**: $\text{RR} = (\text{ELO} \pmod{50}) \times 2$.
* **Radiant Tier**: Achieved at $1,200+\text{ ELO}$, where RR continues uncapped.

### Ranked Scoring Table
| Outcome | Performance Threshold | ELO Delta | RR Delta |
| :--- | :--- | :---: | :---: |
| **Flawless Win** | Cleared under par (Rank **S**) | `+15 ELO` | `+30 RR` |
| **On-Par Win** | Cleared exactly on par (Rank **A**) | `+11 ELO` | `+22 RR` |
| **Over-Par Win** | Cleared over par (Rank **B / C**) | `+8 ELO` | `+16 RR` |
| **First-Clear Bonus** | First time completing a new room | `+5 ELO` | `+10 RR` |
| **Room Failure** | Shot budget exhausted | `-7 ELO` | `-14 RR` |

### Demotion Shield & Fair Retry Rules
1. **Division Demotion Shield**: If a player's division RR is above `0`, a failure can only reduce their rating down to the division floor (`0 RR`). It will not demote them across tiers on that initial loss.
2. **Grace Landing Buffer**: A demotion from an already-at-zero tier drops the player to `76 RR` in the prior division rather than resetting them to bottom.
3. **Practice & Mid-Attempt Retries**: Pressing `R` or selecting "Restart" while remaining within your allotted budget **never penalizes rank rating**.

---

## 🔬 Mathematics & Physics Engine

The physics simulation runs on a decoupled **deterministic fixed-step accumulator** at $120\text{ Hz}$ ($\Delta t = 8.33\text{ ms}$), with sub-step linear interpolation for display smoothing:

$$\text{accumulator} = \min(\text{accumulator} + \Delta t_{\text{frame}}, \text{maxFrame})$$

### Swept Capsule Continuous Collision Detection
To prevent bullet tunneling through ultra-thin walls, movement vectors are swept as continuous capsules against line segments:

Given puck position $\vec{P}$, velocity $\vec{V}$, radius $r$, and a wall segment from $A$ to $B$:
1. Parameterize the closest point on segment $\overline{AB}$ to puck trajectory $\vec{P}(t) = \vec{P}_0 + t\vec{V}$.
2. Solve the quadratic intersection for distance $d(t) \le r$.
3. Compute radial vertex collision normal if hitting endpoints, or perpendicular face normal $\hat{n}$:
$$\hat{n} = \frac{(B_y - A_y, -(B_x - A_x))}{\|\vec{B} - \vec{A}\|}$$
4. Reflect velocity vector according to material coefficient of restitution $e$:
$$\vec{V}' = \vec{V} - (1 + e)(\vec{V} \cdot \hat{n})\hat{n}$$

### Exponential Kinetic Damping
Free puck gliding applies velocity damping per step:
$$\vec{V}_{t+1} = \vec{V}_t \cdot \left(1 - \text{damping} \cdot \Delta t\right)$$
Motion ceases completely when $\|\vec{V}\| < v_{\text{stop}}$ ($1.5\text{ px/s}$).

---

## 🎲 Procedural Level Generation & Spatial Clearance Engine

Every room in Bankshot is synthesized dynamically using 4 procedural geometric archetypes coupled with an automated spatial validation engine:

```mermaid
flowchart TD
    A["Room Index (1..100+) + User Seed"] --> B["Select Geometric Archetype (0..3)"]
    B --> C["Compute Flank Boundaries & Corridor Reservation"]
    C --> D["Inject Moving Portals, Wells, Bumpers, Walls"]
    D --> E["ClearanceEngine Swept Envelope & Spacing Validation"]
    E -- Collision Found --> F["Retry with Alternate Candidate Coordinates"]
    F --> E
    E -- Clear --> G["Run Virtual Headless Physics Replay Solver"]
    G -- Unsolved --> H["Fallback Corridor Adjustment"]
    H --> G
    G -- Verified Solvable --> I["Finalize Room Geometry & Compute Par"]
```

1. **4 Geometric Archetypes**:
   * *Archetype 0*: Bottom-Left $\to$ Top-Right (Bank Top)
   * *Archetype 1*: Bottom-Right $\to$ Top-Left (Bank Top Invert)
   * *Archetype 2*: Top-Left $\to$ Bottom-Right (Bank Bottom)
   * *Archetype 3*: Top-Right $\to$ Bottom-Left (Bank Bottom Invert)
2. **ClearanceEngine (`src/clearance.js`)**: Evaluates pairwise edge distances and swept motion envelopes across spawns, goals, portals, gravity wells, bumpers, moving walls, and interior barriers to guarantee 0 overlapping geometry.
3. **Corridor Reservation**: Responds dynamically to the intended primary reflection line to ensure that obstacles enrich puzzle complexity without blocking fair paths.

---

## 📈 Adaptive Budget & Pity System

Rather than enforcing rigid attempt limits, Bankshot's state machine monitors the player's rolling completion ratio:

$$\text{Ratio} = \frac{1}{K}\sum_{i=1}^{K} \frac{\text{shots}_i}{\text{par}_i} \quad (K \le 10)$$

* **Mastery Bracket** ($\text{Ratio} \le 1.05$): Expert players are granted strict, tight budgets ($\text{par} + 1$).
* **Standard Bracket** ($1.05 < \text{Ratio} \le 1.5$): Balanced puzzle exploration ($\text{par} + 2$).
* **Lenient Bracket** ($\text{Ratio} > 1.5$): Extended exploration ($\min(5, \text{par} + 3)$).
* **Pity Assistance**: Every 3 consecutive failures on the same room increment the budget by $+1$ try, resetting immediately upon completion.

---

## ⌨️ Controls & Input Modes

| Action | Mouse | Touch | Keyboard |
| :--- | :--- | :--- | :--- |
| **Aim Direction** | Drag puck backward | Pull puck backward | `Arrow Left` / `Arrow Right` |
| **Fine Angle Aim** | Minor pointer delta | Fine drag | Hold `Shift` + `Arrows` |
| **Charge Power** | Pull distance | Pull distance | Hold `Space` |
| **Shoot Puck** | Release mouse | Release finger | Release `Space` |
| **Cancel Shot** | Right-click / Escape | Touch secondary finger | `Escape` |
| **Quick Restart** | Click HUD `RESTART` | Tap HUD `RESTART` | `R` |
| **How to Play** | Click HUD `?` | Tap HUD `?` | `H` |
| **Pause / Menu** | Click HUD `MENU` | Tap HUD `MENU` | `Escape` |

---

## 🚀 Quick Start (Zero Build Required)

Bankshot is built as a **zero-dependency vanilla web application**. You can run it instantly using any static web server:

### Option 1: Python HTTP Server
```bash
# Clone the repository
git clone https://github.com/xgoat-tbh/bankshot.git
cd bankshot

# Start server
python3 -m http.server 8000
```
Then navigate to `http://localhost:8000` in your browser.

### Option 2: Modern Vite Development
```bash
npm install
npm run dev
```

### Option 3: Dedicated Multiplayer Race Server
```bash
npm run server
```

---

## 🧪 Testing & Quality Assurance

Bankshot includes comprehensive automated test coverage spanning mathematical unit tests, procedural clearance audits, multiplayer network simulations, and end-to-end browser automation.

### Unit, Generator & Network Test Suite
Run the 91 unit, system, and network tests with Node's native test runner:
```bash
npm test
```
The suite verifies:
* Swept capsule geometry, endpoint normal accuracy, and continuous crossing detection.
* Solvability and 0 clearance violations across 1,000 consecutively seeded procedural rooms.
* Reactive materials (solid, rubber, glass threshold shattering, hazards).
* `2 RR = 1 ELO` ranked mechanics, promotion fanfare, demotion shields, and database persistence.
* 8-player network synchronization, delta-compression, anti-cheat replay verification, and rematch queues.

### Browser Acceptance Suite
Run the Playwright end-to-end acceptance suite:
```bash
npm run test:browser
npm run test:ui-browser
npm run test:race-browser
```
Automated browser checks verify:
* 14 consecutive rooms physically cleared using simulated pointer drag vectors.
* Touch input simulation and mobile slingshot mechanics.
* Virtual scrolling DOM virtualization past room 1,200.
* Multi-client real-time race synchronization and pointer clearances in headless Chrome.
* High-DPI DPR canvas scaling and zero console errors.

---

## 📁 Codebase Architecture

```
bankshot/
├── assets/
│   └── screenshots/         # Curated documentation screenshots
│       ├── hero.png         # Title screen
│       ├── gameplay.png     # Arena & trajectory aim
│       ├── guide.png        # Interactive How-to-Play modal
│       ├── career_stats.png # Valorant rank profile & ELO
│       └── mobile.png       # Responsive mobile view
├── server/
│   └── race-server.mjs      # Authoritative WebSocket multiplayer race server
├── src/
│   ├── config.js            # Physics constants, colors, timing tokens
│   ├── clearance.js         # Spatial clearance engine & swept motion envelopes
│   ├── generator.js         # Procedural level synthesis & verification solver
│   ├── input.js             # Mouse, touch, keyboard unified input manager
│   ├── levels.js            # Authored tutorial rooms & milestone definitions
│   ├── main.js              # Game loop, screen router, accumulator orchestration
│   ├── physics.js           # 120Hz fixed-step swept-capsule collision engine
│   ├── render.js            # 2D Canvas renderer, aim projections, visual effects
│   ├── sandbox.js           # Interactive vector practice sandbox & placement tool
│   ├── state.js             # Unified localStorage DB, ELO & RR ranked ladder
│   ├── ui.js                # DOM screens, How-To-Play guide, career profile, race UI
│   ├── network/
│   │   ├── client.js        # Race client & binary WebSocket packet handler
│   │   ├── ghost.js         # Hermite cubic spline extrapolation for opponents
│   │   └── protocol.js      # 10-byte binary telemetry codec & packet types
│   └── styles/
│       ├── tokens.css       # Design tokens, palette, typography, chamfers
│       └── ui.css           # Modal styling, HUD, career stats, animations
├── tests/
│   ├── aim.test.mjs         # Aim trajectory unit tests
│   ├── browser.test.mjs     # Playwright E2E browser acceptance test suite
│   ├── generator.test.mjs   # Procedural solvability & 1,000-room clearance audit
│   ├── input.test.mjs       # Input manager tests
│   ├── mechanics.test.mjs   # Bumpers, gravity wells, moving portals, hazards tests
│   ├── network.test.mjs     # Server replay verification & 8-racer sync tests
│   ├── network-browser.mjs  # Multi-client headless browser race test
│   ├── physics.test.mjs     # Continuous collision physics tests
│   ├── state.test.mjs       # ELO, RR, and persistence tests
│   └── ui-browser.test.mjs  # Cross-tab storage sync & sandbox placement tests
├── index.html               # Main entry HTML
├── package.json             # Scripts & devDependencies
├── tsconfig.json            # TypeScript / JSDoc configuration
└── vite.config.ts           # Single-file production bundler configuration
```

---

## 📦 Production Build

To compile Bankshot into a standalone, ultra-portable **single-file HTML bundle** (inlining all HTML, CSS, JavaScript, and SVG vectors into `dist/index.html`):

```bash
npm run build
```

The resulting `dist/index.html` (~177 KB uncompressed, ~52 KB gzipped) can be distributed or hosted on GitHub Pages, Netlify, Vercel, or opened directly from a local file without a server.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) — free to use, modify, and distribute.

---

<div align="center">
<sub>Crafted with geometric precision by <b>xgoat.tbh</b>. Find your angle.</sub>
</div>
