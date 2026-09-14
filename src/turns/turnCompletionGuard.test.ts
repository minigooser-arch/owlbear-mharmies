import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { SceneState, TurnCheckpointState } from "../shared/types";
import { getTurnCompletionBlockers } from "./turnCompletionGuard";

function scene(): SceneState {
  return {
    version: 7,
    revision: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
    sides: [],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 3, phase: "POST_MOVEMENT" },
    ships: {},
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {},
    stateRelations: {},
    forcedExitStates: [],
    strategicCities: [],
    territorialScores: [],
    rebellions: [],
    turnCheckpoint: null
  };
}

function checkpoint(patch: Partial<TurnCheckpointState> = {}): TurnCheckpointState {
  return {
    turnNumber: 4,
    forcedExitDone: true,
    supplyDone: true,
    encirclementDone: true,
    territorialScoreDone: true,
    ...patch
  };
}

describe("getTurnCompletionBlockers", () => {
  it("returns no blockers for a settled post-movement scene", () => {
    expect(getTurnCompletionBlockers(scene())).toEqual([]);
  });

  it("reports an active land battle", () => {
    const current = scene();
    current.battleGroups = [{ battleId: "land", name: "Land", participantIds: ["a", "b"], revision: 1 }];
    expect(getTurnCompletionBlockers(current)).toEqual(["LAND_BATTLE_ACTIVE"]);
  });

  it("reports an active naval battle", () => {
    const current = scene();
    current.activeNavalBattle = {
      version: 1,
      id: "naval",
      requestId: null,
      initiatorSideId: "red",
      areaCells: [{ x: 0, y: 0 }],
      participantShipIds: [],
      snapshots: {},
      initiative: [],
      roundNumber: 1,
      currentShipId: null,
      completedShipIdsThisRound: [],
      movementRemainingByShip: {},
      actionUsedByShip: {},
      exitedShipIds: [],
      status: "ACTIVE",
      events: [],
      startedOnTurn: 3,
      startedAt: 1,
      revision: 1
    };
    expect(getTurnCompletionBlockers(current)).toEqual(["NAVAL_BATTLE_ACTIVE"]);
  });

  it("reports unresolved movement", () => {
    const current = scene();
    current.turn.phase = "MOVEMENT";
    expect(getTurnCompletionBlockers(current)).toEqual(["MOVEMENT_RESOLUTION_PENDING"]);
  });

  it.each([
    ["forcedExitDone", "FORCED_EXIT_PENDING"],
    ["supplyDone", "SUPPLY_CHECK_PENDING"],
    ["encirclementDone", "ENCIRCLEMENT_PENDING"],
    ["territorialScoreDone", "TERRITORIAL_SCORE_PENDING"]
  ] as const)("reports pending checkpoint stage %s", (field, blocker) => {
    const current = scene();
    current.turnCheckpoint = checkpoint({ [field]: false });
    expect(getTurnCompletionBlockers(current)).toEqual([blocker]);
  });

  it("ignores a stale checkpoint from a different next-turn number", () => {
    const current = scene();
    current.turnCheckpoint = { ...checkpoint({ supplyDone: false }), turnNumber: 99 };
    expect(getTurnCompletionBlockers(current)).toEqual([]);
  });

  it("returns all independent blockers in deterministic order", () => {
    const current = scene();
    current.battleGroups = [{ battleId: "land", name: "Land", participantIds: [], revision: 1 }];
    current.turn.phase = "MOVEMENT";
    current.turnCheckpoint = checkpoint({
      forcedExitDone: false,
      supplyDone: false,
      encirclementDone: false,
      territorialScoreDone: false
    });
    expect(getTurnCompletionBlockers(current)).toEqual([
      "LAND_BATTLE_ACTIVE",
      "MOVEMENT_RESOLUTION_PENDING",
      "FORCED_EXIT_PENDING",
      "SUPPLY_CHECK_PENDING",
      "ENCIRCLEMENT_PENDING",
      "TERRITORIAL_SCORE_PENDING"
    ]);
  });
});
