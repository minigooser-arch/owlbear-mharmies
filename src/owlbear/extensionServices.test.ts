import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  DEFAULT_TERRAIN,
  DEFAULT_TURN_STATE,
  METADATA_KEYS,
  MAP_BRUSH_ERASER_TARGET_KEY,
  MAP_BRUSH_FACTION_OPERATION_KEY,
  MAP_BRUSH_IMPASSABLE_VALUE_KEY,
  MAP_BRUSH_MODE_KEY,
  MAP_BRUSH_SIDE_ID_KEY,
  MAP_BRUSH_SIZE_KEY,
  MAP_BRUSH_STATE_ID_KEY,
  MAP_BRUSH_TERRAIN_ID_KEY,
  MAP_BRUSH_TOOL_ID,
  MAP_BRUSH_TOOL_MODE_ID,
  ROUTE_ARMY_ID_KEY,
  ROUTE_RETURN_TOOL_KEY,
  ROUTE_TOOL_ID,
  ROUTE_TOOL_MODE_ID,
  SHIP_ROUTE_RETURN_TOOL_KEY,
  SHIP_ROUTE_SHIP_ID_KEY,
  SHIP_ROUTE_TOOL_ID,
  SHIP_ROUTE_TOOL_MODE_ID
} from "../shared/constants";
import {
  COMMAND_PROTOCOL_VERSION,
  type ArmyState,
  type SceneItemRecord,
  type SceneState
} from "../shared/types";
import {
  buildRoleSafeSnapshot,
  createOwlbearExtensionServices,
  type RunningExtensionServices
} from "./extensionServices";
import { DiagnosticsService } from "./diagnostics";
import { notificationMessage } from "./notifications";

const serviceHarness = vi.hoisted(() => {
  type AckMode =
    | { status: "ACCEPTED" }
    | { status: "REJECTED"; reason: string }
    | { status: "CONFLICT"; actualRevision: number }
    | { status: "NONE" };
  type AckListener = (event: { connectionId: string; data: unknown }) => void;
  type EventListener<T = unknown> = (value: T) => void;
  type PlayerRole = "GM" | "PLAYER";
  interface PartyPlayer {
    id: string;
    connectionId: string;
    name: string;
    color: string;
    role: PlayerRole;
  }

  const callbacks: {
    metadata: EventListener | undefined;
    items: EventListener<unknown[]> | undefined;
    local: EventListener<unknown[]> | undefined;
  } = {
    metadata: undefined,
    items: undefined,
    local: undefined
  };

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
    ackConnectionId: string;
    currentConnectionId: string;
    currentRole: PlayerRole;
    party: PartyPlayer[];
    coordinatorLease: {
      connectionId: string;
      epoch: number;
      expiresAt: number;
    } | undefined;
  } = {
    selection: ["selected"],
    items: [{
      id: "selected",
      type: "IMAGE",
      name: "Новая армия",
      position: { x: 0, y: 0 },
      metadata: {}
    }],
    ackMode: { status: "ACCEPTED" },
    ackConnectionId: "coordinator",
    currentConnectionId: "sender",
    currentRole: "GM",
    party: [{
      id: "coordinator-gm",
      connectionId: "coordinator",
      name: "Координатор",
      color: "#000",
      role: "GM"
    }],
    coordinatorLease: undefined
  };
  const ackListeners = new Set<AckListener>();
  const notificationShow = vi.fn(async () => undefined);
  const emitAck = (connectionId: string, data: unknown) => {
    for (const listener of ackListeners) listener({ connectionId, data });
  };

  const adapter = {
    getSceneMetadata: vi.fn(async () => ({
      "com.letopis.army-control/scene": {
        ...structuredClone(scene),
        ...(state.coordinatorLease
          ? { coordinatorLease: structuredClone(state.coordinatorLease) }
          : {})
      }
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
      const command = data as {
        protocolVersion: unknown;
        requestId: string;
        senderConnectionId: string;
      };
      const mode = state.ackMode;
      if (mode.status === "NONE") return;
      const statusData = mode.status === "REJECTED"
        ? { status: mode.status, reason: mode.reason }
        : mode.status === "CONFLICT"
          ? { status: mode.status, actualRevision: mode.actualRevision }
          : { status: mode.status };
      queueMicrotask(() => {
        emitAck(state.ackConnectionId, {
          protocolVersion: COMMAND_PROTOCOL_VERSION,
          requestId: command.requestId,
          coordinatorConnectionId: state.ackConnectionId,
          recipientConnectionId: command.senderConnectionId,
          ...statusData
        });
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
      onMetadataChange: vi.fn((listener: EventListener) => {
        callbacks.metadata = listener;
        return () => {
          if (callbacks.metadata === listener) callbacks.metadata = undefined;
        };
      }),
      items: {
        onChange: vi.fn((listener: EventListener<unknown[]>) => {
          callbacks.items = listener;
          return () => {
            if (callbacks.items === listener) callbacks.items = undefined;
          };
        })
      },
      local: {
        onChange: vi.fn((listener: EventListener<unknown[]>) => {
          callbacks.local = listener;
          return () => {
            if (callbacks.local === listener) callbacks.local = undefined;
          };
        })
      }
    },
    player: {
      getRole: vi.fn(async () => state.currentRole),
      getId: vi.fn(async () => "gm"),
      getName: vi.fn(async () => "Ведущий"),
      getColor: vi.fn(async () => "#fff"),
      getConnectionId: vi.fn(async () => state.currentConnectionId),
      getSelection: vi.fn(async () => [...state.selection]),
      onChange: vi.fn(() => () => undefined)
    },
    party: {
      getPlayers: vi.fn(async () => structuredClone(state.party)),
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
    callbacks,
    emitAck,
    notificationShow,
    scene,
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
      state.ackConnectionId = "coordinator";
      state.currentConnectionId = "sender";
      state.currentRole = "GM";
      state.party = [{
        id: "coordinator-gm",
        connectionId: "coordinator",
        name: "Координатор",
        color: "#000",
        role: "GM"
      }];
      state.coordinatorLease = undefined;
      const firstSide = scene.sides[0];
      if (firstSide) firstSide.name = "Красные";
      callbacks.metadata = undefined;
      callbacks.items = undefined;
      callbacks.local = undefined;
      ackListeners.clear();
    }
  };
});

vi.mock("@owlbear-rodeo/sdk", () => ({ default: serviceHarness.sdk }));
vi.mock("./sdkAdapter", () => ({
  createOwlbearAdapter: () => serviceHarness.adapter
}));

const armyState = (sideId: string): ArmyState => ({
  version: 3, registered: true, sideId, status: "READY", overrides: {}, route: [],
  plannedRoute: { startCell: { x: 0, y: 0 }, executeOnTurn: 0, cells: [], totalCostUnits: 0, validatedRevision: 1, requiresReplan: false },
  movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
  health: { hp: 50, maxHp: 50 }, supply: { supplied: true, checkedOnTurn: 1 },
  disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
  currentWaypointIndex: 0, segmentProgressCells: 0, ignoresMovementBarriers: false, ignoresVisionBarriers: false, revision: 1
});

function sceneState(sides: SceneState["sides"]): SceneState {
  return {
    version: 5, revision: 1, settings: DEFAULT_SETTINGS, sides, states: [], relations: {}, battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN), gridMap: { version: 1, revision: 0, cells: {} },
    wars: [], turn: structuredClone(DEFAULT_TURN_STATE)
  };
}

it("keeps a map-visible enemy off a player's army list", () => {
  const scene = sceneState([
    { id: "A", name: "Красные", color: "#f00", playerIds: ["player"], leaderPlayerIds: [], stateId: null },
    { id: "B", name: "Синие", color: "#00f", playerIds: [], leaderPlayerIds: [], stateId: null }
  ]);
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
    mapVisibleSourceIds: new Set(["b"])
  });
  expect(snapshot.mapVisibleSourceIds).toEqual(new Set(["a", "b"]));
  expect(snapshot.armies.map((army) => army.id)).toEqual(["a"]);
  expect(snapshot.memberSideIds).toEqual(new Set(["A"]));
  expect(snapshot.leaderSideIds).toEqual(new Set());
  expect(snapshot.players.map((player) => player.id)).toEqual(["player"]);
});

it("derives leader sides by internal id and hides legacy direct ownership", () => {
  const scene = sceneState([{
    id: "A", name: "Красные", color: "#f00", playerIds: ["leader"], leaderPlayerIds: ["leader"], stateId: null
  }]);
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
    mapVisibleSourceIds: new Set()
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
    const scene = sceneState([{
      id: "A", name: "Красные", color: "#f00", playerIds: ["leader", "member"], leaderPlayerIds: ["leader"], stateId: null
    }]);
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
      mapVisibleSourceIds: new Set()
    });

    expect(snapshot.armies[0]?.route).toEqual(
      role === "PLAYER" && playerId === "outsider"
        ? undefined
        : routeVisible ? [{ x: 3, y: 4 }] : []
    );
  }
);

it("returns the union of all member-side armies", () => {
  const scene = sceneState([
    { id: "red", name: "Красные", color: "#f00", playerIds: ["player"], leaderPlayerIds: [], stateId: null },
    { id: "blue", name: "Синие", color: "#00f", playerIds: ["player"], leaderPlayerIds: [], stateId: null },
    { id: "green", name: "Зелёные", color: "#0f0", playerIds: [], leaderPlayerIds: [], stateId: null }
  ]);
  const item = (id: string): SceneItemRecord => ({
    id,
    type: "IMAGE",
    name: id,
    position: { x: 0, y: 0 },
    metadata: {}
  });

  const snapshot = buildRoleSafeSnapshot({
    role: "PLAYER",
    playerId: "player",
    scene,
    players: [],
    armies: [
      { item: item("red-army"), state: armyState("red") },
      { item: item("blue-army"), state: armyState("blue") },
      { item: item("green-army"), state: armyState("green") }
    ],
    mapVisibleSourceIds: new Set(["green-army"])
  });

  expect(snapshot.armies.map((army) => army.id).sort()).toEqual(["blue-army", "red-army"]);
});

it.each([
  ["INVALID_BATTLE_NAME", "Название боя должно содержать от 1 до 80 символов."],
  ["BATTLE_NOT_FOUND", "Указанный бой не найден."],
  ["IMPASSABLE", "Эта клетка непроходима."],
  ["OUTSIDE_FACTION_TERRITORY", "В мирное время армия не может покидать территорию своей фракции."],
  ["INSUFFICIENT_MOVEMENT_POINTS", "Для этого маршрута не хватает очков перемещения."]
])("provides Russian feedback for %s", (code, message) => {
  expect(notificationMessage(code)).toBe(message);
});

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
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function startServices(): Promise<RunningExtensionServices> {
    services = await createOwlbearExtensionServices();
    return services;
  }

  async function waitForMetadataReads(count: number): Promise<void> {
    await vi.waitFor(() => {
      expect(serviceHarness.adapter.getSceneMetadata).toHaveBeenCalledTimes(count);
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  function lastSentCommand(): Record<string, unknown> {
    const call = serviceHarness.adapter.send.mock.calls.at(-1);
    const value: unknown = call?.[1];
    if (typeof value !== "object" || value === null) throw new Error("Expected a sent command");
    return value as Record<string, unknown>;
  }

  it("does not schedule a refresh for route, barrier, and preview local overlays", async () => {
    await startServices();
    const readinessReads = serviceHarness.sdk.scene.isReady.mock.calls.length;

    serviceHarness.callbacks.local?.([
      { metadata: { [METADATA_KEYS.routeOverlay]: { armyId: "army", kind: "LINE" } } },
      { metadata: { [METADATA_KEYS.routePreview]: { armyId: "army", kind: "LINE" } } },
      { metadata: { [METADATA_KEYS.barrierOverlay]: { barrierId: "barrier" } } }
    ]);
    await Promise.resolve();

    expect(serviceHarness.sdk.scene.isReady).toHaveBeenCalledTimes(readinessReads);
  });

  it("does not notify subscribers for an unchanged semantic snapshot", async () => {
    const running = await startServices();
    const listener = vi.fn();
    running.subscribe(listener);
    const metadataReads = serviceHarness.adapter.getSceneMetadata.mock.calls.length;

    serviceHarness.callbacks.metadata?.({});
    await waitForMetadataReads(metadataReads + 1);

    expect(listener).not.toHaveBeenCalled();
  });

  it("does not notify subscribers for token movement absent from UI view models", async () => {
    const running = await startServices();
    const listener = vi.fn();
    running.subscribe(listener);
    const metadataReads = serviceHarness.adapter.getSceneMetadata.mock.calls.length;
    const sourceItem = serviceHarness.state.items[0];
    if (!sourceItem) throw new Error("Expected the source item fixture");
    sourceItem.position = { x: 10, y: 20 };

    serviceHarness.callbacks.items?.(structuredClone(serviceHarness.state.items));
    await waitForMetadataReads(metadataReads + 1);

    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies subscribers once for an actual model change", async () => {
    const running = await startServices();
    const listener = vi.fn();
    running.subscribe(listener);
    const metadataReads = serviceHarness.adapter.getSceneMetadata.mock.calls.length;
    const firstSide = serviceHarness.scene.sides[0];
    if (!firstSide) throw new Error("Expected the side fixture");
    firstSide.name = "Алые";

    serviceHarness.callbacks.metadata?.({});
    await waitForMetadataReads(metadataReads + 1);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(running.getSnapshot().sides[0]?.name).toBe("Алые");
  });

  it("adds protocol version 2 to extension-generated commands", async () => {
    const running = await startServices();

    await running.send({ type: "START_ALL" });

    expect(serviceHarness.adapter.send).toHaveBeenCalledWith(
      "com.letopis.army-control/command",
      expect.objectContaining({ protocolVersion: COMMAND_PROTOCOL_VERSION, type: "START_ALL" })
    );
  });

  it("prefers a live non-expired lease holder over lexical GM election", async () => {
    serviceHarness.state.coordinatorLease = {
      connectionId: "z-lease-holder",
      epoch: 7,
      expiresAt: Date.now() + 60_000
    };
    serviceHarness.state.party = [
      {
        id: "fallback-gm",
        connectionId: "a-fallback",
        name: "Fallback",
        color: "#111",
        role: "GM"
      },
      {
        id: "lease-gm",
        connectionId: "z-lease-holder",
        name: "Lease holder",
        color: "#222",
        role: "GM"
      }
    ];
    serviceHarness.state.ackConnectionId = "z-lease-holder";
    serviceHarness.state.ackMode = { status: "REJECTED", reason: "GM_ONLY" };
    const running = await startServices();
    const livePartyReads = serviceHarness.sdk.party.getPlayers.mock.calls.length;

    await running.send({ type: "START_ALL" });

    expect(serviceHarness.sdk.party.getPlayers).toHaveBeenCalledTimes(livePartyReads + 1);
    expect(serviceHarness.adapter.send).toHaveBeenCalledTimes(1);
  });

  it("falls back live when a non-expired lease holder disconnected", async () => {
    serviceHarness.state.coordinatorLease = {
      connectionId: "disconnected-holder",
      epoch: 9,
      expiresAt: Date.now() + 60_000
    };
    serviceHarness.state.ackMode = { status: "REJECTED", reason: "GM_ONLY" };
    const running = await startServices();
    const livePartyReads = serviceHarness.sdk.party.getPlayers.mock.calls.length;
    vi.useFakeTimers();

    const pending = running.send({ type: "START_ALL" });
    await vi.runAllTimersAsync();
    await pending;

    expect(serviceHarness.sdk.party.getPlayers).toHaveBeenCalledTimes(livePartyReads + 1);
    expect(serviceHarness.notificationShow).toHaveBeenCalledWith(
      notificationMessage("GM_ONLY"),
      "WARNING"
    );
  });

  it("falls back to live GM election when the persisted lease is expired", async () => {
    serviceHarness.state.coordinatorLease = {
      connectionId: "expired-coordinator",
      epoch: 3,
      expiresAt: Date.now() - 1
    };
    serviceHarness.state.ackMode = { status: "REJECTED", reason: "GM_ONLY" };
    const running = await startServices();
    const livePartyReads = serviceHarness.sdk.party.getPlayers.mock.calls.length;

    await running.send({ type: "START_ALL" });

    expect(serviceHarness.sdk.party.getPlayers).toHaveBeenCalledTimes(livePartyReads + 1);
    expect(serviceHarness.adapter.send).toHaveBeenCalledTimes(1);
  });

  it("shows NO_COORDINATOR immediately without broadcasting", async () => {
    serviceHarness.state.currentRole = "PLAYER";
    serviceHarness.state.party = [];
    const running = await startServices();

    await running.send({ type: "START_ALL" });

    expect(serviceHarness.adapter.send).not.toHaveBeenCalled();
    expect(serviceHarness.notificationShow).toHaveBeenCalledWith(
      notificationMessage("NO_COORDINATOR"),
      "WARNING"
    );
  });

  it("reports forged acknowledgements to diagnostics before accepting the trusted reply", async () => {
    const reporter = vi.spyOn(DiagnosticsService.prototype, "recordAckRejection");
    serviceHarness.state.ackMode = { status: "NONE" };
    const running = await startServices();
    const pending = running.send({ type: "START_ALL" });
    await vi.waitFor(() => expect(serviceHarness.adapter.send).toHaveBeenCalledTimes(1));
    const command = lastSentCommand();
    const requestId = command.requestId;
    const senderConnectionId = command.senderConnectionId;

    serviceHarness.emitAck("attacker", {
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId,
      status: "ACCEPTED",
      coordinatorConnectionId: "attacker",
      recipientConnectionId: senderConnectionId
    });
    serviceHarness.emitAck("coordinator", {
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId,
      status: "ACCEPTED",
      coordinatorConnectionId: "coordinator",
      recipientConnectionId: senderConnectionId
    });
    await pending;

    expect(reporter).toHaveBeenCalledWith(
      "WRONG_SENDER",
      expect.objectContaining({ connectionId: "attacker" })
    );
  });

  it("resolves the GM selection and sends REGISTER_ARMY for the selected side", async () => {
    const running = await startServices();

    await running.send({ type: "REGISTER_SELECTED_ARMY", sideId: "red" });

    expect(serviceHarness.adapter.send).toHaveBeenCalledWith(
      "com.letopis.army-control/command",
      expect.objectContaining({ type: "REGISTER_ARMY", itemId: "selected", sideId: "red" })
    );
  });

  it("configures and activates the GM map brush without broadcasting a command", async () => {
    const running = await startServices();

    await running.send({
      type: "OPEN_MAP_BRUSH",
      settings: {
        mode: "FACTION_TERRITORY", size: 3, terrainId: "plain", sideId: "red",
        factionOperation: "ADD", impassable: true, eraserTarget: "TERRAIN"
      }
    });

    expect(serviceHarness.sdk.tool.setMetadata).toHaveBeenCalledWith(MAP_BRUSH_TOOL_ID, {
      [MAP_BRUSH_MODE_KEY]: "FACTION_TERRITORY",
      [MAP_BRUSH_SIZE_KEY]: 3,
      [MAP_BRUSH_TERRAIN_ID_KEY]: "plain",
      [MAP_BRUSH_SIDE_ID_KEY]: "red",
      [MAP_BRUSH_STATE_ID_KEY]: null,
      [MAP_BRUSH_FACTION_OPERATION_KEY]: "ADD",
      [MAP_BRUSH_IMPASSABLE_VALUE_KEY]: true,
      [MAP_BRUSH_ERASER_TARGET_KEY]: "TERRAIN"
    });
    expect(serviceHarness.sdk.tool.activateTool).toHaveBeenCalledWith(MAP_BRUSH_TOOL_ID);
    expect(serviceHarness.sdk.tool.activateMode).toHaveBeenCalledWith(MAP_BRUSH_TOOL_ID, MAP_BRUSH_TOOL_MODE_ID);
    expect(serviceHarness.adapter.send).not.toHaveBeenCalled();
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

  it("activates the ship route tool with the ship and previous tool metadata", async () => {
    const running = await startServices();

    await running.send({ type: "EDIT_SHIP_ROUTE", shipId: "ship-a" });

    expect(serviceHarness.sdk.tool.setMetadata).toHaveBeenCalledWith(SHIP_ROUTE_TOOL_ID, {
      [SHIP_ROUTE_SHIP_ID_KEY]: "ship-a",
      [SHIP_ROUTE_RETURN_TOOL_KEY]: "select-tool"
    });
    expect(serviceHarness.sdk.tool.activateTool).toHaveBeenCalledWith(SHIP_ROUTE_TOOL_ID);
    expect(serviceHarness.sdk.tool.activateMode).toHaveBeenCalledWith(
      SHIP_ROUTE_TOOL_ID,
      SHIP_ROUTE_TOOL_MODE_ID
    );
    expect(serviceHarness.adapter.send).not.toHaveBeenCalled();
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
    [{ status: "REJECTED", reason: "BACKGROUND_NOT_READY" } as const, "BACKGROUND_NOT_READY"],
    [{ status: "REJECTED", reason: "PROTOCOL_MISMATCH" } as const, "PROTOCOL_MISMATCH"],
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
