import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import {
  COMMAND_PROTOCOL_VERSION,
  type ArmyCommand,
  type ArmyState,
  type NavalBattleState,
  type SceneState
} from "../shared/types";
import { CommandProcessor, type CommandContext, type CommandState } from "./commandProcessor";

function activeBattle(): NavalBattleState {
  return {
    version: 1,
    id: "naval-1",
    requestId: "request-1",
    initiatorSideId: "red",
    areaCells: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    participantShipIds: ["red-ship", "blue-ship"],
    snapshots: {
      "red-ship": {
        shipId: "red-ship",
        strategicCell: { x: 0, y: 0 },
        strategicPosition: { x: 50, y: 50 },
        strategicFacing: "EAST"
      },
      "blue-ship": {
        shipId: "blue-ship",
        strategicCell: { x: 1, y: 0 },
        strategicPosition: { x: 150, y: 50 },
        strategicFacing: "WEST"
      }
    },
    initiative: [
      { shipId: "red-ship", initialRoll: 18, bonus: 2, total: 20, tieBreakRolls: [] },
      { shipId: "blue-ship", initialRoll: 12, bonus: 0, total: 12, tieBreakRolls: [] }
    ],
    roundNumber: 1,
    currentShipId: "red-ship",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { "red-ship": 3, "blue-ship": 3 },
    actionUsedByShip: { "red-ship": false, "blue-ship": false },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 4,
    startedAt: 1,
    revision: 1
  };
}

function state(): CommandState {
  const redShip = createRegisteredShip("red", "CRUISER", "EAST");
  redShip.status = "IN_NAVAL_BATTLE";
  redShip.battleId = "naval-1";
  const blueShip = createRegisteredShip("blue", "CRUISER", "WEST");
  blueShip.status = "IN_NAVAL_BATTLE";
  blueShip.battleId = "naval-1";

  const scene: SceneState = {
    version: 6,
    revision: 5,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      { id: "red", name: "Красные", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: null },
      { id: "blue", name: "Синие", color: "#00f", playerIds: [], leaderPlayerIds: [], stateId: null }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 4, phase: "POST_MOVEMENT" },
    ships: { "red-ship": redShip, "blue-ship": blueShip },
    navalBattleRequests: [
      { id: "request-1", initiatingShipId: "red-ship", targetShipId: "blue-ship", createdOnTurn: 4 }
    ],
    activeNavalBattle: activeBattle(),
    navalBattleHistory: [],
    navalRevealUntilTurn: {
      red: { "blue-ship": 5 },
      blue: { "red-ship": 5 }
    }
  };

  return {
    scene,
    armies: {},
    barriers: {},
    items: {
      "red-ship": { id: "red-ship", type: "IMAGE", position: { x: 50, y: 50 }, metadata: {} },
      "blue-ship": { id: "blue-ship", type: "IMAGE", position: { x: 150, y: 50 }, metadata: {} }
    }
  };
}

function command(): ArmyCommand {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: "delete-red",
    senderPlayerId: "gm",
    senderConnectionId: "gm-connection",
    expectedRevision: 5,
    type: "DELETE_SIDE",
    sideId: "red",
    strategy: "UNREGISTER_ARMIES"
  };
}

function context(): CommandContext {
  return {
    role: "GM",
    playerId: "gm",
    connectionId: "gm-connection",
    connectedPlayerIds: new Set(["gm"]),
    state: state()
  };
}

describe("DELETE_SIDE naval cleanup", () => {
  it("destroys foreign cargo when deleting the side that owns its transport", () => {
    const current = state();
    const transport = createRegisteredShip("red", "TRANSPORT", "EAST");
    transport.embarkedArmyId = "blue-army";
    current.scene.ships = { "red-ship": transport, "blue-ship": current.scene.ships?.["blue-ship"]! };
    current.scene.activeNavalBattle = null;
    current.scene.navalBattleRequests = [];
    current.scene.turn.phase = "MOVEMENT";
    current.armies["blue-army"] = {
      version: 4,
      registered: true,
      sideId: "blue",
      status: "READY",
      overrides: {},
      route: [],
      plannedRoute: {
        startCell: { x: 0, y: 0 },
        executeOnTurn: 4,
        cells: [],
        totalCostUnits: 0,
        validatedRevision: 5,
        requiresReplan: false
      },
      movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
      health: { hp: 50, maxHp: 50 },
      supply: { supplied: true, checkedOnTurn: 4 },
      disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
      embarkedOnShipId: "red-ship",
      currentWaypointIndex: 0,
      segmentProgressCells: 0,
      ignoresMovementBarriers: false,
      ignoresVisionBarriers: false,
      revision: 1
    } satisfies ArmyState;

    const result = new CommandProcessor().execute(
      { ...context(), state: current },
      command()
    );

    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.ships?.["red-ship"]).toBeUndefined();
    expect(result.state.armies["blue-army"]).toBeUndefined();
  });

  it("unregisters ships of the deleted side and cleans active naval references", () => {
    const result = new CommandProcessor().execute(context(), command());
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;

    expect(result.state.scene.revision).toBe(6);
    expect(result.state.scene.sides.map((side) => side.id)).toEqual(["blue"]);
    expect(result.state.scene.ships?.["red-ship"]).toBeUndefined();
    expect(result.state.scene.ships?.["blue-ship"]).toBeDefined();
    expect(result.state.scene.navalBattleRequests).toEqual([]);
    expect(result.state.scene.navalRevealUntilTurn?.blue?.["red-ship"]).toBeUndefined();
    expect(result.state.scene.navalRevealUntilTurn?.red).toBeUndefined();
    expect(result.state.scene.activeNavalBattle).toMatchObject({
      participantShipIds: ["blue-ship"],
      currentShipId: "blue-ship"
    });
    expect(result.state.scene.activeNavalBattle?.initiative.map((entry) => entry.shipId))
      .toEqual(["blue-ship"]);
  });
});
