# GM naval active-ship override

Implemented on `feature/naval-combat-v1`.

## Scope

- Add GM-only `SET_ACTIVE_NAVAL_SHIP`.
- Allow the GM to select another living, non-exited participant that has not completed its activation in the current naval round.
- Keep initiative order, round number, movement remaining, action-used state, completed activations, HP, facing, and ship state unchanged.
- The administrative override changes only `currentShipId` and the naval battle revision.
- A destroyed, exited, already-completed, missing, or non-participating ship cannot be selected.
- This feature is not rollback: it does not restore a previous ship's spent movement, action, damage, or completed-turn state.
- Reverting a previous turn remains a separate unresolved administrative feature.

## Verification

The exact final HEAD must pass `npm run check` (typecheck, lint, full Vitest suite, production build).
