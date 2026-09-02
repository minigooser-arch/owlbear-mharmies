// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArmyView } from "../state/useExtensionState";
import { ArmyCard } from "./ArmyCard";

const redArmy: ArmyView = {
  id: "army-red",
  name: "Первая армия",
  sideId: "red",
  sideName: "Красные",
  status: "READY",
  route: [],
  movementMaxUnits: 12,
  movementRemainingUnits: 9,
  routeCostUnits: 5,
  routeCellCount: 2,
  routeRequiresReplan: false,
  atWar: true,
  healthHp: 45,
  healthMaxHp: 50,
  supplied: false,
  supplyCheckedOnTurn: 3,
  disbandPending: false
};

afterEach(cleanup);

describe("ArmyCard capabilities", () => {
  it("shows movement points, planned cost, and war state", () => {
    render(<ArmyCard army={redArmy} isGM={false} canEditRoute canRequestDisband onAction={vi.fn()} />);
    expect(screen.getByText("ОП: 4,5 / 6")).toBeInTheDocument();
    expect(screen.getByText("Маршрут: 2,5 ОП")).toBeInTheDocument();
    expect(screen.getByText("Война")).toBeInTheDocument();
    expect(screen.getByText("HP: 45 / 50")).toBeInTheDocument();
    expect(screen.getByText(/Окружена/)).toBeInTheDocument();
    expect(screen.getByText(/−5 HP/)).toBeInTheDocument();
  });

  it("gives a leader only route controls", () => {
    render(<ArmyCard army={redArmy} isGM={false} canEditRoute canRequestDisband onAction={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Изменить маршрут" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Старт" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Снять регистрацию" })).not.toBeInTheDocument();
  });

  it("gives GM route, movement, and unregister controls", () => {
    render(<ArmyCard army={redArmy} isGM canEditRoute canRequestDisband onAction={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Изменить маршрут" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Старт" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Дополнительные действия"));
    expect(screen.getByRole("button", { name: "Распустить армию" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Снять регистрацию" })).toBeInTheDocument();
  });

  it("hides route mutation controls while an army is active", () => {
    render(
      <ArmyCard
        army={{ ...redArmy, status: "MOVING", route: [{ x: 1, y: 0 }] }}
        isGM={false}
        canEditRoute
        canRequestDisband
        onAction={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "Изменить маршрут" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Очистить" })).not.toBeInTheDocument();
  });

  it("emits separate route, movement, and unregister commands", () => {
    const onAction = vi.fn();
    render(<ArmyCard army={redArmy} isGM canEditRoute canRequestDisband onAction={onAction} />);

    fireEvent.click(screen.getByRole("button", { name: "Изменить маршрут" }));
    fireEvent.click(screen.getByText("Дополнительные действия"));
    fireEvent.click(screen.getByRole("button", { name: "Распустить армию" }));
    fireEvent.click(screen.getByRole("button", { name: "Снять регистрацию" }));

    expect(onAction).toHaveBeenNthCalledWith(1, { type: "EDIT_ROUTE", armyId: "army-red" });
    expect(onAction).toHaveBeenNthCalledWith(2, { type: "REQUEST_ARMY_DISBAND", armyId: "army-red" });
    expect(onAction).toHaveBeenNthCalledWith(3, { type: "UNREGISTER_ARMY", armyId: "army-red" });
  });
  it("lets a GM set exact HP and use quick adjustments", () => {
    const onAction = vi.fn();
    render(<ArmyCard army={redArmy} isGM canEditRoute canRequestDisband onAction={onAction} />);
    const hpInput = screen.getByRole("spinbutton", { name: "Текущее HP Первая армия" });
    fireEvent.change(hpInput, { target: { value: "27" } });
    fireEvent.click(screen.getByRole("button", { name: "Установить HP" }));
    expect(onAction).toHaveBeenCalledWith({ type: "SET_ARMY_HP", armyId: "army-red", hp: 27 });
    fireEvent.click(screen.getByRole("button", { name: "+5 HP" }));
    expect(onAction).toHaveBeenCalledWith({ type: "SET_ARMY_HP", armyId: "army-red", hp: 50 });
  });

});


it("shows irreversible disband state and disables a second request", () => {
  render(<ArmyCard army={{ ...redArmy, disbandPending: true }} isGM={false} canEditRoute canRequestDisband onAction={vi.fn()} />);
  expect(screen.getByText(/Будет распущена в начале следующего хода/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Распустить армию" })).not.toBeInTheDocument();
});
