import { describe, expect, it } from "vitest";
import { findSupplyPath } from "./supplyService";
import type { SceneState } from "../shared/types";

describe("railway supply endpoint", () => {
  it("requires a reachable active railway station when city records exist", () => {
    const scene = {
      version: 8, revision: 1, settings: {} as SceneState["settings"], turn: { turnNumber: 1, autoTurnsPaused: false, deferredUntil: null, lastCompletedAt: null, lastCompletedBy: null, lastProcessedBoundaryId: null },
      sides: [{ id: "f", name: "F", color: "#fff", playerIds: [], leaderPlayerIds: [], stateId: "s" }], states: [{ id: "s", name: "S", color: "#fff", rulingFactionId: "f", active: true }],
      gridMap: { version: 1, revision: 1, cells: { "0,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "s", deFactoStateId: "s" }, "1,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "s", deFactoStateId: "s" } } },
      terrain: { version: 1, types: {} }, wars: [], relations: {}, stateRelations: {}, strategicCities: [{ id: "c", name: "C", cells: [{ x: 1, y: 0 }], recognizedStateId: "s", deFactoStateId: "s", factionInfluenceId: "f", mayorId: null, isCapital: false, historicalBuildTypeCount: 0, buildings: [{ id: "r", type: "RAILWAY_STATION", cell: { x: 1, y: 0 } }] }]
    } as unknown as SceneState;
    expect(findSupplyPath(scene, { x: 0, y: 0 }, "s")).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }]);
  });

  it("allows a foreign railway only with an active logistics center and directed access", () => {
    const scene = {
      version: 9, revision: 1, settings: {} as SceneState["settings"], turn: { turnNumber: 1, phase: "MOVEMENT", autoTurnsPaused: false, deferredUntil: null, lastCompletedAt: null, lastCompletedBy: null, lastProcessedBoundaryId: null },
      sides: [
        { id: "home-f", name: "Home", color: "#fff", playerIds: [], leaderPlayerIds: [], stateId: "home" },
        { id: "host-f", name: "Host", color: "#000", playerIds: [], leaderPlayerIds: [], stateId: "host" }
      ],
      states: [
        { id: "home", name: "Home", color: "#fff", rulingFactionId: "home-f", active: true },
        { id: "host", name: "Host", color: "#000", rulingFactionId: "host-f", active: true }
      ],
      gridMap: { version: 1, revision: 1, cells: {
        "0,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "home", deFactoStateId: "home" },
        "1,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "host", deFactoStateId: "host" },
        "2,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "host", deFactoStateId: "host" }
      } },
      terrain: { version: 1, types: {} }, wars: [], relations: {},
      stateRelations: { home: { host: { militaryAccess: true, atWar: false } } },
      strategicCities: [{
        id: "host-city", name: "Host City", cells: [{ x: 2, y: 0 }],
        recognizedStateId: "host", deFactoStateId: "host", factionInfluenceId: "host-f",
        mayorId: null, isCapital: false, historicalBuildTypeCount: 0,
        buildings: [
          { id: "rail", type: "RAILWAY_STATION", cell: { x: 2, y: 0 } },
          { id: "logistics", type: "MILITARY_LOGISTICS_CENTER", cell: { x: 2, y: 0 } }
        ]
      }]
    } as unknown as SceneState;

    expect(findSupplyPath(scene, { x: 0, y: 0 }, "home")).toEqual([
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }
    ]);

    const withoutLogistics = structuredClone(scene);
    const hostCity = withoutLogistics.strategicCities?.[0];
    if (!hostCity) throw new Error("host city fixture missing");
    hostCity.buildings = (hostCity.buildings ?? []).filter((building) => building.type !== "MILITARY_LOGISTICS_CENTER");
    expect(findSupplyPath(withoutLogistics, { x: 0, y: 0 }, "home")).toBeNull();
  });


  it("keeps legacy supply routing to recognized territory when no city table exists", () => {
    const legacy = {
      version: 6,
      revision: 1,
      settings: {} as SceneState["settings"],
      turn: { turnNumber: 1, autoTurnsPaused: false, deferredUntil: null, lastCompletedAt: null, lastCompletedBy: null, lastProcessedBoundaryId: null },
      sides: [{ id: "f", name: "F", color: "#fff", playerIds: [], leaderPlayerIds: [], stateId: "s" }],
      states: [{ id: "s", name: "S", color: "#fff", rulingFactionId: "f", active: true }],
      gridMap: { version: 1, revision: 1, cells: {
        "0,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: "s" },
        "1,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: "s" },
        "2,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "s", deFactoStateId: "s" }
      } },
      terrain: { version: 1, types: {} },
      wars: [],
      relations: {},
      stateRelations: {}
    } as unknown as SceneState;

    expect(findSupplyPath(legacy, { x: 0, y: 0 }, "s")).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 }
    ]);
  });

});
