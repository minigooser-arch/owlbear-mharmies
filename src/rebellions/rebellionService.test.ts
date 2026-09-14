import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { ArmyState, SceneState } from "../shared/types";
import {
  closeRebellion,
  getRebellionCapitalController,
  getRebellionFactionStrength,
  startRebellion
} from "./rebellionService";

function cell(recognizedStateId: string | null, deFactoStateId = recognizedStateId) {
  return {
    terrainId: null,
    impassable: false,
    factionTerritoryIds: [],
    recognizedStateId,
    deFactoStateId
  };
}

function army(sideId: string, hp = 50, maxHp = 50): ArmyState {
  return {
    version: 4,
    registered: true,
    sideId,
    status: "READY",
    overrides: {},
    route: [],
    plannedRoute: {
      startCell: { x: 0, y: 0 },
      executeOnTurn: 0,
      cells: [],
      totalCostUnits: 0,
      validatedRevision: 1,
      requiresReplan: false
    },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    health: { hp, maxHp },
    supply: { supplied: true, checkedOnTurn: 1 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1
  };
}

function scene(): SceneState {
  return {
    version: 7,
    revision: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
    sides: [
      { id: "gov", name: "Правительство", color: "#333", playerIds: [], leaderPlayerIds: [], stateId: "state" },
      { id: "rebels", name: "Повстанцы", color: "#933", playerIds: [], leaderPlayerIds: [], stateId: "state" },
      { id: "third", name: "Третья сила", color: "#369", playerIds: [], leaderPlayerIds: [], stateId: "other" }
    ],
    states: [
      { id: "state", name: "Государство", color: "#777", rulingFactionId: "gov", active: true },
      { id: "other", name: "Другое", color: "#246", rulingFactionId: "third", active: true }
    ],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: {
      version: 1,
      revision: 1,
      cells: {
        "0,0": cell("state"),
        "1,0": cell("state"),
        "2,0": cell("state"),
        "3,0": cell("other")
      }
    },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 4 },
    stateRelations: {},
    forcedExitStates: [],
    strategicCities: [{
      id: "capital",
      name: "Столица",
      cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      recognizedStateId: "state",
      deFactoStateId: "state",
      factionInfluenceId: null,
      mayorId: null,
      isCapital: true,
      historicalBuildTypeCount: 2
    }],
    territorialScores: [],
    rebellions: [],
    turnCheckpoint: null
  };
}

describe("rebellionService", () => {
  it("starts a rebellion with an immutable recognized-territory snapshot and capital", () => {
    const current = scene();
    const started = startRebellion(current, {
      id: "rebellion-1",
      sourceStateId: "state",
      capitalCityId: "capital",
      participantFactionIds: ["gov", "rebels"]
    });

    expect(started.rebellions?.[0]).toEqual({
      id: "rebellion-1",
      sourceStateId: "state",
      startedOnTurn: 4,
      recognizedTerritorySnapshot: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
      capitalCityId: "capital",
      participantFactionIds: ["gov", "rebels"],
      active: true
    });

    started.gridMap.cells["2,0"] = cell("other");
    expect(started.rebellions?.[0]?.recognizedTerritorySnapshot).toEqual([
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }
    ]);
  });

  it("reports one participant alone in the capital as controller", () => {
    const started = startRebellion(scene(), {
      id: "rebellion-1",
      sourceStateId: "state",
      capitalCityId: "capital",
      participantFactionIds: ["gov", "rebels"]
    });
    const runtime = {
      armies: {
        g1: army("gov"),
        outsider: army("third")
      },
      armyCells: {
        g1: { x: 0, y: 0 },
        outsider: { x: 1, y: 0 }
      }
    };

    expect(getRebellionCapitalController(started, "rebellion-1", runtime)).toBe("gov");
  });

  it("returns null when multiple internal sides occupy the capital", () => {
    const started = startRebellion(scene(), {
      id: "rebellion-1",
      sourceStateId: "state",
      capitalCityId: "capital",
      participantFactionIds: ["gov", "rebels"]
    });
    const runtime = {
      armies: {
        g1: army("gov"),
        r1: army("rebels")
      },
      armyCells: {
        g1: { x: 0, y: 0 },
        r1: { x: 1, y: 0 }
      }
    };

    expect(getRebellionCapitalController(started, "rebellion-1", runtime)).toBeNull();
  });

  it("counts only participant armies inside the immutable snapshot", () => {
    const started = startRebellion(scene(), {
      id: "rebellion-1",
      sourceStateId: "state",
      capitalCityId: "capital",
      participantFactionIds: ["gov", "rebels"]
    });
    const runtime = {
      armies: {
        g1: army("gov", 40, 50),
        g2: army("gov", 25, 50),
        outside: army("gov", 50, 50),
        foreign: army("third", 50, 50)
      },
      armyCells: {
        g1: { x: 0, y: 0 },
        g2: { x: 2, y: 0 },
        outside: { x: 3, y: 0 },
        foreign: { x: 1, y: 0 }
      }
    };

    expect(getRebellionFactionStrength(started, "rebellion-1", "gov", runtime)).toEqual({
      armyCount: 2,
      currentHp: 65,
      maxHp: 100
    });
    expect(getRebellionFactionStrength(started, "rebellion-1", "third", runtime)).toEqual({
      armyCount: 0,
      currentHp: 0,
      maxHp: 0
    });
  });

  it("closes a rebellion without deleting its historical snapshot", () => {
    const started = startRebellion(scene(), {
      id: "rebellion-1",
      sourceStateId: "state",
      capitalCityId: "capital",
      participantFactionIds: ["gov", "rebels"]
    });
    const closed = closeRebellion(started, "rebellion-1");

    expect(closed.rebellions?.[0]).toMatchObject({
      id: "rebellion-1",
      active: false,
      recognizedTerritorySnapshot: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]
    });
  });
});
