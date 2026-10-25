import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DetectionGraphInput, DetectionUnit } from "./detectionGraph";
import { DetectionGraphCache } from "./detectionGraphCache";
import { performanceSnapshot, resetPerformance } from "../performance/metrics";

const units: DetectionUnit[] = [
  {
    id: "observer", sideId: "red", position: { x: 0, y: 0 },
    detectionRangeCells: 6, concealmentCells: 0, ignoresVisionBarriers: false
  },
  {
    id: "target", sideId: "blue", position: { x: 200, y: 0 },
    detectionRangeCells: 1, concealmentCells: 0, ignoresVisionBarriers: false
  }
];

function fixture(): DetectionGraphInput & { distancePort: { distance: ReturnType<typeof vi.fn> } } {
  return {
    mode: "INDEPENDENT",
    units: structuredClone(units),
    squareGridDpi: 100,
    visionBarriers: [],
    distancePort: {
      distance: vi.fn(async (from: { x: number; y: number }, to: { x: number; y: number }) =>
        Math.hypot(from.x - to.x, from.y - to.y) / 100)
    }
  };
}

describe("detection graph cache", () => {
  beforeEach(resetPerformance);

  it("reuses exact graph for irrelevant game changes but isolates maps from callers", async () => {
    const cache = new DetectionGraphCache();
    const input = fixture();

    const first = await cache.resolve(input);
    expect(first.visibleTargetsBySide.get("red")).toEqual(new Set(["target"]));
    expect(input.distancePort.distance).toHaveBeenCalledTimes(2);
    first.visibleTargetsBySide.get("red")?.clear();
    first.observersBySide.clear();

    const second = await cache.resolve(input);
    expect(input.distancePort.distance).toHaveBeenCalledTimes(2);
    expect(second.visibleTargetsBySide.get("red")).toEqual(new Set(["target"]));
    second.visibleTargetsBySide.get("red")?.clear();
    const third = await cache.resolve(input);
    expect(third.visibleTargetsBySide.get("red")).toEqual(new Set(["target"]));
    expect(performanceSnapshot().find(x => x.name === "visibility.detectionGraphCacheHit")?.calls).toBe(2);
  });

  it("recomputes for position, range, concealment, faction, ignored walls, mode and grid DPI changes", async () => {
    const cache = new DetectionGraphCache();
    const input = fixture();
    await cache.resolve(input);
    let previous = input.distancePort.distance.mock.calls.length;
    const mutations: Array<() => void> = [
      () => { const unit = input.units[0]; if (unit) unit.position.x = 100; },
      () => { const unit = input.units[0]; if (unit) unit.detectionRangeCells = 1; },
      () => { const unit = input.units[1]; if (unit) unit.concealmentCells = 2; },
      () => { const unit = input.units[1]; if (unit) unit.sideId = "green"; },
      () => { const unit = input.units[0]; if (unit) unit.ignoresVisionBarriers = true; },
      () => { input.mode = "MUTUAL"; },
      () => { input.squareGridDpi = 150; },
      () => { input.visionBarriers = [{
        barrierId: "wall", from: { x: 120, y: -100 }, to: { x: 120, y: 100 }
      }]; },
      () => { input.visionBarriers = [{
        barrierId: "wall", from: { x: 120, y: 50 }, to: { x: 120, y: 100 }
      }]; }
    ];
    for (const mutate of mutations) {
      mutate();
      await cache.resolve(input);
      expect(input.distancePort.distance.mock.calls.length).toBeGreaterThan(previous);
      previous = input.distancePort.distance.mock.calls.length;
    }
  });

  it("invalidates on lifecycle or grid change even if inputs appear identical", async () => {
    const cache = new DetectionGraphCache();
    const input = fixture();
    await cache.resolve(input);
    await cache.resolve(input);
    expect(input.distancePort.distance).toHaveBeenCalledTimes(2);
    cache.invalidate();
    await cache.resolve(input);
    expect(input.distancePort.distance).toHaveBeenCalledTimes(4);
  });

  it("does not retain results from an in-flight job invalidated by a scene transition", async () => {
    const cache = new DetectionGraphCache();
    const input = fixture();
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    input.distancePort.distance.mockImplementation(async () => {
      await gate;
      return 2;
    });
    const pending = cache.resolve(input);
    await Promise.resolve();
    cache.invalidate();
    release?.();
    // Concurrent workers share the same gate so they all settle together.
    input.distancePort.distance.mockImplementation(async () => 2);
    await pending;
    const calls = input.distancePort.distance.mock.calls.length;
    await cache.resolve(input);
    expect(input.distancePort.distance.mock.calls.length).toBeGreaterThan(calls);
  });

  it("bypasses caching entirely when grid identity or numeric geometry is unknown", async () => {
    const cache = new DetectionGraphCache();
    const input = fixture();
    delete input.squareGridDpi;
    await cache.resolve(input);
    await cache.resolve(input);
    expect(input.distancePort.distance).toHaveBeenCalledTimes(4);

    input.squareGridDpi = 100;
    const source = input.units[0];
    if (!source) throw new Error("No observer");
    source.detectionRangeCells = Number.NaN;
    await cache.resolve(input);
    await cache.resolve(input);
    expect(input.distancePort.distance).toHaveBeenCalledTimes(8);
  });

  it("does not cache SDK failures and retries with the next valid event", async () => {
    const cache = new DetectionGraphCache();
    const input = fixture();
    input.distancePort.distance.mockRejectedValueOnce(new Error("grid SDK offline"));
    await expect(cache.resolve(input)).rejects.toThrow("grid SDK offline");
    await cache.resolve(input);
    const count = input.distancePort.distance.mock.calls.length;
    await cache.resolve(input);
    expect(input.distancePort.distance.mock.calls.length).toBe(count);
  });
});
