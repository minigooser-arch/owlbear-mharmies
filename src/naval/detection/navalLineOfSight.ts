import type { GridCellCoord, SceneState } from "../../shared/types";
import { blocksNavalLos } from "../../terrain/movementDomains";

type NavalLosScene = Pick<SceneState, "terrain" | "gridMap">;

export function strategicLineCells(from: GridCellCoord, to: GridCellCoord): GridCellCoord[] {
  if (from.x === to.x && from.y === to.y) return [];

  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - from.x);
  const sx = from.x < to.x ? 1 : -1;
  const dy = -Math.abs(to.y - from.y);
  const sy = from.y < to.y ? 1 : -1;
  let error = dx + dy;
  const cells: GridCellCoord[] = [];

  while (x !== to.x || y !== to.y) {
    const doubled = error * 2;
    if (doubled >= dy) {
      error += dy;
      x += sx;
    }
    if (doubled <= dx) {
      error += dx;
      y += sy;
    }
    if (x === to.x && y === to.y) break;
    cells.push({ x, y });
  }

  return cells;
}

export function hasNavalLineOfSight(
  scene: NavalLosScene,
  from: GridCellCoord,
  to: GridCellCoord
): boolean {
  return strategicLineCells(from, to).every((cell) => !blocksNavalLos(scene, cell));
}
