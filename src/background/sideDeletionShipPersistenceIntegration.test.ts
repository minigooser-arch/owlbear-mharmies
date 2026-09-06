import { expect, it } from "vitest";
import { CommandGateway } from "../commands/commandGateway";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import {
  COMMAND_PROTOCOL_VERSION,
  type NavalBattleState,
  type NavalSceneState,
  type SceneItemRecord,
  type ShipState
} from "../shared/types";
import type { OwlbearPort } from "../owlbear/sdkAdapter";
import { ProductionEngine } from "./application";

it("deleting a side clears its ship metadata, restores the source, and persists the remaining naval activation", async () => {
  const first: ShipState = {
    ...createRegisteredShip("red", "BATTLESHIP", "NORTH"),
    status: "IN_NAVAL_BATTLE",
    battleId: "naval-1"
  };
  const second: ShipState = {
    ...createRegisteredShip("blue", "CRUISER", "EAST"),
    status: "IN_NAVAL_BATTLE",
    battleId: "naval-1"
  };
  const battle: NavalBattleState = {
    version: 1,
    id: "naval-1",
    requestId: "request-1",
    initiatorSideId: "red",
    areaCells: [],
    participantShipIds: ["first", "second"],
    snapshots: {
      first: { shipId: "first", strategicCell: { x: 0, y: 0 }, strategicPosition: { x: 50, y: 50 }, strategicFacing: "NORTH" },
      second: { shipId: "second", strategicCell: { x: 1, y: 0 }, strategicPosition: { x: 150, y: 50 }, strategicFacing: "EAST" }
    },
    initiative: [
      { shipId: "first", initialRoll: 18, bonus: 2, total: 20, tieBreakRolls: [] },
      { shipId: "second", initialRoll: 14, bonus: 0, total: 14, tieBreakRolls: [] }
    ],
    roundNumber: 1,
    currentShipId: "first",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { first: 2, second: 3 },
    actionUsedByShip: { first: false, second: false },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 2,
    startedAt: 1,
    revision: 1
  };

  let scene: NavalSceneState = {
    version: 6,
    revision: 2,
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
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 2, phase: "POST_MOVEMENT" },
    ships: { first, second },
    navalBattleRequests: [
      { id: "request-1", initiatingShipId: "first", targetShipId: "second", createdOnTurn: 2 }
    ],
    activeNavalBattle: battle,
    navalBattleHistory: [],
    navalRevealUntilTurn: { blue: { first: 3 } },
    coordinatorLease: { connectionId: "gm-connection", epoch: 1, expiresAt: Date.now() + 60_000 }
  };
  const items: SceneItemRecord[] = [
    {
      id: "first",
      type: "IMAGE",
      name: "Петропавловск",
      position: { x: 50, y: 50 },
      rotation: 0,
      visible: false,
      metadata: { [METADATA_KEYS.ship]: structuredClone(first) }
    },
    {
      id: "second",
      type: "IMAGE",
      name: "Аврора",
      position: { x: 150, y: 50 },
      rotation: 90,
      visible: false,
      metadata: { [METADATA_KEYS.ship]: structuredClone(second) }
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
    updateSceneItem: async () => undefined,
    patchSceneItemMetadata: async (
      id: string,
      key: string,
      value: unknown,
      update: Record<string, unknown> = {}
    ) => {
      const item = items.find((candidate) => candidate.id === id);
      if (!item) throw new Error(`Missing item ${id}`);
      Object.assign(item, structuredClone(update));
      if (value === undefined) {
        item.metadata = Object.fromEntries(
          Object.entries(item.metadata).filter(([metadataKey]) => metadataKey !== key)
        );
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

  const engine = new ProductionEngine(port);
  engine.setCoordinator(true, "gm-connection");
  await engine.processCommand({
    connectionId: "gm-connection",
    data: {
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: "delete-red",
      senderPlayerId: "gm",
      senderConnectionId: "gm-connection",
      expectedRevision: 2,
      type: "DELETE_SIDE",
      sideId: "red",
      strategy: "UNREGISTER_ARMIES"
    }
  }, {
    role: "GM",
    playerId: "gm",
    connectionId: "gm-connection",
    connectedPlayerIds: new Set(["gm"])
  });

  expect(sent.at(-1)).toMatchObject({
    channel: CommandGateway.ACK_CHANNEL,
    data: { requestId: "delete-red", status: "ACCEPTED" }
  });
  expect(scene.revision).toBe(3);
  expect(scene.sides.map((side) => side.id)).toEqual(["blue"]);
  expect(scene.ships.first).toBeUndefined();
  expect(scene.ships.second).toBeDefined();
  expect(scene.navalBattleRequests).toEqual([]);
  expect(scene.navalRevealUntilTurn.blue?.first).toBeUndefined();
  expect(scene.activeNavalBattle?.participantShipIds).toEqual(["second"]);
  expect(scene.activeNavalBattle?.initiative.map((entry) => entry.shipId)).toEqual(["second"]);
  expect(scene.activeNavalBattle?.currentShipId).toBe("second");
  const removedSource = items.find((item) => item.id === "first");
  expect(removedSource?.metadata[METADATA_KEYS.ship]).toBeUndefined();
  expect(removedSource?.visible).toBe(true);
  const remainingSource = items.find((item) => item.id === "second");
  expect(remainingSource?.metadata[METADATA_KEYS.ship]).toBeDefined();
  expect(remainingSource?.visible).toBe(false);
});
