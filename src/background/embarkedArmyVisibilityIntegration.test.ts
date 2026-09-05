import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import type { ArmyState, NavalSceneState, SceneItemRecord } from "../shared/types";
import type { OwlbearPort } from "../owlbear/sdkAdapter";
import { ProductionEngine } from "./application";

function army(sideId: string, embarkedOnShipId: string | null, detectionRangeCells = 0): ArmyState {
  return {
    version: 4,
    registered: true,
    sideId,
    status: "READY",
    overrides: { detectionRangeCells },
    route: [],
    plannedRoute: {
      startCell: { x: 0, y: 0 }, executeOnTurn: 1, cells: [], totalCostUnits: 0,
      validatedRevision: 1, requiresReplan: false
    },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    health: { hp: 50, maxHp: 50 },
    supply: { supplied: true, checkedOnTurn: 1 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    embarkedOnShipId,
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1
  };
}

function fixture(options: { reciprocal: boolean }) {
  const redTransport = createRegisteredShip("red", "TRANSPORT", "EAST");
  if (options.reciprocal) redTransport.embarkedArmyId = "red-army";
  const redArmy = army("red", "red-transport", 10);
  const blueArmy = army("blue", null, 0);
  const scene: NavalSceneState = {
    version: 6,
    revision: 2,
    settings: { ...DEFAULT_SETTINGS, defaultDetectionRangeCells: 0, detectionMode: "INDEPENDENT" },
    sides: [
      { id: "red", name: "Красные", color: "#f00", playerIds: ["red-player"], leaderPlayerIds: [], stateId: null },
      { id: "blue", name: "Синие", color: "#00f", playerIds: [], leaderPlayerIds: [], stateId: null }
    ],
    states: [], relations: {}, battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 2 },
    ships: { "red-transport": redTransport },
    transportEmbarkRequests: [],
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
  const sceneItems: SceneItemRecord[] = [
    {
      id: "red-army", type: "IMAGE", name: "Красная армия", position: { x: 0, y: 0 }, visible: false,
      metadata: { [METADATA_KEYS.army]: redArmy }
    },
    {
      id: "blue-army", type: "IMAGE", name: "Синяя армия", position: { x: 3, y: 0 }, visible: false,
      metadata: { [METADATA_KEYS.army]: blueArmy }
    },
    {
      id: "red-transport", type: "IMAGE", name: "Транспорт", position: { x: 0, y: 0 }, visible: false,
      metadata: { [METADATA_KEYS.ship]: redTransport }
    }
  ];
  const localItems: SceneItemRecord[] = [];
  let nextId = 0;
  const port = {
    getSceneMetadata: async () => ({ [METADATA_KEYS.scene]: structuredClone(scene) }),
    patchSceneMetadata: async () => undefined,
    getSceneItems: async () => structuredClone(sceneItems),
    getLocalItems: async () => structuredClone(localItems),
    addLocalItem: async (item: SceneItemRecord) => { localItems.push(structuredClone(item)); },
    addLocalItems: async (items: readonly SceneItemRecord[]) => { localItems.push(...structuredClone(items)); },
    updateLocalItem: async (id: string, update: Record<string, unknown>) => {
      const item = localItems.find((candidate) => candidate.id === id);
      if (item) Object.assign(item, structuredClone(update));
    },
    updateLocalItems: async (items: readonly SceneItemRecord[]) => {
      for (const update of items) {
        const item = localItems.find((candidate) => candidate.id === update.id);
        if (item) Object.assign(item, structuredClone(update));
      }
    },
    deleteLocalItems: async (ids: readonly string[]) => {
      for (const id of ids) {
        const index = localItems.findIndex((item) => item.id === id);
        if (index >= 0) localItems.splice(index, 1);
      }
    },
    createClone: (source: SceneItemRecord) => ({
      ...structuredClone(source),
      id: `clone-${++nextId}`,
      visible: true,
      metadata: { [METADATA_KEYS.localClone]: { sourceItemId: source.id } }
    }),
    getGridDistance: async (from: { x: number; y: number }, to: { x: number; y: number }) =>
      Math.hypot(to.x - from.x, to.y - from.y),
    getGridDpi: async () => 100,
    snapGridCenter: async (position: { x: number; y: number }) => ({ ...position }),
    send: async () => undefined,
    on: () => () => undefined,
    show: async () => undefined
  } as unknown as OwlbearPort;
  return { port, localItems };
}

function cloneSources(localItems: readonly SceneItemRecord[]): Set<string> {
  return new Set(localItems.flatMap((item) => {
    const metadata = item.metadata[METADATA_KEYS.localClone];
    if (typeof metadata !== "object" || metadata === null) return [];
    const sourceItemId = (metadata as Record<string, unknown>).sourceItemId;
    return typeof sourceItemId === "string" ? [sourceItemId] : [];
  }));
}

describe("embarked army map visibility", () => {
  it("hides a reciprocally embarked own army and prevents it from detecting enemy units", async () => {
    const { port, localItems } = fixture({ reciprocal: true });
    await new ProductionEngine(port).visibilityTick("PLAYER", "red-player");

    const visible = cloneSources(localItems);
    expect(visible).toContain("red-transport");
    expect(visible).not.toContain("red-army");
    expect(visible).not.toContain("blue-army");
    expect(localItems.some((item) => item.metadata[METADATA_KEYS.healthOverlay] !== undefined)).toBe(false);
  });

  it("does not hide an army for a stale non-reciprocal embark link", async () => {
    const { port, localItems } = fixture({ reciprocal: false });
    await new ProductionEngine(port).visibilityTick("PLAYER", "red-player");

    const visible = cloneSources(localItems);
    expect(visible).toContain("red-army");
    expect(visible).toContain("blue-army");
  });
});
