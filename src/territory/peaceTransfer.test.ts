import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { SceneState, StrategicCity } from "../shared/types";
import { applyPeaceTransfer, validatePeaceTransfer } from "./peaceTransfer";

function cell(owner: string, controller = owner) {
  return {
    terrainId: null,
    impassable: false,
    factionTerritoryIds: [],
    recognizedStateId: owner,
    deFactoStateId: controller
  };
}

const city: StrategicCity = {
  id: "city",
  name: "Город",
  cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
  recognizedStateId: "old",
  deFactoStateId: "old",
  factionInfluenceId: "old-faction",
  mayorId: "mayor",
  isCapital: false,
  historicalBuildTypeCount: 2
};

function scene(): SceneState {
  return {
    version: 7,
    revision: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
    sides: [],
    states: [
      { id: "old", name: "Старое", color: "#333333", rulingFactionId: null, active: false },
      { id: "new", name: "Новое", color: "#55aa55", rulingFactionId: null, active: false }
    ],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: {
      version: 1,
      revision: 1,
      cells: {
        "0,0": cell("old", "old"),
        "1,0": cell("old", "old"),
        "2,0": cell("old", "old"),
        "3,0": cell("old", "old")
      }
    },
    wars: [],
    turn: structuredClone(DEFAULT_TURN_STATE),
    stateRelations: {},
    forcedExitStates: [],
    strategicCities: [city],
    territorialScores: [{ holderStateId: "old", opponentStateId: "new", points: 7 }],
    rebellions: [],
    turnCheckpoint: null
  };
}

describe("peace transfer", () => {
  it("transfers only selected cells and normalizes recognized and de-facto control", () => {
    const current = scene();
    const result = applyPeaceTransfer(current, "new", [{ x: 0, y: 0 }]);

    expect(result.gridMap.cells["0,0"]).toMatchObject({
      recognizedStateId: "new",
      deFactoStateId: "new"
    });
    expect(result.gridMap.cells["3,0"]).toEqual(current.gridMap.cells["3,0"]);
  });

  it("does not require transfer cells to match current occupation", () => {
    const current = scene();
    current.gridMap.cells["0,0"] = cell("old", "old");
    expect(validatePeaceTransfer(current, "new", [{ x: 0, y: 0 }])).toEqual({ ok: true });
  });

  it("rejects a partial multi-cell city transfer", () => {
    expect(validatePeaceTransfer(scene(), "new", [{ x: 1, y: 0 }])).toEqual({
      ok: false,
      reason: "PARTIAL_CITY_TRANSFER",
      cityId: "city"
    });
  });

  it("updates a fully selected strategic city but preserves unrelated city metadata", () => {
    const result = applyPeaceTransfer(scene(), "new", [{ x: 1, y: 0 }, { x: 2, y: 0 }]);
    expect(result.strategicCities?.[0]).toMatchObject({
      recognizedStateId: "new",
      deFactoStateId: "new",
      factionInfluenceId: "old-faction",
      mayorId: "mayor",
      historicalBuildTypeCount: 2
    });
  });

  it("does not alter diplomacy, score, rebellion or other unrelated state", () => {
    const current = scene();
    current.stateRelations = {
      old: { new: { militaryAccess: false, atWar: false } },
      new: { old: { militaryAccess: true, atWar: false } }
    };
    current.rebellions = [{
      id: "rebellion",
      sourceStateId: "old",
      startedOnTurn: 1,
      recognizedTerritorySnapshot: [{ x: 0, y: 0 }],
      capitalCityId: "city",
      participantFactionIds: [],
      active: true
    }];

    const result = applyPeaceTransfer(current, "new", [{ x: 0, y: 0 }]);
    expect(result.stateRelations).toEqual(current.stateRelations);
    expect(result.territorialScores).toEqual(current.territorialScores);
    expect(result.rebellions).toEqual(current.rebellions);
  });

  it("rejects an unknown recipient, empty selection, and unknown cells", () => {
    expect(validatePeaceTransfer(scene(), "missing", [{ x: 0, y: 0 }])).toMatchObject({ ok: false, reason: "STATE_NOT_FOUND" });
    expect(validatePeaceTransfer(scene(), "new", [])).toMatchObject({ ok: false, reason: "TRANSFER_CELLS_EMPTY" });
    expect(validatePeaceTransfer(scene(), "new", [{ x: 99, y: 99 }])).toMatchObject({ ok: false, reason: "TRANSFER_CELL_NOT_FOUND" });
  });
});
