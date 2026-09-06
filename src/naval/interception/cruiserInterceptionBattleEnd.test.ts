import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../../shared/constants";
import type { NavalSceneState } from "../../shared/types";
import { completeNavalBattle, startNavalBattle } from "../battle/navalBattleLifecycle";
import { createRegisteredShip } from "../ships/shipLifecycle";

function scene(): NavalSceneState {
  return {
    version: 6,
    revision: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
    sides: [],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 8, phase: "POST_MOVEMENT" },
    ships: {
      cruiser: createRegisteredShip("red", "CRUISER", "NORTH"),
      target: createRegisteredShip("blue", "BATTLESHIP", "SOUTH")
    },
    navalBattleRequests: [],
    transportEmbarkRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

describe("interception cleanup at naval battle end", () => {
  it("archives the completed battle with no active interception zones", () => {
    const active = startNavalBattle(scene(), {
      battleId: "battle",
      requestId: null,
      initiatingShipId: "cruiser",
      participantShipIds: ["cruiser", "target"],
      areaCells: [{ x: 5, y: 5 }, { x: 7, y: 5 }],
      snapshots: {
        cruiser: {
          shipId: "cruiser",
          strategicCell: { x: 5, y: 5 },
          strategicPosition: { x: 550, y: 550 },
          strategicFacing: "NORTH"
        },
        target: {
          shipId: "target",
          strategicCell: { x: 7, y: 5 },
          strategicPosition: { x: 750, y: 550 },
          strategicFacing: "SOUTH"
        }
      },
      startedAt: 1,
      rollD20: (() => {
        const values = [20, 10];
        return () => values.shift() ?? 1;
      })()
    });
    if (!active.activeNavalBattle) throw new Error("Missing active battle fixture");
    active.activeNavalBattle.interceptions = {
      cruiser: { cruiserShipId: "cruiser", activatedRoundNumber: 1 }
    };

    const completed = completeNavalBattle(active);
    expect(completed.activeNavalBattle).toBeNull();
    expect(completed.navalBattleHistory).toHaveLength(1);
    expect(completed.navalBattleHistory[0]?.interceptions).toEqual({});
  });
});
