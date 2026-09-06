import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import {
  COMMAND_PROTOCOL_VERSION,
  type ArmyCommand,
  type ArmyState,
  type GridCellCoord,
  type NavalBattleState,
  type SceneState,
  type Vector2
} from "../shared/types";
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
      startCell: { x: 2, y: 1 }, executeOnTurn: 7, cells: [], totalCostUnits: 0,
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

function battle(): NavalBattleState {
  return {
    version: 1,
    id: "battle",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [],
    participantShipIds: ["attacker"],
    snapshots: {},
    initiative: [{ shipId: "attacker", initialRoll: 10, bonus: 0, total: 10, tieBreakRolls: [] }],
    roundNumber: 1,
    currentShipId: "attacker",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { attacker: 2 },
    actionUsedByShip: { attacker: false },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 7,
    startedAt: 1,
    revision: 1
  };
}

function scene(phase: "MOVEMENT" | "POST_MOVEMENT", activeNavalBattle: NavalBattleState | null = null): SceneState {
  const terrain = structuredClone(DEFAULT_TERRAIN);
  terrain.types.sea = {
    id: "sea", name: "Море", movementCostUnits: 2, enabled: true,
    movementDomains: ["SEA"], blocksNavalLos: false
  };
  const attacker = createRegisteredShip("red", "BATTLESHIP", "NORTH");
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
        "1,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "1,1": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "2,1": { terrainId: "plain", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }
      }
    },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 7, phase },
    ships: { attacker },
    transportEmbarkRequests: [],
    navalBattleRequests: [],
    activeNavalBattle,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

function state(phase: "MOVEMENT" | "POST_MOVEMENT", activeNavalBattle: NavalBattleState | null = null): CommandState {
  return {
    scene: scene(phase, activeNavalBattle),
    armies: { army: targetArmy() },
    barriers: {},
    items: {
      attacker: { id: "attacker", type: "IMAGE", position: positionForCell({ x: 0, y: 0 }), metadata: {} },
      army: { id: "army", type: "IMAGE", position: positionForCell({ x: 2, y: 1 }), metadata: {} }
    },
    positions: {
      attacker: positionForCell({ x: 0, y: 0 }),
      army: positionForCell({ x: 2, y: 1 })
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
    () => new Date("2026-09-05T08:00:00Z"),
    cellForPosition,
    positionForCell,
    () => new Set(),
    () => 1,
    () => new Set(["army"])
  );
}

describe("shore bombardment final global action window", () => {
  it("rejects shore bombardment during MOVEMENT", () => {
    expect(processor().execute(context(state("MOVEMENT")), command())).toEqual({
      status: "REJECTED",
      reason: "NOT_POST_MOVEMENT_PHASE"
    });
  });

  it("allows shore bombardment during POST_MOVEMENT without an active naval battle", () => {
    const result = processor().execute(context(state("POST_MOVEMENT")), command());
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.activeNavalBattle).toBeNull();
    expect(result.state.scene.ships?.attacker?.shoreBombardmentUsedOnTurn).toBe(7);
  });

  it("rejects shore bombardment while a naval battle is active", () => {
    expect(processor().execute(context(state("POST_MOVEMENT", battle())), command())).toEqual({
      status: "REJECTED",
      reason: "NAVAL_BATTLE_ACTIVE"
    });
  });
});
