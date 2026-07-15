import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { CommandGateway } from "../commands/commandGateway";
import { DEFAULT_SETTINGS, METADATA_KEYS } from "../shared/constants";
import type { SceneItemRecord, SceneState } from "../shared/types";
import type { BarrierRecord } from "../storage/metadataRepository";
import type { OwlbearPort } from "../owlbear/sdkAdapter";
import {
  extractBarrierSegments,
  localOverlayIds,
  mergeCurrentParticipant,
  ProductionEngine,
  SceneWorkTracker
} from "./application";

it("drains tracked scene work before a scene can reopen", async () => {
  const tracker = new SceneWorkTracker();
  let release: (() => void) | undefined;
  tracker.track(new Promise<void>((resolve) => { release = resolve; }));
  let drained = false;
  const drainWork = tracker.drain().then(() => { drained = true; });
  await Promise.resolve();
  expect(drained).toBe(false);
  release?.();
  await drainWork;
  expect(drained).toBe(true);
});

it("extracts only requested blocking polylines into barrier segments", () => {
  const records: BarrierRecord[] = [
    {
      item: {
        id: "wall",
        type: "CURVE",
        position: { x: 0, y: 0 },
        metadata: {},
        points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]
      },
      state: {
        version: 1,
        revision: 1,
        blocksMovement: true,
        blocksVision: false,
        visibility: "GM_ONLY",
        color: "#f00"
      }
    }
  ];
  expect(extractBarrierSegments(records, "movement")).toHaveLength(2);
  expect(extractBarrierSegments(records, "vision")).toEqual([]);
});

it("includes route drafts in local overlay cleanup", () => {
  expect(localOverlayIds([
    {
      id: "route-preview",
      type: "CURVE",
      position: { x: 0, y: 0 },
      metadata: { [METADATA_KEYS.routePreview]: { kind: "LINE" } }
    },
    {
      id: "keep",
      type: "LABEL",
      position: { x: 0, y: 0 },
      metadata: { other: true }
    }
  ])).toEqual(["route-preview"]);
});

function commandPort(
  initialItems: SceneItemRecord[] = [],
  getGridDistance = async (from: { x: number; y: number }, to: { x: number; y: number }) =>
    Math.hypot(to.x - from.x, to.y - from.y)
) {
  const sent: Array<{ channel: string; data: unknown }> = [];
  const items = structuredClone(initialItems);
  let scene: SceneState = {
    version: 2,
    revision: 2,
    settings: { ...DEFAULT_SETTINGS },
    sides: [],
    relations: {},
    battleGroups: [],
    coordinatorLease: { connectionId: "coordinator", epoch: 1, expiresAt: Date.now() + 10_000 }
  };
  const port = {
    getSceneMetadata: async () => ({ [METADATA_KEYS.scene]: structuredClone(scene) }),
    patchSceneMetadata: async (update: Record<string, unknown>) => {
      if (update[METADATA_KEYS.scene]) {
        scene = structuredClone(update[METADATA_KEYS.scene]) as SceneState;
      }
    },
    getSceneItems: async () => structuredClone(items),
    updateSceneItem: async (id: string, update: Record<string, unknown>) => {
      const item = items.find((candidate) => candidate.id === id);
      if (!item) throw new Error(`Missing item ${id}`);
      Object.assign(item, structuredClone(update));
    },
    patchSceneItemMetadata: async (
      id: string,
      key: string,
      value: unknown,
      update: Record<string, unknown> = {}
    ) => {
      const item = items.find((candidate) => candidate.id === id);
      if (!item) throw new Error(`Missing item ${id}`);
      Object.assign(item, structuredClone(update));
      if (value === undefined) {
        item.metadata = Object.fromEntries(
          Object.entries(item.metadata).filter(([metadataKey]) => metadataKey !== key)
        );
      } else {
        item.metadata[key] = structuredClone(value);
      }
    },
    getLocalItems: async () => [],
    addLocalItem: async () => undefined,
    updateLocalItem: async () => undefined,
    deleteLocalItems: async () => undefined,
    createClone: () => { throw new Error("not used"); },
    send: async (channel: string, data: unknown) => { sent.push({ channel, data }); },
    on: () => () => undefined,
    getGridDistance,
    onGridChange: () => () => undefined,
    show: async () => undefined,
    getRole: async () => "GM" as const,
    getItem: async () => undefined,
    getSceneState: async () => scene,
    updateItem: async () => undefined,
    deleteLocalItemsForSource: async () => undefined
  } as unknown as OwlbearPort;
  return { port, sent, items, get scene() { return scene; } };
}

describe("ProductionEngine command boundary", () => {
  it("does not finish an old heartbeat after coordinator shutdown", async () => {
    const fixture = commandPort();
    let releaseRead: (() => void) | undefined;
    fixture.port.getSceneMetadata = () => new Promise<Record<string, unknown>>((resolve) => {
      releaseRead = () => resolve({
        [METADATA_KEYS.scene]: structuredClone(fixture.scene)
      });
    });
    let writes = 0;
    fixture.port.patchSceneMetadata = async () => { writes += 1; };
    const engine = new ProductionEngine(fixture.port);
    engine.setCoordinator(true, "coordinator");

    const heartbeat = engine.writeCoordinatorHeartbeat({
      connectionId: "coordinator",
      epoch: 2,
      expiresAt: Date.now() + 3_000
    });
    await vi.waitFor(() => expect(releaseRead).toBeTypeOf("function"));
    engine.setCoordinator(false);
    releaseRead?.();
    await heartbeat;

    expect(writes).toBe(0);
  });

  it("cancels a heartbeat when coordinator shutdown happens during its commit read", async () => {
    const fixture = commandPort();
    let reads = 0;
    let releaseCommitRead: (() => void) | undefined;
    fixture.port.getSceneMetadata = async () => {
      reads += 1;
      if (reads === 2) {
        await new Promise<void>((resolve) => { releaseCommitRead = resolve; });
      }
      return { [METADATA_KEYS.scene]: structuredClone(fixture.scene) };
    };
    let writes = 0;
    fixture.port.patchSceneMetadata = async () => { writes += 1; };
    const engine = new ProductionEngine(fixture.port);
    engine.setCoordinator(true, "coordinator");

    const heartbeat = engine.writeCoordinatorHeartbeat({
      connectionId: "coordinator",
      epoch: 2,
      expiresAt: Date.now() + 3_000
    });
    await vi.waitFor(() => expect(releaseCommitRead).toBeTypeOf("function"));
    engine.setCoordinator(false);
    releaseCommitRead?.();
    await heartbeat;

    expect(writes).toBe(0);
  });

  it("acknowledges a malformed command instead of throwing or timing out", async () => {
    const fixture = commandPort();
    const engine = new ProductionEngine(fixture.port);
    engine.setCoordinator(true);

    await expect(engine.processCommand(
      {
        connectionId: "actual-connection",
        data: {
          requestId: "malformed-request",
          senderPlayerId: "actual-player",
          senderConnectionId: "actual-connection",
          expectedRevision: 2,
          type: "CREATE_SIDE"
        }
      },
      {
        role: "PLAYER",
        playerId: "actual-player",
        connectionId: "actual-connection",
        connectedPlayerIds: new Set(["actual-player"])
      }
    )).resolves.toBeUndefined();

    expect(fixture.sent).toEqual([
      {
        channel: CommandGateway.ACK_CHANNEL,
        data: {
          requestId: "malformed-request",
          status: "REJECTED",
          reason: "INVALID_COMMAND",
          coordinatorConnectionId: "coordinator",
          recipientConnectionId: "actual-connection"
        }
      }
    ]);
  });

  it("uses the derived sender and acknowledges forged envelope ids", async () => {
    const fixture = commandPort();
    const engine = new ProductionEngine(fixture.port);
    engine.setCoordinator(true);

    await engine.processCommand(
      {
        connectionId: "actual-connection",
        data: {
          requestId: "forged-request",
          senderPlayerId: "forged-player",
          senderConnectionId: "forged-connection",
          expectedRevision: 2,
          type: "START_ALL"
        }
      },
      {
        role: "PLAYER",
        playerId: "actual-player",
        connectionId: "actual-connection",
        connectedPlayerIds: new Set(["actual-player"])
      }
    );

    expect(fixture.sent[0]).toMatchObject({
      channel: CommandGateway.ACK_CHANNEL,
      data: {
        requestId: "forged-request",
        status: "REJECTED",
        reason: "FORGED_CONNECTION",
        recipientConnectionId: "actual-connection"
      }
    });
  });

  it("persists barrier command changes on their scene item", async () => {
    const fixture = commandPort([{
      id: "wall",
      type: "CURVE",
      position: { x: 0, y: 0 },
      metadata: {
        [METADATA_KEYS.barrier]: {
          version: 1,
          revision: 1,
          blocksMovement: true,
          blocksVision: true,
          visibility: "GM_ONLY",
          color: "#f00"
        }
      }
    }]);
    const engine = new ProductionEngine(fixture.port);
    engine.setCoordinator(true);

    await engine.processCommand(
      {
        connectionId: "gm-connection",
        data: {
          requestId: "barrier-request",
          senderPlayerId: "gm",
          senderConnectionId: "gm-connection",
          expectedRevision: 2,
          type: "UPDATE_BARRIER",
          itemId: "wall",
          barrier: { color: "#0f0" }
        }
      },
      {
        role: "GM",
        playerId: "gm",
        connectionId: "gm-connection",
        connectedPlayerIds: new Set(["gm"])
      }
    );

    expect(fixture.items[0]?.metadata[METADATA_KEYS.barrier]).toMatchObject({
      revision: 2,
      color: "#0f0"
    });
  });

  it("serializes concurrent commands so the second sees the new revision", async () => {
    const fixture = commandPort();
    const engine = new ProductionEngine(fixture.port);
    engine.setCoordinator(true);
    const sender = {
      role: "GM" as const,
      playerId: "gm",
      connectionId: "gm-connection",
      connectedPlayerIds: new Set(["gm"])
    };
    const createSide = (requestId: string, sideId: string) => engine.processCommand(
      {
        connectionId: "gm-connection",
        data: {
          requestId,
          senderPlayerId: "gm",
          senderConnectionId: "gm-connection",
          expectedRevision: 2,
          type: "CREATE_SIDE",
          side: {
            id: sideId,
            name: sideId,
            color: "#f00",
            playerIds: [],
            leaderPlayerIds: []
          }
        }
      },
      sender
    );

    await Promise.all([createSide("request-a", "A"), createSide("request-b", "B")]);

    expect(fixture.sent.map(({ data }) => (data as { status: string }).status).sort()).toEqual([
      "ACCEPTED",
      "CONFLICT"
    ]);
    expect(fixture.scene.revision).toBe(3);
    expect(fixture.scene.sides).toHaveLength(1);
  });

  it("rejects a command when the scene revision changes immediately before commit", async () => {
    const fixture = commandPort();
    const readMetadata = fixture.port.getSceneMetadata.bind(fixture.port);
    let reads = 0;
    fixture.port.getSceneMetadata = async () => {
      const metadata = await readMetadata();
      reads += 1;
      if (reads >= 3) {
        const current = metadata[METADATA_KEYS.scene] as SceneState;
        metadata[METADATA_KEYS.scene] = { ...current, revision: 3 };
      }
      return metadata;
    };
    const engine = new ProductionEngine(fixture.port);
    engine.setCoordinator(true);

    await engine.processCommand(
      {
        connectionId: "gm-connection",
        data: {
          requestId: "raced-command",
          senderPlayerId: "gm",
          senderConnectionId: "gm-connection",
          expectedRevision: 2,
          type: "CREATE_SIDE",
          side: {
            id: "red",
            name: "Красные",
            color: "#f00",
            playerIds: [],
            leaderPlayerIds: []
          }
        }
      },
      {
        role: "GM",
        playerId: "gm",
        connectionId: "gm-connection",
        connectedPlayerIds: new Set(["gm"])
      }
    );

    expect(fixture.sent.at(-1)).toMatchObject({
      data: { status: "CONFLICT", actualRevision: 3 }
    });
    expect(fixture.scene.sides).toEqual([]);
  });

  it("sends a rejection instead of ACCEPTED when persistence fails", async () => {
    const fixture = commandPort([{
      id: "wall",
      type: "CURVE",
      position: { x: 0, y: 0 },
      metadata: {
        [METADATA_KEYS.barrier]: {
          version: 1,
          revision: 1,
          blocksMovement: true,
          blocksVision: true,
          visibility: "GM_ONLY",
          color: "#f00"
        }
      }
    }]);
    fixture.port.patchSceneItemMetadata = async () => {
      throw new Error("write failed");
    };
    const engine = new ProductionEngine(fixture.port);
    engine.setCoordinator(true);

    await expect(engine.processCommand(
      {
        connectionId: "gm-connection",
        data: {
          requestId: "failed-write",
          senderPlayerId: "gm",
          senderConnectionId: "gm-connection",
          expectedRevision: 2,
          type: "UPDATE_BARRIER",
          itemId: "wall",
          barrier: { color: "#0f0" }
        }
      },
      {
        role: "GM",
        playerId: "gm",
        connectionId: "gm-connection",
        connectedPlayerIds: new Set(["gm"])
      }
    )).resolves.toBeUndefined();

    expect(fixture.sent.at(-1)).toMatchObject({
      data: {
        requestId: "failed-write",
        status: "REJECTED",
        reason: "PERSISTENCE_FAILED",
        recipientConnectionId: "gm-connection"
      }
    });
  });

  it("rejects a crafted SET_ROUTE that exceeds the army's current route limit", async () => {
    const fixture = commandPort([{
      id: "army",
      type: "IMAGE",
      position: { x: 0, y: 0 },
      metadata: {
        [METADATA_KEYS.army]: {
          version: 1,
          registered: true,
          sideId: "red",
          status: "READY",
          overrides: { maxRouteDistanceCells: 1 },
          route: [],
          currentWaypointIndex: 0,
          segmentProgressCells: 0,
          ignoresMovementBarriers: false,
          ignoresVisionBarriers: false,
          revision: 1
        }
      }
    }]);
    const engine = new ProductionEngine(fixture.port);
    engine.setCoordinator(true);

    await engine.processCommand(
      {
        connectionId: "gm-connection",
        data: {
          requestId: "long-route",
          senderPlayerId: "gm",
          senderConnectionId: "gm-connection",
          expectedRevision: 2,
          type: "SET_ROUTE",
          armyId: "army",
          route: [{ x: 2, y: 0 }]
        }
      },
      {
        role: "GM",
        playerId: "gm",
        connectionId: "gm-connection",
        connectedPlayerIds: new Set(["gm"])
      }
    );

    expect(fixture.sent.at(-1)).toMatchObject({
      data: { requestId: "long-route", status: "REJECTED", reason: "ROUTE_LIMIT" }
    });
    expect(fixture.scene.revision).toBe(2);
  });

  it("rolls back an item write when the scene changes before the command commit", async () => {
    const fixture = commandPort([{
      id: "army",
      type: "IMAGE",
      position: { x: 0, y: 0 },
      visible: false,
      metadata: {
        [METADATA_KEYS.army]: {
          version: 1,
          registered: true,
          sideId: "red",
          status: "READY",
          overrides: {},
          route: [],
          currentWaypointIndex: 0,
          segmentProgressCells: 0,
          ignoresMovementBarriers: false,
          ignoresVisionBarriers: false,
          revision: 1
        }
      }
    }]);
    const patchMetadata = fixture.port.patchSceneItemMetadata.bind(fixture.port);
    const readMetadata = fixture.port.getSceneMetadata.bind(fixture.port);
    let itemWasWritten = false;
    fixture.port.patchSceneItemMetadata = async (...args) => {
      await patchMetadata(...args);
      if (args[0] === "army") itemWasWritten = true;
    };
    fixture.port.getSceneMetadata = async () => {
      const metadata = await readMetadata();
      if (itemWasWritten) {
        const current = metadata[METADATA_KEYS.scene] as SceneState;
        metadata[METADATA_KEYS.scene] = { ...current, revision: 3 };
      }
      return metadata;
    };
    const engine = new ProductionEngine(fixture.port);
    engine.setCoordinator(true);

    await engine.processCommand(
      {
        connectionId: "gm-connection",
        data: {
          requestId: "route-race",
          senderPlayerId: "gm",
          senderConnectionId: "gm-connection",
          expectedRevision: 2,
          type: "SET_ROUTE",
          armyId: "army",
          route: [{ x: 1, y: 0 }]
        }
      },
      {
        role: "GM",
        playerId: "gm",
        connectionId: "gm-connection",
        connectedPlayerIds: new Set(["gm"])
      }
    );

    expect(fixture.sent.at(-1)).toMatchObject({
      data: { status: "REJECTED", reason: "PERSISTENCE_FAILED" }
    });
    expect(fixture.items[0]).toMatchObject({
      visible: false,
      metadata: {
        [METADATA_KEYS.army]: { revision: 1, route: [] }
      }
    });
  });

  it("rolls back an item write when coordinator lease is lost during the final read", async () => {
    const fixture = commandPort([{
      id: "army",
      type: "IMAGE",
      position: { x: 0, y: 0 },
      visible: false,
      metadata: {
        [METADATA_KEYS.army]: {
          version: 1,
          registered: true,
          sideId: "red",
          status: "READY",
          overrides: {},
          route: [],
          currentWaypointIndex: 0,
          segmentProgressCells: 0,
          ignoresMovementBarriers: false,
          ignoresVisionBarriers: false,
          revision: 1
        }
      }
    }]);
    const patchItemMetadata = fixture.port.patchSceneItemMetadata.bind(fixture.port);
    const readSceneMetadata = fixture.port.getSceneMetadata.bind(fixture.port);
    let itemWasWritten = false;
    let releaseFinalRead: (() => void) | undefined;
    fixture.port.patchSceneItemMetadata = async (...args) => {
      await patchItemMetadata(...args);
      if (args[0] === "army") itemWasWritten = true;
    };
    fixture.port.getSceneMetadata = async () => {
      if (itemWasWritten && releaseFinalRead === undefined) {
        await new Promise<void>((resolve) => { releaseFinalRead = resolve; });
      }
      return readSceneMetadata();
    };
    const engine = new ProductionEngine(fixture.port);
    engine.setCoordinator(true, "coordinator");

    const command = engine.processCommand(
      {
        connectionId: "gm-connection",
        data: {
          requestId: "lease-race",
          senderPlayerId: "gm",
          senderConnectionId: "gm-connection",
          expectedRevision: 2,
          type: "SET_ROUTE",
          armyId: "army",
          route: [{ x: 1, y: 0 }]
        }
      },
      {
        role: "GM",
        playerId: "gm",
        connectionId: "gm-connection",
        connectedPlayerIds: new Set(["gm"])
      }
    );
    await vi.waitFor(() => expect(releaseFinalRead).toBeTypeOf("function"));
    engine.setCoordinator(false);
    releaseFinalRead?.();
    await command;

    expect(fixture.sent.at(-1)).toMatchObject({
      data: { status: "REJECTED", reason: "PERSISTENCE_FAILED" }
    });
    expect(fixture.scene.revision).toBe(2);
    expect(fixture.items[0]).toMatchObject({
      visible: false,
      metadata: {
        [METADATA_KEYS.army]: { revision: 1, route: [] }
      }
    });
  });

  it("rejects a crafted SET_ROUTE that crosses a current movement barrier", async () => {
    const fixture = commandPort([
      {
        id: "army",
        type: "IMAGE",
        position: { x: 0, y: 0 },
        metadata: {
          [METADATA_KEYS.army]: {
            version: 1,
            registered: true,
            sideId: "red",
            status: "READY",
            overrides: {},
            route: [],
            currentWaypointIndex: 0,
            segmentProgressCells: 0,
            ignoresMovementBarriers: false,
            ignoresVisionBarriers: false,
            revision: 1
          }
        }
      },
      {
        id: "wall",
        type: "CURVE",
        position: { x: 0, y: 0 },
        points: [{ x: 1, y: -1 }, { x: 1, y: 1 }],
        metadata: {
          [METADATA_KEYS.barrier]: {
            version: 1,
            revision: 1,
            blocksMovement: true,
            blocksVision: false,
            visibility: "GM_ONLY",
            color: "#000"
          }
        }
      }
    ]);
    const engine = new ProductionEngine(fixture.port);
    engine.setCoordinator(true);

    await engine.processCommand(
      {
        connectionId: "gm-connection",
        data: {
          requestId: "blocked-route",
          senderPlayerId: "gm",
          senderConnectionId: "gm-connection",
          expectedRevision: 2,
          type: "SET_ROUTE",
          armyId: "army",
          route: [{ x: 2, y: 0 }]
        }
      },
      {
        role: "GM",
        playerId: "gm",
        connectionId: "gm-connection",
        connectedPlayerIds: new Set(["gm"])
      }
    );

    expect(fixture.sent.at(-1)).toMatchObject({
      data: { requestId: "blocked-route", status: "REJECTED", reason: "BARRIER" }
    });
    expect(fixture.scene.revision).toBe(2);
  });
});

it("includes the current player exactly once in the connected party", () => {
  expect(mergeCurrentParticipant(
    [
      { id: "other", connectionId: "other-connection", role: "PLAYER" },
      { id: "self", connectionId: "stale-connection", role: "PLAYER" }
    ],
    { id: "self", connectionId: "self-connection", role: "GM" }
  )).toEqual([
    { id: "other", connectionId: "other-connection", role: "PLAYER" },
    { id: "self", connectionId: "self-connection", role: "GM" }
  ]);
});
