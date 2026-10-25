import { describe, expect, it, vi } from "vitest";
import type { DetectionUnit } from "./detectionGraph";
import { buildDetectionGraph } from "./detectionGraph";
import { GridDistanceService } from "../grid/gridDistance";
import type { GridSdkPort } from "../grid/gridDistance";

function army(id: string, sideId: string, x: number, y: number, range = 6, concealment = 0): DetectionUnit {
  return {
    id, sideId, position: { x, y },
    detectionRangeCells: range, concealmentCells: concealment,
    ignoresVisionBarriers: false
  };
}

function snapshot(graph: Awaited<ReturnType<typeof buildDetectionGraph>>): string {
  return JSON.stringify({
    visible: [...graph.visibleTargetsBySide].map(([side, targets]) => [side, [...targets]]),
    observers: [...graph.observersBySide].map(([side, targets]) => [
      side, [...targets].map(([target, observerIds]) => [target, [...observerIds]])
    ])
  });
}

const distance = (from: { x: number; y: number }, to: { x: number; y: number }) =>
  Promise.resolve(Math.hypot(from.x - to.x, from.y - to.y) / 100);

describe("square-grid spatial detection broad phase", () => {
  it("skips most distant SDK checks while preserving all observers in both modes", async () => {
    const units: DetectionUnit[] = [];
    for (let i = 0; i < 60; i += 1) {
      units.push(army(`a${i}`, "red", i * 2500, 0));
      units.push(army(`b${i}`, "blue", i * 2500 + 200, 100, 5, i % 3));
    }
    const full = vi.fn(distance);
    const optimized = vi.fn(distance);
    for (const mode of ["INDEPENDENT", "MUTUAL"] as const) {
      const exact = await buildDetectionGraph({
        mode, units, distancePort: { distance: full }, visionBarriers: []
      });
      const indexed = await buildDetectionGraph({
        mode, units, distancePort: { distance: optimized },
        visionBarriers: [], squareGridDpi: 100
      });
      expect(snapshot(indexed)).toBe(snapshot(exact));
    }
    expect(full).toHaveBeenCalledTimes(60 * 60 * 2 * 2);
    expect(optimized.mock.calls.length).toBeLessThan(600);
  });

  it("keeps near-edge candidates, barriers, and negative concealment modifiers correct", async () => {
    const units = [
      army("a", "A", 99, 50, 1),
      army("b", "B", 299, 50, 1, -5),
      army("c", "C", 600, 50, 10),
      army("d", "D", -500, 0, 0),
      army("e", "E", 1_000_000, 0, 1)
    ];
    const visionBarriers = [
      { barrierId: "wall", from: { x: 400, y: -100 }, to: { x: 400, y: 100 } }
    ];
    const base = { mode: "MUTUAL" as const, units, visionBarriers, distancePort: { distance } };
    const full = await buildDetectionGraph(base);
    const indexed = await buildDetectionGraph({ ...base, squareGridDpi: 100 });
    expect(snapshot(indexed)).toBe(snapshot(full));
  });

  it("never filters pairs on invalid DPI, arbitrary coordinates, or unsupported grid", async () => {
    const units = [army("a", "A", 0, 0), army("b", "B", 90000, 0)];
    const exact = await buildDetectionGraph({
      mode: "INDEPENDENT", units, visionBarriers: [],
      distancePort: { distance }
    });
    for (const dpi of [undefined, 0, Number.NaN]) {
      const measured = vi.fn(distance);
      const actual = await buildDetectionGraph({
        mode: "INDEPENDENT", units, visionBarriers: [],
        distancePort: { distance: measured },
        ...(dpi !== undefined ? { squareGridDpi: dpi } : {})
      });
      expect(snapshot(actual)).toBe(snapshot(exact));
      expect(measured).toHaveBeenCalledTimes(2);
    }
  });

  it("uses the spatial index only when the Owlbear grid confirms a square type", async () => {
    const fixture = (gridType: string): GridSdkPort => ({
      getGridDistance: async () => 2,
      getGridDpi: async () => 100,
      getGridType: async () => gridType,
      snapGridCenter: async point => point,
      onGridChange: () => () => undefined
    });
    expect(await new GridDistanceService(fixture("SQUARE")).getSquareGridDpi()).toBe(100);
    expect(await new GridDistanceService(fixture("HEX_VERTICAL")).getSquareGridDpi()).toBeUndefined();
    expect(await new GridDistanceService(fixture("ISOMETRIC")).getSquareGridDpi()).toBeUndefined();
    const legacy = fixture("SQUARE");
    delete legacy.getGridType;
    expect(await new GridDistanceService(legacy).getSquareGridDpi()).toBeUndefined();
  });
});
