import type { GridCellCoord, SceneState, ShipState } from "../../shared/types";
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
    }
  | {
      ok: false;
      reason: ShipStrategicMovementFailure;
      cell?: GridCellCoord;
    };

type StrategicMovementScene = Pick<SceneState, "terrain" | "gridMap">;

function orthogonallyAdjacent(left: GridCellCoord, right: GridCellCoord): boolean {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y) === 1;
}

export function planShipStrategicRoute(
  scene: StrategicMovementScene,
  ship: ShipState,
  startCell: GridCellCoord,
  cells: readonly GridCellCoord[]
): ShipStrategicRoutePlan {
  let previous = startCell;
  for (const cell of cells) {
    if (!orthogonallyAdjacent(previous, cell)) {
      return { ok: false, reason: "NOT_ORTHOGONAL", cell: { ...cell } };
    }
    const state = readCell(scene.gridMap, cell);
    if (state.impassable) {
      return { ok: false, reason: "IMPASSABLE", cell: { ...cell } };
    }
    if (!cellSupportsDomain(scene, cell, "SEA")) {
      return { ok: false, reason: "NON_NAVAL_TERRAIN", cell: { ...cell } };
    }
    previous = cell;
  }

  const cost = cells.length;
  if (cost > ship.globalMovementRemaining) {
    return { ok: false, reason: "INSUFFICIENT_MOVEMENT_POINTS" };
  }
  return {
    ok: true,
    cells: cells.map((cell) => ({ ...cell })),
    cost,
    remainingMovement: ship.globalMovementRemaining - cost
  };
}

export function commitShipStrategicRoute(
  ship: ShipState,
  cells: readonly GridCellCoord[]
): ShipState {
  return {
    ...ship,
    plannedRoute: cells.map((cell) => ({ ...cell })),
    globalMovementRemaining: ship.globalMovementRemaining - cells.length,
    movementSpentThisTurn: cells.length > 0 || ship.movementSpentThisTurn,
    revision: ship.revision + 1
  };
}
