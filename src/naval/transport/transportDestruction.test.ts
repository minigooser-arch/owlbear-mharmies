import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../../shared/constants";
import {
  COMMAND_PROTOCOL_VERSION,
  type ArmyCommand,
  type ArmyState,
  type SceneState
} from "../../shared/types";
import { CommandProcessor, type CommandContext, type CommandState } from "../../commands/commandProcessor";
import { createRegisteredShip } from "../ships/shipLifecycle";

function army(embarkedOnShipId: string | null): ArmyState {
  return {
    version: 4,
    registered: true,
    sideId: "blue",
    status: "READY",
    overrides: {},
    route: [],
    plannedRoute: {
      startCell: { x: 0, y: 0 }, executeOnTurn: 1, cells: [], totalCostUnits: 0,
      validatedRevision: 1, requiresReplan: false
    },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    health: { hp: 37, maxHp: 50 },
    supply: { supplied: true, checkedOnTurn: 1 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    embarkedOnShipId,
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1
  };
}

function scene(reciprocal = true): SceneState {
  const transport = createRegisteredShip("red", "TRANSPORT", "EAST");
  transport.embarkedArmyId = "cargo";
  return {
    version: 6,
    revision: 4,
    settings: { ...DEFAULT_SETTINGS },
    sides: [], states: [], relations: {}, battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), phase: "MOVEMENT" },
    ships: { transport },
    transportEmbarkRequests: [],
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

function state(reciprocal = true): CommandState {
  return {
    scene: scene(reciprocal),
    armies: { cargo: army(reciprocal ? "transport" : null) },
    barriers: {},
    items: {}
  };
}

function command(type: "SET_SHIP_HP" | "UNREGISTER_SHIP", extra: Record<string, unknown> = {}): ArmyCommand {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: `request-${type}`,
    senderPlayerId: "gm",
    senderConnectionId: "gm-connection",
    expectedRevision: 4,
    type,
    shipId: "transport",
    ...(type === "SET_SHIP_HP" ? { hp: 0 } : {}),
    ...extra
  } as ArmyCommand;
}

function execute(commandState: CommandState, input: ArmyCommand) {
  const context: CommandContext = {
    role: "GM",
    playerId: "gm",
    connectionId: "gm-connection",
    connectedPlayerIds: new Set(["gm"]),
    state: commandState
  };
  return new CommandProcessor().execute(context, input);
}

describe("transport cargo destruction coupling", () => {
  it("destroys a reciprocally embarked army when transport HP reaches zero", () => {
    const result = execute(state(true), command("SET_SHIP_HP"));
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;

    expect(result.state.armies.cargo).toBeUndefined();
    expect(result.state.scene.ships?.transport?.hp).toBe(0);
    expect(result.state.scene.ships?.transport?.embarkedArmyId).toBeNull();
  });

  it("destroys reciprocal cargo when the transport is unregistered", () => {
    const result = execute(state(true), command("UNREGISTER_SHIP"));
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;

    expect(result.state.scene.ships?.transport).toBeUndefined();
    expect(result.state.armies.cargo).toBeUndefined();
  });

  it("does not destroy an army from a stale one-way ship cargo link", () => {
    const result = execute(state(false), command("SET_SHIP_HP"));
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;

    expect(result.state.armies.cargo).toBeDefined();
    expect(result.state.scene.ships?.transport?.embarkedArmyId).toBeNull();
  });
});
