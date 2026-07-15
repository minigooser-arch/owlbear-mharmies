import { METADATA_KEYS } from "../shared/constants";
import type { ArmyStatus, SceneItemRecord, Vector2 } from "../shared/types";
import {
  reconcileLocalOverlays,
  type DesiredLocalOverlay,
  type LocalOverlayBatchPort
} from "../owlbear/localOverlayReconciler";

export type RouteOverlayPort = LocalOverlayBatchPort;

export interface RouteOverlay {
  armyId: string;
  sideId: string;
  status: ArmyStatus;
  color: string;
  start: Vector2;
  waypoints: readonly Vector2[];
}

export interface RouteOverlayViewer {
  isGM: boolean;
  memberSideIds: readonly string[];
  leaderSideIds: readonly string[];
}

function routeVisible(route: RouteOverlay, viewer: RouteOverlayViewer): boolean {
  if (viewer.isGM) return true;
  if (route.status === "READY") return viewer.leaderSideIds.includes(route.sideId);
  return viewer.memberSideIds.includes(route.sideId);
}

function routeOverlayKey(item: SceneItemRecord): string | undefined {
  const raw = item.metadata[METADATA_KEYS.routeOverlay];
  if (typeof raw !== "object" || raw === null) return undefined;
  const metadata = raw as Record<string, unknown>;
  if (typeof metadata.armyId !== "string" || typeof metadata.kind !== "string") {
    return undefined;
  }
  return typeof metadata.index === "number"
    ? `${metadata.armyId}/${metadata.kind}/${metadata.index}`
    : `${metadata.armyId}/${metadata.kind}`;
}

export class RouteOverlayService {
  constructor(private readonly port: RouteOverlayPort) {}

  async reconcile(routes: readonly RouteOverlay[], viewer: RouteOverlayViewer): Promise<void> {
    const visible = routes.filter(
      (route) => route.waypoints.length > 0 && routeVisible(route, viewer)
    );
    const overlays: DesiredLocalOverlay[] = [];
    for (const route of visible) {
      const points = [route.start, ...route.waypoints].map((point) => ({ ...point }));
      overlays.push({
        key: `${route.armyId}/LINE`,
        item: {
          type: "CURVE",
          position: { x: 0, y: 0 },
          visible: true,
          disableHit: true,
          metadata: {
            [METADATA_KEYS.routeOverlay]: { armyId: route.armyId, kind: "LINE" }
          },
          points,
          strokeColor: route.color
        }
      });
      route.waypoints.forEach((point, index) => {
        overlays.push({
          key: `${route.armyId}/WAYPOINT/${index}`,
          item: {
            type: "LABEL",
            position: { ...point },
            visible: true,
            disableHit: true,
            metadata: {
              [METADATA_KEYS.routeOverlay]: {
                armyId: route.armyId,
                kind: "WAYPOINT",
                index
              }
            },
            text: `${index + 1}`,
            color: route.color
          }
        });
      });
    }
    await reconcileLocalOverlays(this.port, routeOverlayKey, overlays);
  }
}
