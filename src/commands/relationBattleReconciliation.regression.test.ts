import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type ArmyCommand, type ArmyState, type SceneState } from "../shared/types";
import { CommandProcessor } from "./commandProcessor";

function army(sideId: string): ArmyState {
  return {
    version: 4,
    registered: true,
    sideId,
    status: "IN_BATTLE",
    overrides: {},
    route: [{ x: 150, y: 50 }],
    plannedRoute: {
      startCell: { x: 0, y: 0 },
      executeOnTurn: 1,
      cells: [{ x: 1, y: 0 }],
      totalCostUnits: 2,
      validatedRevision: 1,
      requiresReplan: false
    },
    movement: { maxUnits: 10, remainingUnits: 0, enteredRouteCellCount: 0 },
    health: { hp: 50, maxHp: 50 },
    supply: { supplied: true, checkedOnTurn: 1 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    embarkedOnShipId: null,
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1,
    battleGroupId: "battle-1",
    stopReason: "BATTLE"
  };
}

function scene(): SceneState {
  return {
    version: 7,
    revision: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
    sides: [
      { id: "red", name: "Red", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: null },
      { id: "blue", name: "Blue", color: "#00f", playerIds: [], leaderPlayerIds: [], stateId: null }
    ],
    states: [],
    relations: {
      red: { blue: "ENEMY" },
      blue: { red: "ENEMY" }
    },
    battleGroups: [{
      battleId: "battle-1",
      name: "Бой 1",
      participantIds: ["red-army", "blue-army"],
      revision: 1
    }],
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
    forcedExitStates: [],
    strategicCities: [],
    territorialScores: [],
    rebellions: [],
    turnCheckpoint: null
  };
}

function command(): ArmyCommand {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: "relation-battle-audit",
    senderPlayerId: "gm",
    senderConnectionId: "gm-connection",
    expectedRevision: 1,
    type: "SET_RELATION",
    leftSideId: "red",
    rightSideId: "blue",
    relation: "ALLY"
  };
}

describe("side relation battle reconciliation", () => {
  it("releases a battle when its two factions stop being enemies and preserves routes", () => {
    const result = new CommandProcessor().execute({
      role: "GM",
      playerId: "gm",
      connectionId: "gm-connection",
      connectedPlayerIds: new Set(["gm"]),
      state: {
        scene: scene(),
        armies: {
          "red-army": army("red"),
          "blue-army": army("blue")
        },
        barriers: {},
        items: {}
      }
    }, command());

    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;

    expect(result.state.scene.battleGroups).toEqual([]);
    for (const armyId of ["red-army", "blue-army"]) {
      const released = result.state.armies[armyId];
      expect(released?.status).toBe("PAUSED");
      expect(released?.battleGroupId).toBeUndefined();
      expect(released?.route).toEqual([{ x: 150, y: 50 }]);
      expect(released?.plannedRoute.cells).toEqual([{ x: 1, y: 0 }]);
    }
  });
});
