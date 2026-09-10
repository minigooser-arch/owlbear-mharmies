import { expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TURN_STATE } from "../shared/constants";
import { migrateSceneState } from "./migrations";

function legacyV6Scene() {
  return {
    version: 6,
    revision: 9,
    settings: structuredClone(DEFAULT_SETTINGS),
    sides: [],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: {
      defaultTerrainId: "plain",
      types: {
        plain: { id: "plain", name: "Равнина", movementCostUnits: 2, enabled: true, movementDomains: ["LAND"], blocksNavalLos: true, color: "#90a4ae" },
        road: { id: "road", name: "Дорога", movementCostUnits: 1, enabled: true, movementDomains: ["LAND"], blocksNavalLos: true, color: "#bcaaa4" },
        forest: { id: "forest", name: "Лес", movementCostUnits: 4, enabled: true, movementDomains: ["LAND"], blocksNavalLos: true, color: "#66bb6a" },
        mountains: { id: "mountains", name: "Горы", movementCostUnits: 6, enabled: true, movementDomains: ["LAND"], blocksNavalLos: true, color: "#8d6e63" },
        sea: { id: "sea", name: "Море", movementCostUnits: 2, enabled: true, movementDomains: ["SEA"], blocksNavalLos: false, color: "#42a5f5" }
      }
    },
    gridMap: { version: 1, cells: {}, revision: 0 },
    wars: [],
    turn: structuredClone(DEFAULT_TURN_STATE),
    ships: {},
    navalBattleRequests: [],
    transportEmbarkRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

it("adds the full strategic terrain catalog to existing v6 scenes", () => {
  const migrated = migrateSceneState(legacyV6Scene());
  expect(migrated.ok).toBe(true);
  if (!migrated.ok) return;

  expect(Object.keys(migrated.value.terrain.types)).toEqual(expect.arrayContaining([
    "plain",
    "road",
    "forest",
    "forested_hills",
    "hills",
    "mountains",
    "swamp",
    "desert",
    "tundra",
    "sea",
    "ice"
  ]));

  expect(migrated.value.terrain.types).toMatchObject({
    plain: { name: "Равнины", movementCostUnits: 2, color: "#9ccc65", movementDomains: ["LAND"] },
    forest: { name: "Лес", movementCostUnits: 4, color: "#43a047", movementDomains: ["LAND"] },
    forested_hills: { name: "Холмы с лесом", movementCostUnits: 6, color: "#2e7d32", movementDomains: ["LAND"] },
    hills: { name: "Холмы", movementCostUnits: 3, color: "#c5e1a5", movementDomains: ["LAND"] },
    mountains: { name: "Горы", movementCostUnits: 6, color: "#9e9e9e", movementDomains: ["LAND"] },
    swamp: { name: "Болота", movementCostUnits: 5, color: "#9e9d67", movementDomains: ["LAND"] },
    desert: { name: "Пустыня", movementCostUnits: 3, color: "#fff3b0", movementDomains: ["LAND"] },
    tundra: { name: "Тундра", movementCostUnits: 4, color: "#f5f5f5", movementDomains: ["LAND"] },
    sea: { name: "Океан / озёра", movementCostUnits: 2, color: "#1976d2", movementDomains: ["SEA"], blocksNavalLos: false },
    ice: { name: "Льды", movementCostUnits: 4, color: "#81d4fa", movementDomains: ["LAND"] }
  });
});
