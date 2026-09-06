import { expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import type { OwlbearPort } from "../owlbear/sdkAdapter";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import type { NavalBattleState, NavalSceneState, SceneItemRecord } from "../shared/types";
import { ProductionEngine } from "./application";

function activeShip(
  sideId: string,
  classId: "CRUISER" | "BATTLESHIP",
  facing: "NORTH" | "SOUTH"
) {
  return {
    ...createRegisteredShip(sideId, classId, facing),
    status: "IN_NAVAL_BATTLE" as const,
    battleId: "battle"
  };
}

function battle(): NavalBattleState {
  return {
    version: 1,
    id: "battle",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      { x: 7, y: 5 },
      { x: 5, y: 3 },
      { x: 5, y: 7 }
    ],
    participantShipIds: ["cruiser", "enemy"],
    snapshots: {},
    initiative: [
      { shipId: "cruiser", initialRoll: 20, bonus: 2, total: 22, tieBreakRolls: [] },
      { shipId: "enemy", initialRoll: 10, bonus: 0, total: 10, tieBreakRolls: [] }
    ],
    roundNumber: 2,
    currentShipId: "enemy",
    completedShipIdsThisRound: ["cruiser"],
    movementRemainingByShip: { cruiser: 0, enemy: 2 },
    actionUsedByShip: { cruiser: true, enemy: false },
    interceptions: {
      cruiser: { cruiserShipId: "cruiser", activatedRoundNumber: 2 }
    },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 8,
    startedAt: 1,
    revision: 3
  };
}

function fixture() {
  const terrain = structuredClone(DEFAULT_TERRAIN);
  terrain.defaultTerrainId = "sea";
  terrain.types.sea = {
    id: "sea",
    name: "Море",
    movementCostUnits: 2,
    enabled: true,
    movementDomains: ["SEA"],
    blocksNavalLos: false
  };

  const cruiser = activeShip("red", "CRUISER", "NORTH");
  const enemy = activeShip("blue", "BATTLESHIP", "SOUTH");
  const scene: NavalSceneState = {
    version: 6,
    revision: 1,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      {
        id: "red",
        name: "Красные",
        color: "#c62828",
        playerIds: ["leader", "member"],
        leaderPlayerIds: ["leader"],
        stateId: null
      },
      {
        id: "blue",
        name: "Синие",
        color: "#1565c0",
        playerIds: [],
        leaderPlayerIds: [],
        stateId: null
      }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain,
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...DEFAULT_TURN_STATE, turnNumber: 8, phase: "POST_MOVEMENT" },
    ships: { cruiser, enemy },
    navalBattleRequests: [],
    transportEmbarkRequests: [],
    activeNavalBattle: battle(),
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };

  const sceneItems: SceneItemRecord[] = [
    {
      id: "cruiser",
      type: "IMAGE",
      name: "Крейсер",
      position: { x: 550, y: 550 },
      visible: false,
      metadata: { [METADATA_KEYS.ship]: cruiser }
    },
    {
      id: "enemy",
      type: "IMAGE",
      name: "Линкор",
      position: { x: 1050, y: 1050 },
      visible: false,
      metadata: { [METADATA_KEYS.ship]: enemy }
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

function interceptionCells(items: readonly SceneItemRecord[]): string[] {
  return items.flatMap((item) => {
    const raw = item.metadata[METADATA_KEYS.interceptionOverlay];
    if (typeof raw !== "object" || raw === null) return [];
    const key = (raw as Record<string, unknown>).cellKey;
    return typeof key === "string" ? [key] : [];
  }).sort();
}

it("wires private cruiser interception overlays into visibility runtime", async () => {
  const { port, localItems } = fixture();
  const engine = new ProductionEngine(port);

  await engine.visibilityTick("PLAYER", "leader");
  expect(interceptionCells(localItems)).toEqual(["6,5", "7,5"]);

  await engine.visibilityTick("PLAYER", "member");
  expect(interceptionCells(localItems)).toEqual([]);
});
