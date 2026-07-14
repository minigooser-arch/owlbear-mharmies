import { firstBarrierIntersection, type BarrierSegment } from "../barriers/barrierGeometry";
import type { GridDistancePort } from "../routes/routeMath";
import type { ArmyStatus, Vector2 } from "../shared/types";
import { interpolatePosition, isSleepGap } from "./interpolation";

const MAX_SUBSTEP_SECONDS = 0.2;
const DISTANCE_EPSILON = 1e-9;
const BARRIER_BACKOFF = 1e-6;

export interface MovementInput {
  position: Vector2;
  waypoints: readonly Vector2[];
  currentWaypointIndex: number;
  segmentProgressCells: number;
  speedCellsPerSecond: number;
  deltaSeconds: number;
  distancePort: GridDistancePort;
  movementBarriers: readonly BarrierSegment[];
  ignoresMovementBarriers: boolean;
}

export interface MovementResult {
  position: Vector2;
  currentWaypointIndex: number;
  segmentProgressCells: number;
  status: ArmyStatus;
  stopReason?: "BARRIER" | "COORDINATOR_GAP" | "ARRIVED";
}

function pausedForGap(input: MovementInput): MovementResult {
  return {
    position: { ...input.position },
    currentWaypointIndex: input.currentWaypointIndex,
    segmentProgressCells: input.segmentProgressCells,
    status: "PAUSED",
    stopReason: "COORDINATOR_GAP"
  };
}

export async function advanceArmy(input: MovementInput): Promise<MovementResult> {
  if (isSleepGap(input.deltaSeconds)) return pausedForGap(input);

  let position = { ...input.position };
  let currentWaypointIndex = Math.max(0, input.currentWaypointIndex);
  let segmentProgressCells = Math.max(0, input.segmentProgressCells);
  let remainingSeconds = Math.max(0, input.deltaSeconds);

  while (remainingSeconds > DISTANCE_EPSILON && currentWaypointIndex < input.waypoints.length) {
    const substepSeconds = Math.min(MAX_SUBSTEP_SECONDS, remainingSeconds);
    let movementBudget = input.speedCellsPerSecond * substepSeconds;
    remainingSeconds -= substepSeconds;

    while (movementBudget > DISTANCE_EPSILON && currentWaypointIndex < input.waypoints.length) {
      const target = input.waypoints[currentWaypointIndex];
      if (!target) break;
      const distanceCells = await input.distancePort.distance(position, target);
      if (distanceCells <= DISTANCE_EPSILON) {
        position = { ...target };
        currentWaypointIndex += 1;
        segmentProgressCells = 0;
        continue;
      }

      const consumedCells = Math.min(movementBudget, distanceCells);
      const candidate = interpolatePosition(position, target, consumedCells / distanceCells);
      if (!input.ignoresMovementBarriers) {
        const hit = firstBarrierIntersection(
          { from: position, to: candidate },
          input.movementBarriers
        );
        if (hit) {
          const safeProgress = Math.max(0, hit.t - BARRIER_BACKOFF);
          position = interpolatePosition(position, candidate, safeProgress);
          segmentProgressCells += consumedCells * safeProgress;
          return {
            position,
            currentWaypointIndex,
            segmentProgressCells,
            status: "PAUSED",
            stopReason: "BARRIER"
          };
        }
      }

      position = candidate;
      movementBudget -= consumedCells;
      segmentProgressCells += consumedCells;
      if (consumedCells >= distanceCells - DISTANCE_EPSILON) {
        position = { ...target };
        currentWaypointIndex += 1;
        segmentProgressCells = 0;
      }
    }
  }

  if (currentWaypointIndex >= input.waypoints.length) {
    return {
      position,
      currentWaypointIndex,
      segmentProgressCells: 0,
      status: "READY",
      stopReason: "ARRIVED"
    };
  }
  return { position, currentWaypointIndex, segmentProgressCells, status: "MOVING" };
}

export async function advanceMovingArmies(
  inputs: readonly MovementInput[]
): Promise<MovementResult[]> {
  return Promise.all(inputs.map(advanceArmy));
}
