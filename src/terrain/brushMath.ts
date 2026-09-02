import type { GridCellCoord } from "../shared/types";

export type BrushSize = 1 | 3 | 5;

function compareCells(left: GridCellCoord, right: GridCellCoord): number {
  return left.y - right.y || left.x - right.x;
}

function key(cell: GridCellCoord): string {
  return `${cell.x},${cell.y}`;
}

export function getBrushCells(center: GridCellCoord, size: BrushSize): GridCellCoord[] {
  const radius = (size - 1) / 2;
  const cells: GridCellCoord[] = [];
  for (let y = center.y - radius; y <= center.y + radius; y += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      cells.push({ x, y });
    }
  }
  return cells.sort(compareCells);
}

function rasterizeCenters(from: GridCellCoord, to: GridCellCoord): GridCellCoord[] {
  const centers: GridCellCoord[] = [];
  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - from.x);
  const sx = from.x < to.x ? 1 : -1;
  const dy = -Math.abs(to.y - from.y);
  const sy = from.y < to.y ? 1 : -1;
  let error = dx + dy;

  while (true) {
    centers.push({ x, y });
    if (x === to.x && y === to.y) break;
    const twice = 2 * error;
    if (twice >= dy) {
      error += dy;
      x += sx;
    }
    if (twice <= dx) {
      error += dx;
      y += sy;
    }
  }
  return centers;
}

export function rasterizeBrushStroke(
  previousCenter: GridCellCoord,
  currentCenter: GridCellCoord,
  size: BrushSize
): GridCellCoord[] {
  const cells = new Map<string, GridCellCoord>();
  for (const center of rasterizeCenters(previousCenter, currentCenter)) {
    for (const cell of getBrushCells(center, size)) cells.set(key(cell), cell);
  }
  return [...cells.values()].sort(compareCells);
}
