import { cellKey } from "../grid/strategicGrid";
import type { CellState, GridCellCoord, GridMapState } from "../shared/types";

export const DEFAULT_CELL_STATE: CellState = {
  terrainId: null,
  impassable: false,
  factionTerritoryIds: [],
  recognizedStateId: null,
  deFactoStateId: null
};

export interface CellPatch {
  terrainId?: string | null;
  impassable?: boolean;
  factionTerritoryIds?: readonly string[];
  recognizedStateId?: string | null;
  deFactoStateId?: string | null;
}

export interface CellPatchOperation {
  cell: GridCellCoord;
  patch: CellPatch;
}

function normalizeIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => id.trim().length > 0))].sort();
}

function isDefaultCell(cell: CellState): boolean {
  return cell.terrainId === null && !cell.impassable && cell.factionTerritoryIds.length === 0 && cell.recognizedStateId === null && cell.deFactoStateId === null;
}

export function readCell(gridMap: GridMapState, cell: GridCellCoord): CellState {
  const stored = gridMap.cells[cellKey(cell)];
  return stored
    ? {
        terrainId: stored.terrainId,
        impassable: stored.impassable,
        factionTerritoryIds: [...stored.factionTerritoryIds],
        recognizedStateId: stored.recognizedStateId,
        deFactoStateId: stored.deFactoStateId
      }
    : structuredClone(DEFAULT_CELL_STATE);
}

export function applyCellPatchBatch(
  gridMap: GridMapState,
  operations: readonly CellPatchOperation[]
): GridMapState {
  if (operations.length === 0) return gridMap;
  const cells = { ...gridMap.cells };
  const byKey = new Map<string, CellPatch>();
  for (const operation of operations) {
    const key = cellKey(operation.cell);
    byKey.set(key, { ...byKey.get(key), ...operation.patch });
  }
  let changed = false;
  for (const [key, patch] of byKey) {
    const existing = cells[key] ?? DEFAULT_CELL_STATE;
    const next: CellState = {
      terrainId: patch.terrainId !== undefined ? patch.terrainId : existing.terrainId,
      impassable: patch.impassable !== undefined ? patch.impassable : existing.impassable,
      factionTerritoryIds: patch.factionTerritoryIds !== undefined
        ? normalizeIds(patch.factionTerritoryIds)
        : [...existing.factionTerritoryIds],
      recognizedStateId: patch.recognizedStateId !== undefined ? patch.recognizedStateId : existing.recognizedStateId,
      deFactoStateId: patch.deFactoStateId !== undefined ? patch.deFactoStateId : existing.deFactoStateId
    };
    const before = JSON.stringify(existing);
    const after = JSON.stringify(next);
    if (before === after) continue;
    changed = true;
    if (isDefaultCell(next)) Reflect.deleteProperty(cells, key);
    else cells[key] = next;
  }
  return changed
    ? { version: 1, cells, revision: gridMap.revision + 1 }
    : gridMap;
}
