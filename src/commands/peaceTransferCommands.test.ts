import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { ArmyCommand, SceneState } from "../shared/types";
import { CommandProcessor, type CommandContext, type CommandState } from "./commandProcessor";

function scene(): SceneState {
  return {
    version: 7,
    revision: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
    sides: [],
    states: [
      { id: "old", name: "Old", color: "#333", rulingFactionId: null, active: false },
      { id: "new", name: "New", color: "#5a5", rulingFactionId: null, active: false }
    ],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: {
      version: 1,
      revision: 1,
      cells: {
        "0,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "old", deFactoStateId: "old" },
        "1,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "old", deFactoStateId: "old" },
        "2,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "old", deFactoStateId: "old" }
      }
    },
    wars: [],
    turn: structuredClone(DEFAULT_TURN_STATE),
    stateRelations: {},
    forcedExitStates: [],
    strategicCities: [{
      id: "city",
      name: "City",
      cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
      recognizedStateId: "old",
      deFactoStateId: "old",
      factionInfluenceId: null,
      mayorId: null,
      isCapital: false,
      historicalBuildTypeCount: 0
    }],
    territorialScores: [],
    rebellions: [],
    turnCheckpoint: null
  };
}

function context(role: "GM" | "PLAYER"): CommandContext {
  return {
    role,
    playerId: role === "GM" ? "gm" : "player",
    connectionId: role === "GM" ? "gm-connection" : "player-connection",
    connectedPlayerIds: new Set(["gm", "player"]),
    state: {
      scene: scene(),
      armies: {},
      barriers: {},
      items: {}
    } as CommandState
  };
}

function command(payload: Partial<ArmyCommand> & Pick<ArmyCommand, "type">, sender = "gm"): ArmyCommand {
  return {
    requestId: "request",
    senderPlayerId: sender,
    senderConnectionId: sender + "-connection",
    expectedRevision: 1,
    ...payload
  } as ArmyCommand;
}

describe("peace transfer command", () => {
  it("rejects a partial strategic city", () => {
    const result = new CommandProcessor().execute(
      context("GM"),
      command({ type: "APPLY_PEACE_TRANSFER", recipientStateId: "new", cells: [{ x: 1, y: 0 }] })
    );
    expect(result).toEqual({ status: "REJECTED", reason: "PARTIAL_CITY_TRANSFER" });
  });

  it("applies a full strategic city transfer", () => {
    const result = new CommandProcessor().execute(
      context("GM"),
      command({
        type: "APPLY_PEACE_TRANSFER",
        recipientStateId: "new",
        cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }]
      })
    );
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.gridMap.cells["1,0"]).toMatchObject({
      recognizedStateId: "new",
      deFactoStateId: "new"
    });
    expect(result.state.scene.strategicCities?.[0]).toMatchObject({
      recognizedStateId: "new",
      deFactoStateId: "new"
    });
  });

  it("is GM-only", () => {
    const result = new CommandProcessor().execute(
      context("PLAYER"),
      command({
        type: "APPLY_PEACE_TRANSFER",
        recipientStateId: "new",
        cells: [{ x: 0, y: 0 }]
      }, "player")
    );
    expect(result).toEqual({ status: "REJECTED", reason: "GM_ONLY" });
  });
});
