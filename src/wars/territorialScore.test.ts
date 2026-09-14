import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { SceneState, StrategicCity } from "../shared/types";
import {
  applyTerritorialScoreCheckpoint,
  cityIncome,
  territorialCityContributions
} from "./territorialScore";

function cell(recognizedStateId: string, deFactoStateId: string | null) {
  return {
    terrainId: null,
    impassable: false,
    factionTerritoryIds: [],
    recognizedStateId,
    deFactoStateId
  };
}

const paris: StrategicCity = {
  id: "paris",
  name: "Paris",
  cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
  recognizedStateId: "france",
  deFactoStateId: "germany",
  factionInfluenceId: null,
  mayorId: null,
  isCapital: true,
  historicalBuildTypeCount: 2
};

const warsaw: StrategicCity = {
  ...paris,
  id: "warsaw",
  name: "Warsaw",
  cells: [{ x: 2, y: 0 }],
  recognizedStateId: "russia",
  historicalBuildTypeCount: 4
};

function scene(): SceneState {
  return {
    version: 7,
    revision: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
    sides: [],
    states: [
      { id: "germany", name: "Germany", color: "#333", rulingFactionId: null, active: false },
      { id: "france", name: "France", color: "#36c", rulingFactionId: null, active: false },
      { id: "russia", name: "Russia", color: "#b22", rulingFactionId: null, active: false }
    ],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: {
      version: 1,
      revision: 1,
      cells: {
        "0,0": cell("france", "germany"),
        "1,0": cell("france", "germany"),
        "2,0": cell("russia", "germany")
      }
    },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 1 },
    stateRelations: {
      germany: {
        france: { militaryAccess: false, atWar: true },
        russia: { militaryAccess: false, atWar: true }
      },
      france: { germany: { militaryAccess: false, atWar: true } },
      russia: { germany: { militaryAccess: false, atWar: true } }
    },
    forcedExitStates: [],
    strategicCities: [paris, warsaw],
    territorialScores: [],
    rebellions: [],
    turnCheckpoint: {
      turnNumber: 2,
      forcedExitDone: true,
      supplyDone: true,
      encirclementDone: true,
      territorialScoreDone: false
    }
  };
}

describe("territorial war score", () => {
  it("uses one plus the historical build type count as city income", () => {
    expect(cityIncome(paris)).toBe(3);
    expect(cityIncome(warsaw)).toBe(5);
  });

  it("accrues independent directional score pools for fully controlled enemy cities", () => {
    const result = applyTerritorialScoreCheckpoint(scene(), 2);

    expect(result.territorialScores).toEqual([
      { holderStateId: "germany", opponentStateId: "france", points: 3 },
      { holderStateId: "germany", opponentStateId: "russia", points: 5 }
    ]);
    expect(result.turnCheckpoint?.territorialScoreDone).toBe(true);
  });

  it("gives no income for a city whose cells have mixed control", () => {
    const current = scene();
    current.gridMap.cells["1,0"] = cell("france", "france");

    expect(territorialCityContributions(current)).toEqual([
      {
        cityId: "warsaw",
        cityName: "Warsaw",
        holderStateId: "germany",
        opponentStateId: "russia",
        income: 5
      }
    ]);
  });

  it("preserves accumulated score when a city is lost", () => {
    const current = scene();
    current.territorialScores = [{
      holderStateId: "germany",
      opponentStateId: "france",
      points: 9
    }];
    current.gridMap.cells["0,0"] = cell("france", "france");
    current.gridMap.cells["1,0"] = cell("france", "france");
    current.stateRelations.germany = {
      france: { militaryAccess: false, atWar: true }
    };
    current.stateRelations.france = {
      germany: { militaryAccess: false, atWar: true }
    };
    current.strategicCities = [paris];

    const result = applyTerritorialScoreCheckpoint(current, 2);
    expect(result.territorialScores).toEqual([
      { holderStateId: "germany", opponentStateId: "france", points: 9 }
    ]);
  });

  it("preserves accumulated score after peace and does not add new income", () => {
    const current = scene();
    current.territorialScores = [{
      holderStateId: "germany",
      opponentStateId: "france",
      points: 9
    }];
    current.stateRelations.germany = {
      france: { militaryAccess: false, atWar: false }
    };
    current.stateRelations.france = {
      germany: { militaryAccess: false, atWar: false }
    };
    current.strategicCities = [paris];

    const result = applyTerritorialScoreCheckpoint(current, 2);
    expect(result.territorialScores).toEqual([
      { holderStateId: "germany", opponentStateId: "france", points: 9 }
    ]);
  });

  it("cannot accrue the same turn checkpoint twice", () => {
    const first = applyTerritorialScoreCheckpoint(scene(), 2);
    const second = applyTerritorialScoreCheckpoint(first, 2);

    expect(second.territorialScores).toEqual(first.territorialScores);
  });
});
