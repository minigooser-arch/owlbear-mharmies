// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StateDemography } from "../../shared/types";
import { PopulationPage } from "./PopulationPage";

const demographic: StateDemography = {
  stateId: "state-1",
  population: 1_000_000,
  populationGrowthFactor: 1.003,
  humanResource: 100_000,
  conscriptionLawId: "GENERAL_MOBILIZATION",
  conscriptionRate: 0.24,
  humanResourceCapacity: 240_000,
  lastPopulationCalculationDate: "2026-09-28"
};

const laws = [{ id: "GENERAL_MOBILIZATION", name: "Всеобщая мобилизация", rate: 0.24, active: true }];

describe("PopulationPage", () => {
  it("shows state balance and requires a reason before submitting correction", () => {
    const onAction = vi.fn();
    render(<PopulationPage states={[{ id: "state-1", name: "Государство", rulingFactionId: null, active: true }]} demographics={[demographic]} conscriptionLaws={laws} onAction={onAction} />);

    expect(screen.getByText("Государство")).toBeInTheDocument();
    expect(screen.getByText(/Максимум ЛР: 240\s?000/)).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Сохранить корректировку" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Например, импорт из таблицы"), { target: { value: "Исправление" } });
    expect(save).not.toBeDisabled();
    fireEvent.click(save);

    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "UPDATE_STATE_DEMOGRAPHY", stateId: "state-1", reason: "Исправление" }));
  });

  it("syncs population from the configured public sheet", async () => {
    const onSyncPopulation = vi.fn().mockResolvedValue({ applied: 1, entries: [], unmatchedStates: [], skippedRows: [], errors: [] });
    render(<PopulationPage states={[]} demographics={[]} conscriptionLaws={laws} onAction={vi.fn()} onSyncPopulation={onSyncPopulation} />);

    fireEvent.click(screen.getByRole("button", { name: "Синхронизировать с Google Sheets" }));
    expect(onSyncPopulation).toHaveBeenCalledOnce();
    expect(await screen.findByRole("status")).toHaveTextContent("Обновлено записей: 1");
  });
});
