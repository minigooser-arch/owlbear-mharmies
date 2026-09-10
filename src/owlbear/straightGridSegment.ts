import type { GridCellCoord } from "../shared/types";

/**
 * Returns every cell entered while travelling from `from` to `to` along one
 * horizontal or vertical segment. The starting cell is excluded and the
 * destination is included. A diagonal destination has no valid straight segment.
 */
export function straightGridSegment(
  from: GridCellCoord,
  to: GridCellCoord
): GridCellCoord[] | undefined {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx !== 0 && dy !== 0) return undefined;
  if (dx === 0 && dy === 0) return [];

  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const length = Math.abs(dx) + Math.abs(dy);
  return Array.from({ length }, (_, index) => ({
    x: from.x + stepX * (index + 1),
    y: from.y + stepY * (index + 1)
  }));
}
