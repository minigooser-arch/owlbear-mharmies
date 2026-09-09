import { expect, it } from "vitest";
import { CommandGateway } from "../commands/commandGateway";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type ItemUpdate, type NavalSceneState, type SceneItemRecord } from "../shared/types";
import type { OwlbearPort } from "../owlbear/sdkAdapter";
import { ProductionEngine } from "./application";

it("persists a heading-aware ship route and resolves it when movement phase ends", async () => {
  const terrain = structuredClone(DEFAULT_TERRAIN);
  terrain.types.sea = {
    id: "sea",
    name: "Море",
    movementCostUnits: 2,
    enabled: true,
    movementDomains: ["SEA"],
    blocksNavalLos: false
  };
  terrain.defaultTerrainId = "sea";
  const ship = createRegisteredShip("red", "IRONCLAD", "SOUTH");
  let scene: NavalSceneState = {
    version: 6,
    revision: 2,
    settings: { ...DEFAULT_SETTINGS },
    sides: [{
      id: "red",
      name: "Красные",
      color: "#c62828",
      playerIds: [],
      leaderPlayerIds: [],
      stateId: null
    }],
    states: [],
    relations: {},
    battleGroups: [],
    terrain,
    gridMap: {
      version: 1,
      revision: 1,
      cells: {
        "0,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "1,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "2,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }
      }
    },
    wars: [],
    turn: { ...DEFAULT_TURN_STATE, phase: "MOVEMENT" },
    ships: { ship },
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {},
    coordinatorLease: { connectionId: "gm-connection", epoch: 1, expiresAt: Date.now() + 60_000 }
  };
  const items: SceneItemRecord[] = [{
    id: "ship",
    type: "IMAGE",
    name: "Петропавловск",
    position: { x: 50, y: 50 },
    rotation: 180,
    visible: false,
    metadata: { [METADATA_KEYS.ship]: structuredClone(ship) }
  }];
  const sent: Array<{ channel: string; data: unknown }> = [];

  const port = {
    getSceneMetadata: async () => ({ [METADATA_KEYS.scene]: structuredClone(scene) }),
    patchSceneMetadata: async (update: Record<string, unknown>) => {
      const next = update[METADATA_KEYS.scene];
      if (next) scene = structuredClone(next) as NavalSceneState;
    },
    getSceneItems: async () => structuredClone(items),
    patchSceneItemMetadata: async (
      id: string,
      key: string,
      value: unknown,
      update: Record<string, unknown> = {}
    ) => {
      const item = items.find((candidate) => candidate.id === id);
      if (!item) throw new Error(`Missing item ${id}`);
      Object.assign(item, structuredClone(update));
      item.metadata[key] = structuredClone(value);
    },
    getGridDpi: async () => 100,
    getGridDistance: async () => 0,
    snapGridCenter: async (position: { x: number; y: number }) => ({ ...position }),
    getLocalItems: async () => [],
    addLocalItem: async () => undefined,
    updateLocalItem: async () => undefined,
    deleteLocalItems: async () => undefined,
    createClone: () => { throw new Error("not used"); },
    send: async (channel: string, data: unknown) => { sent.push({ channel, data }); },
    on: () => () => undefined,
    onGridChange: () => () => undefined,
    show: async () => undefined,
    getRole: async () => "GM" as const,
    getItem: async () => undefined,
    getSceneState: async () => scene,
    updateItem: async (id: string, update: ItemUpdate) => {
      const item = items.find((candidate) => candidate.id === id);
      if (!item) throw new Error(`Missing item ${id}`);
      Object.assign(item, structuredClone(update));
    },
    deleteLocalItemsForSource: async () => undefined
  } as unknown as OwlbearPort;

  const engine = new ProductionEngine(port);
  engine.setCoordinator(true, "gm-connection");
  const context = {
    role: "GM" as const,
    playerId: "gm",
    connectionId: "gm-connection",
    connectedPlayerIds: new Set(["gm"])
  };

  await engine.processCommand({
    connectionId: "gm-connection",
    data: {
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: "set-ship-route",
      senderPlayerId: "gm",
      senderConnectionId: "gm-connection",
      expectedRevision: 2,
      type: "SET_SHIP_ROUTE",
      shipId: "ship",
      startCell: { x: 0, y: 0 },
      cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }]
    }
  }, context);

  expect(sent.at(-1)).toMatchObject({
    channel: CommandGateway.ACK_CHANNEL,
    data: { requestId: "set-ship-route", status: "ACCEPTED" }
  });
  expect(scene.ships.ship).toMatchObject({
    facing: "SOUTH",
    plannedRoute: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
    globalMovementRemaining: 1,
    movementSpentThisTurn: true,
    revision: 2
  });
  expect(items[0]?.metadata[METADATA_KEYS.ship]).toMatchObject({
    plannedRoute: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
    globalMovementRemaining: 1,
    revision: 2
  });

  await engine.processCommand({
    connectionId: "gm-connection",
    data: {
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: "complete-movement",
      senderPlayerId: "gm",
      senderConnectionId: "gm-connection",
      expectedRevision: 3,
      type: "COMPLETE_MOVEMENT_PHASE"
    }
  }, context);

  expect(sent.at(-1)).toMatchObject({
    channel: CommandGateway.ACK_CHANNEL,
    data: { requestId: "complete-movement", status: "ACCEPTED" }
  });
  expect(scene.turn.phase).toBe("POST_MOVEMENT");
  expect(scene.ships.ship).toMatchObject({
    facing: "EAST",
    plannedRoute: [],
    globalMovementRemaining: 1,
    movementSpentThisTurn: true,
    revision: 3
  });
  expect(items[0]?.position).toEqual({ x: 250, y: 50 });
  expect(items[0]?.metadata[METADATA_KEYS.ship]).toMatchObject({
    facing: "EAST",
    plannedRoute: [],
    globalMovementRemaining: 1,
    revision: 3
  });
});
