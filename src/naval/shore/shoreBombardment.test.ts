import { describe, expect, it, vi } from "vitest";
import type { ArmyState, GridCellCoord, NavalBattleState, ShipState } from "../../shared/types";
import { createRegisteredShip } from "../ships/shipLifecycle";
import {
  commitShoreBombardment,
  validateShoreBombardmentTarget,
  type ShoreBombardmentSectorResolver
} from "./shoreBombardment";

function army(sideId = "blue", hp = 20): ArmyState {
  return {
    version: 4,
    registered: true,
    sideId,
    status: "READY",
    overrides: {},
    route: [],
    plannedRoute: {
      startCell: { x: 0, y: 0 }, executeOnTurn: 1, cells: [], totalCostUnits: 0,
      validatedRevision: 1, requiresReplan: false
    },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    health: { hp, maxHp: 50 },
    supply: { supplied: true, checkedOnTurn: 1 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    embarkedOnShipId: null,
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1
  };
}

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
    participantShipIds: ["attacker", "other"],
    snapshots: {},
    initiative: [
      { shipId: "attacker", initialRoll: 20, bonus: 2, total: 22, tieBreakRolls: [] },
      { shipId: "other", initialRoll: 10, bonus: 0, total: 10, tieBreakRolls: [] }
    ],
    roundNumber: 1,
    currentShipId: "attacker",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { attacker: 2, other: 2 },
    actionUsedByShip: { attacker: false, other: false },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 7,
    startedAt: 1,
    revision: 1
  };
}

const attackerCell = { x: 5, y: 5 };
const targetCell = { x: 7, y: 5 };

function exactSector(allowed: GridCellCoord[]): ShoreBombardmentSectorResolver {
  return ({ targetCell: candidate }) => allowed.some((cell) => cell.x === candidate.x && cell.y === candidate.y);
}

function baseInput(classId: ShipState["classId"] = "BATTLESHIP") {
  return {
    attackerId: "attacker",
    attacker: ship(classId),
    targetId: "army",
    target: army(),
    attackerCell,
    targetCell,
    currentTurn: 7,
    targetVisible: true,
    targetCellSupportsLand: true,
    sectorResolver: exactSector([targetCell]),
    distanceCells: () => 2,
    hasLineOfSight: () => true
  };
}

describe("shore bombardment target validation", () => {
  it("allows a visible enemy land army for a battleship inside normal sector/range/LOS", () => {
    expect(validateShoreBombardmentTarget(baseInput())).toEqual({ ok: true, range: 2, dice: 3 });
  });

  it("uses 2d6 for cruisers and rejects other ship classes", () => {
    expect(validateShoreBombardmentTarget(baseInput("CRUISER"))).toEqual({ ok: true, range: 2, dice: 2 });
    expect(validateShoreBombardmentTarget(baseInput("IRONCLAD"))).toEqual({ ok: false, reason: "SHIP_CANNOT_BOMBARD" });
    expect(validateShoreBombardmentTarget(baseInput("TRANSPORT"))).toEqual({ ok: false, reason: "SHIP_CANNOT_BOMBARD" });
  });

  it("rejects destroyed/friendly/invisible/non-land targets before geometry", () => {
    const sectorResolver = vi.fn(() => true);
    const distanceCells = vi.fn(() => 2);
    const hasLineOfSight = vi.fn(() => true);

    expect(validateShoreBombardmentTarget({ ...baseInput(), attacker: { ...ship("BATTLESHIP"), hp: 0 }, sectorResolver, distanceCells, hasLineOfSight }))
      .toEqual({ ok: false, reason: "SHIP_DESTROYED" });
    expect(validateShoreBombardmentTarget({ ...baseInput(), target: army("red") }))
      .toEqual({ ok: false, reason: "FRIENDLY_TARGET" });
    expect(validateShoreBombardmentTarget({ ...baseInput(), targetVisible: false }))
      .toEqual({ ok: false, reason: "TARGET_NOT_VISIBLE" });
    expect(validateShoreBombardmentTarget({ ...baseInput(), targetCellSupportsLand: false }))
      .toEqual({ ok: false, reason: "TARGET_NOT_ON_LAND" });
  });

  it("rejects a second shore bombardment in the same global turn", () => {
    expect(validateShoreBombardmentTarget({
      ...baseInput(),
      attacker: { ...ship("BATTLESHIP"), shoreBombardmentUsedOnTurn: 7 }
    })).toEqual({ ok: false, reason: "BOMBARDMENT_ALREADY_USED" });
  });

  it("enforces the normal broadside sector, class range and naval LOS", () => {
    expect(validateShoreBombardmentTarget({ ...baseInput(), sectorResolver: exactSector([]) }))
      .toEqual({ ok: false, reason: "OUTSIDE_BROADSIDE_SECTOR" });
    expect(validateShoreBombardmentTarget({ ...baseInput(), distanceCells: () => 4 }))
      .toEqual({ ok: false, reason: "OUT_OF_RANGE", range: 4 });
    expect(validateShoreBombardmentTarget({ ...baseInput(), hasLineOfSight: () => false }))
      .toEqual({ ok: false, reason: "NO_NAVAL_LOS" });
  });
});

describe("shore bombardment commit", () => {
  it("rolls direct 3d6 damage, marks the global-turn use and ignores ship armor entirely", () => {
    const rolls = [6, 4, 2];
    const result = commitShoreBombardment({
      ...baseInput(),
      rollD6: () => rolls.shift() ?? 1
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.damage).toBe(12);
    expect(result.target.health.hp).toBe(8);
    expect(result.attacker.shoreBombardmentUsedOnTurn).toBe(7);
  });

  it("clamps army HP at zero", () => {
    const result = commitShoreBombardment({
      ...baseInput(),
      target: army("blue", 5),
      rollD6: () => 6
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.damage).toBe(18);
    expect(result.target.health.hp).toBe(0);
  });

  it("inside an active naval battle consumes the ship action and advances activation", () => {
    const ships = { attacker: ship("BATTLESHIP"), other: ship("CRUISER", "blue") };
    const result = commitShoreBombardment({
      ...baseInput(),
      attacker: ships.attacker,
      battle: battle(),
      battleShips: ships,
      rollD6: () => 1
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.battle?.actionUsedByShip.attacker).toBe(true);
    expect(result.battle?.completedShipIdsThisRound).toEqual(["attacker"]);
    expect(result.battle?.currentShipId).toBe("other");
  });
});
