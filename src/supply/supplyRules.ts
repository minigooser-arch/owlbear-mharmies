import type { CellState, GridCellCoord } from "../shared/types";
import { cellKey } from "../grid/strategicGrid";

export interface SupplyRouteInput {
  start: GridCellCoord;
  stateId: string;
  readCell(cell: GridCellCoord): CellState;
  maxVisitedCells?: number;
}

const NEIGHBORS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
] as const;

function isSupplyCell(cell: CellState, stateId: string): boolean {
  return cell.deFactoStateId === stateId;
}

function isSupplyAnchor(cell: CellState, stateId: string): boolean {
  return cell.deFactoStateId === stateId && cell.recognizedStateId === stateId;
}

export function hasSupplyRoute(input: SupplyRouteInput): boolean {
  const startCell = input.readCell(input.start);
  if (!isSupplyCell(startCell, input.stateId)) return false;
  if (isSupplyAnchor(startCell, input.stateId)) return true;

  const limit = input.maxVisitedCells ?? 100_000;
  const queue: GridCellCoord[] = [{ ...input.start }];
  let head = 0;
  const visited = new Set<string>([cellKey(input.start)]);

  while (head < queue.length && visited.size <= limit) {
    const current = queue[head++];
    if (!current) break;
    for (const delta of NEIGHBORS) {
      const neighbor = { x: current.x + delta.x, y: current.y + delta.y };
      const key = cellKey(neighbor);
      if (visited.has(key)) continue;
      visited.add(key);
      const cell = input.readCell(neighbor);
      if (!isSupplyCell(cell, input.stateId)) continue;
      if (isSupplyAnchor(cell, input.stateId)) return true;
      queue.push(neighbor);
    }
  }
  return false;
}
