import { describe, expect, it } from "vitest";
import type { ArmyState } from "../shared/types";
import { applyFormationHp, createFormationArmy, formationCapForTurn, interruptFormation } from "./armyFormation";

const army = createFormationArmy({
  sideId: "side", status: "READY", maxUnits: 10, turnNumber: 4,
  experience: 1, armyId: "a"
});

describe("army formation", () => {
  it("creates a 5 HP immobile formation army with immediate experience", () => {
    expect(army.health).toEqual({ hp: 5, maxHp: 40 });
    expect(army.formation).toMatchObject({ active: true, hpAddedThisTurn: 5 });
    expect(army.movement.remainingUnits).toBe(0);
    expect(army.experience).toBe(1);
  });

  it("counts initial HP against 15/25 per-turn limits and stages cost", () => {
    expect(formationCapForTurn(false, 5)).toBe(10);
    expect(formationCapForTurn(true, 5)).toBe(20);
    const result = applyFormationHp(army, 10, 4, 5000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.army.health.hp).toBe(15);
      expect(result.amount).toBe(50000);
      expect(result.army.movement.remainingUnits).toBe(0);
    }
  });

  it("unlocks movement when battle interrupts formation", () => {
    const inBattle: ArmyState = { ...army, status: "IN_BATTLE" };
    const result = applyFormationHp(inBattle, 10, 4, 5000);
    expect(result.ok).toBe(false);
    const interrupted = interruptFormation(inBattle);
    expect(interrupted.movement.remainingUnits).toBe(interrupted.movement.maxUnits);
  });
});
