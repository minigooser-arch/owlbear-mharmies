import { expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  const snapshot = {
    ready: true,
    sceneReady: true,
    futureSchema: false,
    role: "GM",
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
    getSnapshot: vi.fn(() => snapshot),
    subscribe: vi.fn(() => () => undefined),
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
  return { snapshot, core, sdk };
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
