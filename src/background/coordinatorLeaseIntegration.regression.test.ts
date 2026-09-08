import { expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type SceneState } from "../shared/types";
import type { OwlbearPort } from "../owlbear/sdkAdapter";
import { CoordinatorLease } from "./coordinator";
import { ProductionEngine } from "./application";

function fixture() {
  let scene: SceneState = {
    version: 6,
    revision: 2,
    settings: { ...DEFAULT_SETTINGS },
    sides: [],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: structuredClone(DEFAULT_TURN_STATE),
    ships: {},
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
  const sent: Array<{ channel: string; data: unknown }> = [];
  const port = {
    getSceneMetadata: async () => ({ [METADATA_KEYS.scene]: structuredClone(scene) }),
    patchSceneMetadata: async (update: Record<string, unknown>) => {
      if (update[METADATA_KEYS.scene] !== undefined) {
        scene = structuredClone(update[METADATA_KEYS.scene]) as SceneState;
      }
    },
    getSceneItems: async () => [],
    updateSceneItem: async () => undefined,
    patchSceneItemMetadata: async () => undefined,
    getLocalItems: async () => [],
    addLocalItem: async () => undefined,
    addLocalItems: async () => undefined,
    updateLocalItem: async () => undefined,
    updateLocalItems: async () => undefined,
    deleteLocalItems: async () => undefined,
    createClone: () => { throw new Error("not used"); },
    send: async (channel: string, data: unknown) => { sent.push({ channel, data }); },
    on: () => () => undefined,
    getGridDistance: async () => 0,
    getGridDpi: async () => 100,
    snapGridCenter: async (position: { x: number; y: number }) => ({ ...position }),
    onGridChange: () => () => undefined,
    show: async () => undefined
  } as unknown as OwlbearPort;
  return { port, sent, get scene() { return scene; } };
}

async function acquireInitialLease(engine: ProductionEngine) {
  const lease = new CoordinatorLease({
    currentConnectionId: async () => "gm-a",
    now: () => 10_000,
    participants: async () => [{ connectionId: "gm-a", role: "GM" as const }],
    readHeartbeat: () => engine.readCoordinatorLease(),
    writeHeartbeat: (heartbeat) => engine.writeCoordinatorHeartbeat(heartbeat),
    onTransition: (active, connectionId) => engine.setCoordinator(active, connectionId)
  });
  await lease.tick();
  return lease;
}

it("persists the initial coordinator lease before activating the production engine", async () => {
  const state = fixture();
  const engine = new ProductionEngine(state.port, () => new Date(10_000));

  await acquireInitialLease(engine);

  expect(state.scene.coordinatorLease).toEqual({
    connectionId: "gm-a",
    epoch: 1,
    expiresAt: 13_000
  });
  expect(engine.isCoordinator()).toBe(true);
});

it("accepts a map brush terrain command immediately after initial coordinator acquisition", async () => {
  const state = fixture();
  const engine = new ProductionEngine(state.port, () => new Date(10_000));
  await acquireInitialLease(engine);

  await engine.processCommand({
    connectionId: "gm-a",
    data: {
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: "paint-sea",
      senderPlayerId: "gm",
      senderConnectionId: "gm-a",
      expectedRevision: 2,
      type: "SET_TERRAIN_CELLS",
      cells: [{ x: 4, y: 7 }],
      terrainId: "sea"
    }
  }, {
    role: "GM",
    playerId: "gm",
    connectionId: "gm-a",
    connectedPlayerIds: new Set(["gm"])
  });

  const ack = state.sent.at(-1)?.data as { status?: string } | undefined;
  expect(ack?.status).toBe("ACCEPTED");
  expect(state.scene.gridMap.cells["4,7"]?.terrainId).toBe("sea");
  expect(state.scene.revision).toBe(3);
});

it("refuses to overwrite another live coordinator lease during initial acquisition", async () => {
  const state = fixture();
  state.scene.coordinatorLease = {
    connectionId: "gm-b",
    epoch: 4,
    expiresAt: 15_000
  };
  const engine = new ProductionEngine(state.port, () => new Date(10_000));

  await expect(engine.writeCoordinatorHeartbeat({
    connectionId: "gm-a",
    epoch: 5,
    expiresAt: 13_000
  })).rejects.toThrow("Coordinator lease is held by another live connection");

  expect(state.scene.coordinatorLease).toEqual({
    connectionId: "gm-b",
    epoch: 4,
    expiresAt: 15_000
  });
  expect(engine.isCoordinator()).toBe(false);
});
