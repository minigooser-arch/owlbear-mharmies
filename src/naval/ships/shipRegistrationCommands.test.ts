import { describe, expect, it } from "vitest";
import { CommandProcessor, type CommandContext, type CommandState } from "../../commands/commandProcessor";
import { validateArmyCommand } from "../../commands/commandValidation";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../../shared/constants";
import type { ArmyCommand, ArmyState, NavalSceneState, SceneItemRecord } from "../../shared/types";

function army(sideId = "red"): ArmyState {
  return {
    version: 4,
    registered: true,
    sideId,
    status: "READY",
    overrides: {},
    route: [],
    plannedRoute: { startCell: { x: 0, y: 0 }, executeOnTurn: 0, cells: [], totalCostUnits: 0, validatedRevision: 0, requiresReplan: false },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    health: { hp: 50, maxHp: 50 },
    supply: { supplied: true, checkedOnTurn: 0 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    embarkedOnShipId: null,
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1
  };
}

function image(id: string, x = 0): SceneItemRecord {
  return { id, type: "IMAGE", name: id, position: { x, y: 0 }, metadata: {} };
}

function state(): CommandState {
  const terrain = structuredClone(DEFAULT_TERRAIN);
  terrain.types.sea = {
    id: "sea",
    name: "Море",
    movementCostUnits: 2,
    enabled: true,
    movementDomains: ["SEA"],
    blocksNavalLos: false
  };
  terrain.types.channel = {
    id: "channel",
    name: "Канал",
    movementCostUnits: 2,
    enabled: true,
    movementDomains: ["LAND", "SEA"],
    blocksNavalLos: false
  };

  const scene: NavalSceneState = {
    version: 6,
    revision: 2,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      { id: "red", name: "Красные", color: "#c62828", playerIds: ["leader"], leaderPlayerIds: ["leader"], stateId: null },
      { id: "blue", name: "Синие", color: "#1565c0", playerIds: [], leaderPlayerIds: [], stateId: null }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain,
    gridMap: {
      version: 1,
      revision: 1,
      cells: {
        "0,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "1,0": { terrainId: "plain", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "2,0": { terrainId: "channel", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }
      }
    },
    wars: [],
    turn: { ...DEFAULT_TURN_STATE, phase: "MOVEMENT" },
    ships: {},
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };

  return {
    scene,
    armies: { "army-token": army() },
    barriers: {},
    items: {
      "sea-ship": image("sea-ship", 0),
      "land-ship": image("land-ship", 100),
      "channel-ship": image("channel-ship", 200),
      "army-token": { ...image("army-token", 0), metadata: { [METADATA_KEYS.army]: army() } },
      shape: { id: "shape", type: "SHAPE", position: { x: 0, y: 0 }, metadata: {} }
    }
  };
}

function raw(type: string, payload: Record<string, unknown> = {}): unknown {
  return {
    protocolVersion: 4,
    requestId: "request",
    senderPlayerId: "gm",
    senderConnectionId: "gm-connection",
    expectedRevision: 2,
    type,
    ...payload
  };
}

function command(type: string, payload: Record<string, unknown> = {}, playerId = "gm"): ArmyCommand {
  return {
    protocolVersion: 4,
    requestId: "request",
    senderPlayerId: playerId,
    senderConnectionId: `${playerId}-connection`,
    expectedRevision: 2,
    type,
    ...payload
  } as unknown as ArmyCommand;
}

function context(role: "GM" | "PLAYER", playerId: string, commandState = state()): CommandContext {
  return {
    role,
    playerId,
    connectionId: `${playerId}-connection`,
    connectedPlayerIds: new Set(["gm", "leader"]),
    state: commandState
  };
}

const cellForPosition = (position: { x: number; y: number }) => ({ x: Math.round(position.x / 100), y: 0 });

describe("ship registration command validation", () => {
  it("parses REGISTER_SHIP with class and facing", () => {
    expect(validateArmyCommand(raw("REGISTER_SHIP", {
      itemId: "sea-ship",
      sideId: "red",
      classId: "CRUISER",
      facing: "EAST"
    }))).toMatchObject({
      ok: true,
      command: { type: "REGISTER_SHIP", itemId: "sea-ship", sideId: "red", classId: "CRUISER", facing: "EAST" }
    });
  });

  it("parses UNREGISTER_SHIP", () => {
    expect(validateArmyCommand(raw("UNREGISTER_SHIP", { shipId: "sea-ship" }))).toMatchObject({
      ok: true,
      command: { type: "UNREGISTER_SHIP", shipId: "sea-ship" }
    });
  });

  it.each([
    [{ classId: "DREADNOUGHT", facing: "EAST" }, "invalid class"],
    [{ classId: "CRUISER", facing: "NORTHEAST" }, "invalid facing"]
  ])("rejects REGISTER_SHIP with %s", (invalid) => {
    expect(validateArmyCommand(raw("REGISTER_SHIP", {
      itemId: "sea-ship",
      sideId: "red",
      ...invalid
    }))).toMatchObject({ ok: false, reason: "INVALID_COMMAND" });
  });
});

describe("ship registration command processing", () => {
  const processor = new CommandProcessor(undefined, cellForPosition);

  it("registers a ship on SEA for a GM", () => {
    const result = processor.execute(
      context("GM", "gm"),
      command("REGISTER_SHIP", { itemId: "sea-ship", sideId: "red", classId: "CRUISER", facing: "EAST" })
    );
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.ships?.["sea-ship"]).toMatchObject({
      registered: true,
      sideId: "red",
      classId: "CRUISER",
      facing: "EAST",
      status: "READY",
      hp: 25
    });
  });

  it("allows registration on a LAND+SEA channel cell", () => {
    const result = processor.execute(
      context("GM", "gm"),
      command("REGISTER_SHIP", { itemId: "channel-ship", sideId: "red", classId: "IRONCLAD", facing: "NORTH" })
    );
    expect(result.status).toBe("ACCEPTED");
  });

  it("rejects registration on a land-only cell", () => {
    expect(processor.execute(
      context("GM", "gm"),
      command("REGISTER_SHIP", { itemId: "land-ship", sideId: "red", classId: "CRUISER", facing: "NORTH" })
    )).toEqual({ status: "REJECTED", reason: "SHIP_REQUIRES_SEA" });
  });

  it("keeps ship registration GM-only", () => {
    expect(processor.execute(
      context("PLAYER", "leader"),
      command("REGISTER_SHIP", { itemId: "sea-ship", sideId: "red", classId: "CRUISER", facing: "NORTH" }, "leader")
    )).toEqual({ status: "REJECTED", reason: "GM_ONLY" });
  });

  it.each([
    ["missing", "ITEM_NOT_FOUND"],
    ["shape", "IMAGE_REQUIRED"],
    ["army-token", "ALREADY_REGISTERED"]
  ])("rejects invalid ship source %s", (itemId, reason) => {
    expect(processor.execute(
      context("GM", "gm"),
      command("REGISTER_SHIP", { itemId, sideId: "red", classId: "CRUISER", facing: "NORTH" })
    )).toEqual({ status: "REJECTED", reason });
  });

  it("rejects an unknown side", () => {
    expect(processor.execute(
      context("GM", "gm"),
      command("REGISTER_SHIP", { itemId: "sea-ship", sideId: "missing", classId: "CRUISER", facing: "NORTH" })
    )).toEqual({ status: "REJECTED", reason: "SIDE_NOT_FOUND" });
  });

  it("unregisters an existing ship for a GM", () => {
    const commandState = state();
    const registered = processor.execute(
      context("GM", "gm", commandState),
      command("REGISTER_SHIP", { itemId: "sea-ship", sideId: "red", classId: "CRUISER", facing: "NORTH" })
    );
    expect(registered.status).toBe("ACCEPTED");
    if (registered.status !== "ACCEPTED") return;

    const result = processor.execute(
      context("GM", "gm", registered.state),
      { ...command("UNREGISTER_SHIP", { shipId: "sea-ship" }), expectedRevision: 3 } as ArmyCommand
    );
    expect(result.status).toBe("ACCEPTED");
    if (result.status === "ACCEPTED") expect(result.state.scene.ships?.["sea-ship"]).toBeUndefined();
  });

  it("keeps ship unregister GM-only", () => {
    const commandState = state();
    commandState.scene.ships = {
      "sea-ship": {
        version: 1, registered: true, sideId: "red", classId: "CRUISER", status: "READY", hp: 25,
        temporaryHp: 0, facing: "NORTH", plannedRoute: [], globalMovementRemaining: 3,
        movementSpentThisTurn: false, battleId: null, detectionOverride: null, embarkedArmyId: null,
        shoreBombardmentUsedOnTurn: null, logisticsActionUsedOnTurn: null, revision: 1
      }
    };
    expect(processor.execute(
      context("PLAYER", "leader", commandState),
      command("UNREGISTER_SHIP", { shipId: "sea-ship" }, "leader")
    )).toEqual({ status: "REJECTED", reason: "GM_ONLY" });
  });
});
