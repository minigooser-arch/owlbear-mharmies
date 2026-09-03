import { expect, it } from "vitest";
import { CommandGateway } from "../commands/commandGateway";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type NavalSceneState, type SceneItemRecord } from "../shared/types";
import type { OwlbearPort } from "../owlbear/sdkAdapter";
import { ProductionEngine } from "./application";

function fixture() {
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
        "0,0": {
          terrainId: "sea",
          impassable: false,
          factionTerritoryIds: [],
          recognizedStateId: null,
          deFactoStateId: null
        }
      }
    },
    wars: [],
    turn: { ...DEFAULT_TURN_STATE, phase: "MOVEMENT" },
    ships: {},
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {},
    coordinatorLease: { connectionId: "gm-connection", epoch: 1, expiresAt: Date.now() + 60_000 }
  };

  const items: SceneItemRecord[] = [{
    id: "ship",
    type: "IMAGE",
    name: "Аврора",
    position: { x: 50, y: 50 },
    rotation: 0,
    visible: true,
    metadata: {}
  }];
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

  return { port, items, sent, get scene() { return scene; } };
}

it("persists REGISTER_SHIP to token metadata, facing rotation, and hidden source, then restores visibility on UNREGISTER_SHIP", async () => {
  const f = fixture();
  const engine = new ProductionEngine(f.port);
  engine.setCoordinator(true, "gm-connection");
  const sender = {
    role: "GM" as const,
    playerId: "gm",
    connectionId: "gm-connection",
    connectedPlayerIds: new Set(["gm"])
  };

  await engine.processCommand({
    connectionId: "gm-connection",
    data: {
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: "register-ship",
      senderPlayerId: "gm",
      senderConnectionId: "gm-connection",
      expectedRevision: 2,
      type: "REGISTER_SHIP",
      itemId: "ship",
      sideId: "red",
      classId: "CRUISER",
      facing: "EAST"
    }
  }, sender);

  expect(f.sent.at(-1)).toMatchObject({
    channel: CommandGateway.ACK_CHANNEL,
    data: { requestId: "register-ship", status: "ACCEPTED" }
  });
  expect(f.scene.ships.ship).toMatchObject({ sideId: "red", classId: "CRUISER", facing: "EAST" });
  expect(f.items[0]).toMatchObject({
    visible: false,
    rotation: 90,
    metadata: { [METADATA_KEYS.ship]: { sideId: "red", classId: "CRUISER", facing: "EAST" } }
  });

  await engine.processCommand({
    connectionId: "gm-connection",
    data: {
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: "unregister-ship",
      senderPlayerId: "gm",
      senderConnectionId: "gm-connection",
      expectedRevision: 3,
      type: "UNREGISTER_SHIP",
      shipId: "ship"
    }
  }, sender);

  expect(f.sent.at(-1)).toMatchObject({
    channel: CommandGateway.ACK_CHANNEL,
    data: { requestId: "unregister-ship", status: "ACCEPTED" }
  });
  expect(f.scene.ships.ship).toBeUndefined();
  expect(f.items[0]?.metadata[METADATA_KEYS.ship]).toBeUndefined();
  expect(f.items[0]?.visible).toBe(true);
});