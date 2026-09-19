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

it("offers recognized and de-facto state map layers without faction-territory painting", () => {
  render(<MapEditorPage terrain={DEFAULT_TERRAIN} sides={sides} states={states} onAction={vi.fn()} />);
  const select = screen.getByLabelText("Режим кисти");
  expect(select).toContainHTML("Признанная территория государства");
  expect(select).toContainHTML("Де-факто контроль государства");
  expect(select).not.toContainHTML("Территория фракции");
});

it("keeps state CRUD out of the map editor", () => {
  render(<MapEditorPage terrain={DEFAULT_TERRAIN} sides={sides} states={states} onAction={vi.fn()} />);
  expect(screen.queryByLabelText("Название нового государства")).not.toBeInTheDocument();
  expect(screen.queryByText("Государства")).not.toBeInTheDocument();
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


it("offers inactive states for map painting instead of hiding them", () => {
  const inactiveStates: StateEntity[] = [{
    id: "finland",
    name: "Великое княжество Финляндское",
    rulingFactionId: null,
    active: false
  }];
  render(<MapEditorPage terrain={DEFAULT_TERRAIN} sides={sides} states={inactiveStates} onAction={vi.fn()} />);

  fireEvent.change(screen.getByLabelText("Режим кисти"), { target: { value: "RECOGNIZED_STATE" } });

  expect(screen.getByRole("option", { name: "Великое княжество Финляндское · неактивно" })).toBeInTheDocument();
  expect(screen.getByLabelText("Государство для разметки")).toHaveValue("finland");
  expect(screen.getByRole("button", { name: "Начать рисовать" })).toBeEnabled();
});

it("synchronizes the selected state when states arrive after the map editor mounts", async () => {
  const onAction = vi.fn();
  const view = render(<MapEditorPage terrain={DEFAULT_TERRAIN} sides={sides} states={[]} onAction={onAction} />);

  fireEvent.change(screen.getByLabelText("Режим кисти"), { target: { value: "RECOGNIZED_STATE" } });

  expect(screen.getByLabelText("Государство для разметки")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Начать рисовать" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Сначала создайте государство");

  view.rerender(<MapEditorPage terrain={DEFAULT_TERRAIN} sides={sides} states={states} onAction={onAction} />);

  await vi.waitFor(() => {
    expect(screen.getByLabelText("Государство для разметки")).toHaveValue("russia");
  });
  expect(screen.getByRole("button", { name: "Начать рисовать" })).toBeEnabled();

  fireEvent.click(screen.getByRole("button", { name: "Начать рисовать" }));
  expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({
    type: "OPEN_MAP_BRUSH",
    settings: expect.objectContaining({ stateId: "russia" })
  }));
});

it("synchronizes the peace-transfer recipient when states arrive after mount", async () => {
  const view = render(<MapEditorPage terrain={DEFAULT_TERRAIN} sides={sides} states={[]} onAction={vi.fn()} />);

  expect(screen.getByLabelText("Государство-получатель")).toHaveValue("");

  view.rerender(<MapEditorPage terrain={DEFAULT_TERRAIN} sides={sides} states={states} onAction={vi.fn()} />);

  await vi.waitFor(() => {
    expect(screen.getByLabelText("Государство-получатель")).toHaveValue("russia");
  });
});
