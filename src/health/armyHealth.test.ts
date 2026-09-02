import { describe, expect, it } from "vitest";
import { applyEncirclementDamage, canHealArmy } from "./armyHealth";
import { roomArmy } from "../tests/helpers/factories";

describe("army health", () => {
  it("removes ten percent of maximum HP while encircled", () => {
    const army = roomArmy("a","red","A",0).state;
    army.health = { hp: 50, maxHp: 50 };
    army.supply = { supplied:false, checkedOnTurn:2 };
    expect(applyEncirclementDamage(army).health.hp).toBe(45);
  });
  it("blocks healing while unsupplied", () => {
    const army = roomArmy("a","red","A",0).state;
    army.supply.supplied = false;
    expect(canHealArmy(army)).toEqual({ allowed:false, reason:"ARMY_ENCIRCLED" });
  });
});
