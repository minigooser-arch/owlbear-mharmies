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
        memberSideIds={new Set()}
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
        memberSideIds={new Set()}
        onAction={onAction}
      />
    );
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
        memberSideIds={new Set()}
        onAction={onAction}
      />
    );

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
        memberSideIds={new Set()}
        onAction={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Сделать армией" })).toBeDisabled();
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
        memberSideIds={new Set()}
        onAction={vi.fn()}
      />
    );

    const sideFilter = screen.getByRole("combobox", { name: "Фильтр по стороне" });
    expect(within(sideFilter).getByRole("option", { name: "Красные" })).toBeInTheDocument();
    expect(within(sideFilter).queryByRole("option", { name: "Синие" })).not.toBeInTheDocument();
  });
});
