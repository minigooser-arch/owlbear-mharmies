/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, expect, it } from "vitest";
import type { GridMapState, Side, StateEntity, StrategicCity } from "../shared/types";
import {
  addCityBuilding,
  canUseCityBuilding,
  isCityBuildingActive,
  removeCityBuilding
} from "./cityBuildingRules";

const states: StateEntity[] = [
  { id: "state-a", name: "A", color: "#fff", rulingFactionId: "faction-a", active: true },
  { id: "state-b", name: "B", color: "#000", rulingFactionId: "faction-b", active: true }
];
const sides: Side[] = [
  { id: "faction-a", name: "A", color: "#fff", playerIds: ["p1"], leaderPlayerIds: ["p1"], stateId: "state-a" },
  { id: "faction-b", name: "B", color: "#000", playerIds: ["p2"], leaderPlayerIds: ["p2"], stateId: "state-b" }
];
const city: StrategicCity = {
  id: "city", name: "City", cells: [{ x: 0, y: 0 }], recognizedStateId: "state-a", deFactoStateId: "state-a",
  factionInfluenceId: "faction-a", mayorId: null, isCapital: false, historicalBuildTypeCount: 0,
  buildings: [{ id: "station", type: "RAILWAY_STATION", cell: { x: 4, y: 4 } }]
};
const map: GridMapState = {
  version: 1, revision: 1,
  cells: { "0,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "state-a", deFactoStateId: "state-a" } }
};

describe("city building rules", () => {
  it("activates buildings only while the influence faction controls the whole city", () => {
    expect(isCityBuildingActive({ ...city }, city.buildings![0]!, map, states, sides)).toBe(true);
    const capturedMap = structuredClone(map);
    capturedMap.cells["0,0"]!.deFactoStateId = "state-b";
    expect(isCityBuildingActive(city, city.buildings![0]!, capturedMap, states, sides)).toBe(false);
  });

  it("uses the city's stored controller when legacy city cells have no de-facto annotations", () => {
    const sparseMap = structuredClone(map);
    sparseMap.cells["0,0"]!.deFactoStateId = null;
    expect(isCityBuildingActive(city, city.buildings![0]!, sparseMap, states, sides)).toBe(true);
  });

  it("allows only the influencing faction leaders or GM to use an active building", () => {
    const building = city.buildings![0]!;
    expect(canUseCityBuilding("p1", "PLAYER", city, building, map, states, sides)).toBe(true);
    expect(canUseCityBuilding("p2", "PLAYER", city, building, map, states, sides)).toBe(false);
    expect(canUseCityBuilding("gm", "GM", city, building, map, states, sides)).toBe(true);
  });

  it("allows building cells outside city territory, enforces one type and unique canal cells", () => {
    const first = addCityBuilding(city, { id: "hospital", type: "MILITARY_HOSPITAL", cell: { x: 9, y: 9 } }, []);
    expect(first.ok).toBe(true);
    const duplicate = addCityBuilding(first.ok ? first.city : city, { id: "hospital-2", type: "MILITARY_HOSPITAL", cell: { x: 10, y: 10 } }, []);
    expect(duplicate).toMatchObject({ ok: false, reason: "BUILDING_TYPE_DUPLICATE" });
    const canal = addCityBuilding(city, { id: "canal", type: "CANAL", cell: { x: 4, y: 4 } }, []);
    expect(canal.ok).toBe(true);
    const occupiedCanal = addCityBuilding({ ...city, id: "other" }, { id: "canal-2", type: "CANAL", cell: { x: 4, y: 4 } }, [canal.ok ? canal.city : city]);
    expect(occupiedCanal).toMatchObject({ ok: false, reason: "CANAL_CELL_OCCUPIED" });
    expect(removeCityBuilding({ ...city, buildings: [...city.buildings!, { id: "x", type: "PORT", cell: { x: 1, y: 1 } }] }, "x").ok).toBe(true);
  });
});


describe("city building location normalization", () => {
  it("moves every existing building to the city's first strategic cell", () => {
    const city: StrategicCity = {
      id: "city-1",
      name: "Москва",
      cells: [{ x: 12, y: -4 }, { x: 13, y: -4 }],
      recognizedStateId: "state-1",
      deFactoStateId: "state-1",
      factionInfluenceId: "side-1",
      mayorId: null,
      isCapital: true,
      historicalBuildTypeCount: 0,
      buildings: [
        { id: "barracks", type: "BARRACKS", cell: { x: 99, y: 99 } },
        { id: "hospital", type: "MILITARY_HOSPITAL", cell: { x: -8, y: 20 } }
      ]
    };

    const normalized = normalizeCityBuildingLocations([city]);

    expect(normalized[0]?.buildings).toEqual([
      { id: "barracks", type: "BARRACKS", cell: { x: 12, y: -4 } },
      { id: "hospital", type: "MILITARY_HOSPITAL", cell: { x: 12, y: -4 } }
    ]);
    expect(city.buildings?.[0].cell).toEqual({ x: 99, y: 99 });
  });
});
