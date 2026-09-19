// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { App } from "./App";
import type { ExtensionServices, RawExtensionSnapshot } from "./state/useExtensionState";

afterEach(cleanup);

function playerSnapshot(leader: boolean): RawExtensionSnapshot {
  const sideId = "red";
  return {
    ready: true,
    sceneReady: true,
    futureSchema: false,
    role: "PLAYER",
    playerId: leader ? "leader" : "member",
    players: [
      { id: "leader", name: "Лидер", color: "#a00", role: "PLAYER", connected: true },
      { id: "member", name: "Участник", color: "#700", role: "PLAYER", connected: true }
    ],
    memberSideIds: new Set([sideId]),
    leaderSideIds: leader ? new Set([sideId]) : new Set(),
    mapVisibleSourceIds: new Set(["red-army"]),
    armies: [{
      id: "red-army",
      name: "1-я армия",
      sideId,
      sideName: "Красные",
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
    ships: [],
    sides: [{
      id: sideId,
      name: "Красные",
      color: "#b3261e",
      playerIds: ["leader", "member"],
      leaderPlayerIds: ["leader"],
      stateId: "russia"
    }],
    states: [{
      id: "russia",
      name: "Россия",
      color: "#b3261e",
      rulingFactionId: sideId,
      active: true
    }],
    relations: {},
    stateRelations: {},
    battleGroups: [],
    settings: structuredClone(DEFAULT_SETTINGS),
    terrain: structuredClone(DEFAULT_TERRAIN),
    wars: [],
    turn: structuredClone(DEFAULT_TURN_STATE)
  };
}

function services(snapshot: RawExtensionSnapshot) {
  const send = vi.fn(async () => undefined);
  const api: ExtensionServices = {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    send,
    runDiagnostic: vi.fn(async () => undefined)
  };
  return { api, send };
}

it("lets a faction leader plan routes and manage membership without exposing GM administration", () => {
  const { api, send } = services(playerSnapshot(true));
  render(<App services={api} />);

  expect(screen.queryByRole("button", { name: "Карта" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Управление" })).not.toBeInTheDocument();
  expect(screen.getByText("1-я армия")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Проложить маршрут" }));
  expect(send).toHaveBeenCalledWith({ type: "EDIT_ROUTE", armyId: "red-army" });

  fireEvent.click(screen.getByText("Управление фракцией"));
  expect(screen.getByRole("heading", { name: "Стороны" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Удалить Красные/ })).not.toBeInTheDocument();

  const memberCheckbox = screen.getByRole("checkbox", { name: "Участник Участник (member)" });
  expect(memberCheckbox).toBeChecked();
  fireEvent.click(memberCheckbox);
  expect(send).toHaveBeenCalledWith({
    type: "REMOVE_SIDE_PLAYER",
    sideId: "red",
    playerId: "member"
  });
});

it("keeps an ordinary faction member from planning routes or changing faction membership", () => {
  const { api } = services(playerSnapshot(false));
  render(<App services={api} />);

  expect(screen.getByText("1-я армия")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Проложить маршрут" })).not.toBeInTheDocument();
  expect(screen.queryByText("Управление фракцией")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Ход" }));
  expect(screen.queryByRole("button", { name: "Проложить маршрут" })).not.toBeInTheDocument();
});
