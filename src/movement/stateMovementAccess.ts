import type { Side, StateEntity, StateRelations } from "../shared/types";
import { areStatesAtWar, hasMilitaryAccess } from "../states/stateRelations";

export type StateMovementAccess =
  | { kind: "ALLOW_OWN_STATE" }
  | { kind: "ALLOW_UNOWNED" }
  | { kind: "ALLOW_MILITARY_ACCESS"; destinationStateId: string }
  | { kind: "ALLOW_WAR"; destinationStateId: string }
  | { kind: "DECLARE_WAR_AND_ALLOW"; sourceStateId: string; destinationStateId: string }
  | { kind: "DENY_FOREIGN_STATE"; destinationStateId: string }
  | { kind: "DENY_STATELESS"; destinationStateId: string }
  | { kind: "DENY_INVALID_POLITICAL_CONFIG" };

export interface StateMovementAccessInput {
  sideId: string;
  destinationStateId: string | null;
  sides: readonly Side[];
  states: readonly StateEntity[];
  stateRelations: StateRelations;
}

function validActiveState(state: StateEntity | undefined, sides: readonly Side[]): state is StateEntity {
  if (!state?.active || !state.rulingFactionId) return false;
  const ruler = sides.find((side) => side.id === state.rulingFactionId);
  return ruler?.stateId === state.id;
}

export function classifyStateMovementAccess(input: StateMovementAccessInput): StateMovementAccess {
  const side = input.sides.find((candidate) => candidate.id === input.sideId);
  if (!side) return { kind: "DENY_INVALID_POLITICAL_CONFIG" };

  if (input.destinationStateId === null) return { kind: "ALLOW_UNOWNED" };

  const destination = input.states.find((state) => state.id === input.destinationStateId);
  if (!validActiveState(destination, input.sides)) {
    return { kind: "DENY_INVALID_POLITICAL_CONFIG" };
  }

  if (side.stateId === null) {
    return { kind: "DENY_STATELESS", destinationStateId: destination.id };
  }

  const source = input.states.find((state) => state.id === side.stateId);
  if (!validActiveState(source, input.sides)) {
    return { kind: "DENY_INVALID_POLITICAL_CONFIG" };
  }

  if (source.id === destination.id) return { kind: "ALLOW_OWN_STATE" };

  if (hasMilitaryAccess(input.stateRelations, source.id, destination.id)) {
    return { kind: "ALLOW_MILITARY_ACCESS", destinationStateId: destination.id };
  }

  if (areStatesAtWar(input.stateRelations, source.id, destination.id)) {
    return { kind: "ALLOW_WAR", destinationStateId: destination.id };
  }

  if (source.rulingFactionId === side.id) {
    return {
      kind: "DECLARE_WAR_AND_ALLOW",
      sourceStateId: source.id,
      destinationStateId: destination.id
    };
  }

  return { kind: "DENY_FOREIGN_STATE", destinationStateId: destination.id };
}
