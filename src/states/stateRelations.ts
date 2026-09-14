import type { StateRelationState, StateRelations } from "../shared/types";

const EMPTY_RELATION: Readonly<StateRelationState> = Object.freeze({
  militaryAccess: false,
  atWar: false
});

function cloneRelations(relations: Readonly<StateRelations>): StateRelations {
  return Object.fromEntries(
    Object.entries(relations).map(([fromStateId, targets]) => [
      fromStateId,
      Object.fromEntries(
        Object.entries(targets).map(([toStateId, relation]) => [toStateId, { ...relation }])
      )
    ])
  );
}

export function stateRelation(
  relations: Readonly<StateRelations>,
  fromStateId: string,
  toStateId: string
): Readonly<StateRelationState> {
  if (fromStateId === toStateId) return EMPTY_RELATION;
  return relations[fromStateId]?.[toStateId] ?? EMPTY_RELATION;
}

export function hasMilitaryAccess(
  relations: Readonly<StateRelations>,
  fromStateId: string,
  toStateId: string
): boolean {
  if (fromStateId === toStateId) return true;
  return stateRelation(relations, fromStateId, toStateId).militaryAccess;
}

export function areStatesAtWar(
  relations: Readonly<StateRelations>,
  leftStateId: string,
  rightStateId: string
): boolean {
  if (leftStateId === rightStateId) return false;
  return Boolean(
    stateRelation(relations, leftStateId, rightStateId).atWar ||
    stateRelation(relations, rightStateId, leftStateId).atWar
  );
}

export function setMilitaryAccess(
  relations: Readonly<StateRelations>,
  fromStateId: string,
  toStateId: string,
  allowed: boolean
): StateRelations {
  if (fromStateId === toStateId) return cloneRelations(relations);
  const next = cloneRelations(relations);
  next[fromStateId] ??= {};
  const current = next[fromStateId][toStateId] ?? EMPTY_RELATION;
  next[fromStateId][toStateId] = { ...current, militaryAccess: allowed };
  return next;
}

export function setPairWar(
  relations: Readonly<StateRelations>,
  leftStateId: string,
  rightStateId: string,
  atWar: boolean
): StateRelations {
  if (leftStateId === rightStateId) return cloneRelations(relations);
  const next = cloneRelations(relations);
  next[leftStateId] ??= {};
  next[rightStateId] ??= {};
  const left = next[leftStateId][rightStateId] ?? EMPTY_RELATION;
  const right = next[rightStateId][leftStateId] ?? EMPTY_RELATION;
  next[leftStateId][rightStateId] = { ...left, atWar };
  next[rightStateId][leftStateId] = { ...right, atWar };
  return next;
}

export function removeStateRelations(
  relations: Readonly<StateRelations>,
  stateId: string
): StateRelations {
  return Object.fromEntries(
    Object.entries(relations)
      .filter(([fromStateId]) => fromStateId !== stateId)
      .map(([fromStateId, targets]) => [
        fromStateId,
        Object.fromEntries(
          Object.entries(targets)
            .filter(([toStateId]) => toStateId !== stateId)
            .map(([toStateId, relation]) => [toStateId, { ...relation }])
        )
      ])
  );
}
