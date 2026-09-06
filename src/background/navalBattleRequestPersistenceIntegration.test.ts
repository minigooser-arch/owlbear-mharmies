import { describe, expect, it } from "vitest";
import { CommandGateway } from "../commands/commandGateway";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import type { OwlbearPort } from "../owlbear/sdkAdapter";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import {
  COMMAND_PROTOCOL_VERSION,
  type NavalSceneState,
  type SceneItemRecord,
  type ShipState,
  type Vector2
} from "../shared/types";
import { ProductionEngine } from "./application";

interface Fixture {
  engine: ProductionEngine;
  readScene(): NavalSceneState;
  sent: Array<{ channel: string; data: unknown }>;
}

function distanceInCells(from: Vector2, to: Vector2): number {
  return Math.hypot(to.x - from.x, to.y - from.y) / 100;
}

function fixture(options: { blueX: number; withPendingRequest?: boolean }): Fixture {
  const redShip: ShipState = createRegisteredShip("red", "CRUISER", "EAST");
  const blueShip: ShipState = createRegisteredShip("blue", "BATTLESHIP", "WEST");
  let scene: NavalSceneState = {
    version: 6,
    revision: 9,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      {
        id: "red",
        name: "Красные",
        color: "#c62828",
        playerIds: ["red-leader"],
        leaderPlayerIds: ["red-leader"],
        stateId: null
      },
      {
        id: "blue",
        name: "Синие",
        color: "#1565c0",
        playerIds: ["blue-leader"],
        leaderPlayerIds: ["blue-leader"],
        stateId: null
      }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: {
      ...structuredClone(DEFAULT_TERRAIN),
      defaultTerrainId: "sea",
      types: {
        ...structuredClone(DEFAULT_TERRAIN.types),
        sea: {
          id: "sea",
          name: "Море",
          movementCostUnits: 1,
          enabled: true,
          movementDomains: ["SEA"],
          blocksNavalLos: false
        }
      }
    },
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 3, phase: "POST_MOVEMENT" },
    ships: { "red-ship": redShip, "blue-ship": blueShip },
    navalBattleRequests: options.withPendingRequest
      ? [{ id: "req-1", initiatingShipId: "red-ship", targetShipId: "blue-ship", createdOnTurn: 3 }]
      : [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {},
    coordinatorLease: { connectionId: "gm-connection", epoch: 1, expiresAt: Date.now() + 60_000 }
  };
  const items: SceneItemRecord[] = [
    {
      id: "red-ship",
      type: "IMAGE",
      name: "Красный крейсер",
      position: { x: 50, y: 50 },
      rotation: 90,
      visible: false,
      metadata: { [METADATA_KEYS.ship]: structuredClone(redShip) }
    },
    {
      id: "blue-ship",
      type: "IMAGE",
      name: "Синий линкор",
      position: { x: options.blueX, y: 50 },
      rotation: 270,
      visible: false,
      metadata: { [METADATA_KEYS.ship]: structuredClone(blueShip) }
    }
  ];
  const sent: Array<{ channel: string; data: unknown }> = [];
  const port = {
    getSceneMetadata: async () => ({ [METADATA_KEYS.scene]: structuredClone(scene) }),
    patchSceneMetadata: async (update: Record<string, unknown>) => {
      const next = update[METADATA_KEYS.scene];
      if (next) scene = structuredClone(next) as NavalSceneState;
    },
    getSceneItems: async () => structuredClone(items),
    updateSceneItem: async (id: string, update: Record<string, unknown>) => {
      const item = items.find((candidate) => candidate.id === id);
      if (!item) throw new Error(`Missing item ${id}`);
      Object.assign(item, structuredClone(update));
    },
    patchSceneItemMetadata: async (id: string, key: string, value: unknown, update: Record<string, unknown> = {}) => {
      const item = items.find((candidate) => candidate.id === id);
      if (!item) throw new Error(`Missing item ${id}`);
      Object.assign(item, structuredClone(update));
      if (value === undefined) {
        item.metadata = Object.fromEntries(Object.entries(item.metadata).filter(([metadataKey]) => metadataKey !== key));
      } else {
        item.metadata[key] = structuredClone(value);
      }
    },
    getLocalItems: async () => [],
    addLocalItem: async () => undefined,
    updateLocalItem: async () => undefined,
    deleteLocalItems: async () => undefined,
    createClone: () => { throw new Error("not used"); },
    getGridDistance: async (from: Vector2, to: Vector2) => distanceInCells(from, to),
    getGridDpi: async () => 100,
    snapGridCenter: async (position: Vector2) => ({ ...position }),
    send: async (channel: string, data: unknown) => { sent.push({ channel, data }); },
    on: () => () => undefined,
    show: async () => undefined,
    getRole: async () => "GM" as const,
    getItem: async () => undefined,
    getSceneState: async () => scene,
    updateItem: async () => undefined,
    deleteLocalItemsForSource: async () => undefined,
    onGridChange: () => () => undefined
  } as unknown as OwlbearPort;

  const engine = new ProductionEngine(port, () => new Date("2026-09-04T09:00:00.000Z"));
  engine.setCoordinator(true, "gm-connection");
  return { engine, readScene: () => structuredClone(scene), sent };
}

function requestEvent(expectedRevision = 9) {
  return {
    connectionId: "red-connection",
    data: {
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: "req-command",
      senderPlayerId: "red-leader",
      senderConnectionId: "red-connection",
      expectedRevision,
      type: "REQUEST_NAVAL_BATTLE",
      initiatingShipId: "red-ship",
      targetShipId: "blue-ship"
    }
  };
}

function redLeaderSender() {
  return {
    role: "PLAYER" as const,
    playerId: "red-leader",
    connectionId: "red-connection",
    connectedPlayerIds: new Set(["red-leader", "blue-leader", "gm"])
  };
}

describe("authoritative naval battle request persistence", () => {
  it("accepts and persists a leader request when the target is currently detected", async () => {
    const test = fixture({ blueX: 150 });

    await test.engine.processCommand(requestEvent(), redLeaderSender());

    expect(test.sent.at(-1)).toMatchObject({
      channel: CommandGateway.ACK_CHANNEL,
      data: { requestId: "req-command", status: "ACCEPTED" }
    });
    expect(test.readScene()).toMatchObject({
      revision: 10,
      activeNavalBattle: null,
      navalBattleRequests: [{
        id: "req-command",
        initiatingShipId: "red-ship",
        targetShipId: "blue-ship",
        createdOnTurn: 3
      }]
    });
  });

  it("rejects a leader request when the target is outside current detection", async () => {
    const test = fixture({ blueX: 850 });

    await test.engine.processCommand(requestEvent(), redLeaderSender());

    expect(test.sent.at(-1)).toMatchObject({
      channel: CommandGateway.ACK_CHANNEL,
      data: { requestId: "req-command", status: "REJECTED", reason: "TARGET_NOT_DETECTED" }
    });
    expect(test.readScene().navalBattleRequests).toEqual([]);
  });

  it("revalidates a stored request against live detection immediately before GM start", async () => {
    const test = fixture({ blueX: 850, withPendingRequest: true });

    await test.engine.processCommand({
      connectionId: "gm-connection",
      data: {
        protocolVersion: COMMAND_PROTOCOL_VERSION,
        requestId: "start-naval",
        senderPlayerId: "gm",
        senderConnectionId: "gm-connection",
        expectedRevision: 9,
        type: "START_NAVAL_BATTLE",
        battleId: "naval-1",
        navalRequestId: "req-1",
        initiatingShipId: "red-ship",
        participantShipIds: ["red-ship", "blue-ship"],
        areaCells: [{ x: 0, y: 0 }, { x: 1, y: 0 }]
      }
    }, {
      role: "GM",
      playerId: "gm",
      connectionId: "gm-connection",
      connectedPlayerIds: new Set(["red-leader", "blue-leader", "gm"])
    });

    expect(test.sent.at(-1)).toMatchObject({
      channel: CommandGateway.ACK_CHANNEL,
      data: { requestId: "start-naval", status: "REJECTED", reason: "TARGET_NOT_DETECTED" }
    });
    expect(test.readScene()).toMatchObject({
      revision: 9,
      activeNavalBattle: null,
      navalBattleRequests: [{ id: "req-1" }]
    });
  });
});
