import { expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../../shared/constants";
import type { NavalSceneState } from "../../shared/types";
import { createRegisteredShip, destroyShip } from "./shipLifecycle";

it("advances to the next initiative ship when the active ship is unregistered", () => {
  const first = {
    ...createRegisteredShip("red", "BATTLESHIP", "NORTH"),
    status: "IN_NAVAL_BATTLE" as const,
    battleId: "battle"
  };
  const second = {
    ...createRegisteredShip("blue", "CRUISER", "EAST"),
    status: "IN_NAVAL_BATTLE" as const,
    battleId: "battle"
  };
  const scene: NavalSceneState = {
    version: 6,
    revision: 1,
    settings: DEFAULT_SETTINGS,
    sides: [],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: DEFAULT_TERRAIN,
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...DEFAULT_TURN_STATE, phase: "NAVAL_BATTLE" },
    ships: { first, second },
    navalBattleRequests: [],
    activeNavalBattle: {
      version: 1,
      id: "battle",
      requestId: null,
      initiatorSideId: "red",
      areaCells: [],
      participantShipIds: ["first", "second"],
      snapshots: {
        first: { shipId: "first", strategicCell: { x: 0, y: 0 }, strategicPosition: { x: 50, y: 50 }, strategicFacing: "NORTH" },
        second: { shipId: "second", strategicCell: { x: 1, y: 0 }, strategicPosition: { x: 150, y: 50 }, strategicFacing: "EAST" }
      },
      initiative: [
        { shipId: "first", initialRoll: 18, bonus: 2, total: 20, tieBreakRolls: [] },
        { shipId: "second", initialRoll: 14, bonus: 0, total: 14, tieBreakRolls: [] }
      ],
      roundNumber: 1,
      currentShipId: "first",
      completedShipIdsThisRound: [],
      movementRemainingByShip: { first: 2, second: 3 },
      actionUsedByShip: { first: false, second: false },
      exitedShipIds: [],
      status: "ACTIVE",
      events: [],
      startedOnTurn: 1,
      startedAt: 1,
      revision: 1
    },
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };

  const result = destroyShip(scene, "first");

  expect(result.destroyed).toBe(true);
  expect(result.scene.activeNavalBattle?.participantShipIds).toEqual(["second"]);
  expect(result.scene.activeNavalBattle?.initiative.map((entry) => entry.shipId)).toEqual(["second"]);
  expect(result.scene.activeNavalBattle?.currentShipId).toBe("second");
  expect(result.scene.activeNavalBattle?.roundNumber).toBe(1);
});
