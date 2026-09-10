// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_TURN_STATE } from "../../shared/constants";
import { TurnStatusCard } from "./TurnStatusCard";

afterEach(cleanup);

it("lets a GM replace the current turn number directly", () => {
  const action = vi.fn();
  render(
    <TurnStatusCard
      turn={{ ...DEFAULT_TURN_STATE, turnNumber: 26 }}
      role="GM"
      onAction={action}
    />
  );

  fireEvent.click(screen.getByText("Настройки хода"));
  const input = screen.getByLabelText("Номер хода");
  expect(input).toHaveValue(26);
  fireEvent.change(input, { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Установить номер хода" }));

  expect(action).toHaveBeenCalledWith({ type: "SET_TURN_NUMBER", turnNumber: 1 });
});

it("does not show the turn number editor to players", () => {
  render(<TurnStatusCard turn={{ ...DEFAULT_TURN_STATE, turnNumber: 26 }} role="PLAYER" onAction={() => undefined} />);
  expect(screen.queryByLabelText("Номер хода")).toBeNull();
});
