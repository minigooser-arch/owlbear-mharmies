import { describe, expect, it } from "vitest";
import type { GridCellCoord, NavalBattleState, ShipState } from "../../shared/types";
import { createRegisteredShip } from "../ships/shipLifecycle";
import {
  activateCruiserInterception,
  isCruiserInterceptionZoneCell,
  removeCruiserInterceptionAfterDamage,
  shouldTriggerCruiserInterception
} from "./cruiserInterception";

function battle(): NavalBattleState {
  return {
    version: 1,
    id: "battle",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [],
    participantShipIds: ["cruiser", "enemy", "friendly"],
    snapshots: {},
    initiative: [
      { shipId: "cruiser", initialRoll: 20, bonus: 2, total: 22, tieBreakRolls: [] },
      { shipId: "enemy", initialRoll: 10, bonus: 0, total: 10, tieBreakRolls: [] },
      { shipId: "friendly", initialRoll: 5, bonus: 0, total: 5, tieBreakRolls: [] }
    ],
    roundNumber: 3,
    currentShipId: "cruiser",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { cruiser: 2, enemy: 4, friendly: 2 },
    actionUsedByShip: { cruiser: false, enemy: false, friendly: false },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 8,
    startedAt: 1,
    revision: 5
  };
}

function ships(): Record<string, ShipState> {
  return {
    cruiser: createRegisteredShip("red", "CRUISER", "NORTH"),
    enemy: createRegisteredShip("blue", "IRONCLAD", "WEST"),
    friendly: createRegisteredShip("red", "BATTLESHIP", "SOUTH")
  };
}

const cruiserCell: GridCellCoord = { x: 5, y: 5 };

function withActiveInterception(source = battle()): NavalBattleState {
  return {
    ...source,
    interceptions: {
      cruiser: { cruiserShipId: "cruiser", activatedRoundNumber: 3 }
    }
  } as NavalBattleState;
}

describe("cruiser interception activation", () => {
  it("uses the cruiser action, ends remaining movement, advances the turn and stores one active zone", () => {
    const result = activateCruiserInterception({
      battle: battle(),
      cruiserId: "cruiser",
      cruiser: ships().cruiser!,
      ships: ships()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.battle.actionUsedByShip.cruiser).toBe(true);
    expect(result.battle.movementRemainingByShip.cruiser).toBe(0);
    expect(result.battle.currentShipId).toBe("enemy");
    expect(result.battle.interceptions?.cruiser).toEqual({
      cruiserShipId: "cruiser",
      activatedRoundNumber: 3
    });
  });

  it("rejects non-cruisers and a ship that is not currently active", () => {
    expect(activateCruiserInterception({
      battle: battle(),
      cruiserId: "cruiser",
      cruiser: createRegisteredShip("red", "BATTLESHIP", "NORTH"),
      ships: ships()
    })).toEqual({ ok: false, reason: "SHIP_NOT_CRUISER" });

    const inactive = battle();
    inactive.currentShipId = "enemy";
    expect(activateCruiserInterception({
      battle: inactive,
      cruiserId: "cruiser",
      cruiser: ships().cruiser!,
      ships: ships()
    })).toEqual({ ok: false, reason: "SHIP_NOT_ACTIVE" });
  });
});

describe("cruiser interception dynamic zone", () => {
  it("uses the current exact cruiser broadside plus current LOS", () => {
    const cruiser = ships().cruiser!;
    expect(isCruiserInterceptionZoneCell({
      cruiser,
      cruiserCell,
      candidateCell: { x: 7, y: 5 },
      hasLineOfSight: () => true
    })).toBe(true);
    expect(isCruiserInterceptionZoneCell({
      cruiser,
      cruiserCell,
      candidateCell: { x: 5, y: 3 },
      hasLineOfSight: () => true
    })).toBe(false);
    expect(isCruiserInterceptionZoneCell({
      cruiser,
      cruiserCell,
      candidateCell: { x: 7, y: 5 },
      hasLineOfSight: () => false
    })).toBe(false);
  });

  it("triggers only when a ship of another side actually moves from outside to inside", () => {
    const activeBattle = withActiveInterception();
    const currentShips = ships();
    const base = {
      battle: activeBattle,
      ships: currentShips,
      cruiserId: "cruiser",
      cruiserCell,
      hasLineOfSight: () => true
    };

    expect(shouldTriggerCruiserInterception({
      ...base,
      movingShipId: "enemy",
      sourceCell: { x: 5, y: 3 },
      destinationCell: { x: 7, y: 5 }
    })).toBe(true);

    expect(shouldTriggerCruiserInterception({
      ...base,
      movingShipId: "enemy",
      sourceCell: { x: 6, y: 5 },
      destinationCell: { x: 7, y: 5 }
    })).toBe(false);

    expect(shouldTriggerCruiserInterception({
      ...base,
      movingShipId: "friendly",
      sourceCell: { x: 5, y: 3 },
      destinationCell: { x: 7, y: 5 }
    })).toBe(false);
  });

  it("removes an unused zone after positive actual HP loss but not after zero loss", () => {
    const activeBattle = withActiveInterception();
    expect(removeCruiserInterceptionAfterDamage(activeBattle, "cruiser", 0).interceptions?.cruiser)
      .toBeDefined();
    expect(removeCruiserInterceptionAfterDamage(activeBattle, "cruiser", 1).interceptions?.cruiser)
      .toBeUndefined();
  });
});
