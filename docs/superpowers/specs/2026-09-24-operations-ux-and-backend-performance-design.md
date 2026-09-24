# Operations UX and Backend Performance Design

## Goal

Make state diplomacy and strategic-city administration easier to use in the narrow Owlbear panel, and reduce avoidable backend work without weakening command authorization, scene consistency, movement, or visibility behavior.

## Current findings

### Interface

- `StateDiplomacyPage` renders every unordered state pair (`n * (n - 1) / 2`) at once. Each pair repeats long state names in three labels, and there is no search or filter.
- `StrategicCityEditor` renders form labels in unstyled `div` containers. The shared form styles apply only to known form classes, so inputs and labels flow together. The current city flow requires a manually typed ID and semicolon-separated cell coordinates.
- A cell-coordinate tool already exists, but city creation does not use it.

### Backend

- On chunked scenes, a successful command can call `getSceneItems()` up to seven times across command loading and persistence: scene, armies, barriers, command item lookup, persistence freshness check, write snapshot, and post-staging freshness check. Several calls transfer and scan the same full scene-item list.
- `movementTickNow` runs at 5 Hz. Before checking whether any army is moving, it loads the scene, armies, and barriers. On a chunked scene these reads can mean three full scene-item reads per tick even while movement is idle.
- `buildDetectionGraph` evaluates hostile observer/target pairs with sequential asynchronous distance calls. Work grows with the cross-product of opposing units, and each call can wait on Owlbear grid geometry.
- Map overlay generation sorts explicit cells, then the recognized and de-facto boundary builders each sort and traverse the grid independently.
- Persistence intentionally writes army, ship, and barrier metadata sequentially and compensates successful writes on failure. This is a correctness boundary; parallel writes need separate measurement and failure-semantics work.

## Interface design

### State diplomacy

1. Show a compact heading, a state selector, and a search field.
2. Selecting one state shows one row per counterpart, keeping the list proportional to the number of states rather than all pairs.
3. Each row presents the counterpart name, current war/peace status, and a compact summary of permitted directions.
4. Expanding a row exposes the exact existing controls: `selected state → counterpart` access, `counterpart → selected state` access, and one symmetric war switch. Labels must say whose troops can enter whose territory; arrows must not be ambiguous.
5. Add filters for all relations, war, and any military access. Do not change diplomacy rules or command payloads.
6. Preserve the existing empty state when fewer than two states exist.

### Strategic cities

1. Use a clearly separated “Create city” form with a responsive grid; labels stack over full-width controls in narrow panels.
2. Keep name and recognized state in the primary form. Generate the city ID from the name and resolve collisions automatically; put manual ID editing under an advanced disclosure.
3. Add a map-selection action that reuses the existing coordinate tool flow. Show chosen cells as removable coordinate chips and retain manual coordinate entry as an advanced fallback.
4. Keep historical building count and capital status visible, with concise helper text.
5. Add city search and state filtering. Each city row initially shows name, state, capital status, and cell count; expand for coordinate copy and edit/delete actions.
6. Editing uses the same field order and responsive grid as creation. Preserve the current city model, validation rules, and command types.

## Backend performance design

### Priority 1: shared read frame

Introduce a short-lived immutable repository read frame that reads scene items once, indexes armies/ships/barriers/chunks, and hydrates the scene from that same item collection. Use it in command loading, background ticks, and UI snapshot loading where those paths need the same data. Do not retain this frame across events.

Preserve the metadata/manifest rereads and expected-revision checks around writes. The shared frame reduces duplicate reads within one operation; it does not become a cross-event cache and must not authorize writes from stale state.

### Priority 2: idle movement path

Check for moving or recoverably paused armies before loading the full scene and barriers. If none are eligible, return. Any later event-driven/adaptive timer change must preserve the current five-Hz movement cadence whenever an army is moving and cover coordinator changes, scene reopen, and movement commands.

### Priority 3: visibility distance work

Measure the number and latency of grid-distance calls first. If material, evaluate bounded concurrency and a per-reconciliation distance cache. Preserve observer-specific range, directional detection, mutual-detection mode, and exact barrier-intersection behavior. Do not add an unbounded `Promise.all` over every hostile pair.

### Priority 4: political map reconciliation

Build recognized and de-facto boundary edges from a shared parsed-cell pass, and avoid sorting the same cell set multiple times when ordering is not observable. Preserve deterministic overlay keys, stroke geometry, ownership semantics, and stable output tests.

### Deferred pending measurements

- Bounded concurrency for item metadata writes. Existing sequential compare-and-swap and compensating rollback must remain correct if any write fails.
- Cross-event caches or event debouncing. Invalidation and visibility freshness must be proven before adopting them.
- Skipping grid hydration for selected command categories. `writeScene` currently depends on a complete map; a partial scene must never publish an empty or incomplete grid.
- Reworking the sparse chunk format or the implicit-sea representation. Existing 8×8 copy-on-write chunks and bounded SDK batches are retained.

## Correctness and regression constraints

- Keep scene and army revisions, coordinator lease checks, protocol validation, authorization, and item-level compare-and-swap behavior.
- Movement phase continues to process every eligible army and clear only completed routes. No change to terrain traversal, state-border access, war, or water rules.
- Visibility remains role-safe and respects current detection and barrier rules.
- Chunk manifests remain authoritative. A failed pre-commit write leaves the old manifest readable; cleanup failure after commit does not invalidate the committed map.
- Preserve cell-coordinate behavior and city create/update/delete validation, including unique integer coordinates and recognized-state references.
- Keep batches below existing Owlbear limits.

## Verification plan

1. Capture operation counts and duration for `getSceneItems`, `getSceneMetadata`, chunk hydration, distance calls, and persistence writes on representative small and dense scenes.
2. Add focused repository tests proving one scene-item snapshot serves all requested indexes and that revision/manifest races still reject or retry correctly.
3. Add runtime tests for idle ticks and moving ticks, including coordinator handoff and pending movement work.
4. Add detection parity tests for directional/mutual modes, ranges, barriers, and concurrent units.
5. Add boundary-overlay parity tests comparing keys, geometry, colors, and final reconciled items.
6. Add UI tests for diplomacy direction labels and filters, responsive city fields, map-selected cells, and preservation of manual editing.
7. Run `npm run check` and compare performance counters against the baseline. Accept optimizations only when behavior is unchanged and the targeted work measurably decreases.

## Out of scope

- Changes to army or ship movement rules, turn semantics, political access, battle rules, or player permissions.
- Changes to the scene schema or command protocol.
- Replacing Owlbear storage or publishing a new map backend.
- Adding a design-canvas dependency or requiring players to configure server infrastructure.
