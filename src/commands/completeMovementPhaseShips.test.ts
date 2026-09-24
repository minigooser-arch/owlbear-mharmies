import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type ArmyCommand, type SceneState } from "../shared/types";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { roomArmy } from "../tests/helpers/factories";
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
  it("starts every army with a route planned for the upcoming movement phase", () => {
    const first = roomArmy("army-a", "red", "Army A", 0);
    const second = roomArmy("army-b", "red", "Army B", 10);
    for (const [army, startCell, destination] of [
      [first, { x: 0, y: 0 }, { x: 1, y: 0 }],
      [second, { x: 10, y: 0 }, { x: 11, y: 0 }]
    ] as const) {
      army.state.route = [{ x: destination.x, y: destination.y }];
      army.state.plannedRoute = {
        startCell,
        executeOnTurn: 2,
        cells: [destination],
        totalCostUnits: 2,
        validatedRevision: 1,
        requiresReplan: false
      };
    }
    const idle = roomArmy("army-idle", "red", "Idle Army", 20);
    const currentScene = scene();
    currentScene.turn.turnNumber = 1;
    currentScene.gridMap.cells["0,0"] = { terrainId: "road", impassable: false, factionTerritoryIds: ["red"], recognizedStateId: null, deFactoStateId: null };
    currentScene.gridMap.cells["1,0"] = { terrainId: "road", impassable: false, factionTerritoryIds: ["red"], recognizedStateId: null, deFactoStateId: null };
    currentScene.gridMap.cells["10,0"] = { terrainId: "road", impassable: false, factionTerritoryIds: ["red"], recognizedStateId: null, deFactoStateId: null };
    currentScene.gridMap.cells["11,0"] = { terrainId: "road", impassable: false, factionTerritoryIds: ["red"], recognizedStateId: null, deFactoStateId: null };
    const commandState: CommandState = {
      scene: currentScene,
      armies: { "army-a": first.state, "army-b": second.state, "army-idle": idle.state },
      barriers: {},
      items: {},
      positions: { "army-a": first.position, "army-b": second.position, "army-idle": idle.position }
    };
    const processor = new CommandProcessor(
      () => new Date("2026-09-09T09:00:00.000Z"),
      (position) => ({ x: position.x, y: position.y }),
      (cell) => ({ x: cell.x, y: cell.y })
    );
    const command: ArmyCommand = {
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: "complete-movement-armies",
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
    expect(result.state.armies["army-a"]).toMatchObject({ status: "MOVING", plannedRoute: { executeOnTurn: 1 } });
    expect(result.state.armies["army-b"]).toMatchObject({ status: "MOVING", plannedRoute: { executeOnTurn: 1 } });
    expect(result.state.armies["army-idle"]?.status).toBe("READY");
  });

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
