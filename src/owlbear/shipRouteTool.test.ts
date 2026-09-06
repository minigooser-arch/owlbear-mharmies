import { describe, expect, it } from "vitest";
import { DEFAULT_TERRAIN } from "../shared/constants";
import type { TerrainType, Vector2 } from "../shared/types";
import { ShipRouteToolController } from "./shipRouteTool";

function terrain(id: string, movementDomains: Array<"LAND" | "SEA">): TerrainType {
  return {
    id,
    name: id,
    movementCostUnits: 2,
    enabled: true,
    movementDomains,
    blocksNavalLos: !movementDomains.includes("SEA")
  };
}

function activation() {
  return {
    shipId: "ship",
    start: { x: 0, y: 0 },
    startCell: { x: 0, y: 0 },
    gridDpi: 1,
    movementPoints: 2,
    maxMovementPoints: 4,
    terrain: {
      ...DEFAULT_TERRAIN,
      defaultTerrainId: "land",
      types: {
        land: terrain("land", ["LAND"]),
        sea: terrain("sea", ["SEA"]),
        canal: terrain("canal", ["LAND", "SEA"])
      }
    },
    gridMap: {
      version: 1 as const,
      revision: 1,
      cells: {
        "1,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "2,0": { terrainId: "canal", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "1,1": { terrainId: "land", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "0,1": { terrainId: "sea", impassable: true, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }
      }
    }
  };
}

function controller() {
  return new ShipRouteToolController({
    snapGridCenter: async (point: Vector2) => ({ ...point })
  });
}

describe("ship route tool", () => {
  it("accepts orthogonal SEA and CANAL cells at one OP each", async () => {
    const tool = controller();
    tool.activate(activation());

    expect(await tool.click({ x: 1, y: 0 })).toEqual({ accepted: true });
    expect(await tool.click({ x: 2, y: 0 })).toEqual({ accepted: true });
    expect(tool.snapshot()).toMatchObject({
      cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
      spentMovementPoints: 2,
      remainingMovementPoints: 0
    });
    expect(tool.finish()).toEqual({
      action: "COMMIT",
      shipId: "ship",
      startCell: { x: 0, y: 0 },
      points: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
      cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }]
    });
  });

  it("rejects diagonal, LAND-only, impassable, and over-budget cells", async () => {
    const diagonal = controller();
    diagonal.activate(activation());
    expect(await diagonal.click({ x: 1, y: 1 })).toEqual({ accepted: false, reason: "NOT_ORTHOGONAL" });

    const land = controller();
    land.activate(activation());
    await land.click({ x: 1, y: 0 });
    expect(await land.click({ x: 1, y: 1 })).toEqual({ accepted: false, reason: "NON_NAVAL_TERRAIN" });

    const impassable = controller();
    impassable.activate(activation());
    expect(await impassable.click({ x: 0, y: 1 })).toEqual({ accepted: false, reason: "IMPASSABLE" });

    const budget = controller();
    budget.activate({ ...activation(), movementPoints: 1 });
    await budget.click({ x: 1, y: 0 });
    expect(await budget.click({ x: 2, y: 0 })).toEqual({ accepted: false, reason: "INSUFFICIENT_MOVEMENT_POINTS" });
  });

  it("supports undo and clear before commit", async () => {
    const tool = controller();
    tool.activate(activation());
    await tool.click({ x: 1, y: 0 });
    await tool.click({ x: 2, y: 0 });
    expect(tool.undo()).toEqual({ action: "EDITING" });
    expect(tool.snapshot()?.cells).toEqual([{ x: 1, y: 0 }]);
    expect(tool.clear()).toEqual({ action: "EDITING" });
    expect(tool.snapshot()?.cells).toEqual([]);
    expect(tool.finish()).toEqual({ action: "INVALID", reason: "EMPTY_ROUTE" });
  });
});
