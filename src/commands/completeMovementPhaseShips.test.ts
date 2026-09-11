import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type ArmyCommand, type SceneState } from "../shared/types";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { CommandProcessor, type CommandState } from "./commandProcessor";

function scene(): SceneState {
  return {
    version: 6,
    revision: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
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
    gridMap: {
      version: 1,
      revision: 1,
      cells: {
        "0,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "0,-1": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }
      }
    },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), phase: "MOVEMENT" },
    ships: {},
    navalBattleRequests: [],
    transportEmbarkRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

describe("COMPLETE_MOVEMENT_PHASE ship resolution", () => {
  it("moves a planned ship to its final cell and applies the final heading atomically", () => {
    const commandState: CommandState = {
      scene: scene(),
      armies: {},
      barriers: {},
      items: {},
      positions: { ship: { x: 0, y: 0 } }
    };
    commandState.scene.ships = {
      ship: {
        ...createRegisteredShip("red", "IRONCLAD", "EAST"),
        plannedRoute: [{ x: 0, y: -1 }],
        globalMovementRemaining: 2,
        movementSpentThisTurn: true,
        revision: 2
      }
    };

    const processor = new CommandProcessor(
      () => new Date("2026-09-09T09:00:00.000Z"),
      (position) => ({ x: position.x, y: position.y }),
      (cell) => ({ x: cell.x, y: cell.y })
    );
    const command: ArmyCommand = {
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: "complete-movement",
      senderPlayerId: "gm",
      senderConnectionId: "gm-connection",
      expectedRevision: 1,
      type: "COMPLETE_MOVEMENT_PHASE"
    };

    const result = processor.execute({
      role: "GM",
      playerId: "gm",
      connectionId: "gm-connection",
      connectedPlayerIds: new Set(["gm"]),
      state: commandState
    }, command);

    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.turn.phase).toBe("POST_MOVEMENT");
    expect(result.state.positions?.ship).toEqual({ x: 0, y: -1 });
    expect(result.state.scene.ships?.ship).toMatchObject({
      facing: "NORTH",
      plannedRoute: [],
      globalMovementRemaining: 2,
      movementSpentThisTurn: true
    });
  });
});