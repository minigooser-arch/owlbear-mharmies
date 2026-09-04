import { expect, it } from "vitest";
import { CommandGateway } from "../commands/commandGateway";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import type { OwlbearPort } from "../owlbear/sdkAdapter";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import {
  COMMAND_PROTOCOL_VERSION,
  type NavalSceneState,
  type SceneItemRecord,
  type ShipState
} from "../shared/types";
import { ProductionEngine } from "./application";

it("starts and persists a naval battle from authoritative Owlbear ship positions", async () => {
  const redShip: ShipState = createRegisteredShip("red", "CRUISER", "EAST");
  const blueShip: ShipState = createRegisteredShip("blue", "BATTLESHIP", "WEST");
  let scene: NavalSceneState = {
    version: 6,
    revision: 9,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      { id: "red", name: "Красные", color: "#c62828", playerIds: [], leaderPlayerIds: [], stateId: null },
      { id: "blue", name: "Синие", color: "#1565c0", playerIds: [], leaderPlayerIds: [], stateId: null }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 3, phase: "MOVEMENT" },
    ships: { "red-ship": redShip, "blue-ship": blueShip },
    navalBattleRequests: [{ id: "req-1", initiatingShipId: "red-ship", targetShipId: "blue-ship", createdOnTurn: 3 }],
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
      position: { x: 150, y: 50 },
      rotation: 270,
      visible: false,
      metadata: { [METADATA_KEYS.ship]: structuredClone(blueShip) }
    }
  ];
  const originalPositions = Object.fromEntries(items.map((item) => [item.id, structuredClone(item.position)]));
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
    getGridDistance: async () => 0,
    getGridDpi: async () => 100,
    snapGridCenter: async (position: { x: number; y: number }) => ({ ...position }),
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
  await engine.processCommand({
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
    connectedPlayerIds: new Set(["gm"])
  });

  expect(sent.at(-1)).toMatchObject({
    channel: CommandGateway.ACK_CHANNEL,
    data: { requestId: "start-naval", status: "ACCEPTED" }
  });
  expect(scene.revision).toBe(10);
  expect(scene.turn.phase).toBe("NAVAL_BATTLE");
  expect(scene.navalBattleRequests).toEqual([]);
  expect(scene.activeNavalBattle).toMatchObject({
    id: "naval-1",
    requestId: "req-1",
    participantShipIds: ["red-ship", "blue-ship"],
    snapshots: {
      "red-ship": {
        shipId: "red-ship",
        strategicCell: { x: 0, y: 0 },
        strategicPosition: { x: 50, y: 50 },
        strategicFacing: "EAST"
      },
      "blue-ship": {
        shipId: "blue-ship",
        strategicCell: { x: 1, y: 0 },
        strategicPosition: { x: 150, y: 50 },
        strategicFacing: "WEST"
      }
    }
  });
  expect(scene.ships["red-ship"]).toMatchObject({ status: "IN_NAVAL_BATTLE", battleId: "naval-1" });
  expect(scene.ships["blue-ship"]).toMatchObject({ status: "IN_NAVAL_BATTLE", battleId: "naval-1" });
  expect(items.find((item) => item.id === "red-ship")).toMatchObject({
    position: originalPositions["red-ship"],
    visible: false,
    metadata: { [METADATA_KEYS.ship]: { status: "IN_NAVAL_BATTLE", battleId: "naval-1" } }
  });
  expect(items.find((item) => item.id === "blue-ship")).toMatchObject({
    position: originalPositions["blue-ship"],
    visible: false,
    metadata: { [METADATA_KEYS.ship]: { status: "IN_NAVAL_BATTLE", battleId: "naval-1" } }
  });
});
