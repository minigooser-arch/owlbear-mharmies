# Backend Read Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce repeated Owlbear scene reads and avoidable backend work while preserving command consistency, army movement, visibility, and chunked-map integrity.

**Architecture:** Add an operation-scoped repository frame that indexes one scene-item read and can hydrate a revision-checked scene from the same chunk items. Adopt it in hot command and background paths, return from movement ticks before scene hydration when idle, then optimize distance and boundary calculations behind parity tests and bounded work limits.

**Tech Stack:** TypeScript, Owlbear Rodeo SDK 3.1, React-independent background services, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-24-operations-ux-and-backend-performance-design.md`

## Global Constraints

- Keep scene/army revisions, coordinator lease checks, protocol validation, authorization, and item-level compare-and-swap behavior.
- Preserve movement-phase processing of every eligible army and existing route cleanup semantics.
- Preserve role-safe visibility, observer-specific detection range, directional/mutual modes, and exact barrier checks.
- Keep chunk manifests authoritative and preserve the existing write/rollback boundary.
- Retain 8×8 sparse chunks, implicit sea, and bounded Owlbear batches.
- Optimize only when operation counts or timings measurably improve with parity tests passing.

## Review Focus

- Metadata or manifest changes during frame hydration must retry or reject rather than combine mismatched scene and chunk data; test the current manifest-race cases in Task 1.
- Missing or malformed chunk items must keep their current errors and never become implicit sea; test with missing/corrupt chunk fixtures in Task 1.
- An army that begins moving while the idle probe is running must be processed on the next tick; test the running and pending queue behavior in Task 3.
- Bounded distance execution must not change detection direction, mode, range, or barrier decisions; test those inputs in Task 4.
- Adjacent state borders must preserve duplicate edges between distinct jurisdictions, stable overlay keys, and the absence of same-state interior edges; test in Task 5.

---

### Task 1: Operation-scoped repository read frames

**Files:**
- Modify: `src/storage/metadataRepository.ts`
- Test: `src/storage/metadataRepository.test.ts`
- Modify: `src/storage/gridChunkRepository.ts`
- Test: `src/storage/gridChunkRepository.test.ts`
- Modify: `src/tests/helpers/gridStoragePort.ts`

**Interfaces:**
- Produces `MetadataItemFrame` with immutable `items`, `armies`, `ships`, `barriers`, and the scene metadata snapshot that was stable around the item read.
- Produces `MetadataReadFrame` with `items: MetadataItemFrame` and a hydrated `scene: SceneState`.
- Repository methods: `readItemFrame(): Promise<MetadataItemFrame>` brackets one `getSceneItems()` call with scene-metadata reads and retries up to three times if scene or manifest revisions change. `readFrame(frame?): Promise<MetadataReadFrame>` hydrates from that exact item/metadata snapshot, verifies metadata after hydration, and retries with a fresh item frame when required.
- `GridChunkRepository.read(metadata, sceneItems?)` accepts the supplied scene-item collection; when provided, it must not call `getSceneItems()` again.

- [ ] **Step 1: Add counting-port tests for item indexing and one-call hydration.**

Extend `MemoryPort` with `getSceneItemsCalls`. Create one army, one ship, one barrier, and one grid chunk. Assert `readItemFrame()` makes exactly one scene-item call and returns the correct record collections plus the scene metadata snapshot. Assert `readFrame()` with no supplied frame hydrates chunks with one scene-item call, and `readFrame(itemFrame)` makes no additional scene-item call.

- [ ] **Step 2: Add consistency and failure tests before implementation.**

Reuse the manifest-race, missing-chunk, future-version, and cleanup-failure patterns in `src/storage/gridChunkRepository.test.ts`. Add an `afterItemsRead` hook that changes the manifest; assert the frame retries and returns the latest scene with its corresponding chunk values. Assert a missing chunk still rejects with `GRID_CHUNK_MISSING`.

- [ ] **Step 3: Run the repository tests and confirm the new API cases fail.**

Run: `npm test -- src/storage/metadataRepository.test.ts src/storage/gridChunkRepository.test.ts --reporter=dot`

Expected: new frame methods and passed-item chunk reads fail to compile or fail assertions; existing persistence tests remain unchanged.

- [ ] **Step 4: Implement indexed item frames and snapshot-aware chunk hydration.**

Scan the provided scene-item array once to build army, ship, and barrier records using the current migration functions. In `readItemFrame`, preserve the existing three-attempt scene/manifest stability check and future-schema/error behavior. In `readFrame`, pass `frame.items` and its matching manifest to `GridChunkRepository.read`, then verify the scene/manifest metadata again; if it changed, retry from a fresh item frame. Keep existing public `readScene`, `readArmies`, `readShips`, and `readBarriers` behavior by delegating to the new helpers.

- [ ] **Step 5: Run storage tests and verify call counts plus error behavior.**

Run: `npm test -- src/storage/metadataRepository.test.ts src/storage/gridChunkRepository.test.ts --reporter=dot`

Expected: PASS; a stable chunked frame requires one scene-item read, a changed manifest triggers a fresh retry, and all previous error codes and atomic-write assertions remain green.

- [ ] **Step 6: Commit repository frames.**

```bash
git add src/storage/metadataRepository.ts src/storage/metadataRepository.test.ts src/storage/gridChunkRepository.ts src/storage/gridChunkRepository.test.ts src/tests/helpers/gridStoragePort.ts
git commit -m "perf: reuse scene item snapshots in repositories"
```

### Task 2: Adopt repository frames in hot paths

**Files:**
- Modify: `src/background/applicationCore.ts`
- Test: `src/background/application.test.ts`
- Test: `src/background/crossDomainVisibilityIntegration.test.ts`
- Modify: `src/owlbear/extensionServicesCore.ts`
- Test: `src/owlbear/extensionServicesCore.readFrame.test.ts` (create)

**Interfaces:**
- Consumes: `MetadataRepository.readItemFrame()` and `readFrame(items?)` from Task 1.
- Produces: `visibilityTick`, `turnTickNow`, `processCommandNow`, and UI snapshot loading that derive scene objects from one operation-scoped item frame. Writes still take fresh metadata/manifest snapshots through existing repository methods.

- [ ] **Step 1: Add read-count tests for command and visibility frame loading.**

Instrument the Owlbear fake port used by `application.test.ts`. Assert a successful non-detection command loads all scene items once before persistence begins and that a visibility frame obtains army/barrier/item data from one collection. Do not count the later write-time freshness reads as part of the input frame.

- [ ] **Step 2: Run the focused background and service tests to confirm duplicate reads.**

Run: `npm test -- src/background/application.test.ts src/background/crossDomainVisibilityIntegration.test.ts src/owlbear/extensionServicesCore.readFrame.test.ts --reporter=dot`

Expected: the new read-count assertions fail on the current separate repository reads.

- [ ] **Step 3: Use a single frame in application command and visibility paths.**

Replace each parallel `readScene()`, `readArmies()`, `readBarriers()`, and `getSceneItems()` group in `visibilityTick`, `turnTickNow`, and `processCommandNow` with one `readFrame()` call. Build `CommandState.items` and `positions` from `frame.items.items`; use `frame.items.armies` and `frame.items.barriers`. Keep `persistCommandState`'s explicit fresh scene checks and compensating writes.

- [ ] **Step 4: Use one item frame for popover army and ship snapshots.**

In `extensionServicesCore.loadSnapshot`, replace the independent `repository.readArmies()` and `repository.readShips()` calls with one `readItemFrame()`. Keep `getLocalItems()` and grid-DPI reads independent because they come from separate Owlbear collections/APIs. Do not hydrate the grid solely to build the UI snapshot.

- [ ] **Step 5: Run focused integration tests and verify read-count reductions.**

Run: `npm test -- src/background/application.test.ts src/background/crossDomainVisibilityIntegration.test.ts src/owlbear/extensionServicesCore.readFrame.test.ts --reporter=dot`

Expected: PASS; one input frame uses one scene-item call, while write-time revision/lease checks still perform fresh reads and concurrency regression tests pass.

- [ ] **Step 6: Commit hot-path frame adoption.**

```bash
git add src/background/applicationCore.ts src/background/application.test.ts src/background/crossDomainVisibilityIntegration.test.ts src/owlbear/extensionServicesCore.ts src/owlbear/extensionServicesCore.readFrame.test.ts
git commit -m "perf: share repository frames across hot paths"
```

### Task 3: Exit idle movement ticks before scene hydration

**Files:**
- Modify: `src/background/applicationCore.ts`
- Test: `src/background/application.test.ts`
- Test: `src/background/runtime.test.ts`
- Test: `src/background/leaderShipTurnUi.regression.test.ts`

**Interfaces:**
- Consumes: `MetadataRepository.readItemFrame()` from Task 1.
- Produces: `movementTickNow` probes eligible army states from one item frame; if none are `MOVING` or recoverably paused with `COORDINATOR_GAP`, it returns without hydrating scene chunks or loading barriers. If any are eligible, it calls `readFrame(itemFrame)` and uses that same operation-scoped frame.

- [ ] **Step 1: Add idle and active movement read-count tests.**

Add one test with no moving armies that asserts the tick reads one item frame and does not hydrate chunks or read barriers separately. Add one with a moving army that asserts the tick still advances it and persists the new position. Add a recoverable `COORDINATOR_GAP` pause case so the idle filter does not skip resumption.

- [ ] **Step 2: Run movement and runtime tests and confirm the idle case fails.**

Run: `npm test -- src/background/application.test.ts src/background/runtime.test.ts --reporter=dot`

Expected: the idle hydration count fails; existing all-armies movement and pending-tick tests pass.

- [ ] **Step 3: Probe item frame first and hydrate only when movement is eligible.**

At the start of `movementTickNow`, call `readItemFrame()`, apply the existing eligibility logic including reciprocal embark checks from current scene ship state, and return if no army can move. For candidates, call `readFrame(itemFrame)` and continue with the current conflict, barrier, movement, and persistence logic. Keep five-Hz scheduling and `lastMovementAt` behavior unchanged in this task.

- [ ] **Step 4: Run movement regressions and measure idle read reduction.**

Run: `npm test -- src/background/application.test.ts src/background/runtime.test.ts src/movement/authoritativeStateMovement.regression.test.ts src/background/stateBorderMovement.integration.test.ts --reporter=dot`

Expected: PASS; idle ticks no longer hydrate the grid or fetch barrier records separately, and active ticks preserve all current movement semantics.

- [ ] **Step 5: Commit idle-path optimization.**

```bash
git add src/background/applicationCore.ts src/background/application.test.ts src/background/runtime.test.ts src/background/leaderShipTurnUi.regression.test.ts
git commit -m "perf: skip scene hydration on idle movement ticks"
```

### Task 4: Bound hostile-pair distance work

**Files:**
- Modify: `src/visibility/detectionGraph.ts`
- Test: `src/visibility/detectionGraph.test.ts`
- Test: `src/background/crossDomainVisibilityIntegration.test.ts`

**Interfaces:**
- Consumes: current `DetectionGraphInput` / `GridDistancePort` contracts.
- Produces: the same `DetectionGraph` result with no more than eight concurrent distance calls. No cross-tick cache and no unbounded `Promise.all`.

- [ ] **Step 1: Add baseline and parity tests for modes, ranges, barriers, and concurrency cap.**

Use a delayed counting distance port that tracks call count, elapsed time, current concurrency, and maximum concurrency. Record the existing sequential behavior for independent mode, mutual mode, a target outside the observer's range, and a barrier-blocked pair. With at least twelve hostile units, assert the optimized evaluator keeps the same graph and has maximum concurrency greater than one and no greater than eight.

- [ ] **Step 2: Run visibility tests and confirm the concurrency assertion fails.**

Run: `npm test -- src/visibility/detectionGraph.test.ts src/background/crossDomainVisibilityIntegration.test.ts --reporter=dot`

Expected: current sequential code reports maximum concurrency of one; parity tests establish expected visible sets and baseline distance-call counts.

- [ ] **Step 3: Implement an eight-worker distance evaluator.**

Build ordered hostile observer/target pairs using the current skip rules. Process the pair array with at most eight workers. For each pair, call `distancePort.distance`; apply the observer's range and the existing barrier check; record detections with the same independent/mutual rules. Do not infer symmetric distance or reuse reverse-pair results.

- [ ] **Step 4: Run visibility parity and scale tests.**

Run: `npm test -- src/visibility/detectionGraph.test.ts src/background/crossDomainVisibilityIntegration.test.ts src/background/embarkedArmyVisibilityIntegration.test.ts src/background/shipRoutePersistenceIntegration.test.ts --reporter=dot`

Expected: PASS; visible sets match the sequential reference and the test port observes a maximum of eight in-flight calls.

- [ ] **Step 5: Commit bounded detection work.**

```bash
git add src/visibility/detectionGraph.ts src/visibility/detectionGraph.test.ts src/background/crossDomainVisibilityIntegration.test.ts
git commit -m "perf: bound concurrent visibility distance checks"
```

### Task 5: Share political boundary traversal

**Files:**
- Modify: `src/states/stateBoundaryOverlay.ts`
- Test: `src/states/stateBoundaryOverlay.test.ts`
- Modify: `src/terrain/mapOverlayService.ts`
- Test: `src/terrain/mapOverlayService.test.ts`

**Interfaces:**
- Produces `buildStateBoundarySegmentsForFields(gridMap, states, dpi)` returning `{ recognized: StateBoundarySegment[]; deFacto: StateBoundarySegment[] }` from one coordinate parse and one traversal. Keep `buildStateBoundarySegments(gridMap, states, dpi, controlField)` as a compatible wrapper for existing callers.

- [ ] **Step 1: Add a reference-parity test for both boundary layers.**

Build a fixture with adjacent same-state cells, adjacent foreign states, missing states, negative coordinates, and distinct recognized/de-facto owners. Compare the combined function's arrays with the current single-field function called for each field; assert exact segment geometry and colors and no same-state interior edges.

- [ ] **Step 2: Run boundary and map-overlay tests and confirm the new API test fails.**

Run: `npm test -- src/states/stateBoundaryOverlay.test.ts src/terrain/mapOverlayService.test.ts src/terrain/stateBoundaryOverlayIntegration.test.ts --reporter=dot`

Expected: the new combined function is missing; current output is the reference.

- [ ] **Step 3: Implement the shared traversal and use it in map overlays.**

Sort and parse valid cell keys once, preserve that deterministic order, and inspect all four edges for both control fields during the same cell visit. Keep field-specific state validation and colors. Have `MapOverlayService` call the combined builder once and use the returned arrays for its existing boundary metadata keys and curve items. Keep terrain fill and impassable overlay output unchanged.

- [ ] **Step 4: Run exact overlay-parity tests.**

Run: `npm test -- src/states/stateBoundaryOverlay.test.ts src/terrain/mapOverlayService.test.ts src/terrain/stateBoundaryOverlayIntegration.test.ts src/terrain/politicalMapLayers.regression.test.tsx --reporter=dot`

Expected: PASS; recognized/de-facto keys, geometry, colors, line widths, fills, and reconciled item counts remain unchanged.

- [ ] **Step 5: Commit shared boundary traversal.**

```bash
git add src/states/stateBoundaryOverlay.ts src/states/stateBoundaryOverlay.test.ts src/terrain/mapOverlayService.ts src/terrain/mapOverlayService.test.ts
git commit -m "perf: share political boundary cell traversal"
```

### Task 6: Full verification and independent review

**Files:**
- Review: all files changed by Tasks 1–5
- Modify only files that fail a concrete review check.

**Interfaces:**
- Consumes: the completed repository-frame, idle-movement, visibility, and boundary changes.
- Produces: a verified main-branch change set with operation-count evidence and no change to movement, visibility, or persistence semantics.

- [ ] **Step 1: Run the complete project check.**

Run: `npm run check`

Expected: typecheck, lint, all Vitest suites, distribution verification, and built-popover smoke test pass.

- [ ] **Step 2: Compare hot-path operation counts to the baseline.**

Use the counting fakes from Tasks 1–3 to record scene-item reads for a stable command input frame, an idle movement tick, and an active movement tick. Record max distance concurrency for a hostile visibility fixture. The stable command input frame must require one scene-item list; the idle movement tick must not hydrate chunks or read barriers; active movement must still process all eligible armies.

- [ ] **Step 3: Review the final diff against the spec.**

Check scene/manifest race behavior, compare-and-swap revisions, coordinator handoff, all-armies movement and route cleanup, role-safe visibility, both diplomacy directions, and boundary overlay parity. Fix only issues demonstrated by a failing test or incorrect diff.

- [ ] **Step 4: Commit any review fixes and report results.**

```bash

```

If the review found a reproduced regression, commit only those reviewed fix files with `git add <explicit-file-paths>` and message `fix: preserve backend optimization invariants`; skip this commit when the review found no change to make. Report exact test totals, request-count changes, distance concurrency maximum, and any remaining measurement-dependent optimizations.
