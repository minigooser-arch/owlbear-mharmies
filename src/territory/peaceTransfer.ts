import { cellKey } from "../grid/strategicGrid";
import { applyCellPatchBatch } from "../terrain/gridMap";
import type { GridCellCoord, SceneState } from "../shared/types";

export type PeaceTransferResult =
  | { ok: true }
  | { ok: false; reason: "STATE_NOT_FOUND" }
  | { ok: false; reason: "TRANSFER_CELLS_EMPTY" }
  | { ok: false; reason: "TRANSFER_CELL_NOT_FOUND"; cell: GridCellCoord }
  | { ok: false; reason: "PARTIAL_CITY_TRANSFER"; cityId: string };

function normalizeCells(cells: readonly GridCellCoord[]): GridCellCoord[] {
  const result = new Map<string, GridCellCoord>();
  for (const cell of cells) result.set(cellKey(cell), { ...cell });
  return [...result.values()];
}

export function validatePeaceTransfer(
  scene: SceneState,
  recipientStateId: string,
  cells: readonly GridCellCoord[]
): PeaceTransferResult {
  if (!scene.states.some((state) => state.id === recipientStateId)) {
    return { ok: false, reason: "STATE_NOT_FOUND" };
  }

  const selected = normalizeCells(cells);
  if (selected.length === 0) return { ok: false, reason: "TRANSFER_CELLS_EMPTY" };

  const selectedKeys = new Set(selected.map(cellKey));
  for (const cell of selected) {
    if (!Object.hasOwn(scene.gridMap.cells, cellKey(cell))) {
      return { ok: false, reason: "TRANSFER_CELL_NOT_FOUND", cell: { ...cell } };
    }
  }

  for (const city of scene.strategicCities ?? []) {
    const selectedCount = city.cells.filter((cell) => selectedKeys.has(cellKey(cell))).length;
    if (selectedCount > 0 && selectedCount !== city.cells.length) {
      return { ok: false, reason: "PARTIAL_CITY_TRANSFER", cityId: city.id };
    }
  }

  return { ok: true };
}

export function applyPeaceTransfer(
  scene: SceneState,
  recipientStateId: string,
  cells: readonly GridCellCoord[]
): SceneState {
  const validation = validatePeaceTransfer(scene, recipientStateId, cells);
  if (!validation.ok) throw new Error(validation.reason);

  const selected = normalizeCells(cells);
  const selectedKeys = new Set(selected.map(cellKey));
  const next = structuredClone(scene);

  next.gridMap = applyCellPatchBatch(
    next.gridMap,
    selected.map((cell) => ({
      cell,
      patch: {
        recognizedStateId: recipientStateId,
        deFactoStateId: recipientStateId
      }
    }))
  );

  if (next.strategicCities) {
    next.strategicCities = next.strategicCities.map((city) =>
      city.cells.every((cell) => selectedKeys.has(cellKey(cell)))
        ? {
            ...city,
            recognizedStateId: recipientStateId,
            deFactoStateId: recipientStateId
          }
        : city
    );
  }

  return next;
}
