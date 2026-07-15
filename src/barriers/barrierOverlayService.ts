import { METADATA_KEYS } from "../shared/constants";
import type { BarrierVisibility, SceneItemRecord, Vector2 } from "../shared/types";
import {
  reconcileLocalOverlays,
  type LocalOverlayBatchPort
} from "../owlbear/localOverlayReconciler";

export type BarrierOverlayPort = LocalOverlayBatchPort;

export interface BarrierOverlaySource {
  id: string;
  points: readonly Vector2[];
  color: string;
  visibility: BarrierVisibility;
}

function barrierOverlayKey(item: SceneItemRecord): string | undefined {
  const raw = item.metadata[METADATA_KEYS.barrierOverlay];
  if (typeof raw !== "object" || raw === null) return undefined;
  const barrierId = (raw as Record<string, unknown>).barrierId;
  return typeof barrierId === "string" ? barrierId : undefined;
}

export class BarrierOverlayService {
  constructor(private readonly port: BarrierOverlayPort) {}

  async reconcile(barriers: readonly BarrierOverlaySource[], isGM: boolean): Promise<void> {
    const overlays = barriers
      .filter((barrier) => isGM || barrier.visibility === "EVERYONE")
      .map((barrier) => ({
        key: barrier.id,
        item: {
          type: "CURVE",
          position: { x: 0, y: 0 },
          visible: true,
          disableHit: true,
          metadata: {
            [METADATA_KEYS.barrierOverlay]: { barrierId: barrier.id }
          },
          points: barrier.points.map((point) => ({ ...point })),
          strokeColor: barrier.color
        }
      }));
    await reconcileLocalOverlays(this.port, barrierOverlayKey, overlays);
  }
}
