import type { GridCellCoord, SceneState, ShipFacing, ShipState } from "../../shared/types";
import { readCell } from "../../terrain/gridMap";
import { cellSupportsDomain } from "../../terrain/movementDomains";
import { facingForStep, quarterTurnCost } from "./shipHeading";

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
      stepCosts: number[];
      terminalTurnCost: number;
    }
  | {
      ok: false;
      reason: ShipStrategicMovementFailure;
      cell?: GridCellCoord;
    };

type StrategicMovementScene = Pick<SceneState, "terrain" | "gridMap">;

export function shipStrategicRouteCost(
  startCell: GridCellCoord,
  initialFacing: ShipFacing,
  cells: readonly GridCellCoord[],
  terminalFacing?: ShipFacing | null
): number | undefined {
  let previous = startCell;
  let facing = initialFacing;
  let cost = 0;
  for (const cell of cells) {
    const requiredFacing = facingForStep(previous, cell);
    if (!requiredFacing) return undefined;
    cost += quarterTurnCost(facing, requiredFacing) + 1;
    facing = requiredFacing;
    previous = cell;
  }
  if (terminalFacing) cost += quarterTurnCost(facing, terminalFacing);
  return cost;
}

export function planShipStrategicRoute(
  scene: StrategicMovementScene,
  ship: ShipState,
  startCell: GridCellCoord,
  cells: readonly GridCellCoord[],
  terminalFacing?: ShipFacing | null
): ShipStrategicRoutePlan {
  let previous = startCell;
  let facing = ship.facing;
  let cost = 0;
  const stepCosts: number[] = [];

  for (const cell of cells) {
    const requiredFacing = facingForStep(previous, cell);
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

    const stepCost = quarterTurnCost(facing, requiredFacing) + 1;
    if (cost + stepCost > ship.globalMovementRemaining) {
      return { ok: false, reason: "INSUFFICIENT_MOVEMENT_POINTS", cell: { ...cell } };
    }
    cost += stepCost;
    stepCosts.push(stepCost);
    facing = requiredFacing;
    previous = cell;
  }

  const terminalTurnCost = terminalFacing ? quarterTurnCost(facing, terminalFacing) : 0;
  if (cost + terminalTurnCost > ship.globalMovementRemaining) {
    return { ok: false, reason: "INSUFFICIENT_MOVEMENT_POINTS" };
  }
  cost += terminalTurnCost;
  if (terminalFacing) facing = terminalFacing;

  return {
    ok: true,
    cells: cells.map((cell) => ({ ...cell })),
    cost,
    remainingMovement: ship.globalMovementRemaining - cost,
    finalFacing: facing,
    stepCosts,
    terminalTurnCost
  };
}

export function commitShipStrategicRoute(
  ship: ShipState,
  cells: readonly GridCellCoord[],
  cost: number,
  terminalFacing?: ShipFacing | null
): ShipState {
  return {
    ...ship,
    plannedRoute: cells.map((cell) => ({ ...cell })),
    plannedFacing: terminalFacing ?? null,
    globalMovementRemaining: ship.globalMovementRemaining - cost,
    movementSpentThisTurn: cells.length > 0 || cost > 0 || ship.movementSpentThisTurn,
    revision: ship.revision + 1
  };
}
