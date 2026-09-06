import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import {
  COMMAND_PROTOCOL_VERSION,
  type ArmyCommand,
  type GridCellCoord,
  type NavalBattleState,
  type SceneState,
  type ShipState,
  type Vector2
} from "../shared/types";
import { CommandProcessor, type CommandContext, type CommandState } from "./commandProcessor";

const centerForCell = (cell: GridCellCoord): Vector2 => ({ x: cell.x * 100 + 50, y: cell.y * 100 + 50 });
const cellForPosition = (position: Vector2): GridCellCoord => ({
  x: Math.floor(position.x / 100),
  y: Math.floor(position.y / 100)
});

function inBattleShip(sideId: string, classId: ShipState["classId"], facing: ShipState["facing"]): ShipState {
  return {
    ...createRegisteredShip(sideId, classId, facing),
    status: "IN_NAVAL_BATTLE",
    battleId: "battle"
  };
}

function battle(): NavalBattleState {
  return {
    version: 1,
    id: "battle",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [
      { x: 5, y: 5 },
      { x: 6, y: 3 },
      { x: 7, y: 3 },
      { x: 10, y: 10 }
    ],
    participantShipIds: ["cruiser", "target", "next"],
    snapshots: {},
    initiative: [
      { shipId: "cruiser", initialRoll: 20, bonus: 2, total: 22, tieBreakRolls: [] },
      { shipId: "target", initialRoll: 15, bonus: 1, total: 16, tieBreakRolls: [] },
      { shipId: "next", initialRoll: 10, bonus: 0, total: 10, tieBreakRolls: [] }
    ],
    roundNumber: 4,
    currentShipId: "target",
    completedShipIdsThisRound: ["cruiser"],
    movementRemainingByShip: { cruiser: 0, target: 4, next: 2 },
    actionUsedByShip: { cruiser: true, target: false, next: false },
    interceptions: {
      cruiser: { cruiserShipId: "cruiser", activatedRoundNumber: 3 }
    },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 8,
    startedAt: 1,
    revision: 10
  };
}

function scene(): SceneState {
  const terrain = structuredClone(DEFAULT_TERRAIN);
  terrain.types.sea = {
    id: "sea",
    name: "Море",
    movementCostUnits: 2,
    enabled: true,
    movementDomains: ["SEA"],
    blocksNavalLos: false
  };
  return {
    version: 6,
    revision: 20,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      { id: "red", name: "Красные", color: "#f00", playerIds: ["red"], leaderPlayerIds: ["red"], stateId: null },
      { id: "blue", name: "Синие", color: "#00f", playerIds: ["blue"], leaderPlayerIds: ["blue"], stateId: null }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain,
    gridMap: {
      version: 1,
      revision: 0,
      cells: {
        "6,4": {
          terrainId: "sea",
          impassable: false,
          factionTerritoryIds: [],
          recognizedStateId: null,
          deFactoStateId: null
        }
      }
    },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 8, phase: "POST_MOVEMENT" },
    ships: {
      cruiser: inBattleShip("red", "CRUISER", "NORTH"),
      target: inBattleShip("blue", "IRONCLAD", "EAST"),
      next: inBattleShip("blue", "BATTLESHIP", "SOUTH")
    },
    navalBattleRequests: [],
    transportEmbarkRequests: [],
    activeNavalBattle: battle(),
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

function state(): CommandState {
  return {
    scene: scene(),
    armies: {},
    barriers: {},
    items: {},
    positions: {
      cruiser: centerForCell({ x: 5, y: 5 }),
      target: centerForCell({ x: 6, y: 3 }),
      next: centerForCell({ x: 10, y: 10 })
    }
  };
}

function command(): ArmyCommand {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: "move-into-interception",
    senderPlayerId: "blue",
    senderConnectionId: "blue-connection",
    expectedRevision: 20,
    type: "NAVAL_MOVE_FORWARD",
    shipId: "target"
  };
}

function context(): CommandContext {
  return {
    role: "PLAYER",
    playerId: "blue",
    connectionId: "blue-connection",
    connectedPlayerIds: new Set(["blue"]),
    state: state()
  };
}

describe("tactical movement through cruiser interception", () => {
  it("keeps the entered cell, resolves 2d6 with armor, consumes the zone and immediately ends the target activation", () => {
    const rolls = [3, 3];
    const processor = new CommandProcessor(
      () => new Date("2026-09-06T10:00:00Z"),
      cellForPosition,
      centerForCell,
      () => new Set(),
      () => rolls.shift() ?? 1
    );

    const result = processor.execute(context(), command());
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;

    expect(result.state.positions?.target).toEqual(centerForCell({ x: 7, y: 3 }));
    expect(result.state.scene.ships?.target?.hp).toBe(21);
    const active = result.state.scene.activeNavalBattle;
    expect(active?.interceptions?.cruiser).toBeUndefined();
    expect(active?.movementRemainingByShip.target).toBe(0);
    expect(active?.actionUsedByShip.target).toBe(true);
    expect(active?.completedShipIdsThisRound).toContain("target");
    expect(active?.currentShipId).toBe("next");
    expect(active?.events).toContainEqual(expect.objectContaining({
      type: "INTERCEPTION_TRIGGERED",
      cruiserShipId: "cruiser",
      targetShipId: "target",
      rolledDamage: 6,
      armor: 2,
      damage: 4
    }));
  });
});
