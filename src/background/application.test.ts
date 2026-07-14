import { describe, expect, it } from "vitest";
import { CommandGateway } from "../commands/commandGateway";
import { DEFAULT_SETTINGS, METADATA_KEYS } from "../shared/constants";
import type { SceneItemRecord, SceneState } from "../shared/types";
import type { BarrierRecord } from "../storage/metadataRepository";
import type { OwlbearPort } from "../owlbear/sdkAdapter";
import {
  extractBarrierSegments,
  localOverlayIds,
  mergeCurrentParticipant,
  ProductionEngine
} from "./application";

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

function commandPort(initialItems: SceneItemRecord[] = []) {
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
    getLocalItems: async () => [],
    addLocalItem: async () => undefined,
    updateLocalItem: async () => undefined,
    deleteLocalItems: async () => undefined,
    createClone: () => { throw new Error("not used"); },
    send: async (channel: string, data: unknown) => { sent.push({ channel, data }); },
    on: () => () => undefined,
    getGridDistance: async () => 0,
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
    fixture.port.updateSceneItem = async () => {
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
