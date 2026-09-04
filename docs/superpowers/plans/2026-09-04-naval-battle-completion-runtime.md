# Naval battle manual completion runtime

## Scope

- Add GM-only `COMPLETE_NAVAL_BATTLE`.
- Do not add automatic victory/end conditions.
- Reuse existing `completeNavalBattle()` lifecycle.
- Restore every still-registered participant to the strategic `position` and `facing` captured in `battle.snapshots`.
- Keep ship HP, class, movement budget, planned strategic route and other non-battle state unchanged.
- Archive the battle as `COMPLETED`, clear `activeNavalBattle`, and return the scene phase to `MOVEMENT`.
- One command produces one scene revision.
- Persist restored token position and rotation through the existing ship metadata persistence path.

## UI follow-up

- Show the active naval battle to the GM in the Battles page.
- Provide a dangerous `Завершить морской бой` action with confirmation.
- Give the GM a role-safe battle summary independent of the visible/registered ship list, so the manual completion control remains available even when the final participant was unregistered.
- Do not expose the global naval battle summary, participant count, or completion control to non-GM players from a partial role-safe snapshot.

## Verification

Require full `npm run check` on the exact final HEAD: typecheck, lint, all Vitest files, and production build.
