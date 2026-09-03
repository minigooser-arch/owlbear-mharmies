import { describe, expect, it } from "vitest";
import { DEFAULT_TERRAIN } from "../../shared/constants";
import type { SceneState, TerrainType } from "../../shared/types";
import { createRegisteredShip } from "./shipLifecycle";
import { commitShipStrategicRoute, planShipStrategicRoute } from "./shipStrategicMovement";

function terrain(id: string, movementDomains: TerrainType["movementDomains"]): TerrainType {
  return {
    id,
    name: id,
    movementCostUnits: 2,
    enabled: true,
    movementDomains,
    blocksNavalLos: !movementDomains.includes("SEA")
  };
}

function movementScene(): Pick<SceneState, "terrain" | "gridMap"> {
  return {
    terrain: {
      ...DEFAULT_TERRAIN,
      types: {
        ...DEFAULT_TERRAIN.types,
        sea: terrain("sea", ["SEA"]),
        canal: terrain("canal", ["LAND", "SEA"]),
        land: terrain("land", ["LAND"])
      }
    },
    gridMap: {
      version: 1,
      revision: 1,
      cells: {
        "1,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "2,0": { terrainId: "canal", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "3,0": { terrainId: "land", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "1,1": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "0,1": { terrainId: "sea", impassable: true, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }
      }
    }
  };
}

describe("strategic ship movement", () => {
  it("accepts an orthogonal route through sea and canal cells", () => {
    const ship = createRegisteredShip("red", "IRONCLAD", "EAST");
    expect(planShipStrategicRoute(movementScene(), ship, { x: 0, y: 0 }, [{ x: 1, y: 0 }, { x: 2, y: 0 }])).toEqual({
      ok: true,
      cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
      cost: 2,
      remainingMovement: 2
    });
  });

  it("rejects a LAND-only destination", () => {
    const ship = createRegisteredShip("red", "IRONCLAD", "EAST");
    expect(planShipStrategicRoute(movementScene(), ship, { x: 2, y: 0 }, [{ x: 3, y: 0 }])).toEqual({
      ok: false,
      reason: "NON_NAVAL_TERRAIN",
      cell: { x: 3, y: 0 }
    });
  });

  it("rejects diagonal strategic movement", () => {
    const ship = createRegisteredShip("red", "IRONCLAD", "EAST");
    expect(planShipStrategicRoute(movementScene(), ship, { x: 0, y: 0 }, [{ x: 1, y: 1 }])).toEqual({
      ok: false,
      reason: "NOT_ORTHOGONAL",
      cell: { x: 1, y: 1 }
    });
  });

  it("rejects impassable sea cells", () => {
    const ship = createRegisteredShip("red", "IRONCLAD", "NORTH");
    expect(planShipStrategicRoute(movementScene(), ship, { x: 0, y: 0 }, [{ x: 0, y: 1 }])).toEqual({
      ok: false,
      reason: "IMPASSABLE",
      cell: { x: 0, y: 1 }
    });
  });

  it("rejects a route longer than the ship's remaining global movement", () => {
    const ship = { ...createRegisteredShip("red", "CRUISER", "EAST"), globalMovementRemaining: 1 };
    expect(planShipStrategicRoute(movementScene(), ship, { x: 0, y: 0 }, [{ x: 1, y: 0 }, { x: 2, y: 0 }])).toEqual({
      ok: false,
      reason: "INSUFFICIENT_MOVEMENT_POINTS"
    });
  });

  it("commits the route by spending one movement point per cell without rotating the ship", () => {
    const ship = createRegisteredShip("red", "CRUISER", "SOUTH");
    const result = commitShipStrategicRoute(ship, [{ x: 1, y: 0 }, { x: 2, y: 0 }]);
    expect(result).toMatchObject({
      facing: "SOUTH",
      plannedRoute: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
      globalMovementRemaining: 1,
      movementSpentThisTurn: true,
      revision: 2
    });
  });
});
