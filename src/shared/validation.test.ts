import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "./constants";
import { normalizeArmyState, normalizeSceneState } from "./validation";

function scene(overrides: Record<string, unknown> = {}) {
  return {
    version: 6,
    revision: 0,
    settings: DEFAULT_SETTINGS,
    sides: [],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: DEFAULT_TERRAIN,
    gridMap: { version: 1, cells: {}, revision: 0 },
    wars: [],
    turn: DEFAULT_TURN_STATE,
    ships: {},
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {},
    ...overrides
  };
}

describe("metadata validation", () => {
  it("applies safe defaults and rejects invalid numeric overrides", () => {
    const army = normalizeArmyState({
      version: 4,
      registered: true,
      sideId: "a",
      status: "READY",
      overrides: { speedCellsPerSecond: -2, maxRouteDistanceCells: 9 },
      route: [],
      plannedRoute: {
        startCell: { x: 0, y: 0 }, executeOnTurn: 0, cells: [], totalCostUnits: 0,
        validatedRevision: 0, requiresReplan: false
      },
      movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
      health: { hp: 50, maxHp: 50 },
      supply: { supplied: true, checkedOnTurn: 0 },
      disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
      embarkedOnShipId: null,
      currentWaypointIndex: 0,
      segmentProgressCells: 0,
      ignoresMovementBarriers: false,
      ignoresVisionBarriers: false,
      revision: 1
    });
    expect(army.ok).toBe(true);
    if (army.ok) {
      expect(army.value.overrides.speedCellsPerSecond).toBeUndefined();
      expect(army.value.overrides.maxRouteDistanceCells).toBe(9);
    }
  });

  it("uses the five-cell scene route limit", () => {
    const result = normalizeSceneState(scene());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("normalizes leaders as unique members without crossing side boundaries", () => {
    const result = normalizeSceneState(scene({
      sides: [
        {
          id: "red",
          name: "Красные",
          color: "#f00",
          playerIds: ["member"],
          leaderPlayerIds: ["leader", "leader"],
          stateId: null
        },
        {
          id: "blue",
          name: "Синие",
          color: "#00f",
          playerIds: [],
          leaderPlayerIds: ["leader"],
          stateId: null
        }
      ]
    }));

    expect(result).toMatchObject({
      ok: true,
      value: {
        version: 6,
        sides: [
          { id: "red", playerIds: ["member", "leader"], leaderPlayerIds: ["leader"] },
          { id: "blue", playerIds: ["leader"], leaderPlayerIds: ["leader"] }
        ]
      }
    });
  });

  it("requires non-empty battle names and preserves them", () => {
    const result = normalizeSceneState(scene({
      battleGroups: [
        { battleId: "north", name: "Север", participantIds: ["a", "b"], revision: 2 },
        { battleId: "blank", name: "   ", participantIds: ["c", "d"], revision: 1 }
      ]
    }));

    expect(result).toMatchObject({
      ok: true,
      value: {
        version: 6,
        battleGroups: [
          { battleId: "north", name: "Север", participantIds: ["a", "b"], revision: 2 }
        ]
      }
    });
  });

  it("drops legacy battle player assignment metadata", () => {
    const result = normalizeSceneState(scene({
      battleGroups: [{
        battleId: "battle-lock",
        name: "Бой",
        participantIds: ["a", "b"],
        playerAssignments: [{ playerId: "p2", armyId: "a" }],
        lockedPlayerIds: ["p1"],
        revision: 1
      }]
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.battleGroups[0]).toEqual({
      battleId: "battle-lock", name: "Бой", participantIds: ["a", "b"], revision: 1
    });
  });
});
