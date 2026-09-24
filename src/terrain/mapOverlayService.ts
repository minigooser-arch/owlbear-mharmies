import { StrategicGridAdapter, parseCellKey } from "../grid/strategicGrid";
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
import { buildStateBoundarySegments } from "../states/stateBoundaryOverlay";

export type MapOverlayPort = LocalOverlayBatchPort;

export interface MapOverlaySource {
  dpi: number;
  gridMap: GridMapState;
  terrain: TerrainRegistryState;
  sides: readonly Side[];
  states: readonly StateEntity[];
}

function mapOverlayKey(item: SceneItemRecord): string | undefined {
  const raw = item.metadata[METADATA_KEYS.mapOverlay];
  if (typeof raw !== "object" || raw === null) return undefined;
  const key = (raw as Record<string, unknown>).key;
  return typeof key === "string" ? key : undefined;
}

function overlayMetadata(cellKey: string, kind: "TERRAIN" | "IMPASSABLE" | "RECOGNIZED_STATE_FILL", stateId?: string) {
  const key = `${cellKey}/${kind}`;
  return {
    key,
    metadata: {
      [METADATA_KEYS.mapOverlay]: { key, cellKey, kind, ...(stateId ? { stateId } : {}) }
    }
  };
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

function cellPoints(x: number, y: number, dpi: number) {
  return [
    { x: x * dpi, y: y * dpi },
    { x: (x + 1) * dpi, y: y * dpi },
    { x: (x + 1) * dpi, y: (y + 1) * dpi },
    { x: x * dpi, y: (y + 1) * dpi },
    { x: x * dpi, y: y * dpi }
  ];
}

export class MapOverlayService {
  constructor(private readonly port: MapOverlayPort) {}

  async reconcile(source: MapOverlaySource | undefined): Promise<void> {
    if (!source) {
      await reconcileLocalOverlays(this.port, mapOverlayKey, []);
      return;
    }

    const grid = new StrategicGridAdapter({ dpi: source.dpi, offset: { x: 0, y: 0 } });
    const half = source.dpi / 2;
    const statesById = new Map(source.states.map((state) => [state.id, state]));
    const overlays: DesiredLocalOverlay[] = [];

    for (const [rawCellKey, cell] of Object.entries(source.gridMap.cells).sort(([a], [b]) => a.localeCompare(b))) {
      let coordinate;
      try {
        coordinate = parseCellKey(rawCellKey);
      } catch {
        continue;
      }
      const center = grid.cellToSceneCenter(coordinate);

      if (cell.terrainId !== null) {
        const terrain = source.terrain.types[cell.terrainId];
        if (terrain?.enabled) {
          const marker = overlayMetadata(rawCellKey, "TERRAIN");
          const color = terrain.color ?? "#42a5f5";
          overlays.push({
            key: marker.key,
            item: {
              type: "CURVE",
              position: { x: 0, y: 0 },
              visible: true,
              disableHit: true,
              points: [
                { x: center.x - half, y: center.y - half },
                { x: center.x + half, y: center.y - half },
                { x: center.x + half, y: center.y + half },
                { x: center.x - half, y: center.y + half },
                { x: center.x - half, y: center.y - half }
              ],
              strokeColor: color,
              strokeWidth: Math.max(3, source.dpi * 0.035),
              fillColor: color,
              fillOpacity: 0.22,
              metadata: marker.metadata
            }
          });
        }
      }

      if (cell.recognizedStateId) {
        const state = statesById.get(cell.recognizedStateId);
        if (state) {
          const marker = overlayMetadata(rawCellKey, "RECOGNIZED_STATE_FILL", state.id);
          const color = state.color ?? "#607d8b";
          overlays.push({
            key: marker.key,
            item: {
              type: "CURVE",
              position: { x: 0, y: 0 },
              visible: true,
              disableHit: true,
              points: cellPoints(coordinate.x, coordinate.y, source.dpi),
              strokeColor: color,
              strokeOpacity: 0,
              strokeWidth: 0,
              fillColor: color,
              fillOpacity: 0.32,
              metadata: marker.metadata
            }
          });
        }
      }

      if (cell.impassable) {
        const marker = overlayMetadata(rawCellKey, "IMPASSABLE");
        overlays.push({
          key: marker.key,
          item: {
            type: "LABEL",
            position: { ...center },
            visible: true,
            disableHit: true,
            text: "⛔",
            color: "#ef5350",
            metadata: marker.metadata
          }
        });
      }
    }

    for (const [controlField, boundaryKind] of [["recognizedStateId", "STATE_BOUNDARY"], ["deFactoStateId", "DEFACTO_BOUNDARY"]] as const) {
      for (const segment of buildStateBoundarySegments(source.gridMap, source.states, source.dpi, controlField)) {
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
