import {
  reconcileLocalOverlays,
  type DesiredLocalOverlay,
  type LocalOverlayBatchPort
} from "../../owlbear/localOverlayReconciler";
import { METADATA_KEYS } from "../../shared/constants";
import type { SceneItemRecord, Vector2 } from "../../shared/types";

export type ShipRouteOverlayPort = LocalOverlayBatchPort;

export interface ShipRouteOverlay {
  shipId: string;
  sideId: string;
  color: string;
  start: Vector2;
  waypoints: readonly Vector2[];
}

export interface ShipRouteOverlayViewer {
  isGM: boolean;
  leaderSideIds: readonly string[];
}

function visibleToViewer(route: ShipRouteOverlay, viewer: ShipRouteOverlayViewer): boolean {
  return viewer.isGM || viewer.leaderSideIds.includes(route.sideId);
}

function overlayKey(item: SceneItemRecord): string | undefined {
  const raw = item.metadata[METADATA_KEYS.shipRouteOverlay];
  if (typeof raw !== "object" || raw === null) return undefined;
  const metadata = raw as Record<string, unknown>;
  if (typeof metadata.shipId !== "string" || typeof metadata.kind !== "string") return undefined;
  return typeof metadata.index === "number"
    ? `${metadata.shipId}/${metadata.kind}/${metadata.index}`
    : `${metadata.shipId}/${metadata.kind}`;
}

export class ShipRouteOverlayService {
  constructor(private readonly port: ShipRouteOverlayPort) {}

  async reconcile(
    routes: readonly ShipRouteOverlay[],
    viewer: ShipRouteOverlayViewer
  ): Promise<void> {
    const overlays: DesiredLocalOverlay[] = [];
    for (const route of routes) {
      if (route.waypoints.length === 0 || !visibleToViewer(route, viewer)) continue;
      const points = [route.start, ...route.waypoints].map((point) => ({ ...point }));
      overlays.push({
        key: `${route.shipId}/LINE`,
        item: {
          type: "CURVE",
          position: { x: 0, y: 0 },
          visible: true,
          disableHit: true,
          points,
          strokeColor: route.color,
          metadata: {
            [METADATA_KEYS.shipRouteOverlay]: { shipId: route.shipId, kind: "LINE" }
          }
        }
      });
      route.waypoints.forEach((point, index) => {
        overlays.push({
          key: `${route.shipId}/WAYPOINT/${index}`,
          item: {
            type: "LABEL",
            position: { ...point },
            visible: true,
            disableHit: true,
            text: `${index + 1} ОП`,
            color: route.color,
            metadata: {
              [METADATA_KEYS.shipRouteOverlay]: {
                shipId: route.shipId,
                kind: "WAYPOINT",
                index
              }
            }
          }
        });
      });
    }
    await reconcileLocalOverlays(this.port, overlayKey, overlays);
  }
}
