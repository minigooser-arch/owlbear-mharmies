import { StrategicGridAdapter } from "../grid/strategicGrid";
import { METADATA_KEYS } from "../shared/constants";
import type { GridCellCoord, SceneItemRecord } from "../shared/types";
import {
  reconcileLocalOverlays,
  type DesiredLocalOverlay,
  type LocalOverlayBatchPort
} from "./localOverlayReconciler";

export function peaceTransferOverlayKey(item: SceneItemRecord): string | undefined {
  const raw = item.metadata[METADATA_KEYS.peaceTransferOverlay];
  if (typeof raw !== "object" || raw === null) return undefined;
  const key = (raw as Record<string, unknown>).cellKey;
  return typeof key === "string" ? key : undefined;
}

export function buildPeaceTransferOverlays(
  cells: readonly GridCellCoord[],
  color: string,
  dpi: number
): DesiredLocalOverlay[] {
  const grid = new StrategicGridAdapter({ dpi, offset: { x: 0, y: 0 } });
  const half = dpi / 2;
  return cells.map((cell) => {
    const key = `${cell.x},${cell.y}`;
    const center = grid.cellToSceneCenter(cell);
    return {
      key,
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
        strokeWidth: Math.max(4, dpi * 0.05),
        fillColor: color,
        fillOpacity: 0.28,
        metadata: {
          [METADATA_KEYS.peaceTransferOverlay]: { cellKey: key }
        }
      }
    };
  });
}

export class PeaceTransferOverlayService {
  constructor(private readonly port: LocalOverlayBatchPort) {}

  async reconcile(cells: readonly GridCellCoord[], color: string, dpi: number): Promise<void> {
    await reconcileLocalOverlays(
      this.port,
      peaceTransferOverlayKey,
      buildPeaceTransferOverlays(cells, color, dpi)
    );
  }

  async clear(): Promise<void> {
    await reconcileLocalOverlays(this.port, peaceTransferOverlayKey, []);
  }
}
