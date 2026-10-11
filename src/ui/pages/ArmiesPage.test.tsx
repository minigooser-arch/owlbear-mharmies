// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Side } from "../../shared/types";
import { ArmiesPage } from "./ArmiesPage";

const redSide: Side = {
  id: "red",
  name: "Красные",
  color: "#f00",
  playerIds: [],
  leaderPlayerIds: [],
  stateId: null
};

const blueSide: Side = {
  id: "blue",
  name: "Синие",
  color: "#00f",
  playerIds: [],
  leaderPlayerIds: [],
  stateId: null
};

afterEach(cleanup);

describe("army registration panel", () => {
  it("shows registration only to GM and submits the selected side", () => {
    const onAction = vi.fn();
    const { rerender } = render(
      <ArmiesPage
        armies={[]}
        sides={[redSide]}
        role="PLAYER"
        playerId="p"
        leaderSideIds={new Set()}
        onAction={onAction}
      />
    );
    expect(screen.queryByRole("button", { name: "Сделать армией" })).not.toBeInTheDocument();

    rerender(
      <ArmiesPage
        armies={[]}
        sides={[redSide]}
        role="GM"
        playerId="gm"
        leaderSideIds={new Set()}
        onAction={onAction}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "+ Создать армию" }));
    fireEvent.click(screen.getByRole("button", { name: "Сделать армией" }));
    expect(onAction).toHaveBeenCalledWith({ type: "REGISTER_SELECTED_ARMY", sideId: "red" });
  });

  it("lists every side, including sides with no armies", () => {
    const onAction = vi.fn();
    render(
      <ArmiesPage
        armies={[]}
        sides={[redSide, blueSide]}
        role="GM"
        playerId="gm"
        leaderSideIds={new Set()}
        onAction={onAction}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "+ Создать армию" }));
    const sideSelect = screen.getByRole("combobox", { name: "Сторона новой армии" });
    expect(within(sideSelect).getByRole("option", { name: "Красные" })).toBeInTheDocument();
    expect(within(sideSelect).getByRole("option", { name: "Синие" })).toBeInTheDocument();
    fireEvent.change(sideSelect, { target: { value: "blue" } });
    fireEvent.click(screen.getByRole("button", { name: "Сделать армией" }));
    expect(onAction).toHaveBeenCalledWith({ type: "REGISTER_SELECTED_ARMY", sideId: "blue" });
  });

  it("disables registration when no sides exist", () => {
    render(
      <ArmiesPage
        armies={[]}
        sides={[]}
        role="GM"
        playerId="gm"
        leaderSideIds={new Set()}
        onAction={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "+ Создать армию" }));
    expect(screen.getByRole("button", { name: "Сделать армией" })).toBeDisabled();
  });
});

describe("city army creation cooldown", () => {
  const city = (id: string, name: string, nextArmyCreationTurn?: number) => ({
    id, name, cells: [{ x: 0, y: 0 }], recognizedStateId: "red-state", deFactoStateId: "red-state",
    factionInfluenceId: "red", mayorId: null, isCapital: false, historicalBuildTypeCount: 0,
    buildings: [{ id: `department-${id}`, type: "MILITARY_DEPARTMENT" as const, cell: { x: 0, y: 0 } }],
    ...(nextArmyCreationTurn !== undefined ? { nextArmyCreationTurn } : {})
  });

  it("shows the unlock turn and still sends blocked attempts for an Owlbear warning", () => {
    const onAction = vi.fn();
    render(<ArmiesPage armies={[]} sides={[redSide]} role="PLAYER" playerId="leader"
      leaderSideIds={new Set(["red"])} turnNumber={11}
      strategicCities={[city("paris", "Париж", 13), city("lyon", "Лион")]} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Создать армию" }));
    expect(screen.getByText(/Кулдаун Военного ведомства: в Париж новую армию можно создать с хода №13/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Создать армию" }));
    expect(onAction).toHaveBeenCalledWith({ type: "CREATE_SELECTED_CITY_ARMY", cityId: "paris", sideId: "red" });
    fireEvent.change(screen.getByRole("combobox", { name: "Город формирования армии" }), { target: { value: "lyon" } });
    expect(screen.getByText("Военное ведомство готово к созданию армии.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Создать армию" }));
    expect(onAction).toHaveBeenLastCalledWith({ type: "CREATE_SELECTED_CITY_ARMY", cityId: "lyon", sideId: "red" });
  });
});

describe("army side filter", () => {
  it("offers players only sides represented by their authorized armies", () => {
    render(
      <ArmiesPage
        armies={[{
          id: "red-army",
          name: "Красная армия",
          sideId: "red",
          sideName: "Красные",
          status: "READY",
          route: [],
          movementMaxUnits: 10, movementRemainingUnits: 10, routeCostUnits: 0, routeCellCount: 0, routeRequiresReplan: false, atWar: false, healthHp: 50, healthMaxHp: 50, supplied: true, supplyCheckedOnTurn: 1, disbandPending: false
        }]}
        sides={[redSide, blueSide]}
        role="PLAYER"
        playerId="p"
        leaderSideIds={new Set()}
        onAction={vi.fn()}
      />
    );

    const sideFilter = screen.getByRole("combobox", { name: "Фильтр по стороне" });
    expect(within(sideFilter).getByRole("option", { name: "Красные" })).toBeInTheDocument();
    expect(within(sideFilter).queryByRole("option", { name: "Синие" })).not.toBeInTheDocument();
  });
});
