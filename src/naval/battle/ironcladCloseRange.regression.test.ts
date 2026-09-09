import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "../ships/shipLifecycle";
import { SHIP_CLASSES } from "../ships/shipClasses";
import { isInNormalBroadsideMask } from "./broadsideMask";
import { commitBroadsideAttack } from "./navalBroadside";
import type { GridCellCoord, NavalBattleState, ShipState } from "../../shared/types";

const origin: GridCellCoord = { x: 10, y: 10 };

function target(dx: number, dy: number): GridCellCoord {
  return { x: origin.x + dx, y: origin.y + dy };
}

function battle(): NavalBattleState {
  return {
    version: 1,
    id: "battle",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [],
    participantShipIds: ["ironclad", "target"],
    snapshots: {},
    initiative: [
      { shipId: "ironclad", initialRoll: 20, bonus: 0, total: 20, tieBreakRolls: [] },
      { shipId: "target", initialRoll: 10, bonus: 0, total: 10, tieBreakRolls: [] }
    ],
    roundNumber: 1,
    currentShipId: "ironclad",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { ironclad: 4, target: 2 },
    actionUsedByShip: { ironclad: false, target: false },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 1,
    startedAt: 1,
    revision: 1
  };
}

function ironclad(): ShipState {
  return {
    ...createRegisteredShip("red", "IRONCLAD", "NORTH"),
    status: "IN_NAVAL_BATTLE",
    battleId: "battle"
  };
}

function enemy(): ShipState {
  return {
    ...createRegisteredShip("blue", "BATTLESHIP", "NORTH"),
    status: "IN_NAVAL_BATTLE",
    battleId: "battle"
  };
}

describe("ironclad close-range firing arc", () => {
  it("exposes only the immediately adjacent port/starboard cells and has range 1 only", () => {
    expect(SHIP_CLASSES.IRONCLAD.normalRangeMin).toBe(1);
    expect(SHIP_CLASSES.IRONCLAD.normalRangeMax).toBe(1);

    expect(isInNormalBroadsideMask("IRONCLAD", "NORTH", origin, target(-1, 0))).toBe(true);
    expect(isInNormalBroadsideMask("IRONCLAD", "NORTH", origin, target(1, 0))).toBe(true);
    expect(isInNormalBroadsideMask("IRONCLAD", "NORTH", origin, target(-2, 0))).toBe(false);
    expect(isInNormalBroadsideMask("IRONCLAD", "NORTH", origin, target(2, 0))).toBe(false);
    expect(isInNormalBroadsideMask("IRONCLAD", "NORTH", origin, target(1, 1))).toBe(false);
    expect(isInNormalBroadsideMask("IRONCLAD", "NORTH", origin, target(0, -1))).toBe(false);
  });

  it("allows the adjacent 3d6 armor-ignoring attack but rejects the old two-cell broadside", () => {
    const close = commitBroadsideAttack({
      battle: battle(),
      ships: { ironclad: ironclad(), target: enemy() },
      attackerId: "ironclad",
      targetId: "target",
      attackerCell: origin,
      targetCell: target(1, 0),
      distanceCells: () => 1,
      hasLineOfSight: () => true,
      rollD6: () => 4
    });
    expect(close.ok).toBe(true);
    if (close.ok) {
      expect(close.special).toBe(true);
      expect(close.rolledDamage).toBe(12);
      expect(close.armor).toBe(0);
      expect(close.damage).toBe(12);
    }

    const distant = commitBroadsideAttack({
      battle: battle(),
      ships: { ironclad: ironclad(), target: enemy() },
      attackerId: "ironclad",
      targetId: "target",
      attackerCell: origin,
      targetCell: target(2, 0),
      distanceCells: () => 2,
      hasLineOfSight: () => true,
      rollD6: () => 4
    });
    expect(distant).toEqual({ ok: false, reason: "OUTSIDE_BROADSIDE_SECTOR" });
  });
});
