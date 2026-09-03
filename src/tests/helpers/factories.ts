import {
  CommandProcessor,
  type CommandContext,
  type CommandState
} from "../../commands/commandProcessor";
import {
  RouteOverlayService,
  type RouteOverlayPort
} from "../../routes/routeOverlayService";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../../shared/constants";
import type {
  ArmyCommand,
  ArmyCommandPayload,
  ArmyState,
  SceneItemRecord,
  Vector2
} from "../../shared/types";

export interface RoomArmy {
  id: string;
  sideId: string;
  name: string;
  position: Vector2;
  detectionRangeCells: number;
  collisionRangeCells: number;
  speedCellsPerSecond: number;
  state: ArmyState;
}

export function roomArmy(id: string, sideId: string, name: string, x: number): RoomArmy {
  return {
    id,
    sideId,
    name,
    position: { x, y: 0 },
    detectionRangeCells: 6,
    collisionRangeCells: 0.5,
    speedCellsPerSecond: 1,
    state: {
      version: 4,
      registered: true,
      sideId,
      status: "READY",
      overrides: {},
      route: [],
      plannedRoute: {
        startCell: { x: 0, y: 0 },
        executeOnTurn: 0,
        cells: [],
        totalCostUnits: 0,
        validatedRevision: 0,
        requiresReplan: false
      },
      movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
      health: { hp: 50, maxHp: 50 },
      supply: { supplied: true, checkedOnTurn: 0 },
      disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
      embarkedOnShipId: null,
      currentWaypointIndex: 0,
      segmentProgressCells: 0,
      ignoresMovementBarriers: false,
      ignoresVisionBarriers: false,
      revision: 1
    }
  };
}

export function roomArmyImage(army: RoomArmy): SceneItemRecord {
  return {
    id: army.id,
    type: "IMAGE",
    name: army.name,
    position: { ...army.position },
    visible: false,
    metadata: {}
  };
}

export function addLeader(sideId: string, playerId: string): ArmyCommandPayload {
  return { type: "ADD_SIDE_LEADER", sideId, playerId };
}

export function addMember(sideId: string, playerId: string): ArmyCommandPayload {
  return { type: "ADD_SIDE_PLAYER", sideId, playerId };
}

export function registerArmy(itemId: string, sideId: string): ArmyCommandPayload {
  return { type: "REGISTER_ARMY", itemId, sideId };
}

export function setRoute(armyId: string, route: readonly Vector2[]): ArmyCommandPayload {
  return {
    type: "SET_ROUTE",
    armyId,
    route: route.map((point) => ({ ...point })),
    startCell: { x: 0, y: 0 },
    cells: route.map((_point, index) => ({ x: index + 1, y: 0 }))
  };
}

export function startArmy(armyId: string): ArmyCommandPayload {
  return { type: "START_ARMY", armyId };
}

class MemoryRouteOverlayPort implements RouteOverlayPort {
  private items: SceneItemRecord[] = [];
  private nextId = 0;

  async getLocalItems(): Promise<SceneItemRecord[]> {
    return structuredClone(this.items);
  }

  async addLocalItems(items: readonly SceneItemRecord[]): Promise<void> {
    this.items.push(...structuredClone(items));
  }

  async updateLocalItems(items: readonly SceneItemRecord[]): Promise<void> {
    for (const update of items) {
      const index = this.items.findIndex((item) => item.id === update.id);
      if (index >= 0) this.items[index] = structuredClone(update);
    }
  }

  async deleteLocalItems(ids: readonly string[]): Promise<void> {
    this.items = this.items.filter((item) => !ids.includes(item.id));
  }

  createId(): string {
    this.nextId += 1;
    return `route-overlay-${this.nextId}`;
  }

  routeIds(): string[] {
    const routeIds = new Set<string>();
    for (const item of this.items) {
      const metadata = item.metadata[METADATA_KEYS.routeOverlay];
      if (typeof metadata !== "object" || metadata === null) continue;
      const armyId = (metadata as Record<string, unknown>).armyId;
      if (typeof armyId === "string") routeIds.add(armyId);
    }
    return [...routeIds];
  }
}

type ClientRole = CommandContext["role"];

class WorkflowClient {
  private readonly overlayPort = new MemoryRouteOverlayPort();

  constructor(
    private readonly room: SideLeaderRoom,
    readonly playerId: string,
    readonly role: ClientRole
  ) {}

  send(command: ArmyCommandPayload): Promise<void> {
    return this.room.send(this, command);
  }

  routeIds(): Promise<string[]> {
    return this.room.routeIds(this, this.overlayPort);
  }
}

class SideLeaderRoom {
  readonly gm: WorkflowClient;
  readonly leader1: WorkflowClient;
  readonly leader2: WorkflowClient;
  readonly member: WorkflowClient;
  readonly other: WorkflowClient;

  private readonly processor = new CommandProcessor();
  private readonly connectedPlayerIds = new Set([
    "gm",
    "leader-1",
    "leader-2",
    "member",
    "other"
  ]);
  private requestNumber = 0;
  private state: CommandState = {
    scene: {
      version: 6,
      revision: 1,
      settings: { ...DEFAULT_SETTINGS },
      sides: [
        {
          id: "red",
          name: "Красные",
          color: "#f00",
          playerIds: [],
          leaderPlayerIds: [],
          stateId: null
        },
        {
          id: "blue",
          name: "Синие",
          color: "#00f",
          playerIds: ["other"],
          leaderPlayerIds: [],
          stateId: null
        }
      ],
      states: [],
      relations: {},
      battleGroups: [],
      terrain: structuredClone(DEFAULT_TERRAIN),
      gridMap: {
        version: 1,
        revision: 0,
        cells: {
          "1,0": { terrainId: null, impassable: false, factionTerritoryIds: ["red"], recognizedStateId: null, deFactoStateId: null }
        }
      },
      wars: [],
      turn: structuredClone(DEFAULT_TURN_STATE),
      ships: {},
      navalBattleRequests: [],
      activeNavalBattle: null,
      navalBattleHistory: [],
      navalRevealUntilTurn: {}
    },
    armies: {},
    barriers: {},
    items: {
      "red-token": {
        id: "red-token",
        type: "IMAGE",
        name: "Красная армия",
        position: { x: 0, y: 0 },
        metadata: {}
      }
    }
  };

  constructor() {
    this.gm = new WorkflowClient(this, "gm", "GM");
    this.leader1 = new WorkflowClient(this, "leader-1", "PLAYER");
    this.leader2 = new WorkflowClient(this, "leader-2", "PLAYER");
    this.member = new WorkflowClient(this, "member", "PLAYER");
    this.other = new WorkflowClient(this, "other", "PLAYER");
  }

  async send(client: WorkflowClient, payload: ArmyCommandPayload): Promise<void> {
    this.requestNumber += 1;
    const connectionId = `${client.playerId}-connection`;
    const command: ArmyCommand = {
      ...payload,
      protocolVersion: 4,
      requestId: `request-${this.requestNumber}`,
      senderPlayerId: client.playerId,
      senderConnectionId: connectionId,
      expectedRevision: this.state.scene.revision
    };
    const result = this.processor.process({
      role: client.role,
      playerId: client.playerId,
      connectionId,
      connectedPlayerIds: this.connectedPlayerIds,
      state: this.state
    }, command);
    if (result.status === "ACCEPTED") this.state = result.state;
  }

  async routeIds(client: WorkflowClient, port: RouteOverlayPort): Promise<string[]> {
    const service = new RouteOverlayService(port);
    await service.sync(
      Object.entries(this.state.armies).map(([id, army]) => ({ id, army })),
      this.state.scene.sides,
      client.role,
      client.playerId
    );
    return (port as MemoryRouteOverlayPort).routeIds();
  }
}

export function createSideLeaderRoom(): SideLeaderRoom {
  return new SideLeaderRoom();
}
