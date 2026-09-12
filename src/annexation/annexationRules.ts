import type { CellState, Side, StateEntity, StateRelations, WarState } from "../shared/types";
import { stateForFaction } from "../states/stateRules";
import { areStatesAtWar } from "../states/stateRelations";

export interface AnnexationContext {
  states: readonly StateEntity[];
  sides: readonly Side[];
  /** Legacy/history objects retained for callers; they do not authorize annexation. */
  wars: readonly WarState[];
  stateRelations?: StateRelations;
}

export function annexingStateForEntry(
  context: AnnexationContext,
  armyFactionId: string,
  destination: CellState
): string | undefined {
  const state = stateForFaction(context, armyFactionId);
  if (!state || state.rulingFactionId !== armyFactionId) return undefined;
  const targetStateId = destination.deFactoStateId ?? destination.recognizedStateId;
  if (!targetStateId || targetStateId === state.id) return undefined;
  return areStatesAtWar(context.stateRelations ?? {}, state.id, targetStateId)
    ? state.id
    : undefined;
}
