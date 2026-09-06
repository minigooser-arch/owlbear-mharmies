# Naval Tactical Runtime + UI Plan

## Goal
Connect the already-approved naval tactical movement core to authoritative commands, Owlbear source-token movement, and role-safe ship-card controls.

## Preserved rules
- Forward only relative to current facing; one entered cell costs 1 tactical movement point.
- Left/right 90-degree turn costs 1 tactical movement point; 180 degrees requires two turns.
- Movement stays inside the existing naval battle `areaCells`.
- Movement after an active action is forbidden by the existing round-flow state machine.
- Movement-only/no-action turns end through «Завершить ход».
- Tactical control is available to GM or the leader of the ship's side.
- Battle snapshots remain immutable strategic return data; tactical movement changes the hidden source ship token position instead.
- Collision/occupied-cell policy, battle-area generation, broadside geometry, and damage are out of scope and must not be invented here.

## TDD sequence
1. RED: authoritative command tests for forward, left/right turn, explicit end turn, authorization, and active-ship checks.
2. GREEN: command protocol/validation/authorization/processor and source-token position persistence.
3. Verify command/runtime layer on an exact normal-push HEAD.
4. RED: role-safe `ShipView` tactical fields and `ShipCard` controls.
5. GREEN: expose only own-visible ship tactical state and add «Влево / Вперёд / Вправо / Завершить ход» controls.
6. Run full `npm run check` and inspect exact-HEAD GitHub Actions logs.
