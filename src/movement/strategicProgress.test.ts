import { describe, expect, it } from "vitest";
import {
  reconcileStrategicMovementProgress,
  resolveEnteredRouteCellCount
} from "./strategicProgress";

describe("strategic movement progress", () => {
  it("charges a route cell exactly when the final position enters it", () => {
    expect(reconcileStrategicMovementProgress({
      routeCells: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
      previousEnteredCount: 0,
      movementWaypointIndex: 0,
      finalCell: { x: 1, y: 0 },
      remainingUnits: 10,
      costForCell: (cell) => cell.x === 1 ? 1 : 4
    })).toEqual({ enteredRouteCellCount: 1, spentUnits: 1, remainingUnits: 9 });
  });

  it("never charges the same cell twice while movement stays inside it", () => {
    expect(reconcileStrategicMovementProgress({
      routeCells: [{ x: 1, y: 0 }],
      previousEnteredCount: 1,
      movementWaypointIndex: 0,
      finalCell: { x: 1, y: 0 },
      remainingUnits: 9,
      costForCell: () => 1
    })).toEqual({ enteredRouteCellCount: 1, spentUnits: 0, remainingUnits: 9 });
  });

  it("does not charge a later cell when collision rewinds the final position", () => {
    expect(resolveEnteredRouteCellCount(
      [{ x: 1, y: 0 }, { x: 2, y: 0 }],
      0,
      1,
      { x: 1, y: 0 }
    )).toBe(1);
  });
});
