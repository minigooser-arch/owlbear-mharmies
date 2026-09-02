// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_TURN_STATE } from "../../shared/constants";
import type { ArmyView } from "../state/useExtensionState";
import { MovementPage } from "./MovementPage";

afterEach(cleanup);

const pausedArmy: ArmyView = {
  id: "army-red",
  name: "Первая армия",
  sideId: "red",
  sideName: "Красные",
  status: "PAUSED",
  route: [{ x: 1, y: 0 }],
  movementMaxUnits: 10,
  movementRemainingUnits: 8,
  routeCostUnits: 2,
  routeCellCount: 1,
  routeRequiresReplan: false,
  atWar: false,
  healthHp: 50,
  healthMaxHp: 50,
  supplied: true,
  supplyCheckedOnTurn: 1,
  disbandPending: false
};

it("does not offer route editing for a paused army", () => {
  render(
    <MovementPage
      armies={[pausedArmy]}
      turn={DEFAULT_TURN_STATE}
      isGM={false}
      leaderSideIds={new Set(["red"])}
      onAction={vi.fn()}
    />
  );

  expect(screen.queryByRole("button", { name: "Изменить маршрут" })).not.toBeInTheDocument();
});
