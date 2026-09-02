import { describe, expect, it } from "vitest";
import { findStrategicConflictEdges } from "./movementIntent";

const enemy = (left: string, right: string) => left === right ? "ALLY" as const : "ENEMY" as const;

describe("findStrategicConflictEdges", () => {
  it("detects an enemy swap across one strategic edge", () => {
    expect(findStrategicConflictEdges([
      { armyId: "a", sideId: "red", from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
      { armyId: "b", sideId: "blue", from: { x: 1, y: 0 }, to: { x: 0, y: 0 } }
    ], enemy)).toEqual([["a", "b"]]);
  });

  it("connects every enemy army attempting the same destination cell", () => {
    expect(findStrategicConflictEdges([
      { armyId: "a", sideId: "red", from: { x: -1, y: 0 }, to: { x: 0, y: 0 } },
      { armyId: "b", sideId: "blue", from: { x: 1, y: 0 }, to: { x: 0, y: 0 } },
      { armyId: "c", sideId: "green", from: { x: 0, y: 1 }, to: { x: 0, y: 0 } }
    ], enemy)).toEqual([["a", "b"], ["a", "c"], ["b", "c"]]);
  });

  it("does not create a conflict between allied intents", () => {
    expect(findStrategicConflictEdges([
      { armyId: "a", sideId: "red", from: { x: -1, y: 0 }, to: { x: 0, y: 0 } },
      { armyId: "b", sideId: "red", from: { x: 1, y: 0 }, to: { x: 0, y: 0 } }
    ], enemy)).toEqual([]);
  });
});

it("detects a moving army entering a cell occupied by a stationary enemy", () => {
  expect(findStrategicConflictEdges([
    { armyId: "a", sideId: "red", from: { x: 0, y: 0 }, to: { x: 1, y: 0 } }
  ], enemy, [
    { armyId: "b", sideId: "blue", cell: { x: 1, y: 0 } }
  ])).toEqual([["a", "b"]]);
});
