import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import {
  COMMAND_PROTOCOL_VERSION,
  type ArmyCommand,
  type NavalBattleState,
  type SceneState,
  type ShipState
} from "../shared/types";
import { CommandProcessor, type CommandContext, type CommandState } from "./commandProcessor";
import { validateArmyCommand } from "./commandValidation";

function inBattleCruiser(): ShipState {
  return {
    ...createRegisteredShip("red", "CRUISER", "NORTH"),
    status: "IN_NAVAL_BATTLE",
    battleId: "battle"
  };
}

function inBattleEnemy(): ShipState {
  return {
    ...createRegisteredShip("blue", "IRONCLAD", "SOUTH"),
    status: "IN_NAVAL_BATTLE",
    battleId: "battle"
  };
}

function battle(): NavalBattleState {
  return {
    version: 1,
    id: "battle",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [],
    participantShipIds: ["cruiser", "enemy"],
    snapshots: {},
    initiative: [
      { shipId: "cruiser", initialRoll: 15, bonus: 2, total: 17, tieBreakRolls: [] },
      { shipId: "enemy", initialRoll: 10, bonus: 0, total: 10, tieBreakRolls: [] }
    ],
    roundNumber: 2,
    currentShipId: "cruiser",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { cruiser: 2, enemy: 3 },
    actionUsedByShip: { cruiser: false, enemy: false },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 8,
    startedAt: 1,
    revision: 1
  };
}

function scene(): SceneState {
  return {
    version: 6,
    revision: 4,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      { id: "red", name: "Красные", color: "#f00", playerIds: ["leader", "member"], leaderPlayerIds: ["leader"], stateId: null },
      { id: "blue", name: "Синие", color: "#00f", playerIds: ["blue"], leaderPlayerIds: ["blue"], stateId: null }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 8, phase: "POST_MOVEMENT" },
    ships: { cruiser: inBattleCruiser(), enemy: inBattleEnemy() },
    navalBattleRequests: [],
    transportEmbarkRequests: [],
    activeNavalBattle: battle(),
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

function state(): CommandState {
  return { scene: scene(), armies: {}, barriers: {}, items: {} };
}

function envelope(playerId: string): ArmyCommand {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: `intercept-${playerId}`,
    senderPlayerId: playerId,
    senderConnectionId: `${playerId}-connection`,
    expectedRevision: 4,
    type: "NAVAL_ACTIVATE_INTERCEPTION",
    shipId: "cruiser"
  } as unknown as ArmyCommand;
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

describe("naval cruiser interception command", () => {
  it("parses an explicit activation command", () => {
    expect(validateArmyCommand({
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: "parse",
      senderPlayerId: "leader",
      senderConnectionId: "leader-connection",
      expectedRevision: 4,
      type: "NAVAL_ACTIVATE_INTERCEPTION",
      shipId: "cruiser"
    })).toMatchObject({
      ok: true,
      command: { type: "NAVAL_ACTIVATE_INTERCEPTION", shipId: "cruiser" }
    });
  });

  it("persists the active zone, consumes movement/action and records the activation event", () => {
    const result = new CommandProcessor().execute(context("leader"), envelope("leader"));
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;

    const active = result.state.scene.activeNavalBattle;
    expect(active?.interceptions?.cruiser).toEqual({
      cruiserShipId: "cruiser",
      activatedRoundNumber: 2
    });
    expect(active?.movementRemainingByShip.cruiser).toBe(0);
    expect(active?.actionUsedByShip.cruiser).toBe(true);
    expect(active?.currentShipId).toBe("enemy");
    expect(active?.events).toContainEqual(expect.objectContaining({
      type: "INTERCEPTION_ACTIVATED",
      cruiserShipId: "cruiser",
      roundNumber: 2
    }));
  });

  it("uses cruiser-side leader authorization", () => {
    expect(new CommandProcessor().execute(context("member"), envelope("member")))
      .toEqual({ status: "REJECTED", reason: "NOT_SIDE_LEADER" });
  });
});
