// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DEFAULT_TURN_STATE } from "../../shared/constants";
import { TurnStatusCard } from "./TurnStatusCard";

it("shows a deferred Moscow time and GM controls", () => {
  const action = vi.fn();
  render(<TurnStatusCard
    turn={{ ...DEFAULT_TURN_STATE, turnNumber: 7, deferredUntil: "2026-09-03T15:00:00.000Z" }}
    role="GM"
    now={new Date("2026-09-02T13:00:00.000Z")}
    onAction={action}
  />);
  expect(screen.getByText("Ход №7")).toBeInTheDocument();
  expect(screen.getByText(/Перенесён:/)).toHaveTextContent("18:00 МСК");
  fireEvent.click(screen.getByText("Настройки хода"));
  expect(screen.getByRole("button", { name: "Остановить ходы" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Отменить перенос" })).toBeInTheDocument();
});

it("shows pause without a misleading next-turn time", () => {
  render(<TurnStatusCard
    turn={{ ...DEFAULT_TURN_STATE, autoTurnsPaused: true }}
    role="PLAYER"
    now={new Date("2026-09-02T13:00:00.000Z")}
    onAction={() => undefined}
  />);
  expect(screen.getByText("Автоматические ходы остановлены")).toBeInTheDocument();
  expect(screen.queryByText(/Следующая смена/)).not.toBeInTheDocument();
});

it("converts a GM deferral input from Moscow local time", () => {
  const action = vi.fn();
  render(<TurnStatusCard turn={DEFAULT_TURN_STATE} role="GM" now={new Date("2026-09-02T10:00:00.000Z")} onAction={action} />);
  fireEvent.click(screen.getByText("Настройки хода"));
  fireEvent.change(screen.getByLabelText("Новая дата и время (МСК)"), { target: { value: "2026-09-03T18:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Отложить ход" }));
  expect(action).toHaveBeenCalledWith({ type: "DEFER_TURN", until: "2026-09-03T15:00:00.000Z" });
});
