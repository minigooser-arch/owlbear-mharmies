import type { ConscriptionLaw, StateDemography, StateEntity } from "../shared/types";
import { parseBackendPopulationCsv, parseConscriptionCategoryCsv, type BackendPopulationRow, type StateConscriptionRow } from "./googleSheetsPopulation";

export interface PopulationSyncPlanEntry {
  stateId: string;
  country: string;
  population: number;
  populationGrowthFactor: number;
  humanResource?: number;
  conscriptionLawId?: string;
  conscriptionRate?: number;
}

export interface PopulationSyncPlan {
  entries: PopulationSyncPlanEntry[];
  unmatchedStates: string[];
  unmatchedConscriptionStates: string[];
  skippedRows: string[];
}

export interface PopulationSyncSummary extends PopulationSyncPlan {
  applied: number;
  humanResourceApplied: number;
  conscriptionApplied: number;
  errors: string[];
}

interface PopulationFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export interface PopulationSyncInput {
  csvUrl: string;
  conscriptionCsvUrl?: string;
  states: readonly StateEntity[];
  demographics: readonly StateDemography[];
  conscriptionLaws?: readonly ConscriptionLaw[];
  fetcher?: (url: string) => Promise<PopulationFetchResponse>;
  applyCorrection: (stateId: string, patch: Pick<StateDemography, "population" | "populationGrowthFactor"> & Partial<Pick<StateDemography, "humanResource" | "conscriptionLawId" | "conscriptionRate">>) => Promise<unknown>;
}

function normalizeLabel(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU").replaceAll("ё", "е").replace(/\s+/g, " ");
}

function hasRequiredHeaders(csv: string): boolean {
  const header = (csv.split(/\r?\n/, 1)[0] ?? "").replace(/^\uFEFF/, "");
  const columns = header.split(/[;,]/).map((column) => column.replace(/^\s*"|"\s*$/g, "").trim().toLowerCase());
  return columns.includes("country") && columns.includes("population") && columns.includes("growth_rate");
}

export function buildPopulationSyncPlan(
  rows: readonly BackendPopulationRow[],
  states: readonly StateEntity[],
  conscriptionRows: readonly StateConscriptionRow[] = [],
  conscriptionLaws: readonly ConscriptionLaw[] = []
): PopulationSyncPlan {
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
  const unmatchedConscriptionStates: string[] = [];
  const categoriesByState = new Map<string, StateConscriptionRow>();
  for (const row of conscriptionRows) {
    const key = normalizeLabel(row.stateName);
    if (key && !categoriesByState.has(key)) categoriesByState.set(key, row);
  }
  const lawsByName = new Map(conscriptionLaws.map((law) => [normalizeLabel(law.name), law]));
  for (const state of states) {
    const country = state.backendCountry?.trim();
    const row = country ? rowsByCountry.get(country) : undefined;
    if (!country || !row) {
      unmatchedStates.push(state.id);
      continue;
    }
    const entry: PopulationSyncPlanEntry = {
      stateId: state.id,
      country,
      population: row.population,
      populationGrowthFactor: row.growthRate
    };
    if (conscriptionRows.length > 0) {
      const category = categoriesByState.get(normalizeLabel(state.name)) ?? categoriesByState.get(normalizeLabel(country));
      const law = category ? lawsByName.get(normalizeLabel(category.category)) : undefined;
      if (category?.humanResource !== undefined) entry.humanResource = category.humanResource;
      if (law) {
        entry.conscriptionLawId = law.id;
        entry.conscriptionRate = law.rate;
      } else {
        unmatchedConscriptionStates.push(state.id);
      }
    }
    entries.push(entry);
  }
  return { entries, unmatchedStates, unmatchedConscriptionStates, skippedRows };
}

export async function syncPopulationFromPublicSheet(input: PopulationSyncInput): Promise<PopulationSyncSummary> {
  const summary: PopulationSyncSummary = { applied: 0, humanResourceApplied: 0, conscriptionApplied: 0, entries: [], unmatchedStates: [], unmatchedConscriptionStates: [], skippedRows: [], errors: [] };
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
  let conscriptionRows: StateConscriptionRow[] = [];
  if (input.conscriptionCsvUrl?.trim()) {
    try {
      const conscriptionResponse = await fetcher(input.conscriptionCsvUrl.trim());
      if (!conscriptionResponse.ok) {
        summary.errors.push(`Таблица призыва вернула HTTP ${conscriptionResponse.status}`);
      } else {
        conscriptionRows = parseConscriptionCategoryCsv(await conscriptionResponse.text());
        if (conscriptionRows.length === 0) summary.errors.push("В CSV государств не найдены категории призыва");
      }
    } catch (error) {
      summary.errors.push(`Не удалось загрузить таблицу призыва: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const plan = buildPopulationSyncPlan(parseBackendPopulationCsv(csv), input.states, conscriptionRows, input.conscriptionLaws ?? []);
  summary.entries = plan.entries;
  summary.unmatchedStates = plan.unmatchedStates;
  summary.unmatchedConscriptionStates = plan.unmatchedConscriptionStates;
  summary.skippedRows = plan.skippedRows;
  for (const entry of plan.entries) {
    try {
      const patch: Pick<StateDemography, "population" | "populationGrowthFactor"> & Partial<Pick<StateDemography, "humanResource" | "conscriptionLawId" | "conscriptionRate">> = {
        population: entry.population,
        populationGrowthFactor: entry.populationGrowthFactor
      };
      if (entry.humanResource !== undefined) patch.humanResource = entry.humanResource;
      if (entry.conscriptionLawId && entry.conscriptionRate !== undefined) {
        patch.conscriptionLawId = entry.conscriptionLawId;
        patch.conscriptionRate = entry.conscriptionRate;
      }
      await input.applyCorrection(entry.stateId, patch);
      summary.applied += 1;
      if (entry.humanResource !== undefined) summary.humanResourceApplied += 1;
      if (entry.conscriptionLawId) summary.conscriptionApplied += 1;
    } catch (error) {
      summary.errors.push(`${entry.stateId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return summary;
}
