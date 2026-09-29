import type { StateDemography, StateEntity } from "../shared/types";
import { parseBackendPopulationCsv, type BackendPopulationRow } from "./googleSheetsPopulation";

export interface PopulationSyncPlanEntry {
  stateId: string;
  country: string;
  population: number;
  populationGrowthFactor: number;
}

export interface PopulationSyncPlan {
  entries: PopulationSyncPlanEntry[];
  unmatchedStates: string[];
  skippedRows: string[];
}

export interface PopulationSyncSummary extends PopulationSyncPlan {
  applied: number;
  errors: string[];
}

interface PopulationFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export interface PopulationSyncInput {
  csvUrl: string;
  states: readonly StateEntity[];
  demographics: readonly StateDemography[];
  fetcher?: (url: string) => Promise<PopulationFetchResponse>;
  applyCorrection: (stateId: string, patch: Pick<StateDemography, "population" | "populationGrowthFactor">) => Promise<unknown>;
}

function hasRequiredHeaders(csv: string): boolean {
  const header = (csv.split(/\r?\n/, 1)[0] ?? "").replace(/^\uFEFF/, "");
  const columns = header.split(/[;,]/).map((column) => column.replace(/^\s*"|"\s*$/g, "").trim().toLowerCase());
  return columns.includes("country") && columns.includes("population") && columns.includes("growth_rate");
}

export function buildPopulationSyncPlan(rows: readonly BackendPopulationRow[], states: readonly StateEntity[]): PopulationSyncPlan {
  const rowsByCountry = new Map<string, BackendPopulationRow>();
  const skippedRows: string[] = [];
  for (const row of rows) {
    if (rowsByCountry.has(row.country)) {
      skippedRows.push(`${row.country}:duplicate`);
      continue;
    }
    rowsByCountry.set(row.country, row);
  }

  const entries: PopulationSyncPlanEntry[] = [];
  const unmatchedStates: string[] = [];
  for (const state of states) {
    const country = state.backendCountry?.trim();
    const row = country ? rowsByCountry.get(country) : undefined;
    if (!country || !row) {
      unmatchedStates.push(state.id);
      continue;
    }
    entries.push({
      stateId: state.id,
      country,
      population: row.population,
      populationGrowthFactor: row.growthRate
    });
  }
  return { entries, unmatchedStates, skippedRows };
}

export async function syncPopulationFromPublicSheet(input: PopulationSyncInput): Promise<PopulationSyncSummary> {
  const summary: PopulationSyncSummary = { applied: 0, entries: [], unmatchedStates: [], skippedRows: [], errors: [] };
  const url = input.csvUrl.trim();
  if (!url) {
    summary.errors.push("CSV URL не задан");
    return summary;
  }

  const fetcher = input.fetcher ?? (async (fetchUrl: string) => fetch(fetchUrl));
  let response: PopulationFetchResponse;
  try {
    response = await fetcher(url);
  } catch (error) {
    summary.errors.push(`Не удалось загрузить таблицу: ${error instanceof Error ? error.message : String(error)}`);
    return summary;
  }
  if (!response.ok) {
    summary.errors.push(`Таблица вернула HTTP ${response.status}`);
    return summary;
  }

  let csv: string;
  try {
    csv = await response.text();
  } catch (error) {
    summary.errors.push(`Не удалось прочитать CSV: ${error instanceof Error ? error.message : String(error)}`);
    return summary;
  }

  if (!hasRequiredHeaders(csv)) {
    summary.errors.push("В CSV не найдены строки с заголовками country, population, growth_rate");
    return summary;
  }
  const plan = buildPopulationSyncPlan(parseBackendPopulationCsv(csv), input.states);
  summary.entries = plan.entries;
  summary.unmatchedStates = plan.unmatchedStates;
  summary.skippedRows = plan.skippedRows;
  for (const entry of plan.entries) {
    try {
      await input.applyCorrection(entry.stateId, {
        population: entry.population,
        populationGrowthFactor: entry.populationGrowthFactor
      });
      summary.applied += 1;
    } catch (error) {
      summary.errors.push(`${entry.stateId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return summary;
}
