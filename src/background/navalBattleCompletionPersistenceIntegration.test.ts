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

it("restores ship position and rotation when a GM completes an active naval battle", async () => {
  const ship: ShipState = {
    ...createRegisteredShip("red", "CRUISER", "NORTH"),
    status: "IN_NAVAL_BATTLE",
    battleId: "naval-1"
  };
  const battle: NavalBattleState = {
    version: 1,
    id: "naval-1",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    participantShipIds: ["ship"],
    snapshots: {
      ship: {
        shipId: "ship",
        strategicCell: { x: 0, y: 0 },
        strategicPosition: { x: 50, y: 50 },
        strategicFacing: "EAST"
      }
    },
    initiative: [{ shipId: "ship", initialRoll: 14, bonus: 2, total: 16, tieBreakRolls: [] }],
    roundNumber: 2,
    currentShipId: "ship",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { ship: 1 },
    actionUsedByShip: { ship: false },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 3,
    startedAt: 100,
    revision: 4
  };
  let scene: NavalSceneState = {
    version: 6,
    revision: 7,
    settings: { ...DEFAULT_SETTINGS },
    sides: [{ id: "red", name: "Красные", color: "#c62828", playerIds: [], leaderPlayerIds: [], stateId: null }],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 3, phase: "POST_MOVEMENT" },
    ships: { ship },
    navalBattleRequests: [],
    activeNavalBattle: battle,
    navalBattleHistory: [],
    navalRevealUntilTurn: {},
    coordinatorLease: { connectionId: "gm-connection", epoch: 1, expiresAt: Date.now() + 60_000 }
  };
  const items: SceneItemRecord[] = [{
    id: "ship",
    type: "IMAGE",
    name: "Аврора",
    position: { x: 150, y: 50 },
    rotation: 0,
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

  const engine = new ProductionEngine(port);
  engine.setCoordinator(true, "gm-connection");
  await engine.processCommand({
    connectionId: "gm-connection",
    data: {
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: "complete-naval",
      senderPlayerId: "gm",
      senderConnectionId: "gm-connection",
      expectedRevision: 7,
      type: "COMPLETE_NAVAL_BATTLE"
    }
  }, {
    role: "GM",
    playerId: "gm",
    connectionId: "gm-connection",
    connectedPlayerIds: new Set(["gm"])
  });

  expect(sent.at(-1)).toMatchObject({
    channel: CommandGateway.ACK_CHANNEL,
    data: { requestId: "complete-naval", status: "ACCEPTED" }
  });
  expect(scene.revision).toBe(8);
  expect(scene.turn.phase).toBe("POST_MOVEMENT");
  expect(scene.activeNavalBattle).toBeNull();
  expect(scene.navalBattleHistory).toHaveLength(1);
  expect(scene.ships.ship).toMatchObject({ status: "READY", battleId: null, facing: "EAST" });
  expect(items[0]).toMatchObject({
    position: { x: 50, y: 50 },
    rotation: 90,
    visible: false,
    metadata: {
      [METADATA_KEYS.ship]: { status: "READY", battleId: null, facing: "EAST" }
    }
  });
});
