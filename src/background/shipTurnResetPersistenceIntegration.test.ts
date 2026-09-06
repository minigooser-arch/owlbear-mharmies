import { expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { SHIP_CLASSES } from "../naval/ships/shipClasses";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import type { NavalSceneState, SceneItemRecord, ShipState } from "../shared/types";
import type { OwlbearPort } from "../owlbear/sdkAdapter";
import { ProductionEngine } from "./application";

it("persists the scheduled ship movement reset to scene state and source token metadata", async () => {
  const spentShip: ShipState = {
    ...createRegisteredShip("red", "CRUISER", "EAST"),
    globalMovementRemaining: 0,
    movementSpentThisTurn: true,
    plannedRoute: [{ x: 1, y: 0 }]
  };
  let scene: NavalSceneState = {
    version: 6,
    revision: 2,
    settings: { ...DEFAULT_SETTINGS },
    sides: [{
      id: "red",
      name: "Красные",
      color: "#f00",
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
    turn: { ...structuredClone(DEFAULT_TURN_STATE), phase: "MOVEMENT" },
    ships: { ship: spentShip },
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {},
    coordinatorLease: {
      connectionId: "coordinator",
      epoch: 1,
      expiresAt: Date.now() + 60_000
    }
  };
  const items: SceneItemRecord[] = [{
    id: "ship",
    type: "IMAGE",
    name: "Аврора",
    position: { x: 50, y: 50 },
    rotation: 90,
    visible: false,
    metadata: { [METADATA_KEYS.ship]: structuredClone(spentShip) }
  }];

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
      if (value === undefined) {
        item.metadata = Object.fromEntries(
          Object.entries(item.metadata).filter(([metadataKey]) => metadataKey !== key)
        );
      } else {
        item.metadata[key] = structuredClone(value);
      }
    },
    getGridDpi: async () => 100,
    getGridDistance: async () => 0,
    snapGridCenter: async (position: { x: number; y: number }) => ({ ...position }),
    getLocalItems: async () => [],
    addLocalItem: async () => undefined,
    updateLocalItem: async () => undefined,
    deleteLocalItems: async () => undefined,
    createClone: () => { throw new Error("not used"); },
    send: async () => undefined,
    on: () => () => undefined,
    onGridChange: () => () => undefined,
    show: async () => undefined,
    getRole: async () => "GM" as const,
    getItem: async () => undefined,
    getSceneState: async () => scene,
    updateItem: async () => undefined,
    deleteLocalItemsForSource: async () => undefined
  } as unknown as OwlbearPort;

  const engine = new ProductionEngine(
    port,
    () => new Date("2026-09-02T12:00:01.000Z")
  );
  engine.setCoordinator(true, "coordinator");

  await engine.turnTick();

  expect(scene.turn.turnNumber).toBe(2);
  expect(scene.ships.ship).toMatchObject({
    globalMovementRemaining: SHIP_CLASSES.CRUISER.movement,
    movementSpentThisTurn: false,
    facing: "EAST",
    plannedRoute: [{ x: 1, y: 0 }],
    revision: spentShip.revision + 1
  });
  expect(items[0]?.metadata[METADATA_KEYS.ship]).toMatchObject({
    globalMovementRemaining: SHIP_CLASSES.CRUISER.movement,
    movementSpentThisTurn: false,
    facing: "EAST",
    plannedRoute: [{ x: 1, y: 0 }],
    revision: spentShip.revision + 1
  });
});
