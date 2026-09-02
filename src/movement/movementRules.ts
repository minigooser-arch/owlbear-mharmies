import { isOrthogonalNeighbor } from "../grid/strategicGrid";
import { getTerrain } from "../terrain/terrainRegistry";
import { isFactionAtWar } from "../wars/warRules";
import type {
  CellState,
  GridCellCoord,
  MovementDenialReason,
  TerrainRegistryState,
  WarState
} from "../shared/types";

export type MovementStepResult =
  | {
      allowed: true;
      stepCostUnits: number;
      remainingAfterUnits: number;
    }
  | {
      allowed: false;
      reason: MovementDenialReason;
      problemCell: GridCellCoord;
      stepCostUnits?: number;
      missingUnits?: number;
    };

export interface MovementStepContext {
  from: GridCellCoord;
  to: GridCellCoord;
  sideId: string;
  cell: CellState;
  terrain: TerrainRegistryState;
  wars: readonly WarState[];
  remainingUnits: number;
  withinBounds: boolean;
  armyStateAllowsMovement: boolean;
}

export function validateMovementStep(context: MovementStepContext): MovementStepResult {
  const problemCell = { ...context.to };
  if (!isOrthogonalNeighbor(context.from, context.to)) {
    return { allowed: false, reason: "NOT_ORTHOGONAL", problemCell };
  }
  if (!context.withinBounds) {
    return { allowed: false, reason: "OUTSIDE_MAP", problemCell };
  }
  if (context.cell.impassable) {
    return { allowed: false, reason: "IMPASSABLE", problemCell };
  }
  if (!isFactionAtWar(context.wars, context.sideId) && !context.cell.factionTerritoryIds.includes(context.sideId)) {
    return { allowed: false, reason: "OUTSIDE_FACTION_TERRITORY", problemCell };
  }
  const terrain = getTerrain(context.terrain, context.cell.terrainId);
  if (!terrain.ok) {
    return { allowed: false, reason: "INVALID_TERRAIN", problemCell };
  }
  const stepCostUnits = terrain.terrain.movementCostUnits;
  if (context.remainingUnits < stepCostUnits) {
    return {
      allowed: false,
      reason: "INSUFFICIENT_MOVEMENT_POINTS",
      problemCell,
      stepCostUnits,
      missingUnits: stepCostUnits - context.remainingUnits
    };
  }
  if (!context.armyStateAllowsMovement) {
    return { allowed: false, reason: "ARMY_STATE_BLOCKS_MOVEMENT", problemCell, stepCostUnits };
  }
  return {
    allowed: true,
    stepCostUnits,
    remainingAfterUnits: context.remainingUnits - stepCostUnits
  };
}

export interface PlannedRouteValidationContext {
  start: GridCellCoord;
  cells: readonly GridCellCoord[];
  sideId: string;
  terrain: TerrainRegistryState;
  wars: readonly WarState[];
  remainingUnits: number;
  readCell: (cell: GridCellCoord) => CellState;
  withinBounds?: (cell: GridCellCoord) => boolean;
  armyStateAllowsMovement?: boolean;
}

export type PlannedRouteValidationResult =
  | { valid: true; totalCostUnits: number; remainingAfterUnits: number }
  | {
      valid: false;
      totalCostUnits: number;
      remainingAfterUnits: number;
      reason: MovementDenialReason;
      problemCell: GridCellCoord;
      missingUnits?: number;
    };

export function validatePlannedRoute(context: PlannedRouteValidationContext): PlannedRouteValidationResult {
  let from = { ...context.start };
  let remainingUnits = context.remainingUnits;
  let totalCostUnits = 0;
  for (const to of context.cells) {
    const step = validateMovementStep({
      from,
      to,
      sideId: context.sideId,
      cell: context.readCell(to),
      terrain: context.terrain,
      wars: context.wars,
      remainingUnits,
      withinBounds: context.withinBounds?.(to) ?? true,
      armyStateAllowsMovement: context.armyStateAllowsMovement ?? true
    });
    if (!step.allowed) {
      const result: PlannedRouteValidationResult = {
        valid: false,
        totalCostUnits,
        remainingAfterUnits: remainingUnits,
        reason: step.reason,
        problemCell: { ...step.problemCell }
      };
      if (step.missingUnits !== undefined) result.missingUnits = step.missingUnits;
      return result;
    }
    totalCostUnits += step.stepCostUnits;
    remainingUnits = step.remainingAfterUnits;
    from = { ...to };
  }
  return { valid: true, totalCostUnits, remainingAfterUnits: remainingUnits };
}
