import { describe, expect, it } from "vitest";
import type { GridDistancePort } from "../routes/routeMath";
import { RouteToolController } from "./routeTool";

const distancePort: GridDistancePort = {
  distance: async (from, to) => Math.hypot(to.x - from.x, to.y - from.y)
};

describe("route tool", () => {
  it("shows remaining distance and rejects a point over five cells", async () => {
    const tool = new RouteToolController(distancePort);
    tool.activate("army-a", { x: 0, y: 0 }, 5, []);
    await tool.move({ x: 3, y: 0 });
    expect(tool.preview()?.label).toContain("Осталось: 2");
    await tool.move({ x: 6, y: 0 });
    expect(tool.preview()?.color).toBe("#d32f2f");
    expect(await tool.click({ x: 6, y: 0 })).toEqual({ accepted: false, reason: "ROUTE_LIMIT" });
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
    const deferredDistance: GridDistancePort = {
      distance: () => new Promise<number>((resolve) => {
        resolveDistance = resolve;
      })
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

    tool.cancel();
    resolveDistance(2);
    await moving;
    expect(tool.snapshot()).toBeUndefined();
    expect(tool.preview()).toBeUndefined();
  });
});
