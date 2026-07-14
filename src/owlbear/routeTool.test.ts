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
});
