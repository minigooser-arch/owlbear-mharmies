// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { StateEntity, StateRelations } from "../../shared/types";
import { StateDiplomacyPage } from "./StateDiplomacyPage";

const states: StateEntity[] = [
  { id: "russia", name: "Россия", color: "#b71c1c", rulingFactionId: "red", active: true },
  { id: "germany", name: "Германия", color: "#222222", rulingFactionId: "blue", active: true }
];
const relations: StateRelations = {
  russia: { germany: { militaryAccess: true, atWar: false } },
  germany: { russia: { militaryAccess: false, atWar: false } }
};

afterEach(cleanup);

it("renders directional military access separately and war symmetrically", () => {
  const onAction = vi.fn();
  render(<StateDiplomacyPage states={states} stateRelations={relations} onAction={onAction} />);

  const russiaToGermany = screen.getByLabelText("Проход Россия → Германия");
  const germanyToRussia = screen.getByLabelText("Проход Германия → Россия");
  const war = screen.getByLabelText("Война Россия ↔ Германия");

  expect(russiaToGermany).toBeChecked();
  expect(germanyToRussia).not.toBeChecked();
  expect(war).not.toBeChecked();

  fireEvent.click(germanyToRussia);
  expect(onAction).toHaveBeenLastCalledWith({
    type: "SET_STATE_MILITARY_ACCESS",
    fromStateId: "germany",
    toStateId: "russia",
    allowed: true
  });

  fireEvent.click(war);
  expect(onAction).toHaveBeenLastCalledWith({
    type: "SET_STATE_WAR",
    leftStateId: "russia",
    rightStateId: "germany",
    atWar: true
  });
});
