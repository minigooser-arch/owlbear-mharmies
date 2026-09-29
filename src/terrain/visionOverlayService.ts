import type { LocalOverlayBatchPort } from "../owlbear/localOverlayReconciler";
import {
  reconcileLocalOverlays,
  type DesiredLocalOverlay
} from "../owlbear/localOverlayReconciler";
import { parseCellKey } from "../grid/strategicGrid";
import { METADATA_KEYS } from "../shared/constants";
import type { GridMapState, SceneItemRecord } from "../shared/types";
import { compactCellRectangles, type StyledCell } from "./compactOverlayGeometry";

export interface VisionOverlaySource {
  viewerRole: "GM" | "PLAYER";
  dpi: number;
  gridMap: GridMapState;
  visibleCells: ReadonlySet<string>;
}

export class VisionOverlayService {
  constructor(private readonly port: LocalOverlayBatchPort) {}

  async reconcile(source: VisionOverlaySource): Promise<void> {
    const overlays: DesiredLocalOverlay[] = [];
    if (source.viewerRole === "PLAYER") {
      const unseenCells: StyledCell[] = [];
      for (const rawCellKey of Object.keys(source.gridMap.cells).sort()) {
        try {
          if (!source.visibleCells.has(rawCellKey)) {
            unseenCells.push({ cell: parseCellKey(rawCellKey), styleKey: "UNSEEN" });
          }
        } catch {
          // Ignore malformed legacy cell keys.
        }
      }
      for (const rectangle of compactCellRectangles(unseenCells)) {
        const key = `VISION_UNSEEN/${rectangle.minX},${rectangle.minY}/${rectangle.maxX},${rectangle.maxY}`;
        overlays.push({
          key,
          item: {
            type: "CURVE",
            position: { x: 0, y: 0 },
            visible: true,
            disableHit: true,
            points: [
              { x: rectangle.minX * source.dpi, y: rectangle.minY * source.dpi },
              { x: (rectangle.maxX + 1) * source.dpi, y: rectangle.minY * source.dpi },
              { x: (rectangle.maxX + 1) * source.dpi, y: (rectangle.maxY + 1) * source.dpi },
              { x: rectangle.minX * source.dpi, y: (rectangle.maxY + 1) * source.dpi },
              { x: rectangle.minX * source.dpi, y: rectangle.minY * source.dpi }
            ],
            fillColor: "#777777",
            fillOpacity: 0.22,
            strokeColor: "#777777",
            strokeOpacity: 0,
            strokeWidth: 0,
            layer: "MAP",
            locked: true,
            metadata: {
              [METADATA_KEYS.visionOverlay]: {
                key,
                kind: "VISION_UNSEEN"
              }
            }
          }
        });
      }
    }
    await reconcileLocalOverlays(this.port, visionOverlayKey, overlays);
  }
}

function visionOverlayKey(item: SceneItemRecord): string | undefined {
  const raw = item.metadata[METADATA_KEYS.visionOverlay];
  if (typeof raw !== "object" || raw === null) return undefined;
  const key = (raw as Record<string, unknown>).key;
  return typeof key === "string" ? key : undefined;
}
