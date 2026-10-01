import type { ArmyState } from "../shared/types";

export type HealPermission =
  | { allowed: true }
  | { allowed: false; reason: "ARMY_ENCIRCLED" | "ARMY_DESTROYED" };

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

export function healArmyForTurn(
  army: ArmyState,
  amount: number,
  turnNumber: number,
  turnCap = 10,
  hospitalCityId: string | null = null
): ArmyState | undefined {
  if (!canHealArmy(army).allowed) return undefined;
  const used = army.healing?.checkedOnTurn === turnNumber ? army.healing.hpHealedThisTurn : 0;
  const normalized = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  if (normalized <= 0 || normalized > Math.max(0, turnCap - used)) return undefined;
  const healed = healArmy(army, normalized);
  if (!healed) return undefined;
  return {
    ...healed,
    healing: {
      pending: false,
      requestedOnTurn: null,
      requestedByPlayerId: null,
      hpHealedThisTurn: used + Math.min(normalized, healed.health.hp - army.health.hp),
      checkedOnTurn: turnNumber,
      hospitalCityId
    }
  };
}
