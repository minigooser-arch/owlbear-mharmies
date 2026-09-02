import { firstBarrierIntersection, type BarrierSegment } from "../barriers/barrierGeometry";
import type { StrategicGridAdapter } from "../grid/strategicGrid";
import type { GridCellCoord, Vector2 } from "../shared/types";
import { pointsEqual } from "./routeMath";

export type StrategicRouteShapeFailure = "INVALID_COMMAND" | "BARRIER";

export interface StrategicRouteShapeInput {
  start: Vector2;
  route: readonly Vector2[];
  startCell: GridCellCoord;
  cells: readonly GridCellCoord[];
  grid: Pick<StrategicGridAdapter, "sceneToCell" | "cellToSceneCenter">;
  barriers: readonly BarrierSegment[];
}

export function validateStrategicRouteShape(
  input: StrategicRouteShapeInput
): StrategicRouteShapeFailure | undefined {
  if (input.route.length !== input.cells.length) return "INVALID_COMMAND";
  const actualStartCell = input.grid.sceneToCell(input.start);
  if (actualStartCell.x !== input.startCell.x || actualStartCell.y !== input.startCell.y) {
    return "INVALID_COMMAND";
  }

  let from = input.start;
  for (const [index, cell] of input.cells.entries()) {
    const waypoint = input.route[index];
    if (!waypoint) return "INVALID_COMMAND";
    if (!pointsEqual(waypoint, input.grid.cellToSceneCenter(cell))) return "INVALID_COMMAND";
    if (firstBarrierIntersection({ from, to: waypoint }, input.barriers)) return "BARRIER";
    from = waypoint;
  }
  return undefined;
}
