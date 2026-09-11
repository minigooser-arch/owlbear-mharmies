import { describe, expect, it } from "vitest";
import {
  areStatesAtWar,
  hasMilitaryAccess,
  removeStateRelations,
  setMilitaryAccess,
  setPairWar
} from "./stateRelations";

describe("stateRelations", () => {
  it("keeps military access directional", () => {
    const relations = setMilitaryAccess({}, "russia", "germany", true);
    expect(hasMilitaryAccess(relations, "russia", "germany")).toBe(true);
    expect(hasMilitaryAccess(relations, "germany", "russia")).toBe(false);
  });

  it("keeps war symmetric and isolated to the exact pair", () => {
    const relations = setPairWar({}, "russia", "germany", true);
    expect(areStatesAtWar(relations, "russia", "germany")).toBe(true);
    expect(areStatesAtWar(relations, "germany", "russia")).toBe(true);
    expect(areStatesAtWar(relations, "russia", "france")).toBe(false);
    expect(relations.russia?.germany?.atWar).toBe(true);
    expect(relations.germany?.russia?.atWar).toBe(true);
  });

  it("ending war preserves directed passage", () => {
    let relations = setMilitaryAccess({}, "russia", "germany", true);
    relations = setPairWar(relations, "russia", "germany", true);
    relations = setPairWar(relations, "russia", "germany", false);
    expect(areStatesAtWar(relations, "russia", "germany")).toBe(false);
    expect(hasMilitaryAccess(relations, "russia", "germany")).toBe(true);
    expect(hasMilitaryAccess(relations, "germany", "russia")).toBe(false);
  });

  it("removes every relation edge for a deleted state", () => {
    let relations = setMilitaryAccess({}, "russia", "germany", true);
    relations = setMilitaryAccess(relations, "france", "russia", true);
    relations = setPairWar(relations, "russia", "germany", true);
    expect(removeStateRelations(relations, "russia")).toEqual({
      germany: {},
      france: {}
    });
  });
});
