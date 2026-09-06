import type { GridCellCoord, SceneState } from "../../shared/types";
import { hasNavalLineOfSight, strategicLineCells } from "../detection/navalLineOfSight";

type NavalLosScene = Pick<SceneState, "terrain" | "gridMap">;

function sameCell(left: GridCellCoord, right: GridCellCoord): boolean {
  return left.x === right.x && left.y === right.y;
}

export interface NavalBattleLineOfSightInput {
  scene: NavalLosScene;
  from: GridCellCoord;
  to: GridCellCoord;
  occupiedShipCells: readonly GridCellCoord[];
}

export function hasNavalBattleLineOfSight(input: NavalBattleLineOfSightInput): boolean {
  if (!hasNavalLineOfSight(input.scene, input.from, input.to)) return false;

  const intermediateCells = strategicLineCells(input.from, input.to);
  return !intermediateCells.some((lineCell) =>
    input.occupiedShipCells.some((occupiedCell) => sameCell(lineCell, occupiedCell))
  );
}
