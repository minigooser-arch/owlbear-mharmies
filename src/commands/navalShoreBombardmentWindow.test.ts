import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type ArmyCommand, type ArmyState, type GridCellCoord, type SceneState, type Vector2 } from "../shared/types";
import { CommandProcessor, type CommandContext, type CommandState } from "./commandProcessor";

const cellForPosition = (position: Vector2): GridCellCoord => ({ x: Math.floor(position.x / 100), y: Math.floor(position.y / 100) });
const positionForCell = (cell: GridCellCoord): Vector2 => ({ x: cell.x * 100 + 50, y: cell.y * 100 + 50 });

function targetArmy(): ArmyState {
  return {
    version: 4,
    registered: true,
    sideId: "blue",
    status: "READY",
    overrides: {},
    route: [],
    plannedRoute: {
      startCell: { x: 2, y: 0 }, executeOnTurn: 7, cells: [], totalCostUnits: 0,
      validatedRevision: 1, requiresReplan: false
    },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    health: { hp: 30, maxHp: 50 },
    supply: { supplied: true, checkedOnTurn: 7 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    embarkedOnShipId: null,
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1
  };
}

function scene(): SceneState {
  const terrain = structuredClone(DEFAULT_TERRAIN);
  terrain.types.sea = {
    id: "sea", name: "Море", movementCostUnits: 2, enabled: true,
    movementDomains: ["SEA"], blocksNavalLos: false
  };
  const attacker = createRegisteredShip("red", "BATTLESHIP", "EAST");
  return {
    version: 6,
    revision: 1,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      { id: "red", name: "Красные", color: "#f00", playerIds: ["leader"], leaderPlayerIds: ["leader"], stateId: null },
      { id: "blue", name: "Синие", color: "#00f", playerIds: ["blue"], leaderPlayerIds: ["blue"], stateId: null }
    ],
    states: [],
    relations: { red: { blue: "ENEMY" }, blue: { red: "ENEMY" } },
    battleGroups: [],
    terrain,
    gridMap: {
      version: 1,
      revision: 0,
      cells: {
        "0,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "2,0": { terrainId: "plain", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }
      }
    },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 7, phase: "MOVEMENT" },
    ships: { attacker },
    transportEmbarkRequests: [],
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

function state(): CommandState {
  return {
    scene: scene(),
    armies: { army: targetArmy() },
    barriers: {},
    items: {
      attacker: { id: "attacker", type: "IMAGE", position: positionForCell({ x: 0, y: 0 }), metadata: {} },
      army: { id: "army", type: "IMAGE", position: positionForCell({ x: 2, y: 0 }), metadata: {} }
    },
    positions: {
      attacker: positionForCell({ x: 0, y: 0 }),
      army: positionForCell({ x: 2, y: 0 })
    }
  };
}

function command(): ArmyCommand {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: "shore-window",
    senderPlayerId: "leader",
    senderConnectionId: "leader-connection",
    expectedRevision: 1,
    type: "NAVAL_SHORE_BOMBARDMENT",
    shipId: "attacker",
    armyId: "army"
  };
}

function context(): CommandContext {
  return {
    role: "PLAYER",
    playerId: "leader",
    connectionId: "leader-connection",
    connectedPlayerIds: new Set(["leader"]),
    state: state()
  };
}

function processor(windowOpen: boolean) {
  return new CommandProcessor(
    () => new Date("2026-09-05T08:00:00Z"),
    cellForPosition,
    positionForCell,
    () => new Set(),
    () => 1,
    () => new Set(["army"]),
    () => true,
    () => 2,
    () => true,
    () => windowOpen
  );
}

describe("shore bombardment global action window", () => {
  it("fails closed outside active naval combat when the approved global window is unavailable", () => {
    expect(processor(false).execute(context(), command())).toEqual({
      status: "REJECTED",
      reason: "SHORE_BOMBARDMENT_WINDOW_CLOSED"
    });
  });

  it("allows the same authoritative shot when an approved global action window is injected", () => {
    const result = processor(true).execute(context(), command());
    expect(result.status).toBe("ACCEPTED");
  });
});
