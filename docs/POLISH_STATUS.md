# Master polish implementation

Source requirements: `docs/master_polish_plan.md`. This work supersedes the earlier orbital/Lissajous portal design.

## Behavior

- Online lobby uses the game's chamfered panels, action buttons, input styling, and connection status indicators. Players create/join by room code; the server-address field is removed.
- Relay configuration is supplied by `window.BANKSHOT_RELAY_URL` or `VITE_BANKSHOT_RELAY_URL`. Local development defaults to port 8787; a combined deployment uses the current host's `/relay`. The included Render Blueprint provisions the relay and persistent profile disk. A separately hosted Vercel frontend requires its deployed relay URL at build time.
- Agent profiles derive a full SHA-256 browser signature and show a shortened Agent badge. Server storage retains campaign snapshots and server-awarded online results. Recovery codes provide explicit recovery when the browser signature changes.
- Browser fingerprinting is best-effort identification, not hardware attestation or authentication. Different privacy settings, browser engines, drivers, or displays may change it; incognito matching cannot be universally guaranteed. A matching signature or recovery code can restore records only from the same available relay/profile store.
- Guide puck animation travels forward and fades before its loop resets.
- Moving portals stay at constant X with vertical harmonic motion. Frequencies are expressed in cycles per second; clearance checks reserve only their vertical travel envelope plus portal radius.
- Keyboard rotation shows a 50-unit direction needle. Holding Space expands the trajectory with charge; pointer and touch aiming retain their existing previews.
- Restart belongs to the upper-right action cluster. It resets the world, interpolation, ghosts, and aim state without a duplicate ranked failure.

## Verification

Validation commands: `npm test`, `npm run test:browser`, `npm run test:ui-browser`, `npm run test:race-browser`, and `npm run build`.

Current focused gameplay validation: 62 tests passed, including 1,000 generated-room clearance/replay checks and the new keyboard/vertical-portal regressions. Final integrated results will be recorded after profile and relay validation.

Cloud deployment is configuration-ready; this change does not create or publish a cloud service.
