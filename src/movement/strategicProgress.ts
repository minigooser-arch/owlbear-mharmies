import type { GridCellCoord } from "../shared/types";

function sameCell(left: GridCellCoord, right: GridCellCoord): boolean {
  return left.x === right.x && left.y === right.y;
}

/**
 * Returns the number of planned route cells whose boundaries have been entered.
 * `previousEnteredCount` is persisted so a slow move inside the same cell is never charged twice.
 * `movementWaypointIndex` is an upper-bound hint from the scene-space movement engine; the
 * final strategic cell wins, which keeps collision rewinds from charging cells that were not entered.
 */
export function resolveEnteredRouteCellCount(
  routeCells: readonly GridCellCoord[],
  previousEnteredCount: number,
  movementWaypointIndex: number,
  finalCell: GridCellCoord
): number {
  const previous = Math.max(0, Math.min(routeCells.length, Math.floor(previousEnteredCount)));
  if (routeCells.length === 0 || previous >= routeCells.length) return previous;

  const upperInclusive = Math.min(
    routeCells.length - 1,
    Math.max(previous, Math.max(0, Math.floor(movementWaypointIndex)))
  );
  for (let index = previous; index <= upperInclusive; index += 1) {
    const cell = routeCells[index];
    if (cell && sameCell(cell, finalCell)) return index + 1;
  }
  return previous;
}

export function unenteredRouteCells(
  routeCells: readonly GridCellCoord[],
  enteredCount: number
): GridCellCoord[] {
  const start = Math.max(0, Math.min(routeCells.length, Math.floor(enteredCount)));
  return routeCells.slice(start).map((cell) => ({ ...cell }));
}

export function movementCostUnitsForEnteredCells(
  routeCells: readonly GridCellCoord[],
  fromEnteredCount: number,
  toEnteredCount: number,
  costForCell: (cell: GridCellCoord) => number
): number {
  const from = Math.max(0, Math.min(routeCells.length, Math.floor(fromEnteredCount)));
  const to = Math.max(from, Math.min(routeCells.length, Math.floor(toEnteredCount)));
  let total = 0;
  for (let index = from; index < to; index += 1) {
    const cell = routeCells[index];
    if (cell) total += costForCell(cell);
  }
  return total;
}

export interface StrategicMovementProgressInput {
  routeCells: readonly GridCellCoord[];
  previousEnteredCount: number;
  movementWaypointIndex: number;
  finalCell: GridCellCoord;
  remainingUnits: number;
  costForCell: (cell: GridCellCoord) => number;
}

export interface StrategicMovementProgressResult {
  enteredRouteCellCount: number;
  spentUnits: number;
  remainingUnits: number;
}

export function reconcileStrategicMovementProgress(
  input: StrategicMovementProgressInput
): StrategicMovementProgressResult {
  const enteredRouteCellCount = resolveEnteredRouteCellCount(
    input.routeCells,
    input.previousEnteredCount,
    input.movementWaypointIndex,
    input.finalCell
  );
  const spentUnits = movementCostUnitsForEnteredCells(
    input.routeCells,
    input.previousEnteredCount,
    enteredRouteCellCount,
    input.costForCell
  );
  return {
    enteredRouteCellCount,
    spentUnits,
    remainingUnits: Math.max(0, input.remainingUnits - spentUnits)
  };
}
