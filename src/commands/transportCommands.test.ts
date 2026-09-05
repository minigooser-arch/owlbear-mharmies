import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import {
  COMMAND_PROTOCOL_VERSION,
  type ArmyCommand,
  type ArmyState,
  type SceneState
} from "../shared/types";
import { CommandProcessor, type CommandContext, type CommandState } from "./commandProcessor";
import { validateArmyCommand } from "./commandValidation";

function army(sideId: string): ArmyState {
  return {
    version: 4,
    registered: true,
    sideId,
    status: "READY",
    overrides: {},
    route: [],
    plannedRoute: {
      startCell: { x: 0, y: 0 },
      executeOnTurn: 1,
      cells: [],
      totalCostUnits: 0,
      validatedRevision: 1,
      requiresReplan: false
    },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    health: { hp: 50, maxHp: 50 },
    supply: { supplied: true, checkedOnTurn: 1 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    embarkedOnShipId: null,
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1
  };
}

function scene(): SceneState {
  return {
    version: 6,
    revision: 4,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      {
        id: "red",
        name: "Красные",
        color: "#f00",
        playerIds: ["red-leader", "red-member"],
        leaderPlayerIds: ["red-leader"],
        stateId: null
      },
      {
        id: "blue",
        name: "Синие",
        color: "#00f",
        playerIds: ["blue-leader", "blue-member"],
        leaderPlayerIds: ["blue-leader"],
        stateId: null
      }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), phase: "MOVEMENT" },
    ships: {
      transport: createRegisteredShip("red", "TRANSPORT", "EAST")
    },
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

function state(armySide = "red"): CommandState {
  return {
    scene: scene(),
    armies: { army: army(armySide) },
    barriers: {},
    items: {}
  };
}

function raw(
  playerId: string,
  payload: Record<string, unknown>,
  requestId = `request-${playerId}`
): Record<string, unknown> {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId,
    senderPlayerId: playerId,
    senderConnectionId: `${playerId}-connection`,
    expectedRevision: 4,
    ...payload
  };
}

function context(playerId: string, commandState: CommandState): CommandContext {
  return {
    role: "PLAYER",
    playerId,
    connectionId: `${playerId}-connection`,
    connectedPlayerIds: new Set(["red-leader", "blue-leader", "red-member", "blue-member"]),
    state: commandState
  };
}

function execute(playerId: string, payload: Record<string, unknown>, commandState = state()) {
  return new CommandProcessor().execute(
    context(playerId, commandState),
    raw(playerId, payload) as unknown as ArmyCommand
  );
}

function pendingRequests(sceneState: SceneState): Array<{ id: string; shipId: string; armyId: string }> {
  return ((sceneState as SceneState & {
    transportEmbarkRequests?: Array<{ id: string; shipId: string; armyId: string }>;
  }).transportEmbarkRequests ?? []);
}

describe("transport command validation", () => {
  it("parses embark, accept and disembark payloads", () => {
    expect(validateArmyCommand(raw("red-leader", {
      type: "EMBARK_ARMY",
      shipId: "transport",
      armyId: "army"
    }))).toMatchObject({ ok: true, command: { type: "EMBARK_ARMY", shipId: "transport", armyId: "army" } });

    expect(validateArmyCommand(raw("blue-leader", {
      type: "ACCEPT_EMBARK_ARMY",
      embarkRequestId: "request-red-leader",
      shipId: "transport",
      armyId: "army"
    }))).toMatchObject({
      ok: true,
      command: {
        type: "ACCEPT_EMBARK_ARMY",
        embarkRequestId: "request-red-leader",
        shipId: "transport",
        armyId: "army"
      }
    });

    expect(validateArmyCommand(raw("red-leader", {
      type: "DISEMBARK_ARMY",
      shipId: "transport",
      armyId: "army"
    }))).toMatchObject({ ok: true, command: { type: "DISEMBARK_ARMY", shipId: "transport", armyId: "army" } });
  });

  it("rejects empty ids", () => {
    expect(validateArmyCommand(raw("red-leader", {
      type: "EMBARK_ARMY",
      shipId: "",
      armyId: "army"
    }))).toMatchObject({ ok: false, reason: "INVALID_COMMAND" });
  });
});

describe("transport command authorization and consent", () => {
  it("lets the transport-side leader directly embark an army of the same side", () => {
    const result = execute("red-leader", { type: "EMBARK_ARMY", shipId: "transport", armyId: "army" });

    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.ships?.transport?.embarkedArmyId).toBe("army");
    expect(result.state.armies.army?.embarkedOnShipId).toBe("transport");
    expect(pendingRequests(result.state.scene)).toEqual([]);
  });

  it("creates a pending request instead of directly embarking a foreign army", () => {
    const result = execute(
      "red-leader",
      { type: "EMBARK_ARMY", shipId: "transport", armyId: "army" },
      state("blue")
    );

    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.ships?.transport?.embarkedArmyId).toBeNull();
    expect(result.state.armies.army?.embarkedOnShipId).toBeNull();
    expect(pendingRequests(result.state.scene)).toEqual([
      { id: "request-red-leader", shipId: "transport", armyId: "army" }
    ]);
  });

  it("requires the foreign army-side leader to accept the matching request", () => {
    const requested = execute(
      "red-leader",
      { type: "EMBARK_ARMY", shipId: "transport", armyId: "army" },
      state("blue")
    );
    expect(requested.status).toBe("ACCEPTED");
    if (requested.status !== "ACCEPTED") return;

    const requestedState = requested.state;
    requestedState.scene.revision = 4;
    const accepted = execute("blue-leader", {
      type: "ACCEPT_EMBARK_ARMY",
      embarkRequestId: "request-red-leader",
      shipId: "transport",
      armyId: "army"
    }, requestedState);

    expect(accepted.status).toBe("ACCEPTED");
    if (accepted.status !== "ACCEPTED") return;
    expect(accepted.state.scene.ships?.transport?.embarkedArmyId).toBe("army");
    expect(accepted.state.armies.army?.embarkedOnShipId).toBe("transport");
    expect(pendingRequests(accepted.state.scene)).toEqual([]);
  });

  it("rejects ordinary members and mismatched accept requests", () => {
    expect(execute("red-member", {
      type: "EMBARK_ARMY",
      shipId: "transport",
      armyId: "army"
    })).toEqual({ status: "REJECTED", reason: "NOT_SIDE_LEADER" });

    const requested = execute(
      "red-leader",
      { type: "EMBARK_ARMY", shipId: "transport", armyId: "army" },
      state("blue")
    );
    expect(requested.status).toBe("ACCEPTED");
    if (requested.status !== "ACCEPTED") return;
    requested.state.scene.revision = 4;

    expect(execute("blue-member", {
      type: "ACCEPT_EMBARK_ARMY",
      embarkRequestId: "request-red-leader",
      shipId: "transport",
      armyId: "army"
    }, requested.state)).toEqual({ status: "REJECTED", reason: "NOT_SIDE_LEADER" });

    expect(execute("blue-leader", {
      type: "ACCEPT_EMBARK_ARMY",
      embarkRequestId: "wrong-request",
      shipId: "transport",
      armyId: "army"
    }, requested.state)).toEqual({ status: "REJECTED", reason: "EMBARK_REQUEST_NOT_FOUND" });
  });

  it("lets the transport-side leader disembark a reciprocal cargo pair", () => {
    const embarked = execute("red-leader", {
      type: "EMBARK_ARMY",
      shipId: "transport",
      armyId: "army"
    });
    expect(embarked.status).toBe("ACCEPTED");
    if (embarked.status !== "ACCEPTED") return;
    embarked.state.scene.revision = 4;

    const result = execute("red-leader", {
      type: "DISEMBARK_ARMY",
      shipId: "transport",
      armyId: "army"
    }, embarked.state);

    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.ships?.transport?.embarkedArmyId).toBeNull();
    expect(result.state.armies.army?.embarkedOnShipId).toBeNull();
  });
});
