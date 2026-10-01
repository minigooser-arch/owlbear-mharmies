import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "../ships/shipLifecycle";
import type { ArmyState } from "../../shared/types";
import {
  embarkArmy,
  disembarkArmy,
  isReciprocallyEmbarked,
  validateTransportInteraction
} from "./transportRules";

function army(overrides: Partial<ArmyState> = {}): ArmyState {
  return {
    version: 4,
    registered: true,
    sideId: "red",
    status: "READY",
    overrides: {},
    route: [],
    plannedRoute: {
      startCell: { x: 0, y: 0 },
      executeOnTurn: 1,
      cells: [],
      totalCostUnits: 0,
      validatedRevision: 1,
      requiresReplan: false
    },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    health: { hp: 50, maxHp: 50 },
    supply: { supplied: true, checkedOnTurn: 1 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    embarkedOnShipId: null,
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1,
    ...overrides
  };
}

function transport() {
  return createRegisteredShip("red", "TRANSPORT", "EAST");
}

describe("transport interaction validation", () => {
  it("allows orthogonally adjacent embarkation during MOVEMENT", () => {
    expect(validateTransportInteraction({
      action: "EMBARK",
      phase: "MOVEMENT",
      ship: transport(),
      army: army(),
      shipCell: { x: 3, y: 4 },
      interactionCell: { x: 4, y: 4 },
      sameCellSupportsLandAndSea: false
    })).toEqual({ ok: true });
  });

  it("allows the same cell only when it is mixed LAND+SEA", () => {
    const base = {
      action: "EMBARK" as const,
      phase: "MOVEMENT" as const,
      ship: transport(),
      army: army(),
      shipCell: { x: 3, y: 4 },
      interactionCell: { x: 3, y: 4 }
    };

    expect(validateTransportInteraction({ ...base, sameCellSupportsLandAndSea: true })).toEqual({ ok: true });
    expect(validateTransportInteraction({ ...base, sameCellSupportsLandAndSea: false })).toEqual({
      ok: false,
      reason: "NOT_ADJACENT"
    });
  });

  it("rejects diagonal geometry, non-transport ships, naval battle phase, and occupied links", () => {
    expect(validateTransportInteraction({
      action: "EMBARK",
      phase: "MOVEMENT",
      ship: transport(),
      army: army(),
      shipCell: { x: 0, y: 0 },
      interactionCell: { x: 1, y: 1 },
      sameCellSupportsLandAndSea: false
    })).toEqual({ ok: false, reason: "NOT_ADJACENT" });

    expect(validateTransportInteraction({
      action: "EMBARK",
      phase: "MOVEMENT",
      ship: createRegisteredShip("red", "CRUISER", "EAST"),
      army: army(),
      shipCell: { x: 0, y: 0 },
      interactionCell: { x: 1, y: 0 },
      sameCellSupportsLandAndSea: false
    })).toEqual({ ok: false, reason: "SHIP_NOT_TRANSPORT" });

    expect(validateTransportInteraction({
      action: "EMBARK",
      phase: "POST_MOVEMENT",
      ship: transport(),
      army: army(),
      shipCell: { x: 0, y: 0 },
      interactionCell: { x: 1, y: 0 },
      sameCellSupportsLandAndSea: false
    })).toEqual({ ok: false, reason: "NOT_MOVEMENT_PHASE" });

    expect(validateTransportInteraction({
      action: "EMBARK",
      phase: "MOVEMENT",
      ship: { ...transport(), embarkedArmyId: "other" },
      army: army(),
      shipCell: { x: 0, y: 0 },
      interactionCell: { x: 1, y: 0 },
      sameCellSupportsLandAndSea: false
    })).toEqual({ ok: false, reason: "TRANSPORT_OCCUPIED" });

    expect(validateTransportInteraction({
      action: "EMBARK",
      phase: "MOVEMENT",
      ship: transport(),
      army: army({ embarkedOnShipId: "other-transport" }),
      shipCell: { x: 0, y: 0 },
      interactionCell: { x: 1, y: 0 },
      sameCellSupportsLandAndSea: false
    })).toEqual({ ok: false, reason: "ARMY_ALREADY_EMBARKED" });
  });
});

describe("transport reciprocal state", () => {
  it("embarks reciprocally and consumes the transport global movement", () => {
    const result = embarkArmy("transport", transport(), "army", army());

    expect(result.ship.embarkedArmyId).toBe("army");
    expect(result.ship.globalMovementRemaining).toBe(0);
    expect(result.ship.movementSpentThisTurn).toBe(true);
    expect(result.army.embarkedOnShipId).toBe("transport");
    expect(isReciprocallyEmbarked("transport", result.ship, "army", result.army)).toBe(true);
  });

  it("keeps ship and army movement untouched with transport III-B", () => {
    const freeTransport = {
      ...transport(),
      upgrades: { level1: "A" as const, level2: "A" as const, level3: "B" as const },
      globalMovementRemaining: 0,
      movementSpentThisTurn: true
    };
    const carriedArmy = army({ movement: { maxUnits: 10, remainingUnits: 4, enteredRouteCellCount: 0 } });

    const embarked = embarkArmy("transport", freeTransport, "army", carriedArmy, 0);
    expect(embarked.ship.globalMovementRemaining).toBe(0);
    expect(embarked.ship.movementSpentThisTurn).toBe(true);
    expect(embarked.army.movement.remainingUnits).toBe(4);

    const disembarked = disembarkArmy("transport", embarked.ship, "army", embarked.army, 0);
    expect(disembarked.ok).toBe(true);
    if (!disembarked.ok) return;
    expect(disembarked.ship.globalMovementRemaining).toBe(0);
    expect(disembarked.army.movement.remainingUnits).toBe(4);
  });

  it("allows transport III-A to carry two armies", () => {
    const upgraded = {
      ...transport(),
      upgrades: { level1: "A" as const, level2: "A" as const, level3: "A" as const }
    };
    const first = embarkArmy("transport", upgraded, "army-1", army());
    const second = embarkArmy("transport", first.ship, "army-2", army());

    expect(second.ship.embarkedArmyId).toBe("army-1");
    expect(second.ship.additionalEmbarkedArmyId).toBe("army-2");
    expect(validateTransportInteraction({
      action: "EMBARK",
      phase: "MOVEMENT",
      ship: second.ship,
      army: army(),
      shipCell: { x: 0, y: 0 },
      interactionCell: { x: 1, y: 0 },
      sameCellSupportsLandAndSea: false
    })).toEqual({ ok: false, reason: "TRANSPORT_OCCUPIED" });
  });

  it("disembarks only a reciprocal pair and also consumes transport movement", () => {
    const embarked = embarkArmy("transport", transport(), "army", army());
    const result = disembarkArmy("transport", embarked.ship, "army", embarked.army);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ship.embarkedArmyId).toBeNull();
    expect(result.ship.globalMovementRemaining).toBe(0);
    expect(result.ship.movementSpentThisTurn).toBe(true);
    expect(result.army.embarkedOnShipId).toBeNull();

    expect(disembarkArmy("transport", transport(), "army", army())).toEqual({
      ok: false,
      reason: "NOT_RECIPROCALLY_EMBARKED"
    });
  });
});
