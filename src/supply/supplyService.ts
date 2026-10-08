import { stateForFaction } from "../states/stateRules";
import { readCell } from "../terrain/gridMap";
import { shipEmbarkedArmyIds } from "../naval/transport/transportRules";
import type { ArmyState, GridCellCoord, SceneState } from "../shared/types";
import { cellKey } from "../grid/strategicGrid";
import { isCityBuildingActive } from "../cities/cityBuildingRules";

const NEIGHBORS = [
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 }
] as const;

/**
 * A state may trace supply through land it still controls, including occupied
 * foreign territory. Recognition alone never overrides another occupier.
 * Legacy cells with no de-facto annotation keep their recognized controller.
 */
function isStateControlledCell(scene: SceneState, cell: GridCellCoord, stateId: string): boolean {
  const value = readCell(scene.gridMap, cell);
  return !value.impassable && (
    value.deFactoStateId === stateId ||
    (value.deFactoStateId == null && value.recognizedStateId === stateId)
  );
}

/**
 * Capitals and active ports are the only land supply sources. Railway stations
 * are infrastructure, not supply sources.
 */
function supplySourceKeys(scene: SceneState, stateId: string): Set<string> {
  const result = new Set<string>();
  for (const city of scene.strategicCities ?? []) {
    // A nation's original capital ceases supplying it when lost to an occupier.
    if (city.isCapital && city.recognizedStateId === stateId) {
      for (const cell of city.cells) {
        if (isStateControlledCell(scene, cell, stateId)) result.add(cellKey(cell));
      }
    }

    // A port is usable only while its city's controlling faction belongs to
    // this state and the building remains active.
    const influencingSide = scene.sides.find((side) => side.id === city.factionInfluenceId);
    if (influencingSide?.stateId !== stateId) continue;
    const port = city.buildings?.find((building) => building.type === "PORT");
    if (!port || !isCityBuildingActive(city, port, scene.gridMap, scene.states, scene.sides)) continue;

    if (isStateControlledCell(scene, port.cell, stateId)) {
      result.add(cellKey(port.cell));
    } else {
      // A port may be placed in an unclaimed coastal water cell. It supplies
      // from the state's controlled city shoreline, never across water or a
      // foreign-controlled port cell.
      const portCell = readCell(scene.gridMap, port.cell);
      if (portCell.recognizedStateId == null && portCell.deFactoStateId == null) {
        for (const cell of city.cells) {
          if (isStateControlledCell(scene, cell, stateId)) result.add(cellKey(cell));
        }
      }
    }
  }
  return result;
}

/**
 * Returns the shortest orthogonal path from an army to a controlled capital
 * or active port, or null if the supply line is blocked. Every path cell,
 * including the army's cell and the source, must be state-controlled.
 */
export function findSupplyPath(
  scene: SceneState,
  start: GridCellCoord,
  stateId: string,
  maxVisitedCells = 100_000
): GridCellCoord[] | null {
  if (!Number.isInteger(maxVisitedCells) || maxVisitedCells < 1) return null;
  if (!isStateControlledCell(scene, start, stateId)) return null;

  const sourceKeys = supplySourceKeys(scene, stateId);
  if (sourceKeys.size === 0) return null;

  const startKey = cellKey(start);
  const queue: GridCellCoord[] = [{ ...start }];
  const parents = new Map<string, string | null>([[startKey, null]]);
  let head = 0;
  while (head < queue.length && head < maxVisitedCells) {
    const current = queue[head++];
    if (!current) break;
    const currentKey = cellKey(current);
    if (sourceKeys.has(currentKey)) {
      const path: GridCellCoord[] = [];
      let key: string | null = currentKey;
      while (key !== null) {
        const [rawX, rawY] = key.split(",");
        const x = Number(rawX);
        const y = Number(rawY);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        path.push({ x, y });
        key = parents.get(key) ?? null;
      }
      return path.reverse();
    }
    for (const delta of NEIGHBORS) {
      const next = { x: current.x + delta.x, y: current.y + delta.y };
      const nextKey = cellKey(next);
      if (parents.has(nextKey) || parents.size >= maxVisitedCells ||
          !isStateControlledCell(scene, next, stateId)) continue;
      parents.set(nextKey, currentKey);
      queue.push(next);
    }
  }
  return null;
}

export function isArmySupplied(scene: SceneState, army: ArmyState, armyCell: GridCellCoord): boolean {
  const state = stateForFaction(scene, army.sideId);
  return state ? findSupplyPath(scene, armyCell, state.id) !== null : false;
}

/**
 * Rechecks current supply without applying checkpoint damage. This allows
 * supply to update as soon as capitals and ports are created, edited or lost.
 */
export function recalculateArmySupply(
  scene: SceneState,
  armies: Readonly<Record<string, ArmyState>>,
  armyCells: Readonly<Record<string, GridCellCoord>>,
  checkedOnTurn = scene.turn.turnNumber
): Record<string, ArmyState> {
  const nextArmies = structuredClone(armies) as Record<string, ArmyState>;
  for (const [armyId, army] of Object.entries(nextArmies)) {
    const embarkedShipId = army.embarkedOnShipId ?? null;
    const embarkedShip = embarkedShipId !== null ? scene.ships?.[embarkedShipId] : undefined;
    const factionState = stateForFaction(scene, army.sideId);
    const armyCell = armyCells[armyId];
    const supplied = embarkedShip !== undefined && shipEmbarkedArmyIds(embarkedShip).includes(armyId)
      ? true
      : !factionState
        ? false
        : armyCell
          ? isArmySupplied(scene, army, armyCell)
          : army.supply.supplied;
    const nextSupply = supplied
      ? { supplied: true, checkedOnTurn }
      : {
          supplied: false,
          checkedOnTurn,
          ...(army.supply.unsuppliedSinceTurn === undefined
            ? { unsuppliedSinceTurn: checkedOnTurn }
            : { unsuppliedSinceTurn: army.supply.unsuppliedSinceTurn })
        };
    if (JSON.stringify(army.supply) === JSON.stringify(nextSupply)) continue;
    nextArmies[armyId] = { ...army, supply: nextSupply, revision: army.revision + 1 };
  }
  return nextArmies;
}
