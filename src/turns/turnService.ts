import { destroyArmy } from "../armies/armyLifecycle";
import { validatePlannedRoute } from "../movement/movementRules";
import { politicalRouteGate } from "../movement/authoritativeStateMovement";
import { forcedExitRouteGate, forcedExitTurnRoute } from "../movement/forcedExitService";
import { SHIP_CLASSES } from "../naval/ships/shipClasses";
import { readCell } from "../terrain/gridMap";
import type { ArmyState, GridCellCoord, SceneState, TurnState, Vector2 } from "../shared/types";
import { runTurnCheckpoint } from "./turnCheckpointPipeline";
import { preCheckpointTurnBlockers, type TurnBlocker } from "./turnCompletionGuard";
import { deferredBoundary, getLatestStandardTurnBoundary, getNextStandardTurnBoundary } from "./turnSchedule";

export type TurnCompletionSource = "SCHEDULE" | "MANUAL";

export interface CompleteTurnInput {
  source: TurnCompletionSource;
  completedAt: Date;
  boundaryId?: string;
  /** Current strategic cells, resolved from authoritative Owlbear item positions. */
  armyCells: Readonly<Record<string, GridCellCoord>>;
  positionForCell?: (cell: GridCellCoord) => Vector2;
}

export type CompleteTurnResult =
  | { changed: false; reason: "AUTO_TURNS_PAUSED" | "ALREADY_PROCESSED" }
  | { changed: false; reason: TurnBlocker; blockers: TurnBlocker[] }
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
  nextTurn: number,
  positionForCell?: (cell: GridCellCoord) => Vector2
): ArmyState {
  let next: ArmyState = {
    ...army,
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    revision: army.revision + 1
  };

  if (armyCell && positionForCell && next.status !== "IN_BATTLE" &&
      scene.forcedExitStates?.some((entry) => entry.armyId === armyId && entry.startedOnTurn <= nextTurn)) {
    const planned = next.plannedRoute;
    const gate = forcedExitRouteGate(scene, armyId, next, armyCell, planned.cells, nextTurn);
    if (gate) {
      const preferred = planned.executeOnTurn === nextTurn && !gate.blockedReason ? planned.cells : [];
      const cells = forcedExitTurnRoute(scene, next, armyCell, 10, preferred);
      next = {...next, route: cells.map(positionForCell), plannedRoute: {
        startCell: {...armyCell}, executeOnTurn: nextTurn, cells, totalCostUnits: 0,
        validatedRevision: scene.revision, requiresReplan: false
      }};
    }
  }
  const routeDue = next.plannedRoute.executeOnTurn === nextTurn;
  if (routeDue && !next.plannedRoute.requiresReplan && next.plannedRoute.cells.length > 0) {
    const political = forcedExitRouteGate(scene, armyId, next, next.plannedRoute.startCell, next.plannedRoute.cells, nextTurn) ?? politicalRouteGate({
      sideId: next.sideId,
      cells: next.plannedRoute.cells,
      gridMap: scene.gridMap,
      sides: scene.sides,
      states: scene.states,
      stateRelations: scene.stateRelations ?? {}
    });
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
    const politicalBlock = political.allowedCellCount < next.plannedRoute.cells.length &&
      political.blockedReason && political.blockedCell
      ? { reason: political.blockedReason, problemCell: political.blockedCell }
      : null;
    const invalidRoute = politicalBlock ?? (validation.valid ? null : {
      reason: validation.reason,
      problemCell: validation.problemCell
    });
    next = {
      ...next,
      plannedRoute: !invalidRoute
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
            invalidReason: invalidRoute.reason,
            invalidCell: { ...invalidRoute.problemCell }
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

  const blockers = preCheckpointTurnBlockers(scene);
  if (blockers.length > 0) {
    return { changed: false, reason: blockers[0] ?? "MOVEMENT_RESOLUTION_PENDING", blockers };
  }

  let nextScene = structuredClone(scene);
  let nextArmies = structuredClone(armies) as Record<string, ArmyState>;
  let nextBattleGroups = structuredClone(scene.battleGroups);
  const nextTurn = scene.turn.turnNumber + 1;
  if (nextScene.navalBattleRequests) nextScene.navalBattleRequests = [];

  // Disband happens before supply and any other new-turn processing.
  for (const [armyId, army] of Object.entries(nextArmies)) {
    if (!army.disband.pending) continue;
    const destroyed = destroyArmy(nextArmies, nextBattleGroups, armyId);
    nextArmies = destroyed.armies;
    nextBattleGroups = destroyed.battleGroups;
  }
  nextScene.battleGroups = nextBattleGroups;

  const checkpoint = runTurnCheckpoint({
    scene: nextScene,
    armies: nextArmies,
    armyCells: input.armyCells
  }, nextTurn);
  nextScene = checkpoint.scene;
  nextArmies = checkpoint.armies;

  // Open the new movement phase only after every strategic checkpoint effect completed.
  for (const [armyId, army] of Object.entries(nextArmies)) {
    nextArmies[armyId] = prepareArmyForNewTurn(
      nextScene,
      armyId,
      army,
      input.armyCells[armyId],
      nextTurn,
      input.positionForCell
    );
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
    phase: "MOVEMENT",
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

export function setTurnNumber(turn: TurnState, turnNumber: number): TurnState {
  if (!Number.isInteger(turnNumber) || turnNumber < 1) throw new Error("INVALID_TURN_NUMBER");
  return { ...turn, turnNumber };
}

function rebaseTurnIndex(value: number, delta: number): number {
  if (value === 0) return 0;
  return Math.max(0, value + delta);
}

export function canRenumberTurn(scene: SceneState): boolean {
  return scene.turn.phase === "MOVEMENT" && scene.activeNavalBattle?.status !== "ACTIVE";
}

export function renumberSceneTurn(
  scene: SceneState,
  armies: Readonly<Record<string, ArmyState>>,
  turnNumber: number
): { scene: SceneState; armies: Record<string, ArmyState> } {
  const nextTurn = setTurnNumber(scene.turn, turnNumber);
  const delta = turnNumber - scene.turn.turnNumber;
  const nextScene = structuredClone(scene);
  const nextArmies = structuredClone(armies) as Record<string, ArmyState>;
  nextScene.turn = nextTurn;

  for (const [armyId, army] of Object.entries(nextArmies)) {
    nextArmies[armyId] = {
      ...army,
      plannedRoute: {
        ...army.plannedRoute,
        executeOnTurn: rebaseTurnIndex(army.plannedRoute.executeOnTurn, delta)
      },
      supply: {
        ...army.supply,
        checkedOnTurn: rebaseTurnIndex(army.supply.checkedOnTurn, delta)
      },
      disband: {
        ...army.disband,
        requestedOnTurn: army.disband.requestedOnTurn == null
          ? null
          : rebaseTurnIndex(army.disband.requestedOnTurn, delta)
      },
      revision: army.revision + 1
    };
  }

  if (nextScene.ships) {
    for (const [shipId, ship] of Object.entries(nextScene.ships)) {
      nextScene.ships[shipId] = {
        ...ship,
        shoreBombardmentUsedOnTurn: ship.shoreBombardmentUsedOnTurn == null
          ? null
          : rebaseTurnIndex(ship.shoreBombardmentUsedOnTurn, delta),
        logisticsActionUsedOnTurn: ship.logisticsActionUsedOnTurn == null
          ? null
          : rebaseTurnIndex(ship.logisticsActionUsedOnTurn, delta),
        revision: ship.revision + 1
      };
    }
  }

  if (nextScene.navalBattleRequests) {
    nextScene.navalBattleRequests = nextScene.navalBattleRequests.map((request) =>
      request.createdOnTurn === undefined
        ? { ...request }
        : { ...request, createdOnTurn: rebaseTurnIndex(request.createdOnTurn, delta) }
    );
  }

  if (nextScene.navalRevealUntilTurn) {
    nextScene.navalRevealUntilTurn = Object.fromEntries(
      Object.entries(nextScene.navalRevealUntilTurn).map(([sideId, reveals]) => [
        sideId,
        Object.fromEntries(
          Object.entries(reveals).map(([shipId, untilTurn]) => [
            shipId,
            rebaseTurnIndex(untilTurn, delta)
          ])
        )
      ])
    );
  }

  return { scene: nextScene, armies: nextArmies };
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
