// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Side } from "../../shared/types";
import { RelationsPage } from "./RelationsPage";

const red: Side = {
  id: "red",
  name: "Красные",
  color: "#b3261e",
  playerIds: [],
  leaderPlayerIds: [],
  stateId: null
};

const blue: Side = {
  id: "blue",
  name: "Синие",
  color: "#2850a7",
  playerIds: [],
  leaderPlayerIds: [],
  stateId: null
};

afterEach(cleanup);

it("explains why faction relations are empty when fewer than two factions exist", () => {
  render(<RelationsPage sides={[red]} relations={{}} onAction={vi.fn()} />);

  expect(screen.getByRole("status")).toHaveTextContent(
    "Для настройки отношений фракций нужно минимум две фракции."
  );
});

it("renders faction relation controls when two factions exist", () => {
  const onAction = vi.fn();
  render(
    <RelationsPage
      sides={[red, blue]}
      relations={{ red: { blue: "NEUTRAL" } }}
      onAction={onAction}
    />
  );

  const select = screen.getByLabelText("Красные и Синие");
  expect(select).toHaveValue("NEUTRAL");

  fireEvent.change(select, { target: { value: "ALLY" } });
  expect(onAction).toHaveBeenCalledWith({
    type: "SET_RELATION",
    leftSideId: "red",
    rightSideId: "blue",
    relation: "ALLY"
  });
});
