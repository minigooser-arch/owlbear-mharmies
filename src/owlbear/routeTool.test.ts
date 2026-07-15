import { describe, expect, it } from "vitest";
import type { GridRoutePort } from "../routes/routeMath";
import { RouteToolController } from "./routeTool";

const distancePort: GridRoutePort = {
  distance: async (from, to) => Math.hypot(to.x - from.x, to.y - from.y),
  snapGridCenter: async (point) => ({ ...point })
};

const hundredPixelCells: GridRoutePort = {
  distance: async (from, to) => Math.hypot(to.x - from.x, to.y - from.y) / 100,
  snapGridCenter: async (point) => ({
    x: Math.round((point.x - 50) / 100) * 100 + 50,
    y: Math.round((point.y - 50) / 100) * 100 + 50
  })
};

describe("route tool", () => {
  it("keeps overdrag green and commits the farthest allowed cell", async () => {
    const tool = new RouteToolController(hundredPixelCells);
    tool.activate("army-a", { x: 50, y: 50 }, 3, []);
    await tool.move({ x: 999, y: 50 });
    expect(tool.preview()).toMatchObject({
      point: { x: 350, y: 50 },
      valid: true,
      color: "#2e7d32",
      label: "Осталось: 0"
    });
    expect(await tool.click({ x: 999, y: 50 })).toEqual({ accepted: true });
    expect(tool.key("Enter")).toEqual({
      action: "COMMIT",
      armyId: "army-a",
      route: [{ x: 350, y: 50 }]
    });
  });

  it("does not add a duplicate waypoint for repeated clicks in one cell", async () => {
    const tool = new RouteToolController(hundredPixelCells);
    tool.activate("army-a", { x: 50, y: 50 }, 5, []);
    await tool.click({ x: 149, y: 50 });
    await tool.click({ x: 151, y: 50 });
    expect(tool.snapshot()?.points).toEqual([{ x: 150, y: 50 }]);
  });

  it("checks barriers only up to the actual clamped endpoint", async () => {
    const blocked = new RouteToolController(hundredPixelCells);
    blocked.activate("army-a", { x: 50, y: 50 }, 3, [
      { barrierId: "near", from: { x: 200, y: 0 }, to: { x: 200, y: 100 } }
    ]);
    expect(await blocked.click({ x: 999, y: 50 })).toEqual({
      accepted: false,
      reason: "BARRIER"
    });

    const clear = new RouteToolController(hundredPixelCells);
    clear.activate("army-a", { x: 50, y: 50 }, 3, [
      { barrierId: "far", from: { x: 500, y: 0 }, to: { x: 500, y: 100 } }
    ]);
    expect(await clear.click({ x: 999, y: 50 })).toEqual({ accepted: true });
    expect(clear.snapshot()?.points).toEqual([{ x: 350, y: 50 }]);
  });

  it("rejects a waypoint across a movement barrier", async () => {
    const tool = new RouteToolController(distancePort);
    tool.activate("army-a", { x: 0, y: 0 }, 5, [
      { barrierId: "wall", from: { x: 2, y: -2 }, to: { x: 2, y: 2 } }
    ]);
    expect(await tool.click({ x: 4, y: 0 })).toEqual({ accepted: false, reason: "BARRIER" });
  });

  it("supports backspace, enter, and escape", async () => {
    const tool = new RouteToolController(distancePort);
    tool.activate("army-a", { x: 0, y: 0 }, 5, []);
    await tool.click({ x: 2, y: 0 });
    expect(tool.key("Backspace")).toEqual({ action: "EDITING" });
    await tool.click({ x: 1, y: 0 });
    expect(tool.key("Enter")).toEqual({ action: "COMMIT", armyId: "army-a", route: [{ x: 1, y: 0 }] });
    tool.activate("army-a", { x: 0, y: 0 }, 5, []);
    expect(tool.key("Escape")).toEqual({ action: "CANCEL" });
  });

  it("exposes a defensive draft snapshot and cancels late previews", async () => {
    let resolveDistance!: (value: number) => void;
    const deferredDistance: GridRoutePort = {
      distance: () => new Promise<number>((resolve) => {
        resolveDistance = resolve;
      }),
      snapGridCenter: async (point) => ({ ...point })
    };
    const tool = new RouteToolController(deferredDistance);
    tool.activate("army-a", { x: 0, y: 0 }, 5, []);

    const moving = tool.move({ x: 2, y: 0 });
    const draft = tool.snapshot();
    expect(draft).toEqual({
      armyId: "army-a",
      start: { x: 0, y: 0 },
      points: []
    });
    if (draft) draft.start.x = 99;
    expect(tool.snapshot()?.start).toEqual({ x: 0, y: 0 });

    await Promise.resolve();
    tool.cancel();
    resolveDistance(2);
    await moving;
    expect(tool.snapshot()).toBeUndefined();
    expect(tool.preview()).toBeUndefined();
  });
});
