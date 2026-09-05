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
import { CommandProcessor, type CommandContext, type CommandState } from "./commandProcessor";
import { validateArmyCommand } from "./commandValidation";

function fixture(): CommandState {
  const redShip = {
    ...createRegisteredShip("red", "CRUISER", "NORTH"),
    status: "IN_NAVAL_BATTLE" as const,
    battleId: "naval-1",
    temporaryHp: 6
  };
  const blueShip = {
    ...createRegisteredShip("blue", "BATTLESHIP", "SOUTH"),
    status: "IN_NAVAL_BATTLE" as const,
    battleId: "naval-1"
  };
  const battle: NavalBattleState = {
    version: 1,
    id: "naval-1",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    participantShipIds: ["redShip", "blueShip"],
    snapshots: {
      redShip: { shipId: "redShip", strategicCell: { x: 0, y: 0 }, strategicPosition: { x: 50, y: 50 }, strategicFacing: "NORTH" },
      blueShip: { shipId: "blueShip", strategicCell: { x: 1, y: 0 }, strategicPosition: { x: 150, y: 50 }, strategicFacing: "SOUTH" }
    },
    initiative: [
      { shipId: "redShip", initialRoll: 18, bonus: 2, total: 20, tieBreakRolls: [] },
      { shipId: "blueShip", initialRoll: 11, bonus: 0, total: 11, tieBreakRolls: [] }
    ],
    roundNumber: 1,
    currentShipId: "redShip",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { redShip: 3, blueShip: 2 },
    actionUsedByShip: { redShip: false, blueShip: false },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 4,
    startedAt: 1,
    revision: 2
  };
  const scene: NavalSceneState = {
    version: 6,
    revision: 9,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      { id: "red", name: "Красные", color: "#c62828", playerIds: ["leader"], leaderPlayerIds: ["leader"], stateId: null },
      { id: "blue", name: "Синие", color: "#1565c0", playerIds: ["blue-leader"], leaderPlayerIds: ["blue-leader"], stateId: null }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 4, phase: "POST_MOVEMENT" },
    ships: { redShip, blueShip },
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
      redShip: { id: "redShip", type: "IMAGE", position: { x: 50, y: 50 }, metadata: {} },
      blueShip: { id: "blueShip", type: "IMAGE", position: { x: 150, y: 50 }, metadata: {} }
    },
    positions: { redShip: { x: 50, y: 50 }, blueShip: { x: 150, y: 50 } }
  };
}

function command(playerId = "gm"): ArmyCommand {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: `confirm-exit-${playerId}`,
    senderPlayerId: playerId,
    senderConnectionId: `${playerId}-connection`,
    expectedRevision: 9,
    type: "CONFIRM_NAVAL_SHIP_EXIT",
    shipId: "redShip"
  } as unknown as ArmyCommand;
}

function context(role: "GM" | "PLAYER", playerId: string, state = fixture()): CommandContext {
  return {
    role,
    playerId,
    connectionId: `${playerId}-connection`,
    connectedPlayerIds: new Set([playerId]),
    state
  };
}

describe("CONFIRM_NAVAL_SHIP_EXIT", () => {
  it("is accepted by command validation", () => {
    expect(validateArmyCommand(command())).toMatchObject({
      ok: true,
      command: { type: "CONFIRM_NAVAL_SHIP_EXIT", shipId: "redShip" }
    });
  });

  it("remains GM-only because exit geometry is externally confirmed", () => {
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

  it("marks the active ship exited, clears temporary hp, and advances initiative without releasing ship lifecycle state", () => {
    const result = new CommandProcessor().execute(context("GM", "gm"), command());
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.activeNavalBattle?.exitedShipIds).toEqual(["redShip"]);
    expect(result.state.scene.activeNavalBattle?.completedShipIdsThisRound).toContain("redShip");
    expect(result.state.scene.activeNavalBattle?.currentShipId).toBe("blueShip");
    expect(result.state.scene.ships?.redShip).toMatchObject({
      status: "IN_NAVAL_BATTLE",
      battleId: "naval-1",
      temporaryHp: 0
    });
  });

  it("rejects confirming a destroyed ship", () => {
    const state = fixture();
    if (state.scene.ships?.redShip) state.scene.ships.redShip.hp = 0;
    expect(new CommandProcessor().execute(context("GM", "gm", state), command())).toEqual({
      status: "REJECTED",
      reason: "SHIP_DESTROYED"
    });
  });

  it("returns a stable reason for a duplicate confirmation", () => {
    const state = fixture();
    if (state.scene.activeNavalBattle) state.scene.activeNavalBattle.exitedShipIds = ["redShip"];
    expect(new CommandProcessor().execute(context("GM", "gm", state), command())).toEqual({
      status: "REJECTED",
      reason: "SHIP_ALREADY_EXITED"
    });
  });
});
