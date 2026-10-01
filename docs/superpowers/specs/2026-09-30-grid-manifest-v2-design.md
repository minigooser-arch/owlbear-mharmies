# Grid manifest v2: storage design

## Goal

Allow the global map to contain all required strategic cells without hitting Owlbear's per-request metadata limit. The current grid chunks are already stored in hidden scene items, but the scene metadata contains one large coordinate-to-item-ID manifest. The new format must keep the cell data intact while moving the large manifest out of the scene metadata request.

## Constraints

- Existing v1 scenes must remain readable without manual conversion.
- No strategic cells, terrain, political ownership, or impassable flags may be dropped during migration.
- A failed migration or failed subsequent save must leave the last committed map readable.
- Each Owlbear write request must remain below the existing 48 KiB safety budget.
- Existing random chunk item IDs should remain supported; the migration must not require replacing every chunk item merely to compact the manifest.
- Non-grid scene writes must not rewrite all grid-manifest parts unnecessarily.

## Recommended design

### Scene metadata pointer

Keep `METADATA_KEYS.gridManifest` as a small pointer. Version 2 contains:

```ts
{
  version: 2,
  revision: number,
  partCount: number
}
```

The pointer is the only grid-manifest value written to scene metadata for v2. `partCount` is enough to derive the fixed IDs of the manifest-part items, so the pointer does not contain another large ID list.

### Manifest-part scene items

Each part is a hidden, locked, non-interactive `LABEL` scene item with a dedicated metadata key. Its payload contains:

```ts
{
  version: 1,
  revision: number,
  index: number,
  chunks: Record<string, string>
}
```

The `chunks` mapping preserves the existing random grid-chunk item IDs. Parts are split under the existing request budget with headroom for Owlbear SDK builder overhead. IDs are deterministic by grid revision and part index, for example `letopis-grid-manifest-12-0`, so the pointer does not need to store them and a new revision never overwrites parts referenced by the previous pointer.

### Read path

1. Read scene metadata and migrate the scene state as today.
2. If the pointer is v1, read the existing inline mapping from scene metadata.
3. If the pointer is v2, read exactly `partCount` manifest-part items and combine their `chunks` mappings.
4. Verify that all parts have the same revision, unique indexes, valid coordinates, and unique chunk IDs.
5. Read the referenced grid-chunk items and decode the grid as today.

The read path must reject incomplete or mixed revisions instead of substituting an empty or default map.

### Write path

For a scene whose grid revision did not change, reuse the existing v2 pointer and parts; only the ordinary scene metadata is updated.

For a grid change:

1. Stage changed grid chunks using the existing random-ID strategy.
2. Build the complete next coordinate-to-chunk-ID mapping.
3. Split that mapping into manifest parts under the request-size budget.
4. Add changed grid chunks and new manifest-part items in bounded batches.
5. Re-read the authoritative scene revision and verify the commit preconditions.
6. Publish the small v2 pointer in scene metadata as the commit point.
7. Delete superseded chunk items and old manifest-part items only after the pointer is committed.

If adding chunks or parts fails, clean up only unreferenced staged items. If pointer publication fails, the previous pointer remains authoritative and the old map must continue to load.

### v1 migration

When a v1 scene is next saved, the repository reads the old manifest, stages v2 manifest parts, and publishes the v2 pointer as part of the same guarded write. The old v1 metadata is not removed until the v2 pointer is committed. A scene that is only opened and read is not mutated.

## Error handling and diagnostics

Add explicit validation errors for missing parts, duplicate part indexes, revision mismatch, and malformed part payloads. Keep `GRID_METADATA_TOO_LARGE` for a genuinely oversized pointer or ordinary scene payload, but report the number of manifest parts and approximate byte sizes in diagnostic logging so a future limit issue can be distinguished from a malformed map.

## Tests

- v2 manifest parts round-trip a large mapping and stay below the request budget.
- v1 manifests remain readable.
- v1 scenes migrate to v2 on the first successful write.
- A failed part addition leaves the old pointer and map intact.
- A failed pointer publication leaves the old pointer and map intact.
- Non-grid writes reuse v2 parts without creating duplicates.
- Missing, duplicated, or mixed-revision parts are rejected.
- Existing grid chunk migration, political fields, and overlay rendering continue to pass.
