import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { ArmyCommand, SceneState } from "../shared/types";
import { CommandProcessor, type CommandContext, type CommandState } from "./commandProcessor";

function scene(): SceneState {
  return {
    version: 7,
    revision: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
    sides: [
      { id: "gov", name: "Правительство", color: "#333", playerIds: [], leaderPlayerIds: [], stateId: "state" },
      { id: "rebels", name: "Повстанцы", color: "#933", playerIds: [], leaderPlayerIds: [], stateId: "state" }
    ],
    states: [{ id: "state", name: "Государство", color: "#777", rulingFactionId: "gov", active: true }],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: {
      version: 1,
      revision: 1,
      cells: {
        "0,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "state", deFactoStateId: "state" },
        "1,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "state", deFactoStateId: "state" }
      }
    },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 5 },
    stateRelations: {},
    forcedExitStates: [],
    strategicCities: [{
      id: "capital",
      name: "Столица",
      cells: [{ x: 0, y: 0 }],
      recognizedStateId: "state",
      deFactoStateId: "state",
      factionInfluenceId: null,
      mayorId: null,
      isCapital: true,
      historicalBuildTypeCount: 0
    }],
    territorialScores: [],
    rebellions: [],
    turnCheckpoint: null
  };
}

function context(role: "GM" | "PLAYER"): CommandContext {
  const id = role === "GM" ? "gm" : "player";
  return {
    role,
    playerId: id,
    connectionId: id + "-connection",
    connectedPlayerIds: new Set(["gm", "player"]),
    state: { scene: scene(), armies: {}, barriers: {}, items: {} } as CommandState
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

describe("rebellion commands", () => {
  it("starts and closes a rebellion for the GM", () => {
    const processor = new CommandProcessor();
    const started = processor.execute(context("GM"), command({
      type: "START_REBELLION",
      rebellionId: "reb-1",
      sourceStateId: "state",
      capitalCityId: "capital",
      participantFactionIds: ["gov", "rebels"]
    }));
    expect(started.status).toBe("ACCEPTED");
    if (started.status !== "ACCEPTED") return;
    expect(started.state.scene.rebellions?.[0]).toMatchObject({
      id: "reb-1",
      active: true,
      startedOnTurn: 5
    });

    const closedContext: CommandContext = {
      ...context("GM"),
      state: { ...started.state, scene: { ...started.state.scene, revision: 1 } }
    };
    const closed = processor.execute(closedContext, command({
      type: "CLOSE_REBELLION",
      rebellionId: "reb-1"
    }));
    expect(closed.status).toBe("ACCEPTED");
    if (closed.status !== "ACCEPTED") return;
    expect(closed.state.scene.rebellions?.[0]?.active).toBe(false);
  });

  it("keeps rebellion administration GM-only", () => {
    expect(new CommandProcessor().execute(
      context("PLAYER"),
      command({
        type: "START_REBELLION",
        rebellionId: "reb-1",
        sourceStateId: "state",
        capitalCityId: "capital",
        participantFactionIds: ["gov", "rebels"]
      }, "player")
    )).toEqual({ status: "REJECTED", reason: "GM_ONLY" });
  });
});
