import { describe, expect, it } from "vitest";
import type { NavalBattleState, NavalInitiativeEntry, ShipClassId, ShipState } from "../../shared/types";
import { createRegisteredShip } from "../ships/shipLifecycle";
import {
  endNavalShipTurn,
  spendNavalMovement,
  startNavalRound,
  useNavalAction
} from "./navalRoundFlow";

function ship(sideId: string, classId: ShipClassId): ShipState {
  return createRegisteredShip(sideId, classId, "NORTH");
}

function initiative(...shipIds: string[]): NavalInitiativeEntry[] {
  return shipIds.map((shipId, index) => ({
    shipId,
    initialRoll: 20 - index,
    bonus: 0,
    total: 20 - index,
    tieBreakRolls: []
  }));
}

function battle(order: string[]): NavalBattleState {
  return {
    version: 1,
    id: "battle",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [],
    participantShipIds: [...order],
    snapshots: {},
    initiative: initiative(...order),
    roundNumber: 1,
    currentShipId: null,
    completedShipIdsThisRound: [],
    movementRemainingByShip: {},
    actionUsedByShip: {},
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 4,
    startedAt: 1,
    revision: 1
  };
}

describe("naval round flow", () => {
  it("starts with the first eligible ship in persisted initiative order and canonical movement budgets", () => {
    const ships = {
      cruiser: ship("red", "CRUISER"),
      battleship: ship("blue", "BATTLESHIP"),
      ironclad: ship("red", "IRONCLAD")
    };
    const result = startNavalRound(battle(["cruiser", "battleship", "ironclad"]), ships);
    expect(result.currentShipId).toBe("cruiser");
    expect(result.movementRemainingByShip).toEqual({ cruiser: 3, battleship: 2, ironclad: 4 });
    expect(result.actionUsedByShip).toEqual({ cruiser: false, battleship: false, ironclad: false });
    expect(result.completedShipIdsThisRound).toEqual([]);
    expect(result.roundNumber).toBe(1);
  });

  it("spends movement only for the active ship and never below zero", () => {
    const ships = { cruiser: ship("red", "CRUISER"), battleship: ship("blue", "BATTLESHIP") };
    const active = startNavalRound(battle(["cruiser", "battleship"]), ships);
    expect(spendNavalMovement(active, "cruiser", 2).movementRemainingByShip.cruiser).toBe(1);
    expect(() => spendNavalMovement(active, "battleship", 1)).toThrow("Ship is not active");
    expect(() => spendNavalMovement(active, "cruiser", 4)).toThrow("Insufficient naval movement");
  });

  it("using an attack or active ability consumes the action and ends the ship turn automatically", () => {
    const ships = { cruiser: ship("red", "CRUISER"), battleship: ship("blue", "BATTLESHIP") };
    const active = spendNavalMovement(startNavalRound(battle(["cruiser", "battleship"]), ships), "cruiser", 1);
    const result = useNavalAction(active, ships, "cruiser");
    expect(result.actionUsedByShip.cruiser).toBe(true);
    expect(result.completedShipIdsThisRound).toEqual(["cruiser"]);
    expect(result.currentShipId).toBe("battleship");
    expect(() => spendNavalMovement(result, "cruiser", 1)).toThrow("Ship is not active");
  });

  it("supports explicit end-turn for movement-only or no-action turns", () => {
    const ships = { cruiser: ship("red", "CRUISER"), battleship: ship("blue", "BATTLESHIP") };
    const active = startNavalRound(battle(["cruiser", "battleship"]), ships);
    const result = endNavalShipTurn(active, ships, "cruiser");
    expect(result.actionUsedByShip.cruiser).toBe(false);
    expect(result.completedShipIdsThisRound).toEqual(["cruiser"]);
    expect(result.currentShipId).toBe("battleship");
  });

  it("skips missing, destroyed and exited ships", () => {
    const destroyed = { ...ship("red", "CRUISER"), hp: 0 };
    const ships = {
      destroyed,
      exited: ship("blue", "BATTLESHIP"),
      alive: ship("red", "IRONCLAD")
    };
    const input = battle(["missing", "destroyed", "exited", "alive"]);
    input.exitedShipIds = ["exited"];
    const result = startNavalRound(input, ships);
    expect(result.currentShipId).toBe("alive");
    expect(result.movementRemainingByShip).toEqual({ alive: 4 });
  });

  it("starts a new round after the last eligible ship and restores per-round limits without changing initiative", () => {
    const ships = { cruiser: ship("red", "CRUISER"), battleship: ship("blue", "BATTLESHIP") };
    const initial = startNavalRound(battle(["cruiser", "battleship"]), ships);
    const afterCruiser = useNavalAction(spendNavalMovement(initial, "cruiser", 2), ships, "cruiser");
    const beforeRoundEnd = spendNavalMovement(afterCruiser, "battleship", 2);
    const result = endNavalShipTurn(beforeRoundEnd, ships, "battleship");
    expect(result.roundNumber).toBe(2);
    expect(result.currentShipId).toBe("cruiser");
    expect(result.completedShipIdsThisRound).toEqual([]);
    expect(result.movementRemainingByShip).toEqual({ cruiser: 3, battleship: 2 });
    expect(result.actionUsedByShip).toEqual({ cruiser: false, battleship: false });
    expect(result.initiative).toEqual(initial.initiative);
  });
});
