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
    protocolVersion: 5,
    requestId: "request",
    senderPlayerId: "gm",
    senderConnectionId: "gm-connection",
    expectedRevision: 1
  };
}

describe("turn completion command blockers", () => {
  it("returns the movement-resolution blocker as a reason list", () => {
    const current = scene();
    current.turn.phase = "MOVEMENT";
    expect(new CommandProcessor().execute(context(current), command())).toEqual({
      status: "REJECTED",
      reason: "TURN_BLOCKED:MOVEMENT_RESOLUTION_PENDING"
    });
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

    expect(new CommandProcessor().execute(context(current), command())).toEqual({
      status: "REJECTED",
      reason: "TURN_BLOCKED:LAND_BATTLE_ACTIVE,NAVAL_BATTLE_ACTIVE"
    });
  });
});
