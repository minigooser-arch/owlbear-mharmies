# Role-Aware Compact Map Overlays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-cell strategic-map rendering with compact deterministic geometry, hide terrain fills from players, and show localized terrain information through the cell-coordinate tool without repeated repository reads.

**Architecture:** Introduce pure rectangle and boundary compaction helpers, then make `MapOverlayService` generate role-aware compact local overlays with stable keys. Add a cached terrain lookup shared by the coordinate tool and invalidate it from the existing scene lifecycle; storage, route calculation, movement rules, and command protocols remain unchanged.

**Tech Stack:** TypeScript, Owlbear Rodeo SDK 3.1, Vitest, existing local-overlay reconciliation and chunked grid storage.

**Spec:** `docs/superpowers/specs/2026-09-26-role-aware-compact-map-overlays-design.md`

## Global Constraints

- Terrain hiding is visual only; players retain the complete `gridMap` required by route and movement calculations.
- Only `TERRAIN` fills are GM-only. Political fills, both boundary kinds, and impassable markers remain visible to players.
- Do not change scene schemas, chunk manifests, command payloads, route costs, passability, naval rules, political access, or city-picker session semantics.
- Coordinate hover handling must not read or hydrate repository state on every pointer event.
- Keep deterministic overlay keys and existing SDK request batching below 48 KiB.
- Unknown terrain definitions display `Местность: неизвестна` and never disable the coordinate tool.

## Review Focus

- A player reconnecting after previously being GM must have stale terrain overlays deleted; Task 3 tests role switching against the same local-item collection.
- Sparse cells with no explicit terrain override must show the registry default in the coordinate tool without creating default-terrain map overlays; Tasks 2 and 4 test both sides.
- Concurrent hover and click immediately after cache invalidation must share one repository load and preserve the latest label ordering; Tasks 4 and 5 cover the cache and tool queue.
- A one-cell edit that splits or joins rectangles must not recreate unrelated styles or rows; Task 1 asserts deterministic stable bounds and Task 3 asserts keyed reconciliation.
- Alternating states, invalid cell keys, unknown state IDs, and gaps in boundaries must not be merged into incorrect geometry; Tasks 1 and 2 cover all four cases.

---

### Task 1: Deterministic cell rectangle compaction

**Files:**
- Create: `src/terrain/compactOverlayGeometry.ts`
- Create: `src/terrain/compactOverlayGeometry.test.ts`

**Interfaces:**
- Consumes: `GridCellCoord` from `src/shared/types.ts`.
- Produces:

```ts
export interface StyledCell {
  cell: GridCellCoord;
  styleKey: string;
}

export interface CellRectangle {
  styleKey: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function compactCellRectangles(cells: readonly StyledCell[]): CellRectangle[];
```

- Rectangle bounds are inclusive cell coordinates. Output order is `styleKey`, `minY`, `minX`, `maxY`, `maxX` using ordinal string comparison and numeric coordinate comparison.

- [ ] **Step 1: Write failing compaction tests.**

Add tests named:

- `compacts one cell into one inclusive rectangle`;
- `merges adjacent cells horizontally and identical runs vertically`;
- `does not merge different styles or separated runs`;
- `returns the same rectangles for every input insertion order`;
- `limits an alternating-row 61 by 115 map to 115 rectangles`;
- `keeps rectangles outside a one-cell edit unchanged`.

Assert that a homogeneous 61 by 115 input becomes exactly `[{ styleKey: "plain", minX: 0, minY: 0, maxX: 60, maxY: 114 }]`.

- [ ] **Step 2: Run the geometry test and confirm the missing module failure.**

Run: `npm test -- src/terrain/compactOverlayGeometry.test.ts --reporter=dot`

Expected: FAIL because `compactOverlayGeometry.ts` does not exist.

- [ ] **Step 3: Implement `compactCellRectangles`.**

Build maximal horizontal runs per `styleKey` and row, then merge only identical `[minX, maxX]` runs on consecutive rows. Ignore duplicate `styleKey/x/y` entries deterministically rather than emitting duplicate coverage.

- [ ] **Step 4: Run focused tests.**

Run: `npm test -- src/terrain/compactOverlayGeometry.test.ts --reporter=dot`

Expected: PASS with all six cases.

- [ ] **Step 5: Commit rectangle compaction.**

```bash
git add src/terrain/compactOverlayGeometry.ts src/terrain/compactOverlayGeometry.test.ts
git commit -m "perf: compact map cells into rectangles"
```

### Task 2: Deterministic boundary line compaction

**Files:**
- Modify: `src/terrain/compactOverlayGeometry.ts`
- Modify: `src/terrain/compactOverlayGeometry.test.ts`
- Modify: `src/states/stateBoundaryOverlay.test.ts`

**Interfaces:**
- Consumes: `StateBoundarySegment` from `src/states/stateBoundaryOverlay.ts`.
- Produces:

```ts
export function compactBoundarySegments(
  segments: readonly StateBoundarySegment[]
): StateBoundarySegment[];
```

- Output preserves `stateId` and `color`; it merges only touching, collinear horizontal or vertical segments with the same values.

- [ ] **Step 1: Write failing boundary-compaction tests.**

Test horizontal and vertical merging, reversed input endpoints, insertion-order independence, and refusal to merge across a gap, corner, state ID, or color. Add a state-boundary fixture with a 115-edge straight perimeter and assert compaction returns one maximal segment for that straight side.

- [ ] **Step 2: Run tests and verify the new export is missing.**

Run: `npm test -- src/terrain/compactOverlayGeometry.test.ts src/states/stateBoundaryOverlay.test.ts --reporter=dot`

Expected: FAIL because `compactBoundarySegments` is not implemented.

- [ ] **Step 3: Implement `compactBoundarySegments`.**

Normalize endpoint order, group by `stateId`, `color`, orientation, and fixed axis, sort the varying coordinates, and merge ranges only when the next start equals the current end. Emit stable horizontal entries before vertical entries within the same state/color group.

- [ ] **Step 4: Run focused tests.**

Run: `npm test -- src/terrain/compactOverlayGeometry.test.ts src/states/stateBoundaryOverlay.test.ts --reporter=dot`

Expected: PASS; coverage matches the original unit segments exactly.

- [ ] **Step 5: Commit line compaction.**

```bash
git add src/terrain/compactOverlayGeometry.ts src/terrain/compactOverlayGeometry.test.ts src/states/stateBoundaryOverlay.test.ts
git commit -m "perf: compact political boundary lines"
```

### Task 3: Role-aware compact map overlay rendering

**Files:**
- Modify: `src/terrain/mapOverlayService.ts`
- Modify: `src/terrain/mapOverlayService.test.ts`
- Modify: `src/terrain/politicalMapLayers.regression.test.tsx`
- Modify: `src/terrain/stateBoundaryOverlayIntegration.test.ts`
- Modify: `src/owlbear/chunkStorageAdapter.test.ts`
- Modify: `src/background/applicationCore.ts`
- Modify: `src/background/application.test.ts`

**Interfaces:**
- Consumes: `compactCellRectangles`, `compactBoundarySegments`, current `MapOverlaySource`, and the role already passed to `ProductionEngine.visibilityTick(role, playerId)`.
- Produces: `MapOverlaySource.viewerRole: "GM" | "PLAYER"` and compact overlay keys:
  - `TERRAIN/<terrainId>/<minX>,<minY>/<maxX>,<maxY>`;
  - `RECOGNIZED_STATE_FILL/<stateId>/<minX>,<minY>/<maxX>,<maxY>`;
  - existing boundary kind plus state and compact endpoints.

- [ ] **Step 1: Add failing role and object-count tests.**

In `mapOverlayService.test.ts`, add assertions that:

- a homogeneous 61 by 115 GM terrain layer creates one `TERRAIN` rectangle;
- the same player source creates zero `TERRAIN` items;
- player output still contains recognized-state fill, recognized boundary, de-facto boundary, and impassable items;
- reconciling GM then PLAYER against the same harness deletes the old terrain item;
- mixed terrain/state rectangles have deterministic keys and exact scene-space bounds;
- invalid cell keys and unknown state IDs do not generate geometry.

Update integration tests to assert visual coverage and compact line endpoints rather than per-cell item counts. Change the 7,015-cell chunk test to expect one terrain overlay for a GM.

- [ ] **Step 2: Run focused rendering tests and confirm failures.**

Run: `npm test -- src/terrain/mapOverlayService.test.ts src/terrain/politicalMapLayers.regression.test.tsx src/terrain/stateBoundaryOverlayIntegration.test.ts src/owlbear/chunkStorageAdapter.test.ts --reporter=dot`

Expected: FAIL because `viewerRole` is absent and the service still creates per-cell items.

- [ ] **Step 3: Replace per-cell fills with compact rectangles.**

Resolve terrain and state styles while collecting `StyledCell` inputs, call `compactCellRectangles`, and create one closed `CURVE` per inclusive rectangle. Generate terrain inputs only when `viewerRole === "GM"`; continue generating political and impassable layers for both roles. Preserve current opacity, stroke, layer, locking, and hit-disabling values.

- [ ] **Step 4: Compact boundary segments before creating Owlbear items.**

Call `compactBoundarySegments` independently for recognized and de-facto arrays so boundary kinds never merge. Keep the existing political boundary discovery semantics.

- [ ] **Step 5: Pass the viewer role from the background visibility flow.**

Add `viewerRole: role` to the `MapOverlayService.reconcile` source and include `role` in `lastMapOverlaySignature`. Add an `application.test.ts` regression proving the same engine removes terrain overlays after `visibilityTick("PLAYER", playerId)` follows a GM tick.

- [ ] **Step 6: Run role-aware overlay and background tests.**

Run: `npm test -- src/terrain/mapOverlayService.test.ts src/terrain/politicalMapLayers.regression.test.tsx src/terrain/stateBoundaryOverlayIntegration.test.ts src/owlbear/chunkStorageAdapter.test.ts src/background/application.test.ts --reporter=dot`

Expected: PASS; homogeneous GM terrain count is one and player terrain count is zero.

- [ ] **Step 7: Commit compact role-aware rendering.**

```bash
git add src/terrain/mapOverlayService.ts src/terrain/mapOverlayService.test.ts src/terrain/politicalMapLayers.regression.test.tsx src/terrain/stateBoundaryOverlayIntegration.test.ts src/owlbear/chunkStorageAdapter.test.ts src/background/applicationCore.ts src/background/application.test.ts
git commit -m "perf: render compact role-aware map overlays"
```

### Task 4: Cached terrain descriptions

**Files:**
- Create: `src/terrain/cellTerrainLookup.ts`
- Create: `src/terrain/cellTerrainLookup.test.ts`

**Interfaces:**
- Consumes: `GridCellCoord`, `SceneState`, and an injected `loadScene: () => Promise<SceneState>`.
- Produces:

```ts
export interface CellTerrainInfo {
  terrainId: string | null;
  terrainName: string;
}

export class CachedCellTerrainLookup {
  constructor(loadScene: () => Promise<SceneState>);
  describeCell(cell: GridCellCoord): Promise<CellTerrainInfo>;
  invalidate(): void;
}
```

- [ ] **Step 1: Write failing lookup tests.**

Test explicit terrain, implicit default terrain, dangling terrain ID, loader failure, repeated calls, invalidation, and two concurrent calls after invalidation. Assert the loader call count is one before invalidation, two after it, and still two after both concurrent requests settle.

- [ ] **Step 2: Run the lookup test and confirm the missing module failure.**

Run: `npm test -- src/terrain/cellTerrainLookup.test.ts --reporter=dot`

Expected: FAIL because the lookup class does not exist.

- [ ] **Step 3: Implement `CachedCellTerrainLookup`.**

Cache a coherent `SceneState`, share one in-flight `loadScene()` promise, and clear both cache and in-flight state in `invalidate()`. Resolve `gridMap.cells[cellKey(cell)]?.terrainId ?? terrain.defaultTerrainId`. Return `{ terrainId: null, terrainName: "неизвестна" }` on loader failure or missing registry entry, and do not cache a failed load.

- [ ] **Step 4: Run focused lookup tests.**

Run: `npm test -- src/terrain/cellTerrainLookup.test.ts --reporter=dot`

Expected: PASS with exact loader counts and Russian fallback.

- [ ] **Step 5: Commit the lookup cache.**

```bash
git add src/terrain/cellTerrainLookup.ts src/terrain/cellTerrainLookup.test.ts
git commit -m "feat: cache terrain descriptions for coordinate inspection"
```

### Task 5: Show terrain in the coordinate tool and wire invalidation

**Files:**
- Modify: `src/owlbear/cellCoordinateTool.ts`
- Modify: `src/owlbear/cellCoordinateTool.test.ts`
- Modify: `src/background/applicationCore.ts`
- Modify: `src/background/runtime.test.ts`
- Modify: `src/background/applicationOperationalErrors.test.ts`

**Interfaces:**
- Consumes: `CachedCellTerrainLookup` and `CellTerrainInfo` from Task 4.
- Produces: `CellCoordinateToolPort.describeCell(cell: GridCellCoord): Promise<CellTerrainInfo>`.

- [ ] **Step 1: Add failing coordinate-label tests.**

Extend the tool harness with `describeCell`. Assert hover text is exactly `X: 2, Y: 3\nМестность: Лес`, pinned text is exactly `Выбрано: 2, 3\nМестность: Лес`, unknown terrain uses `Местность: неизвестна`, and a city-picker click still emits only `{ sessionId, x, y }`.

- [ ] **Step 2: Run the coordinate tests and verify the new assertions fail.**

Run: `npm test -- src/owlbear/cellCoordinateTool.test.ts --reporter=dot`

Expected: FAIL because `CellCoordinateToolPort` has no terrain lookup and labels contain only coordinates.

- [ ] **Step 3: Integrate `describeCell` into hover and click.**

After converting the pointer position to a cell, await `port.describeCell(cell)` inside the existing serialized queue and use one shared label-formatting helper for hover and pinned text. Preserve pointer coalescing, overlay cleanup, click return value, and city-picker broadcast behavior.

- [ ] **Step 4: Wire one cached lookup into `startBackgroundApplication`.**

Construct `CachedCellTerrainLookup(() => new MetadataRepository(port).readScene())` once. Add `describeCell` to `toolPort`. Invalidate it on scene open, scene close, grid change, scene metadata change, and scene item change by wrapping the existing runtime callbacks before forwarding the visibility request. Do not add new Owlbear subscriptions.

- [ ] **Step 5: Add lifecycle and failure tests.**

In runtime/application tests, prove metadata and item callbacks invalidate before the next lookup; scene close clears the cache; concurrent hover/click after invalidation performs one reload; and a rejected scene read produces an unknown-terrain label without stopping later coordinate events.

- [ ] **Step 6: Run coordinate and lifecycle tests.**

Run: `npm test -- src/owlbear/cellCoordinateTool.test.ts src/terrain/cellTerrainLookup.test.ts src/background/runtime.test.ts src/background/applicationOperationalErrors.test.ts --reporter=dot`

Expected: PASS; lookup counts remain bounded and existing city-picker cases remain green.

- [ ] **Step 7: Commit coordinate terrain inspection.**

```bash
git add src/owlbear/cellCoordinateTool.ts src/owlbear/cellCoordinateTool.test.ts src/background/applicationCore.ts src/background/runtime.test.ts src/background/applicationOperationalErrors.test.ts
git commit -m "feat: show terrain in the coordinate tool"
```

### Task 6: Full regression and performance verification

**Files:**
- Modify if required by measured assertions: `src/owlbear/chunkStorageAdapter.test.ts`
- Modify if required by role journey coverage: `src/ui/PlayerUserJourney.test.tsx`
- Modify if required by GM journey coverage: `src/ui/GmUserJourney.test.tsx`
- Update: `docs/superpowers/plans/2026-09-26-role-aware-compact-map-overlays.md`

**Interfaces:**
- Consumes: completed compact overlay and coordinate lookup behavior.
- Produces: recorded verification results in this plan's final checklist; no new production interface.

- [ ] **Step 1: Add final journey assertions.**

Ensure the player journey retains route-planning controls and does not expose GM map editing. Ensure the GM journey still exposes map editing. Keep terrain-visibility assertions in background/overlay tests because local Owlbear map items are outside the React UI tree.

- [ ] **Step 2: Run every focused map, coordinate, route, and movement suite.**

Run:

```bash
npm test -- src/terrain src/owlbear/cellCoordinateTool.test.ts src/owlbear/chunkStorageAdapter.test.ts src/background/application.test.ts src/background/runtime.test.ts src/ui/GmUserJourney.test.tsx src/ui/PlayerUserJourney.test.tsx --reporter=dot
```

Expected: PASS; route and movement behavior remains unchanged.

- [ ] **Step 3: Record compact-object acceptance measurements.**

Run the 61 by 115 test with the verbose reporter, then append a `Verification Results` heading to this plan containing the exact duration and object counts for GM terrain, player terrain, recognized-state fill, and a 115-edge straight border.

Run: `npm test -- src/owlbear/chunkStorageAdapter.test.ts src/terrain/mapOverlayService.test.ts --reporter=verbose`

Expected counts: GM homogeneous terrain `1`; player homogeneous terrain `0`; homogeneous recognized fill `1`; each tested straight boundary side `1` per kind/state.

- [ ] **Step 4: Run the complete quality gate.**

Run: `npm run check`

Expected: typecheck, ESLint, all Vitest suites, production build, dist verification, and built-popover smoke test all pass.

- [ ] **Step 5: Review generated diff for scope and stale per-cell assumptions.**

Run:

```bash
git diff --check
rg -n "toHaveLength\(7015\)|/TERRAIN|RECOGNIZED_STATE_FILL" src docs
```

Expected: no whitespace errors; every remaining per-cell count or key assertion is intentionally tied to storage rather than rendering.

- [ ] **Step 6: Commit verification coverage and recorded results.**

```bash
git add src/owlbear/chunkStorageAdapter.test.ts src/ui/PlayerUserJourney.test.tsx src/ui/GmUserJourney.test.tsx docs/superpowers/plans/2026-09-26-role-aware-compact-map-overlays.md
git commit -m "test: verify compact role-aware map rendering"
```

## Verification Results

- Focused map, coordinate, route, movement, and UI suite: 15 files / 100 tests passed in 6.16s.
- Compact rendering suite: 3 files / 15 tests passed in 3.74s.
- Homogeneous 61×115 GM terrain: 1 local terrain overlay; measured test duration 35ms.
- Homogeneous 61×115 PLAYER terrain: 0 local terrain overlays.
- Homogeneous recognized-state fill: 1 rectangle.
- Straight 115-edge political boundary: 1 segment per boundary kind and state; measured unit test duration below 1ms.
- Full `npm.cmd run check`: typecheck, ESLint, 283 files / 1327 tests, production build, dist verification, and built-popover smoke test all passed after review fixes.
- Scope scan: no remaining `toHaveLength(7015)` assertions; legacy `/TERRAIN` strings remain only in SDK adapter compatibility fixtures.
