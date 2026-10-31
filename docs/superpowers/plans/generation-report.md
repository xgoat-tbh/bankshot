# Generator and aiming implementation report

## Interfaces

- `generateRoom(roomIndex, userSeed, options?)`: **one-based** positive safe integer room index. Returns `id`, `name`, `puck`, `walls` (eight boundary segments first), `goal`, `hazards`, `par`, executable `solution`, `aimLength`, normalized `difficulty`, and generation diagnostics.
- `createRoomProvider(seed, capacity = 32)`: returns callable `getRoom(index)`. `.getRoom(index)` is also supported. LRU capacity is clamped to 1–128; evicted rooms regenerate identically.
- `getAimTrajectory(world, angleRadians, maxLength)`: returns `x0,y0,x1,y1,x2,y2,hasBounce,normal:{x,y}`. The second segment receives the remaining preview distance after the first swept-radius wall contact and terminates at a second swept collision. Its query begins one separation epsilon outside the first wall; the first normal is preserved. Reflection is exactly `d - 2 dot(d,n)n`, including endpoint normals.
- `launch` refuses further shots when a finite `world.budget` is exhausted. Worlds without budgets retain existing simulation behavior.

## Construction and bounds

Seed hashing accepts persisted UUID/string seeds. Geometry does not depend on clocks. Default work is at most eight randomized candidates plus a fixed-corridor fallback; explicit attempt count is capped at 29, so total verification attempts never exceed 30. Every returned room wins through production `simulateSolution`; no unverified fallback is returned.

Rooms 1–20 use a bank approach. Rooms 21–40 add a gate and a positioning shot beneath its tip before banking. Rooms 41 onward add perpendicular positioning before banking. Par therefore progresses 1, 2, 3. Coordinates, obstacle orientations, materials, goal/puck positions, and horizontal/vertical route reflection vary by seed and room. Extra obstacles occupy the nonreserved region. The direct-shot barrier and later approach gate constrain the route; hazards constrain lower shortcuts. Solid boundary restitution is included in the constructive bank-angle calculation.

Interior wall count, goal width, aim length, material selection weights, and post-room-30 hazard count follow the supplied formulas. Material percentages are sampling weights, since exact per-room percentages cannot be represented by two through eight walls. Boundary walls remain solid. Fallback uses fixed seed coordinates with the current room's wall count, materials schedule, goal size, aim length, hazards, and par.

## Verification

TDD red runs confirmed missing generator/trajectory behavior, then confirmed progression/par and finite-budget tests fail before their implementation.

Fresh command: Node 24.22.1 `--test tests/physics.test.mjs tests/generator.test.mjs tests/aim.test.mjs tests/state.test.mjs`: **44 passed, zero failures**. This includes every authored solution and the existing 48-angle maximum-speed containment checks.

Generator tests cover 60 seeded rooms, fresh deterministic equality, million-scale indices, distinct geometry, cardinal/45-degree orientation, bounds, wall/goal/aim formulas, material eligibility, hazards, bank impacts, successful replay, LRU eviction/regeneration, and forced fallback at every index 1–100.

Additional stress: 1,500 seeded rooms and 1,500 forced fallbacks all generated successfully. Normal generation required no fallbacks in this sample. Windows local runtime timings: median **3.23 ms**, p95 **6.03 ms**, maximum **47.86 ms**. Typical generation meets 40 ms; one worst-case sample exceeded it under the shared concurrent workload. Timing never influences selection.

An earlier wildcard `--test tests/*.test.mjs` could not load the browser suite because the repository lacked its `playwright` package. All loaded tests passed. Root owns browser dependency/acceptance verification.

## Limits

The constructive system deliberately reserves route corridors, so it produces three route families with mirrored variants rather than arbitrary global topologies. Extra materials can allow clever shorter solutions; par is the verified reference solution length, not a mathematical minimum. Later difficulty is capped as specified by wall/goal/aim formulas. Physics tuning changes may invalidate the fallback corridor; verification then throws explicitly instead of serving an unwinnable room. Provider returns cached room objects; consumers should compile world state rather than mutate source geometry.

