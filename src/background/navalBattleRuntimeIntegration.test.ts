import { expect, it } from "vitest";
import { CommandGateway } from "../commands/commandGateway";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type NavalSceneState, type SceneItemRecord } from "../shared/types";
import type { OwlbearPort } from "../owlbear/sdkAdapter";
import { ProductionEngine } from "./application";

it("starts and persists a naval battle through ProductionEngine using real ship positions", async () => {
  const redShip = createRegisteredShip("red", "CRUISER", "EAST");
  const blueShip = createRegisteredShip("blue", "BATTLESHIP", "WEST");
  let scene: NavalSceneState = {
    version: 6,
    revision: 7,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      { id: "red", name: "Красные", color: "#c62828", playerIds: [], leaderPlayerIds: [], stateId: null },
      { id: "blue", name: "Синие", color: "#1565c0", playerIds: [], leaderPlayerIds: [], stateId: null }
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
    turn: { ...DEFAULT_TURN_STATE, turnNumber: 4, phase: "MOVEMENT" },
    ships: { redShip, blueShip },
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {},
    coordinatorLease: { connectionId: "gm-connection", epoch: 1, expiresAt: Date.now() + 60_000 }
  };
  const items: SceneItemRecord[] = [
    {
      id: "redShip",
      type: "IMAGE",
      name: "Красный крейсер",
      position: { x: 50, y: 50 },
      rotation: 90,
      visible: false,
      metadata: { [METADATA_KEYS.ship]: structuredClone(redShip) }
    },
    {
      id: "blueShip",
      type: "IMAGE",
      name: "Синий линкор",
      position: { x: 250, y: 50 },
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
    updateItem: async () => undefined,
    deleteLocalItemsForSource: async () => undefined
  } as unknown as OwlbearPort;

  const engine = new ProductionEngine(port);
  engine.setCoordinator(true, "gm-connection");
  await engine.processCommand({
    connectionId: "gm-connection",
    data: {
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: "start-naval-battle",
      senderPlayerId: "gm",
      senderConnectionId: "gm-connection",
      expectedRevision: 7,
      type: "START_NAVAL_BATTLE",
      battleId: "battle-1",
      navalRequestId: null,
      initiatingShipId: "redShip",
      participantShipIds: ["redShip", "blueShip"],
      areaCells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]
    }
  }, {
    role: "GM",
    playerId: "gm",
    connectionId: "gm-connection",
    connectedPlayerIds: new Set(["gm"])
  });

  expect(sent.at(-1)).toMatchObject({
    channel: CommandGateway.ACK_CHANNEL,
    data: { requestId: "start-naval-battle", status: "ACCEPTED" }
  });
  expect(scene.turn.phase).toBe("NAVAL_BATTLE");
  expect(scene.activeNavalBattle).toMatchObject({
    id: "battle-1",
    participantShipIds: ["redShip", "blueShip"],
    snapshots: {
      redShip: {
        strategicCell: { x: 0, y: 0 },
        strategicPosition: { x: 50, y: 50 },
        strategicFacing: "EAST"
      },
      blueShip: {
        strategicCell: { x: 2, y: 0 },
        strategicPosition: { x: 250, y: 50 },
        strategicFacing: "WEST"
      }
    }
  });
  expect(scene.ships.redShip).toMatchObject({ status: "IN_NAVAL_BATTLE", battleId: "battle-1" });
  expect(scene.ships.blueShip).toMatchObject({ status: "IN_NAVAL_BATTLE", battleId: "battle-1" });
  expect(items[0]?.metadata[METADATA_KEYS.ship]).toMatchObject({ status: "IN_NAVAL_BATTLE", battleId: "battle-1" });
  expect(items[1]?.metadata[METADATA_KEYS.ship]).toMatchObject({ status: "IN_NAVAL_BATTLE", battleId: "battle-1" });
});
