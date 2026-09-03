// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ShipView } from "../state/useExtensionState";
import { ShipCard } from "./ShipCard";

const ship = {
  id: "ship",
  name: "Аврора",
  sideId: "red",
  sideName: "Красные",
  classId: "CRUISER",
  className: "Крейсер",
  status: "READY",
  hp: 25,
  maxHp: 25,
  temporaryHp: 0,
  armor: 1,
  movementMax: 3,
  movementRemaining: 3,
  plannedRouteCellCount: 0,
  facing: "NORTH",
  normalDice: 2,
  normalRangeMin: 1,
  normalRangeMax: 2,
  embarkedArmyId: null,
  detectionOverride: 8,
  effectiveDetectionRange: 8
} as ShipView & { detectionOverride: number | null; effectiveDetectionRange: number };

afterEach(cleanup);

it("lets only the GM set and reset a ship detection override", () => {
  const onAction = vi.fn();
  render(
    <ShipCard
      ship={ship}
      sideColor="#f00"
      isGM
      canPlanRoute
      onAction={onAction}
    />
  );

  fireEvent.click(screen.getByText("Управление"));
  const input = screen.getByRole("spinbutton", { name: "Дальность обнаружения Аврора" });
  expect(input).toHaveValue(8);

  fireEvent.change(input, { target: { value: "4.5" } });
  fireEvent.click(screen.getByRole("button", { name: "Установить дальность обнаружения" }));
  expect(onAction).toHaveBeenCalledWith({
    type: "SET_SHIP_DETECTION_OVERRIDE",
    shipId: "ship",
    detectionOverride: 4.5
  });

  fireEvent.click(screen.getByRole("button", { name: "Использовать общую дальность" }));
  expect(onAction).toHaveBeenCalledWith({
    type: "SET_SHIP_DETECTION_OVERRIDE",
    shipId: "ship",
    detectionOverride: null
  });
});

it("shows the effective scene default and disables reset when no override exists", () => {
  render(
    <ShipCard
      ship={{ ...ship, detectionOverride: null, effectiveDetectionRange: 6 } as ShipView}
      sideColor="#f00"
      isGM
      canPlanRoute
      onAction={vi.fn()}
    />
  );

  fireEvent.click(screen.getByText("Управление"));
  expect(screen.getByRole("spinbutton", { name: "Дальность обнаружения Аврора" })).toHaveValue(6);
  expect(screen.getByText("Общая дальность: 6 кл.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Использовать общую дальность" })).toBeDisabled();
});
