import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "./constants";
import { normalizeSceneState } from "./validation";

function scene(cells: Record<string, unknown>) {
  return {
    version: 6,
    revision: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
    sides: [],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 1, cells },
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

const cell = {
  terrainId: null,
  impassable: false,
  factionTerritoryIds: [],
  recognizedStateId: null,
  deFactoStateId: null
};

describe("strategic grid metadata key validation", () => {
  it("keeps only canonical integer coordinate keys", () => {
    const result = normalizeSceneState(scene({
      "0,0": cell,
      "-12,7": cell,
      "bad": cell,
      "1,": cell,
      "1,2,3": cell,
      "1.5,2": cell,
      "01,2": cell,
      "Infinity,0": cell
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value.gridMap.cells).sort()).toEqual(["-12,7", "0,0"]);
  });
});
