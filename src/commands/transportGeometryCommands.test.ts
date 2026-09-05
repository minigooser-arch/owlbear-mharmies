import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import {
  COMMAND_PROTOCOL_VERSION,
  type ArmyCommand,
  type ArmyState,
  type GridCellCoord,
  type SceneState,
  type Vector2
} from "../shared/types";
import { CommandProcessor, type CommandContext, type CommandState } from "./commandProcessor";
import { validateArmyCommand } from "./commandValidation";

function army(sideId: string, embarkedOnShipId: string | null = null): ArmyState {
  return {
    version: 4,
    registered: true,
    sideId,
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
    embarkedOnShipId,
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1
  };
}

function cellState(terrainId: string) {
  return {
    terrainId,
    impassable: false,
    factionTerritoryIds: [],
    recognizedStateId: null,
    deFactoStateId: null
  };
}

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
        playerIds: ["red-leader"],
        leaderPlayerIds: ["red-leader"],
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
    relations: { red: { blue: "ENEMY" }, blue: { red: "ENEMY" } },
    battleGroups: [],
    terrain: {
      ...structuredClone(DEFAULT_TERRAIN),
      types: {
        ...structuredClone(DEFAULT_TERRAIN.types),
        sea: {
          id: "sea",
          name: "Море",
          movementCostUnits: 2,
          enabled: true,
          movementDomains: ["SEA"],
          blocksNavalLos: false
        },
        mixed: {
          id: "mixed",
          name: "Канал",
          movementCostUnits: 2,
          enabled: true,
          movementDomains: ["LAND", "SEA"],
          blocksNavalLos: false
        }
      }
    },
    gridMap: {
      version: 1,
      revision: 0,
      cells: {
        "0,0": cellState("sea"),
        "1,0": cellState("plain"),
        "2,0": cellState("mixed"),
        "5,0": cellState("plain")
      }
    },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), phase: "MOVEMENT" },
    ships: { transport: createRegisteredShip("red", "TRANSPORT", "EAST") },
    transportEmbarkRequests: [],
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

const cellForPosition = (position: Vector2): GridCellCoord => ({
  x: Math.floor(position.x / 100),
  y: Math.floor(position.y / 100)
});
const positionForCell = (cell: GridCellCoord): Vector2 => ({
  x: cell.x * 100 + 50,
  y: cell.y * 100 + 50
});

function state(options: {
  armySide?: string;
  armyPosition?: Vector2;
  shipPosition?: Vector2;
  reciprocal?: boolean;
  extraArmies?: Record<string, { state: ArmyState; position: Vector2 }>;
} = {}): CommandState {
  const reciprocal = options.reciprocal ?? false;
  const commandScene = scene();
  if (reciprocal) commandScene.ships!.transport = {
    ...commandScene.ships!.transport!,
    embarkedArmyId: "army"
  };
  const armies: Record<string, ArmyState> = {
    army: army(options.armySide ?? "red", reciprocal ? "transport" : null)
  };
  const positions: Record<string, Vector2> = {
    transport: options.shipPosition ?? { x: 50, y: 50 },
    army: options.armyPosition ?? { x: 150, y: 50 }
  };
  for (const [id, entry] of Object.entries(options.extraArmies ?? {})) {
    armies[id] = entry.state;
    positions[id] = entry.position;
  }
  return { scene: commandScene, armies, barriers: {}, items: {}, positions };
}

function raw(playerId: string, payload: Record<string, unknown>, requestId = `request-${playerId}`) {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId,
    senderPlayerId: playerId,
    senderConnectionId: `${playerId}-connection`,
    expectedRevision: 4,
    ...payload
  };
}

function execute(playerId: string, payload: Record<string, unknown>, commandState: CommandState) {
  const context: CommandContext = {
    role: "PLAYER",
    playerId,
    connectionId: `${playerId}-connection`,
    connectedPlayerIds: new Set(["red-leader", "blue-leader"]),
    state: commandState
  };
  return new CommandProcessor(
    () => new Date("2026-09-05T08:00:00Z"),
    cellForPosition,
    positionForCell
  ).execute(context, raw(playerId, payload) as unknown as ArmyCommand);
}

describe("authoritative transport geometry", () => {
  it("requires a target cell for disembark payloads", () => {
    expect(validateArmyCommand(raw("red-leader", {
      type: "DISEMBARK_ARMY",
      shipId: "transport",
      armyId: "army"
    }))).toMatchObject({ ok: false, reason: "INVALID_COMMAND" });

    expect(validateArmyCommand(raw("red-leader", {
      type: "DISEMBARK_ARMY",
      shipId: "transport",
      armyId: "army",
      targetCell: { x: 1, y: 0 }
    }))).toMatchObject({
      ok: true,
      command: { type: "DISEMBARK_ARMY", shipId: "transport", armyId: "army", targetCell: { x: 1, y: 0 } }
    });
  });

  it("rejects diagonal embarkation and same-cell embarkation outside mixed LAND+SEA terrain", () => {
    const diagonal = execute("red-leader", {
      type: "EMBARK_ARMY",
      shipId: "transport",
      armyId: "army"
    }, state({ armyPosition: { x: 150, y: 150 } }));
    expect(diagonal).toEqual({ status: "REJECTED", reason: "NOT_ADJACENT" });

    const samePureSea = execute("red-leader", {
      type: "EMBARK_ARMY",
      shipId: "transport",
      armyId: "army"
    }, state({ armyPosition: { x: 50, y: 50 } }));
    expect(samePureSea).toEqual({ status: "REJECTED", reason: "NOT_ADJACENT" });
  });

  it("allows same-cell embarkation on a mixed LAND+SEA cell", () => {
    const result = execute("red-leader", {
      type: "EMBARK_ARMY",
      shipId: "transport",
      armyId: "army"
    }, state({ shipPosition: { x: 250, y: 50 }, armyPosition: { x: 250, y: 50 } }));
    expect(result.status).toBe("ACCEPTED");
  });

  it("revalidates geometry when a foreign embark request is accepted", () => {
    const commandState = state({ armySide: "blue", armyPosition: { x: 550, y: 50 } });
    commandState.scene.transportEmbarkRequests = [
      { id: "foreign-request", shipId: "transport", armyId: "army" }
    ];
    const result = execute("blue-leader", {
      type: "ACCEPT_EMBARK_ARMY",
      embarkRequestId: "foreign-request",
      shipId: "transport",
      armyId: "army"
    }, commandState);
    expect(result).toEqual({ status: "REJECTED", reason: "NOT_ADJACENT" });
  });
});

describe("authoritative transport landing", () => {
  it("requires LAND at the landing cell", () => {
    const result = execute("red-leader", {
      type: "DISEMBARK_ARMY",
      shipId: "transport",
      armyId: "army",
      targetCell: { x: 0, y: 0 }
    }, state({ reciprocal: true }));
    expect(result).toEqual({ status: "REJECTED", reason: "LANDING_REQUIRES_LAND" });
  });

  it("rejects landing onto a friendly occupied cell", () => {
    const result = execute("red-leader", {
      type: "DISEMBARK_ARMY",
      shipId: "transport",
      armyId: "army",
      targetCell: { x: 1, y: 0 }
    }, state({
      reciprocal: true,
      extraArmies: {
        friendly: { state: army("red"), position: { x: 150, y: 50 } }
      }
    }));
    expect(result).toEqual({ status: "REJECTED", reason: "LANDING_CELL_OCCUPIED" });
  });

  it("lands onto an enemy and creates the normal land battle group", () => {
    const result = execute("red-leader", {
      type: "DISEMBARK_ARMY",
      shipId: "transport",
      armyId: "army",
      targetCell: { x: 1, y: 0 }
    }, state({
      reciprocal: true,
      extraArmies: {
        enemy: { state: army("blue"), position: { x: 150, y: 50 } }
      }
    }));

    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.positions?.army).toEqual({ x: 150, y: 50 });
    expect(result.state.scene.ships?.transport?.embarkedArmyId).toBeNull();
    expect(result.state.armies.army?.embarkedOnShipId).toBeNull();
    expect(result.state.scene.battleGroups).toHaveLength(1);
    const battle = result.state.scene.battleGroups[0];
    expect(new Set(battle?.participantIds)).toEqual(new Set(["army", "enemy"]));
    expect(result.state.armies.army?.status).toBe("IN_BATTLE");
    expect(result.state.armies.enemy?.status).toBe("IN_BATTLE");
    expect(result.state.armies.army?.battleGroupId).toBe(battle?.battleId);
    expect(result.state.armies.enemy?.battleGroupId).toBe(battle?.battleId);
  });
});
