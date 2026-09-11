import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { resolvePlannedShipRoutes } from "../naval/ships/shipMovementPhase";
import { notificationMessage } from "../owlbear/notifications";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type ArmyCommand, type GridCellCoord, type NavalBattleState, type SceneState, type Vector2 } from "../shared/types";
import { CommandProcessor, type CommandState } from "./commandProcessor";

const center = (cell: GridCellCoord): Vector2 => ({ x: cell.x * 100 + 50, y: cell.y * 100 + 50 });
const cellForPosition = (position: Vector2): GridCellCoord => ({ x: Math.floor(position.x / 100), y: Math.floor(position.y / 100) });
const positionForCell = (cell: GridCellCoord): Vector2 => center(cell);

function baseScene(): SceneState {
  return {
    version: 6,
    revision: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
    sides: [
      { id: "red", name: "Red", color: "#f00", playerIds: ["leader"], leaderPlayerIds: ["leader"], stateId: null },
      { id: "blue", name: "Blue", color: "#00f", playerIds: [], leaderPlayerIds: [], stateId: null }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: {
      version: 1,
      revision: 1,
      cells: {
        "0,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "0,-1": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "1,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }
      }
    },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 3, phase: "MOVEMENT" },
    ships: {},
    navalBattleRequests: [],
    transportEmbarkRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

function battle(): NavalBattleState {
  return {
    version: 1,
    id: "naval-1",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [{ x: 0, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 0 }],
    participantShipIds: ["ship", "enemy"],
    snapshots: {
      ship: { shipId: "ship", strategicCell: { x: 0, y: 0 }, strategicPosition: center({ x: 0, y: 0 }), strategicFacing: "NORTH" },
      enemy: { shipId: "enemy", strategicCell: { x: 1, y: 0 }, strategicPosition: center({ x: 1, y: 0 }), strategicFacing: "WEST" }
    },
    initiative: [
      { shipId: "ship", initialRoll: 15, bonus: 2, total: 17, tieBreakRolls: [] },
      { shipId: "enemy", initialRoll: 10, bonus: 2, total: 12, tieBreakRolls: [] }
    ],
    roundNumber: 1,
    currentShipId: "ship",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { ship: 3, enemy: 3 },
    actionUsedByShip: { ship: false, enemy: false },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 3,
    startedAt: 1,
    revision: 1
  };
}

describe("ship cell occupancy", () => {
  it("rejects a tactical move into a cell occupied by any other live ship without spending movement", () => {
    const scene = baseScene();
    scene.turn.phase = "POST_MOVEMENT";
    scene.ships = {
      ship: { ...createRegisteredShip("red", "CRUISER", "NORTH"), status: "IN_NAVAL_BATTLE", battleId: "naval-1" },
      enemy: { ...createRegisteredShip("blue", "CRUISER", "WEST"), status: "IN_NAVAL_BATTLE", battleId: "naval-1" },
      blocker: createRegisteredShip("red", "HOSPITAL", "SOUTH")
    };
    scene.activeNavalBattle = battle();
    const state: CommandState = {
      scene,
      armies: {},
      barriers: {},
      items: {},
      positions: {
        ship: center({ x: 0, y: 0 }),
        enemy: center({ x: 1, y: 0 }),
        blocker: center({ x: 0, y: -1 })
      }
    };
    const processor = new CommandProcessor(() => new Date("2026-09-11T06:00:00Z"), cellForPosition, positionForCell);
    const command: ArmyCommand = {
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: "occupied-tactical",
      senderPlayerId: "leader",
      senderConnectionId: "leader-connection",
      expectedRevision: 1,
      type: "NAVAL_MOVE_FORWARD",
      shipId: "ship"
    };
    const result = processor.execute({ role: "PLAYER", playerId: "leader", connectionId: "leader-connection", connectedPlayerIds: new Set(["leader"]), state }, command);
    expect(result).toEqual({ status: "REJECTED", reason: "SHIP_CELL_OCCUPIED" });
    expect(state.positions?.ship).toEqual(center({ x: 0, y: 0 }));
    expect(state.scene.activeNavalBattle?.movementRemainingByShip.ship).toBe(3);
  });

  it("rejects strategic resolution when a planned ship would finish in another live ship's cell", () => {
    const scene = baseScene();
    scene.ships = {
      ship: { ...createRegisteredShip("red", "CRUISER", "NORTH"), plannedRoute: [{ x: 0, y: -1 }], movementSpentThisTurn: true },
      blocker: createRegisteredShip("blue", "BATTLESHIP", "SOUTH")
    };
    const positions: Record<string, Vector2> = {
      ship: center({ x: 0, y: 0 }),
      blocker: center({ x: 0, y: -1 })
    };
    const result = resolvePlannedShipRoutes(scene, {}, positions, cellForPosition, positionForCell);
    expect(result).toEqual({ ok: false, reason: "SHIP_CELL_OCCUPIED" });
    expect(positions.ship).toEqual(center({ x: 0, y: 0 }));
    expect(scene.ships?.ship?.plannedRoute).toEqual([{ x: 0, y: -1 }]);
  });

  it("shows a clear Russian error for an occupied ship cell", () => {
    expect(notificationMessage("SHIP_CELL_OCCUPIED")).toBe("Клетка занята другим кораблём.");
  });
});
