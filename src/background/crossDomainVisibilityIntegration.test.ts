import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import type { ArmyState, NavalSceneState, SceneItemRecord } from "../shared/types";
import type { OwlbearPort } from "../owlbear/sdkAdapter";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { ProductionEngine } from "./application";

function armyState(sideId: string, detectionRangeCells: number): ArmyState {
  return {
    version: 4,
    registered: true,
    sideId,
    status: "READY",
    overrides: { detectionRangeCells },
    route: [],
    plannedRoute: {
      startCell: { x: 0, y: 0 },
      executeOnTurn: 0,
      cells: [],
      totalCostUnits: 0,
      validatedRevision: 0,
      requiresReplan: false
    },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    health: { hp: 50, maxHp: 50 },
    supply: { supplied: true, checkedOnTurn: 1 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    embarkedOnShipId: null,
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1
  };
}

function fixture(options: {
  redArmyRange: number;
  redShipRange: number;
  blueArmyPosition: { x: number; y: number };
  blueShipPosition: { x: number; y: number };
}) {
  const redArmy = armyState("red", options.redArmyRange);
  const blueArmy = armyState("blue", 0);
  const redShip = {
    ...createRegisteredShip("red", "CRUISER", "NORTH"),
    detectionOverride: options.redShipRange
  };
  const blueShip = {
    ...createRegisteredShip("blue", "CRUISER", "SOUTH"),
    detectionOverride: 0
  };
  const scene: NavalSceneState = {
    version: 6,
    revision: 1,
    settings: { ...DEFAULT_SETTINGS, defaultDetectionRangeCells: 6, detectionMode: "INDEPENDENT" },
    sides: [
      { id: "red", name: "Красные", color: "#c62828", playerIds: ["player"], leaderPlayerIds: [], stateId: null },
      { id: "blue", name: "Синие", color: "#1565c0", playerIds: [], leaderPlayerIds: [], stateId: null }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...DEFAULT_TURN_STATE, turnNumber: 1 },
    ships: { "red-ship": redShip, "blue-ship": blueShip },
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
  const sceneItems: SceneItemRecord[] = [
    {
      id: "red-army",
      type: "IMAGE",
      name: "Красная армия",
      position: { x: 0, y: 0 },
      visible: false,
      metadata: { [METADATA_KEYS.army]: redArmy }
    },
    {
      id: "blue-army",
      type: "IMAGE",
      name: "Синяя армия",
      position: options.blueArmyPosition,
      visible: false,
      metadata: { [METADATA_KEYS.army]: blueArmy }
    },
    {
      id: "red-ship",
      type: "IMAGE",
      name: "Красный крейсер",
      position: { x: 0, y: 0 },
      visible: false,
      metadata: { [METADATA_KEYS.ship]: redShip }
    },
    {
      id: "blue-ship",
      type: "IMAGE",
      name: "Синий крейсер",
      position: options.blueShipPosition,
      visible: false,
      metadata: { [METADATA_KEYS.ship]: blueShip }
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

function visibleCloneSourceIds(localItems: readonly SceneItemRecord[]): Set<string> {
  return new Set(localItems.flatMap((item) => {
    const metadata = item.metadata[METADATA_KEYS.localClone];
    if (typeof metadata !== "object" || metadata === null) return [];
    const sourceItemId = (metadata as Record<string, unknown>).sourceItemId;
    return typeof sourceItemId === "string" ? [sourceItemId] : [];
  }));
}

describe("shared army and ship detection", () => {
  it("lets an army detect and reveal an enemy ship by the common detection rules", async () => {
    const { port, localItems } = fixture({
      redArmyRange: 6,
      redShipRange: 0,
      blueArmyPosition: { x: 50, y: 0 },
      blueShipPosition: { x: 3, y: 0 }
    });
    await new ProductionEngine(port).visibilityTick("PLAYER", "player");

    const visible = visibleCloneSourceIds(localItems);
    expect(visible).toContain("blue-ship");
    expect(visible).not.toContain("blue-army");
    const shipLabels = localItems.filter((item) => item.metadata[METADATA_KEYS.navalShipOverlay] !== undefined);
    expect(shipLabels.some((item) => item.text === "Синий крейсер")).toBe(true);
  });

  it("lets a ship detect and reveal an enemy army by the same detection rules", async () => {
    const { port, localItems } = fixture({
      redArmyRange: 0,
      redShipRange: 6,
      blueArmyPosition: { x: 3, y: 0 },
      blueShipPosition: { x: 50, y: 0 }
    });
    await new ProductionEngine(port).visibilityTick("PLAYER", "player");

    const visible = visibleCloneSourceIds(localItems);
    expect(visible).toContain("blue-army");
    expect(visible).not.toContain("blue-ship");
    const healthLabels = localItems.filter((item) => item.metadata[METADATA_KEYS.healthOverlay] !== undefined);
    expect(healthLabels.some((item) => item.text === "50 / 50")).toBe(true);
  });
});
