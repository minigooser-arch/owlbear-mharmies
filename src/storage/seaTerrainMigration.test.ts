import { expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { migrateSceneState } from "./migrations";

it("restores built-in sea terrain when an existing v6 scene does not contain it", () => {
  const terrain = structuredClone(DEFAULT_TERRAIN);
  delete terrain.types.sea;

  const result = migrateSceneState({
    version: 6,
    revision: 7,
    settings: DEFAULT_SETTINGS,
    sides: [],
    states: [],
    relations: {},
    battleGroups: [],
    terrain,
    gridMap: { version: 1, cells: {}, revision: 0 },
    wars: [],
    turn: DEFAULT_TURN_STATE,
    ships: {},
    navalBattleRequests: [],
    transportEmbarkRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  });

  expect(result).toMatchObject({
    ok: true,
    value: {
      version: 6,
      revision: 7,
      terrain: {
        types: {
          sea: {
            id: "sea",
            name: "Океан / озёра",
            movementDomains: ["SEA"],
            blocksNavalLos: false,
            enabled: true
          }
        }
      }
    }
  });
});
