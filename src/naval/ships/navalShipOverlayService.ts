import {
  reconcileLocalOverlays,
  type DesiredLocalOverlay,
  type LocalOverlayBatchPort
} from "../../owlbear/localOverlayReconciler";
import { METADATA_KEYS } from "../../shared/constants";
import type { SceneItemRecord, Vector2 } from "../../shared/types";

export type NavalShipOverlayPort = LocalOverlayBatchPort;

export interface NavalShipOverlay {
  shipId: string;
  name: string;
  position: Vector2;
  hp: number;
  maxHp: number;
  color: string;
}

type NavalShipOverlayKind = "NAME" | "HP";

const SHIP_LABEL_SCREEN_OFFSET_PX = 28;

function navalShipOverlayKey(item: SceneItemRecord): string | undefined {
  const raw = item.metadata[METADATA_KEYS.navalShipOverlay];
  if (typeof raw !== "object" || raw === null) return undefined;
  const record = raw as Record<string, unknown>;
  const shipId = record.shipId;
  const kind = record.kind;
  if (typeof shipId !== "string" || (kind !== "NAME" && kind !== "HP")) return undefined;
  return `${shipId}:${kind}`;
}

function healthColor(hp: number, maxHp: number, sideColor: string): string {
  if (maxHp <= 0) return sideColor;
  const ratio = hp / maxHp;
  if (ratio <= 0.25) return "#ff6b6b";
  if (ratio <= 0.5) return "#ffd166";
  return sideColor;
}

function metadata(shipId: string, kind: NavalShipOverlayKind): Record<string, unknown> {
  return {
    [METADATA_KEYS.navalShipOverlay]: { shipId, kind }
  };
}

function sceneOffsetForScreenPixels(screenPixels: number, viewportScale: number): number {
  const scale = Number.isFinite(viewportScale) && viewportScale > 0 ? viewportScale : 1;
  return screenPixels / scale;
}

export class NavalShipOverlayService {
  constructor(private readonly port: NavalShipOverlayPort) {}

  async reconcile(
    ships: readonly NavalShipOverlay[],
    visibleShipIds: ReadonlySet<string>,
    viewportScale = 1
  ): Promise<void> {
    const labelOffset = sceneOffsetForScreenPixels(SHIP_LABEL_SCREEN_OFFSET_PX, viewportScale);
    const overlays: DesiredLocalOverlay[] = ships
      .filter((ship) => visibleShipIds.has(ship.shipId))
      .flatMap((ship): DesiredLocalOverlay[] => [
        {
          key: `${ship.shipId}:NAME`,
          item: {
            type: "LABEL",
            position: { x: ship.position.x, y: ship.position.y - labelOffset },
            visible: true,
            disableHit: true,
            text: ship.name,
            color: ship.color,
            fontSize: 14,
            padding: 3,
            backgroundOpacity: 0.78,
            cornerRadius: 6,
            metadata: metadata(ship.shipId, "NAME")
          }
        },
        {
          key: `${ship.shipId}:HP`,
          item: {
            type: "LABEL",
            position: { x: ship.position.x, y: ship.position.y + labelOffset },
            visible: true,
            disableHit: true,
            text: `♥ ${ship.hp} / ${ship.maxHp}`,
            color: healthColor(ship.hp, ship.maxHp, ship.color),
            fontSize: 13,
            padding: 3,
            backgroundOpacity: 0.78,
            cornerRadius: 6,
            metadata: metadata(ship.shipId, "HP")
          }
        }
      ]);

    await reconcileLocalOverlays(this.port, navalShipOverlayKey, overlays);
  }
}
