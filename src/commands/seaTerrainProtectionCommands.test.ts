import { expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type ArmyCommand, type SceneState } from "../shared/types";
import { CommandProcessor } from "./commandProcessor";

function scene(): SceneState {
  return {
    version: 6,
    revision: 1,
    settings: { ...DEFAULT_SETTINGS },
    sides: [], states: [], relations: {}, battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [], turn: structuredClone(DEFAULT_TURN_STATE),
    ships: {}, navalBattleRequests: [], activeNavalBattle: null, navalBattleHistory: [], navalRevealUntilTurn: {}
  };
}

function command(payload: Record<string, unknown>): ArmyCommand {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: "request",
    senderPlayerId: "gm",
    senderConnectionId: "gm-connection",
    expectedRevision: 1,
    ...payload
  } as ArmyCommand;
}

function execute(payload: Record<string, unknown>) {
  return new CommandProcessor().execute({
    role: "GM",
    playerId: "gm",
    connectionId: "gm-connection",
    connectedPlayerIds: new Set(["gm"]),
    state: { scene: scene(), armies: {}, barriers: {}, items: {} }
  }, command(payload));
}

it("rejects deletion of the built-in sea terrain", () => {
  expect(execute({ type: "DELETE_TERRAIN_TYPE", terrainId: "sea", replacementTerrainId: "plain" })).toEqual({
    status: "REJECTED",
    reason: "BUILT_IN_TERRAIN_REQUIRED"
  });
});

it("rejects disabling the built-in sea terrain", () => {
  expect(execute({ type: "UPDATE_TERRAIN_TYPE", terrainId: "sea", patch: { enabled: false } })).toEqual({
    status: "REJECTED",
    reason: "BUILT_IN_TERRAIN_REQUIRED"
  });
});
