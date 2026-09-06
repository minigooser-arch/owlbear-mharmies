import { expect, it } from "vitest";
import { createRegisteredShip } from "../ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../../shared/constants";
import type { NavalSceneState } from "../../shared/types";
import { startNavalBattle } from "./navalBattleLifecycle";

it("rejects a participant whose strategic cell is outside the selected naval battle area", () => {
  const scene: NavalSceneState = {
    version: 6,
    revision: 1,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      { id: "red", name: "Красные", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: null },
      { id: "blue", name: "Синие", color: "#00f", playerIds: [], leaderPlayerIds: [], stateId: null }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), phase: "POST_MOVEMENT" },
    ships: {
      red: createRegisteredShip("red", "CRUISER", "EAST"),
      blue: createRegisteredShip("blue", "BATTLESHIP", "WEST")
    },
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };

  expect(() => startNavalBattle(scene, {
    battleId: "battle",
    requestId: null,
    initiatingShipId: "red",
    participantShipIds: ["red", "blue"],
    areaCells: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    snapshots: {
      red: {
        shipId: "red",
        strategicCell: { x: 0, y: 0 },
        strategicPosition: { x: 50, y: 50 },
        strategicFacing: "EAST"
      },
      blue: {
        shipId: "blue",
        strategicCell: { x: 12, y: 0 },
        strategicPosition: { x: 1250, y: 50 },
        strategicFacing: "WEST"
      }
    },
    startedAt: 1,
    rollD20: () => 10
  })).toThrow("Naval battle participant outside area: blue");
});
