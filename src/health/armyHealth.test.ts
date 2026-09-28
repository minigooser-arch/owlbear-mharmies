/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, expect, it } from "vitest";
import { createFormationArmy } from "../armies/armyFormation";
import { applyAutomaticTurnHealing, healArmyForTurn } from "./armyHealth";

describe("army healing limits", () => {
  it("allows at most 10 HP per global turn and blocks formation/battle armies", () => {
    const ready = { ...createFormationArmy({ armyId: "a", sideId: "s", status: "READY", maxUnits: 10, turnNumber: 2, experience: 0 }), formation: { active: false, cityId: null, hpAddedThisTurn: 0, checkedOnTurn: 2 }, health: { hp: 20, maxHp: 40 } };
    const healed = healArmyForTurn(ready, 10, 2);
    expect(healed?.health.hp).toBe(30);
    expect(healArmyForTurn(healed!, 1, 2)).toBeUndefined();
    expect(healArmyForTurn({ ...ready, status: "IN_BATTLE" }, 1, 2)).toBeUndefined();
  });

  it("applies free recovery only to eligible armies", () => {
    const damaged = { ...createFormationArmy({ armyId: "a", sideId: "s", status: "READY", maxUnits: 10, turnNumber: 2, experience: 0 }), formation: { active: false, cityId: null, hpAddedThisTurn: 0, checkedOnTurn: 2 }, health: { hp: 30, maxHp: 40 } };
    expect(applyAutomaticTurnHealing(damaged).health.hp).toBe(40);
    expect(applyAutomaticTurnHealing({ ...damaged, supply: { supplied: false, checkedOnTurn: 2 } }).health.hp).toBe(30);
    expect(applyAutomaticTurnHealing({ ...damaged, health: { hp: 40, maxHp: 40 } }).revision).toBe(damaged.revision);
  });
});
