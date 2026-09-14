import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { ArmyState, SceneState } from "../shared/types";
import { runTurnCheckpoint } from "./turnCheckpointPipeline";

function army(sideId = "red", hp = 50): ArmyState {
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
    movement: { maxUnits: 10, remainingUnits: 4, enteredRouteCellCount: 0 },
    health: { hp, maxHp: 50 },
    supply: { supplied: true, checkedOnTurn: 3 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1
  };
}

function scene(atWar: boolean): SceneState {
  return {
    version: 7,
    revision: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
    sides: [
      { id: "red", name: "Red", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: "red-state" },
      { id: "blue", name: "Blue", color: "#00f", playerIds: [], leaderPlayerIds: [], stateId: "blue-state" }
    ],
    states: [
      { id: "red-state", name: "Red State", color: "#f00", rulingFactionId: "red", active: true },
      { id: "blue-state", name: "Blue State", color: "#00f", rulingFactionId: "blue", active: true }
    ],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: {
      version: 1,
      revision: 1,
      cells: {
        "0,0": {
          terrainId: null,
          impassable: false,
          factionTerritoryIds: [],
          recognizedStateId: "blue-state",
          deFactoStateId: "red-state"
        }
      }
    },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 3, phase: "POST_MOVEMENT" },
    stateRelations: {
      "red-state": {
        "blue-state": { militaryAccess: false, atWar }
      },
      "blue-state": {
        "red-state": { militaryAccess: false, atWar }
      }
    },
    forcedExitStates: [],
    strategicCities: [{
      id: "enemy-city",
      name: "Enemy City",
      cells: [{ x: 0, y: 0 }],
      recognizedStateId: "blue-state",
      deFactoStateId: "red-state",
      factionInfluenceId: null,
      mayorId: null,
      isCapital: false,
      historicalBuildTypeCount: 2
    }],
    territorialScores: [],
    rebellions: [],
    turnCheckpoint: null
  };
}

describe("runTurnCheckpoint", () => {
  it("activates forced exit before later checkpoint stages", () => {
    const current = scene(false);
    current.gridMap.cells["0,0"] = {
      terrainId: null,
      impassable: false,
      factionTerritoryIds: [],
      recognizedStateId: "blue-state",
      deFactoStateId: "blue-state"
    };

    const result = runTurnCheckpoint({
      scene: current,
      armies: { a: army() },
      armyCells: { a: { x: 0, y: 0 } }
    }, 4);

    expect(result.scene.forcedExitStates).toEqual([
      { armyId: "a", startedOnTurn: 4, originReason: "OTHER" }
    ]);
    expect(result.scene.turnCheckpoint).toEqual({
      turnNumber: 4,
      forcedExitDone: true,
      supplyDone: true,
      encirclementDone: true,
      territorialScoreDone: true
    });
  });

  it("runs supply, encirclement and territorial score exactly once in order", () => {
    const first = runTurnCheckpoint({
      scene: scene(true),
      armies: { a: army() },
      armyCells: { a: { x: 0, y: 0 } }
    }, 4);

    expect(first.armies.a?.supply).toEqual({ supplied: false, checkedOnTurn: 4 });
    expect(first.armies.a?.health.hp).toBe(45);
    expect(first.scene.territorialScores).toEqual([
      { holderStateId: "red-state", opponentStateId: "blue-state", points: 3 }
    ]);

    const second = runTurnCheckpoint(first, 4);
    expect(second.armies.a?.health.hp).toBe(45);
    expect(second.scene.territorialScores).toEqual(first.scene.territorialScores);
    expect(second.armies.a?.supply).toEqual(first.armies.a?.supply);
  });

  it("resumes after supply was already persisted without repeating the supply step", () => {
    const current = scene(true);
    current.turnCheckpoint = {
      turnNumber: 4,
      forcedExitDone: true,
      supplyDone: true,
      encirclementDone: false,
      territorialScoreDone: false
    };
    const suppliedArmy = army();
    suppliedArmy.supply = { supplied: false, checkedOnTurn: 4 };
    suppliedArmy.revision = 9;

    const result = runTurnCheckpoint({
      scene: current,
      armies: { a: suppliedArmy },
      armyCells: { a: { x: 0, y: 0 } }
    }, 4);

    expect(result.armies.a?.revision).toBe(10);
    expect(result.armies.a?.health.hp).toBe(45);
    expect(result.scene.territorialScores?.[0]?.points).toBe(3);

    const retry = runTurnCheckpoint(result, 4);
    expect(retry.armies.a?.revision).toBe(10);
    expect(retry.armies.a?.health.hp).toBe(45);
    expect(retry.scene.territorialScores?.[0]?.points).toBe(3);
  });

  it("resumes after encirclement was already persisted without double damage", () => {
    const current = scene(true);
    current.turnCheckpoint = {
      turnNumber: 4,
      forcedExitDone: true,
      supplyDone: true,
      encirclementDone: true,
      territorialScoreDone: false
    };
    const damagedArmy = army("red", 45);
    damagedArmy.supply = { supplied: false, checkedOnTurn: 4 };
    damagedArmy.revision = 10;

    const result = runTurnCheckpoint({
      scene: current,
      armies: { a: damagedArmy },
      armyCells: { a: { x: 0, y: 0 } }
    }, 4);

    expect(result.armies.a?.health.hp).toBe(45);
    expect(result.armies.a?.revision).toBe(10);
    expect(result.scene.territorialScores?.[0]?.points).toBe(3);
    expect(result.scene.turnCheckpoint?.territorialScoreDone).toBe(true);
  });
});
