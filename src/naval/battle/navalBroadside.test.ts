import { describe, expect, it, vi } from "vitest";
import type { GridCellCoord, NavalBattleState, ShipState } from "../../shared/types";
import { createRegisteredShip } from "../ships/shipLifecycle";
import {
  commitBroadsideAction,
  validateBroadsideTarget,
  type BroadsideSectorResolver
} from "./navalBroadside";

function ship(sideId: string, classId: ShipState["classId"] = "CRUISER"): ShipState {
  return createRegisteredShip(sideId, classId, "NORTH");
}

function battle(): NavalBattleState {
  return {
    version: 1,
    id: "battle",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [],
    participantShipIds: ["attacker", "target", "ally"],
    snapshots: {},
    initiative: [
      { shipId: "attacker", initialRoll: 20, bonus: 2, total: 22, tieBreakRolls: [] },
      { shipId: "target", initialRoll: 15, bonus: 0, total: 15, tieBreakRolls: [] },
      { shipId: "ally", initialRoll: 10, bonus: 0, total: 10, tieBreakRolls: [] }
    ],
    roundNumber: 1,
    currentShipId: "attacker",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { attacker: 3, target: 2, ally: 3 },
    actionUsedByShip: { attacker: false, target: false, ally: false },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 4,
    startedAt: 1,
    revision: 1
  };
}

function exactSector(allowed: GridCellCoord[]): BroadsideSectorResolver {
  return ({ targetCell }) => allowed.some((cell) => cell.x === targetCell.x && cell.y === targetCell.y);
}

const attackerCell = { x: 5, y: 5 };
const broadsideTarget = { x: 7, y: 5 };

describe("naval broadside targeting", () => {
  it("accepts a valid enemy target inside the supplied exact broadside mask, range, and LOS", () => {
    const result = validateBroadsideTarget({
      battle: battle(),
      attackerId: "attacker",
      targetId: "target",
      attacker: ship("red"),
      target: ship("blue"),
      attackerCell,
      targetCell: broadsideTarget,
      sectorResolver: exactSector([broadsideTarget]),
      distanceCells: () => 2,
      hasLineOfSight: () => true
    });
    expect(result).toEqual({ ok: true, range: 2 });
  });

  it("rejects firing from a ship that is not currently active", () => {
    const input = battle();
    input.currentShipId = "target";
    expect(validateBroadsideTarget({
      battle: input,
      attackerId: "attacker",
      targetId: "target",
      attacker: ship("red"),
      target: ship("blue"),
      attackerCell,
      targetCell: broadsideTarget,
      sectorResolver: exactSector([broadsideTarget]),
      distanceCells: () => 2,
      hasLineOfSight: () => true
    })).toEqual({ ok: false, reason: "SHIP_NOT_ACTIVE" });
  });

  it("rejects a destroyed active attacker before action, weapon, sector, range, or LOS checks", () => {
    const sectorResolver = vi.fn(() => true);
    const distanceCells = vi.fn(() => 2);
    const hasLineOfSight = vi.fn(() => true);
    const input = battle();
    input.actionUsedByShip.attacker = true;

    expect(validateBroadsideTarget({
      battle: input,
      attackerId: "attacker",
      targetId: "target",
      attacker: { ...ship("red"), hp: 0 },
      target: ship("blue"),
      attackerCell,
      targetCell: broadsideTarget,
      sectorResolver,
      distanceCells,
      hasLineOfSight
    })).toEqual({ ok: false, reason: "SHIP_DESTROYED" });

    expect(sectorResolver).not.toHaveBeenCalled();
    expect(distanceCells).not.toHaveBeenCalled();
    expect(hasLineOfSight).not.toHaveBeenCalled();
  });

  it("rejects unarmed ship classes", () => {
    expect(validateBroadsideTarget({
      battle: battle(),
      attackerId: "attacker",
      targetId: "target",
      attacker: ship("red", "HOSPITAL"),
      target: ship("blue"),
      attackerCell,
      targetCell: broadsideTarget,
      sectorResolver: exactSector([broadsideTarget]),
      distanceCells: () => 1,
      hasLineOfSight: () => true
    })).toEqual({ ok: false, reason: "SHIP_UNARMED" });
  });

  it("rejects destroyed targets before sector, range, or LOS checks", () => {
    expect(validateBroadsideTarget({
      battle: battle(),
      attackerId: "attacker",
      targetId: "target",
      attacker: ship("red"),
      target: { ...ship("blue"), hp: 0 },
      attackerCell,
      targetCell: { x: 99, y: 99 },
      sectorResolver: exactSector([]),
      distanceCells: () => 99,
      hasLineOfSight: () => false
    })).toEqual({ ok: false, reason: "TARGET_DESTROYED" });
  });

  it("rejects targets outside the exact broadside sector mask", () => {
    expect(validateBroadsideTarget({
      battle: battle(),
      attackerId: "attacker",
      targetId: "target",
      attacker: ship("red"),
      target: ship("blue"),
      attackerCell,
      targetCell: { x: 5, y: 3 },
      sectorResolver: exactSector([broadsideTarget]),
      distanceCells: () => 2,
      hasLineOfSight: () => true
    })).toEqual({ ok: false, reason: "OUTSIDE_BROADSIDE_SECTOR" });
  });

  it("rejects targets outside the class min/max range", () => {
    expect(validateBroadsideTarget({
      battle: battle(),
      attackerId: "attacker",
      targetId: "target",
      attacker: ship("red"),
      target: ship("blue"),
      attackerCell,
      targetCell: broadsideTarget,
      sectorResolver: exactSector([broadsideTarget]),
      distanceCells: () => 3,
      hasLineOfSight: () => true
    })).toEqual({ ok: false, reason: "OUT_OF_RANGE", range: 3 });
  });

  it("requires naval line of sight", () => {
    expect(validateBroadsideTarget({
      battle: battle(),
      attackerId: "attacker",
      targetId: "target",
      attacker: ship("red"),
      target: ship("blue"),
      attackerCell,
      targetCell: broadsideTarget,
      sectorResolver: exactSector([broadsideTarget]),
      distanceCells: () => 2,
      hasLineOfSight: () => false
    })).toEqual({ ok: false, reason: "NO_NAVAL_LOS" });
  });

  it("rejects same-side targets", () => {
    expect(validateBroadsideTarget({
      battle: battle(),
      attackerId: "attacker",
      targetId: "ally",
      attacker: ship("red"),
      target: ship("red"),
      attackerCell,
      targetCell: broadsideTarget,
      sectorResolver: exactSector([broadsideTarget]),
      distanceCells: () => 2,
      hasLineOfSight: () => true
    })).toEqual({ ok: false, reason: "FRIENDLY_TARGET" });
  });

  it("committing a valid broadside consumes the action and automatically advances the activation", () => {
    const ships = {
      attacker: ship("red"),
      target: ship("blue", "BATTLESHIP"),
      ally: ship("red")
    };
    const result = commitBroadsideAction({
      battle: battle(),
      ships,
      attackerId: "attacker",
      targetId: "target",
      attackerCell,
      targetCell: broadsideTarget,
      sectorResolver: exactSector([broadsideTarget]),
      distanceCells: () => 2,
      hasLineOfSight: () => true
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.battle.actionUsedByShip.attacker).toBe(true);
    expect(result.battle.completedShipIdsThisRound).toEqual(["attacker"]);
    expect(result.battle.currentShipId).toBe("target");
    expect(result.range).toBe(2);
  });
});
