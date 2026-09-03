# Naval Broadside Targeting Implementation Plan

**Goal:** Implement the single naval attack type as a broadside-only targeting/action layer without inventing the missing historical cell mask or replacing it with bow/stern attacks.

**Confirmed rules:**
- There is one ship attack type: broadside.
- Broadside fires to the ship's sides relative to current facing; bow/stern fire does not exist.
- The finalized design used exact cell diagrams and allowed diagonal cells in side sectors.
- Exact historical sector offsets are not currently recoverable from repository state, so geometry is supplied as a dedicated `BroadsideSectorResolver` dependency rather than guessed.
- Existing canonical class range fields remain the authoritative range until the final weapon table is restored.
- Naval LOS is required.
- A successful broadside consumes the ship's one naval action and therefore ends its activation through existing round-flow logic.
- Damage/armor resolution stays separate until the final damage table/formula is recovered.

### Task 1: Broadside targeting validation

**Files:**
- Create: `src/naval/battle/navalBroadside.test.ts`
- Create: `src/naval/battle/navalBroadside.ts`

- [ ] RED: only active ship may fire.
- [ ] RED: unarmed classes cannot fire.
- [ ] RED: target must be inside supplied exact broadside sector mask.
- [ ] RED: target must be inside class min/max range.
- [ ] RED: naval LOS is required.
- [ ] RED: same-side target is rejected.
- [ ] RED: committing a valid broadside consumes the action and auto-ends activation.
- [ ] GREEN: implement pure validation plus composition with `useNavalAction`.

### Task 2: Exact sector mask adapter

Deferred until the original finalized cell diagrams are recovered; do not substitute an approximate cone.

### Task 3: Verification

- [ ] Run focused broadside tests.
- [ ] Run full `npm run check`.
