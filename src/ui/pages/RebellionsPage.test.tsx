// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Side, StateEntity, StrategicCity } from "../../shared/types";
import { RebellionsPage } from "./RebellionsPage";

const states: StateEntity[] = [
  { id: "state", name: "Империя", color: "#777", rulingFactionId: "gov", active: true }
];
const sides: Side[] = [
  { id: "gov", name: "Правительство", color: "#333", playerIds: [], leaderPlayerIds: [], stateId: "state" },
  { id: "rebels", name: "Повстанцы", color: "#933", playerIds: [], leaderPlayerIds: [], stateId: "state" }
];
const cities: StrategicCity[] = [{
  id: "capital",
  name: "Столица",
  cells: [{ x: 0, y: 0 }],
  recognizedStateId: "state",
  deFactoStateId: "state",
  factionInfluenceId: null,
  mayorId: null,
  isCapital: true,
  historicalBuildTypeCount: 2
}];

afterEach(cleanup);

it("starts a rebellion from a state capital with selected factions", () => {
  const onAction = vi.fn();
  render(<RebellionsPage states={states} sides={sides} cities={cities} statuses={[]} onAction={onAction} />);

  fireEvent.click(screen.getByRole("checkbox", { name: "Участник восстания: Правительство" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Участник восстания: Повстанцы" }));
  fireEvent.click(screen.getByRole("button", { name: "Запустить восстание" }));

  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({
    type: "START_REBELLION",
    sourceStateId: "state",
    capitalCityId: "capital",
    participantFactionIds: ["gov", "rebels"]
  }));
});

it("shows current capital control and participant force accounting without a winner formula", () => {
  render(<RebellionsPage
    states={states}
    sides={sides}
    cities={cities}
    statuses={[{
      id: "reb-1",
      sourceStateId: "state",
      sourceStateName: "Империя",
      startedOnTurn: 4,
      capitalCityId: "capital",
      capitalCityName: "Столица",
      territoryCellCount: 12,
      active: true,
      capitalControllerFactionId: "rebels",
      capitalControllerFactionName: "Повстанцы",
      participants: [
        { factionId: "gov", factionName: "Правительство", armyCount: 2, currentHp: 70, maxHp: 100 },
        { factionId: "rebels", factionName: "Повстанцы", armyCount: 1, currentHp: 45, maxHp: 50 }
      ]
    }]}
    onAction={vi.fn()}
  />);

  expect(screen.getByText(/Контроль столицы:/)).toHaveTextContent("Повстанцы");
  expect(screen.getByLabelText("Силы восстания reb-1")).toHaveTextContent("Армий в снимке: 2");
  expect(screen.getByLabelText("Силы восстания reb-1")).toHaveTextContent("♥ 45 / 50");
  expect(screen.queryByText(/победа:|победил/i)).not.toBeInTheDocument();
});

it("closes an active rebellion", () => {
  const onAction = vi.fn();
  render(<RebellionsPage
    states={states}
    sides={sides}
    cities={cities}
    statuses={[{
      id: "reb-1",
      sourceStateId: "state",
      sourceStateName: "Империя",
      startedOnTurn: 4,
      capitalCityId: "capital",
      capitalCityName: "Столица",
      territoryCellCount: 12,
      active: true,
      capitalControllerFactionId: null,
      capitalControllerFactionName: null,
      participants: []
    }]}
    onAction={onAction}
  />);

  fireEvent.click(screen.getByRole("button", { name: "Завершить восстание" }));
  expect(onAction).toHaveBeenCalledWith({ type: "CLOSE_REBELLION", rebellionId: "reb-1" });
});


it("builds a civil war split command for a non-ruling faction", () => {
  const onAction = vi.fn();
  render(<RebellionsPage states={states} sides={sides} cities={cities} statuses={[]} onAction={onAction} />);

  fireEvent.change(screen.getByLabelText("Название нового государства после раскола"), {
    target: { value: "Республика" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Начать гражданскую войну" }));

  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({
    type: "START_CIVIL_WAR",
    sourceStateId: "state",
    rebelFactionId: "rebels",
    newStateId: expect.stringMatching(/^state-/),
    newStateName: "Республика",
    newStateColor: "#aa3344"
  }));
});
