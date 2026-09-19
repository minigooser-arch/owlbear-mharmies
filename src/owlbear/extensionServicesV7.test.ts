import { expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  let coreListener: (() => void) | undefined;
  let currentSnapshot = {
    ready: true,
    sceneReady: true,
    futureSchema: false,
    role: "GM" as const,
    playerId: "gm",
    players: [],
    memberSideIds: new Set<string>(),
    leaderSideIds: new Set<string>(),
    mapVisibleSourceIds: new Set<string>(),
    armies: [],
    ships: [],
    sides: [],
    states: [],
    relations: {},
    battleGroups: [],
    settings: {},
    terrain: {},
    wars: [],
    turn: {}
  };
  const core = {
    getSnapshot: vi.fn(() => currentSnapshot),
    subscribe: vi.fn((listener: () => void) => {
      coreListener = listener;
      return () => undefined;
    }),
    send: vi.fn(async () => undefined),
    runDiagnostic: vi.fn(async () => undefined),
    stop: vi.fn()
  };
  const sdk = {
    scene: {
      isReady: vi.fn(async () => true),
      getMetadata: vi.fn(async () => {
        throw new Error("temporary metadata failure");
      }),
      onMetadataChange: vi.fn(() => () => undefined)
    }
  };
  return {
    core,
    sdk,
    get snapshot() {
      return currentSnapshot;
    },
    replaceSnapshot(next: typeof currentSnapshot) {
      currentSnapshot = next;
      coreListener?.();
    }
  };
});

vi.mock("@owlbear-rodeo/sdk", () => ({ default: harness.sdk }));
vi.mock("./extensionServicesCore", () => ({
  buildRoleSafeSnapshot: vi.fn(() => harness.snapshot),
  createOwlbearExtensionServices: vi.fn(async () => harness.core)
}));

import { createOwlbearExtensionServices } from "./extensionServicesV7";

it("starts from the core snapshot when the strategic metadata overlay cannot be read", async () => {
  const services = await createOwlbearExtensionServices();

  expect(services.getSnapshot()).toEqual(expect.objectContaining({
    ready: true,
    sceneReady: true,
    stateRelations: {},
    strategicCities: []
  }));
  expect(harness.core.subscribe).toHaveBeenCalledTimes(1);
  expect(harness.sdk.scene.getMetadata).toHaveBeenCalledTimes(1);

  services.stop();
  expect(harness.core.stop).toHaveBeenCalledTimes(1);
});

it("returns the same snapshot reference until the external store actually changes", async () => {
  const services = await createOwlbearExtensionServices();

  const first = services.getSnapshot();
  const second = services.getSnapshot();
  const third = services.getSnapshot();

  expect(second).toBe(first);
  expect(third).toBe(first);

  services.stop();
});

it("rebuilds the cached snapshot after the core store publishes a new snapshot", async () => {
  const services = await createOwlbearExtensionServices();
  const first = services.getSnapshot();

  harness.replaceSnapshot({
    ...harness.snapshot,
    playerId: "gm-2"
  });

  const second = services.getSnapshot();
  expect(second).not.toBe(first);
  expect(second.playerId).toBe("gm-2");
  expect(services.getSnapshot()).toBe(second);

  services.stop();
});
