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
    ships: { ship: createRegisteredShip("red", "CRUISER", "NORTH") },
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
      ship: { id: "ship", type: "IMAGE", name: "Аврора", position: { x: 0, y: 0 }, metadata: {} }
    }
  };
}

function command(detectionOverride: number | null, senderPlayerId = "gm", shipId = "ship"): ArmyCommand {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: `detection-${String(detectionOverride)}`,
    senderPlayerId,
    senderConnectionId: `${senderPlayerId}-connection`,
    expectedRevision: 3,
    type: "SET_SHIP_DETECTION_OVERRIDE",
    shipId,
    detectionOverride
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

describe("SET_SHIP_DETECTION_OVERRIDE validation", () => {
  it.each([0, 1, 4.5, 12])("accepts non-negative finite override %s", (value) => {
    expect(validateArmyCommand(command(value))).toMatchObject({
      ok: true,
      command: { type: "SET_SHIP_DETECTION_OVERRIDE", shipId: "ship", detectionOverride: value }
    });
  });

  it("accepts null to restore the scene default", () => {
    expect(validateArmyCommand(command(null))).toMatchObject({
      ok: true,
      command: { type: "SET_SHIP_DETECTION_OVERRIDE", shipId: "ship", detectionOverride: null }
    });
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid override %s", (value) => {
    expect(validateArmyCommand(command(value))).toMatchObject({ ok: false, reason: "INVALID_COMMAND" });
  });
});

describe("SET_SHIP_DETECTION_OVERRIDE processing", () => {
  const processor = new CommandProcessor();

  it("lets the GM set an exact override and increments ship/scene revisions", () => {
    const result = processor.execute(context("GM", "gm"), command(7.5));
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.revision).toBe(4);
    expect(result.state.scene.ships?.ship).toMatchObject({ detectionOverride: 7.5, revision: 2 });
  });

  it("lets the GM reset the override to the shared scene default", () => {
    const ctx = context("GM", "gm");
    const ship = ctx.state.scene.ships?.ship;
    if (!ship) throw new Error("Missing ship fixture");
    ship.detectionOverride = 9;
    const result = processor.execute(ctx, command(null));
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.ships?.ship).toMatchObject({ detectionOverride: null, revision: 2 });
  });

  it("rejects a missing ship", () => {
    expect(processor.execute(context("GM", "gm"), command(5, "gm", "missing"))).toEqual({
      status: "REJECTED",
      reason: "SHIP_NOT_FOUND"
    });
  });

  it("remains GM-only even for the owning faction leader", () => {
    expect(processor.execute(context("PLAYER", "leader"), command(5, "leader"))).toEqual({
      status: "REJECTED",
      reason: "GM_ONLY"
    });
  });
});
