import { describe, expect, it } from "vitest";
import { CommandGateway } from "../commands/commandGateway";
import { DEFAULT_SETTINGS, METADATA_KEYS } from "../shared/constants";
import type { SceneState } from "../shared/types";
import type { BarrierRecord } from "../storage/metadataRepository";
import type { OwlbearPort } from "../owlbear/sdkAdapter";
import { extractBarrierSegments, mergeCurrentParticipant, ProductionEngine } from "./application";

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

function commandPort() {
  const sent: Array<{ channel: string; data: unknown }> = [];
  const scene: SceneState = {
    version: 2,
    revision: 2,
    settings: { ...DEFAULT_SETTINGS },
    sides: [],
    relations: {},
    battleGroups: [],
    coordinatorLease: { connectionId: "coordinator", epoch: 1, expiresAt: Date.now() + 10_000 }
  };
  const port = {
    getSceneMetadata: async () => ({ [METADATA_KEYS.scene]: scene }),
    patchSceneMetadata: async () => undefined,
    getSceneItems: async () => [],
    updateSceneItem: async () => undefined,
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
  return { port, sent };
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
          coordinatorConnectionId: "coordinator"
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
        reason: "FORGED_CONNECTION"
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
