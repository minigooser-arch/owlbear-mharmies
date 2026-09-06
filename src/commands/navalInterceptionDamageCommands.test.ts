import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import {
  COMMAND_PROTOCOL_VERSION,
  type ArmyCommand,
  type NavalBattleState,
  type SceneState,
  type ShipState,
  type Vector2
} from "../shared/types";
import { CommandProcessor, type CommandContext, type CommandState } from "./commandProcessor";

function navalShip(sideId: string, classId: ShipState["classId"]): ShipState {
  return {
    ...createRegisteredShip(sideId, classId, "NORTH"),
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
    areaCells: [{ x: 5, y: 5 }, { x: 7, y: 5 }, { x: 9, y: 5 }],
    participantShipIds: ["attacker", "cruiser", "next"],
    snapshots: {},
    initiative: [
      { shipId: "attacker", initialRoll: 20, bonus: 2, total: 22, tieBreakRolls: [] },
      { shipId: "next", initialRoll: 18, bonus: 0, total: 18, tieBreakRolls: [] },
      { shipId: "cruiser", initialRoll: 15, bonus: 2, total: 17, tieBreakRolls: [] }
    ],
    roundNumber: 4,
    currentShipId: "attacker",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { attacker: 3, cruiser: 3, next: 2 },
    actionUsedByShip: { attacker: false, cruiser: false, next: false },
    interceptions: {
      cruiser: { cruiserShipId: "cruiser", activatedRoundNumber: 3 }
    },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 8,
    startedAt: 1,
    revision: 7
  };
}

function state(): CommandState {
  const terrain = structuredClone(DEFAULT_TERRAIN);
  terrain.defaultTerrainId = "sea";
  terrain.types.sea = {
    id: "sea",
    name: "Море",
    movementCostUnits: 2,
    enabled: true,
    movementDomains: ["SEA"],
    blocksNavalLos: false
  };
  const scene: SceneState = {
    version: 6,
    revision: 12,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      { id: "red", name: "Красные", color: "#f00", playerIds: ["red"], leaderPlayerIds: ["red"], stateId: null },
      { id: "blue", name: "Синие", color: "#00f", playerIds: ["blue"], leaderPlayerIds: ["blue"], stateId: null }
    ],
    states: [],
    relations: { red: { blue: "ENEMY" } },
    battleGroups: [],
    terrain,
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 8, phase: "POST_MOVEMENT" },
    ships: {
      attacker: navalShip("red", "CRUISER"),
      cruiser: navalShip("blue", "CRUISER"),
      next: navalShip("blue", "BATTLESHIP")
    },
    navalBattleRequests: [],
    transportEmbarkRequests: [],
    activeNavalBattle: battle(),
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
  return {
    scene,
    armies: {},
    barriers: {},
    items: {},
    positions: {
      attacker: { x: 550, y: 550 },
      cruiser: { x: 750, y: 550 },
      next: { x: 950, y: 550 }
    }
  };
}

function command(): ArmyCommand {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: "damage-interception",
    senderPlayerId: "red",
    senderConnectionId: "red-connection",
    expectedRevision: 12,
    type: "NAVAL_BROADSIDE_ATTACK",
    shipId: "attacker",
    targetShipId: "cruiser",
    friendlyFireConfirmed: false
  };
}

function context(): CommandContext {
  return {
    role: "PLAYER",
    playerId: "red",
    connectionId: "red-connection",
    connectedPlayerIds: new Set(["red"]),
    state: state()
  };
}

describe("interception removal after damage", () => {
  it("removes an unused cruiser zone after positive actual HP loss and logs the removal", () => {
    const rolls = [3, 3];
    const processor = new CommandProcessor(
      () => new Date("2026-09-06T10:10:00Z"),
      (position: Vector2) => ({ x: Math.floor(position.x / 100), y: Math.floor(position.y / 100) }),
      undefined,
      undefined,
      () => rolls.shift() ?? 1
    );

    const result = processor.execute(context(), command());
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;

    expect(result.state.scene.ships?.cruiser?.hp).toBe(20);
    const active = result.state.scene.activeNavalBattle;
    expect(active?.currentShipId).toBe("next");
    expect(active?.interceptions?.cruiser).toBeUndefined();
    expect(active?.events).toContainEqual(expect.objectContaining({
      type: "INTERCEPTION_REMOVED_BY_DAMAGE",
      cruiserShipId: "cruiser",
      actualHpLoss: 5
    }));
  });
});
