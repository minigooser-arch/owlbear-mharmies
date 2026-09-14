import { describe, expect, it } from "vitest";
import type { GridMapState, StateEntity, StrategicCity } from "../shared/types";
import {
  createStrategicCity,
  deleteStrategicCity,
  resolveCityDeFactoState,
  updateStrategicCity,
  validateStrategicCity
} from "./strategicCities";

const states: StateEntity[] = [
  { id: "russia", name: "Россия", color: "#b71c1c", rulingFactionId: "red", active: true },
  { id: "germany", name: "Германия", color: "#263238", rulingFactionId: "black", active: true }
];

const baseCity: StrategicCity = {
  id: "moscow",
  name: "Москва",
  cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
  recognizedStateId: "russia",
  deFactoStateId: "russia",
  factionInfluenceId: null,
  mayorId: null,
  isCapital: true,
  historicalBuildTypeCount: 3
};

function mapWithControllers(first: string | null, second: string | null): GridMapState {
  return {
    version: 1,
    revision: 0,
    cells: {
      "0,0": { terrainId: "plain", impassable: false, factionTerritoryIds: [], recognizedStateId: "russia", deFactoStateId: first },
      "1,0": { terrainId: "plain", impassable: false, factionTerritoryIds: [], recognizedStateId: "russia", deFactoStateId: second }
    }
  };
}

describe("strategic cities", () => {
  it("accepts a city with unique cells, valid states and a nonnegative integer build count", () => {
    expect(validateStrategicCity(baseCity, mapWithControllers("russia", "russia"), states)).toEqual({ ok: true });
  });

  it("rejects empty or duplicate cell sets", () => {
    expect(validateStrategicCity({ ...baseCity, cells: [] }, mapWithControllers("russia", "russia"), states)).toMatchObject({ ok: false, reason: "CITY_CELLS_EMPTY" });
    expect(validateStrategicCity({ ...baseCity, cells: [{ x: 0, y: 0 }, { x: 0, y: 0 }] }, mapWithControllers("russia", "russia"), states)).toMatchObject({ ok: false, reason: "CITY_CELLS_DUPLICATE" });
  });

  it("rejects unknown state references and invalid historical build counts", () => {
    expect(validateStrategicCity({ ...baseCity, recognizedStateId: "unknown" }, mapWithControllers("russia", "russia"), states)).toMatchObject({ ok: false, reason: "CITY_STATE_NOT_FOUND" });
    expect(validateStrategicCity({ ...baseCity, historicalBuildTypeCount: -1 }, mapWithControllers("russia", "russia"), states)).toMatchObject({ ok: false, reason: "CITY_BUILD_COUNT_INVALID" });
    expect(validateStrategicCity({ ...baseCity, historicalBuildTypeCount: 1.5 }, mapWithControllers("russia", "russia"), states)).toMatchObject({ ok: false, reason: "CITY_BUILD_COUNT_INVALID" });
  });

  it("requires every city cell to exist on the strategic map", () => {
    const map = mapWithControllers("russia", "russia");
    delete map.cells["1,0"];
    expect(validateStrategicCity(baseCity, map, states)).toMatchObject({ ok: false, reason: "CITY_CELL_NOT_FOUND" });
  });

  it("resolves full de-facto control only when all city cells share the same controller", () => {
    expect(resolveCityDeFactoState(baseCity, mapWithControllers("germany", "germany"))).toBe("germany");
    expect(resolveCityDeFactoState(baseCity, mapWithControllers("russia", "germany"))).toBeNull();
    expect(resolveCityDeFactoState(baseCity, mapWithControllers("russia", null))).toBeNull();
  });

  it("creates a validated city without mutating the input list", () => {
    const existing: StrategicCity[] = [];
    const result = createStrategicCity(existing, baseCity, mapWithControllers("russia", "russia"), states);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.cities).toEqual([baseCity]);
    expect(existing).toEqual([]);
  });

  it("rejects duplicate city ids", () => {
    expect(createStrategicCity([baseCity], baseCity, mapWithControllers("russia", "russia"), states)).toMatchObject({ ok: false, reason: "CITY_ID_DUPLICATE" });
  });

  it("updates a city atomically only when the resulting city remains valid", () => {
    const valid = updateStrategicCity([baseCity], "moscow", { historicalBuildTypeCount: 5, name: "Москва-город" }, mapWithControllers("russia", "russia"), states);
    expect(valid).toMatchObject({ ok: true });
    if (valid.ok) expect(valid.cities[0]).toMatchObject({ name: "Москва-город", historicalBuildTypeCount: 5 });

    const invalid = updateStrategicCity([baseCity], "moscow", { historicalBuildTypeCount: -1 }, mapWithControllers("russia", "russia"), states);
    expect(invalid).toMatchObject({ ok: false, reason: "CITY_BUILD_COUNT_INVALID" });
  });

  it("rejects updates and deletes for unknown city ids", () => {
    expect(updateStrategicCity([baseCity], "unknown", { name: "Нет" }, mapWithControllers("russia", "russia"), states)).toMatchObject({ ok: false, reason: "CITY_NOT_FOUND" });
    expect(deleteStrategicCity([baseCity], "unknown")).toMatchObject({ ok: false, reason: "CITY_NOT_FOUND" });
  });

  it("deletes only the requested city", () => {
    const berlin: StrategicCity = { ...baseCity, id: "berlin", name: "Берлин" };
    const result = deleteStrategicCity([baseCity, berlin], "moscow");
    expect(result).toEqual({ ok: true, cities: [berlin] });
  });
});
