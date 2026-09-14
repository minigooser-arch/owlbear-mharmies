// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { App } from "./App";
import type { ExtensionServices, RawExtensionSnapshot } from "./state/useExtensionState";

afterEach(cleanup);

it("requires explicit GM confirmation before sending a civil war split", () => {
  const snapshot: RawExtensionSnapshot = {
    ready: true,
    sceneReady: true,
    futureSchema: false,
    role: "GM",
    playerId: "gm",
    players: [],
    memberSideIds: new Set(),
    leaderSideIds: new Set(),
    mapVisibleSourceIds: new Set(),
    armies: [],
    ships: [],
    sides: [
      { id: "gov", name: "Правительство", color: "#333", playerIds: [], leaderPlayerIds: [], stateId: "state" },
      { id: "rebels", name: "Повстанцы", color: "#933", playerIds: [], leaderPlayerIds: [], stateId: "state" }
    ],
    states: [
      { id: "state", name: "Империя", color: "#777", rulingFactionId: "gov", active: true }
    ],
    strategicCities: [],
    rebellionStatuses: [],
    relations: {},
    stateRelations: {},
    battleGroups: [],
    settings: DEFAULT_SETTINGS,
    terrain: DEFAULT_TERRAIN,
    wars: [],
    turn: DEFAULT_TURN_STATE
  };
  const send = vi.fn(async () => undefined);
  const services: ExtensionServices = {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    send,
    runDiagnostic: async () => undefined
  };

  render(<App services={services} />);
  fireEvent.click(screen.getByRole("button", { name: "Управление" }));
  fireEvent.click(screen.getByRole("button", { name: "Восстания" }));
  fireEvent.change(screen.getByLabelText("Название нового государства после раскола"), {
    target: { value: "Республика" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Начать гражданскую войну" }));

  expect(send).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toHaveTextContent("Начать гражданскую войну?");
  fireEvent.click(screen.getByRole("button", { name: "Подтвердить" }));

  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith(expect.objectContaining({
    type: "START_CIVIL_WAR",
    sourceStateId: "state",
    rebelFactionId: "rebels",
    newStateName: "Республика"
  }));
});
