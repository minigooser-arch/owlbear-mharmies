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
  return {
    minX: Math.min(army.from.x, army.to.x) - radius,
    minY: Math.min(army.from.y, army.to.y) - radius,
    maxX: Math.max(army.from.x, army.to.x) + radius,
    maxY: Math.max(army.from.y, army.to.y) + radius
  };
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
      interpolatePosition(left.from, left.to, middle),
      interpolatePosition(right.from, right.to, middle)
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
  const startLeft = interpolatePosition(left.from, left.to, startTime);
  const endLeft = interpolatePosition(left.from, left.to, endTime);
  const startRight = interpolatePosition(right.from, right.to, startTime);
  const endRight = interpolatePosition(right.from, right.to, endTime);
  const possibleClosingDistance =
    (await distancePort.distance(startLeft, endLeft)) +
    (await distancePort.distance(startRight, endRight));
  if (startDistance - possibleClosingDistance > threshold) return undefined;

  const middleTime = (startTime + endTime) / 2;
  const middleDistance = await distancePort.distance(
    interpolatePosition(left.from, left.to, middleTime),
    interpolatePosition(right.from, right.to, middleTime)
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
  const startDistance = await distancePort.distance(left.from, right.from);
  if (startDistance <= threshold) return 0;
  const endDistance = await distancePort.distance(left.to, right.to);
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
        positionA: interpolatePosition(left.from, left.to, time),
        positionB: interpolatePosition(right.from, right.to, time)
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
