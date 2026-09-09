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
import { validateArmyCommand } from "./commandValidation";

function navalShip(sideId: string, classId: ShipState["classId"], facing: ShipState["facing"] = "NORTH"): ShipState {
  return {
    ...createRegisteredShip(sideId, classId, facing),
    status: "IN_NAVAL_BATTLE",
    battleId: "battle"
  };
}

function activeBattle(): NavalBattleState {
  return {
    version: 1,
    id: "battle",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 7, y: 5 }],
    participantShipIds: ["attacker", "target", "next"],
    snapshots: {},
    initiative: [
      { shipId: "attacker", initialRoll: 20, bonus: 0, total: 20, tieBreakRolls: [] },
      { shipId: "target", initialRoll: 15, bonus: 0, total: 15, tieBreakRolls: [] },
      { shipId: "next", initialRoll: 10, bonus: 0, total: 10, tieBreakRolls: [] }
    ],
    roundNumber: 1,
    currentShipId: "attacker",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { attacker: 3, target: 2, next: 3 },
    actionUsedByShip: { attacker: false, target: false, next: false },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 4,
    startedAt: 1,
    revision: 1
  };
}

function state(targetSide = "blue", targetHp = 30): CommandState {
  const target = { ...navalShip(targetSide, "BATTLESHIP"), hp: targetHp };
  const scene: SceneState = {
    version: 6,
    revision: 4,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      { id: "red", name: "Красные", color: "#f00", playerIds: ["red-leader"], leaderPlayerIds: ["red-leader"], stateId: null },
      { id: "blue", name: "Синие", color: "#00f", playerIds: ["blue-leader"], leaderPlayerIds: ["blue-leader"], stateId: null },
      { id: "ally", name: "Союзники", color: "#0f0", playerIds: ["ally-leader"], leaderPlayerIds: ["ally-leader"], stateId: null }
    ],
    states: [],
    relations: { red: { ally: "ALLY", blue: "ENEMY" } },
    battleGroups: [],
    terrain: {
      ...structuredClone(DEFAULT_TERRAIN),
      defaultTerrainId: "sea",
      types: {
        ...structuredClone(DEFAULT_TERRAIN.types),
        sea: { id: "sea", name: "Море", movementCostUnits: 1, enabled: true, movementDomains: ["SEA"], blocksNavalLos: false }
      }
    },
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 4, phase: "POST_MOVEMENT" },
    ships: {
      attacker: navalShip("red", "CRUISER"),
      target,
      next: navalShip("blue", "CRUISER")
    },
    navalBattleRequests: [],
    transportEmbarkRequests: [],
    activeNavalBattle: activeBattle(),
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
      target: { x: 750, y: 550 },
      next: { x: 850, y: 550 }
    }
  };
}

function command(playerId = "red-leader", confirmed = false): ArmyCommand {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: "broadside",
    senderPlayerId: playerId,
    senderConnectionId: `${playerId}-connection`,
    expectedRevision: 4,
    type: "NAVAL_BROADSIDE_ATTACK",
    shipId: "attacker",
    targetShipId: "target",
    friendlyFireConfirmed: confirmed
  } as ArmyCommand;
}

function context(commandState: CommandState, role: "GM" | "PLAYER" = "PLAYER", playerId = "red-leader"): CommandContext {
  return {
    role,
    playerId,
    connectionId: `${playerId}-connection`,
    connectedPlayerIds: new Set([playerId]),
    state: commandState
  };
}

function processor(rolls: number[] = [6, 4]): CommandProcessor {
  const queue = [...rolls];
  return new CommandProcessor(
    () => new Date(),
    (position: Vector2) => ({ x: Math.floor(position.x / 100), y: Math.floor(position.y / 100) }),
    undefined,
    undefined,
    () => queue.shift() ?? 1
  );
}

describe("NAVAL_BROADSIDE_ATTACK command", () => {
  it("parses an explicit friendly-fire confirmation flag", () => {
    expect(validateArmyCommand(command())).toMatchObject({
      ok: true,
      command: {
        type: "NAVAL_BROADSIDE_ATTACK",
        shipId: "attacker",
        targetShipId: "target",
        friendlyFireConfirmed: false
      }
    });
  });

  it("lets the controlling side leader fire, applies armor damage, records the event, and advances activation", () => {
    const result = processor().execute(context(state()), command());
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;

    expect(result.state.scene.ships?.target).toMatchObject({ hp: 23 });
    expect(result.state.scene.activeNavalBattle?.currentShipId).toBe("target");
    expect(result.state.scene.activeNavalBattle?.events).toContainEqual(expect.objectContaining({
      type: "BROADSIDE_ATTACK",
      attackerShipId: "attacker",
      targetShipId: "target",
      rolledDamage: 10,
      armor: 3,
      damage: 7
    }));
  });

  it("enforces the ironclad adjacent-only port/starboard arc in the authoritative command", () => {
    const adjacent = state();
    adjacent.scene.ships!.attacker = navalShip("red", "IRONCLAD", "NORTH");
    adjacent.positions!.target = { x: 650, y: 550 };

    const closeResult = processor([6, 5, 4]).execute(context(adjacent), command());
    expect(closeResult.status).toBe("ACCEPTED");
    if (closeResult.status !== "ACCEPTED") return;
    expect(closeResult.state.scene.ships?.target?.hp).toBe(15);
    expect(closeResult.state.scene.activeNavalBattle?.events).toContainEqual(expect.objectContaining({
      type: "BROADSIDE_ATTACK",
      attackerShipId: "attacker",
      targetShipId: "target",
      rolledDamage: 15,
      armor: 0,
      damage: 15,
      special: true
    }));

    const distant = state();
    distant.scene.ships!.attacker = navalShip("red", "IRONCLAD", "NORTH");
    expect(processor([6, 5, 4]).execute(context(distant), command())).toEqual({
      status: "REJECTED",
      reason: "OUTSIDE_BROADSIDE_SECTOR"
    });

    const bow = state();
    bow.scene.ships!.attacker = navalShip("red", "IRONCLAD", "NORTH");
    bow.positions!.target = { x: 550, y: 450 };
    expect(processor([6, 5, 4]).execute(context(bow), command())).toEqual({
      status: "REJECTED",
      reason: "OUTSIDE_BROADSIDE_SECTOR"
    });
  });

  it("requires confirmation for same-side or allied participants but not enemy targets", () => {
    expect(processor().execute(context(state("ally")), command())).toEqual({
      status: "REJECTED",
      reason: "FRIENDLY_FIRE_CONFIRMATION_REQUIRED"
    });
    expect(processor().execute(context(state("ally")), command("red-leader", true)).status).toBe("ACCEPTED");

    expect(processor().execute(context(state("red")), command())).toEqual({
      status: "REJECTED",
      reason: "FRIENDLY_FIRE_CONFIRMATION_REQUIRED"
    });
    expect(processor().execute(context(state("red")), command("red-leader", true)).status).toBe("ACCEPTED");

    expect(processor().execute(context(state("blue")), command()).status).toBe("ACCEPTED");
  });

  it("removes a lethally damaged ship from scene and active battle immediately", () => {
    const result = processor([6, 6]).execute(context(state("blue", 5)), command());
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;

    expect(result.state.scene.ships?.target).toBeUndefined();
    expect(result.state.scene.activeNavalBattle?.participantShipIds).not.toContain("target");
    expect(result.state.scene.activeNavalBattle?.initiative.map((entry) => entry.shipId)).not.toContain("target");
    expect(result.state.scene.activeNavalBattle?.currentShipId).toBe("next");
  });

  it("rejects a target that is not a participant in the active naval battle", () => {
    const commandState = state();
    const battle = commandState.scene.activeNavalBattle;
    if (!battle) throw new Error("Expected active naval battle fixture");
    battle.participantShipIds = ["attacker", "next"];
    expect(processor().execute(context(commandState), command())).toEqual({
      status: "REJECTED",
      reason: "TARGET_NOT_IN_NAVAL_BATTLE"
    });
  });
});
