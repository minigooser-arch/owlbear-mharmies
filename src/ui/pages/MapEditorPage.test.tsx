// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_TERRAIN } from "../../shared/constants";
import type { Side, StateEntity } from "../../shared/types";
import { MapEditorPage } from "./MapEditorPage";

const sides: Side[] = [
  { id: "romanovs", name: "Дом Романовых", color: "#5577aa", playerIds: [], leaderPlayerIds: [], stateId: "russia" }
];
const states: StateEntity[] = [{ id: "russia", name: "Российская империя", rulingFactionId: "romanovs", active: true }];

afterEach(cleanup);

it("offers the three strategic brush sizes and an explicit eraser target", () => {
  render(<MapEditorPage terrain={DEFAULT_TERRAIN} sides={sides} states={states} onAction={vi.fn()} />);
  expect(screen.getByRole("button", { name: "1×1" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "3×3" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "5×5" })).toBeInTheDocument();
  expect(screen.getByLabelText("Режим кисти")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Начать рисовать" })).toBeInTheDocument();
});

it("updates the live brush immediately when its size changes", () => {
  const onAction = vi.fn();
  render(<MapEditorPage terrain={DEFAULT_TERRAIN} sides={sides} states={states} onAction={onAction} />);

  fireEvent.click(screen.getByRole("button", { name: "Начать рисовать" }));
  expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({
    type: "OPEN_MAP_BRUSH",
    settings: expect.objectContaining({ size: 1 })
  }));

  fireEvent.click(screen.getByRole("button", { name: "3×3" }));

  expect(screen.getByRole("button", { name: "3×3" })).toHaveClass("active");
  expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({
    type: "OPEN_MAP_BRUSH",
    settings: expect.objectContaining({ size: 3 })
  }));
  expect(onAction).toHaveBeenCalledTimes(2);
});

it("offers a built-in sea terrain that can be painted before ship registration", () => {
  render(<MapEditorPage terrain={DEFAULT_TERRAIN} sides={sides} states={states} onAction={vi.fn()} />);
  expect(screen.getByRole("option", { name: "Море · 1 ОП" })).toBeInTheDocument();
  expect(DEFAULT_TERRAIN.types.sea).toMatchObject({
    id: "sea",
    movementDomains: ["SEA"],
    blocksNavalLos: false
  });
});

it("offers recognized and de-facto state map layers", () => {
  render(<MapEditorPage terrain={DEFAULT_TERRAIN} sides={sides} states={states} onAction={vi.fn()} />);
  const select = screen.getByLabelText("Режим кисти");
  expect(select).toContainHTML("Признанная территория государства");
  expect(select).toContainHTML("Де-факто контроль государства");
  expect(screen.getByText("Государства")).toBeInTheDocument();
});
