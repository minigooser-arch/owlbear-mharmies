// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { StateEntity, StateRelations } from "../../shared/types";
import { StateDiplomacyPage } from "./StateDiplomacyPage";

const states: StateEntity[] = [
  { id: "russia", name: "Россия", color: "#b71c1c", rulingFactionId: "red", active: true },
  { id: "germany", name: "Германия", color: "#222222", rulingFactionId: "blue", active: true },
  { id: "france", name: "Франция", color: "#3344aa", rulingFactionId: "green", active: true }
];
const relations: StateRelations = {
  russia: {
    germany: { militaryAccess: true, atWar: true },
    france: { militaryAccess: false, atWar: false }
  },
  germany: {
    russia: { militaryAccess: false, atWar: true },
    france: { militaryAccess: false, atWar: false }
  },
  france: {
    russia: { militaryAccess: false, atWar: false },
    germany: { militaryAccess: false, atWar: false }
  }
};

afterEach(cleanup);

it("shows only the selected state's counterparts and filters by counterpart name", () => {
  render(<StateDiplomacyPage states={states} stateRelations={relations} onAction={vi.fn()} />);

  const select = screen.getByRole("combobox", { name: "Государство для дипломатии" });
  fireEvent.change(select, { target: { value: "russia" } });

  expect(screen.getByRole("button", { name: "Настроить отношения: Германия" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Настроить отношения: Франция" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Настроить отношения: Россия" })).not.toBeInTheDocument();

  fireEvent.change(screen.getByRole("searchbox", { name: "Поиск государств" }), { target: { value: "герм" } });
  expect(screen.getByRole("button", { name: "Настроить отношения: Германия" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Настроить отношения: Франция" })).not.toBeInTheDocument();
});

it("filters counterpart rows to relations at war", () => {
  render(<StateDiplomacyPage states={states} stateRelations={relations} onAction={vi.fn()} />);
  fireEvent.change(screen.getByRole("combobox", { name: "Фильтр отношений" }), { target: { value: "WAR" } });

  expect(screen.getByRole("button", { name: "Настроить отношения: Германия" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Настроить отношения: Франция" })).not.toBeInTheDocument();
});

it("renders directional military access separately and war symmetrically", () => {
  const onAction = vi.fn();
  render(<StateDiplomacyPage states={states} stateRelations={relations} onAction={onAction} />);

  fireEvent.click(screen.getByRole("button", { name: "Настроить отношения: Германия" }));
  const russiaToGermany = screen.getByLabelText("Доступ войскам Россия на территорию Германия");
  const germanyToRussia = screen.getByLabelText("Доступ войскам Германия на территорию Россия");
  const war = screen.getByLabelText("Война Россия — Германия");

  expect(russiaToGermany).toBeChecked();
  expect(germanyToRussia).not.toBeChecked();
  expect(war).toBeChecked();

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
    atWar: false
  });
});

it("selects a surviving state when the current selection is removed", () => {
  const { rerender } = render(<StateDiplomacyPage states={states} stateRelations={relations} onAction={vi.fn()} />);
  const select = screen.getByRole("combobox", { name: "Государство для дипломатии" });
  fireEvent.change(select, { target: { value: "france" } });

  rerender(<StateDiplomacyPage states={states.slice(0, 2)} stateRelations={relations} onAction={vi.fn()} />);
  expect(screen.getByRole("combobox", { name: "Государство для дипломатии" })).toHaveValue("russia");

  rerender(<StateDiplomacyPage states={[]} stateRelations={{}} onAction={vi.fn()} />);
  expect(screen.getByText("Для межгосударственных отношений нужно минимум два государства.")).toBeInTheDocument();
});
