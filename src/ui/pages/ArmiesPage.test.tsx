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
  leaderPlayerIds: []
};

const blueSide: Side = {
  id: "blue",
  name: "Синие",
  color: "#00f",
  playerIds: [],
  leaderPlayerIds: []
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
    expect(screen.getByRole("button", { name: "Сделать армией" })).toBeDisabled();
  });
});
