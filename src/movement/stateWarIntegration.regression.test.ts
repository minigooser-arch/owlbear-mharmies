import { describe, expect, it } from "vitest";
import { buildRoleSafeSnapshot as buildCoreSnapshot } from "../owlbear/extensionServicesCore";
import { buildRoleSafeSnapshot as buildLegacySnapshot } from "../owlbear/extensionServices";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { ArmyState, SceneItemRecord, SceneState } from "../shared/types";

function armyState(sideId: string): ArmyState {
  return {
    version: 3,
    registered: true,
    sideId,
    status: "READY",
    overrides: {},
    route: [],
    plannedRoute: {
      startCell: { x: 0, y: 0 },
      executeOnTurn: 0,
      cells: [],
      totalCostUnits: 0,
      validatedRevision: 1,
      requiresReplan: false
    },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    health: { hp: 50, maxHp: 50 },
    supply: { supplied: true, checkedOnTurn: 1 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1
  };
}

function scene(): SceneState {
  return {
    version: 7,
    revision: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
    sides: [
      { id: "red", name: "Красные", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: "ru" },
      { id: "blue", name: "Синие", color: "#00f", playerIds: [], leaderPlayerIds: [], stateId: "de" }
    ],
    states: [
      { id: "ru", name: "Россия", color: "#f66", rulingFactionId: "red", active: true },
      { id: "de", name: "Германия", color: "#66f", rulingFactionId: "blue", active: true }
    ],
    relations: {},
    stateRelations: {
      ru: { de: { militaryAccess: false, atWar: true } },
      de: { ru: { militaryAccess: false, atWar: true } }
    },
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: structuredClone(DEFAULT_TURN_STATE),
    ships: {},
    navalBattleRequests: [],
    transportEmbarkRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {},
    forcedExitStates: [],
    strategicCities: [],
    territorialScores: [],
    rebellions: [],
    turnCheckpoint: null
  };
}

function armyRecord() {
  const item: SceneItemRecord = {
    id: "army",
    type: "IMAGE",
    name: "1-я армия",
    position: { x: 50, y: 50 },
    metadata: {}
  };
  return { item, state: armyState("red") };
}

describe("state-war integration regressions", () => {
  it("derives ArmyView.atWar from authoritative stateRelations instead of legacy WarState", () => {
    const input = {
      role: "GM" as const,
      playerId: "gm",
      scene: scene(),
      players: [],
      armies: [armyRecord()],
      ships: [],
      mapVisibleSourceIds: new Set<string>()
    };

    expect(buildCoreSnapshot(input).armies[0]?.atWar).toBe(true);
    expect(buildLegacySnapshot(input).armies[0]?.atWar).toBe(true);
  });
});
