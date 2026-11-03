# Bankshot Game & Architecture Invariants

1. **Par & Turn Constraints**:
   - A level's `par` is its strict turn ceiling.
   - If `shots >= par` and the puck comes to rest without scoring, trigger a 2-second auto-filling retry dialog.
   - Solvers must confirm each level is solvable within `par` turns before presenting to players.

2. **Mobile Arena Scaling**:
   - Mobile canvas must span full available width without margin clipping or horizontal scrolling.
   - Keep touch targets $\ge 44\text{px}$ and ensure HUD elements overlay cleanly without obscuring the playfield.

3. **Rank Invariants**:
   - Accounts with $< 5$ online races display as `UNRANKED` with placement progress (`0/5`).
   - Campaign starting rating displays as `IRON I (0 ELO)`.

4. **Persistence**:
   - Server persistence must use embedded SQLite (`node:sqlite`) with WAL mode and automatic atomic fallback.
