import { describe, expect, it } from "vitest";
import type { Vector2 } from "../shared/types";
import { evaluateRouteLimit, measureRoute, type GridDistancePort } from "./routeMath";

const euclidean: GridDistancePort = {
  distance: async (a: Vector2, b: Vector2) => Math.hypot(b.x - a.x, b.y - a.y)
};

describe("route math", () => {
  it("sums a multi-waypoint route and reports remaining cells", async () => {
    const result = await evaluateRouteLimit(
      { x: 0, y: 0 },
      [
        { x: 3, y: 0 },
        { x: 3, y: 4 }
      ],
      8,
      euclidean
    );
    expect(result).toEqual({ lengthCells: 7, remainingCells: 1, valid: true, excessCells: 0 });
  });

  it("accepts exactly five cells and rejects any exact excess", async () => {
    expect(await evaluateRouteLimit({ x: 0, y: 0 }, [{ x: 5, y: 0 }], 5, euclidean)).toMatchObject({
      valid: true,
      remainingCells: 0
    });
    const excess = await evaluateRouteLimit(
      { x: 0, y: 0 },
      [{ x: 5.0001, y: 0 }],
      5,
      euclidean
    );
    expect(excess.valid).toBe(false);
    expect(excess.excessCells).toBeCloseTo(0.0001);
  });

  it("measures every segment through the distance port", async () => {
    const calls: Array<[Vector2, Vector2]> = [];
    const distance: GridDistancePort = {
      distance: async (from, to) => {
        calls.push([from, to]);
        return 2;
      }
    };
    expect(await measureRoute({ x: 0, y: 0 }, [{ x: 1, y: 0 }, { x: 2, y: 0 }], distance)).toBe(4);
    expect(calls).toHaveLength(2);
  });
});
