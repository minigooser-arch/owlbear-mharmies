// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_TURN_STATE } from "../../shared/constants";
import { TurnStatusCard } from "./TurnStatusCard";

afterEach(cleanup);

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

it("uses a single completion command from the movement phase", () => {
  const action = vi.fn();
  render(<TurnStatusCard turn={{ ...DEFAULT_TURN_STATE, phase: "MOVEMENT" }} role="GM" onAction={action} />);
  fireEvent.click(screen.getByRole("button", { name: "Завершить ход" }));
  expect(action).toHaveBeenCalledTimes(1);
  expect(action).toHaveBeenCalledWith({ type: "COMPLETE_TURN_NOW" });
  expect(screen.queryByRole("button", { name: "Завершить фазу перемещения" })).not.toBeInTheDocument();
});

it("uses the same single command for a legacy post-movement turn", () => {
  const action = vi.fn();
  render(<TurnStatusCard turn={{ ...DEFAULT_TURN_STATE, phase: "POST_MOVEMENT" }} role="GM" onAction={action} />);
  fireEvent.click(screen.getByRole("button", { name: "Завершить ход" }));
  expect(action).toHaveBeenCalledWith({ type: "COMPLETE_TURN_NOW" });
  expect(screen.queryByRole("button", { name: "Вернуться к перемещению" })).not.toBeInTheDocument();
});

it("disables the finish button during automatic completion", () => {
  const action = vi.fn();
  render(<TurnStatusCard turn={{ ...DEFAULT_TURN_STATE, phase: "POST_MOVEMENT",
    completionPending: { source: "SCHEDULE", boundaryId: "STANDARD:2026-10-07T15:00:00+03:00" } }} role="GM" onAction={action} />);
  expect(screen.getByRole("button", { name: /Завершение хода выполняется/ })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Новый ход начнётся автоматически");
  expect(action).not.toHaveBeenCalled();
});

it("lists the exact blockers when turn completion is waiting", () => {
  render(<TurnStatusCard turn={{ ...DEFAULT_TURN_STATE, phase: "POST_MOVEMENT",
    completionPending: { source: "MANUAL" } }} role="GM"
    onAction={() => undefined} turnCompletionBlockers={[
      "LAND_BATTLE_ACTIVE", "NAVAL_REQUESTS_PENDING", "MOVEMENT_RESOLUTION_PENDING"
    ]} battleCount={2} navalRequestCount={1} pendingTurnArmyNames={["Армия Британии"]} />);
  expect(screen.getByRole("status")).toHaveTextContent("Незавершённые сухопутные бои: 2");
  expect(screen.getByRole("status")).toHaveTextContent("Необработанные заявки на морской бой: 1");
  expect(screen.getByRole("status")).toHaveTextContent("Не завершили движение: Армия Британии");
});

it("distinguishes waiting on background processing from real battle blockers", () => {
  render(<TurnStatusCard turn={{ ...DEFAULT_TURN_STATE, phase: "POST_MOVEMENT",
    completionPending: { source: "MANUAL" } }} role="GM"
    onAction={() => undefined} turnCompletionBlockers={[]} />);
  expect(screen.getByRole("status")).toHaveTextContent("Игровых блокировок в текущей сцене нет");
  expect(screen.getByRole("status")).toHaveTextContent("Google Sheets");
});

it("does not leak GM-only turn blockers into player UI", () => {
  render(<TurnStatusCard turn={{ ...DEFAULT_TURN_STATE, phase: "POST_MOVEMENT",
    completionPending: { source: "MANUAL" } }} role="PLAYER"
    onAction={() => undefined} turnCompletionBlockers={["LAND_BATTLE_ACTIVE"]} battleCount={1} />);
  expect(screen.queryByText(/Незавершённые сухопутные бои/)).not.toBeInTheDocument();
});
