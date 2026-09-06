import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../../shared/constants";
import type { NavalSceneState } from "../../shared/types";
import { createRegisteredShip } from "../ships/shipLifecycle";
import { completeNavalBattle, startNavalBattle } from "./navalBattleLifecycle";

function scene(): NavalSceneState {
  return {
    version: 6,
    revision: 1,
    settings: DEFAULT_SETTINGS,
    sides: [
      { id: "red", name: "Красные", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: null },
      { id: "blue", name: "Синие", color: "#00f", playerIds: [], leaderPlayerIds: [], stateId: null }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: DEFAULT_TERRAIN,
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...DEFAULT_TURN_STATE, turnNumber: 2, phase: "POST_MOVEMENT" },
    ships: {
      red: createRegisteredShip("red", "CRUISER", "NORTH"),
      blue: createRegisteredShip("blue", "BATTLESHIP", "SOUTH")
    },
    navalBattleRequests: [],
    transportEmbarkRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

describe("naval battle global phase", () => {
  it("keeps POST_MOVEMENT while a naval battle is active and after it completes", () => {
    const started = startNavalBattle(scene(), {
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
          strategicFacing: "NORTH"
        },
        blue: {
          shipId: "blue",
          strategicCell: { x: 1, y: 0 },
          strategicPosition: { x: 150, y: 50 },
          strategicFacing: "SOUTH"
        }
      },
      startedAt: 1,
      rollD20: (() => {
        const rolls = [12, 8];
        return () => rolls.shift() ?? 1;
      })()
    });

    expect(started.turn.phase).toBe("POST_MOVEMENT");
    expect(started.activeNavalBattle?.status).toBe("ACTIVE");

    const completed = completeNavalBattle(started);
    expect(completed.turn.phase).toBe("POST_MOVEMENT");
    expect(completed.activeNavalBattle).toBeNull();
  });
});
