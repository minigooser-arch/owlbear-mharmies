import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type ArmyCommand, type SceneState } from "../shared/types";
import { CommandProcessor, type CommandContext, type CommandState } from "./commandProcessor";
import { validateArmyCommand } from "./commandValidation";

function scene(): SceneState {
  return {
    version: 6,
    revision: 3,
    settings: { ...DEFAULT_SETTINGS },
    sides: [{ id: "red", name: "Красные", color: "#f00", playerIds: ["leader"], leaderPlayerIds: ["leader"], stateId: null }],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: structuredClone(DEFAULT_TURN_STATE),
    ships: { ship: createRegisteredShip("red", "BATTLESHIP", "NORTH") },
    navalBattleRequests: [],
    activeNavalBattle: null,
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
      ship: { id: "ship", type: "IMAGE", name: "Петропавловск", position: { x: 0, y: 0 }, metadata: {} }
    }
  };
}

function command(hp: number, senderPlayerId = "gm"): ArmyCommand {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: `hp-${hp}`,
    senderPlayerId,
    senderConnectionId: `${senderPlayerId}-connection`,
    expectedRevision: 3,
    type: "SET_SHIP_HP",
    shipId: "ship",
    hp
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

describe("SET_SHIP_HP validation", () => {
  it.each([0, 1, 17, 30])("accepts integer hp %s", (hp) => {
    expect(validateArmyCommand(command(hp))).toMatchObject({
      ok: true,
      command: { type: "SET_SHIP_HP", shipId: "ship", hp }
    });
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid hp %s", (hp) => {
    expect(validateArmyCommand(command(hp))).toMatchObject({ ok: false, reason: "INVALID_COMMAND" });
  });
});

describe("SET_SHIP_HP processing", () => {
  const processor = new CommandProcessor();

  it("lets the GM set exact current hp and increments only ship/scene revisions", () => {
    const result = processor.execute(context("GM", "gm"), command(12));
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.revision).toBe(4);
    expect(result.state.scene.ships?.ship).toMatchObject({ hp: 12, revision: 2, classId: "BATTLESHIP" });
  });

  it("allows zero without silently unregistering the ship", () => {
    const result = processor.execute(context("GM", "gm"), command(0));
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.ships?.ship).toMatchObject({ hp: 0, revision: 2 });
  });

  it("rejects values above the class maximum", () => {
    expect(processor.execute(context("GM", "gm"), command(31))).toEqual({
      status: "REJECTED",
      reason: "INVALID_HP"
    });
  });

  it("remains GM-only even for the owning faction leader", () => {
    expect(processor.execute(context("PLAYER", "leader"), command(12, "leader"))).toEqual({
      status: "REJECTED",
      reason: "GM_ONLY"
    });
  });
});
