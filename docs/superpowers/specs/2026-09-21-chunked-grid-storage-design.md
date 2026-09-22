# Chunked Grid Storage and Implicit Sea Design

## Goal

Allow every cell of the current 61 by 115 strategic map (7,015 cells) to be painted and restored reliably without exceeding Owlbear Rodeo metadata update limits.

## Current failure

The extension currently stores the complete `SceneState`, including every populated `gridMap.cells` entry, under one scene metadata key. Every brush commit rewrites that entire object. The serialized update reaches Owlbear's per-update size limit after only a few hundred populated cells, so later brush commands are rejected as `PERSISTENCE_FAILED`.

Map overlays have a related risk: additions, updates, and deletions are each sent as one unbounded local-item request. A sufficiently large map can therefore exceed the same request-size boundary while it is being displayed.

## Chosen design

### 1. Sea is the implicit terrain

The built-in `sea` terrain becomes `TerrainRegistryState.defaultTerrainId` for new and existing scenes.

`CellState.terrainId === null` continues to mean “use the registry default.” Consequently, an otherwise empty cell behaves as sea without occupying persistent grid storage. Painting plains, forest, hills, mountains, roads, swamps, desert, tundra, ice, or a custom terrain creates an explicit override. Erasing that terrain removes the override and reveals sea again.

Painting the default `sea` terrain is normalized to `terrainId: null`. A cell is removed completely when all five of its fields have their default values. A sea cell that carries political ownership, an impassable flag, or legacy faction data remains stored, but its terrain field stays null.

The default sea is mechanical rather than a per-cell overlay. The existing map image remains visible, while only explicit terrain overrides are tinted. This avoids creating 7,015 blue local items merely to express the default.

### 2. Sparse 8 by 8 chunks

Persistent cells are partitioned by strategic coordinates into 8 by 8 chunks. Negative coordinates use mathematical floor division so every coordinate has exactly one stable chunk key. Local cell indexes range from 0 through 63.

Only non-empty chunks exist. On the current 61 by 115 map, a completely painted land map requires at most 120 chunks; a water-heavy map requires substantially fewer.

Each chunk is stored in the metadata of an invisible, locked, non-interactive scene item. Chunk metadata contains:

- schema version;
- chunk coordinates and stable chunk key;
- grid revision represented by the payload;
- compact local-cell records.

The compact records preserve all current `CellState` information: terrain override, impassable status, legacy faction territory IDs, recognized state, and de-facto controller. The in-memory `GridMapState` API remains unchanged, so movement, naval combat, borders, rebellions, supply, and UI code continue to consume a normal hydrated cell map.

Every encoded chunk is checked before transmission against a conservative 12 KiB metadata budget. An oversized chunk is rejected with a specific diagnostic rather than being sent as a request that Owlbear will reject ambiguously.

### 3. Small scene manifest and atomic commits

Scene metadata keeps the ordinary scene state with `gridMap.cells` stripped to an empty object while retaining `gridMap.revision`. A separate small manifest metadata key maps each non-empty chunk key to its active scene-item ID and records the manifest schema and grid revision.

Writing a grid revision uses copy-on-write:

1. Read and validate the current scene revision and active manifest.
2. Encode and compare chunks, creating new hidden items only for chunks whose payload changed.
3. Atomically update the compact scene state and manifest in one small scene-metadata request.
4. Delete superseded chunk items after the manifest commit.

If a failure occurs before step 3, the old manifest still points to the complete old map. Newly created items are harmless orphans and are removed during later cleanup. If cleanup fails after step 3, the new map remains authoritative and only unused items remain. Thus a failed brush save cannot leave the manifest pointing at half of a new grid.

Non-grid scene commands reuse existing chunk references and do not rewrite the grid.

### 4. Legacy migration

When no chunk manifest exists, `MetadataRepository.readScene()` reads the legacy embedded `gridMap.cells` map and exposes it normally. It applies the new implicit-sea interpretation in memory.

The first successful scene write performs the durable migration:

1. Change the terrain registry default to `sea`.
2. Replace explicit `sea` terrain values with null while preserving every other field on those cells.
3. Remove cells that are completely default after compaction.
4. Write all remaining cells into 8 by 8 chunk items.
5. Commit the new manifest and the scene state with an empty embedded cell map.

The legacy embedded cells are removed only in the same metadata commit that publishes the complete manifest. Repeating an interrupted migration is safe. Existing political owners, de-facto control, impassable flags, custom terrain IDs, and faction migration data must survive byte-for-byte at the domain level.

### 5. Bounded Owlbear requests

Scene chunk creation/deletion and local overlay addition/update/deletion are split into deterministic batches. A batch is flushed before its estimated serialized payload would exceed 48 KiB, leaving headroom below Owlbear's request limit. A small maximum item count also prevents pathologically large SDK operations when individual items are tiny.

Batch order is stable. Adds and updates complete before obsolete overlay items are deleted, preserving the current reconciliation semantics.

### 6. Concurrency and revisions

The existing global `SceneState.revision` remains the command-level optimistic-concurrency boundary. `GridMapState.revision` identifies the hydrated grid version. The coordinator continues serializing accepted commands.

A write must re-read the authoritative compact scene and manifest, verify the expected scene revision, and compare encoded chunks. A revision conflict aborts before the manifest changes. Orphan cleanup must never delete an item referenced by the latest manifest.

### 7. Diagnostics

Persistence failures retain a specific cause for diagnostics and user notifications. At minimum the system distinguishes revision conflict, malformed chunk, oversized chunk, chunk item creation failure, manifest commit failure, and cleanup failure. Cleanup failure is reported as recoverable because the committed map remains valid.

## Interfaces and code boundaries

- `src/storage/gridChunkCodec.ts` owns chunk coordinates, compact encoding, decoding, size checks, and sparse compaction.
- `src/storage/gridChunkRepository.ts` owns manifest validation, hidden-item discovery, copy-on-write chunk commits, hydration, migration, and orphan cleanup.
- `src/storage/metadataRepository.ts` composes compact scene metadata with the chunk repository while preserving its public hydrated `SceneState` interface.
- `src/owlbear/sdkAdapter.ts` exposes bounded scene-item add/delete operations required by chunk persistence.
- `src/owlbear/localOverlayReconciler.ts` applies the shared bounded-batch helper to local overlays.
- `src/terrain/gridMap.ts` keeps cells sparse and normalizes the selected default terrain to null through an explicit helper that receives the registry default ID.
- `src/shared/constants.ts` declares the manifest/chunk metadata keys and makes `sea` the built-in default.

## Acceptance criteria

1. A 61 by 115 map with all 7,015 cells painted with non-default terrain survives save, reload, and another edit.
2. An empty cell and a cell painted with `sea` both resolve to the built-in sea terrain without a stored terrain override.
3. A sea cell with recognized/de-facto ownership or another non-default field retains that data after compaction and reload.
4. Existing embedded maps migrate automatically and idempotently; the legacy cells disappear only after a complete manifest is committed.
5. Changing one cell rewrites only its containing chunk plus the compact manifest/scene metadata.
6. A failed pre-commit write leaves the previously committed map readable and complete.
7. No chunk metadata payload exceeds 12 KiB, and no bounded SDK batch exceeds the configured 48 KiB budget.
8. Large overlay reconciliations are sent in multiple bounded batches and converge to the same final item set.
9. Existing command, movement, terrain, political-border, naval, and persistence test suites remain green.

## Deliberate non-goals

- No external database or backend is introduced.
- The public in-memory `SceneState`/`GridMapState` shape is not replaced with a chunk-aware domain API.
- Default sea is not rendered as thousands of local overlays or as a new full-map image layer.
- This change does not add an editor for strategic map dimensions; it supports the known 61 by 115 map and other coordinate ranges through sparse chunks.
