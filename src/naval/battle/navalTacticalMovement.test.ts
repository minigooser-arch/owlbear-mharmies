import { describe, expect, it } from "vitest";
import type { GridCellCoord, NavalBattleState, ShipFacing, ShipState } from "../../shared/types";
import { createRegisteredShip } from "../ships/shipLifecycle";
import {
  applyForwardTacticalStep,
  applyTacticalTurn,
  forwardCell
} from "./navalTacticalMovement";

function ship(facing: ShipFacing = "NORTH"): ShipState {
  return createRegisteredShip("red", "CRUISER", facing);
}

function battle(areaCells: GridCellCoord[], movement = 3): NavalBattleState {
  return {
    version: 1,
    id: "battle",
    requestId: null,
    initiatorSideId: "red",
    areaCells,
    participantShipIds: ["ship"],
    snapshots: {},
    initiative: [{ shipId: "ship", initialRoll: 10, bonus: 2, total: 12, tieBreakRolls: [] }],
    roundNumber: 1,
    currentShipId: "ship",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { ship: movement },
    actionUsedByShip: { ship: false },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 4,
    startedAt: 1,
    revision: 1
  };
}

describe("naval tactical movement", () => {
  it("maps every facing to exactly one forward adjacent cell", () => {
    expect(forwardCell({ x: 5, y: 5 }, "NORTH")).toEqual({ x: 5, y: 4 });
    expect(forwardCell({ x: 5, y: 5 }, "EAST")).toEqual({ x: 6, y: 5 });
    expect(forwardCell({ x: 5, y: 5 }, "SOUTH")).toEqual({ x: 5, y: 6 });
    expect(forwardCell({ x: 5, y: 5 }, "WEST")).toEqual({ x: 4, y: 5 });
  });

  it("moves one cell forward for one naval movement point", () => {
    const result = applyForwardTacticalStep(
      battle([{ x: 5, y: 4 }]),
      "ship",
      ship("NORTH"),
      { x: 5, y: 5 },
      { x: 5, y: 4 }
    );
    expect(result.destination).toEqual({ x: 5, y: 4 });
    expect(result.battle.movementRemainingByShip.ship).toBe(2);
  });

  it("rejects sideways and backward movement", () => {
    const input = battle([{ x: 6, y: 5 }, { x: 5, y: 6 }]);
    expect(() => applyForwardTacticalStep(input, "ship", ship("NORTH"), { x: 5, y: 5 }, { x: 6, y: 5 }))
      .toThrow("Ship may move only forward");
    expect(() => applyForwardTacticalStep(input, "ship", ship("NORTH"), { x: 5, y: 5 }, { x: 5, y: 6 }))
      .toThrow("Ship may move only forward");
  });

  it("rejects a forward destination outside the existing battle area", () => {
    expect(() => applyForwardTacticalStep(
      battle([{ x: 10, y: 10 }]),
      "ship",
      ship("NORTH"),
      { x: 5, y: 5 },
      { x: 5, y: 4 }
    )).toThrow("Outside naval battle area");
  });

  it("turns left or right by exactly 90 degrees for one movement point", () => {
    const input = battle([{ x: 5, y: 5 }]);
    const left = applyTacticalTurn(input, "ship", ship("NORTH"), "LEFT");
    expect(left.ship.facing).toBe("WEST");
    expect(left.battle.movementRemainingByShip.ship).toBe(2);

    const right = applyTacticalTurn(input, "ship", ship("NORTH"), "RIGHT");
    expect(right.ship.facing).toBe("EAST");
    expect(right.battle.movementRemainingByShip.ship).toBe(2);
  });

  it("requires two paid 90-degree turns for a 180-degree reversal", () => {
    const first = applyTacticalTurn(battle([{ x: 5, y: 5 }]), "ship", ship("NORTH"), "RIGHT");
    const second = applyTacticalTurn(first.battle, "ship", first.ship, "RIGHT");
    expect(second.ship.facing).toBe("SOUTH");
    expect(second.battle.movementRemainingByShip.ship).toBe(1);
  });
});
