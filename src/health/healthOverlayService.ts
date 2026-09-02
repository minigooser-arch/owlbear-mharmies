import {
  reconcileLocalOverlays,
  type DesiredLocalOverlay,
  type LocalOverlayBatchPort
} from "../owlbear/localOverlayReconciler";
import { METADATA_KEYS } from "../shared/constants";
import type { SceneItemRecord, Vector2 } from "../shared/types";

export type HealthOverlayPort = LocalOverlayBatchPort;

export interface HealthOverlayArmy {
  armyId: string;
  position: Vector2;
  hp: number;
  maxHp: number;
  color: string;
}

function healthOverlayKey(item: SceneItemRecord): string | undefined {
  const raw = item.metadata[METADATA_KEYS.healthOverlay];
  if (typeof raw !== "object" || raw === null) return undefined;
  const armyId = (raw as Record<string, unknown>).armyId;
  return typeof armyId === "string" ? armyId : undefined;
}

function healthColor(hp: number, maxHp: number, sideColor: string): string {
  if (maxHp <= 0) return sideColor;
  const ratio = hp / maxHp;
  if (ratio <= 0.25) return "#ff6b6b";
  if (ratio <= 0.5) return "#ffd166";
  return sideColor;
}

export class HealthOverlayService {
  constructor(private readonly port: HealthOverlayPort) {}

  async reconcile(armies: readonly HealthOverlayArmy[], visibleArmyIds: ReadonlySet<string>): Promise<void> {
    const overlays: DesiredLocalOverlay[] = armies
      .filter((army) => visibleArmyIds.has(army.armyId))
      .map((army) => ({
        key: army.armyId,
        item: {
          type: "LABEL",
          position: { x: army.position.x, y: army.position.y + 28 },
          visible: true,
          disableHit: true,
          text: `♥ ${army.hp} / ${army.maxHp}`,
          color: healthColor(army.hp, army.maxHp, army.color),
          fontSize: 13,
          padding: 3,
          backgroundOpacity: 0.78,
          cornerRadius: 6,
          metadata: {
            [METADATA_KEYS.healthOverlay]: { armyId: army.armyId }
          }
        }
      }));
    await reconcileLocalOverlays(this.port, healthOverlayKey, overlays);
  }
}
