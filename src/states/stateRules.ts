import type { Side, StateEntity, StateRelations, WarState } from "../shared/types";

export interface StatePoliticalContext {
  states: readonly StateEntity[];
  sides: readonly Side[];
  /** Legacy/history objects only; exact interstate hostility lives in stateRelations. */
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

export function isFactionStateAtWar(
  context: Pick<StatePoliticalContext, "states" | "sides"> & { stateRelations?: StateRelations },
  factionId: string
): boolean {
  const state = stateForFaction(context, factionId);
  if (!state) return false;

  const relations = context.stateRelations ?? {};
  if (Object.entries(relations[state.id] ?? {}).some(([otherStateId, relation]) =>
    otherStateId !== state.id && relation.atWar
  )) return true;

  return Object.entries(relations).some(([otherStateId, targets]) =>
    otherStateId !== state.id && targets[state.id]?.atWar === true
  );
}
