import { describe, expect, it } from "vitest";
import { DEFAULT_TERRAIN } from "../../shared/constants";
import type { SceneState, TerrainType } from "../../shared/types";
import { createRegisteredShip } from "./shipLifecycle";
import { planShipStrategicRoute } from "./shipStrategicMovement";

function sea(): TerrainType {
  return {
    id: "sea",
    name: "Море",
    movementCostUnits: 2,
    enabled: true,
    movementDomains: ["SEA"],
    blocksNavalLos: false
  };
}

function scene(): Pick<SceneState, "terrain" | "gridMap"> {
  return {
    terrain: {
      ...structuredClone(DEFAULT_TERRAIN),
      defaultTerrainId: "sea",
      types: { ...structuredClone(DEFAULT_TERRAIN.types), sea: sea() }
    },
    gridMap: { version: 1, revision: 0, cells: {} }
  };
}

describe("ship strategic facing route regression", () => {
  it("charges a 90 degree turn before moving forward and continues on the new heading", () => {
    const ship = { ...createRegisteredShip("red", "IRONCLAD", "SOUTH"), globalMovementRemaining: 4 };
    expect(planShipStrategicRoute(scene(), ship, { x: 0, y: 0 }, [
      { x: 1, y: 0 },
      { x: 2, y: 0 }
    ])).toEqual({
      ok: true,
      cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
      cost: 3,
      remainingMovement: 1,
      finalFacing: "EAST"
    });
  });

  it("charges two turns before an opposite-direction forward step", () => {
    const ship = { ...createRegisteredShip("red", "IRONCLAD", "EAST"), globalMovementRemaining: 4 };
    expect(planShipStrategicRoute(scene(), ship, { x: 0, y: 0 }, [{ x: -1, y: 0 }])).toEqual({
      ok: true,
      cells: [{ x: -1, y: 0 }],
      cost: 3,
      remainingMovement: 1,
      finalFacing: "WEST"
    });
  });

  it("rejects a step when the required turn plus forward movement does not fit the OP budget", () => {
    const ship = { ...createRegisteredShip("red", "IRONCLAD", "SOUTH"), globalMovementRemaining: 1 };
    expect(planShipStrategicRoute(scene(), ship, { x: 0, y: 0 }, [{ x: 1, y: 0 }])).toEqual({
      ok: false,
      reason: "INSUFFICIENT_MOVEMENT_POINTS",
      cell: { x: 1, y: 0 }
    });
  });
});
