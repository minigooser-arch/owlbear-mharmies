import type { CellState, Side, StateEntity, WarState } from "../shared/types";
import { areStatesAtWar, stateForFaction } from "../states/stateRules";

export interface AnnexationContext {
  states: readonly StateEntity[];
  sides: readonly Side[];
  wars: readonly WarState[];
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
  return areStatesAtWar(context.wars, state.id, targetStateId) ? state.id : undefined;
}
