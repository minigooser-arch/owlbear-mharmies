import { expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import type { ArmyState, SceneItemRecord, SceneState } from "../shared/types";
import type { OwlbearPort } from "../owlbear/sdkAdapter";
import { ProductionEngine } from "./application";

function movingArmy(): ArmyState {
  return {
    version: 3,
    registered: true,
    sideId: "red",
    status: "MOVING",
    overrides: { speedCellsPerSecond: 10 },
    route: [{ x: 150, y: 50 }],
    plannedRoute: {
      startCell: { x: 0, y: 0 },
      executeOnTurn: 1,
      cells: [{ x: 1, y: 0 }],
      totalCostUnits: 1,
      validatedRevision: 1,
      requiresReplan: false
    },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    health: { hp: 50, maxHp: 50 },
    supply: { supplied: true, checkedOnTurn: 1 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1
  };
}

function fixture(options: { failSceneWrite?: boolean; failArmyWrite?: boolean } = {}) {
  let scene: SceneState = {
    version: 7,
    revision: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
    sides: [
      { id: "red", name: "Красные", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: "ru" },
      { id: "blue", name: "Синие", color: "#00f", playerIds: [], leaderPlayerIds: [], stateId: "de" }
    ],
    states: [
      { id: "ru", name: "Россия", color: "#f66", rulingFactionId: "red", active: true },
      { id: "de", name: "Германия", color: "#66f", rulingFactionId: "blue", active: true }
    ],
    relations: {},
    stateRelations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: {
      version: 1,
      revision: 0,
      cells: {
        "0,0": { terrainId: "road", impassable: false, factionTerritoryIds: [], recognizedStateId: "ru", deFactoStateId: "ru" },
        "1,0": { terrainId: "road", impassable: false, factionTerritoryIds: [], recognizedStateId: "de", deFactoStateId: "de" }
      }
    },
    wars: [],
    turn: structuredClone(DEFAULT_TURN_STATE),
    ships: {}, navalBattleRequests: [], transportEmbarkRequests: [], activeNavalBattle: null,
    navalBattleHistory: [], navalRevealUntilTurn: {}, foreignPresenceViolations: [], forcedExitStates: [],
    strategicCities: [], territorialScores: [], rebellions: [], turnCheckpoint: null
  };
  const items: SceneItemRecord[] = [{
    id: "army", type: "IMAGE", position: { x: 50, y: 50 },
    metadata: { [METADATA_KEYS.army]: movingArmy() }
  }];
  const port = {
    getSceneMetadata: async () => ({ [METADATA_KEYS.scene]: structuredClone(scene) }),
    patchSceneMetadata: async (update: Record<string, unknown>) => {
      if (options.failSceneWrite && update[METADATA_KEYS.scene]) throw new Error("scene write failed");
      if (update[METADATA_KEYS.scene]) scene = structuredClone(update[METADATA_KEYS.scene]) as SceneState;
    },
    getSceneItems: async () => structuredClone(items),
    patchSceneItemMetadata: async (id: string, key: string, value: unknown, update: Record<string, unknown> = {}) => {
      if (options.failArmyWrite && key === METADATA_KEYS.army) throw new Error("army write failed");
      const item = items.find((candidate) => candidate.id === id);
      if (!item) throw new Error(`Missing item ${id}`);
      Object.assign(item, structuredClone(update));
      item.metadata = value === undefined
        ? Object.fromEntries(Object.entries(item.metadata).filter(([entryKey]) => entryKey !== key))
        : { ...item.metadata, [key]: structuredClone(value) };
    },
    updateSceneItem: async () => {},
    getLocalItems: async () => [], addLocalItem: async () => {}, updateLocalItem: async () => {}, deleteLocalItems: async () => {},
    createClone: () => { throw new Error("not used"); }, send: async () => {}, on: () => () => {},
    getGridDistance: async (from: { x: number; y: number }, to: { x: number; y: number }) => Math.hypot(to.x - from.x, to.y - from.y) / 100,
    getGridDpi: async () => 100, snapGridCenter: async (position: { x: number; y: number }) => ({ ...position }), onGridChange: () => () => {},
    show: async () => {}, getRole: async () => "GM" as const, getItem: async () => undefined,
    getSceneState: async () => scene, updateItem: async () => {}, deleteLocalItemsForSource: async () => {}
  } as unknown as OwlbearPort;
  return { port, items, get scene() { return scene; } };
}

async function runTick(f: ReturnType<typeof fixture>) {
  const now = vi.spyOn(performance, "now");
  now.mockReturnValueOnce(0);
  const engine = new ProductionEngine(f.port);
  engine.setCoordinator(true);
  now.mockReturnValue(1000);
  try {
    await engine.movementTick();
  } finally {
    now.mockRestore();
  }
}

it("declares exact pair war and enters a closed foreign state for the ruling faction", async () => {
  const f = fixture();
  await runTick(f);

  expect(f.scene.stateRelations?.ru?.de?.atWar).toBe(true);
  expect(f.scene.stateRelations?.de?.ru?.atWar).toBe(true);
  expect(f.items[0]?.position).toEqual({ x: 150, y: 50 });
});

it("rolls the army back before the border if the auto-war scene write fails", async () => {
  const f = fixture({ failSceneWrite: true });

  await expect(runTick(f)).rejects.toThrow("scene write failed");

  expect(f.scene.stateRelations?.ru?.de?.atWar).not.toBe(true);
  expect(f.scene.stateRelations?.de?.ru?.atWar).not.toBe(true);
  expect(f.items[0]?.position).toEqual({ x: 50, y: 50 });
  expect((f.items[0]?.metadata[METADATA_KEYS.army] as ArmyState).movement.enteredRouteCellCount).toBe(0);
});

it("rolls the declared war back if the army write fails after crossing authorization", async () => {
  const f = fixture({ failArmyWrite: true });

  await expect(runTick(f)).rejects.toThrow("army write failed");

  expect(f.scene.stateRelations?.ru?.de?.atWar).not.toBe(true);
  expect(f.scene.stateRelations?.de?.ru?.atWar).not.toBe(true);
  expect(f.items[0]?.position).toEqual({ x: 50, y: 50 });
  expect((f.items[0]?.metadata[METADATA_KEYS.army] as ArmyState).movement.enteredRouteCellCount).toBe(0);
});
