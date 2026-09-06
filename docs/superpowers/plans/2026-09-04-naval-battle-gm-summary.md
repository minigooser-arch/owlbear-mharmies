# Naval battle GM summary

Implemented on `feature/naval-combat-v1`.

## Scope

- Expose the active naval battle initiative order only in the GM role-safe snapshot.
- Keep only the public tactical summary needed by the GM UI: ship id, initiative total, completed-this-round ids, and exited ids.
- Do not expose the global naval battle summary or initiative list to ordinary players.
- Render the initiative as a persistent ordered list in the GM battle card.
- Show current activation, exited ships, completed activations, and waiting ships without rerolling or rebuilding initiative.

## Verification

The exact final HEAD must pass `npm run check` (typecheck, lint, full Vitest suite, production build).
