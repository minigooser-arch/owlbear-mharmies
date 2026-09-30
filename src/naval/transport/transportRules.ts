import type {
  ArmyState,
  GridCellCoord,
  ShipState,
  TurnPhase
} from "../../shared/types";
import { transportCapacity, transportLoadingIsFree } from "../../upgrades/unitUpgrades";

export type TransportInteractionFailure =
  | "NOT_MOVEMENT_PHASE"
  | "SHIP_NOT_TRANSPORT"
  | "TRANSPORT_OCCUPIED"
  | "ARMY_ALREADY_EMBARKED"
  | "NOT_RECIPROCALLY_EMBARKED"
  | "NOT_ADJACENT";

export type TransportInteractionResult =
  | { ok: true }
  | { ok: false; reason: TransportInteractionFailure };

export interface TransportInteractionInput {
  action: "EMBARK" | "DISEMBARK";
  phase: TurnPhase;
  ship: ShipState;
  army: ArmyState;
  shipCell: GridCellCoord;
  interactionCell: GridCellCoord;
  sameCellSupportsLandAndSea: boolean;
}

function sameCell(left: GridCellCoord, right: GridCellCoord): boolean {
  return left.x === right.x && left.y === right.y;
}

function orthogonallyAdjacent(left: GridCellCoord, right: GridCellCoord): boolean {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y) === 1;
}

function validInteractionGeometry(input: TransportInteractionInput): boolean {
  if (sameCell(input.shipCell, input.interactionCell)) {
    return input.sameCellSupportsLandAndSea;
  }
  return orthogonallyAdjacent(input.shipCell, input.interactionCell);
}

export function shipEmbarkedArmyIds(ship: Pick<ShipState, "embarkedArmyId" | "additionalEmbarkedArmyId">): string[] {
  return [ship.embarkedArmyId, ship.additionalEmbarkedArmyId ?? null]
    .filter((armyId): armyId is string => armyId !== null);
}

export function isReciprocallyEmbarked(
  shipId: string,
  ship: ShipState,
  armyId: string,
  army: ArmyState
): boolean {
  return shipEmbarkedArmyIds(ship).includes(armyId) && army.embarkedOnShipId === shipId;
}

export function validateTransportInteraction(
  input: TransportInteractionInput
): TransportInteractionResult {
  if (input.phase !== "MOVEMENT") {
    return { ok: false, reason: "NOT_MOVEMENT_PHASE" };
  }
  if (input.ship.classId !== "TRANSPORT") {
    return { ok: false, reason: "SHIP_NOT_TRANSPORT" };
  }
  if (input.action === "EMBARK") {
    if (shipEmbarkedArmyIds(input.ship).length >= transportCapacity(input.ship)) {
      return { ok: false, reason: "TRANSPORT_OCCUPIED" };
    }
    if (input.army.embarkedOnShipId != null) {
      return { ok: false, reason: "ARMY_ALREADY_EMBARKED" };
    }
  }
  if (!validInteractionGeometry(input)) {
    return { ok: false, reason: "NOT_ADJACENT" };
  }
  return { ok: true };
}

function consumeTransportMovement(ship: ShipState): ShipState {
  if (transportLoadingIsFree(ship)) {
    return { ...ship, revision: ship.revision + 1 };
  }
  return {
    ...ship,
    globalMovementRemaining: 0,
    movementSpentThisTurn: true,
    revision: ship.revision + 1
  };
}

function pauseArmyForTransport(army: ArmyState, shipId: string, armyMovementCost = 0): ArmyState {
  return {
    ...army,
    status: "PAUSED",
    route: [],
    plannedRoute: {
      startCell: { ...army.plannedRoute.startCell },
      executeOnTurn: army.plannedRoute.executeOnTurn,
      cells: [],
      totalCostUnits: 0,
      validatedRevision: army.plannedRoute.validatedRevision,
      requiresReplan: false
    },
    movement: {
      ...army.movement,
      remainingUnits: Math.max(0, army.movement.remainingUnits - armyMovementCost),
      enteredRouteCellCount: 0
    },
    embarkedOnShipId: shipId,
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    stopReason: "MANUAL",
    revision: army.revision + 1
  };
}

export function embarkArmy(
  shipId: string,
  ship: ShipState,
  armyId: string,
  army: ArmyState,
  armyMovementCost = 0
): { ship: ShipState; army: ArmyState } {
  const firstSlotFree = ship.embarkedArmyId === null;
  return {
    ship: {
      ...consumeTransportMovement(ship),
      embarkedArmyId: firstSlotFree ? armyId : ship.embarkedArmyId,
      additionalEmbarkedArmyId: firstSlotFree ? (ship.additionalEmbarkedArmyId ?? null) : armyId
    },
    army: pauseArmyForTransport(army, shipId, armyMovementCost)
  };
}

export function disembarkArmy(
  shipId: string,
  ship: ShipState,
  armyId: string,
  army: ArmyState,
  armyMovementCost = 0
):
  | { ok: true; ship: ShipState; army: ArmyState }
  | { ok: false; reason: "NOT_RECIPROCALLY_EMBARKED" } {
  if (!isReciprocallyEmbarked(shipId, ship, armyId, army)) {
    return { ok: false, reason: "NOT_RECIPROCALLY_EMBARKED" };
  }
  let embarkedArmyId = ship.embarkedArmyId;
  let additionalEmbarkedArmyId = ship.additionalEmbarkedArmyId ?? null;
  if (embarkedArmyId === armyId) {
    embarkedArmyId = additionalEmbarkedArmyId;
    additionalEmbarkedArmyId = null;
  } else if (additionalEmbarkedArmyId === armyId) {
    additionalEmbarkedArmyId = null;
  }
  return {
    ok: true,
    ship: {
      ...consumeTransportMovement(ship),
      embarkedArmyId,
      additionalEmbarkedArmyId
    },
    army: {
      ...army,
      movement: { ...army.movement, remainingUnits: Math.max(0, army.movement.remainingUnits - armyMovementCost) },
      embarkedOnShipId: null,
      revision: army.revision + 1
    }
  };
}
