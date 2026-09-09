// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { App } from "./App";
import type { ExtensionServices, RawExtensionSnapshot } from "./state/useExtensionState";

afterEach(cleanup);

function services(): ExtensionServices {
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
    navalRequestTargets: [],
    pendingNavalBattleRequests: [
      { id: "naval-1", initiatingShipId: "red-1", targetShipId: "blue-1", createdOnTurn: 7 },
      { id: "naval-2", initiatingShipId: "red-2", targetShipId: "blue-2", createdOnTurn: 7 },
      { id: "naval-3", initiatingShipId: "red-3", targetShipId: "blue-3", createdOnTurn: 7 }
    ],
    transportEmbarkTargets: [],
    pendingTransportEmbarkRequests: [],
    sides: [],
    states: [],
    relations: {},
    battleGroups: [],
    settings: DEFAULT_SETTINGS,
    terrain: DEFAULT_TERRAIN,
    wars: [],
    turn: DEFAULT_TURN_STATE
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    send: async () => undefined,
    runDiagnostic: async () => undefined
  };
}

it("shows one aggregated GM notice for multiple naval battle requests and opens the queue", () => {
  render(<App services={services()} />);

  const notices = screen.getAllByRole("status", { name: "Заявки на морской бой" });
  expect(notices).toHaveLength(1);
  expect(notices[0]).toHaveTextContent("Заявки на морской бой: 3");
  expect(screen.getByRole("button", { name: "Бои" })).toHaveTextContent("3");

  fireEvent.click(screen.getByRole("button", { name: "Открыть заявки" }));

  expect(screen.getByRole("heading", { name: "Заявки на морской бой" })).toBeInTheDocument();
  expect(screen.queryByRole("status", { name: "Заявки на морской бой" })).not.toBeInTheDocument();
});
