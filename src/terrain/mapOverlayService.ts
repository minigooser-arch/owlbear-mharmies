import { parseCellKey } from "../grid/strategicGrid";
import {
  reconcileLocalOverlays,
  type DesiredLocalOverlay,
  type LocalOverlayBatchPort
} from "../owlbear/localOverlayReconciler";
import { METADATA_KEYS } from "../shared/constants";
import type {
  GridMapState,
  SceneItemRecord,
  Side,
  StateEntity,
  TerrainRegistryState
} from "../shared/types";
import { buildStateBoundarySegmentsForFields, compactBoundarySegments } from "../states/stateBoundaryOverlay";
import { compactCellRectangles, type CellRectangle, type StyledCell } from "./compactOverlayGeometry";

export type MapOverlayPort = LocalOverlayBatchPort;

export interface MapOverlaySource {
  viewerRole: "GM" | "PLAYER";
  dpi: number;
  gridMap: GridMapState;
  terrain: TerrainRegistryState;
  sides: readonly Side[];
  states: readonly StateEntity[];
}

function rectangleMetadata(
  kind: "TERRAIN" | "RECOGNIZED_STATE_FILL",
  styleId: string,
  rectangle: CellRectangle
) {
  const key = `${kind}/${styleId}/${rectangle.minX},${rectangle.minY}/${rectangle.maxX},${rectangle.maxY}`;
  return {
    key,
    metadata: {
      [METADATA_KEYS.mapOverlay]: {
        key,
        kind,
        ...(kind === "TERRAIN" ? { terrainId: styleId } : { stateId: styleId })
      }
    }
  };
}

function mapOverlayKey(item: SceneItemRecord): string | undefined {
  const raw = item.metadata[METADATA_KEYS.mapOverlay];
  if (typeof raw !== "object" || raw === null) return undefined;
  const key = (raw as Record<string, unknown>).key;
  return typeof key === "string" ? key : undefined;
}

function boundaryMetadata(kind: "STATE_BOUNDARY" | "DEFACTO_BOUNDARY", stateId: string, fromX: number, fromY: number, toX: number, toY: number) {
  const key = `${kind}/${stateId}/${fromX},${fromY}/${toX},${toY}`;
  return {
    key,
    metadata: {
      [METADATA_KEYS.mapOverlay]: { key, kind, stateId }
    }
  };
}

function rectanglePoints(rectangle: CellRectangle, dpi: number) {
  const minX = rectangle.minX * dpi;
  const minY = rectangle.minY * dpi;
  const maxX = (rectangle.maxX + 1) * dpi;
  const maxY = (rectangle.maxY + 1) * dpi;
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
    { x: minX, y: minY }
  ];
}

export class MapOverlayService {
  constructor(private readonly port: MapOverlayPort) {}

  async reconcile(source: MapOverlaySource | undefined): Promise<void> {
    if (!source) {
      await reconcileLocalOverlays(this.port, mapOverlayKey, []);
      return;
    }

    const statesById = new Map(source.states.map((state) => [state.id, state]));
    const overlays: DesiredLocalOverlay[] = [];
    const terrainCells: StyledCell[] = [];
    const recognizedStateCells: StyledCell[] = [];

    for (const [rawCellKey, cell] of Object.entries(source.gridMap.cells).sort(([a], [b]) => a.localeCompare(b))) {
      let coordinate;
      try {
        coordinate = parseCellKey(rawCellKey);
      } catch {
        continue;
      }
      if (source.viewerRole === "GM" && cell.terrainId !== null) {
        const terrain = source.terrain.types[cell.terrainId];
        if (terrain?.enabled) {
          terrainCells.push({ cell: coordinate, styleKey: terrain.id });
        }
      }

      if (cell.recognizedStateId) {
        const state = statesById.get(cell.recognizedStateId);
        if (state) {
          recognizedStateCells.push({ cell: coordinate, styleKey: state.id });
        }
      }

    }

    for (const rectangle of compactCellRectangles(terrainCells)) {
      const terrain = source.terrain.types[rectangle.styleKey];
      if (!terrain) continue;
      const marker = rectangleMetadata("TERRAIN", terrain.id, rectangle);
      const color = terrain.color ?? "#42a5f5";
      overlays.push({
        key: marker.key,
        item: {
          type: "CURVE",
          position: { x: 0, y: 0 },
          visible: true,
          disableHit: true,
          points: rectanglePoints(rectangle, source.dpi),
          strokeColor: color,
          strokeWidth: Math.max(3, source.dpi * 0.035),
          fillColor: color,
          fillOpacity: 0.22,
          metadata: marker.metadata
        }
      });
    }

    for (const rectangle of compactCellRectangles(recognizedStateCells)) {
      const state = statesById.get(rectangle.styleKey);
      if (!state) continue;
      const marker = rectangleMetadata("RECOGNIZED_STATE_FILL", state.id, rectangle);
      const color = state.color ?? "#607d8b";
      overlays.push({
        key: marker.key,
        item: {
          type: "CURVE",
          position: { x: 0, y: 0 },
          visible: true,
          disableHit: true,
          points: rectanglePoints(rectangle, source.dpi),
          strokeColor: color,
          strokeOpacity: 0,
          strokeWidth: 0,
          fillColor: color,
          fillOpacity: 0.32,
          metadata: marker.metadata
        }
      });
    }

    const boundaries = buildStateBoundarySegmentsForFields(source.gridMap, source.states, source.dpi);
    for (const [segments, boundaryKind] of [[boundaries.recognized, "STATE_BOUNDARY"], [boundaries.deFacto, "DEFACTO_BOUNDARY"]] as const) {
      for (const segment of compactBoundarySegments(segments)) {
        const marker = boundaryMetadata(
          boundaryKind,
          segment.stateId,
          segment.from.x,
          segment.from.y,
          segment.to.x,
          segment.to.y
        );
        overlays.push({
          key: marker.key,
          item: {
            type: "CURVE",
            position: { x: 0, y: 0 },
            visible: true,
            disableHit: true,
            points: [{ ...segment.from }, { ...segment.to }],
            strokeColor: segment.color,
            strokeWidth: Math.max(4, source.dpi * 0.055),
            metadata: marker.metadata
          }
        });
      }
    }

    for (const overlay of overlays) {
      overlay.item.layer = "MAP";
      overlay.item.locked = true;
    }

    await reconcileLocalOverlays(this.port, mapOverlayKey, overlays);
  }
}
