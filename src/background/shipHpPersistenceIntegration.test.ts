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

it("persists zero hp and advances the active naval ship through ProductionEngine", async () => {
  const activeShip: ShipState = {
    ...createRegisteredShip("red", "BATTLESHIP", "NORTH"),
    status: "IN_NAVAL_BATTLE",
    battleId: "naval-1"
  };
  const escort: ShipState = {
    ...createRegisteredShip("red", "CRUISER", "EAST"),
    status: "IN_NAVAL_BATTLE",
    battleId: "naval-1"
  };
  const battle: NavalBattleState = {
    version: 1,
    id: "naval-1",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    participantShipIds: ["ship", "escort"],
    snapshots: {},
    initiative: [
      { shipId: "ship", initialRoll: 15, bonus: 2, total: 17, tieBreakRolls: [] },
      { shipId: "escort", initialRoll: 12, bonus: 0, total: 12, tieBreakRolls: [] }
    ],
    roundNumber: 1,
    currentShipId: "ship",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { ship: 2, escort: 3 },
    actionUsedByShip: { ship: false, escort: false },
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
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 2, phase: "NAVAL_BATTLE" },
    ships: { ship: activeShip, escort },
    navalBattleRequests: [],
    activeNavalBattle: battle,
    navalBattleHistory: [],
    navalRevealUntilTurn: {},
    coordinatorLease: { connectionId: "gm-connection", epoch: 1, expiresAt: Date.now() + 60_000 }
  };
  const items: SceneItemRecord[] = [
    {
      id: "ship",
      type: "IMAGE",
      name: "Петропавловск",
      position: { x: 50, y: 50 },
      rotation: 0,
      visible: false,
      metadata: { [METADATA_KEYS.ship]: structuredClone(activeShip) }
    },
    {
      id: "escort",
      type: "IMAGE",
      name: "Аврора",
      position: { x: 150, y: 50 },
      rotation: 90,
      visible: false,
      metadata: { [METADATA_KEYS.ship]: structuredClone(escort) }
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
      requestId: "destroy-active-ship",
      senderPlayerId: "gm",
      senderConnectionId: "gm-connection",
      expectedRevision: 2,
      type: "SET_SHIP_HP",
      shipId: "ship",
      hp: 0
    }
  }, {
    role: "GM",
    playerId: "gm",
    connectionId: "gm-connection",
    connectedPlayerIds: new Set(["gm"])
  });

  expect(sent.at(-1)).toMatchObject({
    channel: CommandGateway.ACK_CHANNEL,
    data: { requestId: "destroy-active-ship", status: "ACCEPTED" }
  });
  expect(scene.revision).toBe(3);
  expect(scene.ships.ship?.hp).toBe(0);
  expect(scene.activeNavalBattle?.currentShipId).toBe("escort");
  expect(scene.activeNavalBattle?.completedShipIdsThisRound).toContain("ship");
  expect(items.find((item) => item.id === "ship")?.metadata[METADATA_KEYS.ship]).toMatchObject({
    hp: 0,
    status: "IN_NAVAL_BATTLE",
    battleId: "naval-1"
  });
});
