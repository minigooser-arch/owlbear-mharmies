import { describe, expect, it } from "vitest";
import type { GridCellCoord, NavalBattleState, ShipState } from "../../shared/types";
import { createRegisteredShip } from "../ships/shipLifecycle";
import { commitHospitalSupport, validateHospitalSupport } from "./hospitalSupport";

function ship(classId: ShipState["classId"], sideId = "red"): ShipState {
  return createRegisteredShip(sideId, classId, "NORTH");
}

function battle(): NavalBattleState {
  return {
    version: 1,
    id: "battle",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [],
    participantShipIds: ["hospital", "target", "other"],
    snapshots: {},
    initiative: [
      { shipId: "hospital", initialRoll: 20, bonus: 2, total: 22, tieBreakRolls: [] },
      { shipId: "target", initialRoll: 15, bonus: 0, total: 15, tieBreakRolls: [] },
      { shipId: "other", initialRoll: 10, bonus: 0, total: 10, tieBreakRolls: [] }
    ],
    roundNumber: 1,
    currentShipId: "hospital",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { hospital: 2, target: 2, other: 2 },
    actionUsedByShip: { hospital: false, target: false, other: false },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 7,
    startedAt: 1,
    revision: 1
  };
}

const adjacent: GridCellCoord = { x: 6, y: 5 };
const hospitalCell: GridCellCoord = { x: 5, y: 5 };

function input(overrides: Partial<Parameters<typeof validateHospitalSupport>[0]> = {}) {
  return {
    battle: battle(),
    hospitalId: "hospital",
    targetId: "target",
    hospital: ship("HOSPITAL"),
    target: { ...ship("CRUISER"), hp: 10 },
    hospitalCell,
    targetCell: adjacent,
    ...overrides
  };
}

describe("hospital ship support validation", () => {
  it("allows the active hospital ship to support another orthogonally adjacent living ship", () => {
    expect(validateHospitalSupport(input())).toEqual({ ok: true });
  });

  it("rejects non-hospital, self-targeting and diagonal/non-adjacent targets", () => {
    expect(validateHospitalSupport(input({ hospital: ship("CRUISER") })))
      .toEqual({ ok: false, reason: "SHIP_NOT_HOSPITAL" });
    expect(validateHospitalSupport(input({ targetId: "hospital", target: ship("HOSPITAL"), targetCell: hospitalCell })))
      .toEqual({ ok: false, reason: "SELF_TARGET_FORBIDDEN" });
    expect(validateHospitalSupport(input({ targetCell: { x: 6, y: 6 } })))
      .toEqual({ ok: false, reason: "TARGET_NOT_ADJACENT" });
  });

  it("requires the hospital to be the current living ship with an unused action", () => {
    const wrongTurn = battle();
    wrongTurn.currentShipId = "target";
    expect(validateHospitalSupport(input({ battle: wrongTurn })))
      .toEqual({ ok: false, reason: "SHIP_NOT_ACTIVE" });

    const spent = battle();
    spent.actionUsedByShip.hospital = true;
    expect(validateHospitalSupport(input({ battle: spent })))
      .toEqual({ ok: false, reason: "ACTION_ALREADY_USED" });

    expect(validateHospitalSupport(input({ hospital: { ...ship("HOSPITAL"), hp: 0 } })))
      .toEqual({ ok: false, reason: "SHIP_DESTROYED" });
  });

  it("rejects destroyed or exited targets", () => {
    expect(validateHospitalSupport(input({ target: { ...ship("CRUISER"), hp: 0 } })))
      .toEqual({ ok: false, reason: "TARGET_DESTROYED" });

    const exited = battle();
    exited.exitedShipIds = ["target"];
    expect(validateHospitalSupport(input({ battle: exited })))
      .toEqual({ ok: false, reason: "TARGET_EXITED" });
  });
});

describe("hospital temporary hp", () => {
  it("adds 2d6 temporary HP without healing real HP and consumes the hospital action", () => {
    const rolls = [4, 5];
    const ships = {
      hospital: ship("HOSPITAL"),
      target: { ...ship("CRUISER"), hp: 10 },
      other: ship("BATTLESHIP", "blue")
    };
    const result = commitHospitalSupport({
      ...input({ hospital: ships.hospital, target: ships.target }),
      ships,
      rollD6: () => rolls.shift() ?? 1
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.grantedTemporaryHp).toBe(9);
    expect(result.target.hp).toBe(10);
    expect(result.target.temporaryHp).toBe(9);
    expect(result.battle.actionUsedByShip.hospital).toBe(true);
    expect(result.battle.completedShipIdsThisRound).toEqual(["hospital"]);
    expect(result.battle.currentShipId).toBe("target");
  });

  it("caps hp + temporaryHp at the target class maximum", () => {
    const target = { ...ship("CRUISER"), hp: 19, temporaryHp: 0 };
    const result = commitHospitalSupport({
      ...input({ target }),
      ships: { hospital: ship("HOSPITAL"), target, other: ship("BATTLESHIP", "blue") },
      rollD6: () => 6
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rolledTemporaryHp).toBe(12);
    expect(result.grantedTemporaryHp).toBe(1);
    expect(result.target.hp + result.target.temporaryHp).toBe(20);
  });

  it("allows stacking temporary HP only up to the remaining class cap", () => {
    const target = { ...ship("BATTLESHIP"), hp: 20, temporaryHp: 7 };
    const result = commitHospitalSupport({
      ...input({ target }),
      ships: { hospital: ship("HOSPITAL"), target, other: ship("CRUISER", "blue") },
      rollD6: () => 4
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rolledTemporaryHp).toBe(8);
    expect(result.grantedTemporaryHp).toBe(3);
    expect(result.target.temporaryHp).toBe(10);
    expect(result.target.hp + result.target.temporaryHp).toBe(30);
  });
});
