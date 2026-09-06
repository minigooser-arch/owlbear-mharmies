# Naval Detection and Visibility Implementation Plan

> **For agentic workers:** use test-driven development for each production change and verify the full branch before completion.

**Goal:** Add deterministic naval detection, terrain-based naval line of sight, GM per-ship detection overrides, player visibility calculation, and persistent battle reveal through the next global-turn boundary without inventing a previously unspecified numeric base detection range.

**Architecture:** Keep the detection core pure and strategic-cell based under `src/naval/detection`. The caller supplies the common base detection range; `ShipState.detectionOverride` replaces it for one ship. Terrain LOS is resolved from the existing `movementDomains`/`blocksNavalLos` model. Battle reveal is stored in the already-migrated `navalRevealUntilTurn` scene field and expires when the next global turn begins.

**Approved rules preserved:**
- All ship classes use one common base detection range.
- GM may override detection range per individual ship.
- The historical design intentionally left the base distance as `X`; this implementation does not hard-code a new value.
- LAND/legacy terrain blocks naval LOS by default.
- SEA and CANAL may allow naval LOS when `blocksNavalLos` is false.
- All ships participating in the same naval battle reveal to the opposing participating sides.
- Battle participants remain revealed until the next global turn begins.
- GM can see every registered ship.

### Task 1: Strategic naval line of sight

**Files:**
- Create: `src/naval/detection/navalLineOfSight.test.ts`
- Create: `src/naval/detection/navalLineOfSight.ts`

- [ ] RED: tests for open SEA/CANAL, blocking LAND, legacy blocking behavior, and endpoint handling.
- [ ] GREEN: implement deterministic strategic-cell LOS traversal.

### Task 2: Detection graph and overrides

**Files:**
- Create: `src/naval/detection/navalDetection.test.ts`
- Create: `src/naval/detection/navalDetection.ts`

- [ ] RED: common base range, per-ship override, out-of-range target, blocked LOS, and independent side detection.
- [ ] GREEN: implement pure detection graph with caller-supplied strategic-cell distance.

### Task 3: Player visibility and battle reveal persistence

**Files:**
- Create: `src/naval/detection/navalVisibility.test.ts`
- Create: `src/naval/detection/navalVisibility.ts`

- [ ] RED: GM sees all, side sees own ships, detection reveals enemies, stored reveal reveals enemies, expired reveal hides them.
- [ ] RED: battle participants reveal cross-side targets until the next turn boundary without revealing same-side ships redundantly.
- [ ] GREEN: implement visibility and immutable battle-reveal update helpers.

### Task 4: Verification

- [ ] Run focused naval detection tests.
- [ ] Run `npm run check` on current HEAD.
- [ ] Confirm all land-army tests remain green.
