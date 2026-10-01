import type { ArmyState } from "../shared/types";

export interface CreateFormationArmyOptions {
  armyId: string;
  sideId: string;
  status: ArmyState["status"];
  maxUnits: number;
  turnNumber: number;
  experience: number;
  directOwnerPlayerId?: string;
}

export function createFormationArmy(options: CreateFormationArmyOptions): ArmyState {
  return {
    version: 4,
    registered: true,
    sideId: options.sideId,
    status: options.status,
    overrides: {},
    route: [],
    plannedRoute: { startCell: { x: 0, y: 0 }, executeOnTurn: 0, cells: [], totalCostUnits: 0, validatedRevision: 0, requiresReplan: false },
    movement: { maxUnits: options.maxUnits, remainingUnits: 0, enteredRouteCellCount: 0 },
    health: { hp: 0, maxHp: 40 },
    supply: { supplied: true, checkedOnTurn: options.turnNumber },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1,
    ...(options.directOwnerPlayerId ? { directOwnerPlayerId: options.directOwnerPlayerId } : {}),
    experience: options.experience,
    formation: { active: true, cityId: null, hpAddedThisTurn: 0, checkedOnTurn: options.turnNumber },
    healing: { pending: false, requestedOnTurn: null, requestedByPlayerId: null, hpHealedThisTurn: 0, checkedOnTurn: options.turnNumber, hospitalCityId: null }
  };
}

export function formationCapForTurn(hasBarracks: boolean, hpAddedThisTurn: number): number {
  return Math.max(0, (hasBarracks ? 15 : 10) - hpAddedThisTurn);
}

export type FormationResult =
  | { ok: true; army: ArmyState; amount: number }
  | { ok: false; reason: "FORMATION_COMPLETE" | "FORMATION_INTERRUPTED" | "FORMATION_CAP" | "INVALID_HP" };

export function applyFormationHp(army: ArmyState, hp: number, turnNumber: number, ratePerHp: number, hasBarracks = false): FormationResult {
  if (!army.formation?.active) return { ok: false, reason: "FORMATION_COMPLETE" };
  if (army.status === "IN_BATTLE") return { ok: false, reason: "FORMATION_INTERRUPTED" };
  if (!Number.isInteger(hp) || hp <= 0) return { ok: false, reason: "INVALID_HP" };
  const currentTurn = army.formation.checkedOnTurn === turnNumber ? army.formation.hpAddedThisTurn : 0;
  const allowed = Math.min(formationCapForTurn(hasBarracks, currentTurn), army.health.maxHp - army.health.hp);
  if (hp > allowed) return { ok: false, reason: "FORMATION_CAP" };
  const nextHp = army.health.hp + hp;
  const active = nextHp < army.health.maxHp;
  return {
    ok: true,
    amount: hp * ratePerHp,
    army: {
      ...structuredClone(army),
      health: { ...army.health, hp: nextHp },
      movement: { ...army.movement, remainingUnits: 0 },
      formation: { active, cityId: army.formation.cityId, hpAddedThisTurn: currentTurn + hp, checkedOnTurn: turnNumber },
      revision: army.revision + 1
    }
  };
}

export function interruptFormation(army: ArmyState): ArmyState {
  if (!army.formation?.active) return army;
  return { ...structuredClone(army), movement: { ...army.movement, remainingUnits: army.movement.maxUnits }, formation: { ...army.formation, active: false }, revision: army.revision + 1 };
}
