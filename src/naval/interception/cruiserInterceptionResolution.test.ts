import { describe, expect, it } from "vitest";
import type { GridCellCoord, NavalBattleState, ShipState } from "../../shared/types";
import { createRegisteredShip } from "../ships/shipLifecycle";
import { resolveCruiserInterceptionsForStep } from "./cruiserInterception";

function ship(sideId: string, classId: ShipState["classId"], facing: ShipState["facing"]): ShipState {
  return {
    ...createRegisteredShip(sideId, classId, facing),
    status: "IN_NAVAL_BATTLE",
    battleId: "battle"
  };
}

function battle(): NavalBattleState {
  return {
    version: 1,
    id: "battle",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [],
    participantShipIds: ["cruiser-a", "cruiser-b", "target", "next"],
    snapshots: {},
    initiative: [
      { shipId: "cruiser-a", initialRoll: 20, bonus: 2, total: 22, tieBreakRolls: [] },
      { shipId: "cruiser-b", initialRoll: 18, bonus: 2, total: 20, tieBreakRolls: [] },
      { shipId: "target", initialRoll: 15, bonus: 1, total: 16, tieBreakRolls: [] },
      { shipId: "next", initialRoll: 10, bonus: 0, total: 10, tieBreakRolls: [] }
    ],
    roundNumber: 4,
    currentShipId: "target",
    completedShipIdsThisRound: ["cruiser-a", "cruiser-b"],
    movementRemainingByShip: { "cruiser-a": 0, "cruiser-b": 0, target: 4, next: 2 },
    actionUsedByShip: { "cruiser-a": true, "cruiser-b": true, target: false, next: false },
    interceptions: {
      "cruiser-a": { cruiserShipId: "cruiser-a", activatedRoundNumber: 3 },
      "cruiser-b": { cruiserShipId: "cruiser-b", activatedRoundNumber: 3 }
    },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 8,
    startedAt: 1,
    revision: 10
  };
}

const cells: Record<string, GridCellCoord> = {
  "cruiser-a": { x: 5, y: 5 },
  "cruiser-b": { x: 5, y: 6 },
  target: { x: 5, y: 3 },
  next: { x: 0, y: 0 }
};

function ships(): Record<string, ShipState> {
  return {
    "cruiser-a": ship("red", "CRUISER", "NORTH"),
    "cruiser-b": ship("green", "CRUISER", "NORTH"),
    target: ship("blue", "IRONCLAD", "WEST"),
    next: ship("blue", "BATTLESHIP", "SOUTH")
  };
}

describe("cruiser interception resolution", () => {
  it("declares every matching zone simultaneously, applies each 2d6 attack and ends the target activation", () => {
    const rolls = [3, 3, 3, 3];
    const result = resolveCruiserInterceptionsForStep({
      battle: battle(),
      ships: ships(),
      movingShipId: "target",
      sourceCell: { x: 5, y: 3 },
      destinationCell: { x: 7, y: 5 },
      shipCells: cells,
      hasLineOfSight: () => true,
      rollD6: () => rolls.shift() ?? 1
    });

    expect(result.triggered).toHaveLength(2);
    expect(result.triggered.map((entry) => entry.cruiserShipId)).toEqual(["cruiser-a", "cruiser-b"]);
    expect(result.triggered.map((entry) => entry.rolledDamage)).toEqual([6, 6]);
    expect(result.triggered.map((entry) => entry.armor)).toEqual([2, 2]);
    expect(result.triggered.map((entry) => entry.damage)).toEqual([4, 4]);
    expect(result.ships.target?.hp).toBe(17);
    expect(result.battle.interceptions?.["cruiser-a"]).toBeUndefined();
    expect(result.battle.interceptions?.["cruiser-b"]).toBeUndefined();
    expect(result.battle.movementRemainingByShip.target).toBe(0);
    expect(result.battle.actionUsedByShip.target).toBe(true);
    expect(result.battle.completedShipIdsThisRound).toContain("target");
    expect(result.battle.currentShipId).toBe("next");
  });

  it("consumes the zone and ends the target activation even when armor reduces damage to zero", () => {
    const oneBattle = battle();
    oneBattle.interceptions = {
      "cruiser-a": { cruiserShipId: "cruiser-a", activatedRoundNumber: 3 }
    };
    const currentShips = ships();
    currentShips.target = ship("blue", "BATTLESHIP", "WEST");

    const result = resolveCruiserInterceptionsForStep({
      battle: oneBattle,
      ships: currentShips,
      movingShipId: "target",
      sourceCell: { x: 5, y: 3 },
      destinationCell: { x: 7, y: 5 },
      shipCells: cells,
      hasLineOfSight: () => true,
      rollD6: () => 1
    });

    expect(result.triggered).toHaveLength(1);
    expect(result.triggered[0]?.rolledDamage).toBe(2);
    expect(result.triggered[0]?.armor).toBe(3);
    expect(result.triggered[0]?.damage).toBe(0);
    expect(result.ships.target?.hp).toBe(30);
    expect(result.battle.interceptions?.["cruiser-a"]).toBeUndefined();
    expect(result.battle.movementRemainingByShip.target).toBe(0);
    expect(result.battle.actionUsedByShip.target).toBe(true);
    expect(result.battle.currentShipId).toBe("next");
  });
});
