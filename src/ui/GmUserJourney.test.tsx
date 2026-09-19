// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { RawExtensionSnapshot, ExtensionServices } from "./state/useExtensionState";
import { App } from "./App";

afterEach(cleanup);

function mutableServices(initial: RawExtensionSnapshot) {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  const send = vi.fn(async () => undefined);
  const sendStrategic = vi.fn(async () => undefined);
  const services: ExtensionServices = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send,
    sendStrategic,
    runDiagnostic: vi.fn(async () => undefined)
  };
  return {
    services,
    send,
    sendStrategic,
    update(patch: Partial<RawExtensionSnapshot>) {
      snapshot = { ...snapshot, ...patch };
      for (const listener of listeners) listener();
    }
  };
}

function emptyGmSnapshot(): RawExtensionSnapshot {
  return {
    ready: true,
    sceneReady: true,
    futureSchema: false,
    role: "GM",
    playerId: "gm",
    players: [{ id: "gm", name: "Ведущий", color: "#333333", role: "GM", connected: true }],
    memberSideIds: new Set(),
    leaderSideIds: new Set(),
    mapVisibleSourceIds: new Set(),
    armies: [],
    ships: [],
    sides: [],
    states: [],
    strategicCities: [],
    relations: {},
    stateRelations: {},
    battleGroups: [],
    settings: structuredClone(DEFAULT_SETTINGS),
    terrain: structuredClone(DEFAULT_TERRAIN),
    wars: [],
    turn: structuredClone(DEFAULT_TURN_STATE)
  };
}

it("lets a GM continue from an empty hydrated scene through map, cities and rebellion setup", async () => {
  const store = mutableServices(emptyGmSnapshot());
  render(<App services={store.services} />);

  fireEvent.click(screen.getByRole("button", { name: "Карта" }));
  fireEvent.change(screen.getByLabelText("Режим кисти"), { target: { value: "RECOGNIZED_STATE" } });
  expect(screen.getByLabelText("Государство для разметки")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Начать рисовать" })).toBeDisabled();

  const sides = [
    {
      id: "government",
      name: "Правительство",
      color: "#b3261e",
      playerIds: ["gm"],
      leaderPlayerIds: ["gm"],
      stateId: "russia"
    },
    {
      id: "rebels",
      name: "Оппозиция",
      color: "#445566",
      playerIds: [],
      leaderPlayerIds: [],
      stateId: "russia"
    }
  ];
  const states = [{
    id: "russia",
    name: "Россия",
    color: "#607d8b",
    rulingFactionId: "government",
    active: true
  }];
  const strategicCities = [{
    id: "moscow",
    name: "Москва",
    cells: [{ x: 0, y: 0 }],
    recognizedStateId: "russia",
    deFactoStateId: "russia",
    factionInfluenceId: "government",
    mayorId: null,
    isCapital: true,
    historicalBuildTypeCount: 1
  }];

  act(() => {
    store.update({ sides, states, strategicCities });
  });

  expect(screen.getByLabelText("Государство для разметки")).toHaveValue("russia");
  expect(screen.getByRole("button", { name: "Начать рисовать" })).toBeEnabled();

  fireEvent.click(screen.getByRole("button", { name: "Города" }));
  expect(screen.getByLabelText("Государство")).toHaveValue("russia");
  expect(screen.getByRole("button", { name: "Создать город" })).toBeEnabled();

  fireEvent.change(screen.getByLabelText("ID города"), { target: { value: "tula" } });
  fireEvent.change(screen.getByLabelText("Название города"), { target: { value: "Тула" } });
  fireEvent.change(screen.getByLabelText("Клетки города"), { target: { value: "2,0" } });
  fireEvent.click(screen.getByRole("button", { name: "Создать город" }));

  expect(store.sendStrategic).toHaveBeenCalledWith(expect.objectContaining({
    type: "CREATE_STRATEGIC_CITY",
    city: expect.objectContaining({
      id: "tula",
      recognizedStateId: "russia",
      deFactoStateId: "russia"
    })
  }));

  fireEvent.click(screen.getByRole("button", { name: "Управление" }));
  fireEvent.click(screen.getByRole("button", { name: "Восстания" }));

  expect(screen.getByLabelText("Государство восстания")).toHaveValue("russia");
  expect(screen.getByLabelText("Столица восстания")).toHaveValue("moscow");
  expect(screen.getByLabelText("Государство-источник раскола")).toHaveValue("russia");
  expect(screen.getByLabelText("Повстанческая фракция")).toHaveValue("rebels");

  fireEvent.click(screen.getByRole("checkbox", { name: "Участник восстания: Оппозиция" }));
  fireEvent.click(screen.getByRole("button", { name: "Запустить восстание" }));

  expect(store.send).toHaveBeenCalledWith(expect.objectContaining({
    type: "START_REBELLION",
    sourceStateId: "russia",
    capitalCityId: "moscow",
    participantFactionIds: ["rebels"]
  }));
});
