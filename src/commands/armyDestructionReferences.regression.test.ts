import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type ArmyCommand, type ArmyState, type SceneState, type ShipState } from "../shared/types";
import { CommandProcessor } from "./commandProcessor";

function army(): ArmyState {
  return {
    version: 4,
    registered: true,
    sideId: "red",
    status: "READY",
    overrides: {},
    route: [],
    plannedRoute: {
      startCell: { x: 0, y: 0 },
      executeOnTurn: 1,
      cells: [],
      totalCostUnits: 0,
      validatedRevision: 1,
      requiresReplan: false
    },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    health: { hp: 50, maxHp: 50 },
    supply: { supplied: true, checkedOnTurn: 1 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    embarkedOnShipId: "transport",
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1
  };
}

function transport(): ShipState {
  return {
    version: 1,
    registered: true,
    sideId: "red",
    classId: "TRANSPORT",
    status: "READY",
    hp: 40,
    temporaryHp: 0,
    facing: "NORTH",
    plannedRoute: [],
    plannedFacing: null,
    globalMovementRemaining: 2,
    movementSpentThisTurn: false,
    battleId: null,
    detectionOverride: null,
    embarkedArmyId: "army",
    shoreBombardmentUsedOnTurn: null,
    logisticsActionUsedOnTurn: null,
    revision: 1
  };
}

function scene(): SceneState {
  return {
    version: 7,
    revision: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
    sides: [{ id: "red", name: "Red", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: null }],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: structuredClone(DEFAULT_TURN_STATE),
    ships: { transport: transport() },
    navalBattleRequests: [],
    transportEmbarkRequests: [
      { id: "stale-request", shipId: "transport", armyId: "army" }
    ],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {},
    stateRelations: {},
    forcedExitStates: [
      { armyId: "army", startedOnTurn: 1, originReason: "WAR_ENDED" }
    ],
    strategicCities: [],
    territorialScores: [],
    rebellions: [],
    turnCheckpoint: null
  };
}

function command(payload: Record<string, unknown>): ArmyCommand {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: "army-destruction-audit",
    senderPlayerId: "gm",
    senderConnectionId: "gm-connection",
    expectedRevision: 1,
    ...payload
  } as unknown as ArmyCommand;
}

describe("army destruction reference cleanup regressions", () => {
  it("clears transport, forced-exit and pending-embark references when an embarked army reaches zero HP", () => {
    const result = new CommandProcessor().execute({
      role: "GM",
      playerId: "gm",
      connectionId: "gm-connection",
      connectedPlayerIds: new Set(["gm"]),
      state: {
        scene: scene(),
        armies: { army: army() },
        barriers: {},
        items: {}
      }
    }, command({ type: "SET_ARMY_HP", armyId: "army", hp: 0 }));

    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.armies.army).toBeUndefined();
    expect(result.state.scene.ships?.transport?.embarkedArmyId).toBeNull();
    expect(result.state.scene.forcedExitStates).toEqual([]);
    expect(result.state.scene.transportEmbarkRequests).toEqual([]);
  });
});
