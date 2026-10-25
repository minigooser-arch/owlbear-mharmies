import { recordPerformance } from "../performance/metrics";
import type { GridMapState, StateEntity, TerrainRegistryState } from "../shared/types";
import {
  buildStateBoundarySegmentsForFields,
  compactBoundarySegments,
  type StateBoundarySegment
} from "../states/stateBoundaryOverlay";
import { compactCellRectangles, type CellRectangle, type StyledCell } from "./compactOverlayGeometry";


/**
 * Render-specific fingerprint. Unlike a grid revision, it notices external
 * same-revision edits, but HP, faction influence and administrative metadata
 * do not spuriously force a redraw. Uncacheably large inputs always redraw.
 */
export function mapOverlayRenderSignature(input: {
  viewerRole: "GM" | "PLAYER";
  dpi: number;
  gridMap: GridMapState;
  terrain: TerrainRegistryState;
  states: readonly StateEntity[];
}): string | undefined {
  if (!Number.isFinite(input.dpi) || input.dpi <= 0) return undefined;
  const cells = Object.entries(input.gridMap.cells);
  if (cells.length > 10_000) return undefined;
  const signature = JSON.stringify([
    input.viewerRole,
    input.dpi,
    cells.sort(([a], [b]) => a.localeCompare(b)).map(([key, cell]) => [
      key, input.viewerRole === "GM" ? cell.terrainId : null,
      cell.recognizedStateId, cell.deFactoStateId
    ]),
    input.viewerRole === "GM"
      ? Object.entries(input.terrain.types)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([id, terrain]) => [id, terrain.enabled, terrain.color ?? null])
      : null,
    input.states.map(state => [state.id, state.color ?? null])
  ]);
  return signature.length <= 2_000_000 ? signature : undefined;
}

interface RectangleEntry {
  signature: string;
  rectangles: readonly CellRectangle[];
}

export interface StateBoundaryGeometry {
  recognized: readonly StateBoundarySegment[];
  deFacto: readonly StateBoundarySegment[];
}

interface BoundaryEntry {
  signature: string;
  geometry: StateBoundaryGeometry;
}

/**
 * One entry per independently rendered layer, scoped to the background scene.
 *
 * A chunk-local merge is unsafe: one rectangle/border may span many chunks.
 * Instead, recompute only the layers whose exact semantic inputs changed.
 * No cached geometry is mutated by the renderer.
 */
export class MapOverlayGeometryCache {
  private static readonly MAX_SIGNATURE_CHARS = 1_000_000;
  private static readonly MAX_CELLS = 10_000;
  private static readonly MAX_OUTPUTS = 20_000;

  private terrain: RectangleEntry | undefined;
  private recognized: RectangleEntry | undefined;
  private boundaries: BoundaryEntry | undefined;

  clear(): void {
    this.terrain = undefined;
    this.recognized = undefined;
    this.boundaries = undefined;
  }

  rectangles(kind: "terrain" | "recognized", cells: readonly StyledCell[]): readonly CellRectangle[] {
    const signature = cells.length <= MapOverlayGeometryCache.MAX_CELLS
      ? JSON.stringify(cells.map(({ cell, styleKey }) => [cell.x, cell.y, styleKey]))
      : undefined;
    const cacheable = signature !== undefined &&
      signature.length <= MapOverlayGeometryCache.MAX_SIGNATURE_CHARS;
    const previous = kind === "terrain" ? this.terrain : this.recognized;
    if (cacheable && previous?.signature === signature) {
      recordPerformance(`map.geometry.${kind}Hit`, 0);
      return previous.rectangles;
    }
    const started = performance.now();
    const rectangles = compactCellRectangles(cells);
    recordPerformance(`map.geometry.${kind}Build`, performance.now() - started);
    const next = cacheable && rectangles.length <= MapOverlayGeometryCache.MAX_OUTPUTS
      ? { signature, rectangles }
      : undefined;
    if (kind === "terrain") this.terrain = next;
    else this.recognized = next;
    return rectangles;
  }

  stateBoundaries(
    gridMap: GridMapState,
    states: readonly StateEntity[],
    dpi: number,
    sortedCells: readonly [string, GridMapState["cells"][string]][]
  ): StateBoundaryGeometry {
    // The boundary builder uses both control fields and state colors, but not
    // terrain, faction influence, state names or economy. We intentionally
    // include every cell ID (even if both control fields are null) to avoid
    // assumptions about how absent neighbors are represented.
    const signature = sortedCells.length <= MapOverlayGeometryCache.MAX_CELLS
      ? JSON.stringify([
          dpi,
          states.map(state => [state.id, state.color ?? null]),
          sortedCells.map(([key, cell]) => [key, cell.recognizedStateId, cell.deFactoStateId])
        ])
      : undefined;
    const cacheable = signature !== undefined &&
      signature.length <= MapOverlayGeometryCache.MAX_SIGNATURE_CHARS;
    if (cacheable && this.boundaries?.signature === signature) {
      recordPerformance("map.geometry.boundariesHit", 0);
      return this.boundaries.geometry;
    }
    const started = performance.now();
    const segments = buildStateBoundarySegmentsForFields(gridMap, states, dpi);
    const geometry = {
      recognized: compactBoundarySegments(segments.recognized),
      deFacto: compactBoundarySegments(segments.deFacto)
    };
    recordPerformance("map.geometry.boundariesBuild", performance.now() - started);
    this.boundaries = cacheable &&
      geometry.recognized.length + geometry.deFacto.length <= MapOverlayGeometryCache.MAX_OUTPUTS
      ? { signature, geometry }
      : undefined;
    return geometry;
  }
}
