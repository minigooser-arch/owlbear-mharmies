// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

it("updates brush size metadata without requesting tool activation again", () => {
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
    type: "UPDATE_MAP_BRUSH_SETTINGS",
    settings: expect.objectContaining({ size: 3 })
  }));
  expect(onAction).toHaveBeenCalledTimes(2);
});

it("offers a built-in sea terrain that can be painted before ship registration", () => {
  render(<MapEditorPage terrain={DEFAULT_TERRAIN} sides={sides} states={states} onAction={vi.fn()} />);
  expect(screen.getByRole("option", { name: "Океан / озёра · 1 ОП" })).toBeInTheDocument();
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

it("creates a new state inactive before a faction is assigned", () => {
  const onAction = vi.fn();
  render(<MapEditorPage terrain={DEFAULT_TERRAIN} sides={sides} states={states} onAction={onAction} />);
  const input = screen.getByLabelText("Название нового государства");
  fireEvent.change(input, { target: { value: "Франция" } });
  const form = input.closest(".terrain-create");
  expect(form).not.toBeNull();
  fireEvent.click(within(form as HTMLElement).getByRole("button", { name: "Добавить" }));
  expect(onAction).toHaveBeenCalledWith({
    type: "CREATE_STATE",
    state: expect.objectContaining({ name: "Франция", rulingFactionId: null, active: false })
  });
});


it("previews and explicitly confirms an official peace transfer", () => {
  const onAction = vi.fn();
  render(<MapEditorPage terrain={DEFAULT_TERRAIN} sides={sides} states={states} onAction={onAction} />);

  fireEvent.change(screen.getByLabelText("Клетки передачи"), { target: { value: "1,2; 2,2" } });
  fireEvent.click(screen.getByRole("button", { name: "Предпросмотр передачи" }));
  expect(onAction).toHaveBeenLastCalledWith({
    type: "PREVIEW_PEACE_TRANSFER",
    recipientStateId: "russia",
    cells: [{ x: 1, y: 2 }, { x: 2, y: 2 }]
  });

  fireEvent.click(screen.getByRole("button", { name: "Подтвердить официальную передачу" }));
  expect(onAction).toHaveBeenLastCalledWith({
    type: "APPLY_PEACE_TRANSFER",
    recipientStateId: "russia",
    cells: [{ x: 1, y: 2 }, { x: 2, y: 2 }]
  });
});

it("does not allow peace transfer confirmation before a preview", () => {
  render(<MapEditorPage terrain={DEFAULT_TERRAIN} sides={sides} states={states} onAction={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Клетки передачи"), { target: { value: "1,2" } });
  expect(screen.getByRole("button", { name: "Подтвердить официальную передачу" })).toBeDisabled();
});
