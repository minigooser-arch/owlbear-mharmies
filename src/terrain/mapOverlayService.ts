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

function overlayMetadata(cellKey: string, kind: "TERRAIN" | "IMPASSABLE" | "TERRITORY" | "RECOGNIZED_STATE" | "DEFACTO_STATE") {
  const key = `${cellKey}/${kind}`;
  return {
    key,
    metadata: {
      [METADATA_KEYS.mapOverlay]: { key, cellKey, kind }
    }
  };
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
    const sidesById = new Map(source.sides.map((side) => [side.id, side]));
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
              strokeColor: terrain.color ?? "#42a5f5",
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


      if (cell.recognizedStateId) {
        const state = statesById.get(cell.recognizedStateId);
        if (state) {
          const marker = overlayMetadata(rawCellKey, "RECOGNIZED_STATE");
          overlays.push({ key: marker.key, item: { type: "LABEL", position: { x: center.x, y: center.y - source.dpi * 0.32 }, visible: true, disableHit: true, text: `Призн.: ${state.name}`, color: "#26a69a", metadata: marker.metadata } });
        }
      }

      if (cell.deFactoStateId) {
        const state = statesById.get(cell.deFactoStateId);
        if (state) {
          const marker = overlayMetadata(rawCellKey, "DEFACTO_STATE");
          overlays.push({ key: marker.key, item: { type: "LABEL", position: { x: center.x, y: center.y - source.dpi * 0.18 }, visible: true, disableHit: true, text: `Де-факто: ${state.name}`, color: "#ffb300", metadata: marker.metadata } });
        }
      }

      if (cell.factionTerritoryIds.length > 0) {
        const territorySides = cell.factionTerritoryIds
          .map((sideId) => sidesById.get(sideId))
          .filter((side): side is Side => side !== undefined);
        const names = territorySides.map((side) => side.name);
        if (names.length > 0) {
          const marker = overlayMetadata(rawCellKey, "TERRITORY");
          overlays.push({
            key: marker.key,
            item: {
              type: "LABEL",
              position: { x: center.x, y: center.y + source.dpi * 0.3 },
              visible: true,
              disableHit: true,
              text: `Т: ${names.join(", ")}`,
              color: territorySides[0]?.color ?? "#ab47bc",
              metadata: marker.metadata
            }
          });
        }
      }
    }

    await reconcileLocalOverlays(this.port, mapOverlayKey, overlays);
  }
}
