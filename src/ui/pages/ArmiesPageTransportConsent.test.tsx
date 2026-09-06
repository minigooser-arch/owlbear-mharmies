// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Side } from "../../shared/types";
import type { TransportEmbarkRequestView } from "../state/useExtensionState";
import { ArmiesPage } from "./ArmiesPage";

const blueSide: Side = {
  id: "blue",
  name: "Синие",
  color: "#00f",
  playerIds: ["blue-leader"],
  leaderPlayerIds: ["blue-leader"],
  stateId: null
};

const request: TransportEmbarkRequestView = {
  id: "embark-1",
  shipId: "transport",
  shipName: "Транспорт №1",
  shipSideId: "red",
  shipSideName: "Красные",
  armyId: "blue-army",
  armyName: "Синяя армия"
};

afterEach(cleanup);

it("lets the army-side leader accept a foreign embark request", () => {
  const onAction = vi.fn();
  render(
    <ArmiesPage
      armies={[]}
      sides={[blueSide]}
      role="PLAYER"
      playerId="blue-leader"
      leaderSideIds={new Set(["blue"])}
      memberSideIds={new Set(["blue"])}
      pendingTransportEmbarkRequests={[request]}
      onAction={onAction}
    />
  );

  expect(screen.getByText(/Транспорт №1/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {
    name: "Разрешить погрузку Синяя армия на Транспорт №1"
  }));

  expect(onAction).toHaveBeenCalledWith({
    type: "ACCEPT_EMBARK_ARMY",
    embarkRequestId: "embark-1",
    shipId: "transport",
    armyId: "blue-army"
  });
});

it("shows no consent panel when there are no role-safe pending requests", () => {
  render(
    <ArmiesPage
      armies={[]}
      sides={[blueSide]}
      role="PLAYER"
      playerId="member"
      leaderSideIds={new Set()}
      memberSideIds={new Set(["blue"])}
      pendingTransportEmbarkRequests={[]}
      onAction={vi.fn()}
    />
  );

  expect(screen.queryByText("Запросы на перевозку")).toBeNull();
});
