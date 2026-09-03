import { describe, expect, it } from "vitest";
import type { NavalBattleState, ShipState } from "../../shared/types";
import { createRegisteredShip } from "../ships/shipLifecycle";
import { confirmNavalShipExit } from "./navalExit";

function ship(sideId: string): ShipState {
  return createRegisteredShip(sideId, "CRUISER", "NORTH");
}

function battle(): NavalBattleState {
  return {
    version: 1,
    id: "battle",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [],
    participantShipIds: ["red", "blue"],
    snapshots: {
      red: { shipId: "red", strategicCell: { x: 1, y: 1 }, strategicPosition: { x: 100, y: 100 }, strategicFacing: "NORTH" },
      blue: { shipId: "blue", strategicCell: { x: 2, y: 1 }, strategicPosition: { x: 200, y: 100 }, strategicFacing: "WEST" }
    },
    initiative: [
      { shipId: "red", initialRoll: 20, bonus: 2, total: 22, tieBreakRolls: [] },
      { shipId: "blue", initialRoll: 10, bonus: 0, total: 10, tieBreakRolls: [] }
    ],
    roundNumber: 1,
    currentShipId: "red",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { red: 3, blue: 3 },
    actionUsedByShip: { red: false, blue: false },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 4,
    startedAt: 1,
    revision: 1
  };
}

describe("naval battle exit transition", () => {
  const ships = { red: ship("red"), blue: ship("blue") };

  it("marks only the active ship exited and immediately advances its activation", () => {
    const result = confirmNavalShipExit(battle(), ships, "red");
    expect(result.exitedShipIds).toEqual(["red"]);
    expect(result.completedShipIdsThisRound).toContain("red");
    expect(result.currentShipId).toBe("blue");
  });

  it("keeps the exited ship in battle participants and strategic snapshots", () => {
    const result = confirmNavalShipExit(battle(), ships, "red");
    expect(result.participantShipIds).toContain("red");
    expect(result.snapshots.red).toEqual(battle().snapshots.red);
  });

  it("does not mutate the ship lifecycle state while the battle is still active", () => {
    const before = structuredClone(ships.red);
    confirmNavalShipExit(battle(), ships, "red");
    expect(ships.red).toEqual(before);
    expect(ships.red.status).toBe("READY");
  });

  it("rejects exiting a ship that is not currently active", () => {
    expect(() => confirmNavalShipExit(battle(), ships, "blue")).toThrow("Ship is not active");
  });

  it("rejects exiting the same ship twice", () => {
    const input = battle();
    input.exitedShipIds = ["red"];
    expect(() => confirmNavalShipExit(input, ships, "red")).toThrow("Ship already exited naval battle");
  });
});
