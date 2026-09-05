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
  type ShipState,
  type Vector2
} from "../shared/types";
import { CommandProcessor, type CommandContext, type CommandState } from "./commandProcessor";
import { validateArmyCommand } from "./commandValidation";

const centerForCell = (cell: GridCellCoord): Vector2 => ({ x: cell.x * 100 + 50, y: cell.y * 100 + 50 });
const cellForPosition = (position: Vector2): GridCellCoord => ({ x: Math.floor(position.x / 100), y: Math.floor(position.y / 100) });

function army(sideId = "blue", hp = 20): ArmyState {
  return {
    version: 4,
    registered: true,
    sideId,
    status: "READY",
    overrides: {},
    route: [],
    plannedRoute: {
      startCell: { x: 0, y: 0 }, executeOnTurn: 1, cells: [], totalCostUnits: 0,
      validatedRevision: 1, requiresReplan: false
    },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    health: { hp, maxHp: 50 },
    supply: { supplied: true, checkedOnTurn: 1 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    embarkedOnShipId: null,
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1
  };
}

function inBattleShip(sideId = "red", classId: ShipState["classId"] = "BATTLESHIP"): ShipState {
  return {
    ...createRegisteredShip(sideId, classId, "NORTH"),
    status: "IN_NAVAL_BATTLE",
    battleId: "naval-1"
  };
}

function battle(): NavalBattleState {
  return {
    version: 1,
    id: "naval-1",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [{ x: 1, y: 1 }, { x: 2, y: 1 }],
    participantShipIds: ["attacker", "other"],
    snapshots: {
      attacker: { shipId: "attacker", strategicCell: { x: 1, y: 1 }, strategicPosition: centerForCell({ x: 1, y: 1 }), strategicFacing: "NORTH" },
      other: { shipId: "other", strategicCell: { x: 2, y: 1 }, strategicPosition: centerForCell({ x: 2, y: 1 }), strategicFacing: "SOUTH" }
    },
    initiative: [
      { shipId: "attacker", initialRoll: 20, bonus: 2, total: 22, tieBreakRolls: [] },
      { shipId: "other", initialRoll: 10, bonus: 0, total: 10, tieBreakRolls: [] }
    ],
    roundNumber: 1,
    currentShipId: "attacker",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { attacker: 3, other: 3 },
    actionUsedByShip: { attacker: false, other: false },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 7,
    startedAt: 1,
    revision: 1
  };
}

function scene(): SceneState {
  const terrain = structuredClone(DEFAULT_TERRAIN);
  terrain.types.sea = {
    id: "sea", name: "Море", movementCostUnits: 2, enabled: true,
    movementDomains: ["SEA"], blocksNavalLos: false
  };
  return {
    version: 6,
    revision: 7,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      { id: "red", name: "Красные", color: "#f00", playerIds: ["leader", "member"], leaderPlayerIds: ["leader"], stateId: null },
      { id: "blue", name: "Синие", color: "#00f", playerIds: ["blue"], leaderPlayerIds: ["blue"], stateId: null }
    ],
    states: [],
    relations: { red: { blue: "ENEMY" }, blue: { red: "ENEMY" } },
    battleGroups: [{ battleId: "land-1", name: "Сухопутный бой", participantIds: ["army", "second-army"], revision: 1 }],
    terrain,
    gridMap: {
      version: 1,
      revision: 0,
      cells: {
        "1,1": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "3,1": { terrainId: "plain", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "4,1": { terrainId: "plain", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }
      }
    },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 7, phase: "NAVAL_BATTLE" },
    ships: {
      attacker: inBattleShip(),
      other: inBattleShip("blue", "CRUISER")
    },
    transportEmbarkRequests: [],
    navalBattleRequests: [],
    activeNavalBattle: battle(),
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

function state(targetHp = 20): CommandState {
  return {
    scene: scene(),
    armies: {
      army: army("blue", targetHp),
      "second-army": army("red", 50)
    },
    barriers: {},
    items: {
      attacker: { id: "attacker", type: "IMAGE", position: centerForCell({ x: 1, y: 1 }), metadata: {} },
      other: { id: "other", type: "IMAGE", position: centerForCell({ x: 2, y: 1 }), metadata: {} },
      army: { id: "army", type: "IMAGE", position: centerForCell({ x: 3, y: 1 }), metadata: {} },
      "second-army": { id: "second-army", type: "IMAGE", position: centerForCell({ x: 4, y: 1 }), metadata: {} }
    },
    positions: {
      attacker: centerForCell({ x: 1, y: 1 }),
      other: centerForCell({ x: 2, y: 1 }),
      army: centerForCell({ x: 3, y: 1 }),
      "second-army": centerForCell({ x: 4, y: 1 })
    }
  };
}

function envelope(playerId: string, payload: Record<string, unknown>): ArmyCommand {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: `${payload.type}-${playerId}`,
    senderPlayerId: playerId,
    senderConnectionId: `${playerId}-connection`,
    expectedRevision: 7,
    ...payload
  } as unknown as ArmyCommand;
}

function context(playerId: string, commandState = state()): CommandContext {
  return {
    role: "PLAYER",
    playerId,
    connectionId: `${playerId}-connection`,
    connectedPlayerIds: new Set([playerId]),
    state: commandState
  };
}

function processor(rolls = [3, 4, 5]) {
  return new CommandProcessor(
    () => new Date("2026-09-05T08:00:00Z"),
    cellForPosition,
    centerForCell,
    () => new Set(),
    () => rolls.shift() ?? 1,
    () => new Set(["army"]),
    () => true,
    () => 2,
    () => true
  );
}

describe("naval shore bombardment command", () => {
  it("parses an explicit ship-to-army bombardment command", () => {
    expect(validateArmyCommand(envelope("leader", {
      type: "NAVAL_SHORE_BOMBARDMENT",
      shipId: "attacker",
      armyId: "army"
    }))).toMatchObject({
      ok: true,
      command: { type: "NAVAL_SHORE_BOMBARDMENT", shipId: "attacker", armyId: "army" }
    });
  });

  it("applies deterministic shore damage, marks the turn use and completes the active ship turn", () => {
    const result = processor().execute(context("leader"), envelope("leader", {
      type: "NAVAL_SHORE_BOMBARDMENT",
      shipId: "attacker",
      armyId: "army"
    }));

    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.armies.army?.health.hp).toBe(8);
    expect(result.state.scene.ships?.attacker?.shoreBombardmentUsedOnTurn).toBe(7);
    expect(result.state.scene.activeNavalBattle?.completedShipIdsThisRound).toContain("attacker");
    expect(result.state.scene.activeNavalBattle?.currentShipId).toBe("other");
  });

  it("destroys a zero-hp army through the normal army lifecycle and cleans its land battle", () => {
    const result = processor([6, 6, 6]).execute(context("leader", state(5)), envelope("leader", {
      type: "NAVAL_SHORE_BOMBARDMENT",
      shipId: "attacker",
      armyId: "army"
    }));

    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.armies.army).toBeUndefined();
    expect(result.state.scene.battleGroups).toEqual([]);
  });

  it("fails closed when the exact broadside resolver is unavailable", () => {
    const failClosed = new CommandProcessor(
      () => new Date(),
      cellForPosition,
      centerForCell,
      () => new Set(),
      () => 1,
      () => new Set(["army"])
    );
    expect(failClosed.execute(context("leader"), envelope("leader", {
      type: "NAVAL_SHORE_BOMBARDMENT",
      shipId: "attacker",
      armyId: "army"
    }))).toEqual({ status: "REJECTED", reason: "OUTSIDE_BROADSIDE_SECTOR" });
  });

  it("uses ship-side leader authorization", () => {
    expect(processor().execute(context("member"), envelope("member", {
      type: "NAVAL_SHORE_BOMBARDMENT",
      shipId: "attacker",
      armyId: "army"
    }))).toEqual({ status: "REJECTED", reason: "NOT_SIDE_LEADER" });
  });
});
