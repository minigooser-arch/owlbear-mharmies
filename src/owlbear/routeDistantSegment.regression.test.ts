import { describe, expect, it } from "vitest";
import { DEFAULT_TERRAIN } from "../shared/constants";
import { RouteToolController } from "./routeTool";

const snap = async (point: { x: number; y: number }) => ({
  x: Math.floor(point.x / 100) * 100 + 50,
  y: Math.floor(point.y / 100) * 100 + 50
});

function activation() {
  return {
    armyId: "army",
    start: { x: 50, y: 50 },
    startCell: { x: 0, y: 0 },
    gridDpi: 100,
    sideId: "red",
    movementUnits: 10,
    maxUnits: 10,
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: {
      version: 1 as const,
      revision: 0,
      cells: {
        "1,0": { terrainId: "road", impassable: false, factionTerritoryIds: ["red"], recognizedStateId: null, deFactoStateId: null },
        "2,0": { terrainId: "road", impassable: false, factionTerritoryIds: ["red"], recognizedStateId: null, deFactoStateId: null },
        "3,0": { terrainId: "road", impassable: false, factionTerritoryIds: ["red"], recognizedStateId: null, deFactoStateId: null }
      }
    },
    wars: [],
    barriers: []
  };
}

describe("army route straight segment regression", () => {
  it("expands one distant horizontal click into every intermediate strategic cell", async () => {
    const controller = new RouteToolController({ snapGridCenter: snap });
    controller.activate(activation());

    expect(await controller.click({ x: 350, y: 50 })).toEqual({ accepted: true });
    expect(controller.snapshot()?.cells).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 }
    ]);
    expect(controller.snapshot()?.finishButton?.position.x).toBe(350);
  });

  it("rejects the whole distant segment when an intermediate cell is impassable", async () => {
    const controller = new RouteToolController({ snapGridCenter: snap });
    const input = activation();
    const blocked = input.gridMap.cells["2,0"];
    if (!blocked) throw new Error("Missing intermediate fixture cell");
    input.gridMap.cells["2,0"] = { ...blocked, impassable: true };
    controller.activate(input);

    expect(await controller.click({ x: 350, y: 50 })).toEqual({ accepted: false, reason: "IMPASSABLE" });
    expect(controller.snapshot()?.cells).toEqual([]);
  });
});
