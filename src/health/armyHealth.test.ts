/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, expect, it } from "vitest";
import { createFormationArmy } from "../armies/armyFormation";
import { applyPendingTurnHealing, healArmyForTurn, requestArmyHealing } from "./armyHealth";

describe("army healing limits", () => {
  it("allows at most 10 HP per global turn and blocks formation/battle armies", () => {
    const ready = { ...createFormationArmy({ armyId: "a", sideId: "s", status: "READY", maxUnits: 10, turnNumber: 2, experience: 0 }), formation: { active: false, cityId: null, hpAddedThisTurn: 0, checkedOnTurn: 2 }, health: { hp: 20, maxHp: 40 } };
    const healed = healArmyForTurn(ready, 10, 2);
    expect(healed?.health.hp).toBe(30);
    expect(healArmyForTurn(healed!, 1, 2)).toBeUndefined();
    expect(healArmyForTurn({ ...ready, status: "IN_BATTLE" }, 1, 2)).toBeUndefined();
  });

  it("schedules free recovery and applies it at turn completion", () => {
    const damaged = { ...createFormationArmy({ armyId: "a", sideId: "s", status: "READY", maxUnits: 10, turnNumber: 2, experience: 0 }), formation: { active: false, cityId: null, hpAddedThisTurn: 0, checkedOnTurn: 2 }, health: { hp: 30, maxHp: 40 } };
    const pending = requestArmyHealing(damaged, 2, "leader");
    expect(pending?.health.hp).toBe(30);
    expect(pending?.healing?.pending).toBe(true);
    if (!pending) throw new Error("healing request was rejected");
    expect(applyPendingTurnHealing(pending).health.hp).toBe(40);
    expect(applyPendingTurnHealing(pending).healing?.pending).toBe(false);
    expect(applyPendingTurnHealing({ ...pending, supply: { supplied: false, checkedOnTurn: 2 } }).health.hp).toBe(30);
  });

  it("applies the requested amount at the next turn start", () => {
    const damaged = { ...createFormationArmy({ armyId: "a", sideId: "s", status: "READY", maxUnits: 10, turnNumber: 2, experience: 0 }), formation: { active: false, cityId: null, hpAddedThisTurn: 0, checkedOnTurn: 2 }, health: { hp: 30, maxHp: 40 } };
    const pending = requestArmyHealing(damaged, 2, "leader", 2);
    expect(pending?.health.hp).toBe(30);
    expect(pending?.healing?.pendingHp).toBe(2);
    if (!pending) throw new Error("healing request was rejected");
    expect(applyPendingTurnHealing(pending).health.hp).toBe(32);
  });
});

