import { reconcileForcedExitStates } from "../movement/forcedExitService";
import { stateForFaction } from "../states/stateRules";
import { applyEncirclementCheckpoint } from "../supply/encirclementService";
import { hasRailwayGraceAtCell, isArmySupplied } from "../supply/supplyService";
import type { ArmyState, GridCellCoord, SceneState } from "../shared/types";
import { applyTerritorialScoreCheckpoint } from "../wars/territorialScore";
import { shipEmbarkedArmyIds } from "../naval/transport/transportRules";

export interface TurnCheckpointDomain {
  scene: SceneState;
  armies: Readonly<Record<string, ArmyState>>;
  armyCells: Readonly<Record<string, GridCellCoord>>;
}

export interface TurnCheckpointResult {
  scene: SceneState;
  armies: Record<string, ArmyState>;
  armyCells: Readonly<Record<string, GridCellCoord>>;
}

function initializeCheckpoint(scene: SceneState, nextTurnNumber: number): SceneState {
  if (scene.turnCheckpoint?.turnNumber === nextTurnNumber) return structuredClone(scene);
  const next = structuredClone(scene);
  next.turnCheckpoint = {
    turnNumber: nextTurnNumber,
    forcedExitDone: false,
    supplyDone: false,
    encirclementDone: false,
    territorialScoreDone: false
  };
  return next;
}

function applySupplyCheckpoint(
  scene: SceneState,
  armies: Readonly<Record<string, ArmyState>>,
  armyCells: Readonly<Record<string, GridCellCoord>>,
  nextTurnNumber: number
): Record<string, ArmyState> {
  const nextArmies = structuredClone(armies) as Record<string, ArmyState>;

  for (const [armyId, army] of Object.entries(nextArmies)) {
    if (army.supply.checkedOnTurn === nextTurnNumber) continue;

    const factionState = stateForFaction(scene, army.sideId);
    const armyCell = armyCells[armyId];
    const embarkedShipId = army.embarkedOnShipId ?? null;
    const embarkedShip = embarkedShipId !== null ? scene.ships?.[embarkedShipId] : undefined;
    const genuinelyEmbarked = embarkedShip !== undefined &&
      shipEmbarkedArmyIds(embarkedShip).includes(armyId);
    const routeSupplied = genuinelyEmbarked
      ? true
      : factionState && armyCell
        ? isArmySupplied(scene, army, armyCell)
        : true;
    const supplyJustLost = !routeSupplied &&
      army.supply.supplied &&
      army.supply.unsuppliedSinceTurn === undefined;
    const graceEligible = supplyJustLost &&
      Boolean(factionState && armyCell && hasRailwayGraceAtCell(scene, factionState.id, armyCell));
    const supplied = routeSupplied || graceEligible;

    nextArmies[armyId] = {
      ...army,
      supply: {
        supplied,
        checkedOnTurn: nextTurnNumber,
        ...(supplyJustLost ? { unsuppliedSinceTurn: nextTurnNumber } : {}),
        ...(!routeSupplied && !supplyJustLost && army.supply.unsuppliedSinceTurn !== undefined
          ? { unsuppliedSinceTurn: army.supply.unsuppliedSinceTurn }
          : {})
      },
      revision: army.revision + 1
    };
  }

  return nextArmies;
}

export function runTurnCheckpoint(
  current: TurnCheckpointDomain,
  nextTurnNumber: number
): TurnCheckpointResult {
  if (!Number.isInteger(nextTurnNumber) || nextTurnNumber < 1) {
    throw new Error("INVALID_TURN_NUMBER");
  }

  let scene = initializeCheckpoint(current.scene, nextTurnNumber);
  let armies = structuredClone(current.armies) as Record<string, ArmyState>;
  const armyCells = current.armyCells;
  let checkpoint = scene.turnCheckpoint;
  if (!checkpoint) throw new Error("TURN_CHECKPOINT_MISSING");

  if (!checkpoint.forcedExitDone) {
    scene.forcedExitStates = reconcileForcedExitStates(
      scene,
      armies,
      armyCells,
      nextTurnNumber
    );
    scene.turnCheckpoint = {
      ...checkpoint,
      forcedExitDone: true
    };
    checkpoint = scene.turnCheckpoint;
  }

  if (!checkpoint.supplyDone) {
    armies = applySupplyCheckpoint(scene, armies, armyCells, nextTurnNumber);
    scene.turnCheckpoint = {
      ...checkpoint,
      supplyDone: true
    };
    checkpoint = scene.turnCheckpoint;
  }

  if (!checkpoint.encirclementDone) {
    const encirclement = applyEncirclementCheckpoint({ scene, armies }, nextTurnNumber);
    scene = encirclement.scene;
    armies = encirclement.armies;
    checkpoint = scene.turnCheckpoint;
    if (!checkpoint) throw new Error("TURN_CHECKPOINT_MISSING");
  }

  if (!checkpoint.territorialScoreDone) {
    scene = applyTerritorialScoreCheckpoint(scene, nextTurnNumber);
  }

  return { scene, armies, armyCells };
}
