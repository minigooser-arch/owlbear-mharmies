import { expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { ArmyCommand, ArmyState, SceneState } from "../shared/types";
import { CommandProcessor, type CommandContext, type CommandState } from "./commandProcessor";

function plannedArmy(): ArmyState {
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
      validatedRevision: 10,
      requiresReplan: false
    },
    movement: { maxUnits: 10, remainingUnits: 7, enteredRouteCellCount: 0 },
    health: { hp: 41, maxHp: 50 },
    supply: { supplied: true, checkedOnTurn: 26 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    embarkedOnShipId: null,
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 4
  };
}

function state(): CommandState {
  const scene: SceneState = {
    version: 6,
    revision: 10,
    settings: structuredClone(DEFAULT_SETTINGS),
    sides: [{ id: "red", name: "Красные", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: null }],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 26 },
    ships: {},
    navalBattleRequests: [],
    transportEmbarkRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
  return {
    scene,
    armies: { army: plannedArmy() },
    barriers: {},
    items: {}
  };
}

it("changes only the turn counter and invalidates turn-bound army routes", () => {
  const commandState = state();
  const context: CommandContext = {
    role: "GM",
    playerId: "gm",
    connectionId: "gm-connection",
    connectedPlayerIds: new Set(["gm"]),
    state: commandState
  };
  const command = {
    protocolVersion: 4,
    requestId: "set-turn",
    senderPlayerId: "gm",
    senderConnectionId: "gm-connection",
    expectedRevision: 10,
    type: "SET_TURN_NUMBER",
    turnNumber: 1
  } as unknown as ArmyCommand;

  const result = new CommandProcessor().execute(context, command);
  expect(result.status).toBe("ACCEPTED");
  if (result.status !== "ACCEPTED") return;

  expect(result.state.scene.turn.turnNumber).toBe(1);
  expect(result.state.scene.turn.phase).toBe("MOVEMENT");
  expect(result.state.armies.army).toMatchObject({
    health: { hp: 41, maxHp: 50 },
    movement: { maxUnits: 10, remainingUnits: 7, enteredRouteCellCount: 0 },
    plannedRoute: {
      executeOnTurn: 27,
      requiresReplan: true,
      cells: [{ x: 1, y: 0 }]
    }
  });
});
