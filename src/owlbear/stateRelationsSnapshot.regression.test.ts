import { expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { SceneState } from "../shared/types";
import { buildRoleSafeSnapshot } from "./extensionServices";

it("publishes interstate relations in the role-safe snapshot", () => {
  const scene: SceneState = {
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
    turn: structuredClone(DEFAULT_TURN_STATE),
    ships: {},
    navalBattleRequests: [],
    transportEmbarkRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {},
    stateRelations: {
      russia: { germany: { militaryAccess: true, atWar: false } },
      germany: { russia: { militaryAccess: false, atWar: false } }
    },
    foreignPresenceViolations: [],
    forcedExitStates: [],
    strategicCities: [],
    territorialScores: [],
    rebellions: [],
    turnCheckpoint: null
  };

  expect(buildRoleSafeSnapshot({
    role: "GM",
    playerId: "gm",
    scene,
    players: [],
    armies: [],
    ships: [],
    mapVisibleSourceIds: new Set()
  })).toMatchObject({ stateRelations: scene.stateRelations });
});
