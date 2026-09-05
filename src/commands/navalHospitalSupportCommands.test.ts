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
import { validateArmyCommand } from "./commandValidation";

const centerForCell = (cell: GridCellCoord): Vector2 => ({ x: cell.x * 100 + 50, y: cell.y * 100 + 50 });
const cellForPosition = (position: Vector2): GridCellCoord => ({ x: Math.floor(position.x / 100), y: Math.floor(position.y / 100) });

function inBattleShip(sideId: string, classId: ShipState["classId"]): ShipState {
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
    participantShipIds: ["hospital", "target"],
    snapshots: {
      hospital: { shipId: "hospital", strategicCell: { x: 1, y: 1 }, strategicPosition: centerForCell({ x: 1, y: 1 }), strategicFacing: "NORTH" },
      target: { shipId: "target", strategicCell: { x: 2, y: 1 }, strategicPosition: centerForCell({ x: 2, y: 1 }), strategicFacing: "NORTH" }
    },
    initiative: [
      { shipId: "hospital", initialRoll: 12, bonus: 0, total: 12, tieBreakRolls: [] },
      { shipId: "target", initialRoll: 10, bonus: 1, total: 11, tieBreakRolls: [] }
    ],
    roundNumber: 1,
    currentShipId: "hospital",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { hospital: 4, target: 3 },
    actionUsedByShip: { hospital: false, target: false },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 4,
    startedAt: 1,
    revision: 1
  };
}

function scene(): SceneState {
  const target = { ...inBattleShip("red", "CRUISER"), hp: 15 };
  return {
    version: 6,
    revision: 7,
    settings: { ...DEFAULT_SETTINGS },
    sides: [{ id: "red", name: "Красные", color: "#f00", playerIds: ["leader", "member"], leaderPlayerIds: ["leader"], stateId: null }],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 4, phase: "POST_MOVEMENT" },
    ships: {
      hospital: inBattleShip("red", "HOSPITAL"),
      target
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
      hospital: { id: "hospital", type: "IMAGE", position: centerForCell({ x: 1, y: 1 }), metadata: {} },
      target: { id: "target", type: "IMAGE", position: centerForCell({ x: 2, y: 1 }), metadata: {} }
    },
    positions: {
      hospital: centerForCell({ x: 1, y: 1 }),
      target: centerForCell({ x: 2, y: 1 })
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

function context(playerId: string): CommandContext {
  return {
    role: "PLAYER",
    playerId,
    connectionId: `${playerId}-connection`,
    connectedPlayerIds: new Set([playerId]),
    state: state()
  };
}

describe("naval hospital support command", () => {
  it("parses an explicit hospital support command", () => {
    expect(validateArmyCommand(envelope("leader", {
      type: "NAVAL_HOSPITAL_SUPPORT",
      shipId: "hospital",
      targetShipId: "target"
    }))).toMatchObject({
      ok: true,
      command: { type: "NAVAL_HOSPITAL_SUPPORT", shipId: "hospital", targetShipId: "target" }
    });
  });

  it("grants deterministic 2d6 temporary hp and completes the hospital ship turn", () => {
    const rolls = [3, 4];
    const processor = new CommandProcessor(
      () => new Date("2026-09-05T08:00:00Z"),
      cellForPosition,
      centerForCell,
      () => new Set(),
      () => rolls.shift() ?? 1
    );
    const result = processor.execute(context("leader"), envelope("leader", {
      type: "NAVAL_HOSPITAL_SUPPORT",
      shipId: "hospital",
      targetShipId: "target"
    }));

    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.ships?.target).toMatchObject({ hp: 15, temporaryHp: 7 });
    expect(result.state.scene.ships?.hospital?.logisticsActionUsedOnTurn).toBe(4);
    expect(result.state.scene.activeNavalBattle?.completedShipIdsThisRound).toContain("hospital");
    expect(result.state.scene.activeNavalBattle?.currentShipId).toBe("target");
  });

  it("uses ship-side leader authorization", () => {
    const processor = new CommandProcessor(() => new Date(), cellForPosition, centerForCell);
    expect(processor.execute(context("member"), envelope("member", {
      type: "NAVAL_HOSPITAL_SUPPORT",
      shipId: "hospital",
      targetShipId: "target"
    }))).toEqual({ status: "REJECTED", reason: "NOT_SIDE_LEADER" });
  });
});
