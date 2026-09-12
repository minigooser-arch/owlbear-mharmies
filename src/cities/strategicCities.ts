import { cellKey } from "../grid/strategicGrid";
import type { GridMapState, StateEntity, StrategicCity } from "../shared/types";

export type StrategicCityValidationReason =
  | "CITY_CELLS_EMPTY"
  | "CITY_CELLS_DUPLICATE"
  | "CITY_STATE_NOT_FOUND"
  | "CITY_BUILD_COUNT_INVALID"
  | "CITY_CELL_NOT_FOUND";

export type StrategicCityValidationResult =
  | { ok: true }
  | { ok: false; reason: StrategicCityValidationReason };

export type StrategicCityMutationResult =
  | { ok: true; cities: StrategicCity[] }
  | { ok: false; reason: StrategicCityValidationReason | "CITY_ID_DUPLICATE" | "CITY_NOT_FOUND" };

export function validateStrategicCity(
  city: StrategicCity,
  gridMap: GridMapState,
  states: readonly StateEntity[]
): StrategicCityValidationResult {
  if (city.cells.length === 0) return { ok: false, reason: "CITY_CELLS_EMPTY" };

  const keys = city.cells.map(cellKey);
  if (new Set(keys).size !== keys.length) {
    return { ok: false, reason: "CITY_CELLS_DUPLICATE" };
  }

  const stateIds = new Set(states.map((state) => state.id));
  if (!stateIds.has(city.recognizedStateId) || !stateIds.has(city.deFactoStateId)) {
    return { ok: false, reason: "CITY_STATE_NOT_FOUND" };
  }

  if (!Number.isInteger(city.historicalBuildTypeCount) || city.historicalBuildTypeCount < 0) {
    return { ok: false, reason: "CITY_BUILD_COUNT_INVALID" };
  }

  if (keys.some((key) => gridMap.cells[key] === undefined)) {
    return { ok: false, reason: "CITY_CELL_NOT_FOUND" };
  }

  return { ok: true };
}

export function createStrategicCity(
  cities: readonly StrategicCity[],
  city: StrategicCity,
  gridMap: GridMapState,
  states: readonly StateEntity[]
): StrategicCityMutationResult {
  if (cities.some((candidate) => candidate.id === city.id)) {
    return { ok: false, reason: "CITY_ID_DUPLICATE" };
  }
  const validation = validateStrategicCity(city, gridMap, states);
  if (!validation.ok) return validation;
  return { ok: true, cities: [...cities.map((candidate) => structuredClone(candidate)), structuredClone(city)] };
}

export function updateStrategicCity(
  cities: readonly StrategicCity[],
  cityId: string,
  patch: Partial<Omit<StrategicCity, "id">>,
  gridMap: GridMapState,
  states: readonly StateEntity[]
): StrategicCityMutationResult {
  const index = cities.findIndex((candidate) => candidate.id === cityId);
  if (index < 0) return { ok: false, reason: "CITY_NOT_FOUND" };
  const current = cities[index];
  if (!current) return { ok: false, reason: "CITY_NOT_FOUND" };
  const next: StrategicCity = { ...structuredClone(current), ...structuredClone(patch), id: cityId };
  const validation = validateStrategicCity(next, gridMap, states);
  if (!validation.ok) return validation;
  return {
    ok: true,
    cities: cities.map((candidate, candidateIndex) => candidateIndex === index ? next : structuredClone(candidate))
  };
}

export function deleteStrategicCity(
  cities: readonly StrategicCity[],
  cityId: string
): StrategicCityMutationResult {
  if (!cities.some((candidate) => candidate.id === cityId)) {
    return { ok: false, reason: "CITY_NOT_FOUND" };
  }
  return {
    ok: true,
    cities: cities.filter((candidate) => candidate.id !== cityId).map((candidate) => structuredClone(candidate))
  };
}

export function resolveCityDeFactoState(
  city: StrategicCity,
  gridMap: GridMapState
): string | null {
  if (city.cells.length === 0) return null;

  let controller: string | null | undefined;
  for (const cell of city.cells) {
    const stored = gridMap.cells[cellKey(cell)];
    if (!stored || stored.deFactoStateId === null) return null;
    if (controller === undefined) {
      controller = stored.deFactoStateId;
      continue;
    }
    if (stored.deFactoStateId !== controller) return null;
  }
  return controller ?? null;
}
