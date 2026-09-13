import { stateForFaction } from "../states/stateRules";
import { readCell } from "../terrain/gridMap";
import type { ArmyState, GridCellCoord, SceneState } from "../shared/types";
import { cellKey } from "../grid/strategicGrid";

const NEIGHBORS = [
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 }
] as const;

export function findSupplyPath(
  scene: SceneState,
  start: GridCellCoord,
  stateId: string,
  maxVisitedCells = 100_000
): GridCellCoord[] | null {
  const isControlled = (cell: GridCellCoord) => readCell(scene.gridMap, cell).deFactoStateId === stateId;
  const isAnchor = (cell: GridCellCoord) => {
    const state = readCell(scene.gridMap, cell);
    return state.deFactoStateId === stateId && state.recognizedStateId === stateId;
  };
  if (!isControlled(start)) return null;
  const queue: GridCellCoord[] = [{ ...start }];
  const parents = new Map<string, string | null>([[cellKey(start), null]]);
  let head = 0;
  while (head < queue.length && parents.size <= maxVisitedCells) {
    const current = queue[head++];
    if (!current) break;
    if (isAnchor(current)) {
      const path: GridCellCoord[] = [];
      let key: string | null = cellKey(current);
      while (key) {
        const parts = key.split(",");
        const x = Number(parts[0] ?? NaN);
        const y = Number(parts[1] ?? NaN);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        path.push({ x, y });
        key = parents.get(key) ?? null;
      }
      return path.reverse();
    }
    for (const delta of NEIGHBORS) {
      const next = { x: current.x + delta.x, y: current.y + delta.y };
      const nextKey = cellKey(next);
      if (parents.has(nextKey) || !isControlled(next)) continue;
      parents.set(nextKey, cellKey(current));
      queue.push(next);
    }
  }
  return null;
}

export function isArmySupplied(scene: SceneState, army: ArmyState, armyCell: GridCellCoord): boolean {
  const state = stateForFaction(scene, army.sideId);
  return state ? findSupplyPath(scene, armyCell, state.id) !== null : false;
}
