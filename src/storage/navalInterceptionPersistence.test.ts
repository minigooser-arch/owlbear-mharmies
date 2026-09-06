import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { normalizeSceneState } from "../shared/validation";

function rawBattle() {
  return {
    version: 1,
    id: "battle",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [],
    participantShipIds: ["cruiser", "enemy"],
    snapshots: {},
    initiative: [],
    roundNumber: 2,
    currentShipId: "enemy",
    completedShipIdsThisRound: ["cruiser"],
    movementRemainingByShip: { cruiser: 0, enemy: 3 },
    actionUsedByShip: { cruiser: true, enemy: false },
    interceptions: {
      cruiser: { cruiserShipId: "cruiser", activatedRoundNumber: 2 },
      broken: { cruiserShipId: "", activatedRoundNumber: -1 }
    },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 8,
    startedAt: 1,
    revision: 3
  };
}

describe("naval interception persistence", () => {
  it("preserves valid active interception zones and filters malformed entries", () => {
    const result = normalizeSceneState({
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
      turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 8, phase: "POST_MOVEMENT" },
      ships: {},
      navalBattleRequests: [],
      transportEmbarkRequests: [],
      activeNavalBattle: rawBattle(),
      navalBattleHistory: [],
      navalRevealUntilTurn: {}
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.activeNavalBattle?.interceptions).toEqual({
      cruiser: { cruiserShipId: "cruiser", activatedRoundNumber: 2 }
    });
  });
});
