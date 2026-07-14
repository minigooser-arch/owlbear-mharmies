// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../shared/constants";
import { App } from "./App";
import type { ExtensionServices, RawExtensionSnapshot } from "./state/useExtensionState";

function services(overrides: Partial<RawExtensionSnapshot> = {}): ExtensionServices {
  const snapshot: RawExtensionSnapshot = {
    ready: true,
    sceneReady: true,
    futureSchema: false,
    role: "PLAYER",
    playerId: "owner",
    visibleSourceIds: new Set(["own-a"]),
    armies: [
      { id: "own-a", name: "Своя армия", sideId: "A", sideName: "Красные", status: "READY", directOwnerPlayerId: "owner", route: [] },
      { id: "hidden-b", name: "Скрытая армия", sideId: "B", sideName: "Синие", status: "MOVING", route: [] }
    ],
    sides: [],
    relations: {},
    battleGroups: [],
    settings: DEFAULT_SETTINGS,
    ...overrides
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    send: async () => undefined,
    runDiagnostic: async () => undefined
  };
}

it("does not render a hidden enemy in cards, filters, or counters", () => {
  render(<App services={services()} />);
  expect(screen.getByText("Своя армия")).toBeInTheDocument();
  expect(screen.queryByText("Скрытая армия")).not.toBeInTheDocument();
  expect(screen.getByTestId("army-count")).toHaveTextContent("1");
});

it("shows GM management tabs but hides them from a player", () => {
  const { unmount } = render(<App services={services()} />);
  expect(screen.queryByRole("button", { name: "Стороны" })).not.toBeInTheDocument();
  unmount();
  render(<App services={services({ role: "GM", visibleSourceIds: new Set() })} />);
  expect(screen.getByRole("button", { name: "Стороны" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Настройки" })).toBeInTheDocument();
});

it("renders loading, no-scene, and future-schema states", () => {
  const { rerender } = render(<App services={services({ ready: false })} />);
  expect(screen.getByText("Загрузка…")).toBeInTheDocument();
  rerender(<App services={services({ sceneReady: false })} />);
  expect(screen.getByText("Откройте сцену Owlbear Rodeo.")).toBeInTheDocument();
  rerender(<App services={services({ futureSchema: true })} />);
  expect(screen.getByText(/более новой версией расширения/)).toBeInTheDocument();
});
