import { describe, expect, it } from "vitest";
import type { GridRoutePort } from "../routes/routeMath";
import { DEFAULT_TERRAIN } from "../shared/constants";
import type { RouteToolActivation } from "./routeTool";
import { RouteToolController } from "./routeTool";

const hundredPixelCells: GridRoutePort = {
  distance: async (from, to) => Math.hypot(to.x - from.x, to.y - from.y) / 100,
  snapGridCenter: async (point) => ({
    x: Math.floor(point.x / 100) * 100 + 50,
    y: Math.floor(point.y / 100) * 100 + 50
  })
};

function activation(overrides: Partial<RouteToolActivation> = {}): RouteToolActivation {
  return {
    armyId: "army-a",
    start: { x: 50, y: 50 },
    startCell: { x: 0, y: 0 },
    gridDpi: 100,
    sideId: "red",
    movementUnits: 6,
    maxUnits: 6,
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: {
      version: 1,
      revision: 0,
      cells: {
        "1,0": { terrainId: "road", impassable: false, factionTerritoryIds: ["red"], recognizedStateId: null, deFactoStateId: null },
        "2,0": { terrainId: "forest", impassable: false, factionTerritoryIds: ["red"], recognizedStateId: null, deFactoStateId: null },
        "0,1": { terrainId: "plain", impassable: true, factionTerritoryIds: ["red"], recognizedStateId: null, deFactoStateId: null }
      }
    },
    wars: [],
    barriers: [],
    ...overrides
  };
}

describe("route tool", () => {
  it("builds only one orthogonal cell per click and charges destination terrain", async () => {
    const tool = new RouteToolController(hundredPixelCells);
    tool.activate(activation());

    expect(await tool.click({ x: 150, y: 50 })).toEqual({ accepted: true });
    expect(tool.snapshot()).toMatchObject({
      cells: [{ x: 1, y: 0 }],
      stepCostUnits: [1],
      totalCostUnits: 1,
      remainingUnits: 5
    });

    expect(await tool.click({ x: 250, y: 50 })).toEqual({ accepted: true });
    expect(tool.snapshot()).toMatchObject({
      cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
      stepCostUnits: [1, 4],
      totalCostUnits: 5,
      remainingUnits: 1
    });
  });

  it("rejects diagonal, distant, and impassable cells before adding them", async () => {
    const tool = new RouteToolController(hundredPixelCells);
    tool.activate(activation());

    expect(await tool.click({ x: 150, y: 150 })).toEqual({ accepted: false, reason: "NOT_ORTHOGONAL" });
    expect(await tool.click({ x: 250, y: 50 })).toEqual({ accepted: false, reason: "NOT_ORTHOGONAL" });
    expect(await tool.click({ x: 50, y: 150 })).toEqual({ accepted: false, reason: "IMPASSABLE" });
    expect(tool.snapshot()?.cells).toEqual([]);
  });

  it("blocks foreign territory in peace and allows it for a faction in an active war", async () => {
    const peaceful = new RouteToolController(hundredPixelCells);
    peaceful.activate(activation({
      gridMap: {
        version: 1,
        revision: 0,
        cells: { "1,0": { terrainId: "plain", impassable: false, factionTerritoryIds: ["blue"], recognizedStateId: null, deFactoStateId: null } }
      }
    }));
    expect(await peaceful.click({ x: 150, y: 50 })).toEqual({
      accepted: false,
      reason: "OUTSIDE_FACTION_TERRITORY"
    });

    const wartime = new RouteToolController(hundredPixelCells);
    wartime.activate(activation({
      gridMap: {
        version: 1,
        revision: 0,
        cells: { "1,0": { terrainId: "plain", impassable: false, factionTerritoryIds: ["blue"], recognizedStateId: null, deFactoStateId: null } }
      },
      wars: [{ id: "war", name: "Война", participantFactionIds: ["red", "blue"], participantStateIds: [], active: true }]
    }));
    expect(await wartime.click({ x: 150, y: 50 })).toEqual({ accepted: true });
  });

  it("ignores Enter and commits only through finish", async () => {
    const tool = new RouteToolController(hundredPixelCells);
    tool.activate(activation());
    await tool.click({ x: 150, y: 50 });

    expect(tool.key("Enter")).toEqual({ action: "IGNORED" });
    expect(tool.finish()).toMatchObject({
      action: "COMMIT",
      armyId: "army-a",
      startCell: { x: 0, y: 0 },
      cells: [{ x: 1, y: 0 }],
      totalCostUnits: 1
    });
  });

  it("supports explicit undo, clear, and Escape cancel", async () => {
    const tool = new RouteToolController(hundredPixelCells);
    tool.activate(activation());
    await tool.click({ x: 150, y: 50 });
    expect(tool.undo()).toEqual({ action: "EDITING" });
    expect(tool.snapshot()?.cells).toEqual([]);
    await tool.click({ x: 150, y: 50 });
    expect(tool.clear()).toEqual({ action: "EDITING" });
    expect(tool.snapshot()?.cells).toEqual([]);
    expect(tool.key("Escape")).toEqual({ action: "CANCEL" });
    expect(tool.snapshot()).toBeUndefined();
  });
});
