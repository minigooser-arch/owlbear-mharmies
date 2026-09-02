import type { Side, StateEntity, WarState } from "../shared/types";

export interface StatePoliticalContext {
  states: readonly StateEntity[];
  sides: readonly Side[];
  wars: readonly WarState[];
}

export function stateForFaction(
  context: Pick<StatePoliticalContext, "states" | "sides">,
  factionId: string
): StateEntity | undefined {
  const side = context.sides.find((candidate) => candidate.id === factionId);
  if (!side?.stateId) return undefined;
  return context.states.find((candidate) => candidate.id === side.stateId && candidate.active);
}

export function isRulingFaction(
  context: Pick<StatePoliticalContext, "states" | "sides">,
  factionId: string
): boolean {
  const state = stateForFaction(context, factionId);
  return state?.rulingFactionId === factionId;
}

export function areStatesAtWar(
  wars: readonly WarState[],
  leftStateId: string,
  rightStateId: string
): boolean {
  if (leftStateId === rightStateId) return false;
  return wars.some((war) =>
    war.active &&
    war.participantStateIds.includes(leftStateId) &&
    war.participantStateIds.includes(rightStateId)
  );
}
