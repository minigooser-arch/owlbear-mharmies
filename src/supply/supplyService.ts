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

export function findSupplyPath(
  scene: SceneState,
  start: GridCellCoord,
  stateId: string,
  maxVisitedCells = 100_000
): GridCellCoord[] | null {
  const effectiveController = (cell: GridCellCoord) => {
    const state = readCell(scene.gridMap, cell);
    return state.deFactoStateId ?? state.recognizedStateId;
  };
  const isControlled = (cell: GridCellCoord) => effectiveController(cell) === stateId;
  const railwayCells = (scene.strategicCities ?? []).flatMap((city) => {
    const building = (city.buildings ?? []).find((candidate) => candidate.type === "RAILWAY_STATION");
    if (!building || !isCityBuildingActive(city, building, scene.gridMap, scene.states, scene.sides)) return [];
    // Building locations may be outside the city's territory and sparse grid maps
    // omit untouched cells. The station is still the endpoint of the active city
    // effect when its cell has no explicit controller; an explicitly enemy-held
    // station remains unusable.
    const stationController = effectiveController(building.cell);
    return stationController === null || stationController === stateId ? [building.cell] : [];
  });
  const isAnchor = (cell: GridCellCoord) => railwayCells.some((candidate) => cellKey(candidate) === cellKey(cell)) ||
    // Legacy scenes without city records retain the old recognized-state endpoint until migrated.
    ((scene.strategicCities ?? []).length === 0 && effectiveController(cell) === stateId && readCell(scene.gridMap, cell).recognizedStateId === stateId);
  if (!isControlled(start) && !isAnchor(start)) return null;
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
      if (parents.has(nextKey) || (!isControlled(next) && !isAnchor(next))) continue;
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

/**
 * Rechecks current supply without applying checkpoint damage. This is used when a
 * supply source changes during a movement phase, such as adding a railway station.
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
    const supplied = embarkedShip !== undefined && shipEmbarkedArmyIds(embarkedShip).includes(armyId)
      ? true
      : (() => {
          const factionState = stateForFaction(scene, army.sideId);
          const armyCell = armyCells[armyId];
          return factionState && armyCell ? isArmySupplied(scene, army, armyCell) : true;
        })();
    const nextSupply = supplied
      ? { supplied: true, checkedOnTurn: checkedOnTurn }
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

