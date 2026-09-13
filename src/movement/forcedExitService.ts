import { getDestinationMovementCostUnits } from "../terrain/terrainRegistry";
import { parseCellKey } from "../grid/strategicGrid";
import type { ArmyState, ForcedExitReason, ForcedExitState, GridCellCoord, SceneState } from "../shared/types";
import { cellSupportsDomain } from "../terrain/movementDomains";
import { readCell } from "../terrain/gridMap";
import { classifyStateMovementAccess } from "./stateMovementAccess";
import { findShortestForcedExitRoutes } from "./forcedExitPathfinder";

export function hasRightToRemain(scene: SceneState, army: ArmyState, cell: GridCellCoord): boolean {
  const access = classifyStateMovementAccess({
    sideId: army.sideId,
    destinationStateId: readCell(scene.gridMap, cell).recognizedStateId,
    sides: scene.sides,
    states: scene.states,
    stateRelations: scene.stateRelations ?? {}
  });
  return access.kind === "ALLOW_OWN_STATE" || access.kind === "ALLOW_UNOWNED" ||
    access.kind === "ALLOW_MILITARY_ACCESS" || access.kind === "ALLOW_WAR";
}

export function forcedExitRoutes(scene: SceneState, army: ArmyState, start: GridCellCoord): GridCellCoord[][] {
  const originStateId = readCell(scene.gridMap, start).recognizedStateId;
  return findShortestForcedExitRoutes({
    start,
    cells: Object.keys(scene.gridMap.cells).map(parseCellKey),
    canTraverse: (cell) => {
      const state = readCell(scene.gridMap, cell);
      return !state.impassable && cellSupportsDomain(scene, cell, "LAND") &&
        (state.recognizedStateId === originStateId || hasRightToRemain(scene, army, cell));
    },
    isLegalDestination: (cell) => hasRightToRemain(scene, army, cell)
  });
}

export function validateForcedExitRoute(
  scene: SceneState,
  army: ArmyState,
  start: GridCellCoord,
  route: readonly GridCellCoord[]
): {ok:true}|{ok:false;reason:"NOT_SHORTEST_EXIT"|"NO_EXIT_ROUTE"} {
  const exits = forcedExitRoutes(scene, army, start);
  if (exits.length === 0) return {ok:false,reason:"NO_EXIT_ROUTE"};
  let cursor = start;
  let remaining = exits[0]?.length ?? 0;
  let matches = route.length > 0 && route.length <= remaining;
  for (const cell of route) {
    if (!matches || Math.abs(cell.x - cursor.x) + Math.abs(cell.y - cursor.y) !== 1) { matches = false; break; }
    const suffix = hasRightToRemain(scene, army, cell) ? 0 : (forcedExitRoutes(scene, army, cell)[0]?.length ?? Infinity);
    const destination = readCell(scene.gridMap, cell);
    if (destination.impassable || !cellSupportsDomain(scene, cell, "LAND") || suffix !== remaining - 1 ||
        (destination.recognizedStateId !== readCell(scene.gridMap, start).recognizedStateId && !hasRightToRemain(scene, army, cell))) {
      matches = false; break;
    }
    cursor = cell;
    remaining = suffix;
  }
  return matches ? {ok:true} : {ok:false,reason:"NOT_SHORTEST_EXIT"};
}

export function reconcileForcedExitStates(
  scene: SceneState,
  armies: Readonly<Record<string, ArmyState>>,
  armyCells: Readonly<Record<string, GridCellCoord>>,
  startedOnTurn: number,
  originReason: ForcedExitReason = "OTHER"
): ForcedExitState[] {
  const existing = new Map((scene.forcedExitStates ?? []).map((state) => [state.armyId, state]));
  const result: ForcedExitState[] = [];
  for (const [armyId, army] of Object.entries(armies)) {
    const cell = armyCells[armyId];
    if (army.health.hp <= 0 || (army.embarkedOnShipId && scene.ships?.[army.embarkedOnShipId]?.embarkedArmyId === armyId)) continue;
    if (!cell) { const previous = existing.get(armyId); if (previous) result.push(previous); continue; }
    if (hasRightToRemain(scene, army, cell)) continue;
    result.push(existing.get(armyId) ?? {armyId,startedOnTurn,originReason});
  }
  return result;
}


export function forcedExitRouteGate(
  scene: SceneState, armyId: string, army: ArmyState,
  start: GridCellCoord, cells: readonly GridCellCoord[], turn = scene.turn.turnNumber
): import("./authoritativeStateMovement").PoliticalRouteGateResult | null {
  if (!(scene.forcedExitStates ?? []).some((entry) => entry.armyId === armyId && entry.startedOnTurn <= turn)) return null;
  if (hasRightToRemain(scene, army, start)) return null;
  const validation = validateForcedExitRoute(scene, army, start, cells);
  return validation.ok ? {allowedCellCount: cells.length} : {
    allowedCellCount: 0, blockedReason: validation.reason, blockedCell: {...(cells[0] ?? start)}
  };
}

export function forcedExitTurnRoute(scene: SceneState, army: ArmyState, start: GridCellCoord, budget = 10, preferred: readonly GridCellCoord[] = []): GridCellCoord[] {
  const last = preferred.at(-1);
  const validPreference = last && validateForcedExitRoute(scene, army, start, preferred).ok;
  const route = validPreference
    ? [...preferred, ...(hasRightToRemain(scene, army, last) ? [] : forcedExitRoutes(scene, army, last)[0] ?? [])]
    : forcedExitRoutes(scene, army, start)[0] ?? [];
  const result: GridCellCoord[] = [];
  for (const cell of route) {
    const cost = getDestinationMovementCostUnits(scene.terrain, readCell(scene.gridMap, cell));
    if (cost === undefined || cost > budget) break;
    result.push({...cell});
    budget -= cost;
  }
  return result;
}
