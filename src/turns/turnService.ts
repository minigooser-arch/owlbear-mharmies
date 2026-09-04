import { destroyArmy } from "../armies/armyLifecycle";
import { applyEncirclementDamage } from "../health/armyHealth";
import { validatePlannedRoute } from "../movement/movementRules";
import { SHIP_CLASSES } from "../naval/ships/shipClasses";
import { stateForFaction } from "../states/stateRules";
import { hasSupplyRoute } from "../supply/supplyRules";
import { readCell } from "../terrain/gridMap";
import type { ArmyState, GridCellCoord, SceneState, TurnState } from "../shared/types";
import { deferredBoundary, getLatestStandardTurnBoundary, getNextStandardTurnBoundary } from "./turnSchedule";

export type TurnCompletionSource = "SCHEDULE" | "MANUAL";

export interface CompleteTurnInput {
  source: TurnCompletionSource;
  completedAt: Date;
  boundaryId?: string;
  /** Current strategic cells, resolved from authoritative Owlbear item positions. */
  armyCells: Readonly<Record<string, GridCellCoord>>;
}

export type CompleteTurnResult =
  | { changed: false; reason: "AUTO_TURNS_PAUSED" | "ALREADY_PROCESSED" }
  | { changed: true; scene: SceneState; armies: Record<string, ArmyState> };

function withoutStopReason(army: ArmyState): ArmyState {
  const rest = { ...army };
  delete rest.stopReason;
  return rest;
}

function prepareArmyForNewTurn(
  scene: SceneState,
  armyId: string,
  army: ArmyState,
  armyCell: GridCellCoord | undefined,
  nextTurn: number
): ArmyState {
  const factionState = stateForFaction(scene, army.sideId);
  const supplied = factionState && armyCell
    ? hasSupplyRoute({
        start: armyCell,
        stateId: factionState.id,
        readCell: (cell) => readCell(scene.gridMap, cell)
      })
    : true;

  let next: ArmyState = {
    ...army,
    supply: { supplied, checkedOnTurn: nextTurn },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    revision: army.revision + 1
  };
  if (!supplied) next = applyEncirclementDamage(next);

  const routeDue = next.plannedRoute.executeOnTurn === nextTurn;
  if (routeDue && !next.plannedRoute.requiresReplan && next.plannedRoute.cells.length > 0) {
    const validation = validatePlannedRoute({
      start: next.plannedRoute.startCell,
      cells: next.plannedRoute.cells,
      sideId: next.sideId,
      terrain: scene.terrain,
      wars: scene.wars,
      remainingUnits: 10,
      readCell: (cell) => readCell(scene.gridMap, cell),
      armyStateAllowsMovement: true
    });
    const cleanRoute = { ...next.plannedRoute };
    delete cleanRoute.invalidReason;
    delete cleanRoute.invalidCell;
    next = {
      ...next,
      plannedRoute: validation.valid
        ? {
            ...cleanRoute,
            totalCostUnits: validation.totalCostUnits,
            validatedRevision: scene.revision,
            requiresReplan: false
          }
        : {
            ...cleanRoute,
            totalCostUnits: validation.totalCostUnits,
            validatedRevision: scene.revision,
            requiresReplan: false,
            invalidReason: validation.reason,
            invalidCell: { ...validation.problemCell }
          }
    };
  }

  const routeStartable = routeDue &&
    next.status !== "IN_BATTLE" &&
    !next.plannedRoute.requiresReplan &&
    !next.plannedRoute.invalidReason &&
    next.route.length > 0 &&
    next.plannedRoute.cells.length > 0;

  if (routeStartable) {
    next = withoutStopReason({
      ...next,
      status: "MOVING",
      currentWaypointIndex: 0,
      segmentProgressCells: 0
    });
  } else if (next.status !== "IN_BATTLE") {
    next = withoutStopReason({ ...next, status: "READY", currentWaypointIndex: 0, segmentProgressCells: 0 });
  }
  return next;
}

export function completeTurn(
  scene: SceneState,
  armies: Readonly<Record<string, ArmyState>>,
  input: CompleteTurnInput
): CompleteTurnResult {
  if (input.source === "SCHEDULE" && scene.turn.autoTurnsPaused) {
    return { changed: false, reason: "AUTO_TURNS_PAUSED" };
  }
  if (input.source === "SCHEDULE") {
    if (!input.boundaryId) throw new Error("SCHEDULE_BOUNDARY_REQUIRED");
    if (scene.turn.lastProcessedBoundaryId === input.boundaryId) {
      return { changed: false, reason: "ALREADY_PROCESSED" };
    }
  }

  const nextScene = structuredClone(scene);
  let nextArmies = structuredClone(armies) as Record<string, ArmyState>;
  let nextBattleGroups = structuredClone(scene.battleGroups);
  const nextTurn = scene.turn.turnNumber + 1;

  // Disband happens before supply and any other new-turn processing.
  for (const [armyId, army] of Object.entries(nextArmies)) {
    if (!army.disband.pending) continue;
    const destroyed = destroyArmy(nextArmies, nextBattleGroups, armyId);
    nextArmies = destroyed.armies;
    nextBattleGroups = destroyed.battleGroups;
  }
  nextScene.battleGroups = nextBattleGroups;

  // Supply, encirclement damage, destruction, fixed 5 OP, and simultaneous route activation.
  for (const [armyId, army] of Object.entries(nextArmies)) {
    const prepared = prepareArmyForNewTurn(nextScene, armyId, army, input.armyCells[armyId], nextTurn);
    if (prepared.health.hp <= 0) {
      const destroyed = destroyArmy(nextArmies, nextScene.battleGroups, armyId);
      nextArmies = destroyed.armies;
      nextScene.battleGroups = destroyed.battleGroups;
      continue;
    }
    nextArmies[armyId] = prepared;
  }

  // Restore each ship's class strategic movement budget without changing its order or combat state.
  if (nextScene.ships) {
    for (const [shipId, ship] of Object.entries(nextScene.ships)) {
      nextScene.ships[shipId] = {
        ...ship,
        globalMovementRemaining: SHIP_CLASSES[ship.classId].movement,
        movementSpentThisTurn: false,
        revision: ship.revision + 1
      };
    }
  }

  const completedAtIso = input.completedAt.toISOString();
  const latestStandard = getLatestStandardTurnBoundary(input.completedAt);
  nextScene.turn = {
    ...nextScene.turn,
    turnNumber: nextTurn,
    deferredUntil: null,
    lastCompletedAt: completedAtIso,
    lastCompletedBy: input.source,
    lastProcessedBoundaryId: input.source === "SCHEDULE"
      ? input.boundaryId?.startsWith("DEFERRED:")
        ? latestStandard?.id ?? nextScene.turn.lastProcessedBoundaryId
        : input.boundaryId ?? nextScene.turn.lastProcessedBoundaryId
      : latestStandard?.id ?? nextScene.turn.lastProcessedBoundaryId
  };

  return { changed: true, scene: nextScene, armies: nextArmies };
}

export type TurnChangeResult =
  | { ok: true; turn: TurnState }
  | { ok: false; reason: "AUTO_TURNS_PAUSED" | "INVALID_TURN_TIME" };

export function deferTurn(turn: TurnState, until: Date, now: Date): TurnChangeResult {
  if (turn.autoTurnsPaused) return { ok: false, reason: "AUTO_TURNS_PAUSED" };
  if (!Number.isFinite(until.getTime()) || until.getTime() <= now.getTime()) {
    return { ok: false, reason: "INVALID_TURN_TIME" };
  }
  const suppressedBoundaryId = turn.deferredUntil
    ? turn.lastProcessedBoundaryId
    : getNextStandardTurnBoundary(now).id;
  return {
    ok: true,
    turn: {
      ...turn,
      deferredUntil: until.toISOString(),
      lastProcessedBoundaryId: suppressedBoundaryId
    }
  };
}

export function cancelTurnDeferral(turn: TurnState, now: Date): TurnState {
  return {
    ...turn,
    deferredUntil: null,
    lastProcessedBoundaryId: getLatestStandardTurnBoundary(now)?.id ?? turn.lastProcessedBoundaryId
  };
}

export function pauseAutoTurns(turn: TurnState): TurnState {
  return { ...turn, autoTurnsPaused: true, deferredUntil: null };
}

export function resumeAutoTurns(turn: TurnState, now: Date): TurnState {
  return {
    ...turn,
    autoTurnsPaused: false,
    deferredUntil: null,
    lastProcessedBoundaryId: getLatestStandardTurnBoundary(now)?.id ?? turn.lastProcessedBoundaryId
  };
}

export function deferredBoundaryId(turn: TurnState): string | undefined {
  if (!turn.deferredUntil) return undefined;
  const date = new Date(turn.deferredUntil);
  return Number.isFinite(date.getTime()) ? deferredBoundary(date).id : undefined;
}
