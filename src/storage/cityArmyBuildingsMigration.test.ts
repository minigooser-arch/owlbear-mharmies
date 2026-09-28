import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../shared/constants";
import { migrateSceneState } from "./migrations";

describe("city army buildings migration", () => {
  it("upgrades v7 strategic data with empty buildings, ledger, and configurable rates", () => {
    const result = migrateSceneState({
      version: 7,
      revision: 4,
      settings: DEFAULT_SETTINGS,
      sides: [{ id: "red", name: "Красные", color: "#f00", playerIds: ["p1"], leaderPlayerIds: [], stateId: "state-1" }],
      states: [{ id: "state-1", name: "Красное государство", color: "#f00", rulingFactionId: "red", active: true }],
      relations: {},
      stateRelations: {},
      battleGroups: [],
      terrain: undefined,
      gridMap: { version: 1, cells: {}, revision: 0 },
      wars: [],
      turn: { turnNumber: 1, phase: "MOVEMENT", autoTurnsPaused: false, deferredUntil: null, lastCompletedAt: null, lastCompletedBy: null, lastProcessedBoundaryId: null },
      ships: {},
      navalBattleRequests: [],
      activeNavalBattle: null,
      navalBattleHistory: [],
      navalRevealUntilTurn: {},
      transportEmbarkRequests: [],
      forcedExitStates: [],
      strategicCities: [{ id: "city-1", name: "Москва", cells: [{ x: 0, y: 0 }], recognizedStateId: "state-1", deFactoStateId: "state-1", factionInfluenceId: "red", mayorId: null, isCapital: true, historicalBuildTypeCount: 0 }],
      territorialScores: [],
      rebellions: [],
      turnCheckpoint: null
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        version: 8,
        lrTransactions: [],
        strategicCities: [{ id: "city-1" }],
        settings: {
          armyFormationCostPerHp: 5000,
          armyHealingCostPerHp: 5000,
          hospitalHealingCostPerHp: 2500
        }
      }
    });
  });
});
