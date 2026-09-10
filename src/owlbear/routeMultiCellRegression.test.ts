import { describe, expect, it } from "vitest";
import { DEFAULT_TERRAIN } from "../shared/constants";
import type { GridRoutePort } from "../routes/routeMath";
import type { TerrainType, Vector2 } from "../shared/types";
import { RouteToolController, type RouteToolActivation } from "./routeTool";
import { ShipRouteToolController, type ShipRouteToolActivation } from "./shipRouteTool";

const identityGrid: GridRoutePort = {
  distance: async (from, to) => Math.hypot(to.x - from.x, to.y - from.y),
  snapGridCenter: async (point) => ({ ...point })
};

function roadCell() {
  return {
    terrainId: "road",
    impassable: false,
    factionTerritoryIds: ["red"],
    recognizedStateId: null,
    deFactoStateId: null
  };
}

function armyActivation(): RouteToolActivation {
  return {
    armyId: "army",
    start: { x: 0, y: 0 },
    startCell: { x: 0, y: 0 },
    gridDpi: 1,
    sideId: "red",
    movementUnits: 10,
    maxUnits: 10,
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: {
      version: 1,
      revision: 0,
      cells: {
        "1,0": roadCell(),
        "2,0": roadCell(),
        "3,0": roadCell()
      }
    },
    wars: [],
    barriers: []
  };
}

function seaTerrain(id: string): TerrainType {
  return {
    id,
    name: id,
    movementCostUnits: 2,
    enabled: true,
    movementDomains: ["SEA"],
    blocksNavalLos: false
  };
}

function shipActivation(): ShipRouteToolActivation {
  return {
    shipId: "ship",
    start: { x: 0, y: 0 },
    startCell: { x: 0, y: 0 },
    gridDpi: 1,
    movementPoints: 5,
    maxMovementPoints: 5,
    facing: "EAST",
    terrain: {
      ...structuredClone(DEFAULT_TERRAIN),
      defaultTerrainId: "sea",
      types: { sea: seaTerrain("sea") }
    },
    gridMap: {
      version: 1,
      revision: 0,
      cells: {
        "1,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "2,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "3,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }
      }
    }
  };
}

describe("straight multi-cell route regression", () => {
  it("fills every intermediate army cell when the player clicks two cells straight ahead", async () => {
    const tool = new RouteToolController(identityGrid);
    tool.activate(armyActivation());

    expect(await tool.click({ x: 2, y: 0 })).toEqual({ accepted: true });
    expect(tool.snapshot()).toMatchObject({
      cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
      stepCostUnits: [1, 1],
      totalCostUnits: 2
    });
  });

  it("fills every intermediate ship cell and charges each forward step", async () => {
    const tool = new ShipRouteToolController({ snapGridCenter: async (point: Vector2) => ({ ...point }) });
    tool.activate(shipActivation());

    expect(await tool.click({ x: 2, y: 0 })).toEqual({ accepted: true });
    expect(tool.snapshot()).toMatchObject({
      cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
      stepCosts: [1, 1],
      spentMovementPoints: 2,
      finalFacing: "EAST"
    });
  });

  it("still rejects a genuinely diagonal destination", async () => {
    const army = new RouteToolController(identityGrid);
    army.activate(armyActivation());
    expect(await army.click({ x: 2, y: 1 })).toEqual({ accepted: false, reason: "NOT_ORTHOGONAL" });

    const ship = new ShipRouteToolController({ snapGridCenter: async (point: Vector2) => ({ ...point }) });
    ship.activate(shipActivation());
    expect(await ship.click({ x: 2, y: 1 })).toEqual({ accepted: false, reason: "NOT_ORTHOGONAL" });
  });
});
