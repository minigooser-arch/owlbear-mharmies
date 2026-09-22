# Chunked Grid Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save, reload and edit all 7,015 cells of a 61×115 map with implicit sea and sparse 8×8 chunks.

**Architecture:** Keep hydrated SceneState in domain code. Persist immutable chunk items first, then publish their manifest together with the compact scene metadata; failures before publication retain the previous map. Normalize explicit sea to the existing null terrain representation and batch SDK writes at the transport boundary.

**Tech Stack:** TypeScript, React, Vitest, Owlbear SDK 3.1.0; existing dependencies only.

**Spec:** `docs/superpowers/specs/2026-09-21-chunked-grid-storage-design.md`

## Global Constraints

- No external database or backend is introduced.
- The public in-memory `SceneState`/`GridMapState` shape is not replaced with a chunk-aware domain API.
- Default sea is not rendered as thousands of local overlays or as a new full-map image layer.
- Every encoded chunk is checked before transmission against a conservative 12 KiB metadata budget.
- Batch payload budget: 48 KiB, measured in UTF-8 after SDK normalization; maximum 64 items per batch.
- Political ownership, de-facto control, impassability, custom terrain IDs and legacy faction data survive migration.
- A failed pre-commit write leaves the previously committed map readable and complete.
- Do not claim a live Owlbear-room test unless performed in an authorized live room.

## Review Focus

1. UI snapshot readers bypass MetadataRepository today: they must hydrate chunk data rather than displaying an empty map (task 4).
2. Readers can overlap manifest publication and deletion: retry a changed manifest; never silently replace a missing chunk with sea (task 3).
3. Cleanup can race a writer: delete only this transaction's superseded IDs after rechecking the live manifest, not arbitrary unreferenced items (task 3).
4. Sea-default migration changes formerly implicit plains into water; explicit plains must remain land and politics must remain unchanged (task 1).
5. UTF-8 IDs, negative coordinates, SDK builder overhead and large metadata must not bypass size accounting (tasks 2 and 5).

## Task 1: Implicit sea and sparse terrain semantics

**Files:** modify `src/shared/constants.ts`, `src/storage/migrations.ts`, `src/terrain/gridMap.ts`, `src/commands/commandProcessorCore.ts`, `src/ui/pages/MapEditorPage.tsx`; create `src/terrain/implicitSea.test.ts`.

**Interfaces:** consumes `CellState`, `GridMapState`, `SceneState`; produces `compactDefaultTerrain(gridMap: GridMapState, defaultTerrainId: string): GridMapState`, keeping the input revision and all non-terrain fields.

- [ ] Add failing tests using these assertions and actual command-processor fixtures from its existing tests:

```ts
const water = { ...DEFAULT_CELL_STATE, terrainId: 'sea' };
const land = { ...DEFAULT_CELL_STATE, terrainId: 'plain' };
const political = { ...water, recognizedStateId: 'state', impassable: true };
const grid: GridMapState = { version: 1, revision: 3,
  cells: { '0,0': water, '1,0': land, '2,0': political } };
expect(compactDefaultTerrain(grid, 'sea').cells).toEqual({
  '1,0': land, '2,0': { ...political, terrainId: null }
});
expect(grid.cells['0,0']).toEqual(water);
expect(DEFAULT_TERRAIN.defaultTerrainId).toBe('sea');
```

- [ ] Run `npm test -- src/terrain/implicitSea.test.ts`; verify failures identify absent behavior.
- [ ] Set the built-in default and migration output to sea. Implement sparse compaction with the following transformation; apply it to terrain paint and erase results, not to unrelated revisions:

```ts
const next = { ...cell, terrainId: cell.terrainId === defaultTerrainId ? null : cell.terrainId };
const empty = next.terrainId === null && !next.impassable &&
  next.factionTerritoryIds.length === 0 && next.recognizedStateId === null &&
  next.deFactoStateId === null;
```

- [ ] Add command tests for painting sea, painting plains, erasing terrain while retaining politics, and resolving default sea for ship movement. Add migration tests showing explicit plains retained and formerly implicit terrain now sea. Explain the changed default in editor copy.
- [ ] Run `npm test -- src/terrain src/storage src/commands src/naval`; fix genuine regressions without replacing explicit land fixtures with sea.
- [ ] Commit selected files with `git commit -m "feat: use implicit sea for strategic terrain"`.

## Task 2: Versioned compact chunk codec

**Files:** create `src/storage/gridChunkCodec.ts`, `src/storage/gridChunkCodec.test.ts`; add `gridManifest` and `gridChunk` keys in `src/shared/constants.ts`.

**Interfaces:** consumes hydrated cells; produces these exact public contracts:

```ts
export type PackedCell = [number, string | null, boolean, string[], string | null, string | null];
export interface GridChunk { version: 1; x: number; y: number; revision: number; cells: PackedCell[] }
export interface GridManifest { version: 1; revision: number; chunks: Record<string, string> }
export function encodeGridChunks(grid: GridMapState): Record<string, GridChunk>;
export function decodeGridChunks(chunks: readonly GridChunk[], revision: number): GridMapState;
export function utf8Size(value: unknown): number;
```

- [ ] Write failing round-trip, negative-coordinate, duplicate-index, malformed-cell and oversized-payload tests. Full-map fixture:

```ts
const cells = Object.fromEntries(Array.from({ length: 7015 }, (_, i) => [
  `${i % 61},${Math.floor(i / 61)}`,
  { ...DEFAULT_CELL_STATE, terrainId: 'mountains', recognizedStateId: 'государство' }
]));
const grid: GridMapState = { version: 1, revision: 4, cells };
const chunks = encodeGridChunks(grid);
expect(Object.keys(chunks)).toHaveLength(120);
expect(decodeGridChunks(Object.values(chunks), 4)).toEqual(grid);
for (const chunk of Object.values(chunks)) expect(utf8Size(chunk)).toBeLessThanOrEqual(12 * 1024);
```

- [ ] Run `npm test -- src/storage/gridChunkCodec.test.ts` and verify red.
- [ ] Encode sorted coordinates with `cx = Math.floor(x / 8)`, `cy = Math.floor(y / 8)`, `index = (y - cy * 8) * 8 + x - cx * 8`. Decode with `x = cx * 8 + index % 8`, `y = cy * 8 + Math.floor(index / 8)`. Use `new TextEncoder().encode(JSON.stringify(value)).byteLength`. Reject unknown versions, noninteger coordinates, duplicate indexes and oversized chunks. Keep a chunk's creation revision when reused; compare cell payloads without the global revision.
- [ ] Run codec tests and `npm run typecheck`; commit with `git commit -m "feat: encode sparse strategic grid chunks"`.

## Task 3: Copy-on-write persistence and migration

**Files:** create `src/storage/gridChunkRepository.ts`, `src/storage/gridChunkRepository.test.ts`; modify `src/storage/metadataRepository.ts`, `src/owlbear/sdkAdapter.ts`, `src/tests/helpers/inMemoryAdapter.ts`; extend repository and adapter tests.

**Interfaces:** add `addSceneItems(items: readonly SceneItemRecord[]): Promise<void>` and `deleteSceneItems(ids: readonly string[]): Promise<void>` to MetadataPort and its real/test implementations. Produce `GridChunkRepository` with `read(metadata: Record<string, unknown>): Promise<GridMapState | undefined>` and `commit(state: SceneState, expectedRevision: number, canCommit: (scene: SceneState) => boolean): Promise<void>`. MetadataRepository retains its existing public read/write signatures and delegates chunk work.

- [ ] Create a stateful in-memory port with real metadata merging and persistent item storage. Inject failures into item creation, manifest publication and cleanup independently. Assert round-trip state, not just mock calls:

```ts
const before = await repository.readScene();
port.failNextManifestCommit = true;
await expect(repository.writeScene(next, before.revision)).rejects.toThrow();
expect(await repository.readScene()).toEqual(before);
```

- [ ] Add tests for the first legacy migration, retry after failure, empty maps, one-cell edits, unchanged grids, unknown manifest versions, absent chunks, and a reader overlapping publication. Capture referenced IDs before/after a one-cell edit and assert exactly one reference changed.
- [ ] Run `npm test -- src/storage/gridChunkRepository.test.ts` and verify red.
- [ ] Build hidden locked labels through SDK builders with `visible(false)` and `disableHit(true)`. Stage immutable changed chunks, retaining unchanged IDs. Immediately before publication re-read the current scene revision and canCommit precondition. Publish both keys in one call:

```ts
await port.patchSceneMetadata({
  [METADATA_KEYS.scene]: { ...state, gridMap: { ...state.gridMap, cells: {} } },
  [METADATA_KEYS.gridManifest]: manifest
});
```

- [ ] Keep the legacy embedded map until the publication succeeds. Reads validate all referenced chunks; if an item vanished, reread metadata and retry only if the manifest changed, otherwise throw a missing-chunk error. Read-only hydration must never create items.
- [ ] Delete only IDs superseded by this transaction after rereading the active manifest. Cleanup failures do not reject a successful commit. Failed-transaction staged IDs may be removed only once known not to be published. Do not run blanket orphan sweeps while another writer may be staging items. Preserve missing-chunk errors rather than normalizing to empty cells.
- [ ] Run `npm test -- src/storage src/owlbear/sdkAdapter.test.ts` and `npm run typecheck`; commit with `git commit -m "feat: persist grid chunks with atomic manifest publication"`.

## Task 4: Hydrated UI and actionable failure reporting

**Files:** modify `src/owlbear/extensionServices.ts`, `src/owlbear/extensionServicesCore.ts`, `src/background/applicationCore.ts`, `src/owlbear/notifications.ts`; extend `src/owlbear/extensionServices.test.ts`; create `src/background/chunkedGridIntegration.test.ts`.

**Interfaces:** consume `MetadataRepository.readScene(): Promise<SceneState>`; keep coordinator-only metadata reads compact. Preserve public acknowledgement status shape; add stable reason codes and notification messages for chunk corruption/oversize/write failure.

- [ ] Write a failing UI integration test starting from compact metadata and real chunk items, then assert the role-safe snapshot contains the painted cell and border ownership. Add a publication event test: staging items alone shows the old grid, committing metadata shows the new grid.
- [ ] Run `npm test -- src/owlbear/extensionServices.test.ts src/background/chunkedGridIntegration.test.ts` and verify red.
- [ ] Replace raw `migrateSceneState` snapshot hydration in both service implementations with repository reads, preserving existing future-schema behavior. Coordinator lease readers and strategic-only overlays need no grid hydration. Keep last valid snapshot on transient read errors; report corruption instead of pretending the map is empty.

```ts
const scene = await repository.readScene();
const nextSnapshot = buildRoleSafeSnapshot({ role, playerId, scene, players,
  armies, ships, mapVisibleSourceIds: observedLocalCloneSourceIds });
```

- [ ] Route typed persistence failures to stable, translated reasons while preserving revision conflict handling. Confirm cleanup errors are diagnostic warnings, not rejected brush commands. Test each error code by injecting its corresponding storage failure.
- [ ] Run `npm test -- src/owlbear src/background`; commit with `git commit -m "fix: hydrate chunked grids in UI and report storage errors"`.

## Task 5: Bounded SDK batches and full regression verification

**Files:** create `src/owlbear/boundedBatches.ts`, `src/owlbear/boundedBatches.test.ts`, `src/storage/fullMapPersistence.test.ts`; modify `src/owlbear/sdkAdapter.ts`, `src/owlbear/localOverlayReconciler.ts`; extend adapter and reconciler tests.

**Interfaces:** produce `splitBatches<T>(values: readonly T[], maxBytes = 48 * 1024, maxItems = 64): T[][]`. Consume `utf8Size`. Batch serialized SDK-built item payloads, not only domain item estimates; reject an individual oversized item before any write.

- [ ] Add failing tests for Unicode payloads, single oversized entries, empty lists, actual SDK builder expansion, and large additions/updates/deletions in both ordinary reconciliation and LocalOverlayReconcileSession:

```ts
const input = Array.from({ length: 200 }, (_, i) => ({ id: String(i), text: 'я'.repeat(500) }));
const batches = splitBatches(input);
expect(batches.flat()).toEqual(input);
for (const batch of batches) {
  expect(utf8Size(batch)).toBeLessThanOrEqual(48 * 1024);
  expect(batch.length).toBeLessThanOrEqual(64);
}
expect(() => splitBatches([{ text: 'x'.repeat(50 * 1024) }])).toThrow();
```

- [ ] Run `npm test -- src/owlbear/boundedBatches.test.ts` and verify red.
- [ ] Preflight all values, then append entries in order until adding the next exceeds either budget; flush and start the next batch. In adapter add/update paths measure SDK-shaped items. Preserve add→update→delete order and invalidate session caches on partial failure so retries rescan real state.
- [ ] Add a 7,015-cell stateful persistence test using the codec fixture from task 2. Save, instantiate a fresh repository, compare hydrated cells, modify one cell, and compare again. Have the fake SDK enforce byte limits and record every payload size. Test migration from sea-heavy legacy data plus political metadata. Assert no default-sea per-cell overlays.
- [ ] Run `npm run check` (typecheck, lint, all tests, production build and built-popover smoke test). Record failures by name; do not infer full-suite health from focused tests.
- [ ] Run `git diff --check`; inspect changed files and tests against every acceptance criterion in the spec. Obtain final independent code review using the agreed execution method, resolve findings, and rerun affected checks plus the full suite before a completion claim.
- [ ] Commit selected files with `git commit -m "fix: bound Owlbear writes and verify full strategic maps"`. Report local results separately from live-room verification; do not publish or merge without the user's chosen integration action.

## Self-review and handoff notes

All nine spec acceptance criteria are covered: full-map tests (task 5), sparse sea and political preservation (task 1), migration/atomicity/incrementality (task 3), request budgets (tasks 2 and 5), full suite (task 5). UI hydration is explicitly included because direct snapshot reads would otherwise bypass the new storage.

The spec's claim of at most 120 chunks assumes the rectangle is aligned to the chunk grid; offset rectangles may span more chunks. No correctness or size limit depends on that count. Chunk creation revisions must not be used to force rewrites of unchanged chunks.

The existing scene revision check is optimistic, not a server-side compare-and-swap. Preserve the single-coordinator lease and recheck it before publication; do not claim stronger multiwriter atomicity than Owlbear provides.

Changing the default intentionally turns previously unpainted/implicit terrain into water. Explicitly painted plains and all recorded political data remain intact. Existing legacy clients must reload after rollout; the old format cannot hydrate new chunk manifests.

Cleanup is deliberately limited to known transaction-owned IDs; unsafe global orphan collection is excluded. Chunk and manifest limits are conservative application budgets and must be checked using actual encoded payloads.
