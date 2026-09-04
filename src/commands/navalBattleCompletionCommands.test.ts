import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { authorizeArmyCommand } from "../shared/permissions";
import {
  COMMAND_PROTOCOL_VERSION,
  type ArmyCommand,
  type NavalBattleState,
  type NavalSceneState
} from "../shared/types";
import { CommandProcessor, type CommandState } from "./commandProcessor";
import { validateArmyCommand } from "./commandValidation";

function fixture(): CommandState {
  const ship = {
    ...createRegisteredShip("red", "CRUISER", "NORTH"),
    status: "IN_NAVAL_BATTLE" as const,
    battleId: "naval-1"
  };
  const battle: NavalBattleState = {
    version: 1,
    id: "naval-1",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    participantShipIds: ["ship"],
    snapshots: {
      ship: {
        shipId: "ship",
        strategicCell: { x: 0, y: 0 },
        strategicPosition: { x: 50, y: 50 },
        strategicFacing: "EAST"
      }
    },
    initiative: [{ shipId: "ship", initialRoll: 12, bonus: 2, total: 14, tieBreakRolls: [] }],
    roundNumber: 2,
    currentShipId: "ship",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { ship: 1 },
    actionUsedByShip: { ship: false },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 3,
    startedAt: 100,
    revision: 4
  };
  const scene: NavalSceneState = {
    version: 6,
    revision: 7,
    settings: { ...DEFAULT_SETTINGS },
    sides: [{ id: "red", name: "Красные", color: "#c62828", playerIds: ["leader"], leaderPlayerIds: ["leader"], stateId: null }],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 3, phase: "NAVAL_BATTLE" },
    ships: { ship },
    navalBattleRequests: [],
    activeNavalBattle: battle,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
  return {
    scene,
    armies: {},
    barriers: {},
    items: {
      ship: { id: "ship", type: "IMAGE", position: { x: 150, y: 50 }, rotation: 0, metadata: {} }
    },
    positions: { ship: { x: 150, y: 50 } }
  };
}

function command(senderPlayerId = "gm"): ArmyCommand {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: "complete-naval",
    senderPlayerId,
    senderConnectionId: `${senderPlayerId}-connection`,
    expectedRevision: 7,
    type: "COMPLETE_NAVAL_BATTLE"
  } as unknown as ArmyCommand;
}

describe("COMPLETE_NAVAL_BATTLE", () => {
  it("is accepted by command validation", () => {
    expect(validateArmyCommand(command())).toMatchObject({
      ok: true,
      command: { type: "COMPLETE_NAVAL_BATTLE" }
    });
  });

  it("remains GM-only", () => {
    const state = fixture();
    expect(authorizeArmyCommand({
      role: "PLAYER",
      playerId: "leader",
      armies: new Map(),
      ships: new Map(Object.entries(state.scene.ships ?? {})),
      sides: state.scene.sides,
      settings: state.scene.settings,
      connectedPlayerIds: new Set(["leader"])
    }, command("leader"))).toEqual({ allowed: false, reason: "GM_ONLY" });
  });

  it("archives the battle and restores strategic position and facing", () => {
    const processor = new CommandProcessor();
    const result = processor.execute({
      role: "GM",
      playerId: "gm",
      connectionId: "gm-connection",
      connectedPlayerIds: new Set(["gm"]),
      state: fixture()
    }, command());

    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.revision).toBe(8);
    expect(result.state.scene.turn.phase).toBe("MOVEMENT");
    expect(result.state.scene.activeNavalBattle).toBeNull();
    expect(result.state.scene.navalBattleHistory).toHaveLength(1);
    expect(result.state.scene.navalBattleHistory?.[0]).toMatchObject({
      id: "naval-1",
      status: "COMPLETED",
      currentShipId: null
    });
    expect(result.state.scene.ships?.ship).toMatchObject({
      status: "READY",
      battleId: null,
      facing: "EAST"
    });
    expect(result.state.positions?.ship).toEqual({ x: 50, y: 50 });
  });

  it("rejects completion when no naval battle is active", () => {
    const state = fixture();
    state.scene.activeNavalBattle = null;
    const result = new CommandProcessor().execute({
      role: "GM",
      playerId: "gm",
      connectionId: "gm-connection",
      connectedPlayerIds: new Set(["gm"]),
      state
    }, command());
    expect(result).toEqual({ status: "REJECTED", reason: "NO_ACTIVE_NAVAL_BATTLE" });
  });
});
