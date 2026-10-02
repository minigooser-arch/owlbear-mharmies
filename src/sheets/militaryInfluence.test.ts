import { describe, expect, it } from "vitest";
import {
  MILITARY_INFLUENCE_DELTAS,
  militaryInfluenceDelta,
  validateMilitaryInfluenceOperation
} from "./militaryInfluence";

describe("military influence rules", () => {
  it("uses the exact rewards and costs from the rules", () => {
    expect(MILITARY_INFLUENCE_DELTAS.LAND_BATTLE_VICTORY).toBe(4);
    expect(MILITARY_INFLUENCE_DELTAS.NAVAL_BATTLE_VICTORY).toBe(4);
    expect(MILITARY_INFLUENCE_DELTAS.DESTROY_ENEMY_ARMY).toBe(3);
    expect(MILITARY_INFLUENCE_DELTAS.DESTROY_ENEMY_SHIP).toBe(3);
    expect(MILITARY_INFLUENCE_DELTAS.SUCCESSFUL_CITY_DEFENSE).toBe(3);
    expect(MILITARY_INFLUENCE_DELTAS.SUCCESSFUL_CITY_OCCUPATION).toBe(3);
    expect(MILITARY_INFLUENCE_DELTAS.SHIP_TRANSFER).toBe(-15);
    expect(MILITARY_INFLUENCE_DELTAS.MILITARY_UPGRADE_I).toBe(-20);
    expect(MILITARY_INFLUENCE_DELTAS.APPOINT_COMMANDER_IN_CHIEF).toBe(-30);
    expect(MILITARY_INFLUENCE_DELTAS.MILITARY_UPGRADE_II).toBe(-30);
    expect(MILITARY_INFLUENCE_DELTAS.MILITARY_UPGRADE_III).toBe(-50);
  });

  it("rejects a delta that does not match its reason", () => {
    expect(() => militaryInfluenceDelta("LAND_BATTLE_VICTORY", -4)).toThrow("MILITARY_INFLUENCE_DELTA_MISMATCH");
  });

  it("rejects a cost that would make the balance negative", () => {
    expect(() => validateMilitaryInfluenceOperation({
      requestId: "mi-1",
      factionId: "f",
      factionName: "Фракция",
      country: "united_kingdom",
      reasonCode: "SHIP_TRANSFER",
      delta: -15,
      balanceBefore: 10
    })).toThrow("INSUFFICIENT_MILITARY_INFLUENCE");
  });
});
