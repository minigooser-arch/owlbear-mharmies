import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../../shared/constants";
import type { NavalSceneState } from "../../shared/types";
import { createRegisteredShip, destroyShip } from "./shipLifecycle";

function scene(): NavalSceneState {
  const ship = createRegisteredShip("red", "CRUISER", "EAST");
  return {
    version: 6, revision: 1, settings: DEFAULT_SETTINGS,
    sides: [], states: [], relations: {}, battleGroups: [], terrain: DEFAULT_TERRAIN,
    gridMap: { version: 1, revision: 0, cells: {} }, wars: [], turn: DEFAULT_TURN_STATE,
    ships: { cruiser: { ...ship, status: "IN_NAVAL_BATTLE", battleId: "battle" } }, navalBattleRequests: [],
    activeNavalBattle: {
      version: 1, id: "battle", requestId: null, initiatorSideId: "red", areaCells: [], participantShipIds: ["cruiser"],
      snapshots: { cruiser: { shipId: "cruiser", strategicCell: { x: 0, y: 0 }, strategicPosition: { x: 50, y: 50 }, strategicFacing: "EAST" } },
      initiative: [{ shipId: "cruiser", initialRoll: 12, bonus: 2, total: 14, tieBreakRolls: [] }], roundNumber: 1,
      currentShipId: "cruiser", completedShipIdsThisRound: [], movementRemainingByShip: { cruiser: 3 }, actionUsedByShip: { cruiser: false },
      exitedShipIds: [], status: "ACTIVE", events: [], startedOnTurn: 1, startedAt: 1, revision: 1
    },
    navalBattleHistory: [], navalRevealUntilTurn: {}
  };
}

describe("ship lifecycle", () => {
  it("creates a ship from canonical class values", () => {
    expect(createRegisteredShip("red", "BATTLESHIP", "NORTH")).toMatchObject({
      version: 1, sideId: "red", classId: "BATTLESHIP", hp: 30, temporaryHp: 0, facing: "NORTH", globalMovementRemaining: 2
    });
  });
  it("destroys without leaving a wreck and removes active battle references", () => {
    const result = destroyShip(scene(), "cruiser");
    expect(result.destroyed).toBe(true);
    expect(result.itemIdToDelete).toBe("cruiser");
    expect(result.scene.ships.cruiser).toBeUndefined();
    expect(result.scene.activeNavalBattle?.participantShipIds).toEqual([]);
    expect(result.scene.activeNavalBattle?.initiative).toEqual([]);
    expect(result.scene.activeNavalBattle?.currentShipId).toBeNull();
    expect(result.scene.activeNavalBattle?.roundNumber).toBe(1);
  });
});
