# Chunked grid implementation and review

Implemented on `implement/chunked-grid`, forked from `fix/chunked-grid-storage` at `0bc12dd`.

The map now uses implicit sea, sparse 8×8 chunks, copy-on-write publication and bounded UTF-8 SDK writes. The integration fixture saves, reloads, renders and edits all 7,015 cells of a 61×115 map using real SDK item builders with a mocked transport. No live Owlbear room was modified or verified.

## Independent review

Reviewed range: `0bc12dd..b63bd86`. No critical findings. Two important findings were confirmed and fixed in one inline pass:

- Brush failures bypassed the translated notification mapping. The tool now translates typed error codes for both rejected commands and hydration failures. Regression tests reproduced the raw-code output before the fix.
- Background hydration failures were only logged. Runtime and coordinator loops now share a scene-scoped, deduplicated storage-error notifier. A failed visibility tick preserves existing overlays and can recover on the next tick. Coordinator lease reads use compact metadata without hydrating grid chunks; heartbeat writes retain the validated transaction path.

Minor finding deferred: after three consecutive concurrent manifest changes, hydration reports `GRID_CHUNK_MISSING` even if all chunks existed. This conservatively fails the read without altering saved data; a dedicated transient-consistency diagnostic remains a follow-up.

No declined-to-judge findings. No further agents were used after the user requested inline continuation.

## Implementation rulings

- The packaged task-start helper was not executable. Progress was tracked manually without modifying the skill package; this costs manual bookkeeping.
- Chunk methods remain optional on legacy MetadataPort adapters, but mandatory on production OwlbearPort. Legacy writes are capped at 48 KiB and cannot overwrite a chunk manifest; legacy adapters therefore cannot save large grids.
- MetadataRepository owns revision and commit checks, while GridChunkRepository stages, reads and cleans chunks. This avoids circular ownership and retains the public transaction API; there is no standalone chunk commit API.
- Current UI snapshots do not consume grid cells, so they retain compact reads. Actual renderer hydration is covered by the full-map test. Future cell-derived snapshot fields must explicitly hydrate the grid.

## Verification

Before review: `npm run check` passed, 276 files / 1,251 tests, typecheck, lint, build, distribution verification and production smoke test.

Review fixes: focused regression suite passed, 4 files / 25 tests. Final `npm run check` exited 0: 277 files / 1,256 tests, typecheck, lint, build, distribution verification (71 assets, 65 historical aliases), and production popover smoke test all passed.
