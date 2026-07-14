import type { Vector2 } from "../shared/types";

export interface GridDistancePort {
  distance(from: Vector2, to: Vector2): Promise<number>;
}

export interface RouteLimitResult {
  lengthCells: number;
  remainingCells: number;
  valid: boolean;
  excessCells: number;
}

export async function measureRoute(
  start: Vector2,
  waypoints: readonly Vector2[],
  distancePort: GridDistancePort
): Promise<number> {
  let total = 0;
  let from = start;
  for (const waypoint of waypoints) {
    total += await distancePort.distance(from, waypoint);
    from = waypoint;
  }
  return total;
}

export async function evaluateRouteLimit(
  start: Vector2,
  waypoints: readonly Vector2[],
  limitCells: number,
  distancePort: GridDistancePort
): Promise<RouteLimitResult> {
  const lengthCells = await measureRoute(start, waypoints, distancePort);
  const valid = lengthCells <= limitCells;
  return {
    lengthCells,
    remainingCells: Math.max(0, limitCells - lengthCells),
    valid,
    excessCells: Math.max(0, lengthCells - limitCells)
  };
}
