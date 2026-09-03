import { expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import type { NavalSceneState, SceneItemRecord } from "../shared/types";
import type { OwlbearPort } from "../owlbear/sdkAdapter";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { ProductionEngine } from "./application";

function fixture() {
  const scene: NavalSceneState = {
    version: 6,
    revision: 1,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      { id: "red", name: "Красные", color: "#c62828", playerIds: ["player"], leaderPlayerIds: [], stateId: null },
      { id: "blue", name: "Синие", color: "#1565c0", playerIds: [], leaderPlayerIds: [], stateId: null },
      { id: "green", name: "Зелёные", color: "#2e7d32", playerIds: [], leaderPlayerIds: [], stateId: null }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...DEFAULT_TURN_STATE, turnNumber: 4 },
    ships: {
      "red-ship": { ...createRegisteredShip("red", "CRUISER", "NORTH"), hp: 18 },
      "blue-ship": createRegisteredShip("blue", "BATTLESHIP", "WEST"),
      "green-ship": createRegisteredShip("green", "IRONCLAD", "SOUTH")
    },
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: { red: { "blue-ship": 5 } }
  };
  const sceneItems: SceneItemRecord[] = [
    { id: "red-ship", type: "IMAGE", name: "Аврора", position: { x: 100, y: 100 }, metadata: {} },
    { id: "blue-ship", type: "IMAGE", name: "Блюхер", position: { x: 200, y: 100 }, metadata: {} },
    { id: "green-ship", type: "IMAGE", name: "Скрытый", position: { x: 300, y: 100 }, metadata: {} }
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
    createClone: (source: SceneItemRecord) => ({ ...structuredClone(source), id: `clone-${++nextId}`, visible: true }),
    getGridDistance: async () => 0,
    getGridDpi: async () => 100,
    snapGridCenter: async (position: { x: number; y: number }) => ({ ...position }),
    send: async () => undefined,
    on: () => () => undefined,
    show: async () => undefined
  } as unknown as OwlbearPort;

  return { port, localItems };
}

it("renders naval name/HP overlays for own and battle-revealed ships but not hidden enemies", async () => {
  const { port, localItems } = fixture();
  const engine = new ProductionEngine(port);
  await engine.visibilityTick("PLAYER", "player");

  const navalLabels = localItems.filter((item) => item.metadata[METADATA_KEYS.navalShipOverlay] !== undefined);
  expect(navalLabels.map((item) => item.text).sort()).toEqual([
    "Аврора",
    "Блюхер",
    "♥ 18 / 20",
    "♥ 30 / 30"
  ].sort());
  expect(navalLabels.some((item) => item.text === "Скрытый")).toBe(false);
  expect(navalLabels.find((item) => item.text === "Аврора")?.color).toBe("#c62828");
  expect(navalLabels.find((item) => item.text === "Блюхер")?.color).toBe("#1565c0");
});
