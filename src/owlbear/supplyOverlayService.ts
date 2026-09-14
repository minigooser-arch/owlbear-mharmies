import { METADATA_KEYS } from "../shared/constants";
import type { GridCellCoord, SceneItemRecord } from "../shared/types";
import type { DesiredLocalOverlay } from "./localOverlayReconciler";
import { reconcileLocalOverlays, type LocalOverlayBatchPort } from "./localOverlayReconciler";

export function supplyOverlayKey(item: SceneItemRecord): string | undefined {
  const raw = item.metadata[METADATA_KEYS.supplyOverlay];
  if (typeof raw !== "object" || raw === null) return undefined;
  const metadata = raw as Record<string, unknown>;
  return typeof metadata.armyId === "string" && typeof metadata.kind === "string"
    ? `${metadata.armyId}/${metadata.kind}`
    : undefined;
}

export function buildSupplyOverlays(
  armyId: string,
  path: readonly GridCellCoord[] | null,
  color: string
): DesiredLocalOverlay[] {
  if (!path || path.length < 2) return [];
  return [{
    key: `${armyId}/LINE`,
    item: {
      type: "CURVE",
      position: { x: 0, y: 0 },
      visible: true,
      disableHit: true,
      metadata: { [METADATA_KEYS.supplyOverlay]: { armyId, kind: "LINE" } },
      points: path.map((cell) => ({ x: cell.x, y: cell.y })),
      strokeColor: color
    }
  }];
}

export class SupplyOverlayService {
  constructor(private readonly port: LocalOverlayBatchPort) {}

  async reconcile(armyId: string, path: readonly GridCellCoord[] | null, color: string): Promise<void> {
    await reconcileLocalOverlays(this.port, supplyOverlayKey, buildSupplyOverlays(armyId, path, color));
  }
}
