import { expect, it } from "vitest";
import { CommandGateway } from "../commands/commandGateway";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type NavalSceneState, type SceneItemRecord } from "../shared/types";
import type { OwlbearPort } from "../owlbear/sdkAdapter";
import { ProductionEngine } from "./application";

it("persists setting and resetting a ship detection override through ProductionEngine", async () => {
  const ship = createRegisteredShip("red", "CRUISER", "NORTH");
  let scene: NavalSceneState = {
    version: 6,
    revision: 2,
    settings: { ...DEFAULT_SETTINGS, defaultDetectionRangeCells: 6 },
    sides: [{ id: "red", name: "Красные", color: "#c62828", playerIds: [], leaderPlayerIds: [], stateId: null }],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: structuredClone(DEFAULT_TURN_STATE),
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
    name: "Аврора",
    position: { x: 50, y: 50 },
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
      requestId: "set-detection",
      senderPlayerId: "gm",
      senderConnectionId: "gm-connection",
      expectedRevision: 2,
      type: "SET_SHIP_DETECTION_OVERRIDE",
      shipId: "ship",
      detectionOverride: 4.5
    }
  }, context);

  expect(sent.at(-1)).toMatchObject({
    channel: CommandGateway.ACK_CHANNEL,
    data: { requestId: "set-detection", status: "ACCEPTED" }
  });
  expect(scene.revision).toBe(3);
  expect(scene.ships.ship?.detectionOverride).toBe(4.5);
  expect(items[0]?.metadata[METADATA_KEYS.ship]).toMatchObject({ detectionOverride: 4.5, revision: 2 });

  await engine.processCommand({
    connectionId: "gm-connection",
    data: {
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: "reset-detection",
      senderPlayerId: "gm",
      senderConnectionId: "gm-connection",
      expectedRevision: 3,
      type: "SET_SHIP_DETECTION_OVERRIDE",
      shipId: "ship",
      detectionOverride: null
    }
  }, context);

  expect(sent.at(-1)).toMatchObject({
    channel: CommandGateway.ACK_CHANNEL,
    data: { requestId: "reset-detection", status: "ACCEPTED" }
  });
  expect(scene.revision).toBe(4);
  expect(scene.ships.ship?.detectionOverride).toBeNull();
  expect(items[0]?.metadata[METADATA_KEYS.ship]).toMatchObject({ detectionOverride: null, revision: 3 });
});
