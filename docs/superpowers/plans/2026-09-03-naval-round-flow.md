# Naval Round Flow Implementation Plan

**Goal:** Implement the agreed ship-turn and naval-round state machine on top of the persisted initiative order.

**Approved rules:**
- Initiative is resolved once at battle start and its order persists for the battle.
- A ship gets the movement value of its canonical class each naval round.
- A ship may use at most one attack or active ability during its turn.
- Using an attack/active ability ends that ship's turn immediately; no movement follows it.
- A movement-only or no-action turn is ended explicitly with the UI label «Завершить ход».
- After the last living/non-exited ship finishes, the next naval round starts and movement/action limits reset.
- Destroyed/missing and exited ships do not receive turns.
- GM turn override/revert is a separate administrative layer because the exact rollback semantics for spent movement/actions/damage are not encoded in the current battle state.

### Task 1: Round/turn state machine

**Files:**
- Create: `src/naval/battle/navalRoundFlow.test.ts`
- Create: `src/naval/battle/navalRoundFlow.ts`

- [ ] RED: initialize first active ship from persisted initiative order.
- [ ] RED: initialize canonical class movement and unused action state.
- [ ] RED: spend movement only for the active ship and never below zero.
- [ ] RED: using an action auto-completes the ship turn and advances to the next eligible ship.
- [ ] RED: explicit end-turn advances movement-only/no-action turns.
- [ ] RED: exited and destroyed/missing ships are skipped.
- [ ] RED: finishing the last eligible ship increments the round and restores all per-round limits without rerolling/reordering initiative.
- [ ] GREEN: implement pure immutable state transitions.

### Task 2: Verification

- [ ] Run focused round-flow tests.
- [ ] Run full `npm run check`.
