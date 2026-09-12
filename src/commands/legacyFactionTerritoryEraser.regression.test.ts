import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type ArmyCommand, type SceneState } from "../shared/types";
import { CommandProcessor, type CommandState } from "./commandProcessor";

describe("legacy faction territory preservation", () => {
  it("keeps legacy factionTerritoryIds when the current ALL eraser clears a cell", () => {
    const scene: SceneState = {
      version: 7,
      revision: 1,
      settings: structuredClone(DEFAULT_SETTINGS),
      sides: [],
      states: [],
      relations: {},
      battleGroups: [],
      terrain: structuredClone(DEFAULT_TERRAIN),
      gridMap: {
        version: 1,
        revision: 1,
        cells: {
          "0,0": {
            terrainId: "forest",
            impassable: true,
            factionTerritoryIds: ["legacy-red"],
            recognizedStateId: "russia",
            deFactoStateId: "germany"
          }
        }
      },
      wars: [],
      turn: structuredClone(DEFAULT_TURN_STATE),
      ships: {},
      navalBattleRequests: [],
      transportEmbarkRequests: [],
      activeNavalBattle: null,
      navalBattleHistory: [],
      navalRevealUntilTurn: {},
      stateRelations: {},
      foreignPresenceViolations: [],
      forcedExitStates: [],
      strategicCities: [],
      territorialScores: [],
      rebellions: [],
      turnCheckpoint: null
    };
    const state: CommandState = { scene, armies: {}, barriers: {}, items: {} };
    const command: ArmyCommand = {
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: "clear-current-layers",
      senderPlayerId: "gm",
      senderConnectionId: "gm-connection",
      expectedRevision: 1,
      type: "CLEAR_CELL_PROPERTIES",
      cells: [{ x: 0, y: 0 }],
      target: "ALL"
    };

    const result = new CommandProcessor().execute({
      role: "GM",
      playerId: "gm",
      connectionId: "gm-connection",
      connectedPlayerIds: new Set(["gm"]),
      state
    }, command);

    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.gridMap.cells["0,0"]).toEqual({
      terrainId: null,
      impassable: false,
      factionTerritoryIds: ["legacy-red"],
      recognizedStateId: null,
      deFactoStateId: null
    });
  });
});
