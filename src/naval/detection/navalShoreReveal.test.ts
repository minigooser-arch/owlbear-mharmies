import { describe, expect, it } from "vitest";
import { applyShipRevealUntilNextTurn } from "./navalVisibility";

describe("shore bombardment reveal", () => {
  it("reveals the firing ship to the target side through the existing next-turn reveal mechanism", () => {
    expect(applyShipRevealUntilNextTurn({
      shipId: "attacker",
      observerSideId: "blue",
      revealUntilTurn: {},
      currentTurn: 7
    })).toEqual({
      blue: { attacker: 8 }
    });
  });

  it("never shortens an existing longer reveal", () => {
    expect(applyShipRevealUntilNextTurn({
      shipId: "attacker",
      observerSideId: "blue",
      revealUntilTurn: { blue: { attacker: 12 } },
      currentTurn: 7
    })).toEqual({
      blue: { attacker: 12 }
    });
  });
});
