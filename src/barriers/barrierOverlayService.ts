import { METADATA_KEYS } from "../shared/constants";
import type { BarrierVisibility, SceneItemRecord, Vector2 } from "../shared/types";

export interface BarrierOverlayPort {
  getItems(): Promise<SceneItemRecord[]>;
  addItems(items: SceneItemRecord[]): Promise<void>;
  deleteItems(ids: readonly string[]): Promise<void>;
  createId(): string;
}

export interface BarrierOverlaySource {
  id: string;
  points: readonly Vector2[];
  color: string;
  visibility: BarrierVisibility;
}

export class BarrierOverlayService {
  constructor(private readonly port: BarrierOverlayPort) {}

  async reconcile(barriers: readonly BarrierOverlaySource[], isGM: boolean): Promise<void> {
    const existing = (await this.port.getItems()).filter(
      (item) => item.metadata[METADATA_KEYS.barrierOverlay] !== undefined
    );
    if (existing.length > 0) await this.port.deleteItems(existing.map((item) => item.id));
    const overlays = barriers
      .filter((barrier) => isGM || barrier.visibility === "EVERYONE")
      .map<SceneItemRecord>((barrier) => ({
        id: this.port.createId(),
        type: "CURVE",
        position: { x: 0, y: 0 },
        visible: true,
        disableHit: true,
        metadata: {
          [METADATA_KEYS.barrierOverlay]: { barrierId: barrier.id }
        },
        points: barrier.points.map((point) => ({ ...point })),
        strokeColor: barrier.color
      }));
    if (overlays.length > 0) await this.port.addItems(overlays);
  }
}
