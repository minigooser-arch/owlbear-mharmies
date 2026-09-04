// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ShipView } from "../state/useExtensionState";
import { ShipCard } from "./ShipCard";

const activeShip: ShipView = {
  id: "ship",
  name: "Аврора",
  sideId: "red",
  sideName: "Красные",
  classId: "CRUISER",
  className: "Крейсер",
  status: "IN_NAVAL_BATTLE",
  hp: 25,
  maxHp: 25,
  temporaryHp: 0,
  armor: 1,
  movementMax: 3,
  movementRemaining: 3,
  plannedRouteCellCount: 0,
  facing: "EAST",
  normalDice: 2,
  normalRangeMin: 1,
  normalRangeMax: 2,
  embarkedArmyId: null,
  detectionOverride: null,
  effectiveDetectionRange: 6,
  navalRoundNumber: 2,
  isCurrentNavalTurn: true,
  navalMovementRemaining: 1,
  navalActionUsed: false
};

afterEach(cleanup);

it("lets only the GM confirm exit for the current living ship", () => {
  const onAction = vi.fn();
  render(
    <ShipCard ship={activeShip} sideColor="#f00" isGM canPlanRoute onAction={onAction} />
  );

  fireEvent.click(screen.getByRole("button", { name: "Подтвердить выход из боя" }));
  expect(onAction).toHaveBeenCalledWith({ type: "CONFIRM_NAVAL_SHIP_EXIT", shipId: "ship" });

  cleanup();
  render(
    <ShipCard ship={activeShip} sideColor="#f00" isGM={false} canPlanRoute onAction={vi.fn()} />
  );
  expect(screen.queryByRole("button", { name: "Подтвердить выход из боя" })).toBeNull();
});

it("marks an exited ship and hides tactical controls even if stale turn data remains", () => {
  render(
    <ShipCard
      ship={{ ...activeShip, navalExited: true }}
      sideColor="#f00"
      isGM
      canPlanRoute
      onAction={vi.fn()}
    />
  );

  expect(screen.getByText("Вышел из боя")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Вперёд" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Завершить ход" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Подтвердить выход из боя" })).toBeNull();
});
