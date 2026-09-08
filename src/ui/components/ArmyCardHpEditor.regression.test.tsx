// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ArmyView } from "../state/useExtensionState";
import { ArmyCard } from "./ArmyCard";

const army: ArmyView = {
  id: "army-red",
  name: "Первая армия",
  sideId: "red",
  sideName: "Красные",
  status: "READY",
  route: [],
  movementMaxUnits: 10,
  movementRemainingUnits: 10,
  routeCostUnits: 0,
  routeCellCount: 0,
  routeRequiresReplan: false,
  atWar: true,
  healthHp: 45,
  healthMaxHp: 50,
  supplied: true,
  supplyCheckedOnTurn: 1,
  disbandPending: false
};

afterEach(cleanup);

it("lets GM enter exact HP and fix it without quick adjustment buttons", () => {
  const onAction = vi.fn();
  render(<ArmyCard army={army} isGM canEditRoute canRequestDisband onAction={onAction} />);
  fireEvent.click(screen.getByText("Управление"));

  expect(screen.queryByRole("button", { name: "-5 HP" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "-1 HP" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "+1 HP" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "+5 HP" })).not.toBeInTheDocument();

  const input = screen.getByRole("spinbutton", { name: "Текущее HP Первая армия" });
  fireEvent.change(input, { target: { value: "27" } });
  fireEvent.click(screen.getByRole("button", { name: "Зафиксировать" }));

  expect(onAction).toHaveBeenCalledTimes(1);
  expect(onAction).toHaveBeenCalledWith({ type: "SET_ARMY_HP", armyId: "army-red", hp: 27 });
});

it("does not allow fixing an empty, negative or above-maximum HP value", () => {
  render(<ArmyCard army={army} isGM canEditRoute canRequestDisband onAction={vi.fn()} />);
  fireEvent.click(screen.getByText("Управление"));
  const input = screen.getByRole("spinbutton", { name: "Текущее HP Первая армия" });
  const fix = screen.getByRole("button", { name: "Зафиксировать" });

  fireEvent.change(input, { target: { value: "" } });
  expect(fix).toBeDisabled();
  fireEvent.change(input, { target: { value: "-1" } });
  expect(fix).toBeDisabled();
  fireEvent.change(input, { target: { value: "51" } });
  expect(fix).toBeDisabled();
});
