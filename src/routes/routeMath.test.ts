import { describe, expect, it } from "vitest";
import type { Vector2 } from "../shared/types";
import {
  evaluateRouteLimit,
  measureRoute,
  resolveRouteEndpoint,
  type GridDistancePort,
  type GridRoutePort
} from "./routeMath";

const euclidean: GridDistancePort = {
  distance: async (a: Vector2, b: Vector2) => Math.hypot(b.x - a.x, b.y - a.y)
};

const hundredPixelCells: GridRoutePort = {
  distance: async (from, to) => Math.hypot(to.x - from.x, to.y - from.y) / 100,
  snapGridCenter: async (point) => ({
    x: Math.round((point.x - 50) / 100) * 100 + 50,
    y: Math.round((point.y - 50) / 100) * 100 + 50
  })
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

  it("keeps an endpoint that is exactly at the snapped route maximum", async () => {
    await expect(resolveRouteEndpoint(
      { x: 50, y: 50 },
      [],
      { x: 350, y: 50 },
      3,
      hundredPixelCells
    )).resolves.toEqual({
      point: { x: 350, y: 50 },
      lengthCells: 3,
      remainingCells: 0,
      clamped: false
    });
  });

  it("clamps an overdrag to the farthest reachable snapped centre", async () => {
    await expect(resolveRouteEndpoint(
      { x: 50, y: 50 },
      [],
      { x: 999, y: 50 },
      3,
      hundredPixelCells
    )).resolves.toEqual({
      point: { x: 350, y: 50 },
      lengthCells: 3,
      remainingCells: 0,
      clamped: true
    });
  });

  it("uses only the remaining budget after committed waypoints", async () => {
    await expect(resolveRouteEndpoint(
      { x: 50, y: 50 },
      [{ x: 250, y: 50 }],
      { x: 999, y: 50 },
      4,
      hundredPixelCells
    )).resolves.toMatchObject({
      point: { x: 450, y: 50 },
      lengthCells: 4,
      remainingCells: 0,
      clamped: true
    });
  });

  it("returns the current anchor when no additional snapped centre fits", async () => {
    await expect(resolveRouteEndpoint(
      { x: 50, y: 50 },
      [{ x: 350, y: 50 }],
      { x: 999, y: 50 },
      3,
      hundredPixelCells
    )).resolves.toMatchObject({
      point: { x: 350, y: 50 },
      lengthCells: 3,
      remainingCells: 0,
      clamped: true
    });
  });
});
