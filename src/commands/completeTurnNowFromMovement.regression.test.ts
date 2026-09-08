import { describe, expect, it } from "vitest";
import { CommandProcessor, type CommandContext, type CommandState } from "./commandProcessor";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type ArmyCommand, type SceneState } from "../shared/types";

function scene(): SceneState {
  return {
    version: 6,
    revision: 7,
    settings: { ...DEFAULT_SETTINGS },
    sides: [],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 12, phase: "MOVEMENT" },
    ships: {},
    navalBattleRequests: [],
    transportEmbarkRequests: [{ id: "pending", shipId: "ship", armyId: "army" }],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

describe("manual turn completion from movement regression", () => {
  it("closes MOVEMENT and completes the turn in one GM command", () => {
    const state: CommandState = { scene: scene(), armies: {}, barriers: {}, items: {}, positions: {} };
    const context: CommandContext = {
      role: "GM",
      playerId: "gm",
      connectionId: "gm-connection",
      connectedPlayerIds: new Set(["gm"]),
      state
    };
    const command: ArmyCommand = {
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: "finish-turn",
      senderPlayerId: "gm",
      senderConnectionId: "gm-connection",
      expectedRevision: 7,
      type: "COMPLETE_TURN_NOW"
    } as ArmyCommand;

    const result = new CommandProcessor(() => new Date("2026-09-08T12:00:00.000Z")).execute(context, command);
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.turn.turnNumber).toBe(13);
    expect(result.state.scene.turn.phase).toBe("MOVEMENT");
    expect(result.state.scene.transportEmbarkRequests).toEqual([]);
  });
});
