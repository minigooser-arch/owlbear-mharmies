import { expect, it } from "vitest";
import { CommandGateway } from "../commands/commandGateway";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import type { OwlbearPort } from "../owlbear/sdkAdapter";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import {
  COMMAND_PROTOCOL_VERSION,
  type NavalBattleState,
  type NavalSceneState,
  type SceneItemRecord,
  type ShipState
} from "../shared/types";
import { ProductionEngine } from "./application";

it("persists a GM-confirmed naval exit and advances the active ship without rewriting ShipState", async () => {
  const first: ShipState = {
    ...createRegisteredShip("red", "CRUISER", "EAST"),
    status: "IN_NAVAL_BATTLE",
    battleId: "naval-1"
  };
  const second: ShipState = {
    ...createRegisteredShip("blue", "BATTLESHIP", "WEST"),
    status: "IN_NAVAL_BATTLE",
    battleId: "naval-1"
  };
  const battle: NavalBattleState = {
    version: 1,
    id: "naval-1",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    participantShipIds: ["first", "second"],
    snapshots: {
      first: { shipId: "first", strategicCell: { x: 0, y: 0 }, strategicPosition: { x: 50, y: 50 }, strategicFacing: "EAST" },
      second: { shipId: "second", strategicCell: { x: 1, y: 0 }, strategicPosition: { x: 150, y: 50 }, strategicFacing: "WEST" }
    },
    initiative: [
      { shipId: "first", initialRoll: 18, bonus: 2, total: 20, tieBreakRolls: [] },
      { shipId: "second", initialRoll: 13, bonus: 0, total: 13, tieBreakRolls: [] }
    ],
    roundNumber: 1,
    currentShipId: "first",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { first: 3, second: 2 },
    actionUsedByShip: { first: false, second: false },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 4,
    startedAt: 1,
    revision: 1
  };
  let scene: NavalSceneState = {
    version: 6,
    revision: 6,
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
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 4, phase: "NAVAL_BATTLE" },
    ships: { first, second },
    navalBattleRequests: [],
    activeNavalBattle: battle,
    navalBattleHistory: [],
    navalRevealUntilTurn: {},
    coordinatorLease: { connectionId: "gm-connection", epoch: 1, expiresAt: Date.now() + 60_000 }
  };
  const items: SceneItemRecord[] = [
    { id: "first", type: "IMAGE", name: "Аврора", position: { x: 50, y: 50 }, rotation: 90, visible: false, metadata: { [METADATA_KEYS.ship]: structuredClone(first) } },
    { id: "second", type: "IMAGE", name: "Петропавловск", position: { x: 150, y: 50 }, rotation: 270, visible: false, metadata: { [METADATA_KEYS.ship]: structuredClone(second) } }
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
    patchSceneItemMetadata: async () => undefined,
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
      requestId: "confirm-exit",
      senderPlayerId: "gm",
      senderConnectionId: "gm-connection",
      expectedRevision: 6,
      type: "CONFIRM_NAVAL_SHIP_EXIT",
      shipId: "first"
    }
  }, {
    role: "GM",
    playerId: "gm",
    connectionId: "gm-connection",
    connectedPlayerIds: new Set(["gm"])
  });

  expect(sent.at(-1)).toMatchObject({
    channel: CommandGateway.ACK_CHANNEL,
    data: { requestId: "confirm-exit", status: "ACCEPTED" }
  });
  expect(scene.revision).toBe(7);
  expect(scene.activeNavalBattle?.exitedShipIds).toEqual(["first"]);
  expect(scene.activeNavalBattle?.completedShipIdsThisRound).toContain("first");
  expect(scene.activeNavalBattle?.currentShipId).toBe("second");
  expect(scene.ships.first).toEqual(first);
  expect(items[0]?.metadata[METADATA_KEYS.ship]).toEqual(first);
  expect(items[0]?.position).toEqual({ x: 50, y: 50 });
});
