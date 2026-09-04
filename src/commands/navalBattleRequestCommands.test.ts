import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import {
  COMMAND_PROTOCOL_VERSION,
  type ArmyCommand,
  type GridCellCoord,
  type SceneState,
  type Vector2
} from "../shared/types";
import { CommandProcessor, type CommandContext, type CommandState } from "./commandProcessor";
import { validateArmyCommand } from "./commandValidation";

function scene(): SceneState {
  return {
    version: 6,
    revision: 4,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      {
        id: "red",
        name: "Красные",
        color: "#f00",
        playerIds: ["leader", "member"],
        leaderPlayerIds: ["leader"],
        stateId: null
      },
      {
        id: "blue",
        name: "Синие",
        color: "#00f",
        playerIds: ["blue-leader"],
        leaderPlayerIds: ["blue-leader"],
        stateId: null
      }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 7, phase: "MOVEMENT" },
    ships: {
      "red-ship": createRegisteredShip("red", "CRUISER", "EAST"),
      "blue-ship": createRegisteredShip("blue", "BATTLESHIP", "WEST")
    },
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

function state(): CommandState {
  return {
    scene: scene(),
    armies: {},
    barriers: {},
    items: {}
  };
}

function rawRequest(playerId: string): Record<string, unknown> {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: `request-naval-${playerId}`,
    senderPlayerId: playerId,
    senderConnectionId: `${playerId}-connection`,
    expectedRevision: 4,
    type: "REQUEST_NAVAL_BATTLE",
    initiatingShipId: "red-ship",
    targetShipId: "blue-ship"
  };
}

function command(playerId: string): ArmyCommand {
  return rawRequest(playerId) as unknown as ArmyCommand;
}

function context(playerId: string): CommandContext {
  return {
    role: "PLAYER",
    playerId,
    connectionId: `${playerId}-connection`,
    connectedPlayerIds: new Set([playerId]),
    state: state()
  };
}

type RequestCommandProcessorConstructor = new (
  now?: () => Date,
  cellForPosition?: (position: Vector2) => GridCellCoord,
  positionForCell?: (cell: GridCellCoord) => Vector2,
  detectedNavalTargetsForSide?: (sideId: string) => ReadonlySet<string>
) => CommandProcessor;

const RequestCommandProcessor = CommandProcessor as unknown as RequestCommandProcessorConstructor;

function processor(detected = new Set(["blue-ship"])): CommandProcessor {
  return new RequestCommandProcessor(
    () => new Date("2026-09-04T12:00:00Z"),
    undefined,
    undefined,
    () => detected
  );
}

describe("naval battle request command validation", () => {
  it("accepts a well-formed leader request payload", () => {
    expect(validateArmyCommand(rawRequest("leader"))).toMatchObject({
      ok: true,
      command: {
        type: "REQUEST_NAVAL_BATTLE",
        initiatingShipId: "red-ship",
        targetShipId: "blue-ship"
      }
    });
  });

  it("rejects malformed ship ids", () => {
    expect(validateArmyCommand({
      ...rawRequest("leader"),
      initiatingShipId: ""
    })).toMatchObject({ ok: false, reason: "INVALID_COMMAND" });
  });
});

describe("naval battle request command processing", () => {
  it("allows the initiating side leader and persists a pending request without starting battle", () => {
    const result = processor().execute(context("leader"), command("leader"));

    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.navalBattleRequests).toEqual([
      {
        id: "request-naval-leader",
        initiatingShipId: "red-ship",
        targetShipId: "blue-ship",
        createdOnTurn: 7
      }
    ]);
    expect(result.state.scene.activeNavalBattle).toBeNull();
    expect(result.state.scene.turn.phase).toBe("MOVEMENT");
  });

  it("rejects an ordinary member of the initiating side", () => {
    expect(processor().execute(context("member"), command("member"))).toEqual({
      status: "REJECTED",
      reason: "NOT_SIDE_LEADER"
    });
  });

  it("rejects a request when the target is not currently detected", () => {
    expect(processor(new Set()).execute(context("leader"), command("leader"))).toEqual({
      status: "REJECTED",
      reason: "TARGET_NOT_DETECTED"
    });
  });
});
