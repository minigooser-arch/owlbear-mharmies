// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { App } from "./App";
import type { ExtensionServices, RawExtensionSnapshot } from "./state/useExtensionState";

afterEach(cleanup);

function services(overrides: Partial<RawExtensionSnapshot> = {}): ExtensionServices {
  const snapshot: RawExtensionSnapshot = {
    ready: true,
    sceneReady: true,
    futureSchema: false,
    role: "PLAYER",
    playerId: "owner",
    players: [],
    memberSideIds: new Set(["A"]),
    leaderSideIds: new Set(),
    mapVisibleSourceIds: new Set(["own-a"]),
    armies: [
      { id: "own-a", name: "Своя армия", sideId: "A", sideName: "Красные", status: "READY", route: [], movementMaxUnits: 10, movementRemainingUnits: 10, routeCostUnits: 0, routeCellCount: 0, routeRequiresReplan: false, atWar: false, healthHp: 50, healthMaxHp: 50, supplied: true, supplyCheckedOnTurn: 1, disbandPending: false },
      { id: "hidden-b", name: "Скрытая армия", sideId: "B", sideName: "Синие", status: "MOVING", route: [], movementMaxUnits: 10, movementRemainingUnits: 10, routeCostUnits: 0, routeCellCount: 0, routeRequiresReplan: false, atWar: false, healthHp: 50, healthMaxHp: 50, supplied: true, supplyCheckedOnTurn: 1, disbandPending: false }
    ],
    sides: [],
    states: [],
    relations: {},
    battleGroups: [],
    settings: DEFAULT_SETTINGS,
    terrain: DEFAULT_TERRAIN,
    wars: [],
    turn: DEFAULT_TURN_STATE,
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

it("uses the versioned sword icon in the popover header", () => {
  render(<App services={services()} />);
  expect(screen.getByRole("img", { name: "Летопись: Армии" })).toHaveAttribute(
    "src",
    "/icon-1.2.png"
  );
});

it("uses a focused player navigation", () => {
  render(<App services={services()} />);
  expect(screen.getByRole("button", { name: "Армии" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Ход" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Бои" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Стороны" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Диагностика" })).not.toBeInTheDocument();
});

it("uses a separate GM operations navigation", () => {
  render(<App services={services({ role: "GM", mapVisibleSourceIds: new Set() })} />);
  expect(screen.getByRole("button", { name: "Обзор" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Армии" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Карта" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Бои" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Управление" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Войны" })).not.toBeInTheDocument();
});

it("shows turn administration on the turn page only to the GM", () => {
  const { unmount } = render(<App services={services()} />);
  screen.getByRole("button", { name: "Ход" }).click();
  expect(screen.getByText("Ход №1")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Остановить ходы" })).not.toBeInTheDocument();
  unmount();

  render(<App services={services({ role: "GM", mapVisibleSourceIds: new Set() })} />);
  expect(screen.getByRole("button", { name: "Обзор" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Завершить ход сейчас" })).toBeInTheDocument();
});


it("keeps leader faction management inside the armies screen", () => {
  render(<App services={services({ playerId: "leader", leaderSideIds: new Set(["A"]), sides: [{ id: "A", name: "Красные", color: "#f00", playerIds: ["leader"], leaderPlayerIds: ["leader"], stateId: null }] })} />);
  expect(screen.queryByRole("button", { name: "Стороны" })).not.toBeInTheDocument();
  expect(screen.getByText("Управление фракцией")).toBeInTheDocument();
});

it("renders loading, no-scene, and future-schema states", () => {
  const { rerender } = render(<App services={services({ ready: false })} />);
  expect(screen.getByText("Загрузка…")).toBeInTheDocument();
  rerender(<App services={services({ sceneReady: false })} />);
  expect(screen.getByText("Откройте сцену Owlbear Rodeo.")).toBeInTheDocument();
  rerender(<App services={services({ futureSchema: true })} />);
  expect(screen.getByText(/более новой версией расширения/)).toBeInTheDocument();
});
