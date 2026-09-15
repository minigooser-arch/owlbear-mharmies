import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type ArmyCommand, type SceneState } from "../shared/types";
import { CommandProcessor } from "./commandProcessor";
import { validateArmyCommand } from "./commandValidation";

function scene(): SceneState {
  return {
    version: 7,
    revision: 3,
    settings: structuredClone(DEFAULT_SETTINGS),
    sides: [
      { id: "red", name: "Красные", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: null },
      { id: "blue", name: "Синие", color: "#00f", playerIds: [], leaderPlayerIds: [], stateId: null }
    ],
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
    stateRelations: {},
    forcedExitStates: [],
    strategicCities: [],
    territorialScores: [],
    rebellions: [],
    turnCheckpoint: null
  };
}

function raw(payload: Record<string, unknown>) {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: "relation-audit",
    senderPlayerId: "gm",
    senderConnectionId: "gm-connection",
    expectedRevision: 3,
    ...payload
  };
}

function execute(payload: Record<string, unknown>) {
  return new CommandProcessor().execute({
    role: "GM",
    playerId: "gm",
    connectionId: "gm-connection",
    connectedPlayerIds: new Set(["gm"]),
    state: { scene: scene(), armies: {}, barriers: {}, items: {} }
  }, raw(payload) as unknown as ArmyCommand);
}

describe("side relation integrity regressions", () => {
  it("rejects self-relations at the command boundary", () => {
    expect(validateArmyCommand(raw({
      type: "SET_RELATION",
      leftSideId: "red",
      rightSideId: "red",
      relation: "ENEMY"
    }))).toMatchObject({ ok: false, reason: "INVALID_COMMAND" });
  });

  it.each([
    ["missing", "blue"],
    ["red", "missing"]
  ])("rejects a relation when either side does not exist (%s, %s)", (leftSideId, rightSideId) => {
    expect(execute({
      type: "SET_RELATION",
      leftSideId,
      rightSideId,
      relation: "ALLY"
    })).toEqual({ status: "REJECTED", reason: "SIDE_NOT_FOUND" });
  });

  it("still stores a valid relation symmetrically", () => {
    const result = execute({
      type: "SET_RELATION",
      leftSideId: "red",
      rightSideId: "blue",
      relation: "ENEMY"
    });
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.relations).toEqual({
      red: { blue: "ENEMY" },
      blue: { red: "ENEMY" }
    });
  });
});
