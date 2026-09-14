import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { SceneState, StrategicCity } from "../shared/types";
import { startCivilWar } from "./civilWarService";

function cell(recognizedStateId: string, deFactoStateId = recognizedStateId) {
  return {
    terrainId: null,
    impassable: false,
    factionTerritoryIds: [],
    recognizedStateId,
    deFactoStateId
  };
}

const rebelCity: StrategicCity = {
  id: "rebel-city",
  name: "Повстанческий город",
  cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
  recognizedStateId: "empire",
  deFactoStateId: "empire",
  factionInfluenceId: "rebels",
  mayorId: "mayor-a",
  isCapital: false,
  historicalBuildTypeCount: 3
};

const loyalCity: StrategicCity = {
  id: "loyal-city",
  name: "Верный город",
  cells: [{ x: 3, y: 0 }, { x: 4, y: 0 }],
  recognizedStateId: "empire",
  deFactoStateId: "empire",
  factionInfluenceId: "gov",
  mayorId: "mayor-b",
  isCapital: true,
  historicalBuildTypeCount: 4
};

function scene(): SceneState {
  return {
    version: 7,
    revision: 7,
    settings: structuredClone(DEFAULT_SETTINGS),
    sides: [
      { id: "gov", name: "Правительство", color: "#333", playerIds: [], leaderPlayerIds: [], stateId: "empire" },
      { id: "rebels", name: "Повстанцы", color: "#933", playerIds: [], leaderPlayerIds: [], stateId: "empire" },
      { id: "foreign", name: "Иностранцы", color: "#369", playerIds: [], leaderPlayerIds: [], stateId: "foreign-state" }
    ],
    states: [
      { id: "empire", name: "Империя", color: "#777", rulingFactionId: "gov", active: true },
      { id: "foreign-state", name: "Сосед", color: "#369", rulingFactionId: "foreign", active: true }
    ],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: {
      version: 1,
      revision: 5,
      cells: {
        "0,0": cell("empire"),
        "1,0": cell("empire"),
        "2,0": cell("empire"),
        "3,0": cell("empire"),
        "4,0": cell("empire"),
        "5,0": cell("empire")
      }
    },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 8 },
    stateRelations: {
      empire: {
        "foreign-state": { militaryAccess: true, atWar: false }
      },
      "foreign-state": {
        empire: { militaryAccess: false, atWar: false }
      }
    },
    forcedExitStates: [],
    strategicCities: [rebelCity, loyalCity],
    territorialScores: [{ holderStateId: "empire", opponentStateId: "foreign-state", points: 6 }],
    rebellions: [],
    turnCheckpoint: null
  };
}

const input = {
  sourceStateId: "empire",
  rebelFactionId: "rebels",
  newStateId: "rebel-state",
  newStateName: "Республика",
  newStateColor: "#aa3344"
};

describe("startCivilWar", () => {
  it("creates an active rebel state and moves only the rebel faction into it", () => {
    const result = startCivilWar(scene(), input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.scene.states).toContainEqual({
      id: "rebel-state",
      name: "Республика",
      color: "#aa3344",
      rulingFactionId: "rebels",
      active: true
    });
    expect(result.scene.sides.find((side) => side.id === "rebels")?.stateId).toBe("rebel-state");
    expect(result.scene.sides.find((side) => side.id === "gov")?.stateId).toBe("empire");
    expect(result.scene.states.find((state) => state.id === "empire")).toMatchObject({
      rulingFactionId: "gov",
      active: true
    });
  });

  it("transfers complete influenced city cell sets and leaves ordinary territory with the successor", () => {
    const result = startCivilWar(scene(), input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.scene.gridMap.cells["1,0"]).toMatchObject({
      recognizedStateId: "rebel-state",
      deFactoStateId: "empire"
    });
    expect(result.scene.gridMap.cells["2,0"]).toMatchObject({
      recognizedStateId: "rebel-state",
      deFactoStateId: "empire"
    });
    expect(result.scene.gridMap.cells["0,0"]).toMatchObject({
      recognizedStateId: "empire",
      deFactoStateId: "empire"
    });
    expect(result.scene.gridMap.cells["5,0"]).toMatchObject({
      recognizedStateId: "empire",
      deFactoStateId: "empire"
    });
    expect(result.scene.gridMap.cells["3,0"]).toMatchObject({
      recognizedStateId: "empire",
      deFactoStateId: "empire"
    });

    expect(result.scene.strategicCities?.find((city) => city.id === "rebel-city")).toMatchObject({
      recognizedStateId: "rebel-state",
      deFactoStateId: "empire",
      factionInfluenceId: "rebels",
      mayorId: "mayor-a",
      historicalBuildTypeCount: 3
    });
    expect(result.scene.strategicCities?.find((city) => city.id === "loyal-city")).toEqual(loyalCity);
  });

  it("starts exact-pair war between the new state and successor without overwriting other diplomacy", () => {
    const result = startCivilWar(scene(), input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.scene.stateRelations).toMatchObject({
      empire: {
        "rebel-state": { militaryAccess: false, atWar: true },
        "foreign-state": { militaryAccess: true, atWar: false }
      },
      "rebel-state": {
        empire: { militaryAccess: false, atWar: true }
      },
      "foreign-state": {
        empire: { militaryAccess: false, atWar: false }
      }
    });
  });

  it("rejects a city that only partly lies inside the source state's recognized territory", () => {
    const current = scene();
    current.gridMap.cells["2,0"] = cell("foreign-state");
    const before = structuredClone(current);

    expect(startCivilWar(current, input)).toEqual({
      ok: false,
      reason: "CITY_TERRITORY_INCONSISTENT"
    });
    expect(current).toEqual(before);
  });

  it("returns validation failures without mutating the input scene", () => {
    const current = scene();
    const before = structuredClone(current);

    expect(startCivilWar(current, { ...input, newStateId: "empire" })).toEqual({
      ok: false,
      reason: "STATE_EXISTS"
    });
    expect(current).toEqual(before);

    expect(startCivilWar(current, { ...input, rebelFactionId: "foreign" })).toEqual({
      ok: false,
      reason: "REBEL_FACTION_OUTSIDE_STATE"
    });
    expect(current).toEqual(before);
  });

  it("refuses to split away the active ruling faction without an explicit successor ruler", () => {
    const result = startCivilWar(scene(), { ...input, rebelFactionId: "gov" });
    expect(result).toEqual({
      ok: false,
      reason: "RULING_FACTION_MOVE_FORBIDDEN"
    });
  });
});
