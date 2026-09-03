import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import {
  COMMAND_PROTOCOL_VERSION,
  type ArmyCommand,
  type NavalBattleState,
  type SceneState,
  type ShipState
} from "../shared/types";
import { CommandProcessor, type CommandContext, type CommandState } from "./commandProcessor";
import { validateArmyCommand } from "./commandValidation";

const centerForCell = (cell: { x: number; y: number }) => ({
  x: cell.x * 100 + 50,
  y: cell.y * 100 + 50
});
const cellForPosition = (position: { x: number; y: number }) => ({
  x: Math.floor(position.x / 100),
  y: Math.floor(position.y / 100)
});

function inBattleShip(sideId: string, classId: "BATTLESHIP" | "CRUISER", facing: ShipState["facing"], battleId = "naval-1"): ShipState {
  return {
    ...createRegisteredShip(sideId, classId, facing),
    status: "IN_NAVAL_BATTLE",
    battleId
  };
}

function battle(): NavalBattleState {
  return {
    version: 1,
    id: "naval-1",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [
      { x: 1, y: 1 },
      { x: 1, y: 0 },
      { x: 2, y: 1 },
      { x: 2, y: 0 }
    ],
    participantShipIds: ["ship", "enemy"],
    snapshots: {
      ship: { shipId: "ship", strategicCell: { x: 1, y: 1 }, strategicPosition: centerForCell({ x: 1, y: 1 }), strategicFacing: "NORTH" },
      enemy: { shipId: "enemy", strategicCell: { x: 2, y: 1 }, strategicPosition: centerForCell({ x: 2, y: 1 }), strategicFacing: "NORTH" }
    },
    initiative: [
      { shipId: "ship", initialRoll: 15, bonus: 2, total: 17, tieBreakRolls: [] },
      { shipId: "enemy", initialRoll: 12, bonus: 0, total: 12, tieBreakRolls: [] }
    ],
    roundNumber: 1,
    currentShipId: "ship",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { ship: 2, enemy: 3 },
    actionUsedByShip: { ship: false, enemy: false },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 3,
    startedAt: 1,
    revision: 4
  };
}

function scene(): SceneState {
  return {
    version: 6,
    revision: 3,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      { id: "red", name: "Красные", color: "#f00", playerIds: ["leader", "member"], leaderPlayerIds: ["leader"], stateId: null },
      { id: "blue", name: "Синие", color: "#00f", playerIds: ["blue-leader"], leaderPlayerIds: ["blue-leader"], stateId: null }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 3, phase: "NAVAL_BATTLE" },
    ships: {
      ship: inBattleShip("red", "BATTLESHIP", "NORTH"),
      enemy: inBattleShip("blue", "CRUISER", "NORTH")
    },
    navalBattleRequests: [],
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
    items: {
      ship: { id: "ship", type: "IMAGE", name: "Петропавловск", position: centerForCell({ x: 1, y: 1 }), metadata: {} },
      enemy: { id: "enemy", type: "IMAGE", name: "Варяг", position: centerForCell({ x: 2, y: 1 }), metadata: {} }
    },
    positions: {
      ship: centerForCell({ x: 1, y: 1 }),
      enemy: centerForCell({ x: 2, y: 1 })
    }
  };
}

function envelope(playerId: string, payload: Record<string, unknown>): ArmyCommand {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: `${payload.type}-${playerId}`,
    senderPlayerId: playerId,
    senderConnectionId: `${playerId}-connection`,
    expectedRevision: 3,
    ...payload
  } as unknown as ArmyCommand;
}

function context(role: "GM" | "PLAYER", playerId: string): CommandContext {
  return {
    role,
    playerId,
    connectionId: `${playerId}-connection`,
    connectedPlayerIds: new Set([playerId]),
    state: state()
  };
}

const processor = new CommandProcessor(() => new Date("2026-09-03T12:00:00Z"), cellForPosition, centerForCell);

describe("naval tactical command validation", () => {
  it("accepts forward, left/right turn, and explicit end-turn commands", () => {
    expect(validateArmyCommand(envelope("leader", { type: "NAVAL_MOVE_FORWARD", shipId: "ship" }))).toMatchObject({ ok: true, command: { type: "NAVAL_MOVE_FORWARD", shipId: "ship" } });
    expect(validateArmyCommand(envelope("leader", { type: "NAVAL_TURN_SHIP", shipId: "ship", direction: "LEFT" }))).toMatchObject({ ok: true, command: { type: "NAVAL_TURN_SHIP", direction: "LEFT" } });
    expect(validateArmyCommand(envelope("leader", { type: "NAVAL_TURN_SHIP", shipId: "ship", direction: "RIGHT" }))).toMatchObject({ ok: true, command: { type: "NAVAL_TURN_SHIP", direction: "RIGHT" } });
    expect(validateArmyCommand(envelope("leader", { type: "END_NAVAL_SHIP_TURN", shipId: "ship" }))).toMatchObject({ ok: true, command: { type: "END_NAVAL_SHIP_TURN", shipId: "ship" } });
  });

  it("rejects an unknown turn direction", () => {
    expect(validateArmyCommand(envelope("leader", { type: "NAVAL_TURN_SHIP", shipId: "ship", direction: "BACK" }))).toMatchObject({ ok: false, reason: "INVALID_COMMAND" });
  });
});

describe("naval tactical command processing", () => {
  it("moves the active ship exactly one cell forward and spends one tactical movement point", () => {
    const result = processor.execute(context("PLAYER", "leader"), envelope("leader", { type: "NAVAL_MOVE_FORWARD", shipId: "ship" }));
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.positions?.ship).toEqual(centerForCell({ x: 1, y: 0 }));
    expect(result.state.scene.activeNavalBattle?.movementRemainingByShip.ship).toBe(1);
    expect(result.state.scene.activeNavalBattle?.currentShipId).toBe("ship");
    expect(result.state.scene.ships?.ship.facing).toBe("NORTH");
  });

  it("turns left or right in place and spends one tactical movement point", () => {
    const left = processor.execute(context("PLAYER", "leader"), envelope("leader", { type: "NAVAL_TURN_SHIP", shipId: "ship", direction: "LEFT" }));
    expect(left.status).toBe("ACCEPTED");
    if (left.status !== "ACCEPTED") return;
    expect(left.state.scene.ships?.ship.facing).toBe("WEST");
    expect(left.state.scene.ships?.ship.revision).toBe(2);
    expect(left.state.scene.activeNavalBattle?.movementRemainingByShip.ship).toBe(1);
    expect(left.state.positions?.ship).toEqual(centerForCell({ x: 1, y: 1 }));

    const right = processor.execute(context("GM", "gm"), envelope("gm", { type: "NAVAL_TURN_SHIP", shipId: "ship", direction: "RIGHT" }));
    expect(right.status).toBe("ACCEPTED");
    if (right.status !== "ACCEPTED") return;
    expect(right.state.scene.ships?.ship.facing).toBe("EAST");
  });

  it("ends a movement-only turn explicitly and advances initiative", () => {
    const result = processor.execute(context("PLAYER", "leader"), envelope("leader", { type: "END_NAVAL_SHIP_TURN", shipId: "ship" }));
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.activeNavalBattle?.completedShipIdsThisRound).toContain("ship");
    expect(result.state.scene.activeNavalBattle?.currentShipId).toBe("enemy");
  });

  it("uses the same ship-control authorization as strategic routing", () => {
    expect(processor.execute(context("PLAYER", "member"), envelope("member", { type: "NAVAL_MOVE_FORWARD", shipId: "ship" }))).toEqual({
      status: "REJECTED",
      reason: "NOT_SIDE_LEADER"
    });
  });

  it("rejects movement for a ship that is not currently active", () => {
    const commandState = state();
    if (commandState.scene.activeNavalBattle) commandState.scene.activeNavalBattle.currentShipId = "enemy";
    const result = processor.execute(
      { ...context("PLAYER", "leader"), state: commandState },
      envelope("leader", { type: "NAVAL_MOVE_FORWARD", shipId: "ship" })
    );
    expect(result).toEqual({ status: "REJECTED", reason: "SHIP_NOT_ACTIVE" });
  });
});
