/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, expect, it } from "vitest";
import { createFormationArmy } from "../armies/armyFormation";
import { canHealArmy, healArmyForTurn } from "./armyHealth";

function readyArmy() {
  return {
    ...createFormationArmy({ armyId: "a", sideId: "s", status: "READY", maxUnits: 10, turnNumber: 2, experience: 0 }),
    formation: { active: false, cityId: null, hpAddedThisTurn: 0, checkedOnTurn: 2 },
    health: { hp: 20, maxHp: 40 }
  };
}

describe("army healing limits", () => {
  it("tracks the actual HP restored against the per-turn cap", () => {
    const ready = readyArmy();
    const first = healArmyForTurn(ready, 7, 2, 10);
    expect(first?.health.hp).toBe(27);
    expect(first?.healing?.hpHealedThisTurn).toBe(7);

    const second = healArmyForTurn(first!, 3, 2, 10);
    expect(second?.health.hp).toBe(30);
    expect(second?.healing?.hpHealedThisTurn).toBe(10);
    expect(healArmyForTurn(second!, 1, 2, 10)).toBeUndefined();
  });

  it("does not heal unsupplied, forming, destroyed, or in-battle armies", () => {
    const ready = readyArmy();
    expect(canHealArmy({ ...ready, supply: { supplied: false, checkedOnTurn: 2 } }).allowed).toBe(false);
    expect(canHealArmy({ ...ready, formation: { active: true, cityId: null, hpAddedThisTurn: 0, checkedOnTurn: 2 } }).allowed).toBe(false);
    expect(canHealArmy({ ...ready, health: { hp: 0, maxHp: 40 } }).allowed).toBe(false);
    expect(canHealArmy({ ...ready, status: "IN_BATTLE" }).allowed).toBe(false);
  });

  it("records only the HP that was actually missing", () => {
    const almostFull = { ...readyArmy(), health: { hp: 38, maxHp: 40 } };
    const healed = healArmyForTurn(almostFull, 5, 2, 10);
    expect(healed?.health.hp).toBe(40);
    expect(healed?.healing?.hpHealedThisTurn).toBe(2);
  });
});
