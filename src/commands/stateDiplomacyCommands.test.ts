import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type ArmyCommand, type SceneState } from "../shared/types";
import { CommandProcessor } from "./commandProcessor";
import { validateArmyCommand } from "./commandValidation";

function envelope(payload: Record<string, unknown>, protocolVersion: number = COMMAND_PROTOCOL_VERSION) {
  return {
    protocolVersion,
    requestId: "request-1",
    senderPlayerId: "gm",
    senderConnectionId: "gm-connection",
    expectedRevision: 1,
    ...payload
  };
}

function scene(): SceneState {
  return {
    version: 7,
    revision: 1,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      { id: "red", name: "Красные", color: "#d32f2f", playerIds: ["red-leader"], leaderPlayerIds: ["red-leader"], stateId: "russia" },
      { id: "blue", name: "Синие", color: "#1976d2", playerIds: ["blue-leader"], leaderPlayerIds: ["blue-leader"], stateId: "germany" }
    ],
    states: [
      { id: "russia", name: "Россия", color: "#b71c1c", rulingFactionId: "red", active: true },
      { id: "germany", name: "Германия", color: "#1a237e", rulingFactionId: "blue", active: true }
    ],
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
    foreignPresenceViolations: [],
    forcedExitStates: [],
    strategicCities: [],
    territorialScores: [],
    rebellions: [],
    turnCheckpoint: null
  };
}

function execute(payload: Record<string, unknown>, role: "GM" | "PLAYER" = "GM") {
  const senderPlayerId = role === "GM" ? "gm" : "red-leader";
  const senderConnectionId = role === "GM" ? "gm-connection" : "red-connection";
  const command = {
    ...envelope(payload),
    senderPlayerId,
    senderConnectionId
  } as unknown as ArmyCommand;
  return new CommandProcessor().execute({
    role,
    playerId: senderPlayerId,
    connectionId: senderConnectionId,
    connectedPlayerIds: new Set([senderPlayerId]),
    state: { scene: scene(), armies: {}, barriers: {}, items: {} }
  }, command);
}

describe("state diplomacy commands", () => {
  it("uses command protocol v5 and rejects legacy protocol v4", () => {
    expect(COMMAND_PROTOCOL_VERSION).toBe(5);
    expect(validateArmyCommand(envelope({
      type: "SET_STATE_MILITARY_ACCESS",
      fromStateId: "russia",
      toStateId: "germany",
      allowed: true
    }, 4))).toMatchObject({ ok: false, reason: "PROTOCOL_MISMATCH" });
  });

  it.each([
    {
      type: "SET_STATE_MILITARY_ACCESS",
      fromStateId: "russia",
      toStateId: "germany",
      allowed: true
    },
    {
      type: "SET_STATE_WAR",
      leftStateId: "russia",
      rightStateId: "germany",
      atWar: true
    }
  ])("validates $type", (payload) => {
    expect(validateArmyCommand(envelope(payload))).toMatchObject({ ok: true });
  });

  it("stores military access directionally", () => {
    const result = execute({
      type: "SET_STATE_MILITARY_ACCESS",
      fromStateId: "russia",
      toStateId: "germany",
      allowed: true
    });
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.stateRelations).toEqual({
      russia: {
        germany: { militaryAccess: true, atWar: false }
      }
    });
  });

  it("stores war symmetrically without granting military access", () => {
    const result = execute({
      type: "SET_STATE_WAR",
      leftStateId: "russia",
      rightStateId: "germany",
      atWar: true
    });
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.stateRelations).toEqual({
      russia: { germany: { militaryAccess: false, atWar: true } },
      germany: { russia: { militaryAccess: false, atWar: true } }
    });
  });

  it("keeps interstate diplomacy GM-only", () => {
    expect(execute({
      type: "SET_STATE_WAR",
      leftStateId: "russia",
      rightStateId: "germany",
      atWar: true
    }, "PLAYER")).toEqual({ status: "REJECTED", reason: "GM_ONLY" });
  });

  it("routes state mutations through ruler invariants", () => {
    expect(execute({
      type: "CREATE_STATE",
      state: { id: "france", name: "Франция", color: "#607d8b", rulingFactionId: null, active: true }
    })).toEqual({ status: "REJECTED", reason: "STATE_RULING_FACTION_REQUIRED" });

    expect(execute({
      type: "UPDATE_STATE",
      stateId: "russia",
      patch: { rulingFactionId: "blue" }
    })).toEqual({ status: "REJECTED", reason: "RULING_FACTION_MUST_BELONG_TO_STATE" });

    expect(execute({
      type: "SET_SIDE_STATE",
      sideId: "red",
      stateId: "germany"
    })).toEqual({ status: "REJECTED", reason: "RULING_FACTION_MOVE_FORBIDDEN" });
  });

  it("does not delete a state that is still referenced", () => {
    expect(execute({ type: "DELETE_STATE", stateId: "russia" })).toEqual({
      status: "REJECTED",
      reason: "STATE_STILL_REFERENCED"
    });
  });
});
