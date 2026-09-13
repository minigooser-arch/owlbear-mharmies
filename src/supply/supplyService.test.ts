import { describe, expect, it } from "vitest";
import type { ArmyState, SceneState } from "../shared/types";
import { findSupplyPath, isArmySupplied } from "./supplyService";

const cell = (recognizedStateId: string | null, deFactoStateId: string | null) => ({
  terrainId: null,
  impassable: false,
  factionTerritoryIds: [],
  recognizedStateId,
  deFactoStateId
});

const army = (sideId: string): ArmyState => ({
  version: 4, registered: true, sideId, status: "READY", overrides: {}, route: [],
  plannedRoute: { startCell: { x: 0, y: 0 }, executeOnTurn: 0, cells: [], totalCostUnits: 0, validatedRevision: 0, requiresReplan: false },
  movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
  health: { hp: 50, maxHp: 50 }, supply: { supplied: false, checkedOnTurn: 0 },
  disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
  currentWaypointIndex: 0, segmentProgressCells: 0, ignoresMovementBarriers: false, ignoresVisionBarriers: false, revision: 1
});

const scene = (cells: Record<string, ReturnType<typeof cell>>, deFacto = "red-state"): SceneState => ({
  version: 7, revision: 1, settings: {} as SceneState["settings"], sides: [{ id: "red", name: "Red", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: deFacto === "red-state" ? "red-state" : "blue-state" }],
  states: [{ id: "red-state", name: "Red", rulingFactionId: "red", active: true }], relations: {}, battleGroups: [], terrain: { defaultTerrainId: "plain", types: {} }, gridMap: { version: 1, cells, revision: 1 }, wars: [], turn: { turnNumber: 1, phase: "MOVEMENT", autoTurnsPaused: false, deferredUntil: null, lastCompletedAt: null, lastCompletedBy: null, lastProcessedBoundaryId: null }, stateRelations: {}, strategicCities: [], territorialScores: [], rebellions: [], forcedExitStates: [], turnCheckpoint: null
});

describe("supplyService", () => {
  it("finds a deterministic orthogonal path through own de facto control to recognized territory", () => {
    const current = scene({
      "0,0": cell("red-state", "red-state"),
      "1,0": cell("red-state", "red-state"),
      "2,0": cell("blue-state", "red-state"),
      "2,1": cell("blue-state", "red-state")
    });
    expect(findSupplyPath(current, { x: 2, y: 1 }, "red-state")).toEqual([
      { x: 2, y: 1 }, { x: 2, y: 0 }, { x: 1, y: 0 }
    ]);
  });

  it("does not bridge diagonals or passage territory", () => {
    const current = scene({
      "0,0": cell("red-state", "red-state"),
      "1,1": cell("blue-state", "red-state"),
      "2,2": cell("red-state", "red-state")
    });
    expect(findSupplyPath(current, { x: 1, y: 1 }, "red-state")).toBeNull();
  });

  it("uses the army side state and reports unsupplied after an occupation cuts the route", () => {
    const current = scene({
      "0,0": cell("red-state", "red-state"),
      "1,0": cell("blue-state", "blue-state"),
      "2,0": cell("blue-state", "red-state")
    });
    current.states.push({ id: "blue-state", name: "Blue", rulingFactionId: null, active: true });
    expect(isArmySupplied(current, army("red"), { x: 2, y: 0 })).toBe(false);
  });
});
