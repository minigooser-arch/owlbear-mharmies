import type {
  GridCellCoord,
  GridMapState,
  MovementDenialReason,
  Side,
  StateEntity,
  StateRelations
} from "../shared/types";
import { readCell } from "../terrain/gridMap";
import { classifyStateMovementAccess } from "./stateMovementAccess";
import { setPairWar } from "../states/stateRelations";

export interface PoliticalRouteGateInput {
  sideId: string;
  cells: readonly GridCellCoord[];
  gridMap: GridMapState;
  sides: readonly Side[];
  states: readonly StateEntity[];
  stateRelations: StateRelations;
}

export interface PoliticalRouteGateResult {
  allowedCellCount: number;
  blockedReason?: MovementDenialReason;
  blockedCell?: GridCellCoord;
}

function denialReason(kind: "DENY_FOREIGN_STATE" | "DENY_STATELESS" | "DENY_INVALID_POLITICAL_CONFIG"): MovementDenialReason {
  if (kind === "DENY_FOREIGN_STATE") return "FOREIGN_STATE_CLOSED";
  if (kind === "DENY_STATELESS") return "STATELESS_FACTION";
  return "INVALID_POLITICAL_CONFIG";
}

export function politicalRouteGate(input: PoliticalRouteGateInput): PoliticalRouteGateResult {
  let effectiveRelations = input.stateRelations;
  for (const [index, cell] of input.cells.entries()) {
    const destination = readCell(input.gridMap, cell);
    const access = classifyStateMovementAccess({
      sideId: input.sideId,
      destinationStateId: destination.recognizedStateId,
      sides: input.sides,
      states: input.states,
      stateRelations: effectiveRelations
    });
    if (
      access.kind === "DENY_FOREIGN_STATE" ||
      access.kind === "DENY_STATELESS" ||
      access.kind === "DENY_INVALID_POLITICAL_CONFIG"
    ) {
      return {
        allowedCellCount: index,
        blockedReason: denialReason(access.kind),
        blockedCell: { ...cell }
      };
    }
    if (access.kind === "DECLARE_WAR_AND_ALLOW") {
      effectiveRelations = setPairWar(
        effectiveRelations,
        access.sourceStateId,
        access.destinationStateId,
        true
      );
    }
  }
  return { allowedCellCount: input.cells.length };
}

export interface EnteredCellDiplomacyResult {
  stateRelations: StateRelations;
  declaredPairs: Array<{ leftStateId: string; rightStateId: string }>;
}

export function applyDiplomacyForEnteredCells(input: PoliticalRouteGateInput): EnteredCellDiplomacyResult {
  let stateRelations = input.stateRelations;
  const declaredPairs: Array<{ leftStateId: string; rightStateId: string }> = [];
  for (const cell of input.cells) {
    const destination = readCell(input.gridMap, cell);
    const access = classifyStateMovementAccess({
      sideId: input.sideId,
      destinationStateId: destination.recognizedStateId,
      sides: input.sides,
      states: input.states,
      stateRelations
    });
    if (access.kind !== "DECLARE_WAR_AND_ALLOW") continue;
    stateRelations = setPairWar(stateRelations, access.sourceStateId, access.destinationStateId, true);
    declaredPairs.push({
      leftStateId: access.sourceStateId,
      rightStateId: access.destinationStateId
    });
  }
  return { stateRelations, declaredPairs };
}
