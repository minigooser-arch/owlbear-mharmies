import { describe, expect, it } from "vitest";
import type { GridDistancePort } from "../routes/routeMath";
import type { Vector2 } from "../shared/types";
import { advanceArmy } from "./movementEngine";

const distancePort: GridDistancePort = {
  distance: async (from: Vector2, to: Vector2) => Math.hypot(to.x - from.x, to.y - from.y)
};

describe("movement engine", () => {
  it("consumes multiple waypoints without overshooting", async () => {
    const result = await advanceArmy({
      position: { x: 0, y: 0 },
      waypoints: [{ x: 2, y: 0 }, { x: 5, y: 0 }],
      currentWaypointIndex: 0,
      segmentProgressCells: 0,
      speedCellsPerSecond: 3,
      deltaSeconds: 1,
      distancePort,
      movementBarriers: [],
      ignoresMovementBarriers: false
    });
    expect(result.position.x).toBeCloseTo(3);
    expect(result.position.y).toBe(0);
    expect(result.currentWaypointIndex).toBe(1);
    expect(result.status).toBe("MOVING");
  });

  it("stops before a movement barrier even with a large delta", async () => {
    const result = await advanceArmy({
      position: { x: 0, y: 0 },
      waypoints: [{ x: 10, y: 0 }],
      currentWaypointIndex: 0,
      segmentProgressCells: 0,
      speedCellsPerSecond: 10,
      deltaSeconds: 1,
      distancePort,
      movementBarriers: [{ barrierId: "wall", from: { x: 4, y: -2 }, to: { x: 4, y: 2 } }],
      ignoresMovementBarriers: false
    });
    expect(result.position.x).toBeLessThan(4);
    expect(result.position.x).toBeGreaterThan(3.99);
    expect(result.status).toBe("PAUSED");
    expect(result.stopReason).toBe("BARRIER");
  });

  it("pauses without moving after a coordinator sleep gap", async () => {
    const result = await advanceArmy({
      position: { x: 1, y: 1 },
      waypoints: [{ x: 10, y: 1 }],
      currentWaypointIndex: 0,
      segmentProgressCells: 0,
      speedCellsPerSecond: 2,
      deltaSeconds: 3.01,
      distancePort,
      movementBarriers: [],
      ignoresMovementBarriers: false
    });
    expect(result).toMatchObject({
      position: { x: 1, y: 1 },
      status: "PAUSED",
      stopReason: "COORDINATOR_GAP"
    });
  });

  it("marks the army ready when the final waypoint is reached", async () => {
    const result = await advanceArmy({
      position: { x: 0, y: 0 },
      waypoints: [{ x: 1, y: 0 }],
      currentWaypointIndex: 0,
      segmentProgressCells: 0,
      speedCellsPerSecond: 2,
      deltaSeconds: 1,
      distancePort,
      movementBarriers: [],
      ignoresMovementBarriers: false
    });
    expect(result).toMatchObject({
      position: { x: 1, y: 0 },
      currentWaypointIndex: 1,
      status: "READY",
      stopReason: "ARRIVED"
    });
  });
});
