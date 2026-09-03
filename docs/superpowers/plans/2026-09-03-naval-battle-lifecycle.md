# Naval Battle Lifecycle Implementation Plan

**Goal:** Connect the already-tested naval initiative, round flow, ship lifecycle state, and battle reveal into one pure start/finish lifecycle for a precomputed naval battle.

**Scope intentionally fixed:**
- This layer does **not** invent battle-area generation. `areaCells` are supplied by the caller.
- This layer does **not** invent token placement. Strategic snapshots are supplied by the Owlbear adapter/caller.
- This layer does **not** implement attack damage while the final bow/broadside/stern strength table remains unresolved.

**Lifecycle rules:**
- Only one `activeNavalBattle` may exist in the scene.
- Initiating ship must be one of the participants.
- Every participant must be a registered, living ship and must have a strategic snapshot.
- Initiative is rolled once at battle start with the existing `rollNavalInitiative` rules.
- Per-round movement/action state is initialized through `startNavalRound`.
- Participating ships are marked `IN_NAVAL_BATTLE` and linked to the battle id.
- Scene turn phase becomes `NAVAL_BATTLE`.
- Opposing battle participants are persisted in `navalRevealUntilTurn` through the next global-turn boundary.
- A consumed battle request is removed when its id is supplied.
- Completing a battle stores a completed copy in history, clears the active battle, releases surviving participant ships to `READY`, clears their `battleId`, and returns the global turn phase to `MOVEMENT`.
- Strategic snapshots remain in battle history so the Owlbear adapter can restore/resolve token positions without duplicating battle rules.

### Task 1: Battle lifecycle core

**Files:**
- Create: `src/naval/battle/navalBattleLifecycle.test.ts`
- Create: `src/naval/battle/navalBattleLifecycle.ts`

- [ ] RED: starts from supplied participants/area/snapshots, marks ships and phase, initializes initiative and round budgets.
- [ ] RED: removes matching battle request and applies cross-side reveal through next global turn.
- [ ] RED: rejects a second simultaneous active battle.
- [ ] RED: rejects missing/dead participants or missing snapshots.
- [ ] RED: completion archives the battle, releases surviving ships, and returns phase to `MOVEMENT` while preserving snapshots.
- [ ] GREEN: implement by composing `rollNavalInitiative`, `startNavalRound`, and `applyBattleRevealUntilNextTurn`.

### Task 2: Verification

- [ ] Run focused lifecycle tests.
- [ ] Run full `npm run check`.
