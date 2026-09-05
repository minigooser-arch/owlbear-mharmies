import type {
  ArmyState,
  GridCellCoord,
  ShipState,
  TurnPhase
} from "../../shared/types";

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

export function isReciprocallyEmbarked(
  shipId: string,
  ship: ShipState,
  armyId: string,
  army: ArmyState
): boolean {
  return ship.embarkedArmyId === armyId && army.embarkedOnShipId === shipId;
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
    if (input.ship.embarkedArmyId !== null) {
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
  return {
    ...ship,
    globalMovementRemaining: 0,
    movementSpentThisTurn: true,
    revision: ship.revision + 1
  };
}

export function embarkArmy(
  shipId: string,
  ship: ShipState,
  armyId: string,
  army: ArmyState
): { ship: ShipState; army: ArmyState } {
  return {
    ship: {
      ...consumeTransportMovement(ship),
      embarkedArmyId: armyId
    },
    army: {
      ...army,
      embarkedOnShipId: shipId,
      revision: army.revision + 1
    }
  };
}

export function disembarkArmy(
  shipId: string,
  ship: ShipState,
  armyId: string,
  army: ArmyState
):
  | { ok: true; ship: ShipState; army: ArmyState }
  | { ok: false; reason: "NOT_RECIPROCALLY_EMBARKED" } {
  if (!isReciprocallyEmbarked(shipId, ship, armyId, army)) {
    return { ok: false, reason: "NOT_RECIPROCALLY_EMBARKED" };
  }
  return {
    ok: true,
    ship: {
      ...consumeTransportMovement(ship),
      embarkedArmyId: null
    },
    army: {
      ...army,
      embarkedOnShipId: null,
      revision: army.revision + 1
    }
  };
}
