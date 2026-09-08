import type { GridCellCoord, SceneState, ShipFacing, ShipState } from "../../shared/types";
import { readCell } from "../../terrain/gridMap";
import { cellSupportsDomain } from "../../terrain/movementDomains";

export type ShipStrategicMovementFailure =
  | "NOT_ORTHOGONAL"
  | "IMPASSABLE"
  | "NON_NAVAL_TERRAIN"
  | "INSUFFICIENT_MOVEMENT_POINTS";

export type ShipStrategicRoutePlan =
  | {
      ok: true;
      cells: GridCellCoord[];
      cost: number;
      remainingMovement: number;
      finalFacing: ShipFacing;
    }
  | {
      ok: false;
      reason: ShipStrategicMovementFailure;
      cell?: GridCellCoord;
    };

type StrategicMovementScene = Pick<SceneState, "terrain" | "gridMap">;

const FACING_INDEX: Readonly<Record<ShipFacing, number>> = {
  NORTH: 0,
  EAST: 1,
  SOUTH: 2,
  WEST: 3
};

export function facingForStrategicStep(
  from: GridCellCoord,
  to: GridCellCoord
): ShipFacing | undefined {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 1 && dy === 0) return "EAST";
  if (dx === -1 && dy === 0) return "WEST";
  if (dx === 0 && dy === 1) return "SOUTH";
  if (dx === 0 && dy === -1) return "NORTH";
  return undefined;
}

export function strategicTurnCost(from: ShipFacing, to: ShipFacing): number {
  const difference = Math.abs(FACING_INDEX[from] - FACING_INDEX[to]);
  return Math.min(difference, 4 - difference);
}

export function planShipStrategicRoute(
  scene: StrategicMovementScene,
  ship: ShipState,
  startCell: GridCellCoord,
  cells: readonly GridCellCoord[]
): ShipStrategicRoutePlan {
  let previous = startCell;
  let facing = ship.facing;
  let cost = 0;

  for (const cell of cells) {
    const requiredFacing = facingForStrategicStep(previous, cell);
    if (!requiredFacing) {
      return { ok: false, reason: "NOT_ORTHOGONAL", cell: { ...cell } };
    }
    const state = readCell(scene.gridMap, cell);
    if (state.impassable) {
      return { ok: false, reason: "IMPASSABLE", cell: { ...cell } };
    }
    if (!cellSupportsDomain(scene, cell, "SEA")) {
      return { ok: false, reason: "NON_NAVAL_TERRAIN", cell: { ...cell } };
    }

    const stepCost = strategicTurnCost(facing, requiredFacing) + 1;
    if (cost + stepCost > ship.globalMovementRemaining) {
      return { ok: false, reason: "INSUFFICIENT_MOVEMENT_POINTS", cell: { ...cell } };
    }
    cost += stepCost;
    facing = requiredFacing;
    previous = cell;
  }

  return {
    ok: true,
    cells: cells.map((cell) => ({ ...cell })),
    cost,
    remainingMovement: ship.globalMovementRemaining - cost,
    finalFacing: facing
  };
}

export function commitShipStrategicRoute(
  ship: ShipState,
  cells: readonly GridCellCoord[],
  cost: number
): ShipState {
  return {
    ...ship,
    plannedRoute: cells.map((cell) => ({ ...cell })),
    globalMovementRemaining: ship.globalMovementRemaining - cost,
    movementSpentThisTurn: cost > 0 || ship.movementSpentThisTurn,
    revision: ship.revision + 1
  };
}
