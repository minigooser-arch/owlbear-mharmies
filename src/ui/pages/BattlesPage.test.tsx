// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BattleGroup } from "../../shared/types";
import { BattlesPage } from "./BattlesPage";

const battle = (name = "Бой 1"): BattleGroup => ({
  battleId: "battle-1",
  name,
  participantIds: ["red-army", "blue-army"],
  revision: 1
});

afterEach(cleanup);

describe("battle names", () => {
  it("lets a GM submit a trimmed battle name and preserves release", () => {
    const onAction = vi.fn();
    render(<BattlesPage battles={[battle()]} isGM onAction={onAction} />);

    const nameInput = screen.getByRole("textbox", { name: "Название боя" });
    const saveButton = screen.getByRole("button", { name: "Сохранить название" });
    expect(saveButton).toBeDisabled();

    fireEvent.change(nameInput, { target: { value: "  Переправа  " } });
    fireEvent.click(saveButton);

    expect(onAction).toHaveBeenCalledWith({
      type: "RENAME_BATTLE_GROUP",
      battleId: "battle-1",
      name: "Переправа"
    });

    fireEvent.click(screen.getByRole("button", { name: "Развести армии" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "RELEASE_BATTLE_GROUP",
      battleId: "battle-1"
    });
  });

  it.each(["   ", "😀".repeat(81)])("disables an invalid battle name", (name) => {
    render(<BattlesPage battles={[battle()]} isGM onAction={vi.fn()} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Название боя" }), {
      target: { value: name }
    });

    expect(screen.getByRole("button", { name: "Сохранить название" })).toBeDisabled();
  });

  it("keeps the GM draft synchronized with external battle changes", () => {
    const { rerender } = render(
      <BattlesPage battles={[battle()]} isGM onAction={vi.fn()} />
    );
    const nameInput = screen.getByRole("textbox", { name: "Название боя" });
    fireEvent.change(nameInput, { target: { value: "Черновик" } });

    rerender(<BattlesPage battles={[battle("Новое имя")]} isGM onAction={vi.fn()} />);

    expect(screen.getByRole("textbox", { name: "Название боя" })).toHaveValue("Новое имя");
  });

  it("shows a player the battle name without an editor", () => {
    render(<BattlesPage battles={[battle("Переправа")]} isGM={false} onAction={vi.fn()} />);

    expect(screen.getByText("Переправа")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Название боя" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Развести армии" })).not.toBeInTheDocument();
  });
});

it("shows participant armies and HP to a player", () => {
  const armies = [
    { id: "red-army", name: "1-я армия", sideId: "red", sideName: "Красные", status: "IN_BATTLE" as const, route: [], movementMaxUnits: 10, movementRemainingUnits: 0, routeCostUnits: 0, routeCellCount: 0, routeRequiresReplan: false, atWar: true, healthHp: 43, healthMaxHp: 50, supplied: true, supplyCheckedOnTurn: 1, disbandPending: false },
    { id: "blue-army", name: "2-я армия", sideId: "blue", sideName: "Синие", status: "IN_BATTLE" as const, route: [], movementMaxUnits: 10, movementRemainingUnits: 0, routeCostUnits: 0, routeCellCount: 0, routeRequiresReplan: false, atWar: true, healthHp: 31, healthMaxHp: 50, supplied: true, supplyCheckedOnTurn: 1, disbandPending: false }
  ];
  render(<BattlesPage battles={[battle()]} armies={armies} isGM={false} onAction={vi.fn()} />);
  expect(screen.getByText("1-я армия")).toBeInTheDocument();
  expect(screen.getByText("♥ 43 / 50")).toBeInTheDocument();
  expect(screen.getByText("2-я армия")).toBeInTheDocument();
  expect(screen.getByText("♥ 31 / 50")).toBeInTheDocument();
});
