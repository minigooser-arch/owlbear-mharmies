import {
  CommandProcessor,
  type CommandContext,
  type CommandState
} from "../../commands/commandProcessor";
import {
  RouteOverlayService,
  type RouteOverlayPort
} from "../../routes/routeOverlayService";
import { DEFAULT_SETTINGS, METADATA_KEYS } from "../../shared/constants";
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
      version: 1,
      registered: true,
      sideId,
      status: "READY",
      overrides: {},
      route: [],
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
  return { type: "SET_ROUTE", armyId, route: route.map((point) => ({ ...point })) };
}

export function startArmy(armyId: string): ArmyCommandPayload {
  return { type: "START_ARMY", armyId };
}

class MemoryRouteOverlayPort implements RouteOverlayPort {
  private items: SceneItemRecord[] = [];
  private nextId = 0;

  async getItems(): Promise<SceneItemRecord[]> {
    return structuredClone(this.items);
  }

  async addItems(items: SceneItemRecord[]): Promise<void> {
    this.items.push(...structuredClone(items));
  }

  async deleteItems(ids: readonly string[]): Promise<void> {
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
      version: 2,
      revision: 1,
      settings: { ...DEFAULT_SETTINGS },
      sides: [
        {
          id: "red",
          name: "Красные",
          color: "#f00",
          playerIds: [],
          leaderPlayerIds: []
        },
        {
          id: "blue",
          name: "Синие",
          color: "#00f",
          playerIds: ["other"],
          leaderPlayerIds: []
        }
      ],
      relations: {},
      battleGroups: []
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
    const command = {
      ...payload,
      requestId: `request-${this.requestNumber}`,
      senderPlayerId: client.playerId,
      senderConnectionId: connectionId,
      expectedRevision: this.state.scene.revision
    } as ArmyCommand;
    const result = this.processor.execute(
      {
        role: client.role,
        playerId: client.playerId,
        connectionId,
        connectedPlayerIds: this.connectedPlayerIds,
        state: this.state
      },
      command
    );
    if (result.status !== "ACCEPTED") {
      const detail = result.status === "REJECTED" ? result.reason : result.actualRevision;
      throw new Error(`${command.type} ${result.status}: ${detail}`);
    }
    this.state = result.state;
  }

  async routeIds(client: WorkflowClient, port: MemoryRouteOverlayPort): Promise<string[]> {
    const memberSideIds = this.state.scene.sides
      .filter((side) => side.playerIds.includes(client.playerId))
      .map((side) => side.id);
    const leaderSideIds = this.state.scene.sides
      .filter((side) => side.leaderPlayerIds.includes(client.playerId))
      .map((side) => side.id);
    const sideColors = new Map(this.state.scene.sides.map((side) => [side.id, side.color]));

    await new RouteOverlayService(port).reconcile(
      Object.entries(this.state.armies).map(([armyId, army]) => ({
        armyId,
        sideId: army.sideId,
        status: army.status,
        color: sideColors.get(army.sideId) ?? "#000",
        start: { ...(this.state.items[armyId]?.position ?? { x: 0, y: 0 }) },
        waypoints: army.route.map((point) => ({ ...point }))
      })),
      {
        isGM: client.role === "GM",
        memberSideIds,
        leaderSideIds
      }
    );
    return port.routeIds();
  }
}

export function fourClientRoom(): SideLeaderRoom {
  return new SideLeaderRoom();
}
