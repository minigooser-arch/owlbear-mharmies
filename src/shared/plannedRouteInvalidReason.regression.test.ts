import { describe, expect, it } from "vitest";
import type { ArmyState, MovementDenialReason } from "./types";
import { normalizeArmyState } from "./validation";

const ALL_MOVEMENT_DENIAL_REASONS: MovementDenialReason[] = [
  "NOT_ORTHOGONAL",
  "OUTSIDE_MAP",
  "IMPASSABLE",
  "FOREIGN_STATE_CLOSED",
  "STATELESS_FACTION",
  "INVALID_POLITICAL_CONFIG",
  "WAR_DECLARATION_FAILED",
  "NOT_SHORTEST_EXIT",
  "NO_EXIT_ROUTE",
  "INVALID_TERRAIN",
  "INSUFFICIENT_MOVEMENT_POINTS",
  "ARMY_STATE_BLOCKS_MOVEMENT",
  "BARRIER"
];

function army(invalidReason: MovementDenialReason): ArmyState {
  return {
    version: 4,
    registered: true,
    sideId: "red",
    status: "READY",
    overrides: {},
    route: [],
    plannedRoute: {
      startCell: { x: 0, y: 0 },
      executeOnTurn: 1,
      cells: [{ x: 1, y: 0 }],
      totalCostUnits: 2,
      validatedRevision: 7,
      requiresReplan: true,
      invalidReason,
      invalidCell: { x: 1, y: 0 }
    },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    health: { hp: 50, maxHp: 50 },
    supply: { supplied: true, checkedOnTurn: 1 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    embarkedOnShipId: null,
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1
  };
}

describe("planned route metadata regression", () => {
  it.each(ALL_MOVEMENT_DENIAL_REASONS)("round-trips persisted invalid reason %s", (reason) => {
    const result = normalizeArmyState(army(reason));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.plannedRoute.invalidReason).toBe(reason);
    expect(result.value.plannedRoute.invalidCell).toEqual({ x: 1, y: 0 });
  });
});
