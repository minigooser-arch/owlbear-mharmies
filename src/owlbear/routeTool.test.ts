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
  it("charges destination terrain for consecutive orthogonal cells", async () => {
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

  it("keeps two snapped army cells on the same row despite floating-point grid jitter", async () => {
    const jitterPort: GridRoutePort = {
      distance: async (from, to) => Math.hypot(to.x - from.x, to.y - from.y) / 100,
      snapGridCenter: async (point) => ({ ...point })
    };
    const tool = new RouteToolController(jitterPort);
    tool.activate(activation({
      start: { x: 100, y: 100 },
      startCell: { x: 1, y: 1 },
      movementUnits: 6,
      maxUnits: 6,
      gridMap: {
        version: 1,
        revision: 0,
        cells: {
          "2,1": { terrainId: "road", impassable: false, factionTerritoryIds: ["red"], recognizedStateId: null, deFactoStateId: null },
          "3,1": { terrainId: "road", impassable: false, factionTerritoryIds: ["red"], recognizedStateId: null, deFactoStateId: null }
        }
      }
    }));

    expect(await tool.click({ x: 200, y: 100.0000001 })).toEqual({ accepted: true });
    expect(await tool.click({ x: 300, y: 99.9999999 })).toEqual({ accepted: true });
    expect(tool.snapshot()?.cells).toEqual([{ x: 2, y: 1 }, { x: 3, y: 1 }]);
  });

  it("rejects diagonal and impassable cells before adding them", async () => {
    const tool = new RouteToolController(hundredPixelCells);
    tool.activate(activation());

    expect(await tool.click({ x: 150, y: 150 })).toEqual({ accepted: false, reason: "NOT_ORTHOGONAL" });
    expect(await tool.click({ x: 50, y: 150 })).toEqual({ accepted: false, reason: "IMPASSABLE" });
    expect(tool.snapshot()?.cells).toEqual([]);
  });

  it("rejects a straight multi-cell segment atomically when an intermediate cell is impassable", async () => {
    const tool = new RouteToolController(hundredPixelCells);
    tool.activate(activation({
      gridMap: {
        version: 1,
        revision: 0,
        cells: {
          "1,0": { terrainId: "road", impassable: true, factionTerritoryIds: ["red"], recognizedStateId: null, deFactoStateId: null },
          "2,0": { terrainId: "road", impassable: false, factionTerritoryIds: ["red"], recognizedStateId: null, deFactoStateId: null }
        }
      }
    }));

    expect(await tool.click({ x: 250, y: 50 })).toEqual({ accepted: false, reason: "IMPASSABLE" });
    expect(tool.snapshot()?.cells).toEqual([]);
  });

  it("uses state borders instead of legacy faction territory for political route access", async () => {
    const states = [
      { id: "russia", name: "Россия", color: "#f00", rulingFactionId: "red-ruler", active: true },
      { id: "germany", name: "Германия", color: "#00f", rulingFactionId: "blue", active: true }
    ];
    const gridMap = {
      version: 1 as const,
      revision: 0,
      cells: {
        "1,0": { terrainId: "plain", impassable: false, factionTerritoryIds: ["red"], recognizedStateId: "germany", deFactoStateId: "germany" }
      }
    };

    const ordinary = new RouteToolController(hundredPixelCells);
    ordinary.activate(activation({
      sideId: "red-opposition",
      gridMap,
      sides: [
        { id: "red-ruler", name: "Правящие", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: "russia" },
        { id: "red-opposition", name: "Оппозиция", color: "#a00", playerIds: [], leaderPlayerIds: [], stateId: "russia" },
        { id: "blue", name: "Синие", color: "#00f", playerIds: [], leaderPlayerIds: [], stateId: "germany" }
      ],
      states,
      stateRelations: {}
    }));
    expect(await ordinary.click({ x: 150, y: 50 })).toEqual({
      accepted: false,
      reason: "FOREIGN_STATE_CLOSED"
    });

    const ruling = new RouteToolController(hundredPixelCells);
    ruling.activate(activation({
      sideId: "red-ruler",
      gridMap,
      sides: [
        { id: "red-ruler", name: "Правящие", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: "russia" },
        { id: "blue", name: "Синие", color: "#00f", playerIds: [], leaderPlayerIds: [], stateId: "germany" }
      ],
      states,
      stateRelations: {}
    }));
    expect(await ruling.click({ x: 150, y: 50 })).toEqual({ accepted: true });
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
