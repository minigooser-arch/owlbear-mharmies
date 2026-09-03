import type { NavalSceneState, ShipClassId, ShipFacing, ShipState } from "../../shared/types";
import { endNavalShipTurn } from "../battle/navalRoundFlow";
import { SHIP_CLASSES } from "./shipClasses";

export function createRegisteredShip(sideId: string, classId: ShipClassId, facing: ShipFacing): ShipState {
  const definition = SHIP_CLASSES[classId];
  return {
    version: 1,
    registered: true,
    sideId,
    classId,
    status: "READY",
    hp: definition.maxHp,
    temporaryHp: 0,
    facing,
    plannedRoute: [],
    globalMovementRemaining: definition.movement,
    movementSpentThisTurn: false,
    battleId: null,
    detectionOverride: null,
    embarkedArmyId: null,
    shoreBombardmentUsedOnTurn: null,
    logisticsActionUsedOnTurn: null,
    revision: 1
  };
}

export interface DestroyShipResult {
  destroyed: boolean;
  scene: NavalSceneState;
  itemIdToDelete: string | null;
}

export function destroyShip(scene: NavalSceneState, shipId: string): DestroyShipResult {
  if (!scene.ships[shipId]) return { destroyed: false, scene, itemIdToDelete: null };
  const next = structuredClone(scene);
  Reflect.deleteProperty(next.ships, shipId);
  next.navalBattleRequests = next.navalBattleRequests.filter(
    (request) => request.initiatingShipId !== shipId && request.targetShipId !== shipId
  );
  let battle = next.activeNavalBattle;
  if (battle) {
    const activeShipRemoved = battle.status === "ACTIVE" && battle.currentShipId === shipId;
    if (activeShipRemoved) {
      const previousRoundNumber = battle.roundNumber;
      battle = endNavalShipTurn(battle, next.ships, shipId);
      if (battle.currentShipId === null) battle.roundNumber = previousRoundNumber;
      next.activeNavalBattle = battle;
    }
    battle.participantShipIds = battle.participantShipIds.filter((id) => id !== shipId);
    battle.initiative = battle.initiative.filter((entry) => entry.shipId !== shipId);
    battle.completedShipIdsThisRound = battle.completedShipIdsThisRound.filter((id) => id !== shipId);
    battle.exitedShipIds = battle.exitedShipIds.filter((id) => id !== shipId);
    Reflect.deleteProperty(battle.snapshots, shipId);
    Reflect.deleteProperty(battle.movementRemainingByShip, shipId);
    Reflect.deleteProperty(battle.actionUsedByShip, shipId);
    if (battle.currentShipId === shipId) battle.currentShipId = null;
    if (!activeShipRemoved) battle.revision += 1;
  }
  for (const revealMap of Object.values(next.navalRevealUntilTurn)) {
    Reflect.deleteProperty(revealMap, shipId);
  }
  next.revision += 1;
  return { destroyed: true, scene: next, itemIdToDelete: shipId };
}
