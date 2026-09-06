# Authoritative naval battle start runtime

## Scope

- Add GM-only `START_NAVAL_BATTLE` to the command protocol.
- Keep battle-area generation out of this slice: `areaCells` are supplied by the caller.
- Never trust caller-supplied strategic snapshots. Build them from the registered ship state and authoritative Owlbear source-token positions.
- Preserve the current ship facing in each strategic snapshot.
- Reuse `startNavalBattle()` for initiative, round initialization, phase transition, request consumption, participant state, and battle reveal.
- Keep one command equal to one scene revision even though the pure lifecycle increments its own revision.
- Do not move ships into invented tactical start cells in this slice.
- Keep the command GM-only; faction leaders retain only the already-approved tactical and strategic ship controls.

## Runtime verification

- Unit command test: valid precomputed battle starts and consumes its naval request.
- Permission test: player command is rejected with `GM_ONLY`.
- ProductionEngine integration: snapshots come from real Owlbear token positions/facing, ship metadata becomes `IN_NAVAL_BATTLE`, scene phase becomes `NAVAL_BATTLE`, and no source token is moved by battle start.
- Require full `npm run check` on the exact final HEAD.
