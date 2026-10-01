# Grid manifest v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the large grid coordinate-to-chunk index out of Owlbear scene metadata so the complete global map can be saved without exceeding the 48 KiB request budget.

**Architecture:** Keep existing random-ID hidden grid-chunk LABEL items unchanged. Replace the large inline manifest with a small scene-metadata pointer and deterministic-by-revision hidden manifest-part LABEL items that contain the coordinate-to-chunk-ID mapping. Read both legacy v1 and new v2 formats; publish v2 only after all parts and changed chunks are staged successfully, then clean obsolete items.

**Tech Stack:** TypeScript, Owlbear Rodeo SDK adapter, Vitest, existing `MetadataPort`/`GridChunkRepository` storage layer.

**Spec:** `docs/superpowers/specs/2026-09-30-grid-manifest-v2-design.md`

## Global Constraints

- Existing v1 scenes remain readable and migrate on their first successful write.
- No grid cells, terrain, political ownership, or impassable flags may be dropped.
- Every scene metadata or scene-item request stays at or below the existing 48 KiB safety budget.
- A failed staging or pointer publication leaves the previous committed pointer and map readable.
- Existing random grid-chunk item IDs remain valid; migration does not rewrite unchanged chunks.
- Manifest-part items are hidden, locked, non-interactive `LABEL` items.

## Review Focus

- A v2 pointer with a missing part must fail loudly instead of loading an empty map — test in the repository validation task.
- Parts with mixed revisions or duplicate indexes/chunk IDs must be rejected — test in the repository validation task.
- A failed part add or pointer commit must preserve the old map and allow retry — test in the metadata persistence task.
- A non-grid scene write must reuse parts and create no duplicate manifest items — test in the metadata persistence task.
- A large v1 scene must migrate without exceeding request size and preserve all cell fields — test in the integration/adapter task.

---

### Task 1: Versioned manifest codec and validation

**Files:**
- Modify: `src/shared/constants.ts` (add the dedicated manifest-part metadata key).
- Modify: `src/storage/gridChunkCodec.ts` (v2 pointer/part types, byte-budget helpers, and validation errors).
- Test: `src/storage/gridChunkCodec.test.ts`.

**Interfaces:**
- Consumes: existing `GridManifest`, `utf8Size`, and coordinate validation.
- Produces: `GridManifestV1`, `GridManifestPointerV2`, `GridManifestPart`, `GRID_MANIFEST_PART_TOO_LARGE`/validation support, and helpers for splitting/validating a complete chunk map under the request budget.

- [ ] **Step 1: Write failing codec tests** for v2 pointer shape, deterministic part payload validation, splitting a large mapping into budget-safe parts, and rejection of malformed coordinates, duplicate indexes, duplicate IDs, or mixed revisions.
- [ ] **Step 2: Run the focused codec tests** with `npm.cmd test -- src/storage/gridChunkCodec.test.ts`; confirm the new exports/behavior fail before implementation.
- [ ] **Step 3: Implement the v2 types and pure helpers** in `gridChunkCodec.ts`. Keep v1 parsing behavior available, use a conservative per-part budget below 48 KiB, and expose validation that returns a complete merged `Record<string,string>` only when all parts agree on revision and indexes.
- [ ] **Step 4: Add `METADATA_KEYS.gridManifestPart`** in `src/shared/constants.ts` and use it only for storage items, never for ordinary scene metadata.
- [ ] **Step 5: Re-run the focused codec tests** and verify all pass.
- [ ] **Step 6: Commit** with `feat: add versioned grid manifest codec`.

### Task 2: Chunk repository v1/v2 read and staging

**Files:**
- Modify: `src/storage/gridChunkRepository.ts`.
- Modify: `src/storage/gridChunkRepository.test.ts`.
- Modify: `src/tests/helpers/gridStoragePort.ts` only if its manifest/test inspection types need to represent v2.

**Interfaces:**
- Consumes: codec types/helpers from Task 1 and `MetadataPort` scene-item access.
- Produces: `readGridManifest(metadata, sceneItems?)` compatibility for v1/v2, a `StagedGrid` containing pointer, manifest-part additions, changed chunk additions, superseded chunk IDs, and superseded part IDs, plus cleanup that protects all IDs referenced by the currently committed pointer.

- [ ] **Step 1: Write failing repository tests** for reading v1, reading v2 from manifest-part items, deterministic part IDs, large-map staging, missing/mixed part rejection, and cleanup that never deletes currently referenced chunks or parts.
- [ ] **Step 2: Run `npm.cmd test -- src/storage/gridChunkRepository.test.ts`** and confirm failures.
- [ ] **Step 3: Implement v2 manifest reading**: inspect the scene pointer, load exactly `partCount` deterministic part items, validate and merge them, and retain the current v1 inline path.
- [ ] **Step 4: Implement staging**: reuse unchanged chunk IDs, create only changed chunks, split the complete mapping into parts, build hidden locked non-interactive LABEL records, and return the IDs that become obsolete after commit.
- [ ] **Step 5: Implement commit-aware cleanup** by rereading the latest pointer and retaining every chunk/part reachable from it; cleanup failures remain warnings and never invalidate committed data.
- [ ] **Step 6: Re-run the focused repository tests** and verify v1/v2 round trips and failure validation pass.
- [ ] **Step 7: Commit** with `feat: stage grid manifest parts safely`.

### Task 3: Metadata write integration and migration safety

**Files:**
- Modify: `src/storage/metadataRepository.ts`.
- Modify: `src/owlbear/sdkAdapter.ts` only if the scene-item builder path needs an explicit field for manifest parts.
- Modify: `src/storage/gridChunkRepository.test.ts` for persistence-level cases.
- Modify: `src/owlbear/chunkStorageAdapter.test.ts` for SDK-builder and request-size coverage.

**Interfaces:**
- Consumes: `StagedGrid` and v2 pointer/part records from Task 2.
- Produces: atomic-looking two-phase persistence where item additions happen first, the small pointer is the commit point, and obsolete items are deleted afterward.

- [ ] **Step 1: Write failing persistence tests** for v1-to-v2 migration, failed part addition, failed pointer publication, non-grid writes reusing existing parts, and a large map whose every request stays within 48 KiB.
- [ ] **Step 2: Run the focused persistence/adapter tests** with `npm.cmd test -- src/storage/gridChunkRepository.test.ts src/owlbear/chunkStorageAdapter.test.ts`; confirm failures.
- [ ] **Step 3: Update `MetadataRepository.readSnapshot` and `readFrame`** to pass the item snapshot into v2 manifest reading and compare the pointer plus scene revision when retrying.
- [ ] **Step 4: Update `MetadataRepository.writeScene`** to stage chunk and manifest-part additions in bounded batches, publish only the compact v2 pointer in scene metadata, preserve the old pointer on any failure, and clean staged/unreferenced IDs on failure or superseded IDs after commit.
- [ ] **Step 5: Preserve the legacy embedding-port guard**: ports without scene-item add/delete support may continue writing only small embedded scenes and must never overwrite an existing manifest.
- [ ] **Step 6: Verify through the Owlbear adapter** that manifest-part LABEL items are built as hidden, locked, non-hit-testable scene items and that all generated requests meet the 48 KiB budget.
- [ ] **Step 7: Run the focused tests again** and confirm all migration, retry, and request-size assertions pass.
- [ ] **Step 8: Commit** with `fix: store large grid manifests outside scene metadata`.

### Task 4: Full verification and delivery

**Files:**
- Modify: none unless verification exposes a regression.

- [ ] **Step 1: Run `npm.cmd run typecheck`.**
- [ ] **Step 2: Run `npm.cmd run lint`.**
- [ ] **Step 3: Run `npm.cmd test`.**
- [ ] **Step 4: Run `npm.cmd run build`.**
- [ ] **Step 5: Inspect `git diff`, `git status`, and generated artifacts; confirm no cells were removed and no unrelated files changed.**
- [ ] **Step 6: Commit any verification-only fixes and report exact test/build results.**
