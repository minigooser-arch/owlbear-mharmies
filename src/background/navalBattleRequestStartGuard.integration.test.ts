import { expect, it } from "vitest";
import { CommandGateway } from "../commands/commandGateway";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import type { OwlbearPort } from "../owlbear/sdkAdapter";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type NavalSceneState, type SceneItemRecord } from "../shared/types";
import { ProductionEngine } from "./application";

function fixture(gridDistance: number) {
  const redShip = createRegisteredShip("red", "CRUISER", "EAST");
  const blueShip = createRegisteredShip("blue", "BATTLESHIP", "WEST");
  let scene: NavalSceneState = {
    version: 6,
    revision: 9,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      { id: "red", name: "Красные", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: null },
      { id: "blue", name: "Синие", color: "#00f", playerIds: [], leaderPlayerIds: [], stateId: null }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: {
      ...structuredClone(DEFAULT_TERRAIN),
      defaultTerrainId: "sea"
    },
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 3, phase: "POST_MOVEMENT" },
    ships: { red: redShip, blue: blueShip },
    navalBattleRequests: [{ id: "req", initiatingShipId: "red", targetShipId: "blue", createdOnTurn: 3 }],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {},
    coordinatorLease: { connectionId: "gm-connection", epoch: 1, expiresAt: Date.now() + 60_000 }
  };
  const items: SceneItemRecord[] = [
    { id: "red", type: "IMAGE", name: "Аврора", position: { x: 50, y: 50 }, metadata: { [METADATA_KEYS.ship]: structuredClone(redShip) } },
    { id: "blue", type: "IMAGE", name: "Слава", position: { x: 150, y: 50 }, metadata: { [METADATA_KEYS.ship]: structuredClone(blueShip) } }
  ];
  const sent: Array<{ channel: string; data: unknown }> = [];
  const port = {
    getSceneMetadata: async () => ({ [METADATA_KEYS.scene]: structuredClone(scene) }),
    patchSceneMetadata: async (update: Record<string, unknown>) => {
      if (update[METADATA_KEYS.scene]) scene = structuredClone(update[METADATA_KEYS.scene]) as NavalSceneState;
    },
    getSceneItems: async () => structuredClone(items),
    updateSceneItem: async () => undefined,
    patchSceneItemMetadata: async () => undefined,
    getLocalItems: async () => [],
    addLocalItem: async () => undefined,
    updateLocalItem: async () => undefined,
    deleteLocalItems: async () => undefined,
    createClone: () => { throw new Error("not used"); },
    getGridDistance: async () => gridDistance,
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
  return { port, sent, get scene() { return scene; } };
}

function startData(participantShipIds: string[]) {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: "start",
    senderPlayerId: "gm",
    senderConnectionId: "gm-connection",
    expectedRevision: 9,
    type: "START_NAVAL_BATTLE" as const,
    battleId: "battle",
    navalRequestId: "req",
    initiatingShipId: "red",
    participantShipIds,
    areaCells: [{ x: 0, y: 0 }, { x: 1, y: 0 }]
  };
}

async function run(fixtureValue: ReturnType<typeof fixture>, participantShipIds: string[]) {
  const engine = new ProductionEngine(fixtureValue.port);
  engine.setCoordinator(true, "gm-connection");
  await engine.processCommand({ connectionId: "gm-connection", data: startData(participantShipIds) }, {
    role: "GM",
    playerId: "gm",
    connectionId: "gm-connection",
    connectedPlayerIds: new Set(["gm"])
  });
}

it("rejects a saved naval request after the initiating side loses detection", async () => {
  const value = fixture(100);
  await run(value, ["red", "blue"]);

  expect(value.sent.at(-1)).toMatchObject({
    channel: CommandGateway.ACK_CHANNEL,
    data: { requestId: "start", status: "REJECTED", reason: "TARGET_NOT_DETECTED" }
  });
  expect(value.scene.activeNavalBattle).toBeNull();
  expect(value.scene.revision).toBe(9);
});

it("rejects a request-backed start that omits the saved target ship", async () => {
  const value = fixture(0);
  await run(value, ["red"]);

  expect(value.sent.at(-1)).toMatchObject({
    channel: CommandGateway.ACK_CHANNEL,
    data: { requestId: "start", status: "REJECTED", reason: "INVALID_NAVAL_BATTLE_REQUEST" }
  });
  expect(value.scene.activeNavalBattle).toBeNull();
  expect(value.scene.revision).toBe(9);
});
