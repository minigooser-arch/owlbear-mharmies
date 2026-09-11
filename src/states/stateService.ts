import type { GridMapState, Side, StateEntity } from "../shared/types";

export type StateConfigurationFailure =
  | "STATE_RULING_FACTION_REQUIRED"
  | "RULING_FACTION_MUST_BELONG_TO_STATE";

export type StateMutationFailure =
  | "STATE_EXISTS"
  | "STATE_NOT_FOUND"
  | "SIDE_NOT_FOUND"
  | StateConfigurationFailure
  | "RULING_FACTION_MOVE_FORBIDDEN"
  | "STATE_STILL_REFERENCED";

export type StateMutationResult =
  | { ok: true; states: StateEntity[]; sides: Side[] }
  | { ok: false; reason: StateMutationFailure };

function cloneStates(states: readonly StateEntity[]): StateEntity[] {
  return states.map((state) => ({ ...state }));
}

function cloneSides(sides: readonly Side[]): Side[] {
  return sides.map((side) => ({
    ...side,
    playerIds: [...side.playerIds],
    leaderPlayerIds: [...side.leaderPlayerIds]
  }));
}

export function validateStateConfiguration(
  state: StateEntity,
  sides: readonly Side[]
): { ok: true } | { ok: false; reason: StateConfigurationFailure } {
  if (state.active && !state.rulingFactionId) {
    return { ok: false, reason: "STATE_RULING_FACTION_REQUIRED" };
  }
  if (state.rulingFactionId) {
    const ruler = sides.find((side) => side.id === state.rulingFactionId);
    if (!ruler || ruler.stateId !== state.id) {
      return { ok: false, reason: "RULING_FACTION_MUST_BELONG_TO_STATE" };
    }
  }
  return { ok: true };
}

export function createState(
  states: readonly StateEntity[],
  sides: readonly Side[],
  state: StateEntity
): StateMutationResult {
  if (states.some((candidate) => candidate.id === state.id)) {
    return { ok: false, reason: "STATE_EXISTS" };
  }
  const validation = validateStateConfiguration(state, sides);
  if (!validation.ok) return validation;
  return {
    ok: true,
    states: [...cloneStates(states), { ...state }],
    sides: cloneSides(sides)
  };
}

export function updateState(
  states: readonly StateEntity[],
  sides: readonly Side[],
  stateId: string,
  patch: Partial<Pick<StateEntity, "name" | "color" | "rulingFactionId" | "active">>
): StateMutationResult {
  const index = states.findIndex((state) => state.id === stateId);
  if (index < 0) return { ok: false, reason: "STATE_NOT_FOUND" };
  const current = states[index];
  if (!current) return { ok: false, reason: "STATE_NOT_FOUND" };
  const nextState: StateEntity = { ...current, ...patch, id: current.id };
  const validation = validateStateConfiguration(nextState, sides);
  if (!validation.ok) return validation;
  const nextStates = cloneStates(states);
  nextStates[index] = nextState;
  return { ok: true, states: nextStates, sides: cloneSides(sides) };
}

export function setSideState(
  states: readonly StateEntity[],
  sides: readonly Side[],
  sideId: string,
  stateId: string | null
): StateMutationResult {
  const sideIndex = sides.findIndex((side) => side.id === sideId);
  if (sideIndex < 0) return { ok: false, reason: "SIDE_NOT_FOUND" };
  if (stateId !== null && !states.some((state) => state.id === stateId)) {
    return { ok: false, reason: "STATE_NOT_FOUND" };
  }
  const currentSide = sides[sideIndex];
  if (!currentSide) return { ok: false, reason: "SIDE_NOT_FOUND" };
  if (currentSide.stateId === stateId) {
    return { ok: true, states: cloneStates(states), sides: cloneSides(sides) };
  }

  const sourceRulership = states.find((state) => state.rulingFactionId === sideId);
  if (sourceRulership?.active) {
    return { ok: false, reason: "RULING_FACTION_MOVE_FORBIDDEN" };
  }

  const nextStates = cloneStates(states).map((state) =>
    !state.active && state.rulingFactionId === sideId
      ? { ...state, rulingFactionId: null }
      : state
  );
  const nextSides = cloneSides(sides);
  nextSides[sideIndex] = { ...currentSide, stateId };

  for (const state of nextStates) {
    const validation = validateStateConfiguration(state, nextSides);
    if (!validation.ok && state.active) return validation;
  }
  return { ok: true, states: nextStates, sides: nextSides };
}

export function deleteState(
  states: readonly StateEntity[],
  sides: readonly Side[],
  gridMap: GridMapState,
  stateId: string
): StateMutationResult {
  if (!states.some((state) => state.id === stateId)) {
    return { ok: false, reason: "STATE_NOT_FOUND" };
  }
  if (sides.some((side) => side.stateId === stateId)) {
    return { ok: false, reason: "STATE_STILL_REFERENCED" };
  }
  if (Object.values(gridMap.cells).some(
    (cell) => cell.recognizedStateId === stateId || cell.deFactoStateId === stateId
  )) {
    return { ok: false, reason: "STATE_STILL_REFERENCED" };
  }
  return {
    ok: true,
    states: cloneStates(states).filter((state) => state.id !== stateId),
    sides: cloneSides(sides)
  };
}
