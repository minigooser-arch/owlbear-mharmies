/**
 * GM-issued army experience awards use the same half-XP granularity as
 * battle outcomes and training facilities. Bound each administrative award
 * to prevent accidental or malformed enormous writes.
 */
export const MAX_ARMY_XP_AWARD = 100;
export const MAX_ARMY_EXPERIENCE = 1_000_000;

export function isValidArmyXpAward(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0.5 &&
    value <= MAX_ARMY_XP_AWARD &&
    Number.isSafeInteger(value * 2);
}

export function canAwardArmyXp(current: number, amount: number): boolean {
  return isValidArmyXpAward(amount) &&
    Number.isFinite(current) &&
    current >= 0 &&
    Number.isSafeInteger(current * 2) &&
    current + amount <= MAX_ARMY_EXPERIENCE;
}
