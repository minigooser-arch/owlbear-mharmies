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

const cellForPosition = (position: Vector2): GridCellCoord => ({
  x: Math.floor(position.x / 100),
  y: Math.floor(position.y / 100)
});
const positionForCell = (cell: GridCellCoord): Vector2 => ({
  x: cell.x * 100 + 50,
  y: cell.y * 100 + 50
});

function army(sideId: string): ArmyState {
  return {
    version: 4,
    registered: true,
    sideId,
    status: "READY",
    overrides: {},
    route: [],
    plannedRoute: {
      startCell: { x: 2, y: 1 }, executeOnTurn: 5, cells: [], totalCostUnits: 0,
      validatedRevision: 1, requiresReplan: false
    },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    health: { hp: 30, maxHp: 50 },
    supply: { supplied: true, checkedOnTurn: 5 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    embarkedOnShipId: null,
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1
  };
}

function scene(targetSideId: "red" | "blue", allied = false): SceneState {
  const terrain = structuredClone(DEFAULT_TERRAIN);
  terrain.types.sea = {
    id: "sea", name: "Море", movementCostUnits: 2, enabled: true,
    movementDomains: ["SEA"], blocksNavalLos: false
  };
  return {
    version: 6,
    revision: 4,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      { id: "red", name: "Красные", color: "#f00", playerIds: ["leader"], leaderPlayerIds: ["leader"], stateId: null },
      { id: "blue", name: "Синие", color: "#00f", playerIds: ["blue"], leaderPlayerIds: ["blue"], stateId: null }
    ],
    states: [],
    relations: allied
      ? { red: { blue: "ALLY" }, blue: { red: "ALLY" } }
      : { red: { blue: "ENEMY" }, blue: { red: "ENEMY" } },
    battleGroups: [],
    terrain,
    gridMap: {
      version: 1,
      revision: 0,
      cells: {
        "0,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "1,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "1,1": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "2,1": { terrainId: "plain", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }
      }
    },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 5, phase: "POST_MOVEMENT" },
    ships: { attacker: createRegisteredShip("red", "BATTLESHIP", "NORTH") },
    transportEmbarkRequests: [],
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

function state(targetSideId: "red" | "blue", allied = false): CommandState {
  return {
    scene: scene(targetSideId, allied),
    armies: { army: army(targetSideId) },
    barriers: {},
    items: {},
    positions: {
      attacker: positionForCell({ x: 0, y: 0 }),
      army: positionForCell({ x: 2, y: 1 })
    }
  };
}

function command(friendlyFireConfirmed: boolean): ArmyCommand {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: `shore-${friendlyFireConfirmed}`,
    senderPlayerId: "leader",
    senderConnectionId: "leader-connection",
    expectedRevision: 4,
    type: "NAVAL_SHORE_BOMBARDMENT",
    shipId: "attacker",
    armyId: "army",
    friendlyFireConfirmed
  } as unknown as ArmyCommand;
}

function context(commandState: CommandState): CommandContext {
  return {
    role: "PLAYER",
    playerId: "leader",
    connectionId: "leader-connection",
    connectedPlayerIds: new Set(["leader"]),
    state: commandState
  };
}

function processor() {
  return new CommandProcessor(
    () => new Date("2026-09-06T08:00:00Z"),
    cellForPosition,
    positionForCell,
    () => new Set(),
    () => 2,
    () => new Set(["army"])
  );
}

describe("shore bombardment friendly fire confirmation", () => {
  it("parses the explicit confirmation flag", () => {
    expect(validateArmyCommand({
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: "parse",
      senderPlayerId: "leader",
      senderConnectionId: "leader-connection",
      expectedRevision: 4,
      type: "NAVAL_SHORE_BOMBARDMENT",
      shipId: "attacker",
      armyId: "army",
      friendlyFireConfirmed: true
    })).toMatchObject({
      ok: true,
      command: {
        type: "NAVAL_SHORE_BOMBARDMENT",
        shipId: "attacker",
        armyId: "army",
        friendlyFireConfirmed: true
      }
    });
  });

  it("rejects own-side bombardment without confirmation and does not spend the action", () => {
    const result = processor().execute(context(state("red")), command(false));
    expect(result).toEqual({ status: "REJECTED", reason: "FRIENDLY_FIRE_CONFIRMATION_REQUIRED" });
  });

  it("accepts own-side bombardment after explicit confirmation", () => {
    const result = processor().execute(context(state("red")), command(true));
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.armies.army?.health.hp).toBe(24);
    expect(result.state.scene.ships?.attacker?.shoreBombardmentUsedOnTurn).toBe(5);
  });

  it("also requires confirmation against an allied army", () => {
    const result = processor().execute(context(state("blue", true)), command(false));
    expect(result).toEqual({ status: "REJECTED", reason: "FRIENDLY_FIRE_CONFIRMATION_REQUIRED" });
  });
});
