import { describe, expect, it } from "vitest";
import { rollNavalInitiative } from "./navalInitiative";

function sequence(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index];
    if (value === undefined) throw new Error("No more test rolls");
    index += 1;
    return value;
  };
}

describe("naval initiative", () => {
  it("gives +2 only to the specific initiating ship on its initial roll", () => {
    const result = rollNavalInitiative(["initiator", "ally", "enemy"], "initiator", sequence([10, 11, 12, 15, 14]));
    expect(result).toEqual([
      { shipId: "initiator", initialRoll: 10, bonus: 2, total: 12, tieBreakRolls: [15] },
      { shipId: "enemy", initialRoll: 12, bonus: 0, total: 12, tieBreakRolls: [14] },
      { shipId: "ally", initialRoll: 11, bonus: 0, total: 11, tieBreakRolls: [] }
    ]);
  });

  it("orders different totals from highest to lowest without rerolls", () => {
    const result = rollNavalInitiative(["a", "b", "c"], "a", sequence([4, 17, 9]));
    expect(result.map((entry) => entry.shipId)).toEqual(["b", "c", "a"]);
    expect(result.map((entry) => entry.tieBreakRolls)).toEqual([[], [], []]);
  });

  it("rerolls a clean d20 for ships tied on the initial total", () => {
    const result = rollNavalInitiative(["initiator", "enemy"], "initiator", sequence([8, 10, 3, 19]));
    expect(result).toEqual([
      { shipId: "enemy", initialRoll: 10, bonus: 0, total: 10, tieBreakRolls: [19] },
      { shipId: "initiator", initialRoll: 8, bonus: 2, total: 10, tieBreakRolls: [3] }
    ]);
  });

  it("rerolls only the still-tied subgroup when a tie repeats", () => {
    const result = rollNavalInitiative(["a", "b", "c"], "a", sequence([
      8, 10, 10,
      15, 15, 7,
      4, 18
    ]));
    expect(result.map((entry) => entry.shipId)).toEqual(["b", "a", "c"]);
    expect(result.find((entry) => entry.shipId === "a")?.tieBreakRolls).toEqual([15, 4]);
    expect(result.find((entry) => entry.shipId === "b")?.tieBreakRolls).toEqual([15, 18]);
    expect(result.find((entry) => entry.shipId === "c")?.tieBreakRolls).toEqual([7]);
  });

  it("rejects an initiating ship that is not a participant", () => {
    expect(() => rollNavalInitiative(["a", "b"], "missing", sequence([1, 2]))).toThrow("Initiating ship must participate");
  });

  it("rejects invalid d20 results", () => {
    expect(() => rollNavalInitiative(["a"], "a", sequence([21]))).toThrow("Invalid d20 roll");
  });
});
