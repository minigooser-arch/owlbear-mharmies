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
      phase: "NAVAL_BATTLE",
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
