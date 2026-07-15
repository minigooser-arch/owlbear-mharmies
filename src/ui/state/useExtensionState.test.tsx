// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../shared/constants";
import { useExtensionState, type ExtensionServices } from "./useExtensionState";

it("constructs player lists and counters from member sides, not map visibility", () => {
  const snapshot = {
    ready: true,
    sceneReady: true,
    futureSchema: false,
    role: "PLAYER" as const,
    playerId: "p",
    players: [],
    memberSideIds: new Set(["A"]),
    leaderSideIds: new Set<string>(),
    mapVisibleSourceIds: new Set(["b"]),
    armies: [
      { id: "a", name: "A", sideId: "A", sideName: "A", status: "READY" as const, route: [] },
      { id: "b", name: "B", sideId: "B", sideName: "B", status: "IN_BATTLE" as const, route: [] }
    ],
    sides: [],
    relations: {},
    battleGroups: [],
    settings: DEFAULT_SETTINGS
  };
  const services: ExtensionServices = {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    send: async () => undefined,
    runDiagnostic: async () => undefined
  };
  const { result } = renderHook(() => useExtensionState(services));
  expect(result.current.armies.map((army) => army.id)).toEqual(["a"]);
  expect(result.current.counters).toEqual({ total: 1, moving: 0, inBattle: 0 });
});
