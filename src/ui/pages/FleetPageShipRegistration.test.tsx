// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Side } from "../../shared/types";
import { FleetPage } from "./FleetPage";

const sides: Side[] = [
  { id: "red", name: "Красные", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: null }
];

afterEach(cleanup);

it("sends the selected side, class and facing when GM creates a ship", () => {
  const onAction = vi.fn();
  render(
    <FleetPage
      ships={[]}
      armies={[]}
      sides={sides}
      role="GM"
      leaderSideIds={new Set()}
      onAction={onAction}
    />
  );

  fireEvent.change(screen.getByLabelText("Класс нового корабля"), { target: { value: "CRUISER" } });
  fireEvent.change(screen.getByLabelText("Курс нового корабля"), { target: { value: "WEST" } });
  fireEvent.click(screen.getByRole("button", { name: "Сделать кораблём" }));

  expect(onAction).toHaveBeenCalledWith({
    type: "REGISTER_SELECTED_SHIP",
    sideId: "red",
    classId: "CRUISER",
    facing: "WEST"
  });
});
