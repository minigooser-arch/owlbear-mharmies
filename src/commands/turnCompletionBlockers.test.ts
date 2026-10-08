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
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 3, phase: "POST_MOVEMENT" },
    ships: {},
    navalBattleRequests: [],
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

function context(current: SceneState): CommandContext {
  return {
    role: "GM",
    playerId: "gm",
    connectionId: "gm-connection",
    connectedPlayerIds: new Set(["gm"]),
    state: {
      scene: current,
      armies: {},
      barriers: {},
      items: {},
      positions: {}
    } as CommandState
  };
}

function command(): ArmyCommand {
  return {
    type: "COMPLETE_TURN_NOW",
    protocolVersion: 6,
    requestId: "request",
    senderPlayerId: "gm",
    senderConnectionId: "gm-connection",
    expectedRevision: 1
  };
}

describe("turn completion command blockers", () => {
  it("completes an idle movement-phase turn with a single command", () => {
    const current = scene();
    current.turn.phase = "MOVEMENT";
    const result = new CommandProcessor().execute(context(current), command());
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.turn.turnNumber).toBe(4);
    expect(result.state.scene.turn.phase).toBe("MOVEMENT");
    expect(result.state.scene.turn.lastCompletedBy).toBe("MANUAL");
    expect(result.state.scene.turn.completionPending).toBeUndefined();
  });

  it("returns all simultaneous battle blockers in deterministic order", () => {
    const current = scene();
    current.battleGroups = [{ battleId: "land", name: "Land", participantIds: [], revision: 1 }];
    current.activeNavalBattle = {
      version: 1,
      id: "naval",
      requestId: null,
      initiatorSideId: "red",
      areaCells: [{ x: 0, y: 0 }],
      participantShipIds: [],
      snapshots: {},
      initiative: [],
      roundNumber: 1,
      currentShipId: null,
      completedShipIdsThisRound: [],
      movementRemainingByShip: {},
      actionUsedByShip: {},
      exitedShipIds: [],
      status: "ACTIVE",
      events: [],
      startedOnTurn: 3,
      startedAt: 1,
      revision: 1
    };

    const result = new CommandProcessor().execute(context(current), command());
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.turn.turnNumber).toBe(3);
    expect(result.state.scene.turn.completionPending).toEqual({ source: "MANUAL" });
    const duplicate = new CommandProcessor().execute(
      { ...context(result.state.scene), state: result.state },
      { ...command(), expectedRevision: result.state.scene.revision }
    );
    expect(duplicate).toEqual({ status: "REJECTED", reason: "TURN_COMPLETION_PENDING" });
  });
});
