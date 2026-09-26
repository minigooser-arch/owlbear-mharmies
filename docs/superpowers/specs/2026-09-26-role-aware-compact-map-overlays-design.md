# Role-Aware Compact Map Overlays Design

## Goal

Reduce the number of Owlbear local items used to render the strategic map, hide terrain-type fills from players without changing route calculations, and expose a cell's terrain name through the existing cell-coordinate tool on hover and click.

## User-visible behavior

- A GM continues to see terrain fills, recognized-state fills, recognized and de-facto borders, and impassable markers.
- A player does not see terrain-type fills.
- A player continues to see recognized-state fills, recognized and de-facto borders, and impassable markers.
- The full `gridMap` remains available to the player client. Route planning, movement cost, passability, naval rules, and every authoritative background rule continue to use the same data and behavior.
- The cell-coordinate tool displays `X`, `Y`, and the localized terrain name while hovering a cell.
- Clicking a cell pins the same coordinate and terrain information.
- A cell without an explicit terrain override displays the registry's default terrain name.
- A missing or dangling terrain definition displays `Местность: неизвестна` and does not break coordinate inspection.
- City cell-picking behavior remains unchanged: a click still broadcasts the session-scoped integer coordinates when a valid picker session is active.

This is visual hiding, not an information-security boundary. Players may retain the complete terrain data needed by route calculation.

## Current constraints

The current `MapOverlayService` emits one Owlbear `CURVE` for every explicit terrain cell, another `CURVE` for every recognized-state fill, one `LABEL` for every impassable cell, and one `CURVE` for every unit border segment. A 61 by 115 map therefore creates 7,015 local items for terrain alone. Reconciliation avoids unnecessary SDK writes, but each client still stores and renders every item, and every grid revision rebuilds and compares the complete desired overlay list.

The coordinate tool currently knows only grid geometry. It renders at up to 30 pointer updates per second, so it must not hydrate repository state or read Owlbear metadata for every pointer event.

## Selected approach

Use deterministic rectangle compaction for filled layers and deterministic line compaction for border layers. Keep the existing vector-overlay and local-item architecture; do not introduce image uploads, canvas tiles, a new scene schema, or a new command protocol.

### Alternatives not selected

- Arbitrary connected-region polygons could reduce the item count further but introduce holes, islands, winding rules, and unstable geometry after a one-cell edit.
- Raster tiles could reduce the map to tens of objects but require image generation and lifecycle behavior that is substantially riskier in Owlbear.
- Viewport-only rendering would reduce active objects but add pan/zoom subscriptions and visible pop-in while leaving total map generation unresolved.

## Compact fill geometry

Create a pure geometry module responsible for converting keyed cells into deterministic rectangles.

1. Group eligible cells by row and visual style key.
2. Sort X coordinates and merge adjacent cells into maximal horizontal runs.
3. Merge identical runs on consecutive rows into maximal rectangles.
4. Emit rectangles in stable order by style key, top Y, left X, bottom Y, and right X.

Terrain style keys include the terrain ID and resolved render properties that affect the Owlbear item. Recognized-state fill keys include the state ID and resolved color. Rectangle overlay keys use the layer kind, style identity, and inclusive cell bounds; they must not depend on generated Owlbear IDs.

The compactor operates only on explicit cells that currently produce an overlay. Sparse default terrain remains implicit and produces no persistent fill. This preserves the existing sparse-map behavior.

For a homogeneous explicit 61 by 115 layer, compaction must produce one rectangle. For alternating rows it must produce at most 115 rectangles. A one-cell style change may split a rectangle but must not change unrelated rectangle keys.

## Compact boundary geometry

Keep the existing shared traversal that discovers recognized and de-facto boundary edges, then compact its output before creating Owlbear items.

- Normalize horizontal and vertical segments separately.
- Group segments by boundary kind, state ID, color, orientation, and fixed axis.
- Sort the varying coordinate and merge touching collinear segments.
- Emit stable, maximal line segments.

Do not merge across a gap, state, control field, color, or orientation. Preserve the current rule that a boundary is drawn wherever the neighboring cell does not have the same state ID. This change affects only render item count, not political semantics.

## Role-aware layers

Extend the map-overlay input with `viewerRole: "GM" | "PLAYER"`.

- `TERRAIN` rectangles are generated only for `GM`.
- `RECOGNIZED_STATE_FILL`, `STATE_BOUNDARY`, `DEFACTO_BOUNDARY`, and `IMPASSABLE` remain enabled for both roles.
- The visibility signature includes the viewer role so a role change removes or restores terrain rectangles immediately.
- Existing legacy per-cell map items are deleted through normal keyed reconciliation when compact items replace them.

The background visibility flow remains responsible for supplying the current role. No role decision belongs in storage or route calculation.

## Coordinate terrain lookup

Add a focused terrain-lookup service with this public behavior:

```ts
export interface CellTerrainInfo {
  terrainId: string | null;
  terrainName: string;
}

export interface CellTerrainLookup {
  describeCell(cell: GridCellCoord): Promise<CellTerrainInfo>;
  invalidate(): void;
}
```

The implementation lazily reads a coherent scene snapshot once, caches `gridMap` and the terrain registry, and answers subsequent hover/click requests from memory. Scene-item and scene-metadata changes invalidate the cache. Concurrent requests after invalidation share one in-flight reload rather than hydrating the grid more than once.

The coordinate tool port gains `describeCell(cell)`. It uses that method after converting the pointer position to a cell:

- hover: `X: 2, Y: 3\nМестность: Лес`;
- pinned click: `Выбрано: 2, 3\nМестность: Лес`.

The existing 30 Hz pointer coalescing and serialized tool queue remain. Stale async hover work must not overwrite a newer pointer result; the current queue ordering is retained, and the lookup must not add a second independent render path.

## Reconciliation and lifecycle

Map overlays remain local to each client. The existing signature guard continues to skip reconciliation when DPI, map revision, render definitions, states, and role are unchanged.

Use stable compact-geometry keys so `reconcileLocalOverlays` updates only rectangles or line segments whose geometry or style changed. The service may still rebuild compact geometry after a grid revision; reducing persistent Owlbear objects is the first performance target. Incremental dirty-cell geometry is deferred until measurements show that CPU reconciliation, rather than Owlbear item count, is the remaining bottleneck.

On scene open, close, grid change, scene metadata change, and scene-item change:

- existing runtime behavior continues to request visibility reconciliation;
- the terrain lookup cache is invalidated when scene content can affect cell data;
- coordinate overlays are cleared through the existing tool lifecycle;
- no cache survives a scene close.

## Error handling

- Invalid stored cell keys are ignored during overlay geometry generation, as today.
- Unknown or disabled terrain types do not render a terrain rectangle.
- Coordinate inspection of an unknown type returns `Местность: неизвестна`.
- A temporary repository read failure leaves the previous map overlay intact and causes coordinate inspection to report `Местность: неизвестна` for that event; it must not disable the tool.
- SDK add/update/delete failures retain the existing reconciliation failure behavior and allow the next visibility event to retry.

## Performance acceptance criteria

- A homogeneous 61 by 115 terrain map renders as one terrain rectangle for a GM and zero terrain rectangles for a player.
- A homogeneous recognized-state map renders as one recognized-state fill rectangle for both roles.
- For one state's straight boundary of 115 adjacent cell edges, each boundary kind emits one maximal line rather than 115 unit lines.
- Player reconciliation never creates an item whose map-overlay kind is `TERRAIN`.
- Moving the coordinate pointer across multiple cells after the first successful lookup does not perform another repository read until invalidation.
- A scene invalidation followed by concurrent hover/click requests causes at most one coherent scene reload.
- SDK request payloads remain within the existing 48 KiB batching limit.

## Testing strategy

### Pure geometry

- single cell, horizontal run, vertical rectangle, separated runs, checkerboard, and mixed-style cases;
- deterministic output independent of input insertion order;
- stable keys for unrelated rectangles after a one-cell edit;
- collinear boundary merging and non-merging across gaps, states, fields, or colors.

### Role behavior

- GM receives compact terrain rectangles;
- player receives no terrain rectangles;
- player still receives political fills, both boundary kinds, and impassable markers;
- switching the same client from GM to player removes existing terrain items.

### Coordinate tool

- hover and pinned labels include the default or explicit localized terrain name;
- unknown definitions use the safe fallback;
- ordinary coordinate clicks and city-picker broadcasts retain their current behavior;
- repeated pointer events use the lookup cache; invalidation reloads it once.

### Integration and regression

- the 61 by 115 storage/render test asserts compact object counts rather than one item per cell;
- route planning and movement-cost tests remain unchanged and pass for players;
- political overlay parity tests compare visible coverage and boundary geometry rather than legacy per-cell keys;
- run the complete `npm run check` pipeline and the built-popover smoke test.

## Out of scope

- Hiding terrain data from a technically capable player.
- Changing movement costs, route validation, impassability, naval rules, or political access.
- Changing the grid storage format or chunk manifest.
- Raster/canvas tile rendering.
- Viewport culling.
- Incremental dirty-cell geometry recomputation.
- Changes to city cell-picker session semantics.
