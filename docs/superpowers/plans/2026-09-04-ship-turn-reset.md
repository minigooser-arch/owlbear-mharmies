# Ship global turn reset

Implemented on `feature/naval-combat-v1`.

## Contract

- A completed global turn restores every registered ship's `globalMovementRemaining` to the movement value of its ship class.
- `movementSpentThisTurn` resets to `false`.
- The ship revision increments once for the reset.
- The reset does not alter `plannedRoute`, facing, HP, status, battle assignment, detection override, cargo, or other ship state.
- Both scheduled and manual global turn completion use the same `completeTurn` path.
- Normal command/turn persistence is responsible for mirroring changed ship state into `METADATA_KEYS.ship` on the source Owlbear item.

## Regression coverage

- `src/turns/shipTurnReset.test.ts`

Full exact-HEAD verification must pass typecheck, lint, the complete Vitest suite, and production build through `npm run check`.
