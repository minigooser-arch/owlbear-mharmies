import { stateForFaction } from "../states/stateRules";
import { hasMilitaryAccess } from "../states/stateRelations";
import { readCell } from "../terrain/gridMap";
import type { ArmyState, GridCellCoord, SceneState, StrategicCity } from "../shared/types";
import { cellKey } from "../grid/strategicGrid";
import { isCityBuildingActive } from "../cities/cityBuildingRules";

const NEIGHBORS = [
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 }
] as const;

function effectiveController(scene: SceneState, cell: GridCellCoord): string | null {
  const state = readCell(scene.gridMap, cell);
  return state.deFactoStateId ?? state.recognizedStateId;
}

function activeBuilding(scene: SceneState, city: StrategicCity, type: string) {
  const building = (city.buildings ?? []).find((candidate) => candidate.type === type);
  return building && isCityBuildingActive(city, building, scene.gridMap, scene.states, scene.sides)
    ? building
    : undefined;
}

function cityInfluenceStateId(scene: SceneState, city: StrategicCity): string | null {
  if (!city.factionInfluenceId) return null;
  return scene.sides.find((side) => side.id === city.factionInfluenceId)?.stateId ?? null;
}

export function canStateUseRailwayCity(scene: SceneState, stateId: string, city: StrategicCity): boolean {
  const station = activeBuilding(scene, city, "RAILWAY_STATION");
  const hostStateId = cityInfluenceStateId(scene, city);
  if (!station || !hostStateId || effectiveController(scene, station.cell) !== hostStateId) return false;
  if (hostStateId === stateId) return true;
  if (!activeBuilding(scene, city, "MILITARY_LOGISTICS_CENTER")) return false;
  return hasMilitaryAccess(scene.stateRelations ?? {}, stateId, hostStateId);
}

function railwayAnchors(scene: SceneState, stateId: string): Array<{ cell: GridCellCoord; hostStateId: string }> {
  return (scene.strategicCities ?? []).flatMap((city) => {
    if (!canStateUseRailwayCity(scene, stateId, city)) return [];
    const station = activeBuilding(scene, city, "RAILWAY_STATION");
    const hostStateId = cityInfluenceStateId(scene, city);
    return station && hostStateId ? [{ cell: station.cell, hostStateId }] : [];
  });
}

function findPathToAnchor(
  scene: SceneState,
  start: GridCellCoord,
  stateId: string,
  anchor: { cell: GridCellCoord; hostStateId: string },
  maxVisitedCells: number
): GridCellCoord[] | null {
  const allowedControllers = new Set([stateId, anchor.hostStateId]);
  if (!allowedControllers.has(effectiveController(scene, start) ?? "")) return null;

  const queue: GridCellCoord[] = [{ ...start }];
  const parents = new Map<string, string | null>([[cellKey(start), null]]);
  let head = 0;
  const anchorKey = cellKey(anchor.cell);

  while (head < queue.length && parents.size <= maxVisitedCells) {
    const current = queue[head++];
    if (!current) break;
    const currentKey = cellKey(current);
    if (currentKey === anchorKey) {
      const path: GridCellCoord[] = [];
      let key: string | null = currentKey;
      while (key) {
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
      if (parents.has(nextKey)) continue;
      const controller = effectiveController(scene, next);
      if (!controller || !allowedControllers.has(controller)) continue;
      parents.set(nextKey, currentKey);
      queue.push(next);
    }
  }
  return null;
}

function findLegacySupplyPath(
  scene: SceneState,
  start: GridCellCoord,
  stateId: string,
  maxVisitedCells: number
): GridCellCoord[] | null {
  if (effectiveController(scene, start) !== stateId) return null;
  const queue: GridCellCoord[] = [{ ...start }];
  const parents = new Map<string, string | null>([[cellKey(start), null]]);
  let head = 0;

  while (head < queue.length && parents.size <= maxVisitedCells) {
    const current = queue[head++];
    if (!current) break;
    const currentKey = cellKey(current);
    const cell = readCell(scene.gridMap, current);
    if (effectiveController(scene, current) === stateId && cell.recognizedStateId === stateId) {
      const path: GridCellCoord[] = [];
      let key: string | null = currentKey;
      while (key) {
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
      if (parents.has(nextKey) || effectiveController(scene, next) !== stateId) continue;
      parents.set(nextKey, currentKey);
      queue.push(next);
    }
  }
  return null;
}

export function findSupplyPath(
  scene: SceneState,
  start: GridCellCoord,
  stateId: string,
  maxVisitedCells = 100_000
): GridCellCoord[] | null {
  if ((scene.strategicCities ?? []).length === 0) {
    return findLegacySupplyPath(scene, start, stateId, maxVisitedCells);
  }
  const anchors = railwayAnchors(scene, stateId);
  if (anchors.length === 0) return null;

  let shortest: GridCellCoord[] | null = null;
  for (const anchor of anchors) {
    const candidate = findPathToAnchor(scene, start, stateId, anchor, maxVisitedCells);
    if (candidate && (!shortest || candidate.length < shortest.length)) shortest = candidate;
  }
  return shortest;
}

export function hasRailwayGraceAtCell(
  scene: SceneState,
  stateId: string,
  cell: GridCellCoord
): boolean {
  return (scene.strategicCities ?? []).some((city) =>
    city.cells.some((candidate) => cellKey(candidate) === cellKey(cell)) &&
    canStateUseRailwayCity(scene, stateId, city)
  );
}

export function isArmySupplied(scene: SceneState, army: ArmyState, armyCell: GridCellCoord): boolean {
  const state = stateForFaction(scene, army.sideId);
  return state ? findSupplyPath(scene, armyCell, state.id) !== null : false;
}
