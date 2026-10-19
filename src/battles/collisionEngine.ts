import type { GridDistancePort } from "../routes/routeMath";
import type { SideRelation, Vector2 } from "../shared/types";
import { interpolatePosition } from "../movement/interpolation";

const SEARCH_DEPTH = 14;
const BINARY_STEPS = 28;

export interface CollisionArmy {
  id: string;
  sideId: string;
  from: Vector2;
  to: Vector2;
  collisionRangeCells: number;
  broadPhaseRadiusPixels?: number;
  /** Full planned polyline, including `from` and `to`, when available. */
  path?: readonly Vector2[];
}

export interface CollisionInput {
  armies: readonly CollisionArmy[];
  relationForSides(leftSideId: string, rightSideId: string): SideRelation;
  distancePort: GridDistancePort;
}

export interface EnemyCollision {
  armyAId: string;
  armyBId: string;
  time: number;
  positionA: Vector2;
  positionB: Vector2;
}

function sweptBounds(army: CollisionArmy) {
  const radius = army.broadPhaseRadiusPixels;
  if (radius === undefined) return undefined;
  const points = army.path && army.path.length >= 2 ? army.path : [army.from, army.to];
  return {
    minX: Math.min(...points.map((point) => point.x)) - radius,
    minY: Math.min(...points.map((point) => point.y)) - radius,
    maxX: Math.max(...points.map((point) => point.x)) + radius,
    maxY: Math.max(...points.map((point) => point.y)) + radius
  };
}

function pathPointAt(army: CollisionArmy, time: number): Vector2 {
  const points = army.path && army.path.length >= 2 ? army.path : [army.from, army.to];
  const clampedTime = Math.max(0, Math.min(1, time));
  const lengths = points.slice(1).map((point, index) => {
    const from = points[index] ?? point;
    return Math.hypot(point.x - from.x, point.y - from.y);
  });
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total <= Number.EPSILON) return { ...(points[points.length - 1] ?? army.to) };

  let distance = total * clampedTime;
  for (let index = 0; index < lengths.length; index += 1) {
    const segmentLength = lengths[index] ?? 0;
    const from = points[index];
    const to = points[index + 1];
    if (!from || !to) continue;
    if (distance <= segmentLength || index === lengths.length - 1) {
      const progress = segmentLength <= Number.EPSILON ? 1 : distance / segmentLength;
      return interpolatePosition(from, to, progress);
    }
    distance -= segmentLength;
  }
  return { ...(points[points.length - 1] ?? army.to) };
}

function broadPhaseCouldContact(left: CollisionArmy, right: CollisionArmy): boolean {
  const a = sweptBounds(left);
  const b = sweptBounds(right);
  if (!a || !b) return true;
  return !(a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY);
}

async function bisectContact(
  left: CollisionArmy,
  right: CollisionArmy,
  low: number,
  high: number,
  threshold: number,
  distancePort: GridDistancePort
): Promise<number> {
  let outside = low;
  let inside = high;
  for (let index = 0; index < BINARY_STEPS; index += 1) {
    const middle = (outside + inside) / 2;
    const distance = await distancePort.distance(
      pathPointAt(left, middle),
      pathPointAt(right, middle)
    );
    if (distance <= threshold) inside = middle;
    else outside = middle;
  }
  return inside;
}

async function searchInterval(
  left: CollisionArmy,
  right: CollisionArmy,
  threshold: number,
  distancePort: GridDistancePort,
  startTime: number,
  endTime: number,
  startDistance: number,
  endDistance: number,
  depth: number
): Promise<number | undefined> {
  if (startDistance <= threshold) return startTime;
  const startLeft = pathPointAt(left, startTime);
  const endLeft = pathPointAt(left, endTime);
  const startRight = pathPointAt(right, startTime);
  const endRight = pathPointAt(right, endTime);
  const possibleClosingDistance =
    (await distancePort.distance(startLeft, endLeft)) +
    (await distancePort.distance(startRight, endRight));
  if (startDistance - possibleClosingDistance > threshold) return undefined;

  const middleTime = (startTime + endTime) / 2;
  const middleDistance = await distancePort.distance(
    pathPointAt(left, middleTime),
    pathPointAt(right, middleTime)
  );
  if (depth === 0) {
    if (middleDistance <= threshold) {
      return bisectContact(left, right, startTime, middleTime, threshold, distancePort);
    }
    if (endDistance <= threshold) {
      return bisectContact(left, right, middleTime, endTime, threshold, distancePort);
    }
    return undefined;
  }

  const leftHit = await searchInterval(
    left,
    right,
    threshold,
    distancePort,
    startTime,
    middleTime,
    startDistance,
    middleDistance,
    depth - 1
  );
  if (leftHit !== undefined) return leftHit;
  return searchInterval(
    left,
    right,
    threshold,
    distancePort,
    middleTime,
    endTime,
    middleDistance,
    endDistance,
    depth - 1
  );
}

async function collisionTime(
  left: CollisionArmy,
  right: CollisionArmy,
  distancePort: GridDistancePort
): Promise<number | undefined> {
  const threshold = Math.max(left.collisionRangeCells, right.collisionRangeCells);
  const startDistance = await distancePort.distance(pathPointAt(left, 0), pathPointAt(right, 0));
  if (startDistance <= threshold) return 0;
  const endDistance = await distancePort.distance(pathPointAt(left, 1), pathPointAt(right, 1));
  return searchInterval(
    left,
    right,
    threshold,
    distancePort,
    0,
    1,
    startDistance,
    endDistance,
    SEARCH_DEPTH
  );
}

const SIMULTANEOUS_EPSILON = 1e-6;

export async function findEarliestEnemyCollisions(
  input: CollisionInput
): Promise<EnemyCollision[]> {
  const collisions: EnemyCollision[] = [];
  for (let leftIndex = 0; leftIndex < input.armies.length; leftIndex += 1) {
    const left = input.armies[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < input.armies.length; rightIndex += 1) {
      const right = input.armies[rightIndex];
      if (
        !right ||
        left.sideId === right.sideId ||
        input.relationForSides(left.sideId, right.sideId) !== "ENEMY" ||
        !broadPhaseCouldContact(left, right)
      ) {
        continue;
      }
      const time = await collisionTime(left, right, input.distancePort);
      if (time === undefined) continue;
      collisions.push({
        armyAId: left.id,
        armyBId: right.id,
        time,
        positionA: pathPointAt(left, time),
        positionB: pathPointAt(right, time)
      });
    }
  }
  if (collisions.length === 0) return [];
  const earliestTime = Math.min(...collisions.map((collision) => collision.time));
  return collisions
    .filter((collision) => Math.abs(collision.time - earliestTime) <= SIMULTANEOUS_EPSILON)
    .sort((left, right) =>
      left.armyAId.localeCompare(right.armyAId, "en") || left.armyBId.localeCompare(right.armyBId, "en")
    );
}

export async function findEarliestEnemyCollision(
  input: CollisionInput
): Promise<EnemyCollision | undefined> {
  return (await findEarliestEnemyCollisions(input))[0];
}

