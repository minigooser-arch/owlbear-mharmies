import type { ShipState } from "../../shared/types";

export function applyShipDamage(ship: ShipState, damage: number): ShipState {
  const appliedDamage = Math.max(0, damage);
  const absorbedByTemporaryHp = Math.min(ship.temporaryHp, appliedDamage);
  const remainingDamage = appliedDamage - absorbedByTemporaryHp;

  return {
    ...ship,
    temporaryHp: ship.temporaryHp - absorbedByTemporaryHp,
    hp: Math.max(0, ship.hp - remainingDamage),
    revision: ship.revision + 1
  };
}
