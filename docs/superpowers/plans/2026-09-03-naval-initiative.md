# Naval Initiative Implementation Plan

**Goal:** Implement deterministic naval battle initiative matching the agreed final combat rules.

**Approved rules:**
- Every participating ship rolls its own d20.
- The specific initiating ship receives +2 only on its initial roll.
- No class-based initiative bonus is used in the current final design.
- Ships tied on initiative reroll a clean d20 with no bonus.
- If a reroll ties again, only the still-tied subgroup rerolls again.
- Once initiative order is resolved, it persists for the battle; later rounds reuse it.

### Task 1: Initiative resolver

**Files:**
- Create: `src/naval/battle/navalInitiative.test.ts`
- Create: `src/naval/battle/navalInitiative.ts`

- [ ] RED: initiator +2 on initial roll only.
- [ ] RED: descending total order.
- [ ] RED: tied ships reroll clean d20.
- [ ] RED: repeated tie rerolls only tied subgroup.
- [ ] RED: reject invalid d20 result and missing initiating ship.
- [ ] GREEN: minimal deterministic resolver with injected d20 roller.

### Task 2: Verify

- [ ] Run focused initiative tests.
- [ ] Run full `npm run check`.
