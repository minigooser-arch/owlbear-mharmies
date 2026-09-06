import { describe, expect, it } from "vitest";
import type { NavalBattleState, ShipState } from "../../shared/types";
import { createRegisteredShip } from "../ships/shipLifecycle";
import { endNavalShipTurn } from "../battle/navalRoundFlow";

function ships(): Record<string, ShipState> {
  return {
    cruiser: createRegisteredShip("red", "CRUISER", "NORTH"),
    enemy: createRegisteredShip("blue", "IRONCLAD", "SOUTH"),
    third: createRegisteredShip("green", "BATTLESHIP", "WEST")
  };
}

function battle(): NavalBattleState {
  return {
    version: 1,
    id: "battle",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [],
    participantShipIds: ["cruiser", "enemy", "third"],
    snapshots: {},
    initiative: [
      { shipId: "cruiser", initialRoll: 20, bonus: 2, total: 22, tieBreakRolls: [] },
      { shipId: "enemy", initialRoll: 15, bonus: 0, total: 15, tieBreakRolls: [] },
      { shipId: "third", initialRoll: 10, bonus: 0, total: 10, tieBreakRolls: [] }
    ],
    roundNumber: 2,
    currentShipId: "enemy",
    completedShipIdsThisRound: ["cruiser"],
    movementRemainingByShip: { cruiser: 0, enemy: 3, third: 3 },
    actionUsedByShip: { cruiser: true, enemy: false, third: false },
    interceptions: {
      cruiser: { cruiserShipId: "cruiser", activatedRoundNumber: 2 }
    },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 8,
    startedAt: 1,
    revision: 5
  };
}

describe("cruiser interception expiry", () => {
  it("keeps the zone while another ship begins its turn", () => {
    const currentShips = ships();
    const next = endNavalShipTurn(battle(), currentShips, "enemy");

    expect(next.currentShipId).toBe("third");
    expect(next.roundNumber).toBe(2);
    expect(next.interceptions?.cruiser).toEqual({
      cruiserShipId: "cruiser",
      activatedRoundNumber: 2
    });
  });

  it("removes the zone exactly when the cruiser becomes active again next round", () => {
    const currentShips = ships();
    const afterEnemy = endNavalShipTurn(battle(), currentShips, "enemy");
    const nextRound = endNavalShipTurn(afterEnemy, currentShips, "third");

    expect(nextRound.roundNumber).toBe(3);
    expect(nextRound.currentShipId).toBe("cruiser");
    expect(nextRound.interceptions?.cruiser).toBeUndefined();
  });
});
