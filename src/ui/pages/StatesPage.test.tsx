// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Side, StateEntity } from "../../shared/types";
import { StatesPage } from "./StatesPage";

const sides: Side[] = [
  { id: "red", name: "Красные", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: "russia" },
  { id: "blue", name: "Синие", color: "#00f", playerIds: [], leaderPlayerIds: [], stateId: null }
];
const states: StateEntity[] = [
  { id: "russia", name: "Россия", color: "#b71c1c", rulingFactionId: "red", active: true }
];

afterEach(cleanup);

it("creates a new state inactive so membership and ruler can be configured safely", () => {
  const onAction = vi.fn();
  render(<StatesPage states={states} sides={sides} onAction={onAction} createId={() => "germany"} />);

  fireEvent.change(screen.getByLabelText("Название нового государства"), { target: { value: "Германия" } });
  fireEvent.change(screen.getByLabelText("Цвет нового государства"), { target: { value: "#222222" } });
  fireEvent.click(screen.getByRole("button", { name: "Добавить государство" }));

  expect(onAction).toHaveBeenCalledWith({
    type: "CREATE_STATE",
    state: {
      id: "germany",
      name: "Германия",
      color: "#222222",
      rulingFactionId: null,
      active: false
    }
  });
});

it("assigns a faction to a state and can set an eligible ruling faction", () => {
  const onAction = vi.fn();
  render(<StatesPage states={states} sides={sides} onAction={onAction} />);

  fireEvent.change(screen.getByLabelText("Государство фракции Синие"), { target: { value: "russia" } });
  expect(onAction).toHaveBeenLastCalledWith({ type: "SET_SIDE_STATE", sideId: "blue", stateId: "russia" });

  fireEvent.change(screen.getByLabelText("Правящая фракция Россия"), { target: { value: "red" } });
  expect(onAction).toHaveBeenLastCalledWith({ type: "UPDATE_STATE", stateId: "russia", patch: { rulingFactionId: "red" } });
});

it("edits state name and color from the state administration page", () => {
  const onAction = vi.fn();
  render(<StatesPage states={states} sides={sides} onAction={onAction} />);

  fireEvent.change(screen.getByLabelText("Название государства Россия"), { target: { value: "Российская империя" } });
  fireEvent.change(screen.getByLabelText("Цвет государства Россия"), { target: { value: "#aa0000" } });
  fireEvent.click(screen.getByRole("button", { name: "Сохранить государство Россия" }));

  expect(onAction).toHaveBeenCalledWith({
    type: "UPDATE_STATE",
    stateId: "russia",
    patch: { name: "Российская империя", color: "#aa0000" }
  });
});

it("deletes a state from the state administration page", () => {
  const onAction = vi.fn();
  render(<StatesPage states={states} sides={sides} onAction={onAction} />);

  fireEvent.click(screen.getByRole("button", { name: "Удалить государство Россия" }));
  expect(onAction).toHaveBeenCalledWith({ type: "DELETE_STATE", stateId: "russia" });
});
