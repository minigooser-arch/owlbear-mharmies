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

const activeBattleship: ShipView = {
  ...battleship,
  status: "IN_NAVAL_BATTLE",
  navalRoundNumber: 2,
  isCurrentNavalTurn: true,
  navalMovementRemaining: 2,
  navalActionUsed: false
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

describe("ShipCard naval tactical controls", () => {
  it("lets the side leader or GM maneuver the active ship and end its turn", () => {
    const onAction = vi.fn();
    render(
      <ShipCard
        ship={activeBattleship}
        sideColor="#f00"
        isGM={false}
        canPlanRoute
        onAction={onAction}
      />
    );

    expect(screen.getByText("Раунд 2 · ОП 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повернуть влево" }));
    fireEvent.click(screen.getByRole("button", { name: "Вперёд" }));
    fireEvent.click(screen.getByRole("button", { name: "Повернуть вправо" }));
    fireEvent.click(screen.getByRole("button", { name: "Завершить ход" }));

    expect(onAction).toHaveBeenNthCalledWith(1, { type: "NAVAL_TURN_SHIP", shipId: "ship", direction: "LEFT" });
    expect(onAction).toHaveBeenNthCalledWith(2, { type: "NAVAL_MOVE_FORWARD", shipId: "ship" });
    expect(onAction).toHaveBeenNthCalledWith(3, { type: "NAVAL_TURN_SHIP", shipId: "ship", direction: "RIGHT" });
    expect(onAction).toHaveBeenNthCalledWith(4, { type: "END_NAVAL_SHIP_TURN", shipId: "ship" });
  });

  it.each([
    ["без ОП", { navalMovementRemaining: 0 }],
    ["после активного действия", { navalMovementRemaining: 2, navalActionUsed: true }]
  ] as const)("disables maneuver buttons %s but keeps explicit end-turn available", (_label, patch) => {
    render(
      <ShipCard
        ship={{ ...activeBattleship, ...patch }}
        sideColor="#f00"
        isGM={false}
        canPlanRoute
        onAction={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Повернуть влево" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Вперёд" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Повернуть вправо" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Завершить ход" })).toBeEnabled();
  });

  it("does not expose tactical controls to a non-leader or for a ship waiting its turn", () => {
    render(
      <ShipCard
        ship={activeBattleship}
        sideColor="#f00"
        isGM={false}
        canPlanRoute={false}
        onAction={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "Вперёд" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Завершить ход" })).toBeNull();

    cleanup();
    render(
      <ShipCard
        ship={{ ...activeBattleship, isCurrentNavalTurn: false }}
        sideColor="#f00"
        isGM={false}
        canPlanRoute
        onAction={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "Вперёд" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Завершить ход" })).toBeNull();
  });
});