import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { migrateSceneState } from "./migrations";

function v6Scene() {
  return {
    version: 6,
    revision: 9,
    settings: DEFAULT_SETTINGS,
    sides: [
      {
        id: "red",
        name: "Красные",
        color: "#d32f2f",
        playerIds: [],
        leaderPlayerIds: [],
        stateId: "russia"
      },
      {
        id: "blue",
        name: "Синие",
        color: "#1976d2",
        playerIds: [],
        leaderPlayerIds: [],
        stateId: "germany"
      }
    ],
    states: [
      { id: "russia", name: "Россия", rulingFactionId: "red", active: true },
      { id: "germany", name: "Германия", rulingFactionId: "blue", active: true },
      { id: "broken", name: "Без правителя", rulingFactionId: null, active: true }
    ],
    relations: {},
    battleGroups: [],
    terrain: DEFAULT_TERRAIN,
    gridMap: {
      version: 1,
      revision: 3,
      cells: {
        "1,2": {
          terrainId: "mountains",
          impassable: false,
          factionTerritoryIds: ["red"],
          recognizedStateId: "russia",
          deFactoStateId: "germany"
        }
      }
    },
    wars: [
      {
        id: "war-rg",
        name: "Русско-германская война",
        participantFactionIds: [],
        participantStateIds: ["russia", "germany"],
        active: true
      },
      {
        id: "legacy-coalition",
        name: "Старая коалиционная война",
        participantFactionIds: [],
        participantStateIds: ["russia", "germany", "broken"],
        active: true
      }
    ],
    turn: { ...DEFAULT_TURN_STATE, phase: "MOVEMENT" },
    ships: {},
    navalBattleRequests: [],
    transportEmbarkRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

describe("strategic war scene schema", () => {
  it("migrates v6 into the strategic-war schema without losing political map data", () => {
    const result = migrateSceneState(v6Scene());

    expect(result).toMatchObject({
      ok: true,
      value: {
        version: 7,
        revision: 9,
        states: [
          { id: "russia", color: "#607d8b", rulingFactionId: "red", active: true },
          { id: "germany", color: "#607d8b", rulingFactionId: "blue", active: true },
          { id: "broken", color: "#607d8b", rulingFactionId: null, active: false }
        ],
        gridMap: {
          cells: {
            "1,2": {
              terrainId: "mountains",
              factionTerritoryIds: ["red"],
              recognizedStateId: "russia",
              deFactoStateId: "germany"
            }
          }
        },
        stateRelations: {
          russia: { germany: { militaryAccess: false, atWar: true } },
          germany: { russia: { militaryAccess: false, atWar: true } }
        },
                forcedExitStates: [],
        strategicCities: [],
        territorialScores: [],
        rebellions: [],
        turnCheckpoint: null
      }
    });
  });

  it("does not infer all-vs-all hostility from a legacy multi-state war", () => {
    const result = migrateSceneState(v6Scene());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const migrated = result.value as unknown as {
      stateRelations?: Record<string, Record<string, { atWar?: boolean }>>;
    };
    expect(migrated.stateRelations?.russia?.broken?.atWar).not.toBe(true);
    expect(migrated.stateRelations?.germany?.broken?.atWar).not.toBe(true);
  });

  it("rejects schema versions newer than v7", () => {
    expect(migrateSceneState({ version: 8 })).toEqual({
      ok: false,
      issue: { code: "FUTURE_VERSION", version: 8 }
    });
  });

  it("clears dangling political cell references while preserving terrain", () => {
    const current = { ...v6Scene(), version: 7 };
    current.gridMap.cells["1,2"] = {
      ...current.gridMap.cells["1,2"],
      recognizedStateId: "missing",
      deFactoStateId: "also-missing"
    };
    const result = migrateSceneState(current);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.gridMap.cells["1,2"]).toMatchObject({
      terrainId: "mountains",
      recognizedStateId: null,
      deFactoStateId: null
    });
  });
});
