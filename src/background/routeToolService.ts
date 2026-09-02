import {
  firstBarrierIntersection,
  segmentsFromPolyline,
  type BarrierSegment
} from "../barriers/barrierGeometry";
import type { CommandAck } from "../commands/commandGateway";
import { StrategicGridAdapter } from "../grid/strategicGrid";
import {
  evaluateRouteLimit,
  pointsEqual,
  type GridDistancePort,
  type GridRoutePort
} from "../routes/routeMath";
import { authorizeArmyCommand } from "../shared/permissions";
import { METADATA_KEYS } from "../shared/constants";
import type {
  ArmyCommand,
  GridCellCoord,
  SceneItemRecord,
  SceneState,
  Vector2
} from "../shared/types";
import { COMMAND_PROTOCOL_VERSION } from "../shared/types";
import {
  MetadataRepository,
  type ArmyRecord,
  type MetadataPort
} from "../storage/metadataRepository";
import type {
  RouteToolIntegrationPort,
  RouteToolSession
} from "../owlbear/routeToolIntegration";
import type { RouteToolSnapshot } from "../owlbear/routeTool";
import {
  reconcileLocalOverlays,
  type DesiredLocalOverlay,
  type LocalOverlayBatchPort
} from "../owlbear/localOverlayReconciler";

export interface RouteToolIdentity {
  id: string;
  role: "GM" | "PLAYER";
  connectionId: string;
}

export interface RouteToolServicePort extends MetadataPort, LocalOverlayBatchPort {
  getPlayerIdentity(): Promise<RouteToolIdentity>;
  show(message: string, variant: "INFO" | "WARNING" | "ERROR"): Promise<void>;
  activateTool(toolId: string): Promise<void>;
  getGridDistance(from: Vector2, to: Vector2): Promise<number>;
  snapGridCenter(position: Vector2): Promise<Vector2>;
  getGridDpi(): Promise<number>;
}

export interface RouteCommandGateway {
  send(command: ArmyCommand): Promise<CommandAck>;
}

export class RouteToolAuthorizationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "RouteToolAuthorizationError";
  }
}

interface AuthorizedSession {
  identity: RouteToolIdentity;
  scene: SceneState;
  army: ArmyRecord;
  barriers: readonly BarrierSegment[];
}

export type RouteConstraintFailure = "ROUTE_LIMIT" | "BARRIER";

export interface SnappedRoute {
  start: Vector2;
  route: Vector2[];
  waypointsWereCentered: boolean;
}

export async function snapRouteToGrid(
  start: Vector2,
  route: readonly Vector2[],
  grid: Pick<GridRoutePort, "snapGridCenter">
): Promise<SnappedRoute> {
  const snappedStart = await grid.snapGridCenter(start);
  const snappedRoute = await Promise.all(route.map((point) => grid.snapGridCenter(point)));
  return {
    start: { ...snappedStart },
    route: snappedRoute.map((point) => ({ ...point })),
    waypointsWereCentered: route.every((point, index) => {
      const snapped = snappedRoute[index];
      return snapped !== undefined && pointsEqual(point, snapped);
    })
  };
}

export async function validateRouteConstraints(
  start: Vector2,
  route: readonly Vector2[],
  maxCells: number,
  barriers: readonly BarrierSegment[],
  distancePort: GridDistancePort
): Promise<RouteConstraintFailure | undefined> {
  const limit = await evaluateRouteLimit(start, route, maxCells, distancePort);
  let from = start;
  for (const to of route) {
    if (firstBarrierIntersection({ from, to }, barriers)) return "BARRIER";
    from = to;
  }
  return limit.valid ? undefined : "ROUTE_LIMIT";
}

function curvePoints(item: SceneItemRecord): Vector2[] {
  if (!Array.isArray(item.points)) return [];
  return item.points.flatMap((point) => {
    if (typeof point !== "object" || point === null) return [];
    const candidate = point as Record<string, unknown>;
    return typeof candidate.x === "number" && typeof candidate.y === "number"
      ? [{ x: candidate.x, y: candidate.y }]
      : [];
  });
}

function previewOverlayKey(item: SceneItemRecord): string | undefined {
  const raw = item.metadata[METADATA_KEYS.routePreview];
  if (typeof raw !== "object" || raw === null) return undefined;
  const metadata = raw as Record<string, unknown>;
  if (typeof metadata.armyId !== "string" || typeof metadata.kind !== "string") {
    return undefined;
  }
  return typeof metadata.index === "number"
    ? `${metadata.armyId}/${metadata.kind}/${metadata.index}`
    : `${metadata.armyId}/${metadata.kind}`;
}

export class RouteToolService implements RouteToolIntegrationPort {
  private readonly repository: MetadataRepository;

  constructor(
    private readonly port: RouteToolServicePort,
    private readonly gateway: RouteCommandGateway
  ) {
    this.repository = new MetadataRepository(port);
  }

  async loadSession(armyId: string): Promise<RouteToolSession> {
    const authorized = await this.loadAuthorized(armyId, [], { x: 0, y: 0 }, []);
    const [start, gridDpi] = await Promise.all([
      this.port.snapGridCenter(authorized.army.item.position),
      this.port.getGridDpi()
    ]);
    const adapter = new StrategicGridAdapter({ dpi: gridDpi, offset: { x: 0, y: 0 } });
    return {
      armyId,
      start: { ...start },
      startCell: adapter.sceneToCell(start),
      gridDpi,
      sideId: authorized.army.state.sideId,
      // Route planning is always for the next global turn: full 5 OP budget.
      movementUnits: 10,
      maxUnits: 10,
      terrain: structuredClone(authorized.scene.terrain),
      gridMap: structuredClone(authorized.scene.gridMap),
      wars: structuredClone(authorized.scene.wars),
      barriers: authorized.army.state.ignoresMovementBarriers
        ? []
        : authorized.barriers.map((segment) => structuredClone(segment))
    };
  }

  async commitRoute(
    armyId: string,
    route: readonly Vector2[],
    startCell: GridCellCoord,
    cells: readonly GridCellCoord[]
  ): Promise<void> {
    const authorized = await this.loadAuthorized(armyId, route, startCell, cells);
    const snapped = await snapRouteToGrid(authorized.army.item.position, route, this.port);
    if (!snapped.waypointsWereCentered || snapped.route.length !== cells.length) {
      throw new RouteToolAuthorizationError("INVALID_COMMAND");
    }
    const command: ArmyCommand = {
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: crypto.randomUUID(),
      senderPlayerId: authorized.identity.id,
      senderConnectionId: authorized.identity.connectionId,
      expectedRevision: authorized.scene.revision,
      type: "SET_ROUTE",
      armyId,
      route: snapped.route,
      startCell: { ...startCell },
      cells: cells.map((cell) => ({ ...cell }))
    };
    const ack = await this.gateway.send(command);
    if (ack.status === "REJECTED") {
      throw new RouteToolAuthorizationError(ack.reason ?? "INVALID_COMMAND");
    }
    if (ack.status === "CONFLICT") {
      throw new RouteToolAuthorizationError("REVISION_CONFLICT");
    }
  }

  async renderPreview(snapshot: RouteToolSnapshot): Promise<void> {
    const polyline = [
      snapshot.start,
      ...snapshot.points,
      ...(snapshot.preview ? [snapshot.preview.point] : [])
    ].map((point) => ({ ...point }));
    const overlays: DesiredLocalOverlay[] = [];
    if (polyline.length >= 2) {
      overlays.push({
        key: `${snapshot.armyId}/LINE`,
        item: {
          type: "CURVE",
          position: { x: 0, y: 0 },
          visible: true,
          disableHit: true,
          points: polyline,
          strokeColor: snapshot.preview?.color ?? "#2e7d32",
          metadata: {
            [METADATA_KEYS.routePreview]: { armyId: snapshot.armyId, kind: "LINE" }
          }
        }
      });
    }
    for (const [index, point] of snapshot.points.entries()) {
      overlays.push({
        key: `${snapshot.armyId}/WAYPOINT/${index}`,
        item: {
          type: "LABEL",
          position: { ...point },
          visible: true,
          disableHit: true,
          text: `${index + 1} · ${((snapshot.stepCostUnits[index] ?? 0) / 2).toLocaleString("ru-RU")} ОП`,
          color: "#2e7d32",
          metadata: {
            [METADATA_KEYS.routePreview]: {
              armyId: snapshot.armyId,
              kind: "WAYPOINT",
              index
            }
          }
        }
      });
    }
    if (snapshot.preview) {
      overlays.push({
        key: `${snapshot.armyId}/DISTANCE`,
        item: {
          type: "LABEL",
          position: { ...snapshot.preview.point },
          visible: true,
          disableHit: true,
          text: snapshot.preview.label,
          color: snapshot.preview.color,
          metadata: {
            [METADATA_KEYS.routePreview]: { armyId: snapshot.armyId, kind: "DISTANCE" }
          }
        }
      });
    }
    await reconcileLocalOverlays(this.port, previewOverlayKey, overlays);
  }

  async clearPreview(): Promise<void> {
    await reconcileLocalOverlays(this.port, previewOverlayKey, []);
  }

  notify(message: string, variant: "INFO" | "WARNING" | "ERROR"): Promise<void> {
    return this.port.show(message, variant);
  }

  restoreTool(toolId: string): Promise<void> {
    return this.port.activateTool(toolId);
  }

  private async loadAuthorized(
    armyId: string,
    route: readonly Vector2[],
    startCell: GridCellCoord,
    cells: readonly GridCellCoord[]
  ): Promise<AuthorizedSession> {
    const [identity, scene, armies, barriers] = await Promise.all([
      this.port.getPlayerIdentity(),
      this.repository.readScene(),
      this.repository.readArmies(),
      this.repository.readBarriers()
    ]);
    const army = armies.find((record) => record.item.id === armyId);
    if (!army) throw new RouteToolAuthorizationError("ARMY_NOT_FOUND");
    const authorization = authorizeArmyCommand(
      {
        role: identity.role,
        playerId: identity.id,
        armies: new Map(armies.map((record) => [record.item.id, record.state])),
        sides: scene.sides,
        settings: scene.settings,
        connectedPlayerIds: new Set([identity.id])
      },
      {
        protocolVersion: COMMAND_PROTOCOL_VERSION,
        requestId: "route-tool-authorization",
        senderPlayerId: identity.id,
        senderConnectionId: identity.connectionId,
        expectedRevision: scene.revision,
        type: "SET_ROUTE",
        armyId,
        route: route.map((point) => ({ ...point })),
        startCell: { ...startCell },
        cells: cells.map((cell) => ({ ...cell }))
      }
    );
    if (!authorization.allowed) {
      throw new RouteToolAuthorizationError(authorization.reason);
    }
    if (army.state.status === "MOVING" || army.state.status === "IN_BATTLE") {
      throw new RouteToolAuthorizationError("ARMY_NOT_READY");
    }
    return {
      identity,
      scene,
      army,
      barriers: barriers.flatMap((record) => {
        if (!record.state.blocksMovement) return [];
        return segmentsFromPolyline(record.item.id, curvePoints(record.item));
      })
    };
  }
}
