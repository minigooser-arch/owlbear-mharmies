import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type ArmyCommand, type ArmyState, type SceneState } from "../shared/types";
import { CommandProcessor, type CommandContext, type CommandState } from "./commandProcessor";

function army(): ArmyState {
  return {
    version: 4,
    registered: true,
    sideId: "red",
    status: "READY",
    overrides: {},
    route: [{ x: 100, y: 0 }],
    plannedRoute: {
      startCell: { x: 0, y: 0 },
      executeOnTurn: 27,
      cells: [{ x: 1, y: 0 }],
      totalCostUnits: 2,
      validatedRevision: 2,
      requiresReplan: false
    },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    health: { hp: 50, maxHp: 50 },
    supply: { supplied: true, checkedOnTurn: 26 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1
  };
}

function scene(): SceneState {
  return {
    version: 6,
    revision: 2,
    settings: { ...DEFAULT_SETTINGS },
    sides: [{
      id: "red",
      name: "Красные",
      color: "#f00",
      playerIds: [],
      leaderPlayerIds: [],
      stateId: null
    }],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...DEFAULT_TURN_STATE, turnNumber: 26, phase: "MOVEMENT" },
    ships: {},
    navalBattleRequests: [],
    transportEmbarkRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

function state(): CommandState {
  return {
    scene: scene(),
    armies: { army: army() },
    barriers: {},
    items: {}
  };
}

function context(commandState: CommandState): CommandContext {
  return {
    role: "GM",
    playerId: "gm",
    connectionId: "gm-connection",
    connectedPlayerIds: new Set(["gm"]),
    state: commandState
  };
}

function renumber(turnNumber: number): ArmyCommand {
  return {
    type: "SET_TURN_NUMBER",
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: "renumber",
    senderPlayerId: "gm",
    senderConnectionId: "gm-connection",
    expectedRevision: 2,
    turnNumber
  };
}

describe("SET_TURN_NUMBER command safety", () => {
  const processor = new CommandProcessor();

  it("rebases live state through the authoritative command", () => {
    const result = processor.execute(context(state()), renumber(1));
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.turn.turnNumber).toBe(1);
    expect(result.state.armies.army?.plannedRoute.executeOnTurn).toBe(2);
    expect(result.state.armies.army?.plannedRoute.requiresReplan).toBe(false);
  });

  it("rejects renumbering outside movement", () => {
    const commandState = state();
    commandState.scene.turn.phase = "POST_MOVEMENT";
    expect(processor.execute(context(commandState), renumber(1))).toEqual({
      status: "REJECTED",
      reason: "NOT_MOVEMENT_PHASE"
    });
  });

  it("rejects renumbering while a naval battle is active", () => {
    const commandState = state();
    commandState.scene.activeNavalBattle = {
      version: 1,
      id: "battle",
      requestId: null,
      initiatorSideId: "red",
      areaCells: [],
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
      startedOnTurn: 26,
      startedAt: 0,
      revision: 1
    };
    expect(processor.execute(context(commandState), renumber(1))).toEqual({
      status: "REJECTED",
      reason: "NAVAL_BATTLE_ACTIVE"
    });
  });
});
