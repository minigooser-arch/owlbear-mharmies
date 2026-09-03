import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { authorizeArmyCommand, type AuthorizationContext } from "../shared/permissions";
import { COMMAND_PROTOCOL_VERSION, type ArmyCommand, type SceneState, type ShipState, type TerrainType } from "../shared/types";
import { CommandProcessor, type CommandContext, type CommandState } from "./commandProcessor";
import { validateArmyCommand } from "./commandValidation";

function seaTerrain(): TerrainType {
  return {
    id: "sea",
    name: "Море",
    movementCostUnits: 2,
    enabled: true,
    movementDomains: ["SEA"],
    blocksNavalLos: false
  };
}

function scene(): SceneState {
  return {
    version: 6,
    revision: 4,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      { id: "red", name: "Красные", color: "#f00", playerIds: ["leader", "member"], leaderPlayerIds: ["leader"], stateId: null },
      { id: "blue", name: "Синие", color: "#00f", playerIds: ["blue-leader"], leaderPlayerIds: ["blue-leader"], stateId: null }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: {
      ...DEFAULT_TERRAIN,
      defaultTerrainId: "plain",
      types: { ...DEFAULT_TERRAIN.types, sea: seaTerrain() }
    },
    gridMap: {
      version: 1,
      revision: 1,
      cells: {
        "0,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "1,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "2,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "1,1": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }
      }
    },
    wars: [],
    turn: structuredClone(DEFAULT_TURN_STATE),
    ships: {
      redShip: createRegisteredShip("red", "IRONCLAD", "SOUTH"),
      blueShip: createRegisteredShip("blue", "CRUISER", "WEST")
    },
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

function requireShip(state: CommandState, shipId: string): ShipState {
  const ship = state.scene.ships?.[shipId];
  if (!ship) throw new Error(`Missing ship fixture ${shipId}`);
  return ship;
}

function shipRouteCommand(shipId = "redShip", cells = [{ x: 1, y: 0 }, { x: 2, y: 0 }], sender = "leader"): ArmyCommand {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: "request",
    senderPlayerId: sender,
    senderConnectionId: `${sender}-connection`,
    expectedRevision: 4,
    type: "SET_SHIP_ROUTE",
    shipId,
    startCell: { x: 0, y: 0 },
    cells
  } as unknown as ArmyCommand;
}

function commandState(): CommandState {
  const current = scene();
  return {
    scene: current,
    armies: {},
    barriers: {},
    items: {
      redShip: { id: "redShip", type: "IMAGE", name: "Red", position: { x: 0.5, y: 0.5 }, metadata: {} },
      blueShip: { id: "blueShip", type: "IMAGE", name: "Blue", position: { x: 0.5, y: 0.5 }, metadata: {} }
    },
    positions: {
      redShip: { x: 0.5, y: 0.5 },
      blueShip: { x: 0.5, y: 0.5 }
    }
  };
}

function processorContext(playerId = "leader", role: "GM" | "PLAYER" = "PLAYER", state = commandState()): CommandContext {
  return {
    role,
    playerId,
    connectionId: `${playerId}-connection`,
    connectedPlayerIds: new Set(["gm", "leader", "member", "blue-leader"]),
    state
  };
}

describe("SET_SHIP_ROUTE validation", () => {
  it("accepts an ordered strategic cell route without deduplicating it", () => {
    const result = validateArmyCommand({
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: "request",
      senderPlayerId: "leader",
      senderConnectionId: "leader-connection",
      expectedRevision: 4,
      type: "SET_SHIP_ROUTE",
      shipId: "redShip",
      startCell: { x: 0, y: 0 },
      cells: [{ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }]
    });

    expect(result).toMatchObject({
      ok: true,
      command: {
        type: "SET_SHIP_ROUTE",
        shipId: "redShip",
        startCell: { x: 0, y: 0 },
        cells: [{ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }]
      }
    });
  });
});

describe("SET_SHIP_ROUTE permissions", () => {
  function auth(playerId: string, command: ArmyCommand) {
    return authorizeArmyCommand({
      role: "PLAYER",
      playerId,
      armies: new Map(),
      ships: new Map(Object.entries(scene().ships ?? {})),
      sides: scene().sides,
      settings: DEFAULT_SETTINGS,
      connectedPlayerIds: new Set([playerId])
    } as unknown as AuthorizationContext, command);
  }

  it("allows a faction leader but not an ordinary member or enemy leader", () => {
    expect(auth("leader", shipRouteCommand())).toEqual({ allowed: true });
    expect(auth("member", shipRouteCommand("redShip", [{ x: 1, y: 0 }], "member")))
      .toEqual({ allowed: false, reason: "NOT_SIDE_LEADER" });
    expect(auth("leader", shipRouteCommand("blueShip", [{ x: 1, y: 0 }], "leader")))
      .toEqual({ allowed: false, reason: "NOT_SIDE_LEADER" });
  });
});

describe("SET_SHIP_ROUTE processing", () => {
  const processor = new CommandProcessor(() => new Date(), () => ({ x: 0, y: 0 }));

  it("commits a valid route, spends one OP per cell, and preserves facing", () => {
    const result = processor.execute(processorContext(), shipRouteCommand());
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.ships?.redShip).toMatchObject({
      facing: "SOUTH",
      plannedRoute: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
      globalMovementRemaining: 2,
      movementSpentThisTurn: true,
      revision: 2
    });
  });

  it("rejects a route when the authoritative token cell disagrees with startCell", () => {
    const mismatching = new CommandProcessor(() => new Date(), () => ({ x: 9, y: 9 }));
    expect(mismatching.execute(processorContext(), shipRouteCommand())).toEqual({
      status: "REJECTED",
      reason: "SHIP_ROUTE_START_MISMATCH"
    });
  });

  it("rejects LAND cells, ships in battle, and replacing an already committed route", () => {
    expect(processor.execute(processorContext(), shipRouteCommand("redShip", [{ x: 1, y: 1 }]))).toEqual({
      status: "REJECTED",
      reason: "NON_NAVAL_TERRAIN"
    });

    const battleState = commandState();
    battleState.scene.ships = {
      ...battleState.scene.ships,
      redShip: { ...requireShip(battleState, "redShip"), status: "IN_NAVAL_BATTLE", battleId: "battle" }
    };
    expect(processor.execute(processorContext("leader", "PLAYER", battleState), shipRouteCommand())).toEqual({
      status: "REJECTED",
      reason: "SHIP_NOT_READY"
    });

    const plannedState = commandState();
    plannedState.scene.ships = {
      ...plannedState.scene.ships,
      redShip: { ...requireShip(plannedState, "redShip"), plannedRoute: [{ x: 1, y: 0 }] }
    };
    expect(processor.execute(processorContext("leader", "PLAYER", plannedState), shipRouteCommand("redShip", [{ x: 1, y: 0 }]))).toEqual({
      status: "REJECTED",
      reason: "SHIP_ROUTE_ALREADY_PLANNED"
    });
  });
});
