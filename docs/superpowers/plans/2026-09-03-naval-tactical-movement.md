# Naval Tactical Movement Implementation Plan

**Goal:** Implement the agreed directional movement rules for an active ship inside an already-created naval battle area.

**Approved rules used here:**
- A ship can move only forward relative to its current facing.
- A forward move enters one adjacent strategic/tactical grid cell and costs 1 naval movement point.
- A ship turns only in 90-degree increments; each left/right 90-degree turn costs 1 naval movement point.
- A 180-degree reversal therefore requires two 90-degree turns and costs 2 movement points.
- Sideways and backward moves are invalid.
- Movement must remain inside the battle's existing `areaCells`.
- Movement after an attack/active ability is already prevented by the round-flow state machine.
- Collision/occupied-cell policy is intentionally not invented here because it was not preserved in the final design context.

### Task 1: Tactical maneuver core

**Files:**
- Create: `src/naval/battle/navalTacticalMovement.test.ts`
- Create: `src/naval/battle/navalTacticalMovement.ts`

- [ ] RED: facing-to-forward-cell mapping for all four facings.
- [ ] RED: forward step costs 1 movement.
- [ ] RED: sideways/backward steps are rejected.
- [ ] RED: destination outside `areaCells` is rejected.
- [ ] RED: left/right 90-degree turns update facing and cost 1 movement.
- [ ] RED: 180-degree reversal requires two turn operations and therefore 2 movement.
- [ ] GREEN: implement by composing with `spendNavalMovement`.

### Task 2: Verification

- [ ] Run focused tactical movement tests.
- [ ] Run full `npm run check`.
