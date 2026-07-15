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
  route: []
};

afterEach(cleanup);

describe("ArmyCard capabilities", () => {
  it("gives a leader only route controls", () => {
    render(<ArmyCard army={redArmy} isGM={false} canEditRoute onAction={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Маршрут" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Старт" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Снять регистрацию" })).not.toBeInTheDocument();
  });

  it("gives GM route, movement, and unregister controls", () => {
    render(<ArmyCard army={redArmy} isGM canEditRoute onAction={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Маршрут" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Старт" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Снять регистрацию" })).toBeInTheDocument();
  });

  it("hides route mutation controls while an army is active", () => {
    render(
      <ArmyCard
        army={{ ...redArmy, status: "MOVING", route: [{ x: 1, y: 0 }] }}
        isGM={false}
        canEditRoute
        onAction={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "Маршрут" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Очистить" })).not.toBeInTheDocument();
  });

  it("emits separate route, movement, and unregister commands", () => {
    const onAction = vi.fn();
    render(<ArmyCard army={redArmy} isGM canEditRoute onAction={onAction} />);

    fireEvent.click(screen.getByRole("button", { name: "Маршрут" }));
    fireEvent.click(screen.getByRole("button", { name: "Старт" }));
    fireEvent.click(screen.getByRole("button", { name: "Снять регистрацию" }));

    expect(onAction).toHaveBeenNthCalledWith(1, { type: "EDIT_ROUTE", armyId: "army-red" });
    expect(onAction).toHaveBeenNthCalledWith(2, { type: "START_ARMY", armyId: "army-red" });
    expect(onAction).toHaveBeenNthCalledWith(3, { type: "UNREGISTER_ARMY", armyId: "army-red" });
  });
});
