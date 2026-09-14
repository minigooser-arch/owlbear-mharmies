import { describe, expect, it } from "vitest";
import { findShortestForcedExitRoutes } from "./forcedExitPathfinder";

describe("findShortestForcedExitRoutes", () => {
  const cells = [
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
    { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }
  ];

  it("returns every equal shortest orthogonal exit", () => {
    const routes = findShortestForcedExitRoutes({
      start: { x: 0, y: 0 }, cells,
      canTraverse: () => true,
      isLegalDestination: (cell) => cell.x + cell.y === 2
    });
    expect(routes).toEqual([
      [{ x: 1, y: 0 }, { x: 2, y: 0 }],
      [{ x: 1, y: 0 }, { x: 1, y: 1 }],
      [{ x: 0, y: 1 }, { x: 1, y: 1 }]
    ]);
  });

  it("routes around impassable cells and returns no route when sealed", () => {
    expect(findShortestForcedExitRoutes({
      start: { x: 0, y: 0 }, cells,
      canTraverse: (cell) => !(cell.x === 1 && cell.y === 0),
      isLegalDestination: (cell) => cell.x === 2
    })).toEqual([[{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }]]);
    expect(findShortestForcedExitRoutes({
      start: { x: 0, y: 0 }, cells,
      canTraverse: (cell) => cell.x === 0,
      isLegalDestination: (cell) => cell.x === 2
    })).toEqual([]);
  });
});
