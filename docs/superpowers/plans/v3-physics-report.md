# v3 physics, generation, and rendering

## Implemented interfaces

`createWorld` copies optional `movingWalls`, `bumpers`, `portals`, and `gravityWells` from a room into isolated mutable world state. Old authored fixtures remain supported without these arrays.

- Moving walls preserve source endpoints (`baseA`, `baseB`), oscillate by `sin(freq*time+phase)*delta`, and expose compiled collision/render geometry. Sweeps use relative wall/puck velocity, including elapsed displacement within the fixed step. Rendering endpoints are updated to the current simulation time.
- Bumpers use continuous circle sweeps at combined puck/bumper radius, radial reflected velocity multiplied by restitution (default 1.25), capped at physics max speed. `hitAt` drives the impact flash.
- Portal pairs work in both directions. Entry requires velocity into the entrance normal and a continuous circle crossing. Exit anchors sit outside the destination circle by puck radius plus separation. Velocity rotates from the entering direction to the exit normal. Pair cooldown is 0.15 seconds; `world.teleports` counts transfers. Teleports reset interpolated puck coordinates to avoid a visual streak across the jump.
- Gravity wells apply the specified radial falloff force only while gliding and outside the puck-radius singularity.

`getAimTrajectory` preserves the original fields and adds `hasPortal` and `segments:[{x0,y0,x1,y1}]`. Portal paths are discontinuous segments, so the renderer never draws a line across the teleport gap. Portal recursion is bounded to four transfers; each reflected leg still stops at its next collision. Wall and bumper normals come from swept collision geometry.

## Generator

Elements appear at exact rooms 15/25/35/50, rubber sampling begins at 10, glass at 20, and hazards at 30. Arrays are always present. Source spawn and goal remain clear of generated element footprints. Seeded generation and fallback verification both run the expanded production physics. Generated reference solutions use no more than par.

Removed performance-ratio/difficulty-modifier geometry mutations. A changing performance callback, cache eviction, or fresh provider cannot change a persistent room. Adaptive shot budgeting belongs to progression, not generation.

Generation remains fixed-work and deterministic: up to eight candidates normally, configurable bounded attempts up to 29 plus one verified fallback. No elapsed-time branch influences geometry.

## Rendering

Added requested palette tokens and vector treatments: white oscillating-wall tracks, amber concentric bumper/tick rings with hit pulse, cyan oriented dual-ring portals with dotted cores, and purple gravity rings with inward markers. Ember trails activate from `world.winStreak >= 3`, cap at 32 entries, and expire after 0.45 seconds. One-shot wins draw a gold 12-ray burst and expanding ring. Reduced motion disables ember emission and movement/pulsing of decorative effects; physics continues normally. `renderer.highDpi` defaults true; false forces DPR 1 on resize.

## Verification evidence

TDD red runs observed missing mechanics, missing portal aim, missing generator thresholds, and the performance-dependent replay regression before implementation. Focused suites pass moving-wall contact, bumper boost, portal direction/rotation/cooldown, gravity bending, portal preview segmentation, deterministic element generation, safe placement, fallback verification, replay invariance, and renderer smoke coverage for all new elements and visual effects.

Stress run: **500 normal and 500 forced-fallback generations all succeeded**. Normal timing on the shared Windows environment: median **5.18 ms**, p95 **10.84 ms**, maximum **69.49 ms**. Typical generation remains below 40 ms; the worst sample exceeded that target under concurrent workload. Timing never changes room choice.

Earlier complete-suite run had one input-owner test failure (`touch sensitivity changes power...`, undefined `.call`); the owning agent was informed and is repairing it. Final combined verification is coordinated by root after all owned files settle.

## Practical limits

Moving-wall CCD linearizes sinusoidal velocity over each existing 1/240-second step. Aim displays current moving-wall geometry and straight gravity-free rays; portal transitions and first reflection are predicted. New generated elements occupy safe secondary play space and affect alternate routes rather than making every reference solution depend on dynamic timing. The constructive route families remain the established bank/positioning families. These choices preserve deterministic, bounded, reproducibly winning reference solutions without requiring a launch-time scheduler.
