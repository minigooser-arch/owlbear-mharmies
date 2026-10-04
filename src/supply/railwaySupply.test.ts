
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

  it("reaches a station cell even when the sparse grid has no stored cell for the building", () => {
    const scene = {
      version: 8, revision: 1, settings: {} as SceneState["settings"], turn: { turnNumber: 1, autoTurnsPaused: false, deferredUntil: null, lastCompletedAt: null, lastCompletedBy: null, lastProcessedBoundaryId: null },
      sides: [{ id: "f", name: "F", color: "#fff", playerIds: [], leaderPlayerIds: [], stateId: "s" }], states: [{ id: "s", name: "S", color: "#fff", rulingFactionId: "f", active: true }],
      gridMap: { version: 1, revision: 1, cells: { "0,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "s", deFactoStateId: "s" } } },
      terrain: { version: 1, types: {} }, wars: [], relations: {}, stateRelations: {}, strategicCities: [{ id: "c", name: "C", cells: [{ x: 0, y: 0 }], recognizedStateId: "s", deFactoStateId: "s", factionInfluenceId: "f", mayorId: null, isCapital: false, historicalBuildTypeCount: 0, buildings: [{ id: "r", type: "RAILWAY_STATION", cell: { x: 1, y: 0 } }] }]
    } as unknown as SceneState;
    expect(findSupplyPath(scene, { x: 0, y: 0 }, "s")).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }]);
  });
});

