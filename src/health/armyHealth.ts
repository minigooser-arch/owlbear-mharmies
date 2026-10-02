import type { ArmyState } from "../shared/types";

export type HealPermission =
  | { allowed: true }
  | { allowed: false; reason: "ARMY_ENCIRCLED" | "ARMY_DESTROYED" };

function clearPendingHp(healing: NonNullable<ArmyState["healing"]>): NonNullable<ArmyState["healing"]> {
  const next = { ...healing };
  delete next.pendingHp;
  return next;
}

export function canHealArmy(army: ArmyState): HealPermission {
  if (army.health.hp <= 0) return { allowed: false, reason: "ARMY_DESTROYED" };
  if (!army.supply.supplied) return { allowed: false, reason: "ARMY_ENCIRCLED" };
  if (army.status === "IN_BATTLE" || army.formation?.active) return { allowed: false, reason: "ARMY_ENCIRCLED" };
  return { allowed: true };
}

export function applyArmyDamage(army: ArmyState, damage: number): ArmyState {
  const normalized = Number.isFinite(damage) ? Math.max(0, Math.floor(damage)) : 0;
  return {
    ...army,
    health: { ...army.health, hp: Math.max(0, army.health.hp - normalized) },
    revision: army.revision + 1
  };
}

export function applyEncirclementDamage(army: ArmyState): ArmyState {
  if (army.supply.supplied || army.health.hp <= 0) return army;
  const damage = Math.max(1, Math.ceil(army.health.maxHp * 0.10));
  return applyArmyDamage(army, damage);
}

export function healArmy(army: ArmyState, amount: number): ArmyState | undefined {
  if (!canHealArmy(army).allowed) return undefined;
  const normalized = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  return {
    ...army,
    health: { ...army.health, hp: Math.min(army.health.maxHp, army.health.hp + normalized) },
    revision: army.revision + 1
  };
}

/** Applies the free base recovery during the completed-turn checkpoint. */
export function applyAutomaticTurnHealing(army: ArmyState, amount = 10): ArmyState {
  if (army.health.hp >= army.health.maxHp) return army;
  return healArmy(army, amount) ?? army;
}

export function requestArmyHealing(
  army: ArmyState,
  currentTurn: number,
  playerId: string,
  amount = 10,
  hospitalCityId: string | null = null
): ArmyState | undefined {
  if (!canHealArmy(army).allowed || army.health.hp >= army.health.maxHp || army.healing?.pending) return undefined;
  const normalized = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  if (normalized <= 0) return undefined;
  return {
    ...army,
    healing: {
      pending: true,
      pendingHp: normalized,
      requestedOnTurn: currentTurn,
      requestedByPlayerId: playerId,
      hpHealedThisTurn: army.healing?.hpHealedThisTurn ?? 0,
      checkedOnTurn: army.healing?.checkedOnTurn ?? currentTurn,
      hospitalCityId
    },
    revision: army.revision + 1
  };
}

export function applyPendingTurnHealing(army: ArmyState, amount = 10): ArmyState {
  if (!army.healing?.pending) return army;
  const pendingAmount = Number.isInteger(army.healing.pendingHp) && (army.healing.pendingHp ?? 0) > 0
    ? army.healing.pendingHp ?? amount
    : amount;
  const clearedHealing = {
    ...clearPendingHp(army.healing),
    pending: false,
    requestedOnTurn: null,
    requestedByPlayerId: null
  };
  if (army.health.hp >= army.health.maxHp || !canHealArmy(army).allowed) {
    return { ...army, healing: clearedHealing, revision: army.revision + 1 };
  }
  const healed = healArmy(army, pendingAmount);
  return healed ? { ...healed, healing: clearedHealing } : { ...army, healing: clearedHealing, revision: army.revision + 1 };
}

export function healArmyForTurn(
  army: ArmyState,
  amount: number,
  turnNumber: number,
  turnCap = 10,
  hospitalCityId: string | null = null
): ArmyState | undefined {
  if (!canHealArmy(army).allowed) return undefined;
  if (army.healing?.pending) return undefined;
  const used = army.healing?.checkedOnTurn === turnNumber ? army.healing.hpHealedThisTurn : 0;
  const normalized = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  if (normalized <= 0 || normalized > Math.max(0, turnCap - used)) return undefined;
  const healed = healArmy(army, normalized);
  if (!healed) return undefined;
  return {
    ...healed,
    healing: {
      pending: true,
      requestedOnTurn: turnNumber,
      requestedByPlayerId: army.healing?.requestedByPlayerId ?? null,
      hpHealedThisTurn: used + Math.min(normalized, healed.health.hp - army.health.hp),
      checkedOnTurn: turnNumber,
      hospitalCityId
    }
  };
}
