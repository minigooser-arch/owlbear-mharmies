// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShipView } from "../state/useExtensionState";
import { ShipCard } from "./ShipCard";

const ship: ShipView = {
  id: "red-cruiser",
  name: "Аврора",
  sideId: "red",
  sideName: "Красные",
  classId: "CRUISER",
  className: "Крейсер",
  status: "IN_NAVAL_BATTLE",
  hp: 20,
  maxHp: 20,
  temporaryHp: 0,
  armor: 1,
  movementMax: 5,
  movementRemaining: 5,
  plannedRouteCellCount: 0,
  facing: "NORTH",
  normalDice: 2,
  normalRangeMin: 1,
  normalRangeMax: 3,
  embarkedArmyId: null,
  detectionOverride: null,
  effectiveDetectionRange: 6,
  navalRoundNumber: 1,
  isCurrentNavalTurn: true,
  navalMovementRemaining: 5,
  navalActionUsed: false,
  navalExited: false,
  broadsideTargets: [
    { id: "blue-battleship", name: "Слава", sideId: "blue", sideName: "Синие" },
    { id: "green-ironclad", name: "Союзник", sideId: "green", sideName: "Зелёные" }
  ]
};

const relations = {
  red: { blue: "ENEMY", green: "ALLY" },
  blue: { red: "ENEMY" },
  green: { red: "ALLY" }
} as const;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ShipCard broadside interaction", () => {
  it("lets the active leader fire at an enemy from the tactical panel", () => {
    const onAction = vi.fn();
    render(<ShipCard ship={ship} sideColor="#f00" isGM={false} canPlanRoute relations={relations} onAction={onAction} />);

    expect(screen.getByRole("option", { name: "Слава — Синие" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Бортовой залп (2d6)" }));

    expect(onAction).toHaveBeenCalledWith({
      type: "NAVAL_BROADSIDE_ATTACK",
      shipId: "red-cruiser",
      targetShipId: "blue-battleship",
      friendlyFireConfirmed: false
    });
  });

  it("requires confirmation for an allied target", () => {
    const onAction = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ShipCard ship={ship} sideColor="#f00" isGM={false} canPlanRoute relations={relations} onAction={onAction} />);

    fireEvent.change(screen.getByLabelText("Цель бортового залпа Аврора"), { target: { value: "green-ironclad" } });
    fireEvent.click(screen.getByRole("button", { name: "Бортовой залп (2d6)" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: "NAVAL_BROADSIDE_ATTACK" }));

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Бортовой залп (2d6)" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "NAVAL_BROADSIDE_ATTACK",
      shipId: "red-cruiser",
      targetShipId: "green-ironclad",
      friendlyFireConfirmed: true
    });
  });

  it("hides the attack control when no role-safe targets are available", () => {
    render(<ShipCard ship={{ ...ship, broadsideTargets: [] }} sideColor="#f00" isGM={false} canPlanRoute relations={relations} onAction={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Бортовой залп \(/ })).toBeNull();
  });
});
