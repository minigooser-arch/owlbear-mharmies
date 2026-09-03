// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { App } from "./App";
import type { ExtensionServices, RawExtensionSnapshot } from "./state/useExtensionState";

afterEach(cleanup);

function services(role: "GM" | "PLAYER" = "GM"): ExtensionServices {
  const snapshot: RawExtensionSnapshot = {
    ready: true,
    sceneReady: true,
    futureSchema: false,
    role,
    playerId: "gm",
    players: [],
    memberSideIds: new Set(["red"]),
    leaderSideIds: new Set(["red"]),
    mapVisibleSourceIds: new Set(["army", "ship"]),
    armies: [{
      id: "army",
      name: "1-я армия",
      sideId: "red",
      sideName: "Российская империя",
      status: "READY",
      route: [],
      movementMaxUnits: 10,
      movementRemainingUnits: 10,
      routeCostUnits: 0,
      routeCellCount: 0,
      routeRequiresReplan: false,
      atWar: false,
      healthHp: 50,
      healthMaxHp: 50,
      supplied: true,
      supplyCheckedOnTurn: 1,
      disbandPending: false
    }],
    sides: [{
      id: "red",
      name: "Российская империя",
      color: "#687F91",
      playerIds: ["gm"],
      leaderPlayerIds: ["gm"],
      stateId: null
    }],
    states: [],
    relations: {},
    battleGroups: [],
    settings: DEFAULT_SETTINGS,
    terrain: DEFAULT_TERRAIN,
    wars: [],
    turn: DEFAULT_TURN_STATE
  };
  const snapshotWithShips = {
    ...snapshot,
    ships: [{
      id: "ship",
      name: "Севастополь",
      sideId: "red",
      sideName: "Российская империя",
      classId: "BATTLESHIP" as const,
      className: "Линкор",
      status: "READY" as const,
      hp: 30,
      maxHp: 30,
      temporaryHp: 0,
      armor: 3,
      movementMax: 2,
      movementRemaining: 2,
      plannedRouteCellCount: 0,
      facing: "EAST" as const,
      normalDice: 3,
      normalRangeMin: 2,
      normalRangeMax: 3,
      embarkedArmyId: null
    }]
  };
  return {
    getSnapshot: () => snapshotWithShips,
    subscribe: () => () => undefined,
    send: async () => undefined,
    runDiagnostic: async () => undefined
  };
}

it("uses the Letopis WIKI light shell and troops navigation hierarchy", () => {
  render(<App services={services()} />);
  const shell = screen.getByRole("main");
  expect(shell).toHaveAttribute("data-theme", "letopis-wiki-light");
  expect(screen.getByText("Летопись", { selector: ".brand-kicker" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Военная панель" })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Разделы Летописи" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Войска" })).toBeInTheDocument();
});

it("separates army discovery controls from GM registration", () => {
  render(<App services={services()} />);
  fireEvent.click(screen.getByRole("button", { name: "Войска" }));
  expect(screen.getByRole("heading", { name: "Армии" })).toBeInTheDocument();
  expect(screen.getByText("Управление сухопутными соединениями, маршрутами и состоянием войск.")).toBeInTheDocument();
  expect(screen.getByRole("search", { name: "Поиск и фильтры армий" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Регистрация армии" })).toBeInTheDocument();
});

it("uses a compact management disclosure on army cards", () => {
  render(<App services={services()} />);
  fireEvent.click(screen.getByRole("button", { name: "Войска" }));
  expect(screen.getByText("1-я армия")).toBeInTheDocument();
  expect(screen.getByText("Управление", { selector: "summary" })).toBeInTheDocument();
  expect(screen.queryByText("Дополнительные действия")).not.toBeInTheDocument();
});

it("turns troops into an armies and fleet center", () => {
  render(<App services={services()} />);
  fireEvent.click(screen.getByRole("button", { name: "Войска" }));
  const forcesNav = screen.getByRole("navigation", { name: "Виды войск" });
  expect(forcesNav).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Армии" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Флот" }));
  expect(screen.getByRole("heading", { name: "Флот" })).toBeInTheDocument();
  expect(screen.getByText("Севастополь")).toBeInTheDocument();
  expect(screen.getByText("Линкор", { selector: ".ship-identity strong" })).toBeInTheDocument();
  expect(screen.getByLabelText("Параметры корабля Севастополь")).toHaveTextContent(/30 \/ 30 HP/);
  expect(screen.getByLabelText("Параметры корабля Севастополь")).toHaveTextContent(/Броня\s*3/);
  expect(screen.getByLabelText("Параметры корабля Севастополь")).toHaveTextContent(/2 \/ 2 ОП/);
});

it("keeps GM ship registration separate from the fleet list", () => {
  render(<App services={services()} />);
  fireEvent.click(screen.getByRole("button", { name: "Войска" }));
  fireEvent.click(screen.getByRole("button", { name: "Флот" }));
  expect(screen.getByRole("region", { name: "Регистрация корабля" })).toBeInTheDocument();
  expect(screen.getByLabelText("Класс нового корабля")).toBeInTheDocument();
  expect(screen.getByLabelText("Курс нового корабля")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Сделать кораблём" })).toBeInTheDocument();
});
