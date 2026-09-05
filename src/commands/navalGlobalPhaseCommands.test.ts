import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import {
  COMMAND_PROTOCOL_VERSION,
  type ArmyCommand,
  type ArmyCommandPayload,
  type NavalBattleState,
  type SceneState
} from "../shared/types";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { CommandProcessor, type CommandContext, type CommandState } from "./commandProcessor";
import { validateArmyCommand } from "./commandValidation";

const finishMovement = { type: "COMPLETE_MOVEMENT_PHASE" } satisfies ArmyCommandPayload;
const reopenMovement = { type: "REOPEN_MOVEMENT_PHASE" } satisfies ArmyCommandPayload;
void finishMovement;
void reopenMovement;

function scene(phase: "MOVEMENT" | "POST_MOVEMENT", activeNavalBattle: NavalBattleState | null = null): SceneState {
  return {
    version: 6,
    revision: 4,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      { id: "red", name: "Красные", color: "#f00", playerIds: ["leader"], leaderPlayerIds: ["leader"], stateId: null },
      { id: "blue", name: "Синие", color: "#00f", playerIds: ["blue"], leaderPlayerIds: ["blue"], stateId: null }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 3, phase },
    ships: {
      red: createRegisteredShip("red", "CRUISER", "NORTH"),
      blue: createRegisteredShip("blue", "BATTLESHIP", "SOUTH")
    },
    navalBattleRequests: [{ id: "naval-request", initiatingShipId: "red", targetShipId: "blue", createdOnTurn: 3 }],
    transportEmbarkRequests: [{ id: "embark-request", shipId: "red", armyId: "army" }],
    activeNavalBattle,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

function activeBattle(): NavalBattleState {
  return {
    version: 1,
    id: "battle",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [{ x: 0, y: 0 }],
    participantShipIds: ["red"],
    snapshots: {},
    initiative: [{ shipId: "red", initialRoll: 10, bonus: 2, total: 12, tieBreakRolls: [] }],
    roundNumber: 1,
    currentShipId: "red",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { red: 3 },
    actionUsedByShip: { red: false },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 3,
    startedAt: 1,
    revision: 1
  };
}

function state(phase: "MOVEMENT" | "POST_MOVEMENT", battle: NavalBattleState | null = null): CommandState {
  return { scene: scene(phase, battle), armies: {}, barriers: {}, items: {} };
}

function command(playerId: string, type: string): ArmyCommand {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: `${type}-${playerId}`,
    senderPlayerId: playerId,
    senderConnectionId: `${playerId}-connection`,
    expectedRevision: 4,
    type
  } as unknown as ArmyCommand;
}

function execute(role: "GM" | "PLAYER", playerId: string, commandState: CommandState, input: ArmyCommand) {
  const context: CommandContext = {
    role,
    playerId,
    connectionId: `${playerId}-connection`,
    connectedPlayerIds: new Set([playerId]),
    state: commandState
  };
  return new CommandProcessor().execute(context, input);
}

describe("global naval phase commands", () => {
  it("parses both explicit GM phase commands", () => {
    expect(validateArmyCommand({
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: "finish",
      senderPlayerId: "gm",
      senderConnectionId: "gm-connection",
      expectedRevision: 4,
      type: "COMPLETE_MOVEMENT_PHASE"
    })).toMatchObject({ ok: true, command: { type: "COMPLETE_MOVEMENT_PHASE" } });

    expect(validateArmyCommand({
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: "reopen",
      senderPlayerId: "gm",
      senderConnectionId: "gm-connection",
      expectedRevision: 4,
      type: "REOPEN_MOVEMENT_PHASE"
    })).toMatchObject({ ok: true, command: { type: "REOPEN_MOVEMENT_PHASE" } });
  });

  it("moves MOVEMENT to POST_MOVEMENT and expires pending transport consent", () => {
    const result = execute("GM", "gm", state("MOVEMENT"), command("gm", "COMPLETE_MOVEMENT_PHASE"));
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.turn.phase).toBe("POST_MOVEMENT");
    expect(result.state.scene.transportEmbarkRequests).toEqual([]);
  });

  it("reopens MOVEMENT only without an active naval battle and clears naval requests", () => {
    const result = execute("GM", "gm", state("POST_MOVEMENT"), command("gm", "REOPEN_MOVEMENT_PHASE"));
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.turn.phase).toBe("MOVEMENT");
    expect(result.state.scene.navalBattleRequests).toEqual([]);

    expect(execute(
      "GM",
      "gm",
      state("POST_MOVEMENT", activeBattle()),
      command("gm", "REOPEN_MOVEMENT_PHASE")
    )).toEqual({ status: "REJECTED", reason: "NAVAL_BATTLE_ACTIVE" });
  });

  it("keeps phase changes GM-only", () => {
    expect(execute(
      "PLAYER",
      "leader",
      state("MOVEMENT"),
      command("leader", "COMPLETE_MOVEMENT_PHASE")
    )).toEqual({ status: "REJECTED", reason: "GM_ONLY" });
  });

  it("blocks ending the global turn while a naval battle is active", () => {
    expect(execute(
      "GM",
      "gm",
      state("POST_MOVEMENT", activeBattle()),
      command("gm", "COMPLETE_TURN_NOW")
    )).toEqual({ status: "REJECTED", reason: "NAVAL_BATTLE_ACTIVE" });
  });

  it("allows naval battle requests only in POST_MOVEMENT", () => {
    const processor = new CommandProcessor(
      () => new Date(),
      undefined,
      undefined,
      () => new Set(["blue"])
    );
    const context: CommandContext = {
      role: "PLAYER",
      playerId: "leader",
      connectionId: "leader-connection",
      connectedPlayerIds: new Set(["leader"]),
      state: state("MOVEMENT")
    };
    const request = {
      ...command("leader", "REQUEST_NAVAL_BATTLE"),
      initiatingShipId: "red",
      targetShipId: "blue"
    } as ArmyCommand;
    expect(processor.execute(context, request)).toEqual({ status: "REJECTED", reason: "NOT_POST_MOVEMENT_PHASE" });
  });
});
