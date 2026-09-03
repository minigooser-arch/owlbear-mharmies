import type { CommandAck } from "../commands/commandGateway";
import { StrategicGridAdapter } from "../grid/strategicGrid";
import { SHIP_CLASSES } from "../naval/ships/shipClasses";
import type { ShipRouteToolSnapshot, ShipRouteToolActivation } from "../owlbear/shipRouteTool";
import {
  reconcileLocalOverlays,
  type DesiredLocalOverlay,
  type LocalOverlayBatchPort
} from "../owlbear/localOverlayReconciler";
import { METADATA_KEYS } from "../shared/constants";
import { authorizeArmyCommand } from "../shared/permissions";
import {
  COMMAND_PROTOCOL_VERSION,
  type ArmyCommand,
  type GridCellCoord,
  type SceneItemRecord,
  type Vector2
} from "../shared/types";
import {
  MetadataRepository,
  type MetadataPort,
  type ShipRecord
} from "../storage/metadataRepository";

export interface ShipRouteToolIdentity {
  id: string;
  role: "GM" | "PLAYER";
  connectionId: string;
}

export interface ShipRouteToolServicePort extends MetadataPort, LocalOverlayBatchPort {
  getPlayerIdentity(): Promise<ShipRouteToolIdentity>;
  show(message: string, variant: "INFO" | "WARNING" | "ERROR"): Promise<void>;
  activateTool(toolId: string): Promise<void>;
  snapGridCenter(position: Vector2): Promise<Vector2>;
  getGridDpi(): Promise<number>;
}

export interface ShipRouteCommandGateway {
  send(command: ArmyCommand): Promise<CommandAck>;
}

export class ShipRouteToolAuthorizationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ShipRouteToolAuthorizationError";
  }
}

interface AuthorizedShipRouteSession {
  identity: ShipRouteToolIdentity;
  scene: Awaited<ReturnType<MetadataRepository["readScene"]>>;
  ship: ShipRecord;
}

function previewOverlayKey(item: SceneItemRecord): string | undefined {
  const raw = item.metadata[METADATA_KEYS.shipRoutePreview];
  if (typeof raw !== "object" || raw === null) return undefined;
  const metadata = raw as Record<string, unknown>;
  if (typeof metadata.shipId !== "string" || typeof metadata.kind !== "string") return undefined;
  return typeof metadata.index === "number"
    ? `${metadata.shipId}/${metadata.kind}/${metadata.index}`
    : `${metadata.shipId}/${metadata.kind}`;
}

export class ShipRouteToolService {
  private readonly repository: MetadataRepository;

  constructor(
    private readonly port: ShipRouteToolServicePort,
    private readonly gateway: ShipRouteCommandGateway
  ) {
    this.repository = new MetadataRepository(port);
  }

  async loadSession(shipId: string): Promise<ShipRouteToolActivation> {
    const authorized = await this.loadAuthorized(shipId);
    const [start, gridDpi] = await Promise.all([
      this.port.snapGridCenter(authorized.ship.item.position),
      this.port.getGridDpi()
    ]);
    const grid = new StrategicGridAdapter({ dpi: gridDpi, offset: { x: 0, y: 0 } });
    return {
      shipId,
      start: { ...start },
      startCell: grid.sceneToCell(start),
      gridDpi,
      movementPoints: authorized.ship.state.globalMovementRemaining,
      maxMovementPoints: SHIP_CLASSES[authorized.ship.state.classId].movement,
      terrain: structuredClone(authorized.scene.terrain),
      gridMap: structuredClone(authorized.scene.gridMap)
    };
  }

  async commitRoute(
    shipId: string,
    startCell: GridCellCoord,
    cells: readonly GridCellCoord[]
  ): Promise<void> {
    const authorized = await this.loadAuthorized(shipId);
    if (cells.length === 0) throw new ShipRouteToolAuthorizationError("INVALID_COMMAND");
    const command: ArmyCommand = {
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: crypto.randomUUID(),
      senderPlayerId: authorized.identity.id,
      senderConnectionId: authorized.identity.connectionId,
      expectedRevision: authorized.scene.revision,
      type: "SET_SHIP_ROUTE",
      shipId,
      startCell: { ...startCell },
      cells: cells.map((cell) => ({ ...cell }))
    };
    const acknowledgement = await this.gateway.send(command);
    if (acknowledgement.status === "REJECTED") {
      throw new ShipRouteToolAuthorizationError(acknowledgement.reason ?? "INVALID_COMMAND");
    }
    if (acknowledgement.status === "CONFLICT") {
      throw new ShipRouteToolAuthorizationError("REVISION_CONFLICT");
    }
  }

  async renderPreview(snapshot: ShipRouteToolSnapshot): Promise<void> {
    const overlays: DesiredLocalOverlay[] = [];
    const polyline = [
      snapshot.start,
      ...snapshot.points,
      ...(snapshot.preview ? [snapshot.preview.point] : [])
    ].map((point) => ({ ...point }));
    if (polyline.length >= 2) {
      overlays.push({
        key: `${snapshot.shipId}/LINE`,
        item: {
          type: "CURVE",
          position: { x: 0, y: 0 },
          visible: true,
          disableHit: true,
          points: polyline,
          strokeColor: snapshot.preview?.color ?? "#4f687a",
          metadata: {
            [METADATA_KEYS.shipRoutePreview]: { shipId: snapshot.shipId, kind: "LINE" }
          }
        }
      });
    }
    snapshot.points.forEach((point, index) => {
      overlays.push({
        key: `${snapshot.shipId}/WAYPOINT/${index}`,
        item: {
          type: "LABEL",
          position: { ...point },
          visible: true,
          disableHit: true,
          text: `${index + 1} ОП`,
          color: "#4f687a",
          metadata: {
            [METADATA_KEYS.shipRoutePreview]: {
              shipId: snapshot.shipId,
              kind: "WAYPOINT",
              index
            }
          }
        }
      });
    });
    if (snapshot.preview) {
      overlays.push({
        key: `${snapshot.shipId}/DISTANCE`,
        item: {
          type: "LABEL",
          position: { ...snapshot.preview.point },
          visible: true,
          disableHit: true,
          text: snapshot.preview.label,
          color: snapshot.preview.color,
          metadata: {
            [METADATA_KEYS.shipRoutePreview]: { shipId: snapshot.shipId, kind: "DISTANCE" }
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

  private async loadAuthorized(shipId: string): Promise<AuthorizedShipRouteSession> {
    const [identity, scene, ships] = await Promise.all([
      this.port.getPlayerIdentity(),
      this.repository.readScene(),
      this.repository.readShips()
    ]);
    const ship = ships.find((record) => record.item.id === shipId);
    if (!ship) throw new ShipRouteToolAuthorizationError("SHIP_NOT_FOUND");
    const authorization = authorizeArmyCommand(
      {
        role: identity.role,
        playerId: identity.id,
        armies: new Map(),
        ships: new Map(ships.map((record) => [record.item.id, record.state])),
        sides: scene.sides,
        settings: scene.settings,
        connectedPlayerIds: new Set([identity.id])
      },
      {
        protocolVersion: COMMAND_PROTOCOL_VERSION,
        requestId: "ship-route-tool-authorization",
        senderPlayerId: identity.id,
        senderConnectionId: identity.connectionId,
        expectedRevision: scene.revision,
        type: "SET_SHIP_ROUTE",
        shipId,
        startCell: { x: 0, y: 0 },
        cells: [{ x: 1, y: 0 }]
      }
    );
    if (!authorization.allowed) {
      throw new ShipRouteToolAuthorizationError(authorization.reason);
    }
    if (ship.state.status !== "READY") {
      throw new ShipRouteToolAuthorizationError("SHIP_NOT_READY");
    }
    if (ship.state.plannedRoute.length > 0) {
      throw new ShipRouteToolAuthorizationError("SHIP_ROUTE_ALREADY_PLANNED");
    }
    if (ship.state.globalMovementRemaining <= 0) {
      throw new ShipRouteToolAuthorizationError("INSUFFICIENT_MOVEMENT_POINTS");
    }
    return { identity, scene, ship };
  }
}
