import type {
  ArmyState,
  GridCellCoord,
  NavalSceneState,
  ShipState
} from "../../shared/types";
import { cellSupportsDomain } from "../../terrain/movementDomains";

export type NavalTransportFailure =
  | "WRONG_PHASE"
  | "SHIP_NOT_TRANSPORT"
  | "SHIP_NOT_READY"
  | "SHIP_DESTROYED"
  | "TRANSPORT_OCCUPIED"
  | "ARMY_DESTROYED"
  | "ARMY_NOT_READY"
  | "ARMY_ALREADY_EMBARKED"
  | "ARMY_ALREADY_MOVED"
  | "INVALID_EMBARK_POSITION"
  | "EMBARKMENT_MISMATCH"
  | "INVALID_DISEMBARK_POSITION"
  | "DESTINATION_OCCUPIED";

export interface TransportOccupant {
  armyId: string;
  sideId: string;
  enemy: boolean;
}

interface CommonTransportInput {
  scene: Pick<NavalSceneState, "turn" | "terrain" | "gridMap">;
  shipId: string;
  ship: ShipState;
  shipCell: GridCellCoord;
  armyId: string;
  army: ArmyState;
}

export interface EmbarkArmyInput extends CommonTransportInput {
  armyCell: GridCellCoord;
}

export interface DisembarkArmyInput extends CommonTransportInput {
  destinationCell: GridCellCoord;
  occupant?: TransportOccupant;
}

export type EmbarkValidation =
  | { ok: true }
  | { ok: false; reason: NavalTransportFailure };

export type DisembarkValidation =
  | { ok: true; enemyArmyId: string | null }
  | { ok: false; reason: NavalTransportFailure };

export type EmbarkArmyResult =
  | { ok: true; ship: ShipState; army: ArmyState }
  | { ok: false; reason: NavalTransportFailure };

export type DisembarkArmyResult =
  | { ok: true; ship: ShipState; army: ArmyState; enemyArmyId: string | null }
  | { ok: false; reason: NavalTransportFailure };

function sameCell(left: GridCellCoord, right: GridCellCoord): boolean {
  return left.x === right.x && left.y === right.y;
}

function orthogonallyAdjacent(left: GridCellCoord, right: GridCellCoord): boolean {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y) === 1;
}

function isCanalCell(
  scene: Pick<NavalSceneState, "terrain" | "gridMap">,
  cell: GridCellCoord
): boolean {
  return cellSupportsDomain(scene, cell, "LAND") && cellSupportsDomain(scene, cell, "SEA");
}

function validCoastTransfer(
  scene: Pick<NavalSceneState, "terrain" | "gridMap">,
  landCell: GridCellCoord,
  shipCell: GridCellCoord
): boolean {
  if (sameCell(landCell, shipCell)) return isCanalCell(scene, shipCell);
  return orthogonallyAdjacent(landCell, shipCell) &&
    cellSupportsDomain(scene, landCell, "LAND") &&
    cellSupportsDomain(scene, shipCell, "SEA");
}

function validateTransportBase(input: CommonTransportInput): EmbarkValidation {
  if (input.scene.turn.phase !== "MOVEMENT") return { ok: false, reason: "WRONG_PHASE" };
  if (input.ship.classId !== "TRANSPORT") return { ok: false, reason: "SHIP_NOT_TRANSPORT" };
  if (input.ship.hp <= 0) return { ok: false, reason: "SHIP_DESTROYED" };
  if (input.ship.status !== "READY" || input.ship.battleId !== null) {
    return { ok: false, reason: "SHIP_NOT_READY" };
  }
  if (input.army.health.hp <= 0) return { ok: false, reason: "ARMY_DESTROYED" };
  return { ok: true };
}

function armyHasSpentMovement(army: ArmyState): boolean {
  return army.movement.remainingUnits !== army.movement.maxUnits ||
    army.movement.enteredRouteCellCount !== 0;
}

export function validateEmbarkArmy(input: EmbarkArmyInput): EmbarkValidation {
  const base = validateTransportBase(input);
  if (!base.ok) return base;
  if (input.ship.embarkedArmyId !== null) return { ok: false, reason: "TRANSPORT_OCCUPIED" };
  if (input.army.status !== "READY" || input.army.battleGroupId !== undefined) {
    return { ok: false, reason: "ARMY_NOT_READY" };
  }
  if ((input.army.embarkedOnShipId ?? null) !== null) {
    return { ok: false, reason: "ARMY_ALREADY_EMBARKED" };
  }
  if (armyHasSpentMovement(input.army)) return { ok: false, reason: "ARMY_ALREADY_MOVED" };
  if (!validCoastTransfer(input.scene, input.armyCell, input.shipCell)) {
    return { ok: false, reason: "INVALID_EMBARK_POSITION" };
  }
  return { ok: true };
}

export function embarkArmy(input: EmbarkArmyInput): EmbarkArmyResult {
  const validation = validateEmbarkArmy(input);
  if (!validation.ok) return validation;
  const turnNumber = input.scene.turn.turnNumber;
  return {
    ok: true,
    ship: {
      ...input.ship,
      embarkedArmyId: input.armyId,
      globalMovementRemaining: 0,
      movementSpentThisTurn: true,
      logisticsActionUsedOnTurn: turnNumber,
      revision: input.ship.revision + 1
    },
    army: {
      ...input.army,
      embarkedOnShipId: input.shipId,
      revision: input.army.revision + 1
    }
  };
}

export function validateDisembarkArmy(input: DisembarkArmyInput): DisembarkValidation {
  const base = validateTransportBase(input);
  if (!base.ok) return base;
  if (
    input.ship.embarkedArmyId !== input.armyId ||
    (input.army.embarkedOnShipId ?? null) !== input.shipId
  ) {
    return { ok: false, reason: "EMBARKMENT_MISMATCH" };
  }
  if (!validCoastTransfer(input.scene, input.destinationCell, input.shipCell)) {
    return { ok: false, reason: "INVALID_DISEMBARK_POSITION" };
  }
  if (input.occupant && !input.occupant.enemy) {
    return { ok: false, reason: "DESTINATION_OCCUPIED" };
  }
  return { ok: true, enemyArmyId: input.occupant?.armyId ?? null };
}

export function disembarkArmy(input: DisembarkArmyInput): DisembarkArmyResult {
  const validation = validateDisembarkArmy(input);
  if (!validation.ok) return validation;
  return {
    ok: true,
    ship: {
      ...input.ship,
      embarkedArmyId: null,
      logisticsActionUsedOnTurn: input.scene.turn.turnNumber,
      revision: input.ship.revision + 1
    },
    army: {
      ...input.army,
      embarkedOnShipId: null,
      movement: {
        ...input.army.movement,
        remainingUnits: 0
      },
      revision: input.army.revision + 1
    },
    enemyArmyId: validation.enemyArmyId
  };
}
