import {
  reconcileLocalOverlays,
  type LocalOverlayBatchPort
} from "../owlbear/localOverlayReconciler";
import { METADATA_KEYS } from "../shared/constants";
import type { SceneItemRecord, Vector2 } from "../shared/types";

export interface VisionLightSource {
  sourceItemId: string;
  sideId: string;
  position: Vector2;
  rangeCells: number;
}

export interface VisionLightViewer {
  isGM: boolean;
  memberSideIds: ReadonlySet<string>;
}

function visionLightSourceId(item: SceneItemRecord): string | undefined {
  const raw = item.metadata[METADATA_KEYS.visionLight];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const sourceItemId = (raw as Record<string, unknown>).sourceItemId;
  return typeof sourceItemId === "string" ? sourceItemId : undefined;
}

export class VisionLightService {
  constructor(private readonly port: LocalOverlayBatchPort) {}

  async reconcile(
    sources: readonly VisionLightSource[],
    viewer: VisionLightViewer,
    dpi: number
  ): Promise<void> {
    const visibleSideIds = viewer.memberSideIds;
    const validDpi = Number.isFinite(dpi) && dpi > 0 ? dpi : 0;
    const desired = sources
      .filter((source) => viewer.isGM || visibleSideIds.has(source.sideId))
      .filter((source) => Number.isFinite(source.rangeCells) && source.rangeCells > 0 && validDpi > 0)
      .sort((left, right) => left.sourceItemId.localeCompare(right.sourceItemId))
      .map((source) => ({
        key: source.sourceItemId,
        item: {
          type: "LIGHT",
          name: "Обзор армии",
          position: { ...source.position },
          layer: "FOG",
          zIndex: 0,
          visible: true,
          locked: true,
          disableHit: true,
          disableAutoZIndex: true,
          sourceRadius: 0,
          attenuationRadius: source.rangeCells * validDpi,
          falloff: 0,
          innerAngle: 360,
          outerAngle: 360,
          lightType: "PRIMARY",
          metadata: {
            [METADATA_KEYS.visionLight]: { sourceItemId: source.sourceItemId }
          }
        }
      }));

    await reconcileLocalOverlays(this.port, visionLightSourceId, desired);
  }
}
