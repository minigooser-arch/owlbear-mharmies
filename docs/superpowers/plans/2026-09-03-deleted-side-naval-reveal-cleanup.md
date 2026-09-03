# Deleted-side naval reveal cleanup

- `DELETE_SIDE` removes every ship owned by the deleted side through the existing `destroyShip()` lifecycle.
- Reveal entries in surviving observer maps are cleaned by ship destruction.
- The deleted side's own `navalRevealUntilTurn[sideId]` observer map is removed explicitly.
- The command still increments scene revision exactly once.

Regression coverage: `src/commands/sideDeletionShips.test.ts`.
