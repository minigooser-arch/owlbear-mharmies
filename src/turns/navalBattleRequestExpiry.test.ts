import { expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { NavalSceneState } from "../shared/types";
import { completeTurn } from "./turnService";

function scene(): NavalSceneState {
  return {
    version: 6,
    revision: 4,
    settings: { ...DEFAULT_SETTINGS },
    sides: [],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 7, phase: "MOVEMENT" },
    ships: {},
    navalBattleRequests: [
      {
        id: "req-old",
        initiatingShipId: "red-ship",
        targetShipId: "blue-ship",
        createdOnTurn: 7
      }
    ],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

it("advances the global turn and expires unplayed naval battle requests", () => {
  const result = completeTurn(scene(), {}, {
    source: "MANUAL",
    completedAt: new Date("2026-09-04T12:00:00.000Z"),
    armyCells: {}
  });

  expect(result.changed).toBe(true);
  if (!result.changed) return;
  expect(result.scene.turn.turnNumber).toBe(8);
  expect(result.scene.navalBattleRequests).toEqual([]);
});
