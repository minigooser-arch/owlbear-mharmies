import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  ROUTE_ARMY_ID_KEY,
  ROUTE_RETURN_TOOL_KEY,
  ROUTE_TOOL_ID,
  ROUTE_TOOL_MODE_ID
} from "../shared/constants";
import type { ArmyState, SceneItemRecord, SceneState } from "../shared/types";
import {
  buildRoleSafeSnapshot,
  createOwlbearExtensionServices,
  type RunningExtensionServices
} from "./extensionServices";
import { notificationMessage } from "./notifications";

const serviceHarness = vi.hoisted(() => {
  type AckMode =
    | { status: "ACCEPTED" }
    | { status: "REJECTED"; reason: string }
    | { status: "CONFLICT"; actualRevision: number }
    | { status: "NONE" };
  type AckListener = (event: { connectionId: string; data: unknown }) => void;

  const scene = {
    version: 2 as const,
    revision: 1,
    settings: {
      defaultDetectionRangeCells: 6,
      defaultSpeedCellsPerSecond: 0.25,
      defaultCollisionRangeCells: 0.5,
      defaultMaxRouteDistanceCells: 5,
      detectionMode: "INDEPENDENT" as const,
      visibilityRecalculationMode: "ON_DROP" as const,
      allowPlayersToCreateRoutes: true,
      allowPlayersToStartOwnArmies: true,
      movementUpdateRate: 5,
      visibilityUpdateRate: 4,
      interpolationEnabled: true
    },
    sides: [{
      id: "red",
      name: "Красные",
      color: "#f00",
      playerIds: [],
      leaderPlayerIds: []
    }],
    relations: {},
    battleGroups: []
  };
  const state: {
    selection: string[];
    items: Array<{
      id: string;
      type: string;
      name: string;
      position: { x: number; y: number };
      metadata: Record<string, unknown>;
    }>;
    ackMode: AckMode;
  } = {
    selection: ["selected"],
    items: [{
      id: "selected",
      type: "IMAGE",
      name: "Новая армия",
      position: { x: 0, y: 0 },
      metadata: {}
    }],
    ackMode: { status: "ACCEPTED" }
  };
  const ackListeners = new Set<AckListener>();
  const notificationShow = vi.fn(async () => undefined);

  const adapter = {
    getSceneMetadata: vi.fn(async () => ({
      "com.letopis.army-control/scene": structuredClone(scene)
    })),
    patchSceneMetadata: vi.fn(async () => undefined),
    getSceneItems: vi.fn(async () => structuredClone(state.items)),
    updateSceneItem: vi.fn(async () => undefined),
    getLocalItems: vi.fn(async () => []),
    addLocalItem: vi.fn(async () => undefined),
    updateLocalItem: vi.fn(async () => undefined),
    deleteLocalItems: vi.fn(async () => undefined),
    createClone: vi.fn((source: unknown) => source),
    send: vi.fn(async (_channel: string, data: unknown) => {
      const command = data as { requestId: string; senderConnectionId: string };
      const mode = state.ackMode;
      if (mode.status === "NONE") return;
      const statusData = mode.status === "REJECTED"
        ? { status: mode.status, reason: mode.reason }
        : mode.status === "CONFLICT"
          ? { status: mode.status, actualRevision: mode.actualRevision }
          : { status: mode.status };
      queueMicrotask(() => {
        for (const listener of ackListeners) {
          listener({
            connectionId: "coordinator",
            data: {
              requestId: command.requestId,
              coordinatorConnectionId: "coordinator",
              recipientConnectionId: command.senderConnectionId,
              ...statusData
            }
          });
        }
      });
    }),
    on: vi.fn((_channel: string, listener: AckListener) => {
      ackListeners.add(listener);
      return () => ackListeners.delete(listener);
    }),
    getGridDistance: vi.fn(async () => 0),
    onGridChange: vi.fn(() => () => undefined),
    show: notificationShow
  };

  const sdk = {
    scene: {
      isReady: vi.fn(async () => true),
      onReadyChange: vi.fn(() => () => undefined),
      onMetadataChange: vi.fn(() => () => undefined),
      items: { onChange: vi.fn(() => () => undefined) },
      local: { onChange: vi.fn(() => () => undefined) }
    },
    player: {
      getRole: vi.fn(async () => "GM" as const),
      getId: vi.fn(async () => "gm"),
      getName: vi.fn(async () => "Ведущий"),
      getColor: vi.fn(async () => "#fff"),
      getConnectionId: vi.fn(async () => "sender"),
      getSelection: vi.fn(async () => [...state.selection]),
      onChange: vi.fn(() => () => undefined)
    },
    party: {
      getPlayers: vi.fn(async () => [{
        id: "coordinator-gm",
        connectionId: "coordinator",
        name: "Координатор",
        color: "#000",
        role: "GM" as const
      }]),
      onChange: vi.fn(() => () => undefined)
    },
    notification: { show: notificationShow },
    tool: {
      getActiveTool: vi.fn(async () => "select-tool"),
      setMetadata: vi.fn(async () => undefined),
      activateTool: vi.fn(async () => undefined),
      activateMode: vi.fn(async () => undefined)
    }
  };

  return {
    adapter,
    notificationShow,
    sdk,
    state,
    reset() {
      state.selection = ["selected"];
      state.items = [{
        id: "selected",
        type: "IMAGE",
        name: "Новая армия",
        position: { x: 0, y: 0 },
        metadata: {}
      }];
      state.ackMode = { status: "ACCEPTED" };
      ackListeners.clear();
    }
  };
});

vi.mock("@owlbear-rodeo/sdk", () => ({ default: serviceHarness.sdk }));
vi.mock("./sdkAdapter", () => ({
  createOwlbearAdapter: () => serviceHarness.adapter
}));

const armyState = (sideId: string): ArmyState => ({
  version: 1, registered: true, sideId, status: "READY", overrides: {}, route: [], currentWaypointIndex: 0,
  segmentProgressCells: 0, ignoresMovementBarriers: false, ignoresVisionBarriers: false, revision: 1
});

it("builds a player snapshot whose visible IDs come from own side and local clones", () => {
  const scene: SceneState = {
    version: 2, revision: 1, settings: DEFAULT_SETTINGS,
    sides: [
      { id: "A", name: "Красные", color: "#f00", playerIds: ["player"], leaderPlayerIds: [] },
      { id: "B", name: "Синие", color: "#00f", playerIds: [], leaderPlayerIds: [] }
    ], relations: {}, battleGroups: []
  };
  const sourceA: SceneItemRecord = { id: "a", type: "IMAGE", name: "A", position: { x: 0, y: 0 }, metadata: {} };
  const sourceB: SceneItemRecord = { id: "b", type: "IMAGE", name: "B", position: { x: 1, y: 0 }, metadata: {} };
  const hidden: SceneItemRecord = { id: "hidden", type: "IMAGE", name: "Hidden", position: { x: 2, y: 0 }, metadata: {} };
  const snapshot = buildRoleSafeSnapshot({
    role: "PLAYER", playerId: "player", scene,
    players: [{ id: "player", name: "Игрок", color: "#fff", role: "PLAYER", connected: true }],
    armies: [
      { item: sourceA, state: armyState("A") },
      { item: sourceB, state: armyState("B") },
      { item: hidden, state: armyState("B") }
    ],
    localCloneSourceIds: new Set(["b"])
  });
  expect(snapshot.visibleSourceIds).toEqual(new Set(["a", "b"]));
  expect(snapshot.memberSideIds).toEqual(new Set(["A"]));
  expect(snapshot.leaderSideIds).toEqual(new Set());
  expect(snapshot.players.map((player) => player.id)).toEqual(["player"]);
});

it("derives leader sides by internal id and hides legacy direct ownership", () => {
  const scene: SceneState = {
    version: 2,
    revision: 1,
    settings: DEFAULT_SETTINGS,
    sides: [{
      id: "A",
      name: "Красные",
      color: "#f00",
      playerIds: ["leader"],
      leaderPlayerIds: ["leader"]
    }],
    relations: {},
    battleGroups: []
  };
  const state = { ...armyState("A"), directOwnerPlayerId: "legacy-owner" };
  const snapshot = buildRoleSafeSnapshot({
    role: "PLAYER",
    playerId: "leader",
    scene,
    players: [
      { id: "leader", name: "Одинаковое имя", color: "#111", role: "PLAYER", connected: true },
      { id: "legacy-owner", name: "Одинаковое имя", color: "#222", role: "PLAYER", connected: true }
    ],
    armies: [{
      item: { id: "army", type: "IMAGE", position: { x: 0, y: 0 }, metadata: {} },
      state
    }],
    localCloneSourceIds: new Set()
  });

  expect(snapshot.leaderSideIds).toEqual(new Set(["A"]));
  expect(snapshot.armies[0]).not.toHaveProperty("directOwnerPlayerId");
});

it.each([
  ["GM", "gm", "READY", true],
  ["PLAYER", "leader", "READY", true],
  ["PLAYER", "member", "READY", false],
  ["PLAYER", "member", "MOVING", true],
  ["PLAYER", "outsider", "MOVING", false]
] as const)(
  "filters %s %s route coordinates for a %s army",
  (role, playerId, status, routeVisible) => {
    const scene: SceneState = {
      version: 2,
      revision: 1,
      settings: DEFAULT_SETTINGS,
      sides: [{
        id: "A",
        name: "Красные",
        color: "#f00",
        playerIds: ["leader", "member"],
        leaderPlayerIds: ["leader"]
      }],
      relations: {},
      battleGroups: []
    };
    const state: ArmyState = {
      ...armyState("A"),
      status,
      route: [{ x: 3, y: 4 }]
    };

    const snapshot = buildRoleSafeSnapshot({
      role,
      playerId,
      scene,
      players: [],
      armies: [{
        item: { id: "army", type: "IMAGE", position: { x: 0, y: 0 }, metadata: {} },
        state
      }],
      localCloneSourceIds: new Set()
    });

    expect(snapshot.armies[0]?.route).toEqual(routeVisible ? [{ x: 3, y: 4 }] : []);
  }
);

describe("extension command feedback", () => {
  let services: RunningExtensionServices | undefined;

  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    serviceHarness.reset();
  });

  afterEach(() => {
    services?.stop();
    services = undefined;
    vi.useRealTimers();
  });

  async function startServices(): Promise<RunningExtensionServices> {
    services = await createOwlbearExtensionServices();
    return services;
  }

  it("resolves the GM selection and sends REGISTER_ARMY for the selected side", async () => {
    const running = await startServices();

    await running.send({ type: "REGISTER_SELECTED_ARMY", sideId: "red" });

    expect(serviceHarness.adapter.send).toHaveBeenCalledWith(
      "com.letopis.army-control/command",
      expect.objectContaining({ type: "REGISTER_ARMY", itemId: "selected", sideId: "red" })
    );
  });

  it("activates the route tool with the army and previous tool metadata", async () => {
    const running = await startServices();

    await running.send({ type: "EDIT_ROUTE", armyId: "army-a" });

    expect(serviceHarness.sdk.tool.setMetadata).toHaveBeenCalledWith(ROUTE_TOOL_ID, {
      [ROUTE_ARMY_ID_KEY]: "army-a",
      [ROUTE_RETURN_TOOL_KEY]: "select-tool"
    });
    expect(serviceHarness.sdk.tool.activateTool).toHaveBeenCalledWith(ROUTE_TOOL_ID);
    expect(serviceHarness.sdk.tool.activateMode).toHaveBeenCalledWith(
      ROUTE_TOOL_ID,
      ROUTE_TOOL_MODE_ID
    );
    expect(serviceHarness.sdk.tool.setMetadata.mock.invocationCallOrder[0]).toBeLessThan(
      serviceHarness.sdk.tool.activateTool.mock.invocationCallOrder[0] ?? Infinity
    );
    expect(serviceHarness.sdk.tool.activateTool.mock.invocationCallOrder[0]).toBeLessThan(
      serviceHarness.sdk.tool.activateMode.mock.invocationCallOrder[0] ?? Infinity
    );
  });

  it("clears route metadata when tool activation fails", async () => {
    const running = await startServices();
    serviceHarness.sdk.tool.activateMode.mockRejectedValueOnce(new Error("activation failed"));

    await expect(running.send({ type: "EDIT_ROUTE", armyId: "army-a" }))
      .resolves.toBeUndefined();

    expect(serviceHarness.sdk.tool.setMetadata).toHaveBeenLastCalledWith(ROUTE_TOOL_ID, {
      [ROUTE_ARMY_ID_KEY]: null,
      [ROUTE_RETURN_TOOL_KEY]: null
    });
    expect(serviceHarness.notificationShow).toHaveBeenCalledWith(
      notificationMessage("UNKNOWN"),
      "ERROR"
    );
  });

  it("shows a selection error without broadcasting an invalid registration", async () => {
    serviceHarness.state.selection = [];
    const running = await startServices();

    await expect(running.send({ type: "REGISTER_SELECTED_ARMY", sideId: "red" }))
      .resolves.toBeUndefined();

    expect(serviceHarness.adapter.send).not.toHaveBeenCalled();
    expect(serviceHarness.notificationShow).toHaveBeenCalledWith(
      notificationMessage("SELECTION_EMPTY"),
      "WARNING"
    );
  });

  it.each([
    [{ status: "REJECTED", reason: "NOT_SIDE_LEADER" } as const, "NOT_SIDE_LEADER"],
    [{ status: "CONFLICT", actualRevision: 3 } as const, "REVISION_CONFLICT"]
  ])("shows Russian feedback for a %s acknowledgement", async (ackMode, notificationCode) => {
    serviceHarness.state.ackMode = ackMode;
    const running = await startServices();

    await running.send({ type: "START_ALL" });

    expect(serviceHarness.notificationShow).toHaveBeenCalledWith(
      notificationMessage(notificationCode),
      "WARNING"
    );
  });

  it("refreshes the snapshot after an accepted non-registration command", async () => {
    const running = await startServices();
    const readsBeforeSend = serviceHarness.adapter.getSceneMetadata.mock.calls.length;

    await running.send({ type: "START_ALL" });

    expect(serviceHarness.adapter.getSceneMetadata.mock.calls.length).toBe(readsBeforeSend + 2);
  });

  it("shows Russian timeout feedback instead of rejecting", async () => {
    vi.useFakeTimers();
    serviceHarness.state.ackMode = { status: "NONE" };
    const running = await startServices();

    const pending = running.send({ type: "START_ALL" }).then(
      (value) => ({ status: "RESOLVED" as const, value }),
      (error: unknown) => ({ status: "REJECTED" as const, error })
    );
    await vi.runAllTimersAsync();
    expect(await pending).toEqual({ status: "RESOLVED", value: undefined });

    expect(serviceHarness.notificationShow).toHaveBeenCalledWith(
      notificationMessage("COMMAND_TIMEOUT"),
      "WARNING"
    );
  });

  it("shows generic Russian feedback when broadcasting fails", async () => {
    const running = await startServices();
    serviceHarness.adapter.send.mockRejectedValueOnce(new Error("network failed"));

    await expect(running.send({ type: "START_ALL" })).resolves.toBeUndefined();
    expect(serviceHarness.notificationShow).toHaveBeenCalledWith(
      notificationMessage("UNKNOWN"),
      "ERROR"
    );
  });
});
