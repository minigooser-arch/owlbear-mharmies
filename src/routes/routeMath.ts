import type { Vector2 } from "../shared/types";

export interface GridDistancePort {
  distance(from: Vector2, to: Vector2): Promise<number>;
}

export interface GridRoutePort extends GridDistancePort {
  snapGridCenter(position: Vector2): Promise<Vector2>;
}

export interface RouteLimitResult {
  lengthCells: number;
  remainingCells: number;
  valid: boolean;
  excessCells: number;
}

export interface RouteEndpointResolution {
  point: Vector2;
  lengthCells: number;
  remainingCells: number;
  clamped: boolean;
}

export function pointsEqual(left: Vector2, right: Vector2): boolean {
  return left.x === right.x && left.y === right.y;
}

export function interpolatePoint(from: Vector2, to: Vector2, ratio: number): Vector2 {
  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio
  };
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

export async function resolveRouteEndpoint(
  start: Vector2,
  waypoints: readonly Vector2[],
  pointer: Vector2,
  limitCells: number,
  grid: GridRoutePort
): Promise<RouteEndpointResolution> {
  const snappedPointer = await grid.snapGridCenter(pointer);
  const directLength = await measureRoute(start, [...waypoints, snappedPointer], grid);
  if (directLength <= limitCells) {
    return {
      point: { ...snappedPointer },
      lengthCells: directLength,
      remainingCells: Math.max(0, limitCells - directLength),
      clamped: false
    };
  }

  const anchor = waypoints.at(-1) ?? start;
  let bestPoint = { ...anchor };
  let bestLength = await measureRoute(start, waypoints, grid);
  let low = 0;
  let high = 1;
  const measured = new Map<string, number>();

  for (let iteration = 0; iteration < 24; iteration += 1) {
    const ratio = (low + high) / 2;
    const candidate = await grid.snapGridCenter(interpolatePoint(anchor, pointer, ratio));
    const key = `${candidate.x}:${candidate.y}`;
    let length = measured.get(key);
    if (length === undefined) {
      length = await measureRoute(start, [...waypoints, candidate], grid);
      measured.set(key, length);
    }
    if (length <= limitCells) {
      low = ratio;
      bestPoint = { ...candidate };
      bestLength = length;
    } else {
      high = ratio;
    }
  }

  return {
    point: bestPoint,
    lengthCells: bestLength,
    remainingCells: 0,
    clamped: true
  };
}
