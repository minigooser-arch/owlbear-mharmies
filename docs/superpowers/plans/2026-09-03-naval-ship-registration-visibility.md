# Naval Ship Registration and Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ships first-class Owlbear extension objects: GM registration on SEA/channel cells, token metadata persistence, and hidden shared source tokens reconciled into per-player local clones.

**Architecture:** Reuse the existing command processor, scene `ships` registry, token metadata persistence pattern used by armies, and `LocalCloneReconciler`. Ship registration updates the scene registry; `persistCommandState` mirrors each `ShipState` into `METADATA_KEYS.ship` and hides the source item. `visibilityTick` must perform one combined local-clone reconciliation over the union of visible army IDs and visible ship IDs, because both object types share the existing `METADATA_KEYS.localClone` namespace.

**Tech Stack:** TypeScript, Vitest, Owlbear Rodeo SDK adapter, GitHub Actions CI.

**Spec:** `docs/superpowers/specs/2026-09-03-naval-ship-registration-visibility-design.md`

## Global Constraints

- `REGISTER_SHIP` / `UNREGISTER_SHIP` are GM-only.
- Registration requires an IMAGE on a strategic cell supporting SEA.
- Channel cells are valid SEA cells.
- One item cannot be both army and ship.
- Ship state must exist in token metadata and `scene.ships` in sync.
- Registered source ship items are hidden; players see local clones only when naval visibility allows them.
- Do not invent a base naval detection range in this task.

---

### Task 1: Ship commands and authoritative registration

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/constants.ts`
- Modify: `src/commands/commandValidation.ts`
- Modify: `src/commands/commandProcessor.ts`
- Test: `src/naval/ships/shipRegistrationCommands.test.ts`

**Interfaces:**
- Produces `REGISTER_SHIP { itemId, sideId, classId, facing }` and `UNREGISTER_SHIP { shipId }`.
- Uses `createRegisteredShip`, `destroyShip`, `cellSupportsDomain`, and the processor's existing `cellForPosition` adapter.

- [x] Write RED tests for payload parsing, GM-only permission, IMAGE/side validation, SEA/channel requirement, army/ship exclusivity, successful registration, and unregister.
- [x] Run CI and confirm failures are caused by missing ship commands.
- [x] Add command payload types and parsers.
- [x] Add `METADATA_KEYS.ship`.
- [x] Implement processor registration/unregistration using existing naval lifecycle functions.
- [ ] Run full `npm run check` in CI and require GREEN.

### Task 2: Ship token metadata persistence

**Files:**
- Modify: `src/shared/validation.ts`
- Modify: `src/storage/migrations.ts`
- Modify: `src/storage/metadataRepository.ts`
- Modify: `src/background/application.ts`
- Test: `src/storage/metadataRepository.test.ts`
- Test: `src/background/application.test.ts`

**Interfaces:**
- Produces `ShipRecord`, `readShips`, `writeShip`, `clearShip`, and a token metadata validator for `ShipState`.
- `persistCommandState` mirrors `next.scene.ships` to `METADATA_KEYS.ship` and writes `visible: state === undefined` exactly like army persistence.

- [ ] Write RED repository tests proving valid ship metadata is read and clear restores source visibility.
- [ ] Write RED application persistence test proving registration writes ship metadata and hides the source item; unregister clears metadata and restores visibility.
- [ ] Run CI and confirm RED.
- [ ] Export/introduce ship metadata normalization/migration.
- [ ] Add ship repository methods.
- [ ] Extend command persistence with rollback-safe ship metadata writes.
- [ ] Run full `npm run check` and require GREEN.

### Task 3: Per-player ship token clones

**Files:**
- Modify: `src/background/application.ts`
- Test: `src/background/navalOverlayIntegration.test.ts`

**Interfaces:**
- Uses existing `visibleShipIdsForPlayer` output and `LocalCloneReconciler`.
- Ship source list is `sceneItems.filter(item => scene.ships[item.id] !== undefined)`.
- Reconciliation must be a single call with `visibleArmyIds ∪ visibleShipIds` and army-source items + ship-source items, so one pass cannot delete clones created by the other.

- [ ] Extend the existing integration test so own/revealed ships create local token clones and hidden enemies do not.
- [ ] Verify RED because only army source items are currently reconciled.
- [ ] Reconcile the union of visible army and ship source IDs in one `LocalCloneReconciler` call.
- [ ] Verify ship overlays and ship clones use the same visible ID set.
- [ ] Run full `npm run check` and require GREEN.

### Task 4: Final verification

**Files:** none

- [ ] Confirm no temporary patch workflow/script remains.
- [ ] Confirm all test files and tests pass.
- [ ] Confirm typecheck, lint, and production build pass.
- [ ] Review branch diff for accidental land-army behavior changes.
