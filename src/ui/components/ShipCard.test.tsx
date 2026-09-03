// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShipView } from "../state/useExtensionState";
import { ShipCard } from "./ShipCard";

const battleship: ShipView = {
  id: "ship",
  name: "Петропавловск",
  sideId: "red",
  sideName: "Красные",
  classId: "BATTLESHIP",
  className: "Линкор",
  status: "READY",
  hp: 24,
  maxHp: 30,
  temporaryHp: 0,
  armor: 3,
  movementMax: 2,
  movementRemaining: 2,
  plannedRouteCellCount: 0,
  facing: "NORTH",
  normalDice: 3,
  normalRangeMin: 2,
  normalRangeMax: 3,
  embarkedArmyId: null
};

afterEach(cleanup);

function renderShip(isGM: boolean, onAction = vi.fn()) {
  render(
    <ShipCard
      ship={battleship}
      sideColor="#f00"
      isGM={isGM}
      canPlanRoute
      onAction={onAction}
    />
  );
  return onAction;
}

describe("ShipCard HP management", () => {
  it("shows the HP editor only to the GM", () => {
    renderShip(false);
    expect(screen.queryByText("Управление")).toBeNull();

    cleanup();
    renderShip(true);
    fireEvent.click(screen.getByText("Управление"));
    expect(screen.getByLabelText("Управление HP корабля")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Текущее HP Петропавловск" })).toHaveValue(24);
  });

  it("sends exact HP entered by the GM", () => {
    const onAction = renderShip(true);
    fireEvent.click(screen.getByText("Управление"));
    const input = screen.getByRole("spinbutton", { name: "Текущее HP Петропавловск" });
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Установить HP корабля" }));
    expect(onAction).toHaveBeenCalledWith({ type: "SET_SHIP_HP", shipId: "ship", hp: 12 });
  });

  it("allows exact zero and clamps quick adjustments to the class maximum", () => {
    const onAction = renderShip(true);
    fireEvent.click(screen.getByText("Управление"));
    const input = screen.getByRole("spinbutton", { name: "Текущее HP Петропавловск" });
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Установить HP корабля" }));
    expect(onAction).toHaveBeenCalledWith({ type: "SET_SHIP_HP", shipId: "ship", hp: 0 });

    fireEvent.click(screen.getByRole("button", { name: "+5 HP корабля" }));
    expect(onAction).toHaveBeenCalledWith({ type: "SET_SHIP_HP", shipId: "ship", hp: 29 });
  });

  it("clamps damage at zero and repairs at max HP", () => {
    const onAction = vi.fn();
    render(
      <ShipCard
        ship={{ ...battleship, hp: 2 }}
        sideColor="#f00"
        isGM
        canPlanRoute
        onAction={onAction}
      />
    );
    fireEvent.click(screen.getByText("Управление"));
    fireEvent.click(screen.getByRole("button", { name: "-5 HP корабля" }));
    expect(onAction).toHaveBeenCalledWith({ type: "SET_SHIP_HP", shipId: "ship", hp: 0 });

    cleanup();
    render(
      <ShipCard
        ship={{ ...battleship, hp: 29 }}
        sideColor="#f00"
        isGM
        canPlanRoute
        onAction={onAction}
      />
    );
    fireEvent.click(screen.getByText("Управление"));
    fireEvent.click(screen.getByRole("button", { name: "+5 HP корабля" }));
    expect(onAction).toHaveBeenLastCalledWith({ type: "SET_SHIP_HP", shipId: "ship", hp: 30 });
  });

  it("keeps submit disabled for fractional, negative, over-max, or unchanged values", () => {
    renderShip(true);
    fireEvent.click(screen.getByText("Управление"));
    const input = screen.getByRole("spinbutton", { name: "Текущее HP Петропавловск" });
    const submit = screen.getByRole("button", { name: "Установить HP корабля" });
    expect(submit).toBeDisabled();

    for (const value of ["1.5", "-1", "31", "24"]) {
      fireEvent.change(input, { target: { value } });
      expect(submit).toBeDisabled();
    }
    fireEvent.change(input, { target: { value: "23" } });
    expect(submit).toBeEnabled();
  });
});
