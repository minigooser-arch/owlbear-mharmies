import { METADATA_KEYS } from "../shared/constants";
import type { ArmyStatus, SceneItemRecord, Vector2 } from "../shared/types";

export interface RouteOverlayPort {
  getItems(): Promise<SceneItemRecord[]>;
  addItems(items: SceneItemRecord[]): Promise<void>;
  deleteItems(ids: readonly string[]): Promise<void>;
  createId(): string;
}

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

export class RouteOverlayService {
  constructor(private readonly port: RouteOverlayPort) {}

  async reconcile(routes: readonly RouteOverlay[], viewer: RouteOverlayViewer): Promise<void> {
    const existing = (await this.port.getItems()).filter(
      (item) => item.metadata[METADATA_KEYS.routeOverlay] !== undefined
    );
    if (existing.length > 0) await this.port.deleteItems(existing.map((item) => item.id));
    const visible = routes.filter(
      (route) => route.waypoints.length > 0 && routeVisible(route, viewer)
    );
    const overlays: SceneItemRecord[] = [];
    for (const route of visible) {
      const points = [route.start, ...route.waypoints].map((point) => ({ ...point }));
      overlays.push({
        id: this.port.createId(),
        type: "CURVE",
        position: { x: 0, y: 0 },
        visible: true,
        disableHit: true,
        metadata: {
          [METADATA_KEYS.routeOverlay]: { armyId: route.armyId, kind: "LINE" }
        },
        points,
        strokeColor: route.color
      });
      route.waypoints.forEach((point, index) => {
        overlays.push({
          id: this.port.createId(),
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
        });
      });
    }
    if (overlays.length > 0) await this.port.addItems(overlays);
  }
}
