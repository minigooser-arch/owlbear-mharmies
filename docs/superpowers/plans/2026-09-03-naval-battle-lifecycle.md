# Naval Battle Lifecycle Implementation Plan

**Goal:** Connect the already-tested naval initiative, round flow, ship lifecycle state, and battle reveal into one pure start/finish lifecycle for a precomputed naval battle.

**Scope intentionally fixed:**
- This layer does **not** invent battle-area generation. `areaCells` are supplied by the caller.
- Every supplied battle-area cell must support the `SEA` movement domain; land/island cells are rejected.
- This layer does **not** invent token placement. Strategic snapshots are supplied by the Owlbear adapter/caller.
- This layer does **not** implement attack damage. Naval attacks use the single approved **broadside** attack type; damage resolution remains a separate block.
- Exact geometric criteria for leaving the tactical battle area are not defined here. Until they are specified, ship exit is confirmed by the GM rather than inferred by a player-side client.

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
- A confirmed ship exit keeps the ship in the battle participant list and preserves its strategic snapshot, marks it in `exitedShipIds`, and advances the existing initiative flow. `ShipState` is not rewritten merely because the ship exited the tactical area.
- Completing a battle stores a completed copy in history, clears the active battle, releases surviving participant ships to `READY`, clears their `battleId`, and returns the global turn phase to `MOVEMENT`.
- Strategic snapshots remain in battle history so the Owlbear adapter can restore/resolve token positions without duplicating battle rules.

### Task 1: Battle lifecycle core

**Files:**
- Create: `src/naval/battle/navalBattleLifecycle.test.ts`
- Create: `src/naval/battle/navalBattleLifecycle.ts`

- [x] RED/GREEN: starts from supplied participants/area/snapshots, marks ships and phase, initializes initiative and round budgets.
- [x] RED/GREEN: removes matching battle request and applies cross-side reveal through next global turn.
- [x] RED/GREEN: rejects a second simultaneous active battle.
- [x] RED/GREEN: rejects missing/dead participants or missing snapshots.
- [x] RED/GREEN: completion archives the battle, releases surviving ships, and returns phase to `MOVEMENT` while preserving snapshots.
- [x] Runtime: start and completion persist through `ProductionEngine`, including strategic position/facing restoration on completion.
- [x] Validation: reject battle areas containing cells that do not support `SEA`.
- [x] Command: GM can confirm an active ship's tactical exit through `CONFIRM_NAVAL_SHIP_EXIT`; duplicate and destroyed-ship cases have stable rejection reasons.

### Task 2: Verification

- [ ] Run full `npm run check` on the exact final HEAD after UI/runtime exit integration.
