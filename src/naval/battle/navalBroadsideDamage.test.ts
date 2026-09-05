import { describe, expect, it } from "vitest";
import type { NavalBattleState, ShipState } from "../../shared/types";
import { createRegisteredShip } from "../ships/shipLifecycle";
import { commitBroadsideAttack } from "./navalBroadside";

function ship(sideId: string, classId: ShipState["classId"], hp?: number, temporaryHp = 0): ShipState {
  return {
    ...createRegisteredShip(sideId, classId, "NORTH"),
    ...(hp === undefined ? {} : { hp }),
    temporaryHp
  };
}

function battle(): NavalBattleState {
  return {
    version: 1,
    id: "battle",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [],
    participantShipIds: ["attacker", "target", "next"],
    snapshots: {},
    initiative: [
      { shipId: "attacker", initialRoll: 20, bonus: 0, total: 20, tieBreakRolls: [] },
      { shipId: "target", initialRoll: 15, bonus: 0, total: 15, tieBreakRolls: [] },
      { shipId: "next", initialRoll: 10, bonus: 0, total: 10, tieBreakRolls: [] }
    ],
    roundNumber: 1,
    currentShipId: "attacker",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { attacker: 4, target: 2, next: 3 },
    actionUsedByShip: { attacker: false, target: false, next: false },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 4,
    startedAt: 1,
    revision: 1
  };
}

function roller(values: number[]) {
  const queue = [...values];
  return () => queue.shift() ?? 1;
}

describe("authoritative broadside damage", () => {
  it("rolls normal class dice, subtracts target armor, and absorbs damage with temporary HP first", () => {
    const ships = {
      attacker: ship("red", "CRUISER"),
      target: ship("blue", "BATTLESHIP", 30, 2),
      next: ship("green", "CRUISER")
    };

    const result = commitBroadsideAttack({
      battle: battle(),
      ships,
      attackerId: "attacker",
      targetId: "target",
      attackerCell: { x: 5, y: 5 },
      targetCell: { x: 7, y: 5 },
      distanceCells: () => 2,
      hasLineOfSight: () => true,
      rollD6: roller([6, 4])
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rolledDamage).toBe(10);
    expect(result.armor).toBe(3);
    expect(result.damage).toBe(7);
    expect(result.special).toBe(false);
    expect(result.target).toMatchObject({ hp: 25, temporaryHp: 0 });
    expect(result.battle.actionUsedByShip.attacker).toBe(true);
    expect(result.battle.currentShipId).toBe("target");
  });

  it("automatically uses the ironclad adjacent broadside special: 3d6 and armor ignored", () => {
    const ships = {
      attacker: ship("red", "IRONCLAD"),
      target: ship("blue", "BATTLESHIP", 30),
      next: ship("green", "CRUISER")
    };

    const result = commitBroadsideAttack({
      battle: battle(),
      ships,
      attackerId: "attacker",
      targetId: "target",
      attackerCell: { x: 5, y: 5 },
      targetCell: { x: 6, y: 5 },
      distanceCells: () => 1,
      hasLineOfSight: () => true,
      rollD6: roller([6, 5, 4])
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rolledDamage).toBe(15);
    expect(result.armor).toBe(0);
    expect(result.damage).toBe(15);
    expect(result.special).toBe(true);
    expect(result.target.hp).toBe(15);
  });

  it("uses the ironclad normal 2d6 attack outside the adjacent special cells", () => {
    const ships = {
      attacker: ship("red", "IRONCLAD"),
      target: ship("blue", "BATTLESHIP", 30),
      next: ship("green", "CRUISER")
    };

    const result = commitBroadsideAttack({
      battle: battle(),
      ships,
      attackerId: "attacker",
      targetId: "target",
      attackerCell: { x: 5, y: 5 },
      targetCell: { x: 7, y: 5 },
      distanceCells: () => 2,
      hasLineOfSight: () => true,
      rollD6: roller([6, 5, 4])
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rolledDamage).toBe(11);
    expect(result.armor).toBe(3);
    expect(result.damage).toBe(8);
    expect(result.special).toBe(false);
    expect(result.target.hp).toBe(22);
  });

  it("uses the canonical mask when no test sector resolver is supplied", () => {
    const ships = {
      attacker: ship("red", "CRUISER"),
      target: ship("blue", "BATTLESHIP"),
      next: ship("green", "CRUISER")
    };

    const result = commitBroadsideAttack({
      battle: battle(),
      ships,
      attackerId: "attacker",
      targetId: "target",
      attackerCell: { x: 5, y: 5 },
      targetCell: { x: 5, y: 3 },
      distanceCells: () => 2,
      hasLineOfSight: () => true,
      rollD6: roller([6, 6])
    });

    expect(result).toEqual({ ok: false, reason: "OUTSIDE_BROADSIDE_SECTOR" });
  });
});
