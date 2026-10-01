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

export type PopulationCorrectionPatch = Pick<StateDemography, "population" | "populationGrowthFactor"> &
  Partial<Pick<StateDemography, "humanResource" | "conscriptionLawId" | "conscriptionRate">>;

export interface PopulationCorrection {
  stateId: string;
  patch: PopulationCorrectionPatch;
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
  applyCorrection: (stateId: string, patch: PopulationCorrectionPatch) => Promise<unknown>;
  /** Optional atomic path used by the Owlbear adapter to persist one sync package. */
  applyCorrections?: (corrections: readonly PopulationCorrection[]) => Promise<unknown>;
}

function normalizeLabel(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    // The state sheet sometimes displays a law as `... (4%)`, while the
    // in-extension law catalog stores only the canonical name.
    .replace(/\([^)]*\)/g, " ")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[«»"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Country identifiers come from two independently maintained sheets/settings
 * fields. They are identifiers, not display labels, so only normalize the
 * transport noise that must not change identity (BOM, Unicode form, case and
 * whitespace). In particular, do not strip punctuation or parenthesized text
 * here: those may legitimately distinguish two backend keys.
 */
function normalizeBackendCountryKey(value: string): string {
  // The sheet and the state editor frequently differ only by case/spacing.
  return value
    .replace(/^\uFEFF/, "")
    .normalize("NFKC")
    .replace(/[\u00A0\u2007\u202F]/g, " ")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
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
    const key = normalizeBackendCountryKey(row.country);
    if (!key) {
      skippedRows.push(`${row.country}:empty`);
      continue;
    }
    if (rowsByCountry.has(key)) {
      skippedRows.push(`${row.country}:duplicate`);
      continue;
    }
    rowsByCountry.set(key, row);
  }

  const entries: PopulationSyncPlanEntry[] = [];
  const unmatchedStates: string[] = [];
  const unmatchedConscriptionStates: string[] = [];
  const categoriesByState = new Map<string, StateConscriptionRow>();
  const categoriesByPopulation = new Map<number, StateConscriptionRow>();
  const duplicatePopulations = new Set<number>();
  for (const row of conscriptionRows) {
    const key = normalizeLabel(row.stateName);
    if (key && !categoriesByState.has(key)) categoriesByState.set(key, row);
    if (row.population !== undefined) {
      if (duplicatePopulations.has(row.population)) continue;
      if (categoriesByPopulation.has(row.population)) {
        categoriesByPopulation.delete(row.population);
        duplicatePopulations.add(row.population);
      } else {
        categoriesByPopulation.set(row.population, row);
      }
    }
  }
  const lawsByName = new Map(conscriptionLaws.map((law) => [normalizeLabel(law.name), law]));
  for (const state of states) {
    const country = state.backendCountry?.trim();
    const row = country ? rowsByCountry.get(normalizeBackendCountryKey(country)) : undefined;
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
      const category = categoriesByState.get(normalizeLabel(state.name))
        ?? categoriesByState.get(normalizeLabel(country))
        // The sheet and scene can use different display names for the same
        // state. Population is a stable fallback because both feeds use the
        // same thousand-person unit.
        ?? categoriesByPopulation.get(row.population);
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
  const corrections: PopulationCorrection[] = plan.entries.map((entry) => {
      const patch: PopulationCorrectionPatch = {
        population: entry.population,
        populationGrowthFactor: entry.populationGrowthFactor
      };
      if (entry.humanResource !== undefined) patch.humanResource = entry.humanResource;
      if (entry.conscriptionLawId && entry.conscriptionRate !== undefined) {
        patch.conscriptionLawId = entry.conscriptionLawId;
        patch.conscriptionRate = entry.conscriptionRate;
      }
      return { stateId: entry.stateId, patch };
    });
  if (input.applyCorrections) {
    try {
      await input.applyCorrections(corrections);
      summary.applied = corrections.length;
      summary.humanResourceApplied = corrections.filter(({ patch }) => patch.humanResource !== undefined).length;
      summary.conscriptionApplied = corrections.filter(({ patch }) => patch.conscriptionLawId !== undefined).length;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.errors.push(...corrections.map(({ stateId }) => `${stateId}: ${message}`));
    }
  } else {
    for (const correction of corrections) {
      try {
        await input.applyCorrection(correction.stateId, correction.patch);
        summary.applied += 1;
        if (correction.patch.humanResource !== undefined) summary.humanResourceApplied += 1;
        if (correction.patch.conscriptionLawId) summary.conscriptionApplied += 1;
      } catch (error) {
        summary.errors.push(`${correction.stateId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return summary;
}

